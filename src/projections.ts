import type { Domain } from './domain.js';
import type { Artifact, CreativeTask, StoryObject } from './contracts.js';
import { foreshadowProjection } from './foreshadow.js';
import { projectReadIndex, type ReadMetrics } from './read-model.js';

export function taskSummary(task: CreativeTask) {
  return {
    id: task.id,
    projectId: task.projectId,
    kind: task.kind,
    goal: task.goal,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    chapterId: task.chapterId,
    count: task.count,
    completedChapters: task.completedChapters,
    currentStep: task.currentStep,
    usage: task.usage,
    budget: task.budget,
    error: task.error,
    checkpoint: { chapterId: task.checkpoint.chapterId, artifactId: task.checkpoint.artifactId },
    objective: task.contract.brief?.objective,
  };
}

export function artifactSummary(artifact: Artifact) {
  return {
    id: artifact.id,
    taskId: artifact.taskId,
    projectId: artifact.projectId,
    type: artifact.type,
    status: artifact.status,
    chapterId: artifact.chapterId,
    createdAt: artifact.createdAt,
    data: { title: artifact.data.title, summary: artifact.data.review?.summary },
  };
}

export function projectMetadata(domain: Domain, projectId: string, metrics?: ReadMetrics) {
  const read = projectReadIndex(domain, projectId, metrics);
  return { project: read.project };
}

export function projectNavigation(domain: Domain, projectId: string, metrics?: ReadMetrics) {
  const read = projectReadIndex(domain, projectId, metrics, true);
  const objects = read.objects;
  const scoped = read.objects.filter(object => object.status !== 'revoked' && object.status !== 'stale');
  return {
    objects,
    foreshadows: foreshadowProjection(scoped, read.chapters),
    structureRevision: read.structureRevision,
    projectRevision: read.project.revision,
  };
}

export function taskSummaries(domain: Domain, projectId: string) {
  return domain.store.list('tasks', projectId).map(taskSummary);
}

export function artifactSummaries(domain: Domain, projectId: string) {
  return domain.store.list('artifacts', projectId).map(artifactSummary);
}

export function chapterDetail(domain: Domain, projectId: string, chapterId: string) {
  const chapter = domain.object(projectId, chapterId);
  return chapter as StoryObject;
}
