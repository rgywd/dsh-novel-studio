import type { Domain } from './domain.js';
import type { StoryObject } from './contracts.js';
export interface Perspective {asOfChapter?:number;viewpointId?:string;audience?:'author'|'character'|'reader';branch?:string;storyTime?:string;evidenceThrough?:number;}
export function temporalObjects(domain:Domain,pid:string,at:Perspective={}){
 const current=domain.store.objects(pid),chapters=domain.chapters(pid),ordinal=new Map(chapters.map((c,n)=>[c.id,n+1])),byId=new Map(current.map(o=>[o.id,o])),asOf=at.asOfChapter??chapters.length+1,branch=at.branch??'main';
 const valid=(o:StoryObject)=>!(o.kind==='world'&&o.fields.enabled===false)&&!['candidate','draft','revoked','stale'].includes(o.status)&&(['world','character'].includes(o.kind)&&o.fields.branch===undefined||String(o.fields.branch??'main')===branch)&&(!o.source?.fromChapter||o.source.fromChapter<=asOf)&&(!o.source?.toChapter||o.source.toChapter>=asOf)&&(!o.source?.chapterId||((ordinal.get(o.source.chapterId)??Infinity)<=(at.evidenceThrough??asOf)&&byId.get(o.source.chapterId)?.fields.currentVersion===o.source.versionId&&!byId.get(o.source.chapterId)?.fields.needsReview))&&(!at.storyTime||!o.fields.storyTime||o.fields.storyTime===at.storyTime||o.source?.time===at.storyTime);
 const histories=new Map<string,StoryObject[]>();for(const o of current)histories.set(o.id,[o]);
 for(const r of domain.store.db.prepare('SELECT data FROM changesets WHERE projectId=? ORDER BY rowid').all(pid)){const change=JSON.parse(r.data as string);for(const o of [change.before,change.after])if(o&&['relationship','world','character'].includes(o.kind)&&o.projectId===pid&&histories.has(o.id))histories.get(o.id)!.push(o);}
 const projected:StoryObject[]=[];for(const [oid,versions] of histories){const cur=byId.get(oid)!;if(cur.kind==='world'&&cur.fields.enabled===false||['revoked','stale'].includes(cur.status)&&(!cur.source?.fromChapter||cur.source.fromChapter<=asOf))continue;const choices=['relationship','world','character'].includes(cur.kind)?versions:[cur];const chosen=choices.filter(valid).sort((a,b)=>(b.source?.fromChapter??0)-(a.source?.fromChapter??0)||b.revision-a.revision)[0];if(chosen)projected.push(structuredClone(chosen));}
 const relations=new Map<string,StoryObject>();for(const o of projected.filter(o=>o.kind==='relationship').sort((a,b)=>(a.source?.fromChapter??0)-(b.source?.fromChapter??0)||a.updatedAt.localeCompare(b.updatedAt)))relations.set(String(o.fields.edgeKey??`${o.fields.fromId}:${o.fields.toId}:${o.fields.type}`),o);
 const result=projected.filter(o=>o.kind!=='relationship').concat([...relations.values()]);const omitted:{id:string;reason:string}[]=[];
 const visible=result.filter(o=>{
   const known=Array.isArray(o.fields.knownByIds)?o.fields.knownByIds:[];const hidden=o.fields.visibility==='hidden'||o.source?.modality==='knowledge';
   const allowed=at.audience!=='character'||!hidden||known.includes(at.viewpointId??'')||o.fields.entityId===at.viewpointId;
   if(!allowed){omitted.push({id:o.id,reason:'当前视角未获知的资料，不进入生成上下文'});return false;}
   if(at.audience==='reader'&&o.fields.readerKnown===false){omitted.push({id:o.id,reason:'读者尚未知晓'});return false;}
   if(at.audience==='character'){
     if(o.kind==='character'&&o.id!==at.viewpointId){delete o.fields.known;delete o.fields.secret;delete o.fields.privateGoal;}
     if(o.kind==='relationship'){if(o.fields.fromId!==at.viewpointId)delete o.fields.perspectiveFrom;if(o.fields.toId!==at.viewpointId)delete o.fields.perspectiveTo;}
   }return true;
 });
 for(const o of current)if(!result.some(x=>x.id===o.id))omitted.push({id:o.id,reason:'尚未生效、其他分支、未接受或来源已失效'});
 return {objects:visible,omitted,asOf,branch};
}
export function worldRecall(worlds:StoryObject[],query:string,entityIds:Set<string>,maxEntries=24){
 const included=new Map<string,{object:StoryObject;reason:string;depth:number}>(),omitted:{id:string;reason:string}[]=[];let text=query;
 for(let depth=0;depth<=2;depth++){
   const triggers=worlds.filter(o=>!included.has(o.id)&&o.fields.enabled!==false).map(o=>{const primary=[o.title,...Array.isArray(o.fields.keys)?o.fields.keys:[],...Array.isArray(o.fields.aliases)?o.fields.aliases:[]].filter(Boolean);const secondary=Array.isArray(o.fields.secondaryKeys)?o.fields.secondaryKeys:[];const keyMatch=primary.some(k=>text.toLocaleLowerCase().includes(k.toLocaleLowerCase()));const second=!o.fields.selective||secondary.some(k=>text.toLocaleLowerCase().includes(k.toLocaleLowerCase()));const fixed=o.locked||o.fields.core===true||o.fields.pinned===true;const related=entityIds.has(o.id)||(Array.isArray(o.fields.relatedEntityIds)&&o.fields.relatedEntityIds.some(x=>entityIds.has(x)));return {object:o,reason:fixed?'核心规则/手动固定':related?'当前参与实体及显式关联':'关键词/别名触发',match:fixed||related||keyMatch&&second,priority:Number(o.fields.priority??0)+(fixed?10000:related?1000:0)};}).filter(x=>x.match).sort((a,b)=>b.priority-a.priority||a.object.id.localeCompare(b.object.id));
   let additions='';for(const entry of triggers){if(included.size>=maxEntries&&!entry.object.locked&&entry.object.fields.core!==true&&entry.object.fields.pinned!==true){omitted.push({id:entry.object.id,reason:'世界递归条目数量上限'});continue;}included.set(entry.object.id,{object:entry.object,reason:entry.reason,depth});if(depth<2&&entry.object.fields.recursive!==false){additions+='\n'+entry.object.body;for(const eid of Array.isArray(entry.object.fields.relatedEntityIds)?entry.object.fields.relatedEntityIds:[])entityIds.add(eid);}}
   if(!additions)break;text=additions;
 }
 return {entries:[...included.values()],omitted};
}
