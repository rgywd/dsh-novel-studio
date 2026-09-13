import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store,hash } from '../src/store.js';
import { Domain,oldInput } from '../src/domain.js';
import { Runner } from '../src/runtime.js';
import { HttpApp } from '../src/http.js';
import { SourceFixtureProvider,sourceFixture,names,person } from './source-fixture.js';
import { assetsAt,sourceGet,sourceList,sourcePut,sourceAssetPage,createSource,startSourceRun } from '../src/sources.js';
import { saveManifest,previewInheritance,activateManifest } from '../src/inheritance.js';
import { buildContext } from '../src/context.js';
import type { ModelRequest } from '../src/provider.js';
const budget={calls:200,outputTokens:500000,contextChars:24000};
async function setup(raw=sourceFixture(),path=':memory:',model=new SourceFixtureProvider(),calls=200){const store=new Store(path),domain=new Domain(store),runner=new Runner(domain,model,model),app=new HttpApp(domain,runner);const s=createSource(domain,{title:'原创来源验证',files:[{name:'原稿.md',raw}]});const run=startSourceRun(domain,s.work.id,{versionId:s.version.id,boundary:{kind:'all-materials',id:null},provider:'demo',budget:{...budget,calls}});runner.start(run.task.id);await runner.idle(run.task.id);return {store,domain,runner,app,model,...s,run};}
const specFor=(f:any,patch:any={})=>({versionId:f.version.id,runId:f.run.run.id,title:'独立副本',mode:'continuation',template:'canonical',boundary:{kind:'after-chapter',id:f.version.chapters[19]?.id??f.version.chapters.at(-1).id},...patch});
const activate=(f:any,spec:any)=>{const m=saveManifest(f.domain,spec).manifest;return activateManifest(f.domain,m.id,m.revision);};

