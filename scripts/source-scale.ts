import { performance } from 'node:perf_hooks';
import { cpus,platform,arch,totalmem } from 'node:os';
import { writeFileSync } from 'node:fs';
import { Store } from '../src/store.js';
import { Domain } from '../src/domain.js';
import { createSource,startSourceRun,sourcePut,sourceAssetPage,sourceGraph } from '../src/sources.js';

// Metadata performance only. Extraction recall uses the separate 60-chapter HTTP test.
const store=new Store(':memory:'),domain=new Domain(store);
const {work,version}=createSource(domain,{title:'千级元数据性能Fixture',files:[{name:'scale.txt',raw:'这是用于列表性能测试的原创合成元数据。'}]});
const run=startSourceRun(domain,work.id,{versionId:version.id,boundary:{kind:'all-materials',id:null},provider:'demo'}).run;
store.transaction(()=>{for(let n=1;n<=1000;n++)sourcePut(store,'source_assets',{id:'scale-'+n,workId:work.id,versionId:version.id,runId:run.id,revision:1,key:'person-'+n,kind:'character',name:'测试人物'+n,identity:'列表规模用例'+n,aliases:['别名'+n],description:'元数据性能Fixture，不是模型抽取结果',fields:{group:'组'+n%10},refs:{},evidence:[{quote:version.raw,versionId:version.id,chapterId:version.chapters[0].id,ordinal:1,start:0,end:version.raw.length,runId:run.id,modality:'objective',inference:false,storyTime:'未知',knownBy:[]}],status:'verified',manual:false});});
const samples:Record<string,number[]>={page:[],search:[],allSelection:[],graph:[]};let result:any;
for(let n=0;n<12;n++)for(const [name,fn] of Object.entries({page:()=>sourceAssetPage(domain,run.id,new URLSearchParams({offset:'960',limit:'40'})),search:()=>sourceAssetPage(domain,run.id,new URLSearchParams({q:'别名1000'})),allSelection:()=>sourceAssetPage(domain,run.id,new URLSearchParams({allIds:'true'})),graph:()=>sourceGraph(domain,run.id,new URLSearchParams({q:'测试人物1000'}))})){const t=performance.now();result=fn();samples[name].push(performance.now()-t);}
const selected=sourceAssetPage(domain,run.id,new URLSearchParams({allIds:'true'}));const report={at:new Date().toISOString(),status:selected.total===1000&&selected.allIds?.length===1000&&result.characters.some((c:any)=>c.id==='scale-1000')?'PASS':'FAIL',fixture:'1000 directly seeded synthetic metadata rows; NOT an extraction benchmark',device:{cpu:cpus()[0].model,threads:cpus().length,platform:platform(),arch:arch(),ramGiB:Math.round(totalmem()/2**30),node:process.version},entities:selected.total,pageLimit:40,graphLimit:30,measurements:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,{medianMs:Math.round([...v].sort((a,b)=>a-b)[6]*100)/100,maxMs:Math.round(Math.max(...v)*100)/100,samples:v.length}]))};
writeFileSync('docs/novel-studio/evidence/source-scale.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));store.close();
