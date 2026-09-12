import test from 'node:test';import assert from 'node:assert/strict';
import { fixture } from './helpers.js';import { oldInput } from '../src/domain.js';import { buildContext } from '../src/context.js';import { orderedChapters } from '../src/contracts.js';
import { Runner } from '../src/runtime.js';import { DemoProvider } from '../src/demo.js';import type { ModelRequest } from '../src/provider.js';

test('ideas enter future plans idempotently, with linked world entities in context but no invented canon',()=>{
  const f=fixture();const idea=f.add({kind:'idea',title:'退信的邮戳',body:'调查退信中早一天的邮戳。',status:'candidate'});
  const c=f.domain.adoptIdea(f.p.id,idea.id,idea.revision);assert.equal(c.status,'planned');assert.equal(c.body,'');assert.equal(f.domain.adoptIdea(f.p.id,idea.id,idea.revision).id,c.id);assert.equal(f.store.objects(f.p.id,'fact').length,0);
  const place=f.add({kind:'world',title:'远灯台',status:'accepted',fields:{relatedEntityIds:[f.key.id]}});const pack=buildContext(f.domain,f.p.id,{chapterId:c.id,goal:'调查远灯台'});assert.ok(pack.items.some(i=>i.id===f.key.id));assert.throws(()=>f.add({kind:'world',title:'坏引用',fields:{relatedEntityIds:['missing']}}));f.store.close();
});
test('replan undo is atomic, repeat-safe and cannot overwrite subsequent edits',()=>{
  const f=fixture();const t=f.task({kind:'replan'});t.status='RUNNING';f.store.put('tasks',t);const a=f.domain.putArtifact(t,'replan',{changes:[{id:f.chapter.id,body:'改变未来目标',fields:{ending:'敲门'}}],impacts:[]});f.domain.acceptArtifact(f.p.id,a.id,'auto');
  f.domain.revertReplan(f.p.id,a.id,f.domain.project(f.p.id).revision);assert.equal(f.domain.object(f.p.id,f.chapter.id).fields.goal,f.chapter.fields.goal);const revision=f.domain.project(f.p.id).revision;f.domain.revertReplan(f.p.id,a.id,revision);assert.equal(f.domain.project(f.p.id).revision,revision);
  const t2=f.task({kind:'replan'});t2.status='RUNNING';f.store.put('tasks',t2);const b=f.domain.putArtifact(t2,'replan',{changes:[{id:f.chapter.id,body:'再次规划',fields:{}}],impacts:[]});f.domain.acceptArtifact(f.p.id,b.id,'auto');let c=f.domain.object(f.p.id,f.chapter.id);c=f.domain.updateObject(f.p.id,c.id,c.revision,{...oldInput(c),title:'作者新标题'});assert.throws(()=>f.domain.revertReplan(f.p.id,b.id,f.domain.project(f.p.id).revision),/后续操作/);assert.equal(f.domain.object(f.p.id,c.id).title,'作者新标题');f.store.close();
});
test('a chapter-scoped replan cannot change a different unlocked future chapter',()=>{
  const f=fixture();const other=f.add({kind:'chapter',title:'范围外未来章',status:'planned',parentId:f.volume.id,order:2});const t=f.task({kind:'replan',chapterId:f.chapter.id});t.status='RUNNING';f.store.put('tasks',t);
  const a=f.domain.putArtifact(t,'replan',{changes:[{id:f.chapter.id,body:'允许修改的目标',fields:{}},{id:other.id,body:'越界目标',fields:{}}],impacts:[]});assert.throws(()=>f.domain.acceptArtifact(f.p.id,a.id,'auto'),/任务范围/);assert.equal(f.domain.object(f.p.id,f.chapter.id).fields.goal,f.chapter.fields.goal);assert.equal(f.domain.object(f.p.id,other.id).fields.goal,undefined);f.store.close();
});
test('multi-volume ordering is shared by UI, export and context; import appends after reordered volumes',()=>{
  const f=fixture();const volume=f.domain.updateObject(f.p.id,f.volume.id,f.volume.revision,{...oldInput(f.volume),order:8});
  const extra=f.add({kind:'chapter',title:'卷一末章',parentId:volume.id,order:5,status:'planned'});const imported=f.domain.importText(f.p.id,f.domain.project(f.p.id).revision,'卷二.txt','第一章 新卷开端\n下一段旅程。');
  const sorted=orderedChapters(f.store.objects(f.p.id));assert.deepEqual(sorted.map(c=>c.id),[f.chapter.id,extra.id,imported.chapterIds[0]]);assert.deepEqual(f.domain.chapters(f.p.id).map(c=>c.id),sorted.map(c=>c.id));
  const exported=f.domain.exportText(f.p.id,'txt');assert.ok(exported.indexOf('卷一末章')<exported.indexOf('新卷开端'));f.store.close();
});
test('extraction repairs missing canonical fields instead of accepting unusable state records',async()=>{
  const f=fixture();f.domain.saveChapter(f.p.id,f.chapter.id,f.chapter.revision,'沈砚把铜钥匙交给闻溪。');const demo=new DemoProvider();let attempts=0;
  const provider={info:()=>demo.info(),generate(r:ModelRequest){if(r.prompt!=='extract')return demo.generate(r);const fields=attempts++===0?{entityId:f.key.id,holder:'闻溪'}:{entityId:f.key.id,property:'holder',value:'闻溪'};if(attempts===2)assert.match(r.input.validationRepair,/fields.property/);return Promise.resolve({text:JSON.stringify({objects:[{kind:'fact',title:'钥匙持有人',fields,source:{type:'import',quote:'沈砚把铜钥匙交给闻溪。'}}]}),outputTokens:100});}};
  const runner=new Runner(f.domain,provider,provider);const t=f.task({kind:'extract',autoAccept:true});runner.start(t.id);await runner.idle(t.id);assert.equal(f.domain.task(f.p.id,t.id).status,'COMPLETED');assert.equal(attempts,2);const fact=f.store.objects(f.p.id,'fact')[0];assert.equal(fact.fields.property,'holder');assert.equal(fact.status,'candidate');assert.equal(fact.source?.inference,true);
  assert.throws(()=>f.add({kind:'fact',title:'缺失属性',status:'accepted',fields:{entityId:f.key.id,holder:'闻溪'}}),/属性与状态值/);f.store.close();
});
test('AI brief can pause for a material ambiguity; author clarification keeps original budget',async()=>{
  const f=fixture();const demo=new DemoProvider();const provider={info:()=>demo.info(),generate:(r:ModelRequest)=>r.prompt==='brief'&&!r.task.goal.includes('作者补充')?Promise.resolve({text:JSON.stringify({objective:'确认边界',approach:'得到作者选择后继续',assumptions:[],constraints:[],question:'保留还是替换故事的核心前提？'}),outputTokens:90}):demo.generate(r)};
  const runner=new Runner(f.domain,provider,provider);const t=f.task({});runner.start(t.id);await runner.idle(t.id);assert.equal(f.domain.task(f.p.id,t.id).status,'NEEDS_INPUT');assert.equal(f.store.list('versions',f.p.id).length,0);f.domain.clarifyTask(f.p.id,t.id,'保留原来的前提，只继续下一章');runner.start(t.id);await runner.idle(t.id);const result=f.domain.task(f.p.id,t.id);assert.equal(result.status,'COMPLETED',JSON.stringify(result.error));assert.deepEqual(result.budget,t.budget);assert.ok(result.contract.brief);f.store.close();
});
