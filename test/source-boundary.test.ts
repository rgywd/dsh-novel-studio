import test from 'node:test';
import assert from 'node:assert/strict';
import { Store,hash } from '../src/store.js';
import { Domain } from '../src/domain.js';
import { Runner } from '../src/runtime.js';
import { HttpApp } from '../src/http.js';
import { createSource,startSourceRun,sourceGet,assetsAt,sourceGraph } from '../src/sources.js';
import { saveManifest,activateManifest } from '../src/inheritance.js';
import { temporalObjects } from '../src/temporal.js';
import { buildContext } from '../src/context.js';
import { SourceFixtureProvider,sourceFixture,names,person } from './source-fixture.js';
import type { ModelRequest } from '../src/provider.js';

const budget={calls:200,outputTokens:500000,contextChars:36000};
async function scan(raw:string,model=new SourceFixtureProvider()){
 const store=new Store(':memory:'),domain=new Domain(store),runner=new Runner(domain,model,model),app=new HttpApp(domain,runner);
 const source=createSource(domain,{title:'原创边界用例',files:[{name:'fixture.md',raw}]}),state=startSourceRun(domain,source.work.id,{versionId:source.version.id,boundary:{kind:'all-materials',id:null},provider:'demo',budget});runner.start(state.task.id);await runner.idle(state.task.id);
 assert.equal(domain.task(source.work.workspaceId,state.task.id).status,'COMPLETED');return {store,domain,runner,app,model,...source,state};
}
const spec=(f:any,patch:any={})=>({versionId:f.version.id,runId:f.state.run.id,title:'证据分支',mode:'continuation',template:'canonical',boundary:{kind:'after-chapter',id:f.version.chapters.at(-1).id},...patch});
const activate=(f:any,patch:any={})=>{const m=saveManifest(f.domain,spec(f,patch)).manifest;return activateManifest(f.domain,m.id,1);};

test('source boundaries: time projection, early evidence recall and actual source requests exclude later revelations',async()=>{
 const f=await scan(sourceFixture());try{
  const p=activate(f,{boundary:{kind:'after-chapter',id:f.version.chapters[19].id}}),all=f.store.objects(p.id),key=all.find(o=>o.fields.sourceKey==='key')!;
  assert.equal(temporalObjects(f.domain,p.id,{asOfChapter:17}).objects.find(o=>o.id===key.id)?.fields.holder,names[16]);
  assert.equal(temporalObjects(f.domain,p.id,{asOfChapter:17}).objects.filter(o=>o.kind==='relationship').length,0);
  const early=sourceGraph(f.domain,f.state.run.id,new URLSearchParams({cutoff:'17',q:names[0]})),late=sourceGraph(f.domain,f.state.run.id,new URLSearchParams({cutoff:'20',q:names[0]}));assert.equal(early.relations.length,0);assert.equal(late.relations.length,1);
  const context=buildContext(f.domain,p.id,{chapterId:f.domain.chapters(p.id).at(-1)!.id,goal:names[0]+'回查第一章的身份',maxChars:48000,memory:{enabled:true,recallLimit:6}});
  assert.ok(context.items.some(i=>i.kind==='memory-evidence'||i.kind==='inherited-evidence'));assert.ok(!context.text.includes('无面客'));assert.ok(!context.text.includes('第五章前的密约'));
  // A new scan only pays for and sends the prefix, including registry and compiled requests.
  const r=startSourceRun(f.domain,f.work.id,{versionId:f.version.id,boundary:{kind:'after-chapter',id:f.version.chapters[19].id},provider:'demo',budget});const before=f.model.seen.length;f.runner.start(r.task.id);await f.runner.idle(r.task.id);
  for(const call of f.model.seen.slice(before)){const sent=JSON.stringify([call.input,call.compiled]);assert.ok(!sent.includes('无面客'));assert.ok(!sent.includes('第五章前的密约'));assert.ok(!sent.includes('于今日死亡'));}
 }finally{await f.runner.close();f.store.close();}
});

test('source knowledge: the subject of a secret does not automatically know it, and discarded fields do not leak through prose',async()=>{
 class Knowledge extends SourceFixtureProvider{override async generate(r:ModelRequest){if(r.prompt==='sourceExtract')return {text:JSON.stringify({summary:'只有见川知道初禾的暗号。',saturated:false,items:[{key:'private',kind:'fact',name:'暗号',description:'只有见川知道暗号月灰',fields:{property:'secret',value:'月灰'},refs:{entityId:'c1'},evidence:{quote:'只有见川知道初禾的暗号月灰。',modality:'knowledge',knownBy:['c2'],inference:false}}]}),outputTokens:100,estimated:true};return super.generate(r);}}
 const f=await scan(person(1)+person(2)+'只有见川知道初禾的暗号月灰。',new Knowledge());try{
  const p=activate(f),c1=f.store.objects(p.id,'character').find(c=>c.fields.sourceKey==='c1')!,c2=f.store.objects(p.id,'character').find(c=>c.fields.sourceKey==='c2')!;
  const unknown=temporalObjects(f.domain,p.id,{audience:'character',viewpointId:c1.id});assert.ok(!unknown.objects.some(o=>o.kind==='fact'&&o.fields.value==='月灰'));assert.ok(!buildContext(f.domain,p.id,{audience:'character',viewpointId:c1.id}).text.includes('月灰'));
  const known=temporalObjects(f.domain,p.id,{audience:'character',viewpointId:c2.id});assert.ok(known.objects.some(o=>o.kind==='fact'&&o.fields.value==='月灰'));
  const a=assetsAt(f.domain,f.state.run.id).find(a=>a.key==='c1')!;
  const independent=activate(f,{mode:'independent',template:'parallel',inheritPrefix:false,inheritDynamics:false,inheritPlot:false,categories:['character'],selection:{[a.id]:{mode:'main',fields:['identity']}}});assert.ok(!buildContext(f.domain,independent.id,{goal:names[0]}).text.includes('月灰'));
 }finally{await f.runner.close();f.store.close();}
});

