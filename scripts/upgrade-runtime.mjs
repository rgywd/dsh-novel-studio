import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const path=process.env.NOVEL_RUNTIME_EVIDENCE??'docs/novel-studio/evidence/upgrade-runtime';
const mode=process.argv[2];
if(!['capture','verify'].includes(mode))throw Error('Use capture before restarting the owned services, then verify.');
const api=async(port,path)=>{const response=await fetch(`http://127.0.0.1:${port}/api/novel-studio${path}`,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error(`HTTP ${response.status}: ${path}`);return response.json();};
const projects=[];
const sources=[];const includeSources=process.env.NOVEL_SOURCE_RUNTIME==='1';
for(const port of [4317,4318])for(const project of await api(port,'/projects')){
  const {payload,checksum}=await api(port,`/projects/${project.id}/backup`);
  if(payload.tasks.some(t=>['QUEUED','RUNNING','PAUSE_REQUESTED'].includes(t.status)))throw Error('Wait for safe task boundaries before runtime verification.');
  projects.push({port,id:project.id,revision:project.revision,checksum,objects:payload.objects.length,versions:payload.versions.length,tasks:payload.tasks.length,memories:payload.memories.length,requests:payload.requests.length,configurations:payload.configurations.length});
}
if(includeSources)for(const port of [4317,4318]){
  const works=await api(port,'/sources'),manifests=await api(port,'/manifests');
  const record=(kind,id,value)=>sources.push({port,kind,id,checksum:createHash('sha256').update(JSON.stringify(value)).digest('hex')});
  record('library','all',works);record('manifests','all',manifests);
  for(const w of works){
    record('analysis-requests',w.workspaceId,await api(port,`/projects/${w.workspaceId}/requests`));
    for(const v of w.versions)record('source-version',v.id,await api(port,`/source-versions/${v.id}`));
    for(const r of w.runs){
      const run=await api(port,`/source-runs/${r.id}`);
      if([run.task,...run.profiles].some(t=>['QUEUED','RUNNING','PAUSE_REQUESTED'].includes(t.status)))throw Error('Source analysis must also stop at a safe boundary.');
      record('analysis',r.id,{run,assets:await api(port,`/source-runs/${r.id}/export`),decisions:await api(port,`/source-runs/${r.id}/decisions`)});
    }
  }
}
if(mode==='capture'){await writeFile(path+'-before.json',JSON.stringify({at:new Date().toISOString(),projects,...includeSources?{sources}:{}},null,2));console.log('Captured',projects.length,'project checksums and',sources.length,'source records; no story content or credentials in receipt.');}
else{
  const before=JSON.parse(await readFile(path+'-before.json','utf8'));
  const checks=before.projects.map(p=>({...p,afterChecksum:projects.find(x=>x.id===p.id&&x.port===p.port)?.checksum,status:projects.some(x=>x.id===p.id&&x.port===p.port&&x.checksum===p.checksum)?'PASS':'FAIL'}));
  const sourceChecks=(before.sources??[]).map(s=>({...s,afterChecksum:sources.find(v=>v.port===s.port&&v.kind===s.kind&&v.id===s.id)?.checksum,status:sources.some(v=>v.port===s.port&&v.kind===s.kind&&v.id===s.id&&v.checksum===s.checksum)?'PASS':'FAIL'}));
  const status=checks.every(x=>x.status==='PASS')&&projects.length===before.projects.length&&sourceChecks.every(x=>x.status==='PASS')&&sources.length===(before.sources?.length??0)?'PASS':'FAIL';
  await writeFile(path+'.json',JSON.stringify({at:new Date().toISOString(),status,checks,...includeSources?{sourceChecks}:{}},null,2));console.log(status,checks.length,'complete projects and',sourceChecks.length,'source records across restart');if(status!=='PASS')process.exitCode=1;
}
