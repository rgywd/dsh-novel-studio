import type { GenerateOptions, StreamChunk, LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import { DomainError, type CreativeTask } from './contracts.js';
import { prompts,promptSystem, type PromptKey } from './prompts.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { CompiledPrompt } from './compiler.js';
import type { UsageRecord } from './requests.js';
export interface ModelRequest {prompt:PromptKey;input:Record<string,any>;maxTokens:number;signal:AbortSignal;onDelta:(text:string)=>void;task:CreativeTask;compiled?:CompiledPrompt;onRequest?:(request:unknown)=>void;}
export interface ModelResult {text:string;outputTokens?:number;estimated?:boolean;model?:{provider:string;model:string;reasoningEffort?:string};usage?:UsageRecord;}
export interface ModelProvider {info():{available:boolean;name:string;detail:string};generate(request:ModelRequest):Promise<ModelResult>;}
export class UnconfiguredProvider implements ModelProvider {
  info(){return {available:false,name:'DSH 未连接',detail:'在 DSH 中启动插件，并在 Models 中选择已配置模型。也可显式选择演示提供方。'};}
  async generate():Promise<ModelResult>{throw new DomainError('MODEL_UNAVAILABLE',this.info().detail,503);}
}
export class DshProvider implements ModelProvider {
  constructor(private llm:{stream:(options:GenerateOptions)=>AsyncIterable<StreamChunk>;resolveModelInfo?:(provider:string,model:string,signal?:AbortSignal)=>Promise<LlmResolvedModelInfo>},private selection:()=>{provider:string;model:string;reasoningEffort?:any}){}
  info(){const m=this.selection();return {available:!!m.provider&&!!m.model,name:`${m.provider} / ${m.model}`,detail:'复用 DSH 当前模型；凭据由 DSH 管理，实际可用性以调用结果为准'};}
  async generate(r:ModelRequest):Promise<ModelResult>{
    const started=performance.now();let firstTokenMs:number|undefined,usage:UsageRecord|undefined;
    const {createMessage}=await import('@deepseek-ai/dsh-llm');const m={...this.selection()};if(!m.provider||!m.model)throw new DomainError('MODEL_UNAVAILABLE','请在 DSH Models 设置当前模型',503);
    if(r.task.reasoning!=='configured'&&this.llm.resolveModelInfo){const meta=await this.llm.resolveModelInfo(m.provider,m.model,r.signal);const efficient=meta.reasoning?.efforts.find(e=>e.id==='off')??meta.reasoning?.efforts.find(e=>e.id==='low');if(efficient)m.reasoningEffort=efficient.id;}
    let text='',outputTokens:number|undefined,finished=false;const schema=prompts[r.prompt].schema;const submissions:string[]=[];
    const messages=r.compiled?.messages??[{role:'user' as const,text:JSON.stringify(r.input)}];
    const options:GenerateOptions={...m,system:r.compiled?.system??promptSystem(r.prompt),messages:messages.map(message=>createMessage({role:message.role,content:[{type:'text',text:message.text}],source:{kind:'plugin',plugin:'@rgywd/dsh-novel-studio',form:'snapshot',sections:[{name:'novel-task-data',text:'Versioned creative input'}]}})),maxTokens:Math.min(r.maxTokens,r.compiled?.sampling.maxTokens??r.maxTokens),signal:r.signal,...(r.compiled?.sampling.temperature!==undefined?{temperature:r.compiled.sampling.temperature}:{}),...(r.compiled?.sampling.stop?{stop:r.compiled.sampling.stop}:{})};
    if(schema){options.temperature=0.2;options.tools=[{name:'submit_novel_result',description:'Return the requested structured creative result. This only returns data and does not apply any changes.',parameters:zodToJsonSchema(schema,{$refStrategy:'none'})}];options.system+='\n本次结构化交付请调用 submit_novel_result 一次，以函数参数返回完整结果。不要添加解释性正文。它仅返回数据，不会直接接受或修改作品。';}
    // This is the observable DSH invocation, not a guessed downstream HTTP body. No connection or credential is stored.
    const requestChars=JSON.stringify({system:options.system,messages:options.messages.map(message=>({role:message.role,content:message.content})),tools:options.tools}).length;
    if(r.compiled&&requestChars>r.compiled.budget)throw new DomainError('PROMPT_BUDGET','最终 DSH 请求（含工具 Schema）超过预算；没有截断必要内容');
    r.onRequest?.({...m,system:options.system,messages:options.messages.map(message=>({role:message.role,content:message.content})),maxTokens:options.maxTokens,temperature:options.temperature,stop:options.stop,tools:options.tools});
    try{for await(const chunk of this.llm.stream(options)){
      if(firstTokenMs===undefined&&((chunk.type==='text-delta'&&chunk.text)||(chunk.type==='tool-call-delta'&&chunk.argumentsDelta)))firstTokenMs=Math.round(performance.now()-started);
      if(chunk.type==='text-delta'){text+=chunk.text;r.onDelta(chunk.text);if(text.length>120000)throw new DomainError('OUTPUT_LIMIT','模型输出超过安全长度',422);}
      if(chunk.type==='tool-call-delta'&&schema)r.onDelta(chunk.argumentsDelta);
      if(chunk.type==='block-end'&&chunk.block.type==='tool-call'&&schema){requireSubmission(chunk.block.name,submissions.length);submissions.push(chunk.block.arguments);text=chunk.block.arguments;}
      if(chunk.type==='usage'){const u=chunk.usage;outputTokens=u.outputTokens;usage={uncachedInputTokens:u.inputTokens,inputTokens:u.cacheReadTokens!==undefined||u.cacheWriteTokens!==undefined?u.inputTokens+(u.cacheReadTokens??0)+(u.cacheWriteTokens??0):undefined,outputTokens:u.outputTokens,cacheReadTokens:u.cacheReadTokens,cacheWriteTokens:u.cacheWriteTokens,totalTokens:u.totalTokens,reasoningTokens:u.reasoningTokens,serverCache:u.cacheReadTokens!==undefined||u.cacheWriteTokens!==undefined?'REPORTED':'UNKNOWN',elapsedMs:0};}
      if(chunk.type==='finish'){
        finished=true;
        if(chunk.reason.kind==='aborted')throw new DomainError('ABORTED','模型调用已中断');
        if(chunk.reason.kind==='error'){const code=chunk.reason.failure.code;throw new DomainError(['MISSING_CREDENTIAL','AUTH','NO_ADAPTER'].includes(code)?'MODEL_UNAVAILABLE':'MODEL_FAILED',`DSH 模型调用失败：${code}`,502);}
        if(chunk.reason.kind!=='stop'&&!(schema&&chunk.reason.kind==='tool-calls'&&submissions.length===1))throw Object.assign(new DomainError('INCOMPLETE_OUTPUT','模型输出未完整结束；已保留片段，不能自动接受',502),{outputTokens,model:m});
      }
    }
    if(!finished||!text.trim())throw new DomainError('MODEL_FAILED','模型流未完整返回有效内容',502);
    return {text,outputTokens,model:m,usage:{...(usage??{serverCache:'UNKNOWN'}),firstTokenMs,elapsedMs:Math.round(performance.now()-started)}};
    }catch(error){throw Object.assign(error instanceof Error?error:new DomainError('MODEL_FAILED','模型流失败'),{outputTokens,model:m,usage:{...(usage??{serverCache:'UNKNOWN'}),firstTokenMs,elapsedMs:Math.round(performance.now()-started)}});}
  }
}
function requireSubmission(name:string,count:number){if(name!=='submit_novel_result'||count!==0)throw new DomainError('INVALID_OUTPUT','结构化交付只允许一次 submit_novel_result，不执行其他工具',422);}
