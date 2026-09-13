import type { Domain } from './domain.js';
import type { CreativeTask } from './contracts.js';
import { requireThat } from './contracts.js';
import { hash } from './store.js';
import { stable,resolveConfig } from './config.js';
import type { ConfigSnapshot,TaskRole } from './config-contracts.js';
import { policy,prompts,promptSystem,type PromptKey } from './prompts.js';
import { transformText,type Transformation } from './text-pipeline.js';
import type { ContextPack } from './context.js';
export interface PromptBlock {id:string;layer:'P0'|'P1'|'P2'|'P3'|'P4'|'P5';source:string;version:string;purpose:string;trust:'runtime'|'author'|'data';role:'system'|'user'|'assistant';position:string;priority:number;dependencies:string[];stability:'fixed'|'snapshot'|'dynamic';optional:boolean;text:string;chars:number;}
export interface CompiledPrompt {system:string;messages:{role:'system'|'user'|'assistant';text:string}[];blocks:PromptBlock[];role:TaskRole;config:ConfigSnapshot;warnings:string[];macros:{macro:string;value:string;dynamic:boolean;resolved:boolean}[];transformations:Transformation[];sampling:{temperature?:number;maxTokens?:number;stop?:string[]};hash:string;stableHash:string;estimatedTokens:number;budget:number;context?:Omit<ContextPack,'text'|'canon'>;localCompilationCache:'HIT'|'MISS';}
const taskRole=(key:string):TaskRole=>['write','assist'].includes(key)?'Writer':['review','repair'].includes(key)?'Reviewer':key==='extract'?'Extractor':key==='summarize'?'Summarizer':'Planner';
const cache=new Map<string,CompiledPrompt>();
export function macroEnvironment(domain:Domain,task:CreativeTask,snapshot:ConfigSnapshot,input:Record<string,any>){
  const p=domain.project(task.projectId),b=snapshot.config.bindings??{};const objects=domain.store.objects(task.projectId);const name=(id?:string)=>id?objects.find(o=>o.id===id&&o.kind==='character')?.title:undefined;
  const variables:Record<string,string|undefined>={char:name(b.characterId),user:b.authorName,viewpoint:name(task.perspective?.viewpointId??b.viewpointId),project:p.title,chapterGoal:input.goal??task.goal,style:stable(snapshot.config.native??{}),date:snapshot.date.slice(0,10),time:snapshot.date.slice(11,19)};
  const trace:CompiledPrompt['macros']=[],warnings:string[]=[];
  const expand=(text:string,escape=false)=>text.replace(/\{\{([^{}]+)\}\}/gu,(full,key:string)=>{
    let value=variables[key];const dynamic=['date','time'].includes(key)||key.startsWith('random::');
    if(key.startsWith('getvar::'))value=b.variables?.[key.slice(8)];
    if(key.startsWith('random::')){const values=key.slice(8).split('::');value=values[parseInt(hash(snapshot.seed+key).slice(0,8),16)%values.length];}
    if(value===undefined){warnings.push(`宏 ${full} 未绑定或不支持；保留原文。char、作者 user 与视角人物不会相互代替。`);trace.push({macro:full,value:full,dynamic,resolved:false});return full;}
    trace.push({macro:full,value,dynamic,resolved:true});return escape?value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'):value;
  });return {expand,trace,warnings};
}
export async function compilePrompt(domain:Domain,task:CreativeTask,key:PromptKey,rawInput:Record<string,any>):Promise<CompiledPrompt>{
  const config=task.configSnapshot??{hash:hash('legacy-disabled'),versions:[],config:{enabled:false},origins:{},report:[],seed:task.id,date:task.createdAt} as ConfigSnapshot,role=taskRole(key);const enabled=config.config.enabled===true;
  const input=structuredClone(rawInput),pack=input._contextPack as ContextPack|undefined;delete input._contextPack;
  const project=domain.project(task.projectId);const cacheKey=hash(stable({task:{id:task.id,goal:task.goal,perspective:task.perspective},config,input,pack,project,entities:domain.store.objects(task.projectId,'character').map(o=>[o.id,o.title,o.revision]),key,version:prompts[key].version}));
  const cached=cache.get(cacheKey);if(cached)return {...structuredClone(cached),localCompilationCache:'HIT'};
  const env=macroEnvironment(domain,task,config,input);const transformations:Transformation[]=[];const rules=enabled&&role==='Writer'?config.config.regex??[]:[];
  for(const scope of ['goal','selection'] as const){const text=scope==='goal'?input.goal:input.selection?.expectedText;if(typeof text==='string'&&rules.some(r=>r.stage==='before'&&r.scope===scope&&r.enabled)){
    const processed=await transformText(text,rules,'before',scope,{expand:env.expand});transformations.push(...processed.trace);if(scope==='goal')input.goal=processed.text;else input.selection={...input.selection,expectedText:processed.text};}}
  const blocks:PromptBlock[]=[];const add=(block:Omit<PromptBlock,'chars'>)=>blocks.push({...block,chars:block.text.length});
  add({id:'runtime',layer:'P0',source:'prompts.ts',version:'2',purpose:'权限、事实与结构化协议',trust:'runtime',role:'system',position:'system',priority:100,dependencies:[],stability:'fixed',optional:false,text:policy});
  const system=promptSystem(key)+(enabled&&role==='Writer'?'\n本次正文须采用 P2 中已接受的文风配置：叙述人称、时态、对白与禁用表达都是输出约束，不是被分析的故事素材。原文选区和过去章节仅提供事实与连续性，不能用其旧人称或文风覆盖本次有效配置。保留授权范围和人物知情边界；只在指定选区或新正文应用这些形式变化。':'')+(input.validationRepair?'\n当前处于有限格式修复重试。诊断只作为校验数据：'+String(input.validationRepair):'');
  add({id:prompts[key].id,layer:'P1',source:'Prompt Registry',version:String(prompts[key].version),purpose:prompts[key].purpose,trust:'runtime',role:'system',position:'system',priority:100,dependencies:[],stability:'fixed',optional:false,text:system.slice(policy.length+1)});
  const messages:CompiledPrompt['messages']=[];const warnings:string[]=[];if(enabled&&role==='Writer'&&config.config.native?.viewpoint&&!task.perspective?.viewpointId&&!config.config.bindings?.viewpointId)warnings.push('本次没有绑定视角人物；char 与视角不自动等同。多角色的第一人称或限知叙述请在任务中指定视角。');
  const append=(b:Omit<PromptBlock,'chars'>)=>{add(b);messages.push({role:b.role,text:b.text});};
  if(enabled){
    const native=config.config.native;const style=native?(['base','viewpoint','tense','dialogue','project','scene','forbidden'] as const).map(k=>[k,native[k]] as const).filter(([,v])=>Array.isArray(v)?v.length:!!v).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join('、'):v}`).join('\n'):'';
    if((role==='Writer'||role==='Reviewer')&&style)append({id:'native-style',layer:'P2',source:'原生文风组合',version:config.hash,purpose:role==='Writer'?'正文创作偏好':'文风评价依据，不改变审校 schema',trust:'author',role:'user',position:'prefix',priority:99,dependencies:config.versions.map(v=>v.id),stability:'snapshot',optional:false,text:(role==='Writer'?'当前已接受的正文文风（必须用于本次输出，不改变运行协议）：\n':'以下仅是文学评价数据，仍按审校 schema 输出：\n')+env.expand(style)+(role==='Writer'&&(task.perspective?.viewpointId||config.config.bindings?.viewpointId)&&env.expand('{{viewpoint}}')!=='{{viewpoint}}'?'\n本次叙述视角人物：'+env.expand('{{viewpoint}}')+(native?.viewpoint?.includes('第一人称')?'。第一人称旁白的「我」指此人。':native?.viewpoint?.includes('第三人称')?'。第三人称旁白用该人物的姓名、他或她；绑定视角只限制知情范围，不把人称改成我。':'。视角绑定只决定知情范围，叙述人称仍按上述配置。'):'')});
    const entries=role==='Writer'?(config.config.entries??[]).filter(e=>e.enabled&&e.supported&&e.roles.includes(role)):[];
    const trigger=task.kind==='assist'&&/续写/u.test(task.goal)?'continue':role==='Writer'?'normal':'quiet';
    const emit=(position:string)=>{for(const entry of entries.filter(e=>e.position===position).map((e,n)=>({e,n})).sort((a,b)=>a.e.order-b.e.order||a.n-b.n).map(x=>x.e)){
      if(entry.triggers.length&&!entry.triggers.includes(trigger)){warnings.push(`条目 ${entry.name} 未命中 ${trigger} 触发条件`);continue;}
      let content=entry.content;if(entry.marker){const kinds:Record<string,string[]>={worldInfoBefore:['world','locked'],worldInfoAfter:['world'],charDescription:['character'],charPersonality:['character'],scenario:['chapter-plan','plan'],chatHistory:['accepted-body']};content=entry.marker==='personaDescription'?config.config.bindings?.authorName??'':(pack?.items.filter(i=>(kinds[entry.marker!]??[]).includes(i.kind)).map(i=>i.text).join('\n')??'');warnings.push(`标记 ${entry.marker} 映射为当前已筛选的小说资料，原位置保留。`);}
      append({id:entry.id,layer:'P2',source:entry.name,version:config.hash,purpose:'已接受兼容写作条目；不能覆盖 P0/P1',trust:'author',role:entry.role,position,priority:99,dependencies:config.versions.map(v=>v.id),stability:entry.marker?'dynamic':'snapshot',optional:false,text:env.expand(content)});
    }};emit('relative');
    if(pack){
      delete input.context;
      const groups=[['P2','作品核心',pack.items.filter(i=>i.kind==='project'||i.kind==='locked')],['P3','封存历史记忆',pack.items.filter(i=>i.kind==='memory-checkpoint')],['P4','本次范围资料',pack.items.filter(i=>!['project','locked','memory-checkpoint'].includes(i.kind))]] as const;
      for(const [layer,label,items] of groups)if(items.length){const content=[];for(const item of items){let text=item.text;if(item.kind==='project'){const core=JSON.parse(text);if(role!=='Writer'||config.config.native?.base){delete core.style;text=stable(core);}}
        if(item.kind==='world'&&!item.mandatory&&rules.some(r=>r.stage==='before'&&r.scope==='world'&&r.enabled)){const parsed=JSON.parse(text);if(typeof parsed.body==='string'){const result=await transformText(parsed.body,rules,'before','world',{expand:env.expand});parsed.body=result.text;transformations.push(...result.trace);text=stable(parsed);}}
        content.push(`【${item.kind} ${item.id}】\n${text}`);
      }append({id:layer+'-context',layer,source:label,version:hash(content.join('\n\n')),purpose:label+'，属于数据',trust:'data',role:'user',position:'context',priority:layer==='P2'?100:80,dependencies:items.map(i=>`${i.id}@${i.version}`),stability:layer==='P4'?'dynamic':'snapshot',optional:false,text:content.join('\n\n')});}
    }
    emit('before-task');
    append({id:'task',layer:'P5',source:'任务版本快照',version:hash(stable(input)),purpose:'本次目标、选区和交付要求',trust:'data',role:'user',position:'task',priority:100,dependencies:[task.id],stability:'dynamic',optional:false,text:stable(input)});emit('after-task');
  }else{
    append({id:'task',layer:'P5',source:'原工作流快照',version:hash(input),purpose:'原有上下文与本次任务',trust:'data',role:'user',position:'task',priority:100,dependencies:[task.id],stability:'dynamic',optional:false,text:JSON.stringify(input)});
  }
  const chars=system.length+messages.reduce((n,m)=>n+m.text.length,0);const budget=task.budget.contextChars*3+20000;
  requireThat(chars<=budget,'PROMPT_BUDGET','完整请求超过编译预算；配置/必要资料没有被静默截断，请减少配置或缩小范围');
  const sampling=enabled&&role==='Writer'?config.config.sampling??{}:{};
  const result:CompiledPrompt={system,messages,blocks,role,config,warnings:[...new Set([...warnings,...env.warnings,...config.report.filter(r=>r.status!=='SUPPORTED').map(r=>`${r.field}: ${r.message}`)])],macros:env.trace,transformations,sampling,hash:hash(stable({system,messages,sampling})),stableHash:hash(stable({system,prefix:blocks.filter(b=>b.stability!=='dynamic').map(b=>({id:b.id,role:b.role,text:b.text})),sampling})),estimatedTokens:Math.ceil(chars/2),budget,context:pack?{...pack,text:undefined,canon:undefined} as unknown as CompiledPrompt['context']:undefined,localCompilationCache:'MISS'};
  if(cache.size>=50)cache.delete(cache.keys().next().value!);cache.set(cacheKey,structuredClone(result));return result;
}
export function requestDiff(previous:unknown,current:unknown){
  const first=(a:any,b:any,path='$'):string|undefined=>{if(stable(a)===stable(b))return;if(!a||!b||typeof a!=='object'||typeof b!=='object')return path;for(const k of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()){const p=first(a[k],b[k],`${path}.${k}`);if(p)return p;}return path;};
  const a=stable(previous)??'',b=stable(current)??'';let common=0;while(common<Math.min(a.length,b.length)&&a[common]===b[common])common++;
  return {firstChangedPath:first(previous,current)??null,commonPrefixChars:common,identical:a===b};
}