test('source C/J: budget pause persists, restart reuses completed ranges, grant resumes and commit replay creates only once',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'novel-source-')),path=join(dir,'copy.sqlite');let f=await setup(undefined,path,undefined,3);
 try{const task=f.domain.task(f.work.workspaceId,f.run.task.id);assert.equal(task.status,'PAUSED');assert.equal(task.error?.code,'BUDGET_EXHAUSTED');const before=sourceGet(f.store,'source_runs',f.run.run.id),complete=before.segments.find(s=>s.state==='complete')!;const completedLabel=task.steps.find(s=>s.name.includes(complete.id))!.inputHash;await f.runner.close();f.store.close();const store=new Store(path),domain=new Domain(store),model=new SourceFixtureProvider(),runner=new Runner(domain,model,model),app=new HttpApp(domain,runner);f={...f,store,domain,model,runner,app};domain.recover();await app.dispatch('POST',`/source-runs/${before.id}/control`,{action:'resume',budget:{calls:200,outputTokens:500000}});await runner.idle(task.id);assert.equal(domain.task(f.work.workspaceId,task.id).status,'COMPLETED');assert.ok(!model.seen.some(s=>s.input.scope?.segmentId===complete.id));assert.ok(domain.task(f.work.workspaceId,task.id).steps.some(s=>s.inputHash===completedLabel));assert.equal(assetsAt(domain,before.id,20).filter(a=>a.kind==='character').length,64);
 const m=saveManifest(domain,specFor(f)).manifest;const original=store.put.bind(store);let blocked=true;store.put=((table:any,value:any)=>{if(blocked&&table==='objects'&&value.kind==='character')throw new Error('simulated index/write failure');return original(table,value);}) as any;assert.throws(()=>activateManifest(domain,m.id,1),/simulated/);assert.equal(store.list('projects').filter(p=>!p.sourceWorkspace).length,0);assert.equal(sourceGet(store,'import_manifests',m.id).status,'staging');blocked=false;const p=activateManifest(domain,m.id,1);assert.equal(activateManifest(domain,m.id,1).id,p.id);assert.equal(store.list('projects').filter(p=>!p.sourceWorkspace).length,1);
 }finally{await f.runner.close();f.store.close();rmSync(dir,{recursive:true});}
});
test('source F/G/H/I: selective references, field resets, retcon conflicts, independent text packages and branch isolation',async()=>{
 const f=await setup();try{
 const all=assetsAt(f.domain,f.run.run.id,20),a=all.find(a=>a.key==='c1')!,b=all.find(a=>a.key==='c17')!,relation=all.find(a=>a.kind==='relationship')!;
 const selection=Object.fromEntries(all.filter(x=>x.kind==='character').map(x=>[x.id,{mode:x.id===a.id?'main':'omit'}]));
 const p=previewInheritance(f.domain,specFor(f,{selection}));assert.ok(p.selected.some(x=>x.asset.id===b.id&&x.mode==='background'));assert.equal(p.conflicts.length,0);
 const dropped=previewInheritance(f.domain,specFor(f,{inheritPrefix:false,selection:{...selection,[relation.id]:{mode:'omit'}}}));assert.ok(!dropped.selected.some(x=>x.asset.id===relation.id));assert.ok(!dropped.selected.some(x=>x.asset.id===b.id));
 const prohibited=previewInheritance(f.domain,specFor(f,{selection:{[a.id]:{mode:'exclude'}}}));assert.ok(prohibited.conflicts.some(c=>c.code==='HISTORY_EXCLUSION'));
 const override={entityId:relation.id,property:'state',value:'合作搭档',reason:'本分支共同守护船票'};
 assert.ok(previewInheritance(f.domain,specFor(f,{template:'divergent',overrides:[override]})).conflicts.some(c=>c.code==='RETCON_REQUIRED'));
 const A=activate(f,specFor(f,{template:'divergent',overrides:[{...override,retcon:true}]})),B=activate(f,specFor(f,{title:'另一分支'}));const relationA=f.store.objects(A.id,'relationship')[0],relationB=f.store.objects(B.id,'relationship')[0];assert.equal(relationA.fields.state,'合作搭档');assert.equal(relationB.fields.state,'有效');assert.ok(buildContext(f.domain,A.id,{goal:names[0]}).text.includes('合作搭档'));
 const before=hash(sourceList(f.store,'source_assets'));f.domain.updateObject(A.id,relationA.id,relationA.revision,{...oldInput(relationA),body:'作者让他们分工合作'});assert.equal(hash(sourceList(f.store,'source_assets')),before);assert.equal(f.domain.object(B.id,relationB.id).fields.state,'有效');assert.equal(f.domain.object(A.id,relationA.id).source?.provenance,'adaptation');
 const c=activate(f,specFor(f,{mode:'independent',template:'parallel',title:'另一片海',boundary:{kind:'all-materials',id:null}}));assert.equal(f.domain.chapters(c.id).length,1);assert.equal(f.store.objects(c.id,'fact').length,0);assert.ok(!buildContext(f.domain,c.id,{goal:names[16]}).text.includes('无面客'));
 const oldHash=hash(f.domain.backup(B.id));const newer=await f.app.dispatch('POST',`/sources/${f.work.id}/versions`,{revision:f.work.revision,source:{title:'修订',files:[{name:'new.md',raw:sourceFixture()+'\n第61章 新来源事件\n全新内容。'}]}});assert.notEqual(newer.id,f.version.id);assert.equal(hash(f.domain.backup(B.id)),oldHash);await assert.rejects(()=>f.app.dispatch('DELETE',`/sources/${f.work.id}`),/引用此来源/);
 const restored=f.domain.restoreBackup(f.domain.backup(A.id));assert.equal(f.store.objects(restored.id,'relationship')[0].fields.state,'合作搭档');assert.equal((await f.app.dispatch('GET',`/projects/${restored.id}/source-baseline`)).assets.filter((a:any)=>a.kind==='character').length,64);
 const pack=createSource(f.domain,{title:'游戏同人原创资料包',files:[{name:'人物.md',raw:person(1),kind:'character'},{name:'世界.md',raw:'【物件 key】潮门钥匙，规则：只开启潮门。',kind:'world'}]});const run=startSourceRun(f.domain,pack.work.id,{versionId:pack.version.id,boundary:{kind:'all-materials',id:null},provider:'demo',budget});f.runner.start(run.task.id);await f.runner.idle(run.task.id);const project=activate(f,{versionId:pack.version.id,runId:run.run.id,title:'从资料包开书',mode:'independent',template:'parallel',boundary:{kind:'all-materials',id:null}});assert.equal(f.store.objects(project.id,'character').length,1);assert.equal(f.domain.chapters(project.id).length,1);
 }finally{await f.runner.close();f.store.close();}
});
test('source J: invalid JSON retains gap; canceled late responses never publish assets',async()=>{
 class Broken extends SourceFixtureProvider{override async generate(r:ModelRequest){if(r.prompt==='sourceExtract')return {text:'{"items":',outputTokens:20,estimated:true};return super.generate(r);}}
 const bad=await setup(person(1),':memory:',new Broken());try{assert.equal(bad.domain.task(bad.work.workspaceId,bad.run.task.id).status,'FAILED');assert.equal(assetsAt(bad.domain,bad.run.run.id).length,0);assert.ok(sourceGet(bad.store,'source_runs',bad.run.run.id).segments.some(s=>s.state!=='complete'));}finally{await bad.runner.close();bad.store.close();}
 let release:()=>void=()=>{},entered:()=>void=()=>{};const ready=new Promise<void>(r=>entered=r);class Late extends SourceFixtureProvider{override async generate(r:ModelRequest){if(r.prompt==='sourceDiscover'){entered();await new Promise<void>(r=>release=r);}return super.generate(r);}}
 const store=new Store(':memory:'),domain=new Domain(store),model=new Late(),runner=new Runner(domain,model,model);try{const s=createSource(domain,{title:'晚到隔离',files:[{name:'a.txt',raw:person(1)}]}),r=startSourceRun(domain,s.work.id,{versionId:s.version.id,boundary:{kind:'all-materials',id:null},provider:'demo',budget});runner.start(r.task.id);await ready;domain.controlTask(s.work.workspaceId,r.task.id,'cancel');release();await runner.idle(r.task.id);assert.equal(assetsAt(domain,r.run.id).length,0);assert.equal(domain.task(s.work.workspaceId,r.task.id).status,'CANCELED');assert.ok(store.list('artifacts',s.work.workspaceId).some(a=>a.status==='stale'));}finally{await runner.close();store.close();}
});

