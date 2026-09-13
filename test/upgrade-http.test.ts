import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fixture } from './helpers.js';
import { HttpApp } from '../src/http.js';
import { installMemory,memoryList } from '../src/memory.js';

test('upgrade simulated HTTP E2E: preset preview/apply, three text stages, memory, handoff, next chapter and full backup',async()=>{
  const f=fixture(),app=new HttpApp(f.domain,f.runner),server=createServer((q,s)=>void app.handle(q,s));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const root=`http://127.0.0.1:${(server.address() as any).port}/api/novel-studio`,base=`/projects/${f.p.id}`;
  const api=async(path:string,body?:unknown,method='POST')=>{
    const res=await fetch(root+path,body===undefined?{}:{method,headers:{'Content-Type':'application/json','X-Novel-Studio':'1'},body:JSON.stringify(body)});
    const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data;
  };
  try{
    const raw=JSON.stringify({temperature:0.7,top_p:0.8,prompts:[{identifier:'a',role:'user',content:'短对白 {{char}} {{unknown}}'}],prompt_order:[{character_id:100001,order:[{identifier:'a',enabled:true}]}]});
    const before=await api(base+'/configurations');
    const preview=await api(base+'/configurations/preview',{raw,name:'原创 HTTP Fixture'});
    assert.ok(preview.report.some((r:any)=>r.field==='top_p'&&r.status==='UNSUPPORTED'));
    assert.equal((await api(base+'/configurations')).versions.length,before.versions.length);
    const parent=await api(base+'/configurations',{raw,name:'原始兼容预设'});
    const rules=[
      {id:'before',name:'目标措辞',stage:'before',scope:'goal',pattern:'旧要求',replacement:'当前要求'},
      {id:'after',name:'正文引号',stage:'after',scope:'prose',pattern:'“',replacement:'「'},
      {id:'display',name:'仅展示称呼',stage:'display',scope:'prose',pattern:'{{char}}',replacement:'【{{char}}】',macros:'escaped'}
    ];
    const v=await api(base+'/configurations',{name:'组合配置',parentId:parent.id,config:{...parent.config,memory:{enabled:true},regex:rules,bindings:{characterId:f.a.id}}});
    assert.ok(v.report.some((r:any)=>r.field==='top_p'));
    await api(base+'/configurations/bind',{scope:'project',versionId:v.id,expected:null});
    const compiled=await api(base+'/compile-preview',{prompt:'write',task:{kind:'write',goal:'旧要求',chapterId:f.chapter.id}});
    assert.ok(compiled.messages.some((m:any)=>m.text.includes('当前要求')));
    assert.ok(compiled.warnings.some((w:string)=>w.includes('{{unknown}}')));
    const task=await api(base+'/tasks',{kind:'write',chapterId:f.chapter.id,goal:'旧要求，写完整章节',provider:'demo',targetWords:600,autoAccept:true});
    await f.runner.idle(task.id);
    assert.equal((await api(base+`/tasks/${task.id}`)).status,'COMPLETED');
    const rows=await api(base+'/requests'),writer=await api(base+`/requests/${rows.find((r:any)=>r.role==='Writer').id}`);
    assert.ok(writer.rawResponse);assert.ok(writer.transformations.length);assert.equal(writer.usage.serverCache,'UNKNOWN');
    let chapter=await api(base+`/objects/${f.chapter.id}`);
    const version=chapter.fields.currentVersion,display=await api(base+'/display',{chapterId:chapter.id});
    assert.ok(display.text.includes('【沈砚】'));assert.ok(display.macros.some((m:any)=>m.resolved));
    assert.equal((await api(base+`/objects/${chapter.id}`)).fields.currentVersion,version);
    assert.equal((await api(base+'/memories')).covered,1);
    chapter=await api(base+`/objects/${chapter.id}/takeover`,{revision:chapter.revision});
    chapter=await api(base+`/objects/${chapter.id}/body`,{revision:chapter.revision,body:chapter.body+'\n作者补充：窗边放着一盏蓝灯，二人都看见了。'});
    assert.equal((await api(base+'/memories')).covered,0);
    const next=await api(base+'/tasks',{kind:'write',goal:'继承作者最新蓝灯事件',provider:'demo',targetWords:600,autoAccept:true});
    await f.runner.idle(next.id);const nextResult=await api(base+`/tasks/${next.id}`);
    assert.equal(nextResult.status,'COMPLETED',JSON.stringify(nextResult.error));
    assert.ok(nextResult.artifacts.some((a:any)=>a.data.context?.items.some((i:any)=>i.version===chapter.fields.currentVersion)));
    assert.equal((await api(base+'/memories')).covered,2);
    const backup=await api(base+'/backup');assert.ok(backup.payload.configurations.some((c:any)=>c.raw===raw));
    const copy=await api('/backups/restore',backup),copyBase=`/projects/${copy.id}`;
    const config=await api(copyBase+'/configurations');assert.equal(config.effective.config.memory.enabled,true);
    assert.equal((await api(copyBase+'/memories')).covered,2);
    const records=memoryList(f.store,copy.id),memory=records.find(m=>m.kind==='chapter'&&m.status==='valid')!;
    const replayed=f.store.transaction(()=>installMemory(f.domain,copy.id,memory.sources[0],memory.content,'restore-replay'));assert.equal(replayed.id,memory.id);assert.equal(memoryList(f.store,copy.id).length,records.length);
    assert.ok(config.effective.report.some((r:any)=>r.field==='top_p'));
    assert.equal((await api(copyBase)).objects.filter((o:any)=>o.kind==='chapter').length,2);
    assert.equal((await api(base+`/objects/${chapter.id}`)).body,chapter.body);
  }finally{await f.runner.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));f.store.close();}
});
