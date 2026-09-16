import type { StoryObject } from './contracts.js';

export interface ForeshadowState {
  plannedState: string;
  confirmedState: string;
  evidenceId?: string;
  chapterId?: string;
  versionId?: string;
}

export function foreshadowProjection(objects: StoryObject[], chapters: StoryObject[]): Record<string, ForeshadowState> {
  const ordinal = new Map(chapters.map((chapter, index) => [chapter.id, index + 1]));
  const byId = new Map(objects.map(object => [object.id, object]));
  const facts = objects.filter(object => object.kind === 'fact'
    && object.status === 'accepted'
    && object.fields.property === 'foreshadowState'
    && typeof object.fields.entityId === 'string'
    && (!object.source?.versionId || byId.get(object.source.chapterId ?? '')?.fields.currentVersion === object.source.versionId))
    .sort((left, right) => sourceOrder(left, ordinal) - sourceOrder(right, ordinal)
      || left.updatedAt.localeCompare(right.updatedAt));
  const latest = new Map<string, StoryObject>();
  for (const fact of facts) latest.set(String(fact.fields.entityId), fact);
  return Object.fromEntries(objects.filter(object => object.kind === 'foreshadow' && !['candidate', 'revoked', 'stale'].includes(object.status)).map(object => {
    const evidence = latest.get(object.id);
    return [object.id, {
      plannedState: String(object.fields.state ?? 'planned'),
      confirmedState: evidence ? String(evidence.fields.value) : 'unconfirmed',
      evidenceId: evidence?.id,
      chapterId: evidence?.source?.chapterId,
      versionId: evidence?.source?.versionId,
    } satisfies ForeshadowState];
  }));
}

function sourceOrder(object: StoryObject, ordinal: Map<string, number>) {
  const stableId = object.source?.fromChapterId ?? object.source?.chapterId;
  return stableId ? ordinal.get(stableId) ?? Number.MAX_SAFE_INTEGER : object.source?.fromChapter ?? 0;
}
