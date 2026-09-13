import { z } from 'zod';
import type { Domain } from './domain.js';
import type { Store } from './store.js';
import { hash } from './store.js';
import { stable } from './config.js';
import { id,now,requireThat,type ChapterVersion,type StoryObject,type Review } from './contracts.js';
import { memoryContentSchema,type MemoryContent } from './memory-contracts.js';
export { memoryContentSchema,type MemoryContent };
export interface MemorySource {chapterId:string;versionId:string;hash:string;ordinal:number;parentId:string|null;branch:string;}
export interface MemoryRecord {id:string;projectId:string;kind:'chapter'|'checkpoint';revision:number;createdAt:string;updatedAt:string;status:'valid'|'stale';reason?:string;locked:boolean;actor:string;taskId?:string;sources:MemorySource[];sourceHash:string;content:MemoryContent;history:{revision:number;content:MemoryContent;at:string;actor:string;locked:boolean}[];}
export const memoryList=(store:Store,pid:string):MemoryRecord[]=>store.db.prepare('SELECT data FROM memories WHERE projectId=? ORDER BY rowid').all(pid).map(r=>JSON.parse(r.data as string));
export function memoryGet(store:Store,pid:string,key:string){const m=memoryList(store,pid).find(m=>m.id===key);requireThat(m,'NOT_FOUND','记忆不存在',404);return m;}
function put(store:Store,m:MemoryRecord){store.db.prepare('INSERT INTO memories VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(m.id,m.projectId,JSON.stringify(m));return m;}
export function sourceFor(domain:Domain,c:StoryObject,v?:ChapterVersion):MemorySource {return {chapterId:c.id,versionId:v?.id??String(c.fields.currentVersion),hash:hash(v?.content??c.body),ordinal:domain.chapters(c.projectId).findIndex(x=>x.id===c.id)+1,parentId:c.parentId,branch:String(c.fields.branch??'main')};}
export function validMemory(domain:Domain,m:MemoryRecord){return m.status==='valid'&&m.sources.every(s=>{const c=domain.store.objects(m.projectId,'chapter').find(c=>c.id===s.chapterId);return c&&c.status==='accepted'&&!c.fields.needsReview&&stable(sourceFor(domain,c))===stable(s);});}
export function invalidateMemories(domain:Domain,pid:string,chapterIds:Set<string>,reason:string){for(const m of memoryList(domain.store,pid))if(m.status==='valid'&&m.sources.some(s=>chapterIds.has(s.chapterId))){m.status='stale';m.reason=reason;m.updatedAt=now();put(domain.store,m);}}
export function validateMemoryContent(domain:Domain,pid:string,raw:unknown,sources:MemorySource[]):MemoryContent{
 const content=memoryContentSchema.parse(raw);const originals=sources.map(s=>{const c=domain.object(pid,s.chapterId);const v=domain.store.get('versions',s.versionId);requireThat(v.projectId===pid&&v.chapterId===c.id,'MEMORY_SOURCE','记忆来源不属于本作品');return v.content;});
 for(const scene of [...content.scenes,...content.obligations]){requireThat(originals.some(text=>text.includes(scene.quote)),'MEMORY_EVIDENCE','记忆的证据必须是来源正文的连续原文',422);for(const eid of scene.entityIds)domain.object(pid,eid);if('knownByIds' in scene)for(const eid of scene.knownByIds)requireThat(domain.object(pid,eid).kind==='character','MEMORY_EVIDENCE','知情者必须为已有角色',422);}
 return content;
}
export function memoryFromReview(review:Review):MemoryContent {return review.memory??{summary:review.summary,scenes:review.events.map(e=>({summary:e.title,quote:e.quote,entityIds:e.entityIds,knownByIds:[],time:e.time,location:'未知',cause:'未证实',effect:'见引用正文',modality:e.modality??'objective',inference:e.inference??false,importance:2})),obligations:[]};}
export function installMemory(domain:Domain,pid:string,source:MemorySource,raw:unknown,actor:string,taskId?:string,checkpointEvery=5){
 const c=domain.object(pid,source.chapterId);requireThat(c.status==='accepted'&&!c.fields.needsReview&&stable(sourceFor(domain,c))===stable(source),'STALE','记忆来源正文、顺序或分支已改变；旧结果不能提交');
 const content=validateMemoryContent(domain,pid,raw,[source]),sourceHash=hash(stable([source]));const old=memoryList(domain.store,pid).find(m=>m.kind==='chapter'&&m.sourceHash===sourceHash);
 if(old?.locked){requireThat(validMemory(domain,old),'MEMORY_LOCKED','锁定记忆的正文来源已失效；需要作者解锁后重建');return old;}
 if(old&&validMemory(domain,old)&&stable(old.content)===stable(content))return old;
 const m:MemoryRecord={id:old?.id??id('memory'),projectId:pid,kind:'chapter',revision:(old?.revision??0)+1,createdAt:old?.createdAt??now(),updatedAt:now(),status:'valid',locked:false,actor,taskId,sources:[source],sourceHash,content,history:[...(old?.history??[]),...(old?[{revision:old.revision,content:old.content,at:old.updatedAt,actor:old.actor,locked:old.locked}]:[])]};
 for(const other of memoryList(domain.store,pid))if(other.kind==='chapter'&&other.id!==m.id&&other.sources[0].chapterId===c.id&&other.status==='valid'){other.status='stale';other.reason='新正文版本的记忆已替代';put(domain.store,other);}
 put(domain.store,m);domain.store.event(pid,taskId??null,'memory.updated','已根据接受正文更新章节记忆与证据索引',{chapterId:c.id,versionId:source.versionId,memoryId:m.id});sealCheckpoints(domain,pid,checkpointEvery);return m;
}
export function sealCheckpoints(domain:Domain,pid:string,every=5){
 const chapters=domain.chapters(pid);const memories=memoryList(domain.store,pid);for(let start=0;start<chapters.length;start+=every){const group=chapters.slice(start,start+every);if(group.length<every)continue;const selected=group.map(c=>memories.find(m=>m.kind==='chapter'&&m.sources[0].chapterId===c.id&&validMemory(domain,m)));if(selected.some(m=>!m))continue;
 const sources=selected.flatMap(m=>m!.sources);if(new Set(sources.map(s=>s.branch)).size!==1)continue;const sourceHash=hash(stable({sources,memories:selected.map(m=>[m!.id,m!.revision])}));if(memories.some(m=>m.kind==='checkpoint'&&m.sourceHash===sourceHash&&validMemory(domain,m)))continue;
 for(const old of memories.filter(m=>m.kind==='checkpoint'&&m.sources.some(s=>sources.some(x=>x.chapterId===s.chapterId))&&m.status==='valid')){old.status='stale';old.reason='章节记忆版本或覆盖边界改变';put(domain.store,old);}
 const scenes=selected.flatMap(m=>m!.content.scenes).sort((a,b)=>b.importance-a.importance).slice(0,20);const obligations=selected.flatMap(m=>m!.content.obligations).slice(0,20);
 put(domain.store,{id:id('memory'),projectId:pid,kind:'checkpoint',revision:1,createdAt:now(),updatedAt:now(),status:'valid',locked:false,actor:'derived-checkpoint',sources,sourceHash,content:{summary:selected.map((m,n)=>`第 ${sources[n].ordinal} 章：${m!.content.summary}`).join('\n'),scenes,obligations},history:[]});
 domain.store.event(pid,null,'memory.sealed',`已封存第 ${start+1}–${start+every} 章历史段；保留每章原文及来源链`,{sourceHash});
 }}
export function memoryStatus(domain:Domain,pid:string){const chapters=domain.chapters(pid).filter(c=>c.status==='accepted'&&c.body.trim());const memories=memoryList(domain.store,pid).map(m=>({...m,status:validMemory(domain,m)?'valid' as const:'stale' as const}));const covered=new Set(memories.filter(m=>m.kind==='chapter'&&m.status==='valid').map(m=>m.sources[0].chapterId));const gaps=chapters.filter(c=>!covered.has(c.id)).map(c=>({...sourceFor(domain,c),title:c.title,chars:c.body.length,needsReview:!!c.fields.needsReview}));const waterline=chapters.findIndex(c=>!covered.has(c.id));return {total:chapters.length,covered:covered.size,gaps,waterline:waterline<0?chapters.length:waterline,memories};}
export function editMemory(domain:Domain,pid:string,key:string,revision:number,input:{content?:unknown;locked?:boolean;invalidate?:boolean;restoreRevision?:number}){return domain.store.transaction(()=>{
 const m=memoryGet(domain.store,pid,key);requireThat(m.revision===revision,'STALE','记忆已变化，请刷新');requireThat(!domain.project(pid).archived,'ARCHIVED','作品已归档');
 requireThat(!m.locked||input.locked===false&&!input.content&&input.restoreRevision===undefined&&!input.invalidate,'MEMORY_LOCKED','先单独解锁记忆，再修改或重建');
 if(input.content||input.restoreRevision!==undefined){requireThat(validMemory(domain,m),'STALE','来源版本已失效，请从最新正文重建');let raw=input.content;if(input.restoreRevision!==undefined){const old=m.history.find(h=>h.revision===input.restoreRevision);requireThat(old,'NOT_FOUND','没有该摘要历史版本');raw=old.content;}const content=validateMemoryContent(domain,pid,raw,m.sources);m.history.push({revision:m.revision,content:m.content,at:m.updatedAt,actor:m.actor,locked:m.locked});m.content=content;m.actor='author-summary-edit';}
 if(input.locked!==undefined)m.locked=input.locked;if(input.invalidate){m.status='stale';m.reason='作者请求重建';}m.revision++;m.updatedAt=now();put(domain.store,m);
 if(m.kind==='chapter')for(const parent of memoryList(domain.store,pid).filter(x=>x.kind==='checkpoint'&&x.sources.some(s=>s.chapterId===m.sources[0].chapterId))){parent.status='stale';parent.reason='章节摘要修订';put(domain.store,parent);}
 domain.invalidateTasks(pid,'作品记忆已修订，重新委派以使用新版本');domain.bump(pid);domain.store.change(pid,'memory.edit',{memoryId:key,revision:m.revision,actor:m.actor});return m;
});}

const segmenter=new Intl.Segmenter('zh',{granularity:'word'});
export function recallTerms(text:string){return [...new Set([...segmenter.segment(text)].filter(s=>s.isWordLike&&s.segment.length>1).map(s=>s.segment.toLocaleLowerCase()))].slice(0,40);}
export function rollingPlanning(domain:Domain,pid:string){const all=domain.store.objects(pid),chapters=domain.chapters(pid),accepted=chapters.filter(c=>c.status==='accepted'&&c.body.trim());const records=memoryList(domain.store,pid).filter(m=>m.kind==='chapter'&&validMemory(domain,m));return {
  strategy:'远处粗、近处细；仅提案未来剧情，不要求正文迁就计划',
  promises:all.filter(o=>o.kind==='book').map(o=>({id:o.id,goal:o.fields.goal,promise:o.fields.promise,locked:o.locked})),
  near:chapters.filter(c=>c.status==='planned'&&!c.locked&&!c.body.trim()).slice(0,3).map(c=>({id:c.id,title:c.title,goal:c.fields.goal})),
  far:all.filter(o=>o.kind==='volume').map(o=>({id:o.id,title:o.title,goal:o.fields.goal,locked:o.locked})),
  obligations:records.flatMap(m=>m.content.obligations.filter(o=>!['fulfilled','abandoned'].includes(o.state)).map(o=>({...o,memoryId:m.id,sources:m.sources,certainty:o.inference?'possible':'known'}))).slice(0,40),
  arcs:all.filter(o=>o.kind==='character'&&o.fields.arc).map(o=>({id:o.id,arc:o.fields.arc})).slice(0,40),
  foreshadow:all.filter(o=>o.kind==='foreshadow'&&!['revoked','candidate'].includes(o.status)).map(o=>({id:o.id,title:o.title,range:o.fields.recoveryRange,state:o.fields.state,source:o.source})).slice(0,40),
  checkpoint:{accepted:accepted.length,atVolumeBoundary:accepted.length>0&&chapters[chapters.indexOf(accepted.at(-1)!)+1]?.parentId!==accepted.at(-1)?.parentId,coverage:memoryStatus(domain,pid).covered},
  risks:[{certainty:'possible',reason:'主线停滞、支线比重与成长弧需要语义审读。统计和来源只提供检查依据，不宣称已证明所有依赖。'}]
};}
export function recallMemory(domain:Domain,pid:string,options:{goal:string;asOf:number;branch?:string;entityIds?:string[];viewpointId?:string;audience?:string;limit?:number}){
 const branch=options.branch??'main',entities=domain.store.objects(pid).filter(o=>['character','world'].includes(o.kind));const relevant=new Set(options.entityIds??[]),terms=recallTerms(options.goal);
 for(const entity of entities){const names=[entity.title,...Array.isArray(entity.fields.aliases)?entity.fields.aliases:[]];if(names.some(n=>options.goal.includes(n))||relevant.has(entity.id)){relevant.add(entity.id);terms.push(...names);}}
 const visible=(c:StoryObject)=>c.status==='accepted'&&!c.fields.needsReview&&String(c.fields.branch??'main')===branch&&sourceFor(domain,c).ordinal<=options.asOf;
 const chapters=domain.chapters(pid).filter(visible);const records=memoryList(domain.store,pid).filter(m=>m.kind==='chapter'&&validMemory(domain,m)&&m.sources.every(s=>s.branch===branch&&s.ordinal<=options.asOf));
 const hits:{chapterId:string;versionId:string;quote:string;start:number;end:number;reason:string;score:number;scene?:MemoryContent['scenes'][number];memoryId?:string}[]=[];
 for(const c of chapters){const memory=records.find(m=>m.sources[0].chapterId===c.id);const pov=options.audience==='character'?options.viewpointId:undefined;const scenes=memory?.content.scenes.filter(s=>!pov||s.knownByIds.includes(pov))??[];const fullAllowed=!pov||c.fields.viewpointId===pov||c.fields.public===true;
   let positions:number[]=[];if(fullAllowed){for(const term of [...new Set(terms)].filter(Boolean)){const at=c.body.toLowerCase().indexOf(term.toLowerCase());if(at>=0)positions.push(at);}if(relevant.size&&memory?.content.obligations.some(o=>o.state==='open'&&o.entityIds.some(e=>relevant.has(e))))positions.push(c.body.indexOf(memory.content.obligations.find(o=>o.state==='open')!.quote));}
   for(const scene of scenes)if(scene.entityIds.some(e=>relevant.has(e))||terms.some(t=>scene.summary.includes(t)||scene.quote.includes(t)))positions.push(c.body.indexOf(scene.quote));
   for(const at of [...new Set(positions)].filter(n=>n>=0).slice(0,3)){const scene=scenes.find(s=>c.body.indexOf(s.quote)<=at&&c.body.indexOf(s.quote)+s.quote.length>at);if(pov&&!fullAllowed&&!scene)continue;const start=fullAllowed?Math.max(0,at-160):c.body.indexOf(scene!.quote),end=fullAllowed?Math.min(c.body.length,at+500):start+scene!.quote.length;const quote=c.body.slice(start,end);
     const score=terms.filter(t=>quote.includes(t)).length*8+(scene?.importance??1)*5+(scene?.entityIds.filter(e=>relevant.has(e)).length??0)*10+(memory?.content.obligations.some(o=>o.state==='open'&&quote.includes(o.quote))?20:0)+Math.min(sourceFor(domain,c).ordinal/Math.max(1,options.asOf),1);
     hits.push({chapterId:c.id,versionId:String(c.fields.currentVersion),quote,start,end,reason:'目标词/别名/关联实体命中；回查接受正文及必要因果',score,scene,memoryId:memory?.id});
   }
 }
 return hits.sort((a,b)=>b.score-a.score||a.chapterId.localeCompare(b.chapterId)||a.start-b.start).filter((h,n,a)=>a.findIndex(x=>x.chapterId===h.chapterId&&Math.abs(x.start-h.start)<300)===n).slice(0,options.limit??6);
}
