import { z } from 'zod';
import type { Store } from './store.js';
import { hash } from './store.js';
import { DomainError,id,now,requireThat } from './contracts.js';
import { configPatchSchema,entrySchema,regexRuleSchema,nativePresets,type ConfigPatch,type ConfigVersion,type ConfigSnapshot,type Compatibility,type RegexRule } from './config-contracts.js';
export { nativePresets };
export const converterVersion='novel-import/1';
export function stable(value:unknown):string {
  const visit=(v:any):any=>Array.isArray(v)?v.map(visit):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,visit(v[k])])):v;
  return JSON.stringify(visit(value));
}
function safeRaw(raw:string){requireThat(raw.length<=1_000_000,'CONFIG_SIZE','配置文件限 100 万字符',413);let value:any;try{value=JSON.parse(raw);}catch{throw new DomainError('CONFIG_JSON','配置不是合法 JSON',422);}
  const walk=(v:any,path:string)=>{if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){requireThat(!['__proto__','prototype','constructor'].includes(k),'CONFIG_KEY',`不支持字段 ${path}.${k}`,422);if(/api.?key|password|secret|access.?token/i.test(k)&&typeof x==='string'&&x.trim())throw new DomainError('CONFIG_SECRET',`配置包含凭据字段 ${path}.${k}；请移除后导入，不保存或显示其值`,422);walk(x,`${path}.${k}`);}};walk(value,'root');return value;}
