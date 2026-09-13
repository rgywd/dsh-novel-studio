import { Domain } from './domain.js';
import { temporalObjects,worldRecall,type Perspective } from './temporal.js';
import { memoryStatus,recallMemory,validMemory } from './memory.js';
import { requireThat, type StoryObject } from './contracts.js';
export interface ContextItem {id:string;version:string;kind:string;reason:string;priority:number;mandatory:boolean;text:string;}
export interface ContextPack {projectId:string;revision:number;chapterId?:string;budget:number;used:number;items:ContextItem[];omitted:{id:string;reason:string}[];missing:string[];canon:StoryObject[];text:string;}

export function buildContext(domain:Domain,projectId:string,options:{chapterId?:string;goal?:string;maxChars?:number;entityIds?:string[];purpose?:'generation'|'state-refresh';memory?:{enabled:boolean;recallLimit?:number}}&Perspective={}):ContextPack {
  const p=domain.project(projectId);const budget=options.maxChars??18000;requireThat(Number.isInteger(budget)&&budget>=1000&&budget<=48000,'BUDGET','上下文预算必须在 1000–48000 字符内',422);
  const original=domain.store.objects(projectId);const chapters=domain.chapters(projectId);const current=options.chapterId?domain.object(projectId,options.chapterId):undefined;
  const index=Math.min(options.asOfChapter??Infinity,current?chapters.findIndex(c=>c.id===current.id):chapters.length);
  const temporal=temporalObjects(domain,projectId,{...options,asOfChapter:options.asOfChapter??index+1,evidenceThrough:index});const all=temporal.objects;
  const prior=chapters.slice(0,index).filter(c=>c.status==='accepted'&&String(c.fields.branch??'main')===(options.branch??'main'));const ordinal=new Map(chapters.map((c,n)=>[c.id,n+1]));const byId=new Map(original.map(o=>[o.id,o]));
  const refreshing=options.purpose==='state-refresh';
  const relevant=new Set(options.entityIds??[]);const query=(refreshing?[current?.title,current?.body]:[options.goal,current?.title,current?.fields.goal,current?.fields.participants,current?.fields.events,prior.at(-1)?.body.slice(-2400)]).filter(Boolean).join(' ');
  for(const o of all.filter(o=>['character','world'].includes(o.kind))){const aliases=Array.isArray(o.fields.aliases)?o.fields.aliases:[];if(query.includes(o.id)||[o.title,...aliases].some(name=>query.includes(name)))relevant.add(o.id);}
  for(const o of all)if(o.kind==='relationship'&&(relevant.has(String(o.fields.fromId))||relevant.has(String(o.fields.toId)))){relevant.add(String(o.fields.fromId));relevant.add(String(o.fields.toId));}
  for(const entityId of [...relevant])for(const linked of Array.isArray(byId.get(entityId)?.fields.relatedEntityIds)?byId.get(entityId)!.fields.relatedEntityIds as string[]:[])relevant.add(linked);
  const latest=(o:StoryObject)=>!o.source?.versionId||byId.get(o.source.chapterId??'')?.fields.currentVersion===o.source.versionId;
  const history=all.filter(o=>o.kind==='fact'&&o.status==='accepted'&&!o.source?.inference&&['objective','knowledge'].includes(o.source?.modality??'objective')&&latest(o)&&(!o.source?.chapterId||(ordinal.get(o.source.chapterId)??Infinity)<=index)&&(!o.source?.fromChapter||o.source.fromChapter<=index+1)&&(!o.source?.toChapter||o.source.toChapter>=index+1));
  const projection=new Map<string,StoryObject>();const superseded=new Set(history.map(f=>f.source?.supersedes).filter(Boolean));
  for(const f of history.filter(f=>!superseded.has(f.id)).sort((a,b)=>(a.source?.fromChapter??0)-(b.source?.fromChapter??0)||a.updatedAt.localeCompare(b.updatedAt)))projection.set(`${f.fields.entityId}:${f.fields.property}:${f.source?.modality??'objective'}${['known','alias'].includes(String(f.fields.property))?':'+String(f.fields.value):''}`,f);
  const canon=[...projection.values()];const canonIds=new Set(canon.map(f=>f.id));
  const worlds=worldRecall(all.filter(o=>o.kind==='world'&&o.status==='accepted'),query,relevant);
  const candidates:ContextItem[]=[];const omitted:ContextPack['omitted']=[...temporal.omitted,...worlds.omitted];const missing:string[]=[];
  const add=(id:string,version:string,kind:string,reason:string,priority:number,mandatory:boolean,text:string)=>{candidates.push({id,version,kind,reason,priority,mandatory,text});};
  add(p.id,String(p.revision),'project','故事承诺、风格和不可破坏约束',100,true,JSON.stringify({title:p.title,premise:p.premise,style:p.style,constraints:p.constraints}));
  for(const o of all.filter(o=>o.locked&&(['character','world'].includes(o.kind)&&o.status==='accepted'||o.kind==='fact'&&canonIds.has(o.id)||['book','volume'].includes(o.kind)&&o.status==='planned'))){add(o.id,String(o.revision),'locked','锁定约束完整保留',100,true,serialize(o));}
  if(!refreshing)for(const o of all.filter(o=>o.kind==='book'||o.id===current?.parentId)){if(!o.locked)add(o.id,String(o.revision),'plan','上层规划；未来内容不是既成事实',90,false,serialize(o));}
  if(current)add(current.id,String(current.revision),refreshing?'accepted-version':'chapter-plan',refreshing?'重建已接受正文状态；旧章纲不约束作者修改':'当前章目标、参与者、禁区、字数、揭示和结尾',98,true,JSON.stringify(refreshing?{id:current.id,title:current.title,version:current.fields.currentVersion}:{id:current.id,title:current.title,fields:current.fields,tags:current.tags,locked:current.locked}));
  if(prior.length===0)missing.push('没有上章正文；按开篇处理');
  for(const [n,c] of prior.slice(-4).reverse().entries()){
    if(options.audience==='character'&&options.viewpointId&&c.fields.viewpointId!==options.viewpointId&&c.fields.public!==true){omitted.push({id:c.id,reason:'其他视角的原文不直接传入当前角色；只召回明确知情证据'});continue;}
    if(options.memory?.enabled)continue;
    if(c.fields.summary&&c.fields.summaryVersion===c.fields.currentVersion&&!c.fields.needsReview)add(`${c.id}:summary`,String(c.fields.currentVersion),'summary','近期已接受版本摘要',85-n*3,false,String(c.fields.summary));
    else if(c.body.trim())missing.push(`「${c.title}」摘要缺失或已失效；只使用最新正文片段`);
    if(n<2&&c.body.trim())add(`${c.id}:ending`,String(c.fields.currentVersion??c.revision),'accepted-body','上章最新正文连续性；只取结尾',95-n*3,false,c.body.slice(-2400));
  }
  for(const o of all.filter(o=>['character','relationship'].includes(o.kind)&&o.status==='accepted'&&!o.locked)){
    const linked=relevant.has(o.id)||relevant.has(String(o.fields.fromId))||relevant.has(String(o.fields.toId));
    if(linked||relevant.size===0)add(o.id,String(o.revision),o.kind,linked?'当前参与实体或一跳关系':'无显式参与实体，补充有限基础资料',linked?88:55,false,serialize(o));
  }
  for(const {object:o,reason,depth} of worlds.entries)if(!o.locked)add(o.id,String(o.revision),'world',`${reason} · 递归深度 ${depth}/2`,o.fields.core||o.fields.pinned?100:88,o.fields.core===true||o.fields.pinned===true,serialize(o));
  if(options.memory?.enabled){
    const state=memoryStatus(domain,projectId);const before=new Set(prior.map(c=>c.id));
    for(const m of state.memories.filter(m=>m.kind==='checkpoint'&&validMemory(domain,m)&&m.sources.every(s=>before.has(s.chapterId))).slice(0,2))if(options.audience!=='character')add(m.id,String(m.revision),'memory-checkpoint','封存历史段；不是当前状态，保留来源链',72,false,JSON.stringify({historical:true,range:m.sources.map(s=>s.ordinal),summary:m.content.summary,sources:m.sources}));
    for(const c of prior.slice(-3)){const m=state.memories.find(m=>m.kind==='chapter'&&m.status==='valid'&&m.sources[0].chapterId===c.id);const pov=options.audience==='character'?options.viewpointId:undefined;const readable=!pov||c.fields.viewpointId===pov||c.fields.public===true;
      if(m&&readable)add(m.id,String(m.revision),'memory-summary','近期章节记忆；来源版本有效',86,false,JSON.stringify(m.content));
      if(readable&&c.body)add(c.id+':recent',String(c.fields.currentVersion),'accepted-body','近期必要原文，不用摘要替代全部证据',94,true,c.body.slice(-2400));
    }
    for(const gap of state.gaps.filter(g=>before.has(g.chapterId))){const c=byId.get(gap.chapterId)!;if(options.audience==='character'&&options.viewpointId&&c.fields.viewpointId!==options.viewpointId&&c.fields.public!==true){missing.push(`「${c.title}」记忆缺口未向当前角色暴露；需要有知情证据的总结`);continue;}requireThat(!gap.needsReview,'MEMORY_GAP','早期改文导致下游状态失效；请先审查受影响章节');add(c.id+':gap',gap.versionId,'memory-gap','尚未总结的已接受正文，完整补入覆盖缺口',97,true,c.body);}
    for(const hit of recallMemory(domain,projectId,{goal:query,asOf:index,branch:options.branch,entityIds:[...relevant],viewpointId:options.viewpointId,audience:options.audience,limit:options.memory.recallLimit??6}))add(hit.chapterId+':evidence:'+hit.start,hit.versionId,'memory-evidence',hit.reason,82,false,JSON.stringify(hit));
    for(const m of state.memories.filter(m=>m.status==='stale'))omitted.push({id:m.id,reason:'摘要来源版本/顺序已失效；不用于当前状态'});
  }
  for(const o of canon)if(!o.locked){const linked=relevant.has(String(o.fields.entityId));add(o.id,o.source?.versionId??String(o.revision),'canon',linked?'相关实体的有来源正式事实':'有限补充的正式事实',linked?92:60,false,serialize(o));}
  for(const o of all.filter(o=>o.kind==='event'&&o.status==='accepted'&&latest(o)&&(!o.source?.chapterId||(ordinal.get(o.source.chapterId)??Infinity)<=index))){add(o.id,o.source?.versionId??String(o.revision),'happened-event','已经发生且来源版本仍有效的事件',65,false,serialize(o));}
  for(const o of all.filter(o=>o.kind==='foreshadow'&&o.status!=='candidate'&&o.status!=='revoked')){const resolved=canon.some(f=>f.fields.entityId===o.id&&f.fields.property==='foreshadowState'&&f.fields.value==='resolved');if(!resolved)add(o.id,String(o.revision),'foreshadow-plan','活跃伏笔与计划回收；不是已发生事实',68,false,serialize(o));}
  for(const o of all)if(o.source?.versionId&&!latest(o))omitted.push({id:o.id,reason:'来源正文版本已失效'});
  const selected:ContextItem[]=[];const seen=new Set<string>();let used=0;
  for(const item of candidates.sort((a,b)=>b.priority-a.priority)){
    if(seen.has(item.id))continue;seen.add(item.id);
    const length=render(item).length+2;
    if(used+length>budget){requireThat(!item.mandatory,'CONTEXT_LOCK_OVERFLOW','核心锁定约束超过上下文预算，请提高预算或明确缩小任务范围');omitted.push({id:item.id,reason:'低优先级资料因预算省略'});continue;}
    selected.push(item);used+=length;
  }
  const text=selected.map(render).join('\n\n');
  const included=new Set(selected.filter(i=>i.kind==='canon'||i.kind==='locked').map(i=>i.id));
  return {projectId,revision:p.revision,chapterId:current?.id,budget,used:text.length,items:selected,omitted,missing,canon:canon.filter(f=>included.has(f.id)),text};
}
function serialize(o:StoryObject){const source=o.source?.quote===o.body?{...o.source,quote:undefined,quoteRef:'body'}:o.source;return JSON.stringify({id:o.id,title:o.title,kind:o.kind,status:o.status,body:o.body,fields:o.fields,source,tags:o.tags});}
function render(item:ContextItem){return `【${item.kind} ${item.id} @${item.version}】\n${item.text}`;}
