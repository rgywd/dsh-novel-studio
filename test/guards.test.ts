import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,reviewFor,until} from './helpers.js';
import {oldInput} from '../src/domain.js';
import {buildContext} from '../src/context.js';
import {validateReview} from '../src/review.js';
import {Runner} from '../src/runtime.js';
import {DemoProvider,firstChapter} from '../src/demo.js';
import {DshProvider,type ModelRequest} from '../src/provider.js';
import {promptSystem} from '../src/prompts.js';

test('chapter metadata cannot forge accepted bodies, versions or summaries',()=>{
  const f=fixture();
  for(const input of [{...oldInput(f.chapter),body:'绕开版本'}, {...oldInput(f.chapter),status:'accepted'}, {...oldInput(f.chapter),fields:{currentVersion:'forged'}}])assert.throws(()=>f.domain.updateObject(f.p.id,f.chapter.id,f.chapter.revision,input));
  assert.throws(()=>f.add({kind:'chapter',title:'伪造正文',status:'accepted',body:'未提交版本'}));
  const p=f.domain.createProject({title:'其他作品'});const foreign=f.domain.createObject(p.id,p.revision,{kind:'character',title:'外来角色'});
  assert.throws(()=>f.add({kind:'fact',title:'跨作品引用',status:'accepted',fields:{entityId:foreign.id,property:'location',value:'港口'}}));
  assert.throws(()=>f.add({kind:'relationship',title:'错误端点',fields:{fromId:f.key.id,toId:f.a.id}}));f.store.close();
});

test('fact edits retain source history and rollback cannot resurrect overridden claims',()=>{
  const f=fixture();const t=f.task({});t.status='RUNNING';f.store.put('tasks',t);
  const body='沈砚把钥匙交给了闻溪。';const review=validateReview(reviewFor(f.key.id,'闻溪',body),body,f.store.objects(f.p.id),[]);
  const a=f.domain.putArtifact(t,'chapter',{content:body,review},f.chapter);f.domain.acceptArtifact(f.p.id,a.id,'auto');
  const v=f.domain.versions(f.p.id,f.chapter.id)[0];const fact=f.store.objects(f.p.id,'fact')[0];
  const replacement=f.domain.updateObject(f.p.id,fact.id,fact.revision,{...oldInput(fact),fields:{...fact.fields,value:'沈砚'},body:'作者设定：那只是备用钥匙，唯一钥匙由沈砚持有。'});
  assert.notEqual(replacement.id,fact.id);assert.equal(replacement.source?.type,'user');assert.equal(replacement.source?.versionId,undefined);assert.equal(replacement.source?.supersedes,fact.id);
  assert.equal(f.domain.object(f.p.id,fact.id).fields.value,'闻溪');assert.equal(f.domain.object(f.p.id,fact.id).status,'revoked');
  let c=f.domain.object(f.p.id,f.chapter.id);c=f.domain.takeover(f.p.id,c.id,c.revision);f.domain.rollback(f.p.id,c.id,c.revision,v.id);
  assert.deepEqual(buildContext(f.domain,f.p.id).canon.map(f=>f.fields.value),['沈砚']);assert.equal(f.domain.history(f.p.id,replacement.id).records.length,2);f.store.close();
});

test('canon projection uses current scoped state; locked candidates stay outside canon',()=>{
  const f=fixture();const old=f.add({kind:'fact',title:'最初持有者',status:'accepted',fields:{entityId:f.key.id,property:'holder',value:'沈砚'},source:{type:'user',fromChapter:1}});
  f.add({kind:'fact',title:'转移后持有者',status:'accepted',fields:{entityId:f.key.id,property:'holder',value:'闻溪'},source:{type:'user',fromChapter:2}});
  f.add({kind:'fact',title:'锁定但未确认的传闻',status:'candidate',locked:true,fields:{entityId:f.key.id,property:'holder',value:'未知'}});
  assert.deepEqual(buildContext(f.domain,f.p.id,{chapterId:f.chapter.id}).canon.map(f=>f.id),[old.id]);
  assert.deepEqual(buildContext(f.domain,f.p.id).canon.map(f=>f.fields.value),['闻溪']);assert.ok(!buildContext(f.domain,f.p.id).text.includes('锁定但未确认'));f.store.close();
});

