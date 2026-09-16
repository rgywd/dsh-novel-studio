import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
import { DemoProvider } from '../src/demo.js';
import { Runner } from '../src/runtime.js';
import type { ModelRequest } from '../src/provider.js';
import { oldInput } from '../src/domain.js';
import { installMemory, rollingPlanning, sourceFor, validMemory } from '../src/memory.js';
import { temporalObjects } from '../src/temporal.js';
import { ProjectSessionCoordinator } from '../src/ui/project-session.js';

test('stage 1A: intercepted model requests share one scoped read and wider planning access is explicit', async () => {
  const f = fixture();
  const first = f.domain.saveChapter(f.p.id, f.chapter.id, f.chapter.revision, '第一章只确认港口仍然开放。');
  const second = f.add({kind:'chapter', title:'第二章', parentId:f.volume.id, order:2, status:'planned', fields:{branch:'main', goal:'当前分支目标'}});
  const future = f.add({kind:'chapter', title:'第三章', parentId:f.volume.id, order:3, status:'planned', fields:{branch:'main'}});
  const futureAccepted = f.domain.saveChapter(f.p.id, future.id, future.revision, 'FUTURE_EVENT_SENTINEL 只在未来发生。');
  const futureEvent = f.add({kind:'event', title:'未来事件', body:'FUTURE_EVENT_SENTINEL', status:'accepted', fields:{branch:'main'}, source:{type:'user', chapterId:future.id, versionId:futureAccepted.fields.currentVersion, quote:'FUTURE_EVENT_SENTINEL', time:'未来', fromChapter:3, fromChapterId:future.id}});
  f.add({kind:'character', title:'范围外知情者', status:'accepted', body:'普通档案', fields:{privateGoal:'PRIVATE_GOAL_SENTINEL', secret:'PRIVATE_SECRET_SENTINEL'}});
  const side = f.add({kind:'chapter', title:'侧分支规划', parentId:f.volume.id, order:1, status:'planned', fields:{branch:'side', goal:'OTHER_BRANCH_PLAN_SENTINEL'}});
  const sideTask = f.task({kind:'ideas', goal:'OTHER_BRANCH_TASK_SENTINEL', perspective:{branch:'side', audience:'author'}});
  sideTask.status = 'COMPLETED';
  f.store.put('tasks', sideTask);

  const demo = new DemoProvider();
  const seen: ModelRequest[] = [];
  const provider = {info:()=>demo.info(), async generate(request:ModelRequest){seen.push(request);return demo.generate(request);}};
  const runner = new Runner(f.domain, provider, provider, 3000);
  const base = {kind:'replan', autoAccept:false, perspective:{branch:'main', audience:'character', viewpointId:f.a.id, asOfChapter:1}, goal:'只调整允许范围内的未来规划'} as const;
  const currentBranch = f.task(base);
  runner.start(currentBranch.id);
  await runner.idle(currentBranch.id);
  const restrictedRequests = seen.filter(request=>request.task.id===currentBranch.id);
  const restricted = restrictedRequests.find(request=>request.prompt==='replan')!;
  const restrictedWire = JSON.stringify(restrictedRequests.map(request=>({input:request.input, compiled:request.compiled})));
  for (const sentinel of ['FUTURE_EVENT_SENTINEL','PRIVATE_GOAL_SENTINEL','PRIVATE_SECRET_SENTINEL','OTHER_BRANCH_PLAN_SENTINEL','OTHER_BRANCH_TASK_SENTINEL']) assert.ok(!restrictedWire.includes(sentinel), sentinel);
  assert.equal(restricted.input.storyScope.planningScope, 'current-branch');
  assert.equal(restricted.input.storyScope.cutoffChapterId, first.id);
  assert.ok(restricted.input.storyScope.planningObjectIds.includes(second.id));
  assert.ok(!restricted.input.storyScope.planningObjectIds.includes(side.id));

  const allBranches = f.task({...base, planningScope:'all-branches'});
  runner.start(allBranches.id);
  await runner.idle(allBranches.id);
  const widenedRequests = seen.filter(request=>request.task.id===allBranches.id);
  const widened = widenedRequests.find(request=>request.prompt==='replan')!;
  const widenedWire = JSON.stringify(widenedRequests.map(request=>({input:request.input, compiled:request.compiled})));
  assert.equal(widened.input.storyScope.planningScope, 'all-branches');
  assert.ok(widenedWire.includes('OTHER_BRANCH_PLAN_SENTINEL'));
  assert.ok(widenedWire.includes('OTHER_BRANCH_TASK_SENTINEL'));
  for (const sentinel of ['FUTURE_EVENT_SENTINEL','PRIVATE_GOAL_SENTINEL','PRIVATE_SECRET_SENTINEL']) assert.ok(!widenedWire.includes(sentinel), sentinel);

  const malicious = f.task({...base, autoAccept:true});
  malicious.status = 'RUNNING';
  f.store.put('tasks', malicious);
  const artifact = f.domain.putArtifact(malicious, 'replan', {changes:[], impacts:[{id:futureEvent.id, reason:'尝试越过截止范围', certainty:'known'}]});
  assert.throws(()=>f.domain.acceptArtifact(f.p.id, artifact.id, 'auto'), /读取范围外/);
  assert.equal(f.domain.artifact(f.p.id, artifact.id).status, 'pending');
  await runner.close();
  f.store.close();
});

