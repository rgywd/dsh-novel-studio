import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Domain } from './domain.js';
import type { Store } from './store.js';
import { hash } from './store.js';
import { stable } from './config.js';
import { id,now,requireThat,projectSchema,type Project,type StoryObject,type Source } from './contracts.js';
import { manifestSchema,type SourceWork,type SourceVersion,type SourceChapter,type SourceRun,type SourceAsset,type SourceSegment,type SourceEvidence,type ImportManifest,type AdaptationSpec } from './source-contracts.js';

type Records={source_works:SourceWork;source_versions:SourceVersion;source_runs:SourceRun;source_assets:SourceAsset;source_decisions:any;import_manifests:ImportManifest};
export function sourceGet<K extends keyof Records>(store:Store,table:K,key:string):Records[K]{const row=store.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(key);requireThat(row,'SOURCE_NOT_FOUND','原作资料不存在',404);return JSON.parse(row.data as string);}
export function sourceList<K extends keyof Records>(store:Store,table:K,versionId?:string):Records[K][]{return store.db.prepare(`SELECT data FROM ${table}${versionId?' WHERE versionId=?':''} ORDER BY rowid`).all(...(versionId?[versionId]:[])).map(r=>JSON.parse(r.data as string));}
export function sourcePut<K extends keyof Records>(store:Store,table:K,value:Records[K]){const v=value as any;if(table==='source_works')store.db.prepare(`INSERT INTO ${table} VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(v.id,JSON.stringify(v));else if(table==='source_versions')store.db.prepare(`INSERT INTO ${table} VALUES(?,?,?)`).run(v.id,v.workId,JSON.stringify(v));else store.db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(v.id,v.workId,v.versionId,JSON.stringify(v));return value;}
const fileSchema=z.object({name:z.string().min(1).max(240),raw:z.string().max(5000000).optional(),base64:z.string().max(28000000).optional(),encoding:z.enum(['utf-8','gb18030']).default('utf-8'),kind:z.enum(['novel','character','world','plot','supplement']).default('novel'),stage:z.string().max(240).default('所选资料版本'),scope:z.enum(['baseline','author-reference']).default('baseline')});
export const sourceInputSchema=z.object({title:z.string().min(1).max(160),author:z.string().max(240).default('未提供'),origin:z.string().max(2000).default('用户提供的本地资料'),rights:z.string().max(2000).default('使用范围由提供者确认；非商业用途不是授权证明'),files:z.array(fileSchema).min(1).max(20)});

// Text is preserved byte-for-byte after explicit decoding. Evidence offsets are UTF-16 offsets in raw.
export function parseSource(input:unknown,workId='preview'):SourceVersion{
 const data=sourceInputSchema.parse(input);let raw='';const chapters:SourceChapter[]=[],materials:SourceVersion['materials']=[],warnings:string[]=[];const bytes:Buffer[]=[];
 for(const [fn,file] of data.files.entries()){
  requireThat(!/\.epub$/i.test(file.name),'SOURCE_FORMAT','此版本支持TXT/Markdown及文本资料包；不解压或执行EPUB',422);
  const buffer=file.base64?Buffer.from(file.base64,'base64'):Buffer.from(file.raw??'','utf8');requireThat(buffer.length<=20000000,'SOURCE_SIZE','单份资料超过20MB',413);bytes.push(buffer);
  const content=file.base64?new TextDecoder(file.encoding,{fatal:true,ignoreBOM:true}).decode(buffer):file.raw??'';
  requireThat(content.trim(),'SOURCE_EMPTY','资料为空，请检查编码或文件',422);const offset=raw.length;raw+=content;requireThat(raw.length<=5000000,'SOURCE_SIZE','一个来源版本限500万字符',413);
  const materialId=`material-${fn+1}`,prefix=hash(content).slice(0,12);materials.push({id:materialId,name:file.name,kind:file.kind,stage:file.stage,scope:file.scope,start:offset,end:raw.length,encoding:file.encoding,hash:createHash('sha256').update(buffer).digest('hex'),originalBase64:buffer.toString('base64')});
  let volumeId=`volume-${fn}-0`,volumeTitle=file.name;
  const lines=[...content.matchAll(/[^\r\n]+/gu)];const headings=lines.filter(m=>/^(?:#{1,4}\s+|第[零〇一二三四五六七八九十百千万\d]+[卷部章节回]|(?:Chapter|Volume)\s+\d+|(?:序章|序言|楔子|番外|尾声)(?:\s|[：:·、]|$))/iu.test(m[0]));
  if(file.kind!=='novel'||!headings.length)chapters.push({id:`chapter-${fn}-${prefix}-0`,title:file.name,ordinal:chapters.length+1,volumeId,volumeTitle,start:offset,bodyStart:offset,end:raw.length,materialId,excluded:file.scope==='author-reference'});
  else{
   const starts=headings.map(m=>({title:m[0].replace(/^#+\s*/,''),at:offset+m.index!,body:offset+m.index!+m[0].length}));
   if(starts[0].at>offset&&raw.slice(offset,starts[0].at).trim())starts.unshift({title:'序言 / 文件前言',at:offset,body:offset});
   let previousNumber:number|undefined;const names=new Set<string>();
   for(const [n,h] of starts.entries()){
    const end=starts[n+1]?.at??raw.length;
    if(/^(?:第.+[卷部]|Volume\s)/i.test(h.title)){volumeId=`volume-${fn}-${n}`;volumeTitle=h.title;previousNumber=undefined;if(!raw.slice(h.body,end).trim())continue;}
    const numeric=/第(\d+)[章节回]|Chapter\s+(\d+)/i.exec(h.title);if(numeric){const value=Number(numeric[1]??numeric[2]);if(previousNumber!==undefined&&value!==previousNumber+1)warnings.push(`${h.title}：编号不连续或重新编号，请按实际目录校正；不补造缺章。`);previousNumber=value;}
    if(names.has(h.title))warnings.push(`重名章节「${h.title}」使用不同稳定ID，不能按标题判定同一章。`);names.add(h.title);
    if(!raw.slice(h.body,end).trim())warnings.push(`${h.title}：空段或目录项，请预览并排除重复目录。`);
    chapters.push({id:`chapter-${fn}-${prefix}-${n}`,title:h.title,ordinal:chapters.length+1,volumeId,volumeTitle,start:h.at,bodyStart:h.body,end,materialId,excluded:file.scope==='author-reference'});
   }
  }
 }
 return {id:id('sourceversion'),workId,version:1,createdAt:now(),hash:createHash('sha256').update(Buffer.concat(bytes)).digest('hex'),raw,encoding:data.files.length===1?data.files[0].encoding:'mixed',originalBase64:data.files.length===1?bytes[0].toString('base64'):undefined,chapters,materials,warnings};
}
export function createSource(domain:Domain,input:unknown){const data=sourceInputSchema.parse(input),wid=id('source'),version=parseSource(data,wid);return domain.store.transaction(()=>{const p:Project={...projectSchema.parse({title:data.title}),id:id('project'),revision:1,createdAt:now(),updatedAt:now(),sourceWorkspace:true};domain.store.put('projects',p);domain.addObject(p.id,{kind:'book',title:data.title,body:'只读原作分析空间，不是可编辑小说。',status:'planned'});const work:SourceWork={id:wid,workspaceId:p.id,title:data.title,author:data.author,origin:data.origin,rights:data.rights,archived:false,revision:1,createdAt:now()};sourcePut(domain.store,'source_works',work);sourcePut(domain.store,'source_versions',version);return {work,version};});}
export function addSourceVersion(domain:Domain,workId:string,input:unknown,revision:number){const work=sourceGet(domain.store,'source_works',workId);requireThat(work.revision===revision,'STALE','来源资料已更新');const version=parseSource(input,workId);version.version=sourceList(domain.store,'source_versions').filter(v=>v.workId===workId).length+1;return domain.store.transaction(()=>{sourcePut(domain.store,'source_versions',version);work.revision++;sourcePut(domain.store,'source_works',work);return version;});}
export function correctDirectory(domain:Domain,versionId:string,input:unknown){const old=sourceGet(domain.store,'source_versions',versionId);const entries=z.array(z.object({id:z.string(),title:z.string().min(1).max(240),start:z.number().int().nonnegative(),bodyStart:z.number().int().nonnegative(),end:z.number().int().nonnegative(),volumeId:z.string(),volumeTitle:z.string(),materialId:z.string(),excluded:z.boolean()})).min(1).parse(input);requireThat(new Set(entries.map(c=>c.id)).size===entries.length,'DIRECTORY','目录ID不能重复');let last=-1;for(const c of entries){requireThat(c.start>=last&&c.start<=c.bodyStart&&c.bodyStart<=c.end&&c.end<=old.raw.length,'DIRECTORY','目录范围无效或重叠');requireThat(old.materials.some(m=>m.id===c.materialId&&c.start>=m.start&&c.end<=m.end&&(m.scope==='baseline'||c.excluded)),'DIRECTORY','章节必须属于其资料文件');last=c.end;}const version={...old,id:id('sourceversion'),version:Math.max(...sourceList(domain.store,'source_versions').filter(v=>v.workId===old.workId).map(v=>v.version))+1,createdAt:now(),chapters:entries.map((c,n)=>({...c,ordinal:n+1})),warnings:[...old.warnings,'目录由作者校正，原始字节和旧目录版本保留。']};return domain.store.transaction(()=>{const work=sourceGet(domain.store,'source_works',old.workId);work.revision++;sourcePut(domain.store,'source_works',work);return sourcePut(domain.store,'source_versions',version);});}
export function boundaryOf(version:SourceVersion,boundary:AdaptationSpec['boundary']){
 const readable=version.chapters.filter(c=>!c.excluded);if(boundary.kind==='all-materials')return {cutoff:readable.at(-1)?.ordinal??0,chapters:readable};
 const anchor=version.chapters.find(c=>boundary.kind.endsWith('volume')?c.volumeId===boundary.id:c.id===boundary.id);requireThat(anchor,'CUTOFF','接续位置不属于所选来源版本');let cutoff=anchor.ordinal;
 if(boundary.kind==='after-volume')cutoff=Math.max(...version.chapters.filter(c=>c.volumeId===anchor.volumeId).map(c=>c.ordinal));
 if(boundary.kind.startsWith('before'))cutoff--;
 return {cutoff,chapters:readable.filter(c=>c.ordinal<=cutoff)};
}
export function sourceRunStatus(domain:Domain,runId:string){const run=sourceGet(domain.store,'source_runs',runId),task=domain.task(sourceGet(domain.store,'source_works',run.workId).workspaceId,run.taskId);const leaves=run.segments.filter(s=>s.state!=='split');const profiles=domain.store.list('tasks',task.projectId).filter(t=>t.kind==='source-profile'&&t.sourceScan?.runId===runId).map(t=>({id:t.id,status:t.status,usage:t.usage,budget:t.budget,error:t.error}));return {run,task,profiles,segments:leaves.length,covered:leaves.filter(s=>s.state==='complete').length,gaps:leaves.filter(s=>s.state!=='complete'),assets:assetsAt(domain,runId).length,events:domain.store.events(task.projectId,task.id)};}
export function startSourceRun(domain:Domain,workId:string,input:any){
 const work=sourceGet(domain.store,'source_works',workId),version=sourceGet(domain.store,'source_versions',z.string().parse(input.versionId));requireThat(version.workId===work.id&&!work.archived,'SOURCE_SCOPE','来源已归档或版本不匹配');const boundary=z.object({kind:manifestSchema.shape.boundary.shape.kind,id:z.string().nullable()}).parse(input.boundary),scope=boundaryOf(version,boundary);
 const run:SourceRun={id:id('scan'),workId,versionId:version.id,taskId:'',cutoffId:boundary.id,cutoff:scope.cutoff,revision:1,segments:[],createdAt:now(),analysisVersion:'source/1'};
 const provider=z.enum(['dsh','demo']).parse(input.provider??'dsh');requireThat(provider==='demo'||input.cloudAuthorized===true,'SOURCE_CONSENT','分析会将所选范围发送到DSH已配置模型；请明确授权此范围',422);
 const chunkChars=z.number().int().min(200).max(10000).parse(input.chunkChars??4000);
 for(const c of scope.chapters){for(let start=c.bodyStart;start<c.end;){let end=Math.min(c.end,start+chunkChars);if(end<c.end){const stop=version.raw.slice(start+Math.floor(chunkChars/2),end).search(/[。；\n][^。；\n]*$/u);if(stop>=0)end=start+Math.floor(chunkChars/2)+stop+1;}if(version.raw.slice(start,end).trim())run.segments.push({id:`segment-${c.id}-${start}-${end}`,chapterId:c.id,start,end,depth:0,state:'pending'});start=end;}}
 requireThat(run.segments.length,'SOURCE_EMPTY','截止范围没有正文；资料包可选择全部所选资料',422);
 const task=domain.createTask(work.workspaceId,{kind:'source-scan',goal:'只扫描允许范围的原文，保留所有可跟踪实体及证据；预算不足保存覆盖缺口。',provider,budget:input.budget??{calls:24,outputTokens:100000,contextChars:18000},sourceScan:{runId:run.id,versionId:version.id,cutoffId:boundary.id,batchSize:input.batchSize??16,chunkChars,cloudAuthorized:input.cloudAuthorized===true},configuration:{patch:{enabled:false}}},task=>{run.taskId=task.id;sourcePut(domain.store,'source_runs',run);});return sourceRunStatus(domain,run.id);
}
export function resolveEvidence(version:SourceVersion,segment:SourceSegment,evidence:any,runId:string):SourceEvidence{
 const raw=version.raw.slice(segment.start,segment.end);const relative=typeof evidence.start==='number'&&raw.slice(evidence.start,evidence.start+evidence.quote.length)===evidence.quote?evidence.start:raw.indexOf(evidence.quote);requireThat(relative>=0,'SOURCE_EVIDENCE','引用不在当前片段，请逐字复制连续原文',422);requireThat(raw.indexOf(evidence.quote,relative+1)<0||typeof evidence.start==='number'&&relative===evidence.start,'SOURCE_EVIDENCE','原文有多处相同引文，请提供准确的片段内start偏移或更长的唯一引文',422);const start=segment.start+relative,c=version.chapters.find(c=>c.id===segment.chapterId)!;return {...evidence,versionId:version.id,chapterId:c.id,ordinal:c.ordinal,start,end:start+evidence.quote.length,runId};
}
export function assetsAt(domain:Domain,runId:string,cutoff?:number):SourceAsset[]{
 const run=sourceGet(domain.store,'source_runs',runId);const allowed=Math.min(z.number().int().nonnegative().parse(cutoff??run.cutoff),run.cutoff);const observations=sourceList(domain.store,'source_assets',run.versionId).filter(a=>a.runId===runId&&!a.invalidated&&a.evidence.length&&a.evidence.every(e=>e.ordinal<=allowed));
 const grouped=new Map<string,SourceAsset>(),canonical=new Map<string,string>();
 for(const a of observations.sort((a,b)=>a.evidence[0].start-b.evidence[0].start)){
  // A model-supplied identity key is a proposal. Different identity descriptions never merge by name similarity.
  const key=['character','world'].includes(a.kind)?`${a.kind}:${a.key}:${a.identity}`:a.id;
  const old=grouped.get(key);canonical.set(a.id,old?.id??a.id);if(old){old.evidence.push(...a.evidence);old.aliases=[...new Set([...old.aliases,...a.aliases])];old.fields={...old.fields,...a.fields};if(a.description)old.description=a.description;}else grouped.set(key,structuredClone(a));
 }
 const items=[...grouped.values()];const keyGroups=new Map<string,SourceAsset[]>();for(const a of items){const group=keyGroups.get(a.key)??[];group.push(a);keyGroups.set(a.key,group);}const keys=new Map([...keyGroups].filter(([,group])=>group.length===1).map(([key,group])=>[key,group[0].id]));const names=new Map<string,SourceAsset[]>();for(const a of items.filter(a=>['character','world'].includes(a.kind))){const nameKey=a.kind+':'+a.name;const group=names.get(nameKey)??[];group.push(a);names.set(nameKey,group);}for(const group of names.values())if(group.length>1)for(const a of group)a.status='ambiguous';
 const resolve=(ref:string)=>canonical.get(ref)??keys.get(ref)??ref;
 for(const a of items)for(const [k,v] of Object.entries(a.refs))a.refs[k]=Array.isArray(v)?v.map(resolve):resolve(v);
 const decisions=sourceList(domain.store,'source_decisions',run.versionId).filter(d=>d.runId===runId&&d.ordinal<=allowed);
 const undone=new Set(decisions.filter(d=>d.action==='undo').map(d=>d.decisionId));
 for(const decision of decisions.filter(d=>!undone.has(d.id)&&d.action!=='undo')){
  const a=items.find(a=>a.id===decision.assetId);if(!a)continue;
  if(decision.action==='merge'){const target=items.find(x=>x.id===decision.targetId);if(!target)continue;a.status='merged';a.mergedInto=target.id;target.aliases=[...new Set([...target.aliases,a.name,...a.aliases])];target.fields=Math.max(...a.evidence.map(e=>e.start))>=Math.max(...target.evidence.map(e=>e.start))?{...target.fields,...a.fields}:{...a.fields,...target.fields};target.evidence.push(...a.evidence);target.manual=true;target.status='verified';for(const x of items)for(const [k,v] of Object.entries(x.refs))x.refs[k]=Array.isArray(v)?v.map(id=>id===a.id?target.id:id):v===a.id?target.id:v;}
  else if(decision.action==='split'){
   const evidence=a.evidence.filter(e=>decision.evidenceStarts.includes(e.start));if(!evidence.length)continue;
   const separated:SourceAsset={...structuredClone(a),id:decision.splitId,key:decision.splitId,...decision.patch,aliases:decision.patch.aliases??[],evidence,fields:{identity:decision.patch.identity??'作者分离的身份，其他属性待确认'},description:'作者按所选证据分离；旧聚合属性不自动继承',refs:{},profile:undefined,status:'verified',manual:true,revision:a.revision+1};
   a.evidence=a.evidence.filter(e=>!decision.evidenceStarts.includes(e.start));a.fields={identity:a.identity};a.description='作者拆分后的剩余证据，其他属性需重新确认';a.profile=undefined;a.manual=true;a.status='verified';a.revision++;
   for(const linked of items)if(Object.values(linked.refs).flat().includes(a.id)){linked.status='ambiguous';linked.description+='（身份拆分影响此引用；需要人工确认关联或不继承）';}
   items.push(separated);
  }
  else if(decision.action==='profile'){a.profile=decision.profile;}
  else if(decision.action==='accept-profile'&&a.profile){for(const key of ['identity','appearance','voice','desire','boundaries'])if(a.profile[key]&&!/^(未知|未证实)$/.test(a.profile[key]))a.fields[key]=a.profile[key];a.profile.accepted=true;a.manual=true;a.revision++;}
  else {Object.assign(a,decision.patch);a.manual=true;a.revision++;a.status='verified';}
 }
 const active=items.filter(a=>a.status!=='merged');const resolvedKeys=new Map<string,string[]>();for(const a of items){const list=resolvedKeys.get(a.key)??[];list.push(a.mergedInto??a.id);resolvedKeys.set(a.key,list);}for(const a of active)for(const [key,value] of Object.entries(a.refs)){const resolve=(ref:string)=>{const ids=[...new Set(resolvedKeys.get(ref)??[])];return ids.length===1?ids[0]:ref;};a.refs[key]=Array.isArray(value)?value.map(resolve):resolve(value);}
 for(const a of active){
  const entity=(ref:unknown)=>typeof ref==='string'&&active.some(x=>x.id===ref&&['character','world','foreshadow'].includes(x.kind));
  const char=(ref:unknown)=>typeof ref==='string'&&active.some(x=>x.id===ref&&x.kind==='character');
  const invalid=a.kind==='fact'&&(typeof a.fields.property!=='string'||typeof a.fields.value!=='string'||!entity(a.refs.entityId))||a.kind==='relationship'&&(typeof a.fields.type!=='string'||typeof a.fields.state!=='string'||!char(a.refs.fromId)||!char(a.refs.toId));
  if(invalid&&a.status!=='ambiguous')a.status='unverified';
  const labels:Record<string,string>={'语言习惯':'voice','说话方式':'voice','外貌':'appearance','所属组':'group','身体状况':'health','当前持有':'inventory','随身物品':'inventory','当前持有者':'holder','保管者':'holder','当前地点':'location','地点':'location','状态':'state'};
  for(const [label,key] of Object.entries(labels))if(a.fields[key]===undefined&&a.fields[label]!==undefined)a.fields[key]=a.fields[label];
  if(a.kind==='world'&&a.fields['唯一性']==='唯一')a.fields.unique=true;
  if(a.kind==='fact'&&labels[a.fields.property])a.fields.property=labels[a.fields.property];
  // Preserve initial identity as a core trait; later actions remain in evidence and state entries.
  if(a.kind==='character'&&a.identity)a.fields.identity=a.identity;
 }
 return active;
}
export function sourceAssetPage(domain:Domain,runId:string,query:URLSearchParams){const run=sourceGet(domain.store,'source_runs',runId);const all=assetsAt(domain,runId,Number(query.get('cutoff')??run.cutoff));const text=(query.get('q')??'').toLocaleLowerCase(),kind=query.get('kind');const filtered=all.filter(a=>(!kind||a.kind===kind)&&(!text||`${a.name} ${a.identity} ${a.aliases.join(' ')} ${a.description}`.toLocaleLowerCase().includes(text)));const offset=Math.max(0,Number(query.get('offset'))||0),limit=Math.min(200,Math.max(1,Number(query.get('limit'))||40));return {items:filtered.slice(offset,offset+limit),total:filtered.length,next:offset+limit<filtered.length?offset+limit:null,allIds:query.get('allIds')==='true'?filtered.map(a=>a.id):undefined};}

export function sourceGraph(domain:Domain,runId:string,query:URLSearchParams){
 const run=sourceGet(domain.store,'source_runs',runId),cutoff=z.number().int().nonnegative().parse(Number(query.get('cutoff')??run.cutoff)),all=assetsAt(domain,runId,cutoff),characters=all.filter(a=>a.kind==='character');
 const search=query.get('q')??'',center=query.get('entity')||characters.find(a=>search&&[a.name,...a.aliases].some(n=>n.includes(search)))?.id;
 requireThat(!center||characters.some(a=>a.id===center),'SOURCE_SCOPE','图谱中心不在允许范围内');
 const relations=new Map<string,SourceAsset>();for(const a of all.filter(a=>a.kind==='relationship').sort((a,b)=>Math.max(...a.evidence.map(e=>e.start))-Math.max(...b.evidence.map(e=>e.start))))relations.set(`${a.refs.fromId}:${a.refs.toId}:${a.fields.type}`,a);
 const edges=[...relations.values()].filter(a=>(!center||[a.refs.fromId,a.refs.toId].includes(center))&&(!query.get('type')||a.fields.type===query.get('type')));
 const linked=new Set(edges.flatMap(a=>[a.refs.fromId,a.refs.toId]).flat());const eligible=characters.filter(a=>!center&&!search||a.id===center||linked.has(a.id));const visible=eligible.sort((a,b)=>Number(b.id===center)-Number(a.id===center)||a.id.localeCompare(b.id)).slice(0,30);const ids=new Set(visible.map(a=>a.id));
 return {cutoff:Math.min(cutoff,run.cutoff),center,characters:visible,relations:edges.filter(a=>ids.has(String(a.refs.fromId))&&ids.has(String(a.refs.toId))),total:characters.length,omitted:Math.max(0,eligible.length-visible.length),reason:'先限制版本与揭露位置，再查角色及一跳关系；最多30节点，不表示作品总容量'};
}
