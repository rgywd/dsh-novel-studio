import { readFile,writeFile } from 'node:fs/promises';
const path='docs/novel-studio/evidence/upgrade-runtime';
const mode=process.argv[2];
if(!['capture','verify'].includes(mode))throw Error('Use capture before restarting the owned services, then verify.');
const api=async(port,path)=>{const response=await fetch(`http://127.0.0.1:${port}/api/novel-studio${path}`,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error(`HTTP ${response.status}: ${path}`);return response.json();};
const projects=[];
for(const port of [4317,4318])for(const project of await api(port,'/projects')){
  const {payload,checksum}=await api(port,`/projects/${project.id}/backup`);
  if(payload.tasks.some(t=>['QUEUED','RUNNING','PAUSE_REQUESTED'].includes(t.status)))throw Error('Wait for safe task boundaries before runtime verification.');
  projects.push({port,id:project.id,revision:project.revision,checksum,objects:payload.objects.length,versions:payload.versions.length,tasks:payload.tasks.length,memories:payload.memories.length,requests:payload.requests.length,configurations:payload.configurations.length});
}
if(mode==='capture'){await writeFile(path+'-before.json',JSON.stringify({at:new Date().toISOString(),projects},null,2));console.log('Captured',projects.length,'project checksums; no story content or credentials in receipt.');}
else{
  const before=JSON.parse(await readFile(path+'-before.json','utf8'));
  const checks=before.projects.map(p=>({...p,afterChecksum:projects.find(x=>x.id===p.id&&x.port===p.port)?.checksum,status:projects.some(x=>x.id===p.id&&x.port===p.port&&x.checksum===p.checksum)?'PASS':'FAIL'}));
  const status=checks.every(x=>x.status==='PASS')&&projects.length===before.projects.length?'PASS':'FAIL';
  await writeFile(path+'.json',JSON.stringify({at:new Date().toISOString(),status,checks},null,2));console.log(status,checks.length,'projects include complete core/version/config/memory/request/changeset/import payloads');if(status!=='PASS')process.exitCode=1;
}
