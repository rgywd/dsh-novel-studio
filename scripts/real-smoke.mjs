import { writeFile,mkdir,readFile } from 'node:fs/promises';
const base=process.env.NOVEL_STUDIO_URL??'http://127.0.0.1:4318';
const evidence='docs/novel-studio/evidence/real-smoke.json';
const report=process.argv.includes('--continue')?JSON.parse(await readFile(evidence,'utf8')):{at:new Date().toISOString(),base,status:'RUNNING',checks:[],tasks:[]};
report.status='RUNNING';delete report.error;
const call=async(path,body,method='POST')=>{const r=await fetch(base+'/api/novel-studio'+path,body===undefined?{}:{method,headers:{'Content-Type':'application/json','X-Novel-Studio':'1'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error?.message??'HTTP '+r.status);return data;};
await mkdir('docs/novel-studio/evidence',{recursive:true});
const persist=()=>writeFile(evidence,JSON.stringify(report,null,2));
async function runTask(projectId,input){const existing=report.projectId?(await call(`/projects/${projectId}`)).tasks.filter(t=>t.kind===input.kind&&t.goal===input.goal).at(-1):undefined; if(existing?.status==='COMPLETED')return call(`/projects/${projectId}/tasks/${existing.id}`); const created=existing?await call(`/projects/${projectId}/tasks/${existing.id}/${existing.expectedRevision===(await call(`/projects/${projectId}`)).project.revision?"resume":"redelegate"}`,{}):await call(`/projects/${projectId}/tasks`,{provider:'dsh',autoAccept:true,budget:{calls:16,outputTokens:60000,contextChars:18000},targetWords:1200,...input});console.log(`Real task ${created.id} ${input.kind}`);for(let n=0;n<600;n++){const task=await call(`/projects/${projectId}/tasks/${created.id}`);if(!['QUEUED','RUNNING','PAUSE_REQUESTED'].includes(task.status)){report.tasks.push({id:task.id,kind:task.kind,status:task.status,usage:task.usage,error:task.error,steps:task.steps.map(s=>({name:s.name,status:s.status,attempts:s.attempts,inputRevision:s.inputRevision,usage:s.usage}))});await persist();if(task.status!=='COMPLETED')throw Error(`${task.status}: ${task.error?.code} ${task.error?.message}`);return task;}await new Promise(r=>setTimeout(r,1000));}throw Error('Smoke wait exceeded 10 minutes; inspect persisted task.');}
try{
  const health=await call('/health');report.model=health.dsh;console.log('DSH model:',health.dsh.name);if(!health.dsh.available)throw Error('MODEL_UNAVAILABLE');
  const project=report.projectId?(await call(`/projects/${report.projectId}`)).project:await call('/projects',{title:'纸灯与归信 · 真实 AI 验收',premise:'沈砚是雾港邮差，闻溪是修灯匠。蓝色信封只能由一个人保管。两人调查失踪街道；不揭露导师真实身份。',constraints:['不能揭露导师真实身份','不新增核心角色','已接受正文只能由作者明确接管后修改']});report.projectId=project.id;await persist();
  await runTask(project.id,{kind:'bootstrap',goal:'以沈砚与闻溪为仅有核心角色、雾港为舞台开书；把蓝色信封建立为唯一物品世界节点，给出两种方向后选择一项。准备三章未来章纲，第一章由沈砚保管信封，不能出现移交闻溪的事件。每个章对象 body 留空。'});
  report.checks.push({name:'real_bootstrap',status:'PASS'});await persist();
  const first=await runTask(project.id,{kind:'write',goal:'写完整第一章，约1200字；蓝色信封始终由沈砚保管，不能交出，不能揭露导师身份。',count:1});
  let snapshot=await call(`/projects/${project.id}`);let chapter=snapshot.objects.find(o=>o.id===first.artifacts.find(a=>a.type==='chapter'&&a.status==='accepted').chapterId);
  if(!report.checks.some(c=>c.name==='author_takeover_new_version'&&c.status==='PASS')){
  const oldVersion=chapter.fields.currentVersion;
  chapter=await call(`/projects/${project.id}/objects/${chapter.id}/takeover`,{revision:chapter.revision});
  const handoff='\n\n走出邮局之前，沈砚把唯一的蓝色信封交给了闻溪。闻溪把信封收进内袋，约定由她保管到次日清晨。沈砚手中已经没有信封。';
  chapter=await call(`/projects/${project.id}/objects/${chapter.id}/body`,{revision:chapter.revision,body:chapter.body+handoff});
  report.checks.push({name:'author_takeover_new_version',status:chapter.fields.currentVersion!==oldVersion?'PASS':'FAIL',chapterId:chapter.id,oldVersion,newVersion:chapter.fields.currentVersion});await persist();
  }
  if(!report.checks.some(c=>c.name==='author_transfer_rule'&&c.status==='PASS')){
    const state=await call(`/projects/${project.id}`);const item=state.objects.find(o=>o.kind==='world'&&o.title.includes('蓝色信封'));
    if(!item)throw Error('Bootstrap did not create the required envelope entity');
    const {id,projectId,revision,updatedAt,...input}=item;
    const rule='蓝色信封是唯一物品，不可拆开或复制。允许当面转交；任何时刻只有一个保管人，转交后原保管人不再拥有它。';
    const updated=await call(`/projects/${project.id}/objects/${item.id}`,{revision:item.revision,object:{...input,body:rule,fields:{...input.fields,rule},source:{type:'user',quote:rule,time:'作者接管第一章时的明确设定'}}},'PATCH');
    report.checks.push({name:'author_transfer_rule',status:'PASS',entityId:item.id,oldRevision:item.revision,newRevision:updated.revision,reason:'Author explicitly establishes transferable single ownership; preserves the original bootstrap rule in history.'});await persist();
  }
  if(!report.checks.some(c=>c.name==='author_handoff_clarified'&&c.status==='PASS')){
    const before='走出邮局之前，沈砚把唯一的蓝色信封交给了闻溪。闻溪把信封收进内袋，约定由她保管到次日清晨。沈砚手中已经没有信封。';
    const after='走出邮局之前，闻溪提着修灯工具箱来到分拣台旁。沈砚改变了独自保管的决定，解开邮袋，沿内衬的旧缝摸到蓝色信封，将它完整抽了出来。“我要去找那条街，你替我守住这封信。”他说。随后，他把唯一的蓝色信封当面交给闻溪。闻溪把信封收进内袋，答应由她保管到次日清晨。沈砚摸了摸已经空掉的邮袋夹层，确认信封已经不在自己身上。';
    if(!chapter.body.includes(before))throw Error('The original author handoff paragraph has changed; inspect before continuing.');
    const oldVersion=chapter.fields.currentVersion;chapter=await call(`/projects/${project.id}/objects/${chapter.id}/body`,{revision:chapter.revision,body:chapter.body.replace(before,after)});
    report.checks.push({name:'author_handoff_clarified',status:'PASS',oldVersion,newVersion:chapter.fields.currentVersion,reason:'Author makes retrieval from the bag and the recipient arrival explicit after inspecting the AI review.'});await persist();
  }
  const second=await runTask(project.id,{kind:'write',goal:'紧接上一章的当晚创作第二章，约1200字。必须从作者刚修改的最新正文继续：蓝色信封由闻溪保管至次日清晨，沈砚手上没有信封。不能新造第二个信封，也不能让信封在本章转交。用这一限制推动两人的合作，不要复述上一章。',count:1});
  const artifact=await call(`/projects/${project.id}/artifacts/${second.artifacts.find(a=>a.type==='chapter'&&a.status==='accepted').id}`);
  const inherits=artifact.data.context.items.some(i=>i.version===chapter.fields.currentVersion);report.checks.push({name:'second_chapter_current_context',status:inherits?'PASS':'FAIL',usedVersion:chapter.fields.currentVersion,artifactId:artifact.id});await persist();
  if(!inherits)throw Error('Second chapter context does not reference author version');
  const batch=await runTask(project.id,{kind:'write',goal:'继续两章，每章约4000字，完整展开雾港失踪街道调查。保留已有核心角色和世界规则，不揭露导师身份；承接最新事实，用具体行动、场景转折和对白推进，绝不用重复凑字。',count:2,targetWords:4000,budget:{calls:18,outputTokens:100000,contextChars:18000}});
  const arts=await Promise.all(batch.artifacts.filter(a=>a.type==='chapter'&&a.status==='accepted').map(a=>call(`/projects/${project.id}/artifacts/${a.id}`)));
  const words=arts.map(a=>(a.data.content.match(/\p{Script=Han}|[\p{Script=Latin}\p{N}]+/gu)??[]).length);
  report.checks.push({name:'finite_4000_word_two_chapter_batch',status:words.length===2&&words.every(w=>w>=3000)?'PASS':'FAIL',words,usage:batch.usage});
  report.status=report.checks.every(c=>c.status==='PASS')?'PASS':'FAIL';
}catch(e){report.status=String(e.message).includes('MODEL_UNAVAILABLE')?'BLOCKED':'FAIL';report.error=e.message;console.log('Smoke stopped:',e.message);}
await persist();console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='PASS'?0:1;
