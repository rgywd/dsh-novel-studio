import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { DomainError,requireThat } from './contracts.js';
import { regexRuleSchema,type RegexRule } from './config-contracts.js';
export interface Transformation {id:string;name:string;stage:string;scope:string;before:string;after:string;matches:{start:number;end:number;text:string}[];elapsedMs:number;error?:string;}
// Only this fixed program is evaluated. User patterns are data to RegExp in a terminable thread.
const program=String.raw`
const {parentPort,workerData}=require('node:worker_threads');
try {
 const {text,rule,maxMatches,maxOutput}=workerData;
 const rx=new RegExp(rule.pattern,rule.flags); const matches=[];
 const scan=new RegExp(rule.pattern,rule.flags.includes('g')?rule.flags:rule.flags+'g');
 for(let m;(m=scan.exec(text));){
   if(matches.length>=maxMatches)throw Error('替换次数超过限制');
   matches.push({start:m.index,end:m.index+m[0].length,text:m[0]});
   if(!rule.flags.includes('g'))break;
   if(m[0].length===0){const point=text.codePointAt(scan.lastIndex);scan.lastIndex+=(rule.flags.includes('u')||rule.flags.includes('v'))&&point>65535?2:1;}
 }
 const output=text.replace(rx,rule.replacement);
 if(output.length>maxOutput)throw Error('变换结果超过安全长度');
 parentPort.postMessage({output,matches});
}catch(e){parentPort.postMessage({error:e.message});}`;
async function runRule(text:string,rule:RegexRule,timeoutMs:number):Promise<{output:string;matches:Transformation['matches']}>{
  return new Promise((resolve,reject)=>{
    const worker=new Worker(program,{eval:true,workerData:{text,rule,maxMatches:1000,maxOutput:120000},resourceLimits:{maxOldGenerationSizeMb:32}});
    let done=false;const finish=(value:any,error?:Error)=>{if(done)return;done=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(null,new DomainError('REGEX_TIMEOUT',`规则「${rule.name}」已在隔离线程中终止：超过 ${timeoutMs} ms`,422)),timeoutMs);
    worker.once('message',value=>value.error?finish(null,new DomainError('REGEX_INVALID',`规则「${rule.name}」：${value.error}`,422)):finish(value));
    worker.once('error',()=>finish(null,new DomainError('REGEX_WORKER','文本处理线程失败',422)));
    worker.once('exit',code=>{if(!done&&code!==0)finish(null,new DomainError('REGEX_WORKER','文本处理线程提前结束',422));});
  });
}
export async function transformText(original:string,rules:RegexRule[],stage:RegexRule['stage'],scope:RegexRule['scope'],options:{timeoutMs?:number;edited?:boolean;test?:boolean;expand?:(value:string,escape:boolean)=>string}={}){
  requireThat(original.length<=100000,'REGEX_INPUT','文本处理单次输入限 10 万字符',422);requireThat(rules.length<=40,'REGEX_COUNT','文本规则最多 40 条',422);
  let text=original;const trace:Transformation[]=[];
  for(const candidate of rules.map((r,n)=>({r,n})).sort((a,b)=>a.r.order-b.r.order||a.n-b.n).map(x=>x.r)){
    const rule=regexRuleSchema.parse(candidate);if(!rule.enabled||!rule.supported||rule.stage!==stage||rule.scope!==scope||(options.edited&&!rule.onEdit))continue;
    if(rule.macros!=='none'&&options.expand){rule.pattern=options.expand(rule.pattern,rule.macros==='escaped');rule.replacement=options.expand(rule.replacement,false);}
    const before=text,start=performance.now();try{const result=await runRule(before,rule,options.timeoutMs??500);text=result.output;trace.push({id:rule.id,name:rule.name,stage,scope,before,after:text,matches:result.matches,elapsedMs:Math.round(performance.now()-start)});}
    catch(e){const error=e instanceof DomainError?e:new DomainError('REGEX_INVALID','正则处理失败',422);trace.push({id:rule.id,name:rule.name,stage,scope,before,after:before,matches:[],elapsedMs:Math.round(performance.now()-start),error:error.message});if(!options.test)throw Object.assign(error,{transformations:trace});break;}
  }
  return {original,text,trace};
}