test('stage 1B: project session and intent epochs reject every late A result after opening B or leaving', () => {
  const sessions = new ProjectSessionCoordinator();
  const openA = sessions.enter('A', 'open');
  const refreshA = sessions.begin('A', 'refresh');
  const configA = sessions.begin('A', 'configuration');
  const taskA = sessions.begin('A', 'task-detail');
  const evidenceA = sessions.begin('A', 'navigate');
  const openB = sessions.enter('B', 'open');
  for (const ticket of [openA, refreshA, configA, taskA, evidenceA]) {
    assert.equal(ticket.signal.aborted, true);
    assert.equal(sessions.commit(ticket, ()=>assert.fail('late A commit')), false);
  }
  assert.equal(sessions.commit(openB, ()=>{}), true);
  const olderB = sessions.begin('B', 'task-detail');
  const newerB = sessions.begin('B', 'task-detail');
  assert.equal(olderB.signal.aborted, true);
  assert.equal(sessions.commit(olderB, ()=>assert.fail('older B intent commit')), false);
  assert.equal(sessions.commit(newerB, ()=>{}), true);
  const pollB = sessions.begin('B', 'poll');
  const library = sessions.leave();
  assert.equal(pollB.signal.aborted, true);
  assert.equal(sessions.commit(pollB, ()=>assert.fail('late poll commit')), false);
  assert.equal(sessions.commit(library, ()=>{}), true);
});

test('stage 1B: restart reads a legacy task scope default without rewriting stored task data', () => {
  const f = fixture();
  const task = f.task({kind:'ideas', goal:'旧任务仍可读取'});
  task.status = 'COMPLETED';
  delete (task as Partial<typeof task>).planningScope;
  f.store.put('tasks', task);
  const before = String(f.store.db.prepare('SELECT data FROM tasks WHERE id=?').get(task.id)!.data);
  f.domain.recover();
  const after = String(f.store.db.prepare('SELECT data FROM tasks WHERE id=?').get(task.id)!.data);
  assert.equal(after, before);
  assert.equal(f.domain.task(f.p.id, task.id).planningScope, undefined);
  f.store.close();
});

