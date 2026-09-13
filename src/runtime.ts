import { ZodError } from 'zod';
import { Domain,editablePlan } from './domain.js';
import { buildContext } from './context.js';
import { validateReview } from './review.js';
import { prompts, type PromptKey } from './prompts.js';
import { hash } from './store.js';
import { compilePrompt,macroEnvironment } from './compiler.js';
import { beginRequest,observeRequest,requestPut } from './requests.js';
import { transformText } from './text-pipeline.js';
import { sourceFor,memoryStatus,validateMemoryContent,rollingPlanning } from './memory.js';
import { DemoProvider } from './demo.js';
import { UnconfiguredProvider, type ModelProvider } from './provider.js';
import { DomainError, activeStatuses, now, requireThat, type Artifact, type CreativeTask, type Review, type RunStep, type StoryObject } from './contracts.js';

export class Runner {
  running=new Map<string,Promise<void>>();controllers=new Map<string,AbortController>();closed=false;
  constructor(public domain:Domain,public provider:ModelProvider=new UnconfiguredProvider(),public demo:ModelProvider=new DemoProvider(),public timeoutMs=90000){domain.onInterrupt=(taskId)=>this.controllers.get(taskId)?.abort();}
  start(taskId:string){if(this.closed||this.running.has(taskId))return;const promise=this.run(taskId).finally(()=>{this.running.delete(taskId);this.controllers.delete(taskId);if(!this.closed&&this.domain.store.get('tasks',taskId).status==='QUEUED')this.start(taskId);});this.running.set(taskId,promise);}
  async idle(taskId:string){while(this.running.has(taskId))await this.running.get(taskId);}
  async close(){this.closed=true;for(const [taskId,c] of this.controllers){const t=this.domain.store.get('tasks',taskId);if(activeStatuses.includes(t.status)){t.status='PAUSE_REQUESTED';this.domain.store.put('tasks',t);}c.abort();}await Promise.allSettled(this.running.values());}
  private current(taskId:string){return this.domain.store.get('tasks',taskId);}
  private boundary(taskId:string,epoch?:number){const t=this.current(taskId);requireThat(t.status==='RUNNING','STOPPED','任务已暂停或取消');requireThat(epoch===undefined||t.epoch===epoch,'STALE','本轮依赖已失效');this.domain.guard(t.projectId,t.expectedRevision);return t;}
  private patch(taskId:string,fn:(t:CreativeTask)=>void){const t=this.current(taskId);fn(t);t.updatedAt=now();this.domain.store.put('tasks',t);return t;}
  private async run(taskId:string){
    let t=this.current(taskId);if(t.status!=='QUEUED')return;
    try{
      this.domain.guard(t.projectId,t.expectedRevision);t=this.patch(taskId,t=>{t.status='RUNNING';t.error=undefined;});
      this.domain.store.event(t.projectId,t.id,'task.running','任务开始执行；进度来自实际落盘步骤');
      if(!['assist','ideas'].includes(t.kind)&&t.contract.briefEpoch!==t.epoch){const brief=await this.step(taskId,'整理任务约定','brief',{goal:t.goal,kind:t.kind,count:t.count,targetWords:t.targetWords,constraints:t.constraints,contract:{scope:t.contract.scope,permitted:t.contract.permitted,forbidden:t.contract.forbidden},budget:t.budget});this.boundary(taskId);t=this.patch(taskId,t=>{t.contract.brief=brief;t.contract.briefEpoch=t.epoch;});this.domain.store.event(t.projectId,t.id,'task.brief',brief.objective,{approach:brief.approach,assumptions:brief.assumptions});}
      if(t.contract.brief?.question){this.patch(taskId,t=>{t.status='NEEDS_INPUT';t.error={code:'TASK_CLARIFICATION',message:t.contract.brief!.question!};});throw new DomainError('TASK_CLARIFICATION',t.contract.brief.question);}
      if(t.kind==='write')await this.write(taskId);
      else if(t.kind==='review')await this.reviewTask(taskId);
      else await this.oneShot(taskId);
      this.boundary(taskId);this.patch(taskId,t=>{t.status='COMPLETED';t.currentStep='completed';});this.domain.store.event(t.projectId,t.id,'task.completed','任务已完成；成果已落盘');
    }catch(error){
      const e=publicError(error);const fresh=this.current(taskId);
      if(fresh.status==='CANCELED')return;
      if(fresh.status==='QUEUED'||fresh.epoch!==t.epoch)return;
      if(fresh.status==='PAUSE_REQUESTED'||fresh.status==='PAUSED'||e.code==='STOPPED'){this.patch(taskId,t=>{t.status='PAUSED';});return;}
      if(fresh.status==='NEEDS_INPUT')return;
      const paused=['BUDGET_EXHAUSTED','STALE','CONTEXT_LOCK_OVERFLOW','PROMPT_BUDGET','MEMORY_GAP'].includes(e.code);
      const needs=['CONFLICT','REVIEW_REQUIRED','LOCKED','MODEL_UNAVAILABLE','WAITING_REVIEW'].includes(e.code);
      this.patch(taskId,t=>{t.status=paused?'PAUSED':needs?'NEEDS_INPUT':'FAILED';t.error=e;});this.domain.store.event(t.projectId,t.id,'task.stopped',e.message,{code:e.code});
    }
  }
  private pack(t:CreativeTask,chapterId?:string,purpose:'generation'|'state-refresh'='generation'){const pack=buildContext(this.domain,t.projectId,{chapterId,goal:t.goal,maxChars:t.budget.contextChars,purpose,...t.perspective,viewpointId:t.perspective?.viewpointId??t.configSnapshot?.config.bindings?.viewpointId,audience:t.perspective?.audience??t.configSnapshot?.config.bindings?.audience,memory:t.kind!=='summarize'&&t.configSnapshot?.config.enabled?t.configSnapshot.config.memory:undefined});this.domain.store.event(t.projectId,t.id,'context.built',`上下文 ${pack.used}/${pack.budget} 字符；${pack.items.length} 条资料`,{chapterId,revision:pack.revision,omitted:pack.omitted.length,purpose});return pack;}
  private input(t:CreativeTask,pack:ReturnType<typeof buildContext>,extras:Record<string,unknown>={}){
    // Only entities actually selected by Context Engine are sent. Never duplicate the entire book outside the pack.
    const ids=new Set(pack.items.map(i=>i.id));const objects=this.domain.store.objects(t.projectId).filter(o=>ids.has(o.id)&&['character','world','foreshadow'].includes(o.kind)).map(o=>({id:o.id,title:o.title,kind:o.kind}));
    return {goal:t.goal,contract:t.contract,constraints:[...new Set([...t.constraints,...(t.contract.brief?.constraints??[])])],targetWords:t.targetWords,memoryEnabled:t.configSnapshot?.config.enabled&&t.configSnapshot.config.memory?.enabled,context:pack.text,_contextPack:pack,contextRevision:pack.revision,missing:pack.missing,objects,sourceIds:[...new Set(pack.items.map(i=>i.id.split(':')[0]))],foreshadowIds:objects.filter(o=>o.kind==='foreshadow').map(o=>o.id),...extras};
  }
  async step(taskId:string,label:string,prompt:PromptKey,input:Record<string,any>,validate?:(output:any)=>any):Promise<any>{
    let t=this.boundary(taskId);const epoch=t.epoch;const key=`${epoch}:${t.completedChapters}:${label}`;const inputHash=hash({prompt:prompts[prompt].id,version:prompts[prompt].version,input});
    let step=t.steps.find(s=>s.key===key&&s.inputHash===inputHash);
    if(step?.status==='COMPLETED'){this.domain.store.event(t.projectId,t.id,'step.reused',`复用已完成步骤：${label}`,{key});return step.output;}
    const attempts=step?.attempts??0;let repairError=step?.error;
    for(let attempt=attempts;attempt<3;attempt++){
      t=this.boundary(taskId,epoch);
      const callInput=attempt>0?{...input,validationRepair:`前次校验失败：${repairError??'输出中断'}。请按 JSON Schema 修正字段，证据必须为连续原文。`}:input;
      const compiled=await compilePrompt(this.domain,t,prompt,callInput);this.boundary(taskId,epoch);
      const desired=prompt==='write'?Math.min(24000,Math.ceil(t.targetWords*2.2)+1200):prompt==='bootstrap'?7500:prompt==='review'?7000:prompt==='assist'?4500:5000;
      const maxTokens=Math.min(desired,t.budget.outputTokens-t.usage.outputTokens);
      requireThat(t.usage.calls<t.budget.calls&&maxTokens>=500,'BUDGET_EXHAUSTED','任务模型预算已耗尽；已保留有效成果和检查点');
      const request=beginRequest(this.domain.store,t,key,attempt+1,compiled);const env=macroEnvironment(this.domain,t,compiled.config,callInput);
      const initial={...t};const calls=step?.calls??[];
      calls.push({attempt:attempt+1,reserved:maxTokens,outputTokens:maxTokens,estimated:true,status:'RUNNING',startedAt:now()});
      step={key,name:label,inputHash,inputRevision:t.expectedRevision,status:'RUNNING',attempts:attempt+1,startedAt:now(),calls,requestIds:[...(step?.requestIds??[]),request.id]};
      this.patch(taskId,t=>{t.currentStep=label;t.steps=t.steps.filter(s=>s.key!==key||s.inputHash!==inputHash);t.steps.push(step!);t.usage.calls++;t.usage.outputTokens+=maxTokens;t.usage.estimated=true;});
      this.domain.store.event(t.projectId,t.id,'step.started',`执行 ${label}（第 ${attempt+1} 次尝试）`,{key,inputRevision:t.expectedRevision,maxTokens});
      const callStarted=performance.now();const controller=new AbortController();this.controllers.set(taskId,controller);let partial='',lastSaved=0;let timer:ReturnType<typeof setTimeout>|undefined;
      const model=t.provider==='demo'?this.demo:this.provider;
      try{
        this.domain.store.event(t.projectId,t.id,'prompt.compiled',`${compiled.role} 已按固定配置编译；${compiled.estimatedTokens} token（估算）`,{requestId:request.id,configuration:compiled.config.hash,cache:compiled.localCompilationCache});
        const generation=model.generate({prompt,input:callInput,compiled,onRequest:observed=>observeRequest(this.domain.store,request,observed),task:t,maxTokens,signal:controller.signal,onDelta:delta=>{
          if(controller.signal.aborted)return;
          partial+=delta;if(partial.length-lastSaved>=400){lastSaved=partial.length;this.patch(taskId,t=>{const s=t.steps.find(s=>s.key===key&&s.inputHash===inputHash&&s.attempts===attempt+1);if(s?.status==='RUNNING')s.partial=partial;});}
        }});
        // The domain never assumes that remote calls execute exactly once. A timed-out call is charged its reserved budget.
        const result=await Promise.race([generation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new DomainError('MODEL_TIMEOUT','模型调用超时，已保留部分输出',504));},this.timeoutMs);})]);
        partial=result.text;
        if(timer)clearTimeout(timer);request.rawResponse=result.text;request.usage=result.usage??{serverCache:'UNKNOWN',elapsedMs:Math.round(performance.now()-callStarted)};requestPut(this.domain.store,request);
        const actual=result.outputTokens!==undefined&&Number.isFinite(result.outputTokens)&&result.outputTokens>=0?result.outputTokens:maxTokens;
        this.patch(taskId,t=>{const s=t.steps.find(s=>s.key===key&&s.inputHash===inputHash);const call=s?.calls?.find(c=>c.attempt===attempt+1);if(call){call.outputTokens=actual;call.estimated=!!result.estimated||result.outputTokens===undefined;call.endedAt=now();call.model=result.model;}t.usage.outputTokens+=actual-maxTokens;t.usage.estimated=t.usage.calls>t.steps.reduce((n,s)=>n+(s.calls?.length??0),0)||t.steps.some(s=>s.calls?.some(c=>c.estimated));});
        let output:any=result.text;const schema=prompts[prompt].schema;
        if(compiled.role==='Writer'&&compiled.config.config.enabled){const processed=await transformText(result.text,compiled.config.config.regex??[],'after','prose',{expand:env.expand});output=processed.text;request.transformations=processed.trace;}
        request.candidate=typeof output==='string'?output:undefined;requestPut(this.domain.store,request);
        if(schema){const clean=result.text.trim().replace(/^```(?:json)?\s*/u,'').replace(/\s*```$/u,'');output=schema.parse(JSON.parse(clean));}
        if(validate)output=validate(output);
        this.patch(taskId,t=>{const s=t.steps.find(s=>s.key===key&&s.inputHash===inputHash);if(s){s.status='COMPLETED';s.output=output;s.partial=undefined;s.endedAt=now();s.usage={outputTokens:s.calls!.reduce((n,c)=>n+c.outputTokens,0),estimated:s.calls!.some(c=>c.estimated)};s.calls!.find(c=>c.attempt===attempt+1)!.status='COMPLETED';}});
        requireThat(actual<=maxTokens,'BUDGET_EXHAUSTED','提供方实际输出超过预留预算；成果已保存，等待人工检查');
        const fresh=this.current(taskId);
        if(fresh.status!=='RUNNING'||fresh.expectedRevision!==initial.expectedRevision||fresh.epoch!==epoch||this.domain.project(t.projectId).revision!==initial.expectedRevision){
          const type=prompt==='write'?'chapter':prompt==='assist'?'edit':prompt==='bootstrap'?'setup':prompt==='replan'?'replan':prompt==='extract'?'extraction':'ideas';
          const a=this.domain.putArtifact(initial,type,{content:typeof output==='string'?output:undefined,diagnostic:typeof output==='string'?undefined:output,late:true,requestId:request.id},input.chapterId?this.domain.object(t.projectId,input.chapterId):undefined);a.status='stale';this.domain.store.put('artifacts',a);request.status='STALE';requestPut(this.domain.store,request);throw new DomainError('STOPPED','调用晚到；已保留为过期成果');
        }
        request.status='COMPLETED';requestPut(this.domain.store,request);this.domain.store.event(t.projectId,t.id,'step.completed',`${label} 已完成并保存`,{key,outputTokens:actual,requestId:request.id});return output;
      }catch(error){
        const e=publicError(error);repairError=e.message;const current=this.current(taskId);
        if(request.status!=='STALE')request.status='FAILED';request.usage=request.usage??(error as any)?.usage??{serverCache:'UNKNOWN',elapsedMs:Math.round(performance.now()-callStarted)};request.error=e;request.rawResponse=request.rawResponse??partial;request.transformations=(error as any)?.transformations??request.transformations;requestPut(this.domain.store,request);
        this.patch(taskId,t=>{const s=t.steps.find(s=>s.key===key&&s.inputHash===inputHash&&s.attempts===attempt+1);if(s&&s.status!=='COMPLETED'){s.status='FAILED';s.error=e.message;s.partial=partial||s.partial;s.endedAt=now();const call=s.calls?.find(c=>c.attempt===attempt+1);if(call){call.status='FAILED';call.error=e.message;call.diagnostic=partial;call.endedAt=now();}s.usage={outputTokens:s.calls!.reduce((n,c)=>n+c.outputTokens,0),estimated:s.calls!.some(c=>c.estimated)};}});
        this.domain.store.event(t.projectId,t.id,'step.failed',`${label}：${e.message}`,{key,code:e.code});
        const measured=(error as any)?.outputTokens;
        if(typeof measured==='number'&&Number.isFinite(measured)&&measured>=0)this.patch(taskId,t=>{const s=t.steps.find(s=>s.key===key&&s.inputHash===inputHash);const call=s?.calls?.find(c=>c.attempt===attempt+1);if(call){t.usage.outputTokens+=measured-call.outputTokens;call.outputTokens=measured;call.estimated=false;call.model=(error as any).model;s!.usage={outputTokens:s!.calls!.reduce((n,c)=>n+c.outputTokens,0),estimated:s!.calls!.some(c=>c.estimated)};}t.usage.estimated=t.usage.calls>t.steps.reduce((n,s)=>n+(s.calls?.length??0),0)||t.steps.some(s=>s.calls?.some(c=>c.estimated));});
        step=this.current(taskId).steps.find(s=>s.key===key&&s.inputHash===inputHash);
        if(current.status!=='RUNNING'||current.epoch!==epoch||['MODEL_UNAVAILABLE','STOPPED','STALE','BUDGET_EXHAUSTED'].includes(e.code))throw error;
        if(attempt===2)throw error;
      }finally{if(timer)clearTimeout(timer);if(this.controllers.get(taskId)===controller)this.controllers.delete(taskId);}
    }
    throw new DomainError('RETRY_LIMIT','当前步骤已达到 2 次重试上限；可修复问题后重新委派，任务总预算仍保留');
  }
  private awaitReview(taskId:string,artifact:Artifact){this.patch(taskId,t=>{t.status='NEEDS_INPUT';t.checkpoint.artifactId=artifact.id;t.error={code:'WAITING_REVIEW',message:'成果已保存，请审阅后接受或拒绝'};});throw new DomainError('WAITING_REVIEW','等待作者审阅');}
  private deliver(taskId:string,a:Artifact){const t=this.boundary(taskId);if(t.autoAccept){this.domain.acceptArtifact(t.projectId,a.id,'auto');}else this.awaitReview(taskId,a);}
  private pending(t:CreativeTask){return t.checkpoint.artifactId?this.domain.artifact(t.projectId,t.checkpoint.artifactId):undefined;}
  private async oneShot(taskId:string){
    let t=this.boundary(taskId);const pending=this.pending(t);if(pending?.status==='pending'){this.deliver(taskId,pending);return;}
    const chapter=t.chapterId?this.domain.object(t.projectId,t.chapterId):undefined;const pack=this.pack(t,t.chapterId);
    if(t.kind==='summarize'){
      const status=memoryStatus(this.domain,t.projectId);const selected=chapter?[chapter]:status.gaps.filter(g=>!g.needsReview).slice(0,t.count).map(g=>this.domain.object(t.projectId,g.chapterId));
      requireThat(selected.length,'MEMORY_COVERED','当前范围没有可总结的缺口；受上游改文影响的章节需先审查');
      for(const c of selected){const source=sourceFor(this.domain,c);requireThat(c.status==='accepted'&&c.body.length<=t.budget.contextChars,'MEMORY_SOURCE','只总结预算内的已接受正文；长章请增加预算或拆分');
        const memory=await this.step(taskId,'总结作品记忆-'+source.ordinal,'summarize',{goal:'从已接受原文建立有证据的章节记忆',draft:c.body,source,chapterId:c.id,objects:this.domain.store.objects(t.projectId).filter(o=>['character','world'].includes(o.kind)).map(o=>({id:o.id,title:o.title})).slice(0,100)},o=>validateMemoryContent(this.domain,t.projectId,o,[source]));
        t=this.boundary(taskId);const existing=this.domain.store.list('artifacts',t.projectId).find(a=>a.taskId===t.id&&a.type==='memory'&&a.data.source?.versionId===source.versionId&&['pending','accepted'].includes(a.status));const a=existing??this.domain.putArtifact(t,'memory',{memory,source,versionId:source.versionId},c);if(t.autoAccept&&a.status==='pending')this.domain.acceptArtifact(t.projectId,a.id,'auto');
      }
      const awaiting=this.domain.store.list('artifacts',t.projectId).find(a=>a.taskId===t.id&&a.type==='memory'&&a.status==='pending');if(awaiting)this.awaitReview(taskId,awaiting);return;
    }
    if(t.kind==='assist'){
      const content=await this.step(taskId,'选区写作','assist',this.input(t,pack,{selection:t.range,nearby:chapter!.body.slice(Math.max(0,t.range!.start-700),t.range!.end+700),chapterId:t.chapterId}));
      t=this.boundary(taskId);const a=this.domain.putArtifact(t,'edit',{content,original:chapter!.body,context:pack},chapter);this.awaitReview(taskId,a);
    }
    if(t.kind==='extract'){
      const selected=chapter?[chapter]:this.domain.chapters(t.projectId).filter(c=>c.body.trim()).slice(0,t.count);
      requireThat(selected.length>0,'EMPTY','没有可抽取的正文',422);
      for(const [n,c] of selected.entries()){
        requireThat(c.body.length<=t.budget.contextChars,'CONTEXT_LOCK_OVERFLOW','本章超过抽取上下文预算，请先拆分章节');
        const output=await this.step(taskId,`提取资料-${n}`,'extract',{goal:t.goal,draft:c.body,chapterId:c.id,objects:this.domain.store.objects(t.projectId).filter(o=>['character','world'].includes(o.kind)).slice(0,100).map(o=>({id:o.id,title:o.title,kind:o.kind}))},o=>{for(const [index,x] of o.objects.entries()){requireThat(['character','world','fact','event'].includes(x.kind),'EXTRACTION',`objects[${index}].kind 只支持 character/world/fact/event`,422);requireThat(x.source?.quote&&c.body.includes(x.source.quote),'EVIDENCE',`objects[${index}].source.quote（${x.title}）不在当前章正文，请逐字复制连续原句，不拼接或改标点`,422);}return o;});
        t=this.boundary(taskId);let a=this.domain.store.list('artifacts',t.projectId).find(a=>a.taskId===t.id&&a.type==='extraction'&&a.chapterId===c.id&&a.data.versionId===c.fields.currentVersion&&['pending','accepted'].includes(a.status));
        if(!a)a=this.domain.putArtifact(t,'extraction',{...output,versionId:c.fields.currentVersion,context:pack},c);if(t.autoAccept&&a.status==='pending')this.domain.acceptArtifact(t.projectId,a.id,'auto');
      }
      const awaiting=this.domain.store.list('artifacts',t.projectId).find(a=>a.taskId===t.id&&a.status==='pending');if(awaiting)this.awaitReview(taskId,awaiting);
      return;
    }
    const key=t.kind as 'bootstrap'|'ideas'|'replan';let extra:Record<string,unknown>={};
    if(key==='replan'){
      const all=this.domain.store.objects(t.projectId);const editable=all.filter(o=>editablePlan(o)&&(!t.chapterId||o.id===t.chapterId));
      const deps=all.filter(o=>['character','foreshadow','event'].includes(o.kind));extra={rollingPlanning:rollingPlanning(this.domain,t.projectId),editablePlans:editable.map(o=>({id:o.id,title:o.title,fields:o.fields})),dependencies:[...deps.map(o=>({id:o.id,title:o.title,fields:o.fields})),...this.domain.store.list('tasks',t.projectId).filter(o=>o.id!==t.id).map(o=>({id:o.id,goal:o.goal,status:o.status}))]};
      requireThat(JSON.stringify(extra).length+pack.used<=t.budget.contextChars*2,'CONTEXT_LOCK_OVERFLOW','重规划依赖超过范围，请缩小任务范围');
    }
    const output=await this.step(taskId,key==='bootstrap'?'开书方向与资料':key==='ideas'?'剧情候选推演':'未来规划与影响',key,this.input(t,pack,extra));
    this.boundary(taskId);const a=this.domain.putArtifact(t,key==='bootstrap'?'setup':key, {...output,context:pack});this.patch(taskId,t=>{t.checkpoint.artifactId=a.id;});this.deliver(taskId,a);
  }
  private ensureChapter(taskId:string):StoryObject {
    let t=this.boundary(taskId);if(t.checkpoint.chapterId)return this.domain.object(t.projectId,t.checkpoint.chapterId);
    let c=t.completedChapters===0&&t.chapterId?this.domain.object(t.projectId,t.chapterId):this.domain.chapters(t.projectId).find(c=>!c.locked&&c.status!=='accepted'&&String(c.fields.branch??'main')===(t.perspective?.branch??'main'));
    requireThat(!c?.locked,'LOCKED','本章已经锁定');
    if(!c){this.domain.store.transaction(()=>{let volume=this.domain.store.objects(t.projectId,'volume').find(v=>!v.locked);if(!volume){const book=this.domain.store.objects(t.projectId,'book')[0];volume=this.domain.addObject(t.projectId,{kind:'volume',title:'新的旅程',parentId:book.id,status:'planned'});}const n=this.domain.chapters(t.projectId).length;c=this.domain.addObject(t.projectId,{kind:'chapter',title:`第${n+1}章`,parentId:volume.id,order:n+1,status:'planned',fields:{goal:t.goal,targetWords:t.targetWords,branch:t.perspective?.branch??'main'}});t.expectedRevision=this.domain.bump(t.projectId).revision;this.domain.store.put('tasks',t);});}
    requireThat(c,'EMPTY','无法创建章节');this.patch(taskId,t=>{t.checkpoint.chapterId=c!.id;});return c;
  }
  private async refreshPrevious(taskId:string,chapter:StoryObject){
    let t=this.boundary(taskId);const chapters=this.domain.chapters(t.projectId).filter(c=>String(c.fields.branch??'main')===String(chapter.fields.branch??'main'));const prev=chapters[chapters.findIndex(c=>c.id===chapter.id)-1];
    if(!prev?.body.trim()||!prev.fields.extractionPending)return;
    requireThat(!prev.fields.needsReview,'UPSTREAM_REVIEW','上游章节受早期修改影响，须先审查后继续');
    const pack=this.pack(t,prev.id,'state-refresh');const input=this.input(t,pack,{draft:prev.body,chapterId:prev.id,phase:'accepted-state-refresh',goal:'只从作者已经接受的最新正文重建事实、事件和章末状态；不把后续任务的约束应用到过去正文。旧章纲已被作者实际正文取代，不要求正文迁就旧计划。仍核对作品规则和正式事实。',constraints:[],contract:{scope:'重建作者最新正文的事实索引，不能修改正文'},targetWords:undefined});
    requireThat(prev.body.length<=t.budget.contextChars,'CONTEXT_LOCK_OVERFLOW','上章超出抽取预算，需拆分或提高上下文预算');
    const review:Review=await this.step(taskId,'同步作者最新正文','review',input,o=>validateReview(o,prev.body,this.reviewSources(t.projectId),pack.canon));
    if(review.issues.some(i=>i.blocks&&i.status==='open')){const a=this.domain.putArtifact(t,'state-review',{content:prev.body,original:prev.body,review,context:pack,versionId:prev.fields.currentVersion},prev);this.awaitReview(taskId,a);}
    this.boundary(taskId);this.domain.refreshEvidence(taskId,prev.id,review);
  }
  private reviewSources(projectId:string){const p=this.domain.project(projectId);const objects=this.domain.store.objects(projectId);return [...objects,{...objects.find(o=>o.kind==='book')!,id:p.id,title:p.title,body:p.premise,fields:{constraints:p.constraints,style:p.style}}];}
  private async reviewed(taskId:string,c:StoryObject,content:string,pack:ReturnType<typeof buildContext>,target?:number,plan?:unknown):Promise<{content:string;review:Review}>{
    let t=this.boundary(taskId);const planSourceId=plan?`task-plan:${t.id}:${c.id}`:undefined;const sources=this.reviewSources(t.projectId);if(planSourceId)sources.push({...c,id:planSourceId,body:'',fields:plan as StoryObject['fields'],source:undefined});
    const requiredStates=sources.filter(o=>o.kind==='world'&&o.status==='accepted'&&(o.fields.unique===true||String(o.fields.type).includes('物品'))&&content.includes(o.title)).map(o=>({entityId:o.id,title:o.title,property:'holder'}));
    const reviewInput=()=>{const input=this.input(t,pack,{draft:content,chapterId:c.id,plan,planSourceId,requiredStates});if(planSourceId)input.sourceIds.push(planSourceId);return input;};
    let review:Review=await this.step(taskId,'审校与候选事实','review',reviewInput(),o=>validateReview(o,content,sources,pack.canon,target));
    for(let round=0;round<2&&review.issues.some(i=>i.blocks&&i.status==='open');round++){
      this.boundary(taskId);const draft=content;
      const repair=await this.step(taskId,`局部修复-${round+1}`,'repair',this.input(t,pack,{draft,issues:review.issues.filter(i=>i.status==='open'),chapterId:c.id}),o=>{
        const ranges=o.edits.map((e:any)=>{const start=draft.indexOf(e.quote);requireThat(start>=0&&draft.indexOf(e.quote,start+e.quote.length)<0,'REPAIR_RANGE','局部修复引用必须唯一',422);return {start,end:start+e.quote.length,replacement:e.replacement};}).sort((a:any,b:any)=>a.start-b.start);
        for(let i=1;i<ranges.length;i++)requireThat(ranges[i].start>=ranges[i-1].end,'REPAIR_RANGE','局部修复不能重叠',422);return {...o,ranges};
      });
      if(!repair.ranges.length)break;for(const range of [...repair.ranges].reverse())content=content.slice(0,range.start)+range.replacement+content.slice(range.end);
      review=await this.step(taskId,`复核-${round+1}`,'review',reviewInput(),o=>validateReview(o,content,sources,pack.canon,target));
    }
    return {content,review};
  }
  private async write(taskId:string){
    while(this.boundary(taskId).completedChapters<this.current(taskId).count){
      let t=this.boundary(taskId);const pending=this.pending(t);
      if(pending?.status==='pending'){this.deliver(taskId,pending);continue;}
      const c=this.ensureChapter(taskId);await this.refreshPrevious(taskId,c);t=this.boundary(taskId);const pack=this.pack(t,c.id);
      const plan=await this.step(taskId,'章节规划','plan',this.input(t,pack,{chapterId:c.id}));
      const content=await this.step(taskId,'生成正文','write',this.input(t,pack,{plan,chapterId:c.id}));
      this.boundary(taskId);
      // Draft is persisted before review, so a review failure never discards valid writing.
      let draft=this.domain.store.list('artifacts',t.projectId).find(a=>a.taskId===t.id&&a.chapterId===c.id&&a.baseRevision===t.expectedRevision&&a.status==='pending'&&a.data.content===content);
      if(!draft)draft=this.domain.putArtifact(t,'chapter',{content,plan,context:pack},c);
      const checked=await this.reviewed(taskId,c,content,pack,t.targetWords,plan);this.boundary(taskId);draft.data={...draft.data,...checked};this.domain.store.put('artifacts',draft);this.patch(taskId,t=>{t.checkpoint.artifactId=draft!.id;});
      if(checked.review.issues.some(i=>i.blocks&&i.status==='open')){this.patch(taskId,t=>{t.status='NEEDS_INPUT';t.error={code:'CONFLICT',message:'重大问题仍未解决；草稿已隔离，等待作者处理'};});throw new DomainError('CONFLICT','需要处理重大问题');}
      this.deliver(taskId,draft);
    }
  }
  private async reviewTask(taskId:string){
    const t=this.boundary(taskId);const pending=this.pending(t);if(pending?.status==='pending'){this.deliver(taskId,pending);return;}
    const c=this.domain.object(t.projectId,t.chapterId!);const body=t.draft??c.body;requireThat(body.trim(),'EMPTY','本章没有正文可审查',422);const pack=this.pack(t,c.id);
    if(t.draft!==undefined&&!this.domain.store.list('artifacts',t.projectId).some(a=>a.taskId===t.id))this.domain.putArtifact(t,'chapter',{content:body,original:c.body,sourceArtifactId:t.draftArtifactId,context:pack},c);
    const checked=await this.reviewed(taskId,c,body,pack,t.draft!==undefined?t.targetWords:undefined);
    this.boundary(taskId);let a=this.domain.store.list('artifacts',t.projectId).find(a=>a.taskId===t.id&&a.chapterId===c.id&&a.status==='pending');if(a){a.data={...a.data,...checked,context:pack,original:c.body};this.domain.store.put('artifacts',a);}else a=this.domain.putArtifact(t,'chapter',{...checked,context:pack,original:c.body},c);this.patch(taskId,t=>{t.checkpoint.artifactId=a!.id;});
    if(checked.review.issues.some(i=>i.blocks&&i.status==='open'))this.awaitReview(taskId,a);else this.deliver(taskId,a);
  }
}
export function publicError(error:unknown):{code:string;message:string}{
  if(error instanceof DomainError)return {code:error.code,message:error.message};
  if(error instanceof ZodError)return {code:'INVALID_OUTPUT',message:'结构化输出校验失败：'+error.issues.slice(0,5).map(i=>`${i.path.join('.')}: ${i.message}`).join('；')};
  if(error instanceof SyntaxError)return {code:'INVALID_JSON',message:'模型没有返回有效 JSON；已保留诊断并限制重试次数'};
  return {code:'FAILED',message:'操作失败；有效成果已保留，请检查模型连接或本地存储后重试'};
}
