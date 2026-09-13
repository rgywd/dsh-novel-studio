import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { Store } from '../src/store.js';
import { Domain } from '../src/domain.js';
import { Runner } from '../src/runtime.js';
import { HttpApp } from '../src/http.js';
import { SourceFixtureProvider,sourceFixture } from '../test/source-fixture.js';

// The actual application, isolated data file, deterministic provider for browser acceptance only.
const store=new Store(resolve('.local/source-browser.sqlite')),domain=new Domain(store),model=new SourceFixtureProvider();
domain.recover();const runner=new Runner(domain,undefined,model),app=new HttpApp(domain,runner,resolve('dist'));
const server=createServer((req,res)=>void app.handle(req,res));server.listen(4320,'127.0.0.1');await once(server,'listening');
const root='http://127.0.0.1:4320/api/novel-studio';
const api=async(path:string,body?:unknown)=>{const r=await fetch(root+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Novel-Studio':'1'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data;};
const existing=await api('/sources');
if(!existing.length){const s=await api('/sources',{title:'浏览器验收 · 原创60章64人（确定性替身）',author:'本仓库原创测试',files:[{name:'潮门.md',raw:sourceFixture()}]});const run=await api(`/sources/${s.work.id}/runs`,{versionId:s.version.id,boundary:{kind:'after-chapter',id:s.version.chapters[59].id},provider:'demo',budget:{calls:200,outputTokens:500000,contextChars:24000}});await runner.idle(run.task.id);const state=await api(`/source-runs/${run.run.id}`);if(state.task.status!=='COMPLETED')throw Error(JSON.stringify(state.task.error));writeFileSync('.local/source-browser-fixture.json',JSON.stringify({workId:s.work.id,versionId:s.version.id,runId:state.run.id,status:state.task.status},null,2));}
console.log('Original 60-chapter fixture ready: http://127.0.0.1:4320/novel-studio/ (deterministic provider, not real AI)');
let closing=false;async function close(){if(closing)return;closing=true;server.closeAllConnections();server.close();await runner.close();store.close();process.exit(0);}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
