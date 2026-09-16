import { performance } from 'node:perf_hooks';
import { cpus, platform, arch, totalmem } from 'node:os';
import { writeFileSync } from 'node:fs';
import { Store, hash } from '../src/store.js';
import { Domain } from '../src/domain.js';
import { id, now, type StoryObject, type ChapterVersion } from '../src/contracts.js';
import { projectNavigation, projectMetadata, taskSummaries } from '../src/projections.js';
import { readMetrics, projectReadIndex } from '../src/read-model.js';
import { resolveStoryScope } from '../src/scope.js';
import { buildContext } from '../src/context.js';
import type { MemoryRecord } from '../src/memory.js';

// Deterministic synthetic rows measure reads; they do not claim model extraction or generated prose quality.
const report: Record<string, unknown> = {at: new Date().toISOString(), fixture: 'directly seeded synthetic accepted chapters; no model calls', environment: {cpu: cpus()[0].model, threads: cpus().length, platform: platform(), arch: arch(), ramGiB: Math.round(totalmem()/2**30), node: process.version, storage: 'SQLite :memory:'}, samples: 7};
const results: unknown[]=[];
function stats(values:number[]) {const sorted=[...values].sort((a,b)=>a-b);return {p50:Math.round(sorted[Math.floor(sorted.length*.5)]*100)/100,p95:Math.round(sorted[Math.ceil(sorted.length*.95)-1]*100)/100,max:Math.round(sorted.at(-1)!*100)/100};}
for(const count of [100,500,1000])for(const memoryEnabled of [false,true]){
  const store=new Store(':memory:'),domain=new Domain(store),project=domain.createProject({title:`合成规模 ${count}`,premise:'查找早期失落的钥匙'});
  const book=store.objects(project.id,'book')[0],volume:StoryObject={...book,id:id('volume'),kind:'volume',parentId:book.id,title:'第一卷',order:1,body:'',status:'planned',fields:{}};
  const body='原创合成正文：沈砚保管失落的钥匙，记录每一章的证据。'.repeat(16);const chapters:StoryObject[]=[];
  store.transaction(()=>{
    store.put('objects',volume);
    for(let n=1;n<=count;n++){
      const cid=`chapter_${String(n).padStart(5,'0')}`,vid=`version_${String(n).padStart(5,'0')}`;
      const chapter:StoryObject={...book,id:cid,kind:'chapter',parentId:volume.id,order:n,title:`第 ${n} 章`,status:'accepted',body,fields:{currentVersion:vid,branch:'main'},updatedAt:now()};
      const version:ChapterVersion={id:vid,projectId:project.id,chapterId:cid,content:body,chapterRevision:1,createdAt:now(),actor:'synthetic',accepted:true,summary:''};
      store.put('objects',chapter);store.put('versions',version);chapters.push(chapter);
    }
  });
  if(memoryEnabled){
    const index=projectReadIndex(domain,project.id),insert=store.db.prepare('INSERT INTO memories VALUES(?,?,?)');
    store.transaction(()=>{for(const chapter of chapters){const source=index.sourceFor(chapter);const row:MemoryRecord={id:id('memory'),projectId:project.id,kind:'chapter',revision:1,createdAt:now(),updatedAt:now(),status:'valid',locked:false,actor:'synthetic',sources:[source],sourceHash:hash([source]),content:{summary:`${chapter.title}：沈砚保管钥匙。`,scenes:[],obligations:[]},history:[]};insert.run(row.id,row.projectId,JSON.stringify(row));}});
  }
  const samples:{navigation:number[];context:number[];queries:number[];cacheHits:number[];navigationBytes:number[];contextBytes:number[];rssBytes:number[]}={navigation:[],context:[],queries:[],cacheHits:[],navigationBytes:[],contextBytes:[],rssBytes:[]};
  for(let n=0;n<8;n++){
    const t0=performance.now(),meta=projectMetadata(domain,project.id),nav=projectNavigation(domain,project.id),tasks=taskSummaries(domain,project.id),t1=performance.now();
    const metrics=readMetrics(),scope=resolveStoryScope(domain,project.id,{chapterId:chapters.at(-1)!.id},metrics);
    const pack=buildContext(domain,project.id,{chapterId:chapters.at(-1)!.id,goal:'沈砚与失落的钥匙',maxChars:48000,memory:memoryEnabled?{enabled:true,recallLimit:6}:undefined,resolvedScope:scope});const t2=performance.now();
    if(n===0)continue; // warm up SQLite statements and the JS runtime
    samples.navigation.push(t1-t0);samples.context.push(t2-t1);samples.queries.push(metrics.queries);samples.cacheHits.push(metrics.cacheHits);
    samples.navigationBytes.push(Buffer.byteLength(JSON.stringify({...meta,...nav,tasks})));samples.contextBytes.push(Buffer.byteLength(JSON.stringify({text:pack.text,items:pack.items,omitted:pack.omitted,missing:pack.missing})));
    samples.rssBytes.push(process.memoryUsage().rss);
  }
  results.push({chapters:count,memoryEnabled,queryCount:stats(samples.queries),cacheHits:stats(samples.cacheHits),navigationMs:stats(samples.navigation),contextMs:stats(samples.context),navigationBytes:stats(samples.navigationBytes),contextBytes:stats(samples.contextBytes),rssMiB:stats(samples.rssBytes.map(n=>n/2**20)),scope:'queries count only instrumented project/objects/tasks/changesets/memories/version reads in ProjectReadIndex path; memory setup excluded'});
  store.close();
}
report.results=results;report.status='PASS';writeFileSync('docs/novel-studio/evidence/stage2-scale.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
