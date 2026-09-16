import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './helpers.js';
import { Store } from '../src/store.js';
import { Domain } from '../src/domain.js';
import { HttpApp } from '../src/http.js';
import { shelfProjects } from '../src/shelf.js';
import { nativePresets,resolveConfig } from '../src/config.js';

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';

test('stage 3: shelf projection follows chapter, artifact, archive, cover and independent backup through real HTTP',async()=>{
  const f=fixture();const app=new HttpApp(f.domain,f.runner);const server=createServer((req,res)=>void app.handle(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');
  const root=`http://127.0.0.1:${(server.address() as any).port}/api/novel-studio`;
  const call=async(path:string,body?:unknown,method='GET')=>{const response=await fetch(root+path,{method,headers:body?{'Content-Type':'application/json','X-Novel-Studio':'1'}:undefined,body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
  try{
    const initial=await call('/shelf');assert.equal(initial.data.length,1);assert.equal(initial.data[0].recentChapter.title,'第一章');assert.equal(initial.data[0].pendingReview,0);assert.equal(JSON.stringify(initial.data).includes('铜钥匙交给闻溪'),false);
    const task=f.task({kind:'ideas',autoAccept:false});const artifact=f.domain.putArtifact(task,'ideas',{title:'待审方向'},f.chapter);let shelf=await call('/shelf');assert.equal(shelf.data[0].pendingReview,1);
    const upload=await call(`/projects/${f.p.id}/cover`,{base64:png,mime:'image/png',expectedRevision:null},'POST');assert.equal(upload.status,200);assert.equal(upload.data.revision,1);
    const image=await fetch(root+`/projects/${f.p.id}/cover`);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),Buffer.from(png,'base64'));
    const stale=await call(`/projects/${f.p.id}/cover`,{base64:png,mime:'image/png',expectedRevision:null},'POST');assert.equal(stale.status,409);const fake=await call(`/projects/${f.p.id}/cover`,{base64:png,mime:'image/jpeg',expectedRevision:1},'POST');assert.equal(fake.status,422);
    const backup=f.domain.backup(f.p.id),restored=f.domain.restoreBackup(backup);assert.notEqual(restored.id,f.p.id);shelf=await call('/shelf');assert.equal(shelf.data.length,2);assert.equal(shelf.data.find((p:any)=>p.id===restored.id).coverRevision,1);assert.equal(shelf.data.find((p:any)=>p.id===restored.id).pendingReview,1);
    f.domain.rejectArtifact(f.p.id,artifact.id);shelf=await call('/shelf');assert.equal(shelf.data.find((p:any)=>p.id===f.p.id).pendingReview,0);assert.equal(shelf.data.find((p:any)=>p.id===restored.id).pendingReview,1);
    const old=f.domain.project(f.p.id);f.domain.updateProject(f.p.id,old.revision,{title:old.title,premise:old.premise,genre:old.genre,style:old.style,constraints:old.constraints,archived:true});shelf=await call('/shelf');assert.equal(shelf.data.find((p:any)=>p.id===f.p.id).archived,true);
    const removal=await call(`/projects/${f.p.id}/cover`,{expectedRevision:1},'DELETE');assert.equal(removal.status,200);assert.equal((await call('/shelf')).data.find((p:any)=>p.id===f.p.id).coverRevision,undefined);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));f.store.close();}
});

test('stage 3: global creative assets use existing version bindings without project selection or task snapshot drift',async()=>{
  const f=fixture(),app=new HttpApp(f.domain,f.runner),project=f.p.id;
  const before=await app.dispatch('GET','/creative-assets');assert.deepEqual(before.versions,[]);
  const first=await app.dispatch('POST','/creative-assets/save',{name:'克制叙述',config:nativePresets[0].config});
  assert.equal((await app.dispatch('GET','/creative-assets')).global,undefined);
  await app.dispatch('POST','/creative-assets/bind',{versionId:first.id,expected:null});assert.equal(resolveConfig(f.store,project).versions[0].id,first.id);
  const frozen=f.task({kind:'ideas'});const hash=frozen.configSnapshot!.hash;
  const second=await app.dispatch('POST','/creative-assets/save',{name:'快节奏',config:nativePresets[1].config});await app.dispatch('POST','/creative-assets/bind',{versionId:second.id,expected:first.id});
  assert.equal(frozen.configSnapshot!.hash,hash);assert.notEqual(resolveConfig(f.store,project).hash,hash);
  const unsafe=await app.dispatch('POST','/creative-assets/save',{name:'只在单项目绑定',config:{enabled:true,strategy:'novel',bindings:{characterId:f.a.id}}});
  await assert.rejects(()=>app.dispatch('POST','/creative-assets/bind',{versionId:unsafe.id,expected:second.id}),/不能绑定某本作品/);
  assert.equal((await app.dispatch('GET','/creative-assets')).global,second.id);f.store.close();
});

test('stage 3: schema 4 copy upgrades additively, backfills shelf once and preserves old project data',()=>{
  const dir=mkdtempSync(join(tmpdir(),'novel-stage3-')),path=join(dir,'old.sqlite');const f=fixture(path);const oldObjects=f.store.objects(f.p.id),project=f.domain.project(f.p.id);f.store.close();
  const old=new DatabaseSync(path);old.exec("DROP TABLE project_covers; DROP TABLE project_shelf; UPDATE meta SET value='4' WHERE key='schema';");old.close();
  const migrated=new Store(path);assert.equal(migrated.db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value,'5');assert.deepEqual(migrated.objects(project.id),oldObjects);assert.equal(shelfProjects(new Domain(migrated))[0].recentChapter?.title,'第一章');assert.equal(migrated.db.prepare('PRAGMA quick_check').get()?.quick_check,'ok');migrated.close();rmSync(dir,{recursive:true});
});
