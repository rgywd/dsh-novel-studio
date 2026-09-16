import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './helpers.js';
import { Store } from '../src/store.js';
import { Domain } from '../src/domain.js';
import { requestGet, requestList, requestPut, requestRestore, requestSummaries, pruneRequests, requestRetention, type RequestRecord } from '../src/requests.js';
import { projectNavigation, projectMetadata, taskSummaries } from '../src/projections.js';
import { readMetrics, projectReadIndex } from '../src/read-model.js';
import { resolveStoryScope } from '../src/scope.js';
import { buildContext } from '../src/context.js';
import type { CompiledPrompt } from '../src/compiler.js';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { HttpApp } from '../src/http.js';

const compiled = {role:'Writer',config:{hash:'cfg',versions:[]},hash:'wire',stableHash:'stable',localCompilationCache:'MISS',blocks:[],messages:[],system:'',warnings:[],macros:[],transformations:[],sampling:{},estimatedTokens:10,budget:100} as unknown as CompiledPrompt;
function record(projectId:string,taskId:string,n:number):RequestRecord {return {id:`request_${String(n).padStart(3,'0')}`,projectId,taskId,stepKey:`0:0:call-${n}`,attempt:1,createdAt:new Date(2026,8,16,0,0,n).toISOString(),status:'COMPLETED',compiled,observed:{model:'deterministic',messages:[{role:'user',content:`fixture ${n}`}]},rawResponse:`原始响应 ${n}`,candidate:n===2?'待审正文':`候选 ${n}`,usage:{serverCache:'UNKNOWN',elapsedMs:12,outputTokens:5}};}

test('stage 2: more than 100 requests retain linked details and explain cleared history; cleanup preserves protected references',()=>{
  const f=fixture();let chapter=f.domain.saveChapter(f.p.id,f.chapter.id,f.chapter.revision,'正文版本');const version=f.store.get('versions',String(chapter.fields.currentVersion));version.requestIds=['request_003'];f.store.db.prepare('UPDATE versions SET data=? WHERE id=?').run(JSON.stringify(version),version.id);
  const task=f.task({kind:'ideas',autoAccept:false});task.status='RUNNING';task.steps=[{key:'0:0:call-1',name:'进行中',inputHash:'x',inputRevision:task.expectedRevision,status:'RUNNING',attempts:1,startedAt:new Date().toISOString(),requestIds:['request_001']}];f.store.put('tasks',task);
  requestPut(f.store,record(f.p.id,task.id,1));requestPut(f.store,record(f.p.id,task.id,2));const pending=f.domain.putArtifact(task,'chapter',{content:'待审正文'},chapter);assert.equal(pending.data.generation.requestId,'request_002');task.status='PAUSED';f.store.put('tasks',task);
  for(let n=3;n<=130;n++)requestPut(f.store,record(f.p.id,task.id,n));
  const page=requestSummaries(f.store,f.p.id,{offset:100,limit:50});assert.equal(page.total,130);assert.equal(page.items.length,30);assert.equal(page.items.at(-1)?.id,'request_001');
  for(const n of [1,2,3]){const item=requestGet(f.store,f.p.id,`request_${String(n).padStart(3,'0')}`);assert.equal(item.detailState,'available');assert.ok(item.compiled);assert.ok(item.protectedReasons?.length);}
  const old=requestGet(f.store,f.p.id,'request_004');assert.equal(old.detailState,'cleared');assert.equal(old.compiled,undefined);assert.match(old.clearReason??'',/容量/);assert.equal(requestList(f.store,f.p.id).length,103);
  const result=pruneRequests(f.store,f.p.id,{user:true,before:'2026-09-17T00:00:00.000Z',removeSummaries:true});assert.equal(result.protected,3);assert.equal(requestRetention(f.store,f.p.id).summaries,3);assert.equal(requestGet(f.store,f.p.id,'request_001').detailState,'available');assert.throws(()=>requestGet(f.store,f.p.id,'request_004'),/保留范围/);
  const backup=f.domain.backup(f.p.id),restored=f.domain.restoreBackup(backup);assert.equal(requestSummaries(f.store,restored.id).total,3);assert.equal(requestGet(f.store,restored.id,restored.id==='x'?'x':f.store.db.prepare('SELECT id FROM request_summaries WHERE projectId=? ORDER BY rowid LIMIT 1').get(restored.id)!.id as string).detailState,'available');
  f.store.close();
});