test('replan is atomic and rejects locked/accepted bodies and unknown impacts',()=>{
  const f=fixture();const accepted=f.domain.saveChapter(f.p.id,f.chapter.id,f.chapter.revision,'已经发生的正文。');const future=f.add({kind:'chapter',title:'未来章',status:'planned',parentId:f.volume.id});
  const t=f.task({kind:'replan'});t.status='RUNNING';f.store.put('tasks',t);
  const bad=f.domain.putArtifact(t,'replan',{changes:[{id:future.id,body:'新的未来',fields:{}},{id:accepted.id,body:'重写过去',fields:{}}],impacts:[]});
  assert.throws(()=>f.domain.acceptArtifact(f.p.id,bad.id,'auto'),/未来大纲/);assert.equal(f.domain.object(f.p.id,future.id).fields.goal,undefined);
  const good=f.domain.putArtifact(t,'replan',{changes:[{id:future.id,body:'新的未来',fields:{ending:'保留秘密'}}],impacts:[{id:future.id,certainty:'known',reason:'明确后续章节'}]});f.domain.acceptArtifact(f.p.id,good.id,'auto');
  assert.equal(f.domain.object(f.p.id,accepted.id).body,'已经发生的正文。');assert.equal(f.domain.object(f.p.id,future.id).fields.goal,'新的未来');f.store.close();
});

test('manual multi-chapter extraction accepts siblings without duplicate facts or stale evidence',async()=>{
  const f=fixture();f.domain.importText(f.p.id,f.domain.project(f.p.id).revision,'两章.txt','第一章 一\n沈砚收到一封信。\n第二章 二\n闻溪点亮一盏灯。');
  const demo=new DemoProvider();const provider={info:()=>demo.info(),async generate(r:ModelRequest){return {text:JSON.stringify({objects:[{kind:'world',title:r.input.draft.includes('沈砚')?'信':'灯',body:r.input.draft,source:{type:'import',quote:r.input.draft}}]}),outputTokens:150};}};
  const runner=new Runner(f.domain,provider,provider);const t=f.task({kind:'extract',count:2,autoAccept:false});runner.start(t.id);await runner.idle(t.id);
  assert.equal(f.domain.task(f.p.id,t.id).status,'NEEDS_INPUT');const artifacts=f.store.list('artifacts',f.p.id).filter(a=>a.taskId===t.id);assert.equal(artifacts.length,2);
  for(const a of artifacts)f.domain.acceptArtifact(f.p.id,a.id,'author');
  assert.equal(f.domain.task(f.p.id,t.id).status,'COMPLETED');assert.equal(f.store.objects(f.p.id,'world').filter(o=>o.status==='candidate').length,2);f.store.close();
});

test('cancelled late success remains stale and preserves every retry receipt',async()=>{
  const f=fixture();const demo=new DemoProvider();let release!:(v:any)=>void;let waiting=false;
  const provider={info:()=>demo.info(),generate(r:ModelRequest){if(r.prompt==='write'){waiting=true;return new Promise<any>(resolve=>release=resolve);}return demo.generate(r);}};
  const runner=new Runner(f.domain,provider,provider,1000);const t=f.task({});runner.start(t.id);await until(()=>waiting);f.domain.controlTask(f.p.id,t.id,'cancel');release({text:firstChapter(),outputTokens:700});await runner.idle(t.id);
  assert.equal(f.domain.task(f.p.id,t.id).status,'CANCELED');assert.equal(f.domain.object(f.p.id,f.chapter.id).body,'');assert.ok(f.store.list('artifacts',f.p.id).some(a=>a.status==='stale'));f.store.close();
});

test('structured retry reports field errors, keeps diagnostics and charges actual failed output',async()=>{
  const f=fixture();let n=0;const demo=new DemoProvider();const provider={info:()=>demo.info(),async generate(r:ModelRequest){
    if(r.prompt==='plan'&&n++===0)return {text:'{"title":"wrong type","participants":[{}]}',outputTokens:41};
    if(r.prompt==='plan')assert.match(r.input.validationRepair,/goal|participants/);return demo.generate(r);
  }};const runner=new Runner(f.domain,provider,provider);const t=f.task({});runner.start(t.id);await runner.idle(t.id);const result=f.domain.task(f.p.id,t.id);assert.equal(result.status,'COMPLETED');const step=result.steps[0];assert.equal(step.calls?.length,2);assert.equal(step.calls?.[0].outputTokens,41);assert.ok(step.calls?.[0].error);assert.ok(step.calls?.[0].diagnostic?.includes('wrong type'));assert.equal(step.usage?.outputTokens,step.calls!.reduce((n,c)=>n+c.outputTokens,0));f.store.close();
});