export function importConfiguration(raw:string,name:string,source='本地文件',orderId?:string):ConfigVersion {
  const value=safeRaw(raw);const report:Compatibility[]=[];const unknown:Record<string,unknown>={};let config:ConfigPatch={enabled:true,strategy:'compatible'};let format='unsupported',applicable=true;
  const note=(field:string,status:Compatibility['status'],message:string)=>report.push({field,status,message});
  if(value?.format==='dsh-novel-config'){format='native';config=configPatchSchema.parse(value.config);note('config','SUPPORTED','DSH 原生配置，导入后仍需选择应用范围。');}
  else if(Array.isArray(value?.prompts)){
    format='chat-completion';const orders=Array.isArray(value.prompt_order)?value.prompt_order:[];
    const groups=orders.filter((o:any)=>Array.isArray(o.order));const group=orderId?groups.find((g:any)=>String(g.character_id)===orderId):groups.find((g:any)=>Number(g.character_id)===100001)??groups[0];
    if(orderId)requireThat(group,'CONFIG_ORDER','没有所选 prompt_order 分组',422);
    if(groups.length>1)note('prompt_order','PARTIAL',`存在 ${groups.length} 个顺序分组，当前明确采用 character_id=${group?.character_id}；其他分组保留在原文。`);
    const order:any[]=group?.order??(orders.every((o:any)=>o.identifier)?orders:[]);const used=order.length?order:value.prompts.map((p:any)=>({identifier:p.identifier,enabled:!p.disabled}));
    if(!order.length)note('prompt_order','PARTIAL','没有可用顺序表，使用 prompts 数组顺序；不会为缓存重排。');
    const knownMarkers=new Set(['worldInfoBefore','worldInfoAfter','charDescription','charPersonality','personaDescription','scenario','chatHistory']);
    config.entries=used.map((item:any,n:number)=>{
      const p=value.prompts.find((p:any)=>p.identifier===item.identifier);if(!p){note(`prompt_order.${n}`,'UNSUPPORTED','引用了不存在的 prompt，保留诊断并停用。');return entrySchema.parse({id:String(item.identifier),name:String(item.identifier),content:'',enabled:false,supported:false,order:n});}
      const field=`prompts.${p.identifier}`;let supported=true;let position:'relative'|'before-task'|'after-task'='relative';const role=['system','user','assistant'].includes(p.role)?p.role:'system';
      if(p.role&&!['system','user','assistant'].includes(p.role)){supported=false;note(field+'.role','UNSUPPORTED',`不支持 role=${p.role}，条目停用。`);}
      if(Number(p.injection_position??0)===1){const depth=Number(p.injection_depth??4);if(depth===0||depth===1){position=depth===0?'after-task':'before-task';note(field+'.injection_depth','PARTIAL',`深度 ${depth} 映射到本次任务消息${depth===0?'之后':'之前'}；不模拟聊天楼层。`);}else{supported=false;note(field+'.injection_depth','UNSUPPORTED',`深度 ${depth} 没有小说任务等价物，条目停用。`);}}
      else if(Number(p.injection_position??0)!==0){supported=false;note(field+'.injection_position','UNSUPPORTED','未知注入位置，条目停用。');}
      if(position==='after-task'&&role==='assistant'){supported=false;note(field+'.role','UNSUPPORTED','当前 DSH 未暴露 assistant prefill 开关，不发送末尾 assistant 预填。');}
      const triggers=Array.isArray(p.injection_trigger)?p.injection_trigger:[];
      if(triggers.some((x:string)=>!['normal','continue','quiet'].includes(x))){supported=false;note(field+'.injection_trigger','UNSUPPORTED','仅映射 normal/continue/quiet；其他聊天触发语义不执行。');}
      const marker=p.marker?String(p.identifier):undefined;if(marker&&!knownMarkers.has(marker)){supported=false;note(field+'.marker','UNSUPPORTED',`动态标记 ${marker} 尚无映射，条目停用。`);}else if(marker)note(field+'.marker','PARTIAL','从本次已筛选小说资料映射；chatHistory 指当前任务，不虚构历史聊天。');
      for(const key of Object.keys(p))if(!['identifier','name','content','role','enabled','disabled','marker','system_prompt','position','injection_position','injection_depth','injection_order','injection_trigger','forbid_overrides'].includes(key)){unknown[`${field}.${key}`]=p[key];note(`${field}.${key}`,'UNSUPPORTED','保留原始字段，不执行未知语义。');}
      return entrySchema.parse({id:String(p.identifier??`entry-${n}`),name:String(p.name??p.identifier??`条目 ${n+1}`),content:String(p.content??''),role,enabled:item.enabled!==false&&p.enabled!==false&&!p.disabled,order:position==='relative'?n:Number(p.injection_order??100),position,marker,triggers,supported,original:p});
    });
    note('prompts','SUPPORTED','支持启停、相对顺序及 system/user/assistant；文学条目仅用于 Writer，审校只读取评价依据。');
    config.sampling={};if(value.temperature!==undefined){config.sampling.temperature=z.number().min(0).max(2).parse(value.temperature);note('temperature','SUPPORTED','正文调用的采样参数；结构化任务保持协议自己的采样。');}
    const max=value.openai_max_tokens??value.max_tokens;if(max!==undefined){config.sampling.maxTokens=Math.min(24000,z.number().positive().int().parse(max));note('max_tokens','PARTIAL','作为输出上限，与任务预算及步骤上限取最小值。');}
    const stop=value.stop??value.stop_sequences;if(stop!==undefined){if(Array.isArray(stop)&&stop.length<=4&&stop.every((x:any)=>typeof x==='string'&&x.length>0)){config.sampling.stop=stop;note('stop','SUPPORTED','仅正文调用采用，结构化任务不采用停止词。');}else note('stop','UNSUPPORTED','仅支持最多四条非空停止字符串。');}
    for(const key of Object.keys(value))if(!['name','prompts','prompt_order','temperature','openai_max_tokens','max_tokens','stop','stop_sequences','extensions','regex_scripts'].includes(key)){unknown[key]=value[key];note(key,'UNSUPPORTED',/top_p|top_k|penalty|seed|mirostat/.test(key)?'当前 DSH GenerateOptions 未暴露此采样参数，不伪装为写作指令。':'原始字段保留，不执行未实现设置。');}
  } else if(value?.input_sequence!==undefined||value?.instruct!==undefined||value?.story_string!==undefined||value?.context!==undefined||value?.sampler_order!==undefined){format=value.story_string!==undefined?'context-template':value.input_sequence!==undefined||value.instruct?'instruct':'text-completion';applicable=false;note('format','UNSUPPORTED',`${format} 不是 Chat Completion 预设；保留原文，不自动转换为 system。`);config={enabled:false};}
  else if(value?.findRegex!==undefined||Array.isArray(value)||Array.isArray(value?.regex_scripts)){format='regex';config={enabled:true,strategy:'novel'};}
  else{applicable=false;note('format','UNSUPPORTED','无法识别配置格式；可使用 DSH 原生格式或 Chat Completion prompts。');config={enabled:false};}
  const scripts=Array.isArray(value)?value:value?.findRegex!==undefined?[value]:value?.regex_scripts??value?.extensions?.regex_scripts;
  if(Array.isArray(scripts))config.regex=scripts.flatMap((s:any,n:number)=>convertRegex(s,n,report));
  return {id:id('config'),name:z.string().trim().min(1).max(160).parse(name),createdAt:now(),converter:converterVersion,format,raw,source,config:configPatchSchema.parse(config),report,unknown,applicable};
}
function convertRegex(s:any,n:number,report:Compatibility[]):RegexRule[]{
  if(s.stage){try{return [regexRuleSchema.parse({...s,id:s.id??`regex-${n}`,name:s.name??`规则 ${n+1}`} )];}catch{report.push({field:`regex.${n}`,status:'UNSUPPORTED',message:'原生规则字段不合法，未执行。'});return [];}}
  const field=`regex.${n}`;let supported=true;const note=(message:string)=>{supported=false;report.push({field,status:'UNSUPPORTED',message});};
  let pattern=String(s.findRegex??'');let flags='';const literal=pattern.match(/^\/(.*)\/([a-z]*)$/s);if(literal){pattern=literal[1];flags=literal[2];}
  const placements=Array.isArray(s.placement)?s.placement:[2];if(placements.some((p:number)=>![1,2,5].includes(p)))note('只支持用户任务文本、AI 正文和世界条目；不处理脚本、推理或工具参数。');
  if((s.trimStrings?.length??0)>0)note('Trim Out 语义未实现，请在规则测试台改写为明确捕获组。');
  if((s.minDepth??-1)>0||(s.maxDepth??-1)>0)note('历史聊天深度大于 0 没有小说等价物，规则停用。');
  const stages:RegexRule['stage'][]=s.markdownOnly&&s.promptOnly?['before','display']:s.markdownOnly?['display']:s.promptOnly?['before']:['after'];
  if(stages.includes('after')&&placements.some((p:number)=>p!==2))note('持久改写用户原文/世界资料不被允许；请采用仅发送前规则。');
  if(stages.includes('before')&&placements.includes(2))note('旧 AI 回复的发送前改写没有小说等价物，规则停用；可以对本次完整输出使用生成后规则。');
  if(stages.includes('display')&&placements.some((p:number)=>p!==2))note('展示阶段只映射正文预览；用户目标或世界界面的展示替换尚不支持。');
  if(![undefined,0,1,2].includes(s.substituteRegex))note('未知宏替换模式，规则停用。');
  const known=['id','scriptName','findRegex','replaceString','trimStrings','placement','disabled','markdownOnly','promptOnly','runOnEdit','substituteRegex','minDepth','maxDepth'];for(const k of Object.keys(s))if(!known.includes(k))report.push({field:`${field}.${k}`,status:'UNSUPPORTED',message:'未知规则选项保留在原始文件，不执行。'});
  report.push({field,status:'PARTIAL',message:'生成后处理完整候选；展示只改变显示；不覆盖历史正文。支持 JS RegExp 语法，在可终止 Worker 中执行。'});
  return stages.flatMap(stage=>placements.filter((p:number)=>[1,2,5].includes(p)).map((placement:number)=>regexRuleSchema.parse({id:`${s.id??`regex-${n}`}-${stage}-${placement}`,name:String(s.scriptName??`规则 ${n+1}`),pattern,flags,replacement:String(s.replaceString??'').replaceAll('{{match}}','$&'),enabled:!s.disabled,supported,order:n,stage,scope:placement===1?'goal':placement===5?'world':'prose',onEdit:!!s.runOnEdit,macros:Number(s.substituteRegex)===1?'raw':Number(s.substituteRegex)===2?'escaped':'none',minDepth:s.minDepth??-1,maxDepth:s.maxDepth??-1})));
}
export function adaptToNovel(version:ConfigVersion){const config=structuredClone(version.config);const before=stable(config);config.strategy='novel';config.native={...config.native,base:[config.native?.base,...(config.entries??[]).filter(e=>e.enabled&&e.supported&&!e.marker).map(e=>e.content)].filter(Boolean).join('\n\n')};config.entries=[];return {before,after:stable(config),config,changes:['已启用文学条目合并为基础文风；角色和物理位置改变。','动态 marker 改由小说上下文引擎提供；不会改变作品实体。'],warning:'需接受此映射后保存为独立版本，原兼容版本不变。'};}
export function configVersion(store:Store,key:string):ConfigVersion {const row=store.db.prepare('SELECT data FROM config_versions WHERE id=?').get(key);requireThat(row,'NOT_FOUND','配置版本不存在',404);return JSON.parse(String(row.data));}
export function saveConfig(store:Store,v:ConfigVersion){v={...v,config:configPatchSchema.parse(v.config)};store.db.prepare('INSERT INTO config_versions(id,data) VALUES(?,?)').run(v.id,JSON.stringify(v));return v;}
export function listConfigs(store:Store){return store.db.prepare('SELECT data FROM config_versions ORDER BY rowid DESC').all().map(r=>JSON.parse(String(r.data)) as ConfigVersion);}
export function binding(store:Store,scope:string):string|undefined{return store.db.prepare('SELECT versionId FROM config_bindings WHERE scope=?').get(scope)?.versionId as string|undefined;}
export function bindConfig(store:Store,scope:string,versionId:string|null,expected:string|null){requireThat((binding(store,scope)??null)===expected,'STALE','配置应用范围已变化，请刷新');if(versionId){const v=configVersion(store,versionId);requireThat(v.applicable,'CONFIG_UNSUPPORTED','此格式只可保留，不能启用');store.db.prepare('INSERT INTO config_bindings VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET versionId=excluded.versionId').run(scope,versionId);}else store.db.prepare('DELETE FROM config_bindings WHERE scope=?').run(scope);}
export function resolveConfig(store:Store,projectId:string,override?:{versionId?:string;patch?:ConfigPatch},seed='preview',date='2000-01-01T00:00:00.000Z'):ConfigSnapshot {
  const versions:ConfigSnapshot['versions']=[],origins:Record<string,string>={},report:Compatibility[]=[];let config:ConfigPatch={enabled:false,strategy:'novel'};
  const apply=(patch:ConfigPatch,origin:string)=>{patch=configPatchSchema.parse(patch);for(const [k,v] of Object.entries(patch)){if(v===undefined)continue;if(['native','sampling','bindings','memory'].includes(k)&&v&&typeof v==='object'&&!Array.isArray(v)){(config as any)[k]={...(config as any)[k],...v};for(const key of Object.keys(v))origins[`${k}.${key}`]=origin;}else{(config as any)[k]=v;origins[k]=origin;}}};
  for(const [scope,key] of [['global',binding(store,'global')],[`project:${projectId}`,binding(store,`project:${projectId}`)],['task',override?.versionId]] as const)if(key){const v=configVersion(store,key);requireThat(v.applicable,'CONFIG_UNSUPPORTED','任务不能启用不支持的配置');versions.push({scope,id:v.id,name:v.name});report.push(...v.report);apply(v.config,scope);}
  if(override?.patch)apply(override.patch,'task-inline');return {hash:hash(stable({config,versions})),versions,config,origins,report,seed,date};
}