test('stage 2: schema 3 request rows migrate additively and old backup restores as independent copy',()=>{
  const dir=mkdtempSync(join(tmpdir(),'novel-stage2-migration-')),path=join(dir,'studio.sqlite');const f=fixture(path);const t=f.task({kind:'ideas'}),legacy=record(f.p.id,t.id,7);f.store.db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(legacy.id,legacy.projectId,legacy.taskId,JSON.stringify(legacy));const before=f.domain.backup(f.p.id).payload.objects;f.store.close();
  const old=new DatabaseSync(path);old.exec("DROP TABLE request_details; DROP TABLE request_summaries; UPDATE meta SET value='3' WHERE key='schema';");const raw=String(old.prepare('SELECT data FROM requests WHERE id=?').get(legacy.id)!.data);old.close();
  const store=new Store(path),domain=new Domain(store);assert.equal(store.db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value,'4');assert.equal(String(store.db.prepare('SELECT data FROM requests WHERE id=?').get(legacy.id)!.data),raw);assert.deepEqual(store.objects(f.p.id),before);assert.equal(requestGet(store,f.p.id,legacy.id).rawResponse,legacy.rawResponse);const copy=domain.restoreBackup(domain.backup(f.p.id));assert.notEqual(copy.id,f.p.id);assert.equal(requestSummaries(store,copy.id).total,1);store.close();rmSync(dir,{recursive:true});
});

test('stage 2: lightweight reads omit prose and repeated scoped memory work shares one revision-bound index',()=>{
  const f=fixture();const accepted=f.domain.saveChapter(f.p.id,f.chapter.id,f.chapter.revision,'只在章节详情里的正文哨兵'.repeat(200));const metrics=readMetrics(),meta=projectMetadata(f.domain,f.p.id,metrics),nav=projectNavigation(f.domain,f.p.id,metrics);
  assert.equal(meta.project.id,f.p.id);assert.equal(nav.objects.find(item=>item.id===accepted.id)?.body,'');assert.ok(JSON.stringify(nav).length<JSON.stringify(f.domain.snapshot(f.p.id)).length);assert.equal(f.domain.object(f.p.id,accepted.id).body,accepted.body);assert.equal(metrics.queries,4);
  const readMetricsForScope=readMetrics(),read=resolveStoryScope(f.domain,f.p.id,{chapterId:accepted.id},readMetricsForScope);assert.equal(read.index.cacheRevision(),`${f.domain.project(f.p.id).revision}:${read.trace.structureHash}:`);const pack=buildContext(f.domain,f.p.id,{chapterId:accepted.id,resolvedScope:read,memory:{enabled:true}});assert.ok(pack.items.length);assert.equal(readMetricsForScope.labels.objects,1);assert.equal(readMetricsForScope.labels.memories,1);assert.ok(readMetricsForScope.cacheHits>=1);assert.equal(taskSummaries(f.domain,f.p.id).length,0);
  const oldRevision=read.index.cacheRevision();f.domain.updateObject(f.p.id,f.volume.id,f.volume.revision,{kind:'volume',title:f.volume.title,parentId:f.volume.parentId,order:2,status:'planned',locked:false,tags:[],body:'',fields:{},source:f.volume.source});const next=projectReadIndex(f.domain,f.p.id);assert.notEqual(next.cacheRevision(),oldRevision);f.store.close();
});

test('stage 2: HTTP separates navigation, chapter details, task status, artifact summaries and request pages',async()=>{
  const f=fixture();const chapter=f.domain.saveChapter(f.p.id,f.chapter.id,f.chapter.revision,'真实详情哨兵'.repeat(150));
  const task=f.task({kind:'ideas'});requestPut(f.store,record(f.p.id,task.id,1));
  const app=new HttpApp(f.domain,f.runner);const server=createServer((req,res)=>void app.handle(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');
  const root=`http://127.0.0.1:${(server.address() as any).port}/api/novel-studio/projects/${f.p.id}`;
  const get=async(path:string)=>{const response=await fetch(root+path);assert.equal(response.status,200);return {body:await response.json(),bytes:Number(response.headers.get('content-length')??0)};};
  try{
    const meta=await get('/metadata'),nav=await get('/navigation'),detail=await get(`/objects/${chapter.id}`),status=await get('/status'),taskDetail=await get(`/tasks/${task.id}`),artifacts=await get('/artifact-summaries'),page=await get('/requests?paged=1&limit=1');
    assert.equal(meta.body.project.id,f.p.id);assert.equal(meta.body.objects,undefined);assert.equal(nav.body.projectRevision,meta.body.project.revision);assert.equal(nav.body.objects.find((o:any)=>o.id===chapter.id).body,'');assert.equal(detail.body.body,chapter.body);
    assert.ok(Buffer.byteLength(JSON.stringify(nav.body))<Buffer.byteLength(JSON.stringify(f.domain.snapshot(f.p.id))));assert.equal(status.body.tasks[0].steps,undefined);assert.ok(Array.isArray(taskDetail.body.steps));assert.deepEqual(artifacts.body,[]);
    assert.equal(page.body.total,1);assert.equal(page.body.items[0].compiled,undefined);assert.equal(page.body.items[0].detailState,'available');
    const selected=await get('/requests/request_001');assert.equal(selected.body.rawResponse,'原始响应 1');
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));f.store.close();}
});
