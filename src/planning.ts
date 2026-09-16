import type { Domain } from './domain.js';
import type { CreativeTask } from './contracts.js';
import { modelStoryScope,type StoryReadScope } from './scope.js';
import { rollingPlanning } from './memory.js';

export function planningInput(domain: Domain, task: CreativeTask, scope: StoryReadScope) {
  const editablePlans = scope.planningObjects
    .filter(object => !task.chapterId || object.id === task.chapterId)
    .map(object => ({ id: object.id, title: object.title, fields: object.fields }));
  const dependencies = [
    ...scope.objects.filter(object => ['character', 'foreshadow', 'event'].includes(object.kind))
      .map(object => ({ id: object.id, title: object.title, fields: object.fields })),
    ...scope.tasks.filter(other => other.id !== task.id)
      .map(other => ({ id: other.id, goal: other.goal, status: other.status, branch: other.perspective?.branch ?? 'main' })),
  ];
  return {
    storyScope: modelStoryScope(scope.trace),
    rollingPlanning: rollingPlanning(domain, task.projectId, scope),
    editablePlans,
    dependencies,
  };
}
