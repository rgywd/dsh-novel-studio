import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Store,hash } from '../src/store.js';
import { Domain,oldInput } from '../src/domain.js';
import { Runner } from '../src/runtime.js';
import { HttpApp } from '../src/http.js';
import { sourceFixture,SourceFixtureProvider,names } from './source-fixture.js';
import { buildContext } from '../src/context.js';
import { assetsAt,sourceGet } from '../src/sources.js';

test('source HTTP E2E: 60 chapters / 64 characters through bounded scanning, strict prefix, atomic branch and Writer/Director handoff',async()=>{
 const store=new Store(':memory:'),domain=new Domain(store),model=new SourceFixtureProvider(),runner=new Runner(domain,model,model),app=new HttpApp(domain,runner);
 const server=createServer((q,s)=>void app.handle(q,s));server.listen(0,'127.0.0.1');await once(server,'listening');const root=`http://127.0.0.1:${(server.address() as any).port}/api/novel-studio`;
 const api=async(path:string,body?:unknown,method='POST')=>{const res=await fetch(root+path,body===undefined?{}:{method,headers:{'Content-Type':'application/json','X-Novel-Studio':'1'},body:JSON.stringify(body)});const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data;};
 try{
  const raw=sourceFixture(),source=await api('/sources',{title:'潮门记录 · 原创合成60章64人',author:'本仓库测试原创',files:[{name:'潮门.md',raw}]}),{work,version}=source;
  assert.equal(version.chapters.length,60);assert.equal(version.hash,hash(raw));assert.equal((await api('/projects')).length,0);
  const state=await api(`/sources/${work.id}/runs`,{versionId:version.id,boundary:{kind:'after-chapter',id:version.chapters[59].id},provider:'demo',batchSize:16,budget:{calls:200,outputTokens:500000,contextChars:24000}});
  await runner.idle(state.task.id);const finished=await api(`/source-runs/${state.run.id}`);assert.equal(finished.task.status,'COMPLETED',JSON.stringify(finished.task.error));assert.equal(finished.gaps.length,0);assert.ok(finished.run.segments.some((s:any)=>s.state==='split'));
  const all=await api(`/source-runs/${state.run.id}/assets?kind=character&cutoff=20&limit=10&allIds=true`);assert.equal(all.total,64);assert.equal(all.items.length,10);assert.equal(all.allIds.length,64);
  for(const n of [17,33,64]){const page=await api(`/source-runs/${state.run.id}/assets?kind=character&q=${encodeURIComponent(names[n-1])}&cutoff=20`);assert.equal(page.total,1);}
  const spec={versionId:version.id,runId:state.run.id,title:'潮门之后',mode:'continuation',template:'canonical',boundary:{kind:'after-chapter',id:version.chapters[19].id},goal:`${names[16]}、${names[32]}和${names[63]}重新核对潮门钥匙的去向，保留未兑现船票。`};
  const preview=await api('/manifests/preview',spec);assert.equal(preview.conflicts.length,0,JSON.stringify(preview.conflicts));assert.ok(!JSON.stringify(preview.assets).includes('无面客'));assert.ok(!JSON.stringify(preview.assets).includes('第五章前的密约'));assert.ok(!preview.assets.some((a:any)=>a.key==='death'));
  const saved=await api('/manifests',spec);const p=await api(`/manifests/${saved.manifest.id}/activate`,{revision:1});assert.equal((await api(`/manifests/${saved.manifest.id}/activate`,{revision:1})).id,p.id);
  const snapshot=await api(`/projects/${p.id}`),refs=snapshot.objects.filter((o:any)=>o.kind==='chapter'&&o.fields.referenceOnly);assert.equal(refs.length,20);assert.equal(snapshot.objects.filter((o:any)=>o.kind==='character').length,64);
  assert.throws(()=>domain.updateObject(p.id,refs[0].id,refs[0].revision,{...oldInput(refs[0]),locked:false}),/只读/);assert.equal(sourceGet(store,'source_versions',version.id).raw,raw);
  const next=snapshot.objects.find((o:any)=>o.kind==='chapter'&&!o.fields.referenceOnly);assert.match(next.title,/21/);const pack=buildContext(domain,p.id,{chapterId:next.id,goal:spec.goal});
  for(const n of [17,33,64])assert.ok(pack.text.includes(names[n-1]));for(const forbidden of ['无面客','第五章前的密约','于今日死亡'])assert.ok(!pack.text.includes(forbidden));
  const t=await api(`/projects/${p.id}/tasks`,{kind:'write',chapterId:next.id,goal:spec.goal,targetWords:900,provider:'demo',autoAccept:true});await runner.idle(t.id);assert.equal(domain.task(p.id,t.id).status,'COMPLETED',JSON.stringify(domain.task(p.id,t.id).error));
  let c=domain.object(p.id,next.id);c=await api(`/projects/${p.id}/objects/${c.id}/takeover`,{revision:c.revision});c=await api(`/projects/${p.id}/objects/${c.id}/body`,{revision:c.revision,body:c.body+'\n门边系上蓝色缎带，三人均看见了。'});
  const again=await api(`/projects/${p.id}/tasks`,{kind:'write',goal:'继续核对潮位，继承蓝色缎带',targetWords:900,provider:'demo',autoAccept:true});await runner.idle(again.id);assert.equal(domain.task(p.id,again.id).status,'COMPLETED',JSON.stringify(domain.task(p.id,again.id).error));
  const sent=model.seen.filter(s=>s.prompt==='write').at(-1)!;assert.ok(sent.input.context.includes(c.fields.currentVersion));assert.ok(sent.input.context.includes('蓝色缎带'));assert.ok(!sent.input.context.includes('无面客'));assert.ok(domain.chapters(p.id).at(-1)!.body.includes('蓝色缎带'));
  const exported=await api(`/projects/${p.id}/export`);assert.ok(exported.text.includes('来源：'));assert.ok(!exported.text.includes('【人物 c1】'));assert.equal(assetsAt(domain,state.run.id,20).filter(a=>a.kind==='character').length,64);
 }finally{await runner.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();}
});
