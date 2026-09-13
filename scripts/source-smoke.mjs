import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root='http://127.0.0.1:4318/api/novel-studio',path='docs/novel-studio/evidence/source-real.json';
const api=async(p,body)=>{const r=await fetch(root+p,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Novel-Studio':'1'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error?.code+': '+v.error?.message);return v;};
const report=JSON.parse(await readFile(path,'utf8').catch(()=>JSON.stringify({at:new Date().toISOString(),status:'RUNNING',workId:'source_7a667157-8c93-49e5-af20-910906b722a0',versionId:'sourceversion_15e7babd-f4c3-4bcf-a31b-fea1290c336e',runId:'scan_dbc256bf-9e2a-4910-969e-e930fdc18330',tasks:{},checks:[],manualDecisions:[]})));
const save=()=>writeFile(path,JSON.stringify(report,null,2)),sha=s=>createHash('sha256').update(s).digest('hex');
const names=Array.from({length:24},(_,i)=>'岑唐陆'[Math.floor(i/8)]+['初禾','见川','知夏','怀舟','予安','清越','照野','南星'][i%8]);
const state=()=>api(`/source-runs/${report.runId}`),assets=async()=>(await api(`/source-runs/${report.runId}/assets?limit=200`)).items;
const check=(name,pass,evidence)=>{report.checks=report.checks.filter(x=>x.name!==name).concat({name,status:pass?'PASS':'FAIL',...evidence});};
const command=process.argv[2]??'capture';
try{
 let s=await state(),a=await assets(),v=await api(`/source-versions/${report.versionId}`);
 if(!report.rawExtraction)report.rawExtraction={knownNames:names,recalled:names.filter(n=>a.some(x=>x.kind==='character'&&x.name===n)),missing:names.filter(n=>!a.some(x=>x.kind==='character'&&x.name===n)),characterCandidates:a.filter(x=>x.kind==='character').length,extraCandidates:a.filter(x=>x.kind==='character'&&!names.includes(x.name)).map(x=>({id:x.id,name:x.name,identity:x.identity})),duplicateIdentityGroups:names.map(name=>({name,count:a.filter(x=>x.kind==='character'&&x.name===name).length})).filter(x=>x.count>1),limitations:'具名24人已发现；同人重复档案和群体误分类需要人工消歧。不是模型保证全召回。',priorFailure:{code:'SCHEMA',covered:5,segments:6,calls:17,reason:'最后一次整理连续3次返回末尾多一个闭合符；原始响应和有效片段保留，有限语法修复后显式重新委派，仅重跑未完成步骤。'}};
 if(command==='prepare'&&!report.manifestId){
  // Explicit author decisions for this original fixture, supported by matching duties and chapter evidence.
  for(const name of [...names,'潮门','铜钥匙']){
   const group=(await assets()).filter(x=>x.name===name&&['character','world'].includes(x.kind));if(group.length<2)continue;const target=group[0];
   for(const entry of group.slice(1)){s=await state();const d=await api(`/source-runs/${report.runId}/decisions`,{assetId:entry.id,targetId:target.id,action:'merge',ordinal:3,reason:`原创验收作者核对第1至3章：${name}的职责、物件和连续行为是同一实体，没有替身或同名角色。`,revision:s.run.revision});report.manualDecisions.push({id:d.id,name,from:entry.id,to:target.id});await save();}
  }
  a=await assets();const selection=Object.fromEntries(a.filter(x=>x.status!=='verified').map(x=>[x.id,{mode:'omit'}]));for(const x of a.filter(x=>x.kind==='character'&&!names.includes(x.name)))selection[x.id]={mode:'background'};
  const spec={versionId:v.id,runId:report.runId,title:'潮门之后 · 原作接续验收',mode:'continuation',template:'canonical',boundary:{kind:'after-chapter',id:v.chapters[2].id},goal:'从第三章窗外第一声铜铃后接写。岑初禾、陆初禾和陆见川核对离港时间，找回缺页线索。保留三人的职责、语言习惯与已完成钥匙交接，不继承第4、5章。',selection};
  const m=await api('/manifests',spec);report.manifestId=m.manifest.id;report.preview={selected:m.preview.selected.length,pending:m.preview.pending,conflicts:m.preview.conflicts,background:m.preview.selected.filter(x=>x.mode==='background').length};await save();
 }
 if(command==='activate'&&!report.projectId){if(!report.manifestId)throw Error('先准备清单');const m=await api(`/manifests/${report.manifestId}`);const p=await api(`/manifests/${report.manifestId}/activate`,{revision:m.manifest.revision});report.projectId=p.id;await save();}
 s=await state();a=await assets();report.scan={taskId:s.task.id,status:s.task.status,cutoff:s.run.cutoff,covered:s.covered,segments:s.segments,usage:s.task.usage,budget:s.task.budget,revision:s.run.revision,assets:a.length};
 const requests=await api(`/projects/${s.task.projectId}/requests`);report.requests=[];
 for(const r of requests){const full=await api(`/projects/${s.task.projectId}/requests/${r.id}`);report.requests.push({...r,observedHash:sha(JSON.stringify(full.observed)),syntaxRepair:full.syntaxRepair,forbiddenInRequest:['白礁客','沉钟密约','唐南星在决堤中死亡'].filter(t=>JSON.stringify(full.observed).includes(t)),scope:JSON.parse(full.compiled.blocks.find(b=>b.id==='task').text).scope,rawResponseHash:sha(full.rawResponse??'')});}
 check('actual_source_requests_prefix',report.requests.every(r=>!r.forbiddenInRequest.length),{requests:report.requests.length,excludedSourceChapters:[4,5]});
 check('known_character_recall_over_16',names.every(n=>a.some(x=>x.kind==='character'&&x.name===n)),{expected:24,recalled:names.filter(n=>a.some(x=>x.kind==='character'&&x.name===n)).length});
 const invalid=a.flatMap(x=>x.evidence.filter(e=>v.raw.slice(e.start,e.end)!==e.quote));check('source_evidence_exact',invalid.length===0,{quotes:a.reduce((n,x)=>n+x.evidence.length,0),invalid:invalid.length});
 check('source_original_read_only',v.raw===await readFile('test/fixtures/source-real.md','utf8'),{sourceHash:v.hash});
 if(report.projectId){
  const p=await api(`/projects/${report.projectId}`),prefix=`/projects/${report.projectId}`,mem=await api(prefix+'/memories'),list=await api(prefix+'/requests');
  const records=await Promise.all(list.map(r=>api(prefix+'/requests/'+r.id)));
  report.branch={revision:p.project.revision,lineage:p.project.lineage,chapters:[],memories:{total:mem.total,covered:mem.covered,gaps:mem.gaps,records:mem.memories.map(m=>({id:m.id,status:m.status,sources:m.sources,sourceHash:m.sourceHash}))},tasks:p.tasks.map(t=>({id:t.id,kind:t.kind,status:t.status,usage:t.usage,budget:t.budget,error:t.error,configHash:t.configSnapshot.hash,steps:t.steps.map(s=>({name:s.name,status:s.status,inputHash:s.inputHash,attempts:s.attempts,requestIds:s.requestIds,error:s.error}))})),requests:records.map(r=>({id:r.id,taskId:r.taskId,role:r.compiled.role,status:r.status,usage:r.usage,error:r.error,provider:r.observed?.provider,model:r.observed?.model,hash:r.compiled.hash,stableHash:r.compiled.stableHash,configHash:r.compiled.config.hash,localCompilationCache:r.compiled.localCompilationCache,localPrefixReuse:r.localPrefixReuse,observedHash:sha(JSON.stringify(r.observed)),diff:r.diff,context:r.compiled.context?.items.map(i=>({id:i.id,kind:i.kind,version:i.version,reason:i.reason})),rawHash:sha(r.rawResponse??''),candidateHash:sha(r.candidate??''),transformations:r.transformations?.map(t=>({id:t.id,stage:t.stage,matches:t.matches.length,elapsedMs:t.elapsedMs,error:t.error})),forbidden:['白礁客','沉钟密约','唐南星在决堤中死亡'].filter(t=>JSON.stringify(r.observed).includes(t))}))};
  const count=text=>(text.match(/[\p{Script=Han}]|[\p{L}\p{N}]+/gu)??[]).length;
  const samples=['# 原创原作接续：真实可读样本','源材料：test/fixtures/source-real.md，原创24人、5章；只继承第1–3章。DSH deepseek-official / deepseek-flash。以下原始生成与作者修订均保留，文学质量判断来自完整阅读。'];
  for(const c of p.objects.filter(o=>o.kind==='chapter'&&!o.fields.referenceOnly)){
   const versions=await api(`${prefix}/objects/${c.id}/versions`);report.branch.chapters.push({id:c.id,title:c.title,status:c.status,words:count(c.body),currentVersion:c.fields.currentVersion,summaryVersion:c.fields.summaryVersion,extractionPending:c.fields.extractionPending,contentHash:sha(c.body),versions:versions.map(v=>({id:v.id,actor:v.actor,words:count(v.content),hash:sha(v.content)}))});
   const writer=records.find(r=>r.compiled.role==='Writer'&&r.compiled.context?.chapterId===c.id);if(writer)samples.push('## '+c.title+' · 原始模型响应',writer.rawResponse??'','## '+c.title+' · 生成后规则处理',writer.candidate??'');samples.push('## '+c.title+' · 当前已接受版本',c.body);
  }
  await writeFile('docs/novel-studio/evidence/source-real-samples.md',samples.join('\n\n'));
  const second=p.tasks.find(t=>t.id==='task_6e33fa3c-d4d7-4626-a591-dd35310685b7'),written=records.find(r=>r.taskId===second?.id&&r.compiled.role==='Writer'),refresh=records.find(r=>r.taskId===second?.id&&r.stepKey.includes('同步作者最新正文'));
  check('author_version_enters_second_request',!!written?.compiled.context?.items.some(i=>i.version==='version_152189ba-2757-487e-8b07-e371c3a0d92b')&&JSON.stringify(written.observed).includes('铜钥匙由陆初禾交还岑初禾'),{requestId:written?.id,refreshId:refresh?.id,authorVersion:'version_152189ba-2757-487e-8b07-e371c3a0d92b'});
  check('branch_requests_exclude_future',report.branch.requests.every(r=>!r.forbidden.length),{count:records.length});
  check('memory_same_accepted_versions',mem.gaps.length===0&&report.branch.chapters.every(c=>c.currentVersion===c.summaryVersion&&!c.extractionPending),{covered:mem.covered,total:mem.total});
  check('two_source_continuations',!!second&&second.status==='COMPLETED'&&report.branch.chapters.length===2&&report.branch.chapters.every(c=>c.status==='accepted'),{secondTask:second?.id});
  const allRequests=[...report.requests,...report.branch.requests],reported=allRequests.filter(r=>r.usage?.serverCache==='REPORTED');report.cache={requests:allRequests.length,reported:reported.length,positiveReads:reported.filter(r=>r.usage.cacheReadTokens>0).length,readTokens:reported.reduce((n,r)=>n+(r.usage.cacheReadTokens??0),0),writeTokens:allRequests.some(r=>r.usage?.cacheWriteTokens!==undefined)?allRequests.reduce((n,r)=>n+(r.usage?.cacheWriteTokens??0),0):'UNKNOWN',cost:'UNKNOWN',meaning:'实际DSH提供方usage，含失败/重试，不是固定负载命中率；本地编译复用单独记录。'};
 }
 if(report.branch&&report.humanReview){const fresh=report.branch.chapters.every(c=>report.humanReview.chapterHashes[c.id]===c.contentHash);check('human_review_matches_current_text',fresh,{method:report.humanReview.method});report.status=report.checks.every(c=>c.status==='PASS')&&report.humanReview.status==='PASS'?'PASS':'FAIL';}
 await save();console.log(JSON.stringify({command,status:report.status,projectId:report.projectId,manifest:report.manifestId,scan:report.scan,preview:report.preview,checks:report.checks},null,2));
}catch(error){report.error=error.message;await save();console.error(error.message);process.exitCode=1;}
