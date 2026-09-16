import type { Domain } from './domain.js';
import { orderedChapters, requireThat, type ChapterVersion, type Project, type StoryObject } from './contracts.js';
import { hash } from './store.js';

export interface ReadMetrics {
  queries: number;
  cacheHits: number;
  labels: Record<string, number>;
}

export function readMetrics(): ReadMetrics {
  return { queries: 0, cacheHits: 0, labels: {} };
}

export function measured<T>(metrics: ReadMetrics | undefined, label: string, read: () => T): T {
  if (metrics) {
    metrics.queries++;
    metrics.labels[label] = (metrics.labels[label] ?? 0) + 1;
  }
  return read();
}

export class ProjectReadIndex {
  readonly project: Project;
  readonly objects: StoryObject[];
  readonly chapters: StoryObject[];
  readonly byId: Map<string, StoryObject>;
  readonly chapterOrdinal: Map<string, number>;
  readonly structureRevision: string;
  private versionMap?: Map<string, ChapterVersion>;
  private memories?: unknown[];
  private prefixHashes = new Map<number, string>();
  readonly temporalCache = new Map<string, unknown>();

  constructor(readonly domain: Domain, readonly projectId: string, readonly metrics?: ReadMetrics, readonly omitChapterBody = false) {
    const projectRow = measured(metrics, 'project', () => domain.store.db.prepare('SELECT data FROM projects WHERE id=?').get(projectId));
    requireThat(projectRow, 'NOT_FOUND', '找不到作品', 404);
    this.project = JSON.parse(String(projectRow.data));
    const rows = measured(metrics, 'objects', () => domain.store.db.prepare(omitChapterBody
      ? "SELECT CASE WHEN kind='chapter' THEN json_set(data,'$.body','') ELSE data END AS data FROM objects WHERE projectId=?"
      : 'SELECT data FROM objects WHERE projectId=?').all(projectId));
    this.objects = rows.map(row => JSON.parse(String(row.data)) as StoryObject);
    this.chapters = orderedChapters(this.objects);
    this.byId = new Map(this.objects.map(object => [object.id, object]));
    this.chapterOrdinal = new Map(this.chapters.map((chapter, index) => [chapter.id, index + 1]));
    this.structureRevision = hash(this.chapters.map(chapter => [
      chapter.id,
      chapter.parentId,
      chapter.order,
      String(chapter.fields.branch ?? 'main'),
    ]));
  }

  object(id: string) {
    const object = this.byId.get(id);
    requireThat(object, 'NOT_FOUND', '找不到对象', 404);
    return object;
  }

  version(id: string) {
    if (!this.versionMap) {
      const rows = measured(this.metrics, 'versions', () => this.domain.store.db.prepare('SELECT data FROM versions WHERE projectId=?').all(this.projectId));
      this.versionMap = new Map(rows.map(row => {
        const version = JSON.parse(String(row.data)) as ChapterVersion;
        return [version.id, version];
      }));
    }
    const version = this.versionMap.get(id);
    requireThat(version, 'NOT_FOUND', '找不到正文版本', 404);
    return version;
  }

  memoryRows<T>(): T[] {
    if (!this.memories) {
      const rows = measured(this.metrics, 'memories', () => this.domain.store.db.prepare('SELECT data FROM memories WHERE projectId=? ORDER BY rowid').all(this.projectId));
      this.memories = rows.map(row => JSON.parse(String(row.data)));
    } else if (this.metrics) this.metrics.cacheHits++;
    return this.memories as T[];
  }

  sourceFor(chapter: StoryObject, version?: ChapterVersion) {
    const ordinal = this.chapterOrdinal.get(chapter.id) ?? 0;
    let structureHash = this.prefixHashes.get(ordinal);
    if (!structureHash) {
      structureHash = hash(this.chapters.slice(0, ordinal).map(item => [item.id, item.parentId, item.order, String(item.fields.branch ?? 'main')]));
      this.prefixHashes.set(ordinal, structureHash);
    } else if (this.metrics) this.metrics.cacheHits++;
    return {
      chapterId: chapter.id,
      versionId: version?.id ?? String(chapter.fields.currentVersion),
      hash: hash(version?.content ?? chapter.body),
      ordinal,
      parentId: chapter.parentId,
      branch: String(chapter.fields.branch ?? 'main'),
      structureHash,
    };
  }

  cacheRevision(memoryRevision = '') {
    return `${this.project.revision}:${this.structureRevision}:${memoryRevision}`;
  }
}

export function projectReadIndex(domain: Domain, projectId: string, metrics?: ReadMetrics, omitChapterBody = false) {
  return new ProjectReadIndex(domain, projectId, metrics, omitChapterBody);
}