test('stage 1C: volume reorder uses stable chapter evidence, invalidates structure memory, and preserves bodies', () => {
  const f = fixture();
  let firstVolume = f.domain.updateObject(f.p.id, f.volume.id, f.volume.revision, {...oldInput(f.volume), order:2});
  const earlierVolume = f.add({kind:'volume', title:'原先更早的卷', parentId:f.store.objects(f.p.id, 'book')[0].id, order:1, status:'planned'});
  const earlyOne = f.add({kind:'chapter', title:'原第一章', parentId:earlierVolume.id, order:1, status:'planned'});
  const earlyTwo = f.add({kind:'chapter', title:'原第二章', parentId:earlierVolume.id, order:2, status:'planned'});
  assert.deepEqual(f.domain.chapters(f.p.id).slice(0, 2).map(chapter=>chapter.id), [earlyOne.id, earlyTwo.id]);
  const accepted = f.domain.saveChapter(f.p.id, f.chapter.id, f.chapter.revision, '沈砚在这一章持有铜钥匙。');
  const versionId = String(accepted.fields.currentVersion), body = accepted.body;
  const memory = f.store.transaction(()=>installMemory(f.domain, f.p.id, sourceFor(f.domain, accepted), {summary:'钥匙状态', scenes:[{summary:'持有钥匙', quote:body, entityIds:[f.a.id,f.key.id]}], obligations:[]}, 'stage1-test'));
  const fact = f.add({kind:'fact', title:'钥匙持有人', body, status:'accepted', fields:{entityId:f.key.id, property:'holder', value:'沈砚', branch:'main'}, source:{type:'user', chapterId:accepted.id, versionId, quote:body, time:'本章', fromChapter:3, fromChapterId:accepted.id}});
  assert.ok(!temporalObjects(f.domain, f.p.id, {branch:'main', asOfChapter:1, evidenceThrough:1}).objects.some(object=>object.id===fact.id));
  firstVolume = f.domain.updateObject(f.p.id, firstVolume.id, firstVolume.revision, {...oldInput(firstVolume), order:0});
  const after = f.domain.object(f.p.id, accepted.id);
  assert.equal(after.body, body);
  assert.equal(after.fields.currentVersion, versionId);
  assert.equal(validMemory(f.domain, memory), false);
  assert.ok(temporalObjects(f.domain, f.p.id, {branch:'main', asOfChapter:1, evidenceThrough:1}).objects.some(object=>object.id===fact.id));
  const reorder = f.store.db.prepare("SELECT data FROM changesets WHERE projectId=? AND kind='structure.reordered' ORDER BY rowid DESC LIMIT 1").get(f.p.id);
  assert.ok(reorder);
  const trace = JSON.parse(String(reorder!.data));
  assert.notEqual(trace.beforeFingerprint, trace.afterFingerprint);
  f.store.close();
});

test('stage 1D: foreshadow confirmation follows valid accepted evidence through edit and rollback', () => {
  const f = fixture();
  const foreshadow = f.add({kind:'foreshadow', title:'蓝色邮戳', status:'planned', fields:{state:'planted', recoveryRange:'第一卷末'}});
  const task = f.task({autoAccept:true});
  task.status = 'RUNNING';
  f.store.put('tasks', task);
  const quote = '蓝色邮戳的来源终于被确认。', content = `${quote}\n沈砚把证据收进档案。`;
  const review = {summary:'邮戳已经兑现', claims:[], events:[], issues:[], foreshadowUpdates:[{id:foreshadow.id, state:'resolved', quote}]};
  const artifact = f.domain.putArtifact(task, 'chapter', {content, review, plan:{}}, f.chapter);
  f.domain.acceptArtifact(f.p.id, artifact.id, 'auto');
  let chapter = f.domain.object(f.p.id, f.chapter.id);
  const resolvedVersion = String(chapter.fields.currentVersion);
  assert.equal(f.domain.snapshot(f.p.id).foreshadows[foreshadow.id].confirmedState, 'resolved');
  assert.ok(!rollingPlanning(f.domain, f.p.id).foreshadow.some((item:any)=>item.id===foreshadow.id));

  chapter = f.domain.takeover(f.p.id, chapter.id, chapter.revision);
  chapter = f.domain.saveChapter(f.p.id, chapter.id, chapter.revision, '作者改写后，邮戳仍然没有答案。');
  assert.equal(f.domain.snapshot(f.p.id).foreshadows[foreshadow.id].confirmedState, 'unconfirmed');
  assert.ok(rollingPlanning(f.domain, f.p.id).foreshadow.some((item:any)=>item.id===foreshadow.id));

  chapter = f.domain.rollback(f.p.id, chapter.id, chapter.revision, resolvedVersion);
  assert.equal(chapter.body, content);
  assert.equal(f.domain.snapshot(f.p.id).foreshadows[foreshadow.id].confirmedState, 'resolved');
  assert.ok(!rollingPlanning(f.domain, f.p.id).foreshadow.some((item:any)=>item.id===foreshadow.id));
  assert.ok(f.store.objects(f.p.id, 'fact').some(object=>object.fields.entityId===foreshadow.id&&object.status==='revoked'));
  f.store.close();
});
