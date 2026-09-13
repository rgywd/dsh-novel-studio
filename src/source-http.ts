import { z } from 'zod';
import { listConfigs } from './config.js';
import type { Domain } from './domain.js';
import type { Runner } from './runtime.js';
import { createSource,sourceGet,sourceList,sourcePut,parseSource,addSourceVersion,correctDirectory,startSourceRun,sourceRunStatus,sourceAssetPage,sourceGraph,assetsAt } from './sources.js';
import { saveManifest,previewInheritance,activateManifest } from './inheritance.js';
import { id,now,requireThat,DomainError,activeStatuses } from './contracts.js';
export async function sourceRoute(domain:Domain,runner:Runner,method:string,parts:string[],body:any,query:URLSearchParams){
 const [group,key,action]=parts,store=domain.store;
 if(group==='sources'&&!key){if(method==='GET')return sourceList(store,'source_works').map(w=>({...w,versions:sourceList(store,'source_versions').filter(v=>v.workId===w.id).map(({raw,originalBase64,...v})=>({...v,materials:v.materials.map(({originalBase64,...m})=>m)})),runs:sourceList(store,'source_runs').filter(r=>r.workId===w.id).map(r=>({id:r.id,taskId:r.taskId,versionId:r.versionId,cutoff:r.cutoff,status:domain.task(w.workspaceId,r.taskId).status}))}));if(method==='POST')return createSource(domain,body);}
 if(group==='sources'&&key==='configurations'&&method==='GET')return listConfigs(store).map(v=>({id:v.id,name:v.name,applicable:v.applicable}));
 if(group==='sources'&&key==='preview'&&method==='POST')return parseSource(body);
 if(group==='sources'&&key){const work=sourceGet(store,'source_works',key);
  if(action==='versions'&&method==='POST')return addSourceVersion(domain,key,body.source,z.number().int().parse(body.revision));
  if(action==='runs'&&method==='POST'){const result=startSourceRun(domain,key,body);runner.start(result.task.id);return result;}
  if(action==='archive'&&method==='POST'){requireThat(work.revision===body.revision,'STALE','来源已更新');work.archived=!!body.archived;work.revision++;return sourcePut(store,'source_works',work);}
  if(method==='DELETE'){requireThat(!store.list('projects').some(p=>p.lineage?.workId===key),'SOURCE_REFERENCED','仍有衍生作品引用此来源，只能归档；不会级联删除作品');requireThat(!sourceList(store,'source_runs').some(r=>r.workId===key&&activeStatuses.includes(domain.task(work.workspaceId,r.taskId).status)),'SOURCE_BUSY','先暂停或取消来源分析');store.transaction(()=>{for(const table of ['import_manifests','source_decisions','source_assets','source_runs','source_versions'])store.db.prepare(`DELETE FROM ${table} WHERE workId=?`).run(key);store.db.prepare('DELETE FROM source_works WHERE id=?').run(key);const p=domain.project(work.workspaceId);p.archived=true;store.put('projects',p);});return {deleted:true};}
 }
 if(group==='source-versions'&&key){const version=sourceGet(store,'source_versions',key);if(method==='GET'&&!action)return version;if(method==='POST'&&action==='directory')return correctDirectory(domain,key,body.chapters);if(method==='GET'&&action==='diff'){const other=sourceGet(store,'source_versions',z.string().parse(query.get('against')));requireThat(other.workId===version.workId,'SOURCE_SCOPE','只能比较同一来源版本');return {before:other.id,after:version.id,sourceChanged:other.hash!==version.hash,chapters:version.chapters.map((c,n)=>({id:c.id,title:c.title,changed:version.raw.slice(c.start,c.end)!==other.raw.slice(other.chapters[n]?.start??0,other.chapters[n]?.end??0)})),message:'既有分支仍绑定旧版本；更新仅是建议，建立新继承清单或副本后再选择采用。'};}}
 if(group==='source-runs'&&key){const run=sourceGet(store,'source_runs',key),work=sourceGet(store,'source_works',run.workId),task=domain.task(work.workspaceId,run.taskId);
  if(method==='GET'&&!action)return sourceRunStatus(domain,key);
  if(method==='POST'&&action==='profiles'){const ids=z.array(z.string()).min(1).parse(body.ids);const allowed=assetsAt(domain,key);requireThat(ids.every(id=>allowed.some(a=>a.id===id&&a.kind==='character')),'SOURCE_SCOPE','所选角色不在本次截止范围内');requireThat(body.cloudAuthorized===true,'SOURCE_CONSENT','深入档案需要明确发送证据的授权');const t=domain.createTask(work.workspaceId,{kind:'source-profile',goal:'仅补充所选角色的有证据档案',provider:'dsh',budget:body.budget??{calls:6,outputTokens:20000,contextChars:36000},sourceScan:{...task.sourceScan,profileIds:ids,analysisRevision:run.revision},configuration:{patch:{enabled:false}}});runner.start(t.id);return t;}
  if(method==='POST'&&action==='profile-control'){const t=domain.task(work.workspaceId,z.string().parse(body.taskId));requireThat(t.kind==='source-profile'&&t.sourceScan?.runId===run.id,'SOURCE_SCOPE','档案任务不属于本分析');const op=z.enum(['pause','resume','redelegate','cancel']).parse(body.action);const next=domain.controlTask(work.workspaceId,t.id,op);if(op==='redelegate'){next.sourceScan!.analysisRevision=run.revision;store.put('tasks',next);}if(next.status==='QUEUED')runner.start(t.id);return next;}
  if(method==='GET'&&action==='graph')return sourceGraph(domain,key,query);
  if(method==='GET'&&action==='assets')return sourceAssetPage(domain,key,query);
  if(method==='GET'&&action==='export')return {versionId:run.versionId,cutoff:Math.min(Number(query.get('cutoff')??run.cutoff),run.cutoff),assets:assetsAt(domain,key,Number(query.get('cutoff')??run.cutoff))};
  if(method==='POST'&&action==='control'){const operation=z.enum(['pause','resume','redelegate','cancel']).parse(body.action);if(body.budget){requireThat(['PAUSED','FAILED','NEEDS_INPUT'].includes(task.status)&&['resume','redelegate'].includes(operation),'BUDGET','只能在暂停后明确授权增加预算');domain.grantTaskBudget(work.workspaceId,task.id,body.budget);}const t=domain.controlTask(work.workspaceId,task.id,operation);if(t.status==='QUEUED')runner.start(t.id);return t;}
  if(method==='GET'&&action==='decisions')return sourceList(store,'source_decisions',run.versionId).filter(d=>d.runId===run.id&&d.action!=='profile');
  if(method==='POST'&&action==='decisions'){
   requireThat(run.revision===body.revision,'STALE','分析素材已变化');
   const data=z.object({assetId:z.string(),action:z.enum(['merge','resolve','split','undo','accept-profile']),targetId:z.string().optional(),decisionId:z.string().optional(),evidenceStarts:z.array(z.number().int().nonnegative()).default([]),ordinal:z.number().int().min(1).max(run.cutoff),reason:z.string().min(1).max(2000),patch:z.object({name:z.string().min(1).max(240).optional(),identity:z.string().min(1).max(2000).optional(),aliases:z.array(z.string()).optional(),fields:z.record(z.union([z.string().max(2000),z.number(),z.boolean(),z.array(z.string()),z.null()])).optional(),refs:z.record(z.union([z.string(),z.array(z.string())])).optional()}).default({})}).parse(body);
   const assets=assetsAt(domain,run.id,data.ordinal),a=assets.find(a=>a.id===data.assetId);
   const previous=data.action==='undo'?sourceGet(store,'source_decisions',data.decisionId??''):undefined;
   if(previous)requireThat(previous.runId===run.id&&previous.ordinal<=data.ordinal&&previous.action!=='undo','SOURCE_SCOPE','只能撤销本范围内的已有决定');
   else requireThat(a,'SOURCE_SCOPE','决定的证据时点早于实体出现，或目标不在范围内');
   if(data.action==='accept-profile')requireThat(a?.profile,'SOURCE_PROFILE','先生成并审阅档案');
   if(data.action==='merge')requireThat(data.targetId!==a!.id&&assets.some(x=>x.id===data.targetId&&x.kind===a!.kind),'SOURCE_MERGE','归并对象必须同类且在此揭露范围内');
   if(data.action==='split')requireThat(a&&['character','world'].includes(a.kind)&&data.patch.name&&data.patch.identity&&data.evidenceStarts.length&&data.evidenceStarts.every(start=>a.evidence.some(e=>e.start===start))&&a.evidence.some(e=>!data.evidenceStarts.includes(e.start)),'SOURCE_SPLIT','拆分需要选择部分证据，保留原实体的证据并指定独立名称与身份');
   if(data.patch.refs)for(const ref of Object.values(data.patch.refs).flat())requireThat(assets.some(x=>x.id===ref),'SOURCE_REFERENCE','人工关联必须指向当前允许范围内的素材ID');
   const decision={...data,id:id('sourceDecision'),splitId:data.action==='split'?id('splitAsset'):undefined,workId:work.id,versionId:run.versionId,runId:run.id,createdAt:now()};
   store.transaction(()=>{
    domain.invalidateTasks(work.workspaceId,'作者修订来源归并，旧分析不得覆盖决定');sourcePut(store,'source_decisions',decision);
    if(['merge','resolve','split','undo'].includes(data.action)){
     const affectedIds=[data.assetId,data.targetId,previous?.assetId,previous?.targetId].filter(Boolean);
     const affected=run.segments.filter(s=>s.registryIds?.some(id=>affectedIds.includes(id)));const start=Math.min(...affected.map(s=>s.start));
     for(const s of run.segments)if(s.start>=start&&s.state!=='split'){s.state='pending';s.discovery=undefined;s.summary=undefined;s.error='上游身份修订，依赖原解析的范围已失效';}
     for(const prior of sourceList(store,'source_assets',run.versionId).filter(x=>x.runId===run.id&&x.evidence.every(e=>e.start>=start))){prior.invalidated=true;sourcePut(store,'source_assets',prior);}
     if(affected.length&&task.status==='COMPLETED'){task.status='PAUSED';task.error={code:'SOURCE_REVISION',message:'上游身份修订，受影响覆盖需按新版本重新委派'};store.put('tasks',task);}
    }
    run.revision++;sourcePut(store,'source_runs',run);domain.bump(work.workspaceId);
   });return decision;
  }
 }
 if(group==='manifests'&&!key&&method==='GET')return sourceList(store,'import_manifests');
 if(group==='manifests'&&!key&&method==='POST')return saveManifest(domain,body);
 if(group==='manifests'&&key==='preview'&&method==='POST')return previewInheritance(domain,body);
 if(group==='manifests'&&key){const m=sourceGet(store,'import_manifests',key);if(method==='GET')return {manifest:m,preview:previewInheritance(domain,m.spec)};if(method==='PATCH')return saveManifest(domain,body.spec,key,body.revision);if(method==='POST'&&action==='activate')return activateManifest(domain,key,z.number().int().parse(body.revision));if(method==='POST'&&action==='cancel'){requireThat(m.status==='staging'&&m.revision===body.revision,'STALE','只能取消未激活的当前清单');m.status='canceled';m.revision++;return sourcePut(store,'import_manifests',m);}}
 throw new DomainError('NOT_FOUND','未知来源资料接口',404);
}