test('source G/H: an authorized divergent relationship and a text-only material package both enter normal chapter production',async()=>{
 class BranchProvider extends SourceFixtureProvider{override async generate(r:ModelRequest){const out=await super.generate(r);if(r.prompt==='write'&&String(r.input.context).includes('合作搭档'))return {...out,text:`${names[0]}和${names[1]}作为合作搭档核对账本。\n`+out.text};return out;}}
 const raw=`第1章 前夜\n${person(1)}${person(2)}【关系 r|c1|c2|敌对】${names[0]}与${names[1]}在原作中敌对。`;
 const f=await setup(raw,':memory:',new BranchProvider());try{
  const relation=assetsAt(f.domain,f.run.run.id).find(a=>a.kind==='relationship')!;
  const p=activate(f,specFor(f,{mode:'divergence',template:'divergent',overrides:[{entityId:relation.id,property:'type',value:'合作',reason:'作者明确平行改编',retcon:true},{entityId:relation.id,property:'state',value:'合作搭档',reason:'作者明确平行改编',retcon:true}]}));
  async function write(pid:string){const c=f.domain.chapters(pid).find(c=>!c.fields.referenceOnly)!;const t=f.domain.createTask(pid,{kind:'write',chapterId:c.id,goal:'从本书约定开始核对新账本',provider:'demo',autoAccept:true,targetWords:900,budget:{calls:8,outputTokens:16000,contextChars:24000}});f.runner.start(t.id);await f.runner.idle(t.id);assert.equal(f.domain.task(pid,t.id).status,'COMPLETED');assert.equal(f.domain.object(pid,c.id).status,'accepted');return f.domain.object(pid,c.id);}
  const chapter=await write(p.id);assert.ok(chapter.body.includes('合作搭档'));
  const call=f.model.seen.find(c=>c.prompt==='write')!;assert.ok(String(call.input.context).includes('合作搭档'));assert.ok(!JSON.stringify(call).includes(`${names[0]}与${names[1]}在原作中敌对。`));
  const pack=createSource(f.domain,{title:'纯资料同人',files:[{name:'人物.md',raw:person(1),kind:'character'},{name:'世界.md',raw:'【物件 key】潮门钥匙，规则：只开潮门。',kind:'world'}]}),run=startSourceRun(f.domain,pack.work.id,{versionId:pack.version.id,boundary:{kind:'all-materials',id:null},provider:'demo',budget});f.runner.start(run.task.id);await f.runner.idle(run.task.id);
  const independent=activate(f,{versionId:pack.version.id,runId:run.run.id,title:'另起故事',mode:'independent',template:'parallel',boundary:{kind:'all-materials',id:null}}),body=await write(independent.id);assert.ok(body.body.includes(names[0]));assert.equal(f.domain.chapters(independent.id).length,1);
 }finally{await f.runner.close();f.store.close();}
});