test('source identity decisions: split/merge/undo retain evidence, remap links and invalidate dependent scans without altering a branch',async()=>{
 const f=await scan(`第1章 开始\n${person(1)}\n第2章 另一次提及\n${person(1)}\n第3章 交谈\n${person(1)}${person(2)}`);try{
  const branch=activate(f),before=hash(f.domain.backup(branch.id));let run=sourceGet(f.store,'source_runs',f.state.run.id);const a=assetsAt(f.domain,run.id).find(a=>a.key==='c1')!;
  const resolved=await f.app.dispatch('POST',`/source-runs/${run.id}/decisions`,{revision:run.revision,assetId:a.id,action:'resolve',ordinal:1,reason:'以原作第一章身份为准',patch:{identity:'修订的有证据身份'}});
  run=sourceGet(f.store,'source_runs',run.id);assert.ok(run.segments.some(s=>s.state==='pending'));assert.equal(f.domain.task(f.work.workspaceId,run.taskId).status,'PAUSED');assert.equal(hash(f.domain.backup(branch.id)),before);
  await f.app.dispatch('POST',`/source-runs/${run.id}/control`,{action:'redelegate'});await f.runner.idle(run.taskId);assert.equal(f.domain.task(f.work.workspaceId,run.taskId).status,'COMPLETED');
  // Undo is itself a dated decision; older snapshots keep the previous decision.
  run=sourceGet(f.store,'source_runs',run.id);await f.app.dispatch('POST',`/source-runs/${run.id}/decisions`,{revision:run.revision,assetId:a.id,decisionId:resolved.id,action:'undo',ordinal:3,reason:'恢复原身份以核对同名者'});
  assert.equal(assetsAt(f.domain,run.id,1).find(x=>x.id===a.id)?.identity,'修订的有证据身份');
 }finally{await f.runner.close();f.store.close();}
 // A same-key aggregate can be split by exact evidence; no historical text is rewritten.
 const g=await scan(person(1)+'另一位同名者走进门。'+person(1));try{
  let run=sourceGet(g.store,'source_runs',g.state.run.id),a=assetsAt(g.domain,run.id)[0];assert.equal(a.evidence.length,2);
  const d=await g.app.dispatch('POST',`/source-runs/${run.id}/decisions`,{revision:run.revision,assetId:a.id,action:'split',ordinal:1,reason:'作者明确两次提及不是一人',evidenceStarts:[a.evidence[1].start],patch:{name:a.name,identity:'同名访客'}});
  let split=assetsAt(g.domain,run.id);assert.equal(split.length,2);assert.ok(split.some(x=>x.id===d.splitId));assert.equal(split.reduce((n,x)=>n+x.evidence.length,0),2);
  run=sourceGet(g.store,'source_runs',run.id);await g.app.dispatch('POST',`/source-runs/${run.id}/decisions`,{revision:run.revision,assetId:d.splitId,action:'merge',targetId:a.id,ordinal:1,reason:'重新核对，两条证据指向同一人'});split=assetsAt(g.domain,run.id);assert.equal(split.length,1);assert.equal(split[0].evidence.length,2);
 }finally{await g.runner.close();g.store.close();}
});

