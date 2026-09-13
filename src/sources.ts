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
export function sourceList<K extends keyof Records>(store:Store,table:K):Records[K][]{return store.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all().map(r=>JSON.parse(r.data as string));}
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
export function correctDirectory(domain:Domain,versionId:string,input:unknown){const old=sourceGet(domain.store,'source_versions',versionId);const entries=z.array(z.object({id:z.string(),title:z.string().min(1).max(240),start:z.number().int().nonnegative(),bodyStart:z.number().int().nonnegative(),end:z.number().int().nonnegative(),volumeId:z.string(),volumeTitle:z.string(),materialId:z.string(),excluded:z.boolean()})).min(1).parse(input);requireThat(new Set(entries.map(c=>c.id)).size===entries.length,'DIRECTORY','目录ID不能重复');let last=-1;for(const c of entries){requireThat(c.start>=last&&c.start<=c.bodyStart&&c.bodyStart<=c.end&&c.end<=old.raw.length,'DIRECTORY','目录范围无效或重叠');requireThat(old.materials.some(m=>m.id===c.materialId&&c.start>=m.start&&c.end<=m.end&&(m.scope==='baseline'||c.excluded)),'DIRECTORY','章节必须属于其资料文件');last=c.end;}const version={...old,id:id('sourceversion'),version:Math.max(...sourceList(domain.store,'source_versions').filter(v=>v.workId===old.workId).map(v=>v.version))+1,createdAt:now(),chapters:entries.map((c,n)=>({...c,ordinal:n+1})),warnings:[...old.warnings,'目录由作者校正，原始字节和旧目录版本保留。']};return domain.store.transaction(()=>sourcePut(domain.store,'source_versions',version));}
export function boundaryOf(version:SourceVersion,boundary:AdaptationSpec['boundary']){
 const readable=version.chapters.filter(c=>!c.excluded);if(boundary.kind==='all-materials')return {cutoff:readable.at(-1)?.ordinal??0,chapters:readable};
 const anchor=version.chapters.find(c=>boundary.kind.endsWith('volume')?c.volumeId===boundary.id:c.id===boundary.id);requireThat(anchor,'CUTOFF','接续位置不属于所选来源版本');let cutoff=anchor.ordinal;
 if(boundary.kind==='after-volume')cutoff=Math.max(...version.chapters.filter(c=>c.volumeId===anchor.volumeId).map(c=>c.ordinal));
 if(boundary.kind.startsWith('before'))cutoff--;
 return {cutoff,chapters:readable.filter(c=>c.ordinal<=cutoff)};
}
export function sourceRunStatus(domain:Domain,runId:string){const run=sourceGet(domain.store,'source_runs',runId),task=domain.task(sourceGet(domain.store,'source_works',run.workId).workspaceId,run.taskId);const leaves=run.segments.filter(s=>s.state!=='split');return {run,task,segments:leaves.length,covered:leaves.filter(s=>s.state==='complete').length,gaps:leaves.filter(s=>s.state!=='complete'),assets:assetsAt(domain,runId).length,events:domain.store.events(task.projectId,task.id)};}
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
 const raw=version.raw.slice(segment.start,segment.end);const relative=typeof evidence.start==='number'&&raw.slice(evidence.start,evidence.start+evidence.quote.length)===evidence.quote?evidence.start:raw.indexOf(evidence.quote);requireThat(relative>=0,'SOURCE_EVIDENCE','引用不在当前片段，请逐字复制连续原文',422);const start=segment.start+relative,c=version.chapters.find(c=>c.id===segment.chapterId)!;return {...evidence,versionId:version.id,chapterId:c.id,ordinal:c.ordinal,start,end:start+evidence.quote.length,runId};
}
export function assetsAt(domain:Domain,runId:string,cutoff?:number):SourceAsset[]{
 const run=sourceGet(domain.store,'source_runs',runId);const allowed=Math.min(cutoff??run.cutoff,run.cutoff);const observations=sourceList(domain.store,'source_assets').filter(a=>a.runId===runId&&a.versionId===run.versionId&&a.evidence.length&&a.evidence.every(e=>e.ordinal<=allowed));
 const grouped=new Map<string,SourceAsset>(),canonical=new Map<string,string>();
 for(const a of observations.sort((a,b)=>a.evidence[0].start-b.evidence[0].start)){
  // A model-supplied identity key is a proposal. Different identity descriptions never merge by name similarity.
  const key=['character','world'].includes(a.kind)?`${a.kind}:${a.key}:${a.identity}`:a.id;
  const old=grouped.get(key);canonical.set(a.id,old?.id??a.id);if(old){old.evidence.push(...a.evidence);old.aliases=[...new Set([...old.aliases,...a.aliases])];old.fields={...old.fields,...a.fields};if(a.description)old.description=a.description;}else grouped.set(key,structuredClone(a));
 }
 const items=[...grouped.values()];const keyGroups=new Map<string,SourceAsset[]>();for(const a of items){const group=keyGroups.get(a.key)??[];group.push(a);keyGroups.set(a.key,group);}const keys=new Map([...keyGroups].filter(([,group])=>group.length===1).map(([key,group])=>[key,group[0].id]));const names=new Map<string,SourceAsset[]>();for(const a of items.filter(a=>a.kind==='character')){const group=names.get(a.name)??[];group.push(a);names.set(a.name,group);}for(const group of names.values())if(group.length>1)for(const a of group)a.status='ambiguous';
 const resolve=(ref:string)=>canonical.get(ref)??keys.get(ref)??ref;
 for(const a of items)for(const [k,v] of Object.entries(a.refs))a.refs[k]=Array.isArray(v)?v.map(resolve):resolve(v);
 for(const decision of sourceList(domain.store,'source_decisions').filter(d=>d.versionId===run.versionId&&d.runId===runId&&d.ordinal<=allowed)){
  const a=items.find(a=>a.id===decision.assetId);if(!a)continue;
  if(decision.action==='merge'){const target=items.find(x=>x.id===decision.targetId);if(!target)continue;a.status='merged';a.mergedInto=target.id;target.aliases=[...new Set([...target.aliases,a.name,...a.aliases])];target.evidence.push(...a.evidence);target.manual=true;target.status='verified';for(const x of items)for(const [k,v] of Object.entries(x.refs))x.refs[k]=Array.isArray(v)?v.map(id=>id===a.id?target.id:id):v===a.id?target.id:v;}
  else if(decision.action==='profile'){a.profile=decision.profile;}
  else if(decision.action==='accept-profile'&&a.profile){for(const key of ['identity','appearance','voice','desire','boundaries'])if(a.profile[key]&&!/^(未知|未证实)$/.test(a.profile[key]))a.fields[key]=a.profile[key];a.profile.accepted=true;a.manual=true;a.revision++;}
  else {Object.assign(a,decision.patch);a.manual=true;a.revision++;a.status='verified';}
 }
 return items.filter(a=>a.status!=='merged');
}
export function sourceAssetPage(domain:Domain,runId:string,query:URLSearchParams){const run=sourceGet(domain.store,'source_runs',runId);const all=assetsAt(domain,runId,Number(query.get('cutoff')??run.cutoff));const text=(query.get('q')??'').toLocaleLowerCase(),kind=query.get('kind');const filtered=all.filter(a=>(!kind||a.kind===kind)&&(!text||`${a.name} ${a.identity} ${a.aliases.join(' ')} ${a.description}`.toLocaleLowerCase().includes(text)));const offset=Math.max(0,Number(query.get('offset'))||0),limit=Math.min(200,Math.max(1,Number(query.get('limit'))||40));return {items:filtered.slice(offset,offset+limit),total:filtered.length,next:offset+limit<filtered.length?offset+limit:null,allIds:query.get('allIds')==='true'?filtered.map(a=>a.id):undefined};}