test('DSH adapter uses advertised low effort per call without changing configured selection',async()=>{
  const f=fixture();const selection={provider:'configured-provider',model:'configured-model',reasoningEffort:'high'};let sent:any;
  const llm={async resolveModelInfo(){return {provider:'configured-provider',id:'configured-model',reasoning:{efforts:[{id:'low',name:'Low'}]}} as any;},async *stream(options:any){sent=options;yield {type:'text-delta',text:'真实适配器测试'} as any;yield {type:'usage',usage:{outputTokens:12}} as any;yield {type:'finish',reason:{kind:'stop'}} as any;}};
  const provider=new DshProvider(llm,()=>selection);const task=f.task({});const result=await provider.generate({prompt:'plan',input:{goal:'test'},task,maxTokens:500,signal:new AbortController().signal,onDelta:()=>{}});
  assert.equal(sent.reasoningEffort,'low');assert.equal(selection.reasoningEffort,'high');assert.equal(result.outputTokens,12);assert.match(promptSystem('plan'),/"participants":\{"type":"array","items":\{"type":"string"/);f.store.close();
});

test('author state refresh omits old chapter plans and exposes AI risk decisions without rewriting the body',async()=>{
  const f=fixture();let c=f.domain.updateObject(f.p.id,f.chapter.id,f.chapter.revision,{...oldInput(f.chapter),fields:{...f.chapter.fields,constraints:'OLD_PLAN_NEVER_TRANSFER'}});
  c=f.domain.saveChapter(f.p.id,c.id,c.revision,firstChapter());const version=c.fields.currentVersion;const originalVersionCount=f.domain.versions(f.p.id,c.id).length;
  const demo=new DemoProvider();const provider={info:()=>demo.info(),async generate(r:ModelRequest){const result=await demo.generate(r);if(r.input.phase==='accepted-state-refresh'){
    assert.ok(!r.input.context.includes('OLD_PLAN_NEVER_TRANSFER'));assert.ok(!r.input.goal.includes('FUTURE_CHAPTER_NO_TRANSFER'));assert.deepEqual(r.input.constraints,[]);
    const output=JSON.parse(result.text);output.issues=[{category:'文学风险',severity:'critical',quote:'沈砚把铜钥匙交给了闻溪。',message:'测试：动机需要确认',rationale:'AI 建议',suggestion:'作者确认该转交是有意安排',blocks:true}];return {...result,text:JSON.stringify(output)};
  }return result;}};
  const runner=new Runner(f.domain,provider,provider);const t=f.task({goal:'FUTURE_CHAPTER_NO_TRANSFER'});runner.start(t.id);await runner.idle(t.id);
  assert.equal(f.domain.task(f.p.id,t.id).status,'NEEDS_INPUT');const a=f.store.list('artifacts',f.p.id).find(a=>a.type==='state-review')!;assert.ok(a);f.domain.resolveIssue(f.p.id,a.id,a.data.review.issues[0].id,'intentional','这是作者明确追加的合理转交，保留这个人物选择。');
  f.domain.acceptArtifact(f.p.id,a.id,'author');assert.equal(f.domain.object(f.p.id,c.id).fields.currentVersion,version);assert.equal(f.domain.versions(f.p.id,c.id).length,originalVersionCount);assert.equal(f.domain.task(f.p.id,t.id).completedChapters,0);
  f.domain.controlTask(f.p.id,t.id,'resume');runner.start(t.id);await runner.idle(t.id);assert.equal(f.domain.task(f.p.id,t.id).status,'COMPLETED');assert.equal(f.domain.task(f.p.id,t.id).completedChapters,1);f.store.close();
});

test('manual draft repair is durable and must pass a new review before it can replace a chapter',async()=>{
  const f=fixture();const original=f.task({});original.status='FAILED';f.store.put('tasks',original);const draft=f.domain.putArtifact(original,'chapter',{content:'尚未审校的正文。'},f.chapter);
  const t=f.task({kind:'review',goal:'审查手工修复后的工作稿',chapterId:f.chapter.id,draftArtifactId:draft.id,draft:firstChapter(),autoAccept:false});
  assert.equal(f.domain.task(f.p.id,t.id).draft,firstChapter());f.runner.start(t.id);await f.runner.idle(t.id);assert.equal(f.domain.task(f.p.id,t.id).status,'NEEDS_INPUT');
  const results=f.store.list('artifacts',f.p.id).filter(a=>a.taskId===t.id);const raw=results.find(a=>!a.data.review)!;const reviewed=results.find(a=>a.data.review)!;assert.throws(()=>f.domain.acceptArtifact(f.p.id,raw.id,'author'),/尚未审校/);f.domain.acceptArtifact(f.p.id,reviewed.id,'author');assert.equal(f.domain.object(f.p.id,f.chapter.id).body,firstChapter());assert.equal(f.domain.artifact(f.p.id,draft.id).status,'stale');f.store.close();
});