test('source profiles: late results are isolated after an author decision; only explicitly reviewed profiles enter inheritance',async()=>{
 let enter!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>enter=r);let block=true;
 class Profile extends SourceFixtureProvider{override async generate(r:ModelRequest){if(r.prompt==='sourceProfile'&&block){enter();await new Promise<void>(r=>release=r);}return super.generate(r);}}
 const f=await scan(person(1),new Profile());try{
  const a=assetsAt(f.domain,f.state.run.id)[0],run=sourceGet(f.store,'source_runs',f.state.run.id);
  const task=await f.app.dispatch('POST',`/source-runs/${run.id}/profiles`,{ids:[a.id],cloudAuthorized:true,budget:{calls:3,outputTokens:12000,contextChars:36000}});await ready;
  await f.app.dispatch('POST',`/source-runs/${run.id}/decisions`,{revision:run.revision,assetId:a.id,action:'resolve',ordinal:1,reason:'明确姓名避免同名混淆',patch:{name:a.name,identity:a.identity}});release();await f.runner.idle(task.id);
  assert.equal(assetsAt(f.domain,run.id)[0].profile,undefined);assert.ok(f.store.list('artifacts',f.work.workspaceId).some(x=>x.status==='stale'));
  block=false;const next=await f.app.dispatch('POST',`/source-runs/${run.id}/profiles`,{ids:[a.id],cloudAuthorized:true,budget:{calls:3,outputTokens:12000,contextChars:36000}});await f.runner.idle(next.id);
  const candidate=assetsAt(f.domain,run.id)[0];assert.ok(candidate.profile&&!candidate.profile.accepted);const latest=sourceGet(f.store,'source_runs',run.id);
  await f.app.dispatch('POST',`/source-runs/${run.id}/decisions`,{revision:latest.revision,assetId:a.id,action:'accept-profile',ordinal:1,reason:'已回查连续引文并接受'});assert.ok(assetsAt(f.domain,run.id)[0].profile.accepted);
 }finally{await f.runner.close();f.store.close();}
});

test('source temporal fields: historical states and template resets agree with explicit field choices',async()=>{
 class States extends SourceFixtureProvider{override async generate(r:ModelRequest){
  const output=await super.generate(r);if(r.prompt!=='sourceExtract')return output;
  const value=JSON.parse(output.text),health=r.input.text.includes('已经康复')?'健康':'受伤';
  const c=r.input.entities.find((e:any)=>e.key==='c1');
  value.items.push({key:'c1',kind:'character',name:names[0],description:health,fields:{identity:c.identity,health,voice:'先报数字',customTrait:'袖口绣浪花'},refs:{},evidence:{quote:health==='健康'?'他已经康复。':'他的左臂受伤。',modality:'objective',inference:false}});
  const w=r.input.entities.find((e:any)=>e.key==='key');if(w)value.items.push({key:'key',kind:'world',name:'潮门钥匙',description:'最后由陌生人持有',fields:{identity:w.identity,unique:true,当前持有者:'陌生人',holder:'陌生人',secret:'秘密齿形'},refs:{},evidence:{quote:'钥匙最后由陌生人持有。',modality:'objective',inference:false}});
  return {...output,text:JSON.stringify(value)};
 }}
 const raw=`第1章 受伤\n${person(1)}他的左臂受伤。【物件 key】潮门钥匙，规则：只开潮门。钥匙最后由陌生人持有。\n第2章 康复\n${person(1)}他已经康复。`;
 const f=await scan(raw,new States());try{
  const p=activate(f),character=f.store.objects(p.id,'character')[0];
  assert.equal(temporalObjects(f.domain,p.id,{asOfChapter:1}).objects.find(o=>o.id===character.id)?.fields.health,'受伤');
  assert.equal(temporalObjects(f.domain,p.id,{asOfChapter:2}).objects.find(o=>o.id===character.id)?.fields.health,'健康');
  const a=assetsAt(f.domain,f.state.run.id).find(a=>a.key==='c1')!;
  const reset=activate(f,{mode:'independent',template:'parallel'});
  const text=buildContext(f.domain,reset.id,{goal:names[0]+'和潮门钥匙'}).text;
  assert.ok(!text.includes('陌生人'));assert.ok(!text.includes('秘密齿形'));assert.equal(f.store.objects(reset.id,'character')[0].fields.health,undefined);
  const selected=activate(f,{mode:'independent',template:'parallel',selection:{[a.id]:{mode:'main',fields:['identity','voice','customTrait','health']}}});
  const chosen=f.store.objects(selected.id,'character')[0];assert.equal(chosen.fields.health,'健康');assert.equal(chosen.fields.customTrait,'袖口绣浪花');
  assert.throws(()=>activate(f,{selection:{[a.id]:{mode:'main',fields:['missing']}}}),/字段已失效/);
 }finally{await f.runner.close();f.store.close();}
});

test('source invalid claims remain visible candidates, never auto accepted as dangling formal facts',async()=>{
 class Invalid extends SourceFixtureProvider{override async generate(r:ModelRequest){const out=await super.generate(r);if(r.prompt!=='sourceExtract')return out;return {...out,text:JSON.stringify({summary:'原文可回查，结构错误须处理',saturated:false,items:[{key:'self',kind:'fact',name:'错误自引用',fields:{property:'health',value:'健康'},refs:{entityId:'self'},evidence:{quote:person(1),modality:'objective',inference:false}}]})};}}
 const f=await scan(person(1),new Invalid());try{const bad=assetsAt(f.domain,f.state.run.id).find(x=>x.kind==='fact')!;assert.equal(bad.status,'unverified');assert.throws(()=>activate(f),/未证实/);const p=activate(f,{selection:{[bad.id]:{mode:'omit'}}});assert.equal(f.store.objects(p.id,'fact').length,0);}finally{await f.runner.close();f.store.close();}
});
