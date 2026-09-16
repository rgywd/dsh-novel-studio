import type { Domain } from './domain.js';
import { orderedChapters, requireThat, type CreativeTask, type StoryObject } from './contracts.js';
import { hash } from './store.js';
import { temporalObjects, type Perspective } from './temporal.js';

export type PlanningScope = 'current-branch' | 'all-branches';

export interface StoryScopeOptions extends Perspective {
  chapterId?: string;
  planningScope?: PlanningScope;
}

export interface StoryScopeTrace {
  projectId: string;
  projectRevision: number;
  branch: string;
  chapterId?: string;
  cutoffChapterId?: string;
  asOfChapter: number;
  evidenceThrough: number;
  sourceVersionId?: string;
  viewpointId?: string;
  audience: 'author' | 'character' | 'reader';
  planningScope: PlanningScope;
  structureHash: string;
  objectIds: string[];
  chapterIds: string[];
  planningObjectIds: string[];
  taskIds: string[];
  omitted: { id: string; reason: string }[];
}

export interface StoryReadScope {
  trace: StoryScopeTrace;
  objects: StoryObject[];
  chapters: StoryObject[];
  current?: StoryObject;
  planningObjects: StoryObject[];
  tasks: CreativeTask[];
}

export type ModelStoryScope = Omit<StoryScopeTrace, 'omitted'> & { omitted: { reason: string; count: number }[] };

export function modelStoryScope(trace: StoryScopeTrace): ModelStoryScope {
  const counts = new Map<string, number>();
  for (const item of trace.omitted) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  const { omitted: _omitted, ...safe } = trace;
  return {...safe, omitted:[...counts].map(([reason,count])=>({reason,count}))};
}

export function chapterStructureFingerprint(objects: StoryObject[], throughChapterId?: string) {
  const ordered = orderedChapters(objects);
  const end = throughChapterId ? ordered.findIndex(chapter => chapter.id === throughChapterId) + 1 : ordered.length;
  return hash(ordered.slice(0, end || ordered.length).map(chapter => [
    chapter.id,
    chapter.parentId,
    chapter.order,
    String(chapter.fields.branch ?? 'main'),
  ]));
}

export function resolveStoryScope(domain: Domain, projectId: string, options: StoryScopeOptions = {}): StoryReadScope {
  const project = domain.project(projectId);
  const stored = domain.store.objects(projectId);
  const ordered = orderedChapters(stored);
  const current = options.chapterId ? domain.object(projectId, options.chapterId) : undefined;
  if (current) requireThat(current.kind === 'chapter', 'SCOPE', '上下文截止对象必须是章节');
  const branch = options.branch ?? String(current?.fields.branch ?? 'main');
  if (current) requireThat(String(current.fields.branch ?? 'main') === branch, 'SCOPE', '章节不属于请求的故事分支');
  const chapters = ordered.filter(chapter => String(chapter.fields.branch ?? 'main') === branch);
  const currentIndex = current ? chapters.findIndex(chapter => chapter.id === current.id) : chapters.length;
  requireThat(!current || currentIndex >= 0, 'SCOPE', '章节不属于请求的故事分支');
  const evidenceThrough = Math.max(0, Math.min(options.asOfChapter ?? currentIndex, currentIndex));
  const asOfChapter = options.asOfChapter ?? (current ? currentIndex + 1 : chapters.length + 1);
  const temporal = temporalObjects(domain, projectId, {
    ...options,
    branch,
    asOfChapter,
    evidenceThrough,
  });
  const planningScope = options.planningScope ?? 'current-branch';
  const planningObjects = (planningScope === 'all-branches' ? stored : temporal.objects)
    .filter(object => ['book', 'volume', 'chapter'].includes(object.kind)
      && !object.locked
      && object.status === 'planned'
      && (object.kind !== 'chapter' || !object.body.trim()));
  const tasks = domain.store.list('tasks', projectId).filter(task => planningScope === 'all-branches'
    || String(task.perspective?.branch ?? 'main') === branch);
  const trace: StoryScopeTrace = {
    projectId,
    projectRevision: project.revision,
    branch,
    chapterId: current?.id,
    cutoffChapterId: chapters[evidenceThrough - 1]?.id,
    asOfChapter,
    evidenceThrough,
    sourceVersionId: project.lineage?.versionId,
    viewpointId: options.viewpointId,
    audience: options.audience ?? 'author',
    planningScope,
    structureHash: chapterStructureFingerprint(stored),
    objectIds: temporal.objects.map(object => object.id),
    chapterIds: chapters.map(chapter => chapter.id),
    planningObjectIds: planningObjects.map(object => object.id),
    taskIds: tasks.map(task => task.id),
    omitted: temporal.omitted,
  };
  return { trace, objects: temporal.objects, chapters, current, planningObjects, tasks };
}

export function scopeOptions(task: Pick<CreativeTask, 'chapterId' | 'perspective' | 'planningScope'>): StoryScopeOptions {
  return {
    chapterId: task.chapterId,
    ...task.perspective,
    planningScope: task.planningScope ?? 'current-branch',
  };
}
