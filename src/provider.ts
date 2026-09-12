import type { GenerateOptions, StreamChunk, LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import { DomainError, type CreativeTask } from './contracts.js';
import { promptSystem, type PromptKey } from './prompts.js';
export interface ModelRequest {prompt:PromptKey;input:Record<string,any>;maxTokens:number;signal:AbortSignal;onDelta:(text:string)=>void;task:CreativeTask;}
export interface ModelResult {text:string;outputTokens?:number;estimated?:boolean;model?:{provider:string;model:string;reasoningEffort?:string};}
export interface ModelProvider {info():{available:boolean;name:string;detail:string};generate(request:ModelRequest):Promise<ModelResult>;}
export class UnconfiguredProvider implements ModelProvider {
  info(){return {available:false,name:'DSH 未连接',detail:'在 DSH 中启动插件，并在 Models 中选择已配置模型。也可显式选择演示提供方。'};}
  async generate():Promise<ModelResult>{throw new DomainError('MODEL_UNAVAILABLE',this.info().detail,503);}
}
export class DshProvider implements ModelProvider {
  constructor(private llm:{stream:(options:GenerateOptions)=>AsyncIterable<StreamChunk>;resolveModelInfo?:(provider:string,model:string,signal?:AbortSignal)=>Promise<LlmResolvedModelInfo>},private selection:()=>{provider:string;model:string;reasoningEffort?:any}){}
  info(){const m=this.selection();return {available:!!m.provider&&!!m.model,name:`${m.provider} / ${m.model}`,detail:'复用 DSH 当前模型；凭据由 DSH 管理，实际可用性以调用结果为准'};}
  async generate(r:ModelRequest):Promise<ModelResult>{
    const {createUserMessage}=await import('@deepseek-ai/dsh-llm');const m={...this.selection()};if(!m.provider||!m.model)throw new DomainError('MODEL_UNAVAILABLE','请在 DSH Models 设置当前模型',503);
    if(r.task.reasoning!=='configured'&&this.llm.resolveModelInfo){const meta=await this.llm.resolveModelInfo(m.provider,m.model,r.signal);const efficient=meta.reasoning?.efforts.find(e=>e.id==='off')??meta.reasoning?.efforts.find(e=>e.id==='low');if(efficient)m.reasoningEffort=efficient.id;}
    let text='',outputTokens:number|undefined,finished=false;
    const options:GenerateOptions={...m,system:promptSystem(r.prompt),messages:[createUserMessage({content:[{type:'text',text:JSON.stringify(r.input)}],source:{kind:'plugin',plugin:'@rgywd/dsh-novel-studio',form:'snapshot',sections:[{name:'novel-task-data',text:'Scoped creative task and versioned source material'}]}})],maxTokens:r.maxTokens,signal:r.signal};
    for await(const chunk of this.llm.stream(options)){
      if(chunk.type==='text-delta'){text+=chunk.text;r.onDelta(chunk.text);if(text.length>120000)throw new DomainError('OUTPUT_LIMIT','模型输出超过安全长度',422);}
      if(chunk.type==='usage')outputTokens=chunk.usage.outputTokens;
      if(chunk.type==='finish'){
        finished=true;
        if(chunk.reason.kind==='aborted')throw new DomainError('ABORTED','模型调用已中断');
        if(chunk.reason.kind==='error'){const code=chunk.reason.failure.code;throw new DomainError(['MISSING_CREDENTIAL','AUTH','NO_ADAPTER'].includes(code)?'MODEL_UNAVAILABLE':'MODEL_FAILED',`DSH 模型调用失败：${code}`,502);}
        if(chunk.reason.kind!=='stop')throw Object.assign(new DomainError('INCOMPLETE_OUTPUT','模型输出未完整结束；已保留片段，不能自动接受',502),{outputTokens,model:m});
      }
    }
    if(!finished||!text.trim())throw new DomainError('MODEL_FAILED','模型流未完整返回有效内容',502);
    return {text,outputTokens,model:m};
  }
}
