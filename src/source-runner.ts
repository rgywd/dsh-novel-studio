import type { Runner } from './runtime.js';
import { sourceGet,sourcePut,assetsAt,resolveEvidence } from './sources.js';
import { requireThat,DomainError,now } from './contracts.js';
import { hash } from './store.js';
import type { SourceSegment,SourceAsset,SourceRun } from './source-contracts.js';

export async function scanSource(runner:Runner,taskId:string){
 const domain=runner.domain,store=domain.store;
 const boundary=()=>{const t=store.get('tasks',taskId);requireThat(t.status==='RUNNING','STOPPED','来源任务已暂停或取消');domain.guard(t.projectId,t.expectedRevision);return t;};
 let t=boundary();const config=t.sourceScan!;let run=sourceGet(store,'source_runs',config.runId);const version=sourceGet(store,'source_versions',config.versionId),work=sourceGet(store,'source_works',run.workId);
 requireThat((t.kind==='source-profile'||run.taskId===t.id)&&run.versionId===config.versionId&&work.workspaceId===t.projectId,'SOURCE_SCOPE','任务来源快照不匹配');
 const persist=()=>{run.revision++;sourcePut(store,'source_runs',run);};
 if(t.kind==='source-profile'){
  requireThat(run.revision===config.analysisRevision,'STALE','来源分析或人工归并已更新，请重新选择档案范围');
  for(const assetId of config.profileIds??[]){
   boundary();const asset=assetsAt(domain,run.id).find(a=>a.id===assetId);requireThat(asset?.kind==='character','SOURCE_SCOPE','深入档案仅针对选定范围内角色');
   const evidence=asset.evidence.map(e=>({quote:e.quote,start:e.start,end:e.end,chapterId:e.chapterId,ordinal:e.ordinal}));
   const result=await runner.step(taskId,'档案-'+assetId,'sourceProfile',{asset:{id:asset.id,name:asset.name,identity:asset.identity},evidence,scope:{versionId:version.id,runId:run.id,cutoff:run.cutoff,analysisRevision:config.analysisRevision}},output=>{for(const e of output.evidence)requireThat(evidence.some(x=>x.quote.includes(e.quote)),'SOURCE_EVIDENCE','档案引用必须在所选角色的允许证据内');return output;});
   boundary();requireThat(sourceGet(store,'source_runs',run.id).revision===config.analysisRevision,'STALE','晚到档案依赖的分析已失效');
   sourcePut(store,'source_decisions',{id:'profile_'+hash([t.id,assetId]),workId:work.id,versionId:version.id,runId:run.id,assetId,ordinal:run.cutoff,action:'profile',profile:result,createdAt:now(),taskId:t.id});
   store.event(t.projectId,t.id,'source.profile','所选角色档案已保存，不覆盖其他截止点或人工决定',{assetId});
  }return;
 }
 const split=(segment:SourceSegment)=>{
  requireThat(segment.end-segment.start>120&&segment.depth<10,'SOURCE_DENSE_GAP','片段达到单批容量，已保留未完成范围；请校正拆分或调整单批大小');
  const midpoint=Math.floor((segment.start+segment.end)/2);const text=version.raw;let at=midpoint;
  for(let d=0;d<Math.min(180,Math.floor((segment.end-segment.start)/4));d++)if(/[。；;\n]/u.test(text[midpoint+d])){at=midpoint+d+1;break;}
  segment.state='split';for(const [start,end] of [[segment.start,at],[Math.max(segment.start,at-60),segment.end]])run.segments.push({id:`segment-${segment.chapterId}-${start}-${end}`,chapterId:segment.chapterId,start,end,depth:segment.depth+1,state:'pending'});
  persist();store.event(t.projectId,t.id,'source.split','本段达到单批容量，拆成更小范围继续；未宣称覆盖完成',{segmentId:segment.id});
 };
 while(true){
  t=boundary();run=sourceGet(store,'source_runs',config.runId);const segment=run.segments.find(s=>!['complete','split'].includes(s.state));if(!segment)break;
  const chapter=version.chapters.find(c=>c.id===segment.chapterId)!;requireThat(chapter.ordinal<=run.cutoff&&!chapter.excluded,'SOURCE_SCOPE','片段超出允许的截止范围');
  const text=version.raw.slice(segment.start,segment.end);
  const known=assetsAt(domain,run.id,chapter.ordinal).filter(a=>['character','world'].includes(a.kind)&&a.evidence.some(e=>e.start<segment.start)&&[a.name,...a.aliases].some(n=>n&&text.includes(n))).sort((a,b)=>a.id.localeCompare(b.id));
  const registry=known.slice(0,32).map(a=>({id:a.id,key:a.key,name:a.name,kind:a.kind,identity:a.identity,aliases:a.aliases}));
  const scope={workId:work.id,versionId:version.id,sourceHash:version.hash,runId:run.id,cutoff:run.cutoff,chapterId:chapter.id,ordinal:chapter.ordinal,segmentId:segment.id,start:segment.start,end:segment.end,analysisVersion:run.analysisVersion,registryHash:hash(registry)};
  store.event(t.projectId,t.id,'source.scanning',`扫描 ${chapter.title} · ${segment.start}–${segment.end}`,scope);
  try{
   const discovered=segment.discovery??await runner.step(taskId,'发现-'+segment.id,'sourceDiscover',{scope,text,registry,batchSize:config.batchSize,registryOmitted:Math.max(0,known.length-registry.length)},o=>{for(const e of o.entities)resolveEvidence(version,segment,e.evidence,run.id);return o;});
   boundary();if(discovered.saturated||discovered.entities.length>=config.batchSize){split(segment);continue;}
   segment.discovery=discovered;segment.state='discovered';persist();
   const extraction=await runner.step(taskId,'整理-'+segment.id,'sourceExtract',{scope,text,registry,entities:discovered.entities,batchSize:Math.min(48,config.batchSize*2)},o=>{for(const e of o.items)resolveEvidence(version,segment,e.evidence,run.id);return o;});
   boundary();if(extraction.saturated||extraction.items.length>=Math.min(48,config.batchSize*2)){split(segment);continue;}
   const entities=discovered.entities.map((e:any)=>({...e,description:'',fields:{identity:e.identity,aliases:e.aliases},refs:{}}));
   const available=new Set([...registry.map(x=>x.id),...registry.map(x=>x.key),...entities.map((x:any)=>x.key),...extraction.items.map((x:any)=>x.key)]);
   for(const e of extraction.items)for(const ref of Object.values(e.refs).flat())requireThat(available.has(String(ref)),'SOURCE_REFERENCE','抽取引用无法定位到本片段或已有前缀实体；保存缺口而不生成悬空引用');
   const records:SourceAsset[]=[...entities,...extraction.items].map((x:any)=>{const evidence=resolveEvidence(version,segment,x.evidence,run.id),discovery=entities.find((e:any)=>e.key===x.key&&e.kind===x.kind);return {id:'asset_'+hash([run.id,x.kind,x.key,evidence.start,evidence.end]).slice(0,32),workId:work.id,versionId:version.id,runId:run.id,revision:1,key:x.key,kind:x.kind,name:x.name,identity:x.identity??x.fields.identity??discovery?.identity??'',aliases:x.aliases??x.fields.aliases??discovery?.aliases??[],description:x.description??'',fields:{...discovery?.fields,...x.fields},refs:x.refs,evidence:[evidence],status:evidence.inference||!['objective','knowledge'].includes(evidence.modality)?'unverified':'verified',manual:false};});
   store.transaction(()=>{boundary();for(const a of records)sourcePut(store,'source_assets',a);segment.state='complete';segment.error=undefined;segment.summary=extraction.summary;persist();store.event(t.projectId,t.id,'source.covered',`${chapter.title} 当前片段已保存；发现不等于保证语义全召回`,{segmentId:segment.id,entities:discovered.entities.length,items:extraction.items.length});});
  }catch(error){const latest=sourceGet(store,'source_runs',run.id);const s=latest.segments.find(s=>s.id===segment.id)!;if(!['complete','split'].includes(s.state)){s.error=error instanceof Error?error.message:'处理失败';sourcePut(store,'source_runs',latest);}throw error;}
 }
 store.event(t.projectId,t.id,'source.ready','允许范围的全部片段已处理；请在继承预览中处理歧义并创建作品',{runId:run.id,segments:run.segments.filter(s=>s.state==='complete').length,assets:assetsAt(domain,run.id).length});
}
