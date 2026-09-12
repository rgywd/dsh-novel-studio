import { z } from 'zod';
import { Store, hash } from './store.js';
import { activeStatuses, orderedChapters, DomainError, id, now, objectSchema, projectSchema, requireThat, taskInputSchema, type Artifact, type ChapterVersion, type CreativeTask, type ObjectInput, type Project, type Review, type StoryObject, type TaskStatus } from './contracts.js';
const chapterProjection=['currentVersion','summary','summaryVersion','extractionPending','needsReview','control'];
export const editablePlan=(o:StoryObject)=>['book','volume','chapter'].includes(o.kind)&&!o.locked&&o.status==='planned'&&(o.kind!=='chapter'||!o.body.trim());
function chapterMetadata(data:ObjectInput,old?:StoryObject){if(data.kind!=='chapter')return;requireThat(data.body===(old?.body??''),'BODY_ENDPOINT','正文请通过编辑器保存，不能通过章纲接口覆盖');requireThat(old?data.status===old.status:['planned','draft'].includes(data.status),'VERSION_REQUIRED','正文接受状态只能通过版本提交改变');for(const key of chapterProjection)requireThat(JSON.stringify(data.fields[key])===JSON.stringify(old?.fields[key]),'VERSION_REQUIRED',`不能直接修改版本投影 ${key}`);}
function authorSource(data:ObjectInput,old?:StoryObject){return {type:'user' as const,quote:data.source?.quote??data.body,time:data.source?.time??'用户明确设定',fromChapter:data.source?.fromChapter,toChapter:data.source?.toChapter,inference:data.source?.type==='user'?data.source.inference:false,modality:data.source?.type==='user'?data.source.modality:'objective' as const,supersedes:old&&['fact','event'].includes(old.kind)?old.id:undefined,policy:old?'author-confirmed':'author-setting'};}

export class Domain {
  onInterrupt:(taskId:string)=>void=()=>{};
  constructor(public store:Store){}
  project(projectId:string){return this.store.get('projects',projectId);}
  object(projectId:string,objectId:string){const o=this.store.get('objects',objectId);requireThat(o.projectId===projectId,'SCOPE','对象不属于本作品');return o;}
  task(projectId:string,taskId:string){const t=this.store.get('tasks',taskId);requireThat(t.projectId===projectId,'SCOPE','任务不属于本作品');return t;}
  artifact(projectId:string,artifactId:string){const a=this.store.get('artifacts',artifactId);requireThat(a.projectId===projectId,'SCOPE','成果不属于本作品');return a;}
  guard(projectId:string,revision:number){const p=this.project(projectId);requireThat(p.revision===revision,'STALE','作品已更新；请刷新或重新委派。');requireThat(!p.archived,'ARCHIVED','请先恢复归档作品');return p;}
  bump(projectId:string){const p=this.project(projectId);p.revision++;p.updatedAt=now();this.store.put('projects',p);return p;}
  snapshot(projectId:string){return {project:this.project(projectId),objects:this.store.objects(projectId),tasks:this.store.list('tasks',projectId).map(t=>({...t,steps:t.steps.map(s=>({...s,output:undefined,partial:undefined}))})),artifacts:this.store.list('artifacts',projectId).map(a=>({...a,data:{title:a.data.title,summary:a.data.review?.summary}}))};}
  createProject(input:unknown):Project {
    const data=projectSchema.parse(input);const p={...data,id:id('project'),revision:1,createdAt:now(),updatedAt:now()};
    return this.store.transaction(()=>{this.store.put('projects',p);this.addObject(p.id,{kind:'book',title:p.title,status:'planned',body:p.premise});this.store.event(p.id,null,'project.created','作品已创建');return p;});
  }
  updateProject(projectId:string,revision:number,input:unknown){
    const data=projectSchema.parse(input);
    return this.store.transaction(()=>{const p=this.project(projectId);requireThat(p.revision===revision,'STALE','作品已更新');this.invalidateTasks(projectId,'作品规则已修改');const updated={...p,...data,revision:p.revision+1,updatedAt:now()};this.store.put('projects',updated);this.store.change(projectId,'project.update',{before:p,after:updated});return updated;});
  }
  addObject(projectId:string,input:unknown):StoryObject {
    const data=objectSchema.parse(input);
    if(data.parentId){const parent=this.object(projectId,data.parentId);requireThat(data.kind==='chapter'?parent.kind==='volume':data.kind==='volume'?parent.kind==='book':parent.kind===data.kind,'HIERARCHY','上级节点类型不匹配');}
    this.references(projectId,data);
    const o={...data,id:id(data.kind),projectId,revision:1,updatedAt:now()};this.store.put('objects',o);return o;
  }
  createObject(projectId:string,revision:number,input:unknown){
    const data=objectSchema.parse(input);if(data.source)requireThat(data.source.type==='user','SOURCE','手工资料的来源必须是用户设定');
    chapterMetadata(data);
    return this.store.transaction(()=>{this.guard(projectId,revision);this.invalidateTasks(projectId,'资料新增，需重建上下文');const o=this.addObject(projectId,{...data,source:authorSource(data)});this.bump(projectId);this.store.change(projectId,'object.create',{after:o});return o;});
  }
  private references(projectId:string,data:ObjectInput){
    if(data.kind==='relationship')requireThat(['fromId','toId'].every(k=>this.object(projectId,String(data.fields[k])).kind==='character'),'RELATION','关系两端必须是角色');
    if(data.kind==='relationship')requireThat(data.fields.fromId!==data.fields.toId,'RELATION','关系两端请选择不同角色');
    for(const key of ['relatedEntityIds','entityIds'])if(data.fields[key]!==undefined){requireThat(Array.isArray(data.fields[key]),'ENTITY','关联实体必须是 ID 列表');for(const target of data.fields[key] as string[])requireThat(['character','world','relationship','foreshadow'].includes(this.object(projectId,target).kind),'ENTITY','关联对象必须是本作品实体');}
    for(const key of ['chapterId','plantChapterId','recoveryChapterId'])if(data.fields[key])requireThat(this.object(projectId,String(data.fields[key])).kind==='chapter','SOURCE','关联章节必须属于本作品');
    requireThat(data.source?.fromChapter===undefined||data.source?.toChapter===undefined||data.source.fromChapter<=data.source.toChapter,'SOURCE','生效范围结束不能早于开始');
    if(data.kind==='fact'&&(data.status==='accepted'||data.fields.entityId))requireThat(['character','world','foreshadow','relationship'].includes(this.object(projectId,String(data.fields.entityId)).kind),'ENTITY','事实必须关联本作品实体');
    if(data.kind==='fact'&&data.status==='accepted')requireThat(typeof data.fields.property==='string'&&data.fields.property.trim()&&typeof data.fields.value==='string'&&data.fields.value.trim(),'FACT','接受事实需要明确的属性与状态值');
    if(data.source?.versionId){const v=this.store.get('versions',data.source.versionId);requireThat(v.projectId===projectId&&v.chapterId===data.source.chapterId,'SOURCE','来源版本不属于此作品章节');requireThat(!data.source.quote||v.content.includes(data.source.quote),'SOURCE','来源引文不在指定正文版本中');}
  }
  updateObject(projectId:string,objectId:string,revision:number,input:unknown){
    const data=objectSchema.parse(input);
    return this.store.transaction(()=>{
      const old=this.object(projectId,objectId);requireThat(old.revision===revision,'STALE','资料已被其他操作更新，请刷新');requireThat(!this.project(projectId).archived,'ARCHIVED','作品已归档');
      requireThat(old.kind===data.kind,'KIND','不能改变对象类型');
      if(old.locked){requireThat(!data.locked && JSON.stringify({...data,locked:true})===JSON.stringify(objectSchema.parse(oldInput(old))),'LOCKED','先解锁再编辑；解锁操作只能改变锁定开关');}
      chapterMetadata(data,old);
      if(data.parentId){let parent:StoryObject|null=this.object(projectId,data.parentId);requireThat(data.kind==='chapter'?parent.kind==='volume':data.kind==='volume'?parent.kind==='book':parent.kind===data.kind,'HIERARCHY','上级节点类型不匹配');while(parent){requireThat(parent.id!==old.id,'CYCLE','不能把节点移动到自己的下级');parent=parent.parentId?this.object(projectId,parent.parentId):null;}}
      if(data.source) requireThat(JSON.stringify(data.source)===JSON.stringify(old.source)||data.source.type==='user','SOURCE','不能伪造正文来源');
      this.invalidateTasks(projectId,'作者修改资料，旧依赖已失效');
      const material=old.body!==data.body||JSON.stringify(old.fields)!==JSON.stringify(data.fields)||old.status!==data.status||JSON.stringify(old.source)!==JSON.stringify(data.source);
      if(material&&old.kind!=='chapter')data.source=authorSource(data,old);
      this.references(projectId,data);
      if(material&&['fact','event'].includes(old.kind)){
        requireThat(!['revoked','stale'].includes(old.status),'HISTORY','历史事实不能原地覆盖；请创建新的用户设定');
        this.store.put('objects',{...old,status:'revoked',revision:old.revision+1,updatedAt:now()});
        const replacement=this.addObject(projectId,{...data,source:authorSource(data,old)});this.bump(projectId);this.store.change(projectId,'fact.supersede',{before:old,after:replacement});return replacement;
      }
      const o={...old,...data,revision:old.revision+1,updatedAt:now()};this.store.put('objects',o);this.bump(projectId);this.store.change(projectId,'object.update',{before:old,after:o});return o;
    });
  }
  invalidateTasks(projectId:string,reason:string,except?:string){
    for(const task of this.store.list('tasks',projectId))if(task.id!==except&&!['COMPLETED','CANCELED'].includes(task.status)){
      task.status='PAUSED';task.error={code:'DEPENDENCY_CHANGED',message:reason};task.updatedAt=now();this.store.put('tasks',task);this.onInterrupt(task.id);
    }
    for(const a of this.store.list('artifacts',projectId))if(a.status==='pending'&&a.taskId!==except){a.status='stale';this.store.put('artifacts',a);}
  }
  takeover(projectId:string,objectId:string,revision:number){
    return this.store.transaction(()=>{const o=this.object(projectId,objectId);requireThat(o.revision===revision,'STALE','对象已更新');requireThat(!o.locked,'LOCKED','请先解锁');requireThat(!this.project(projectId).archived,'ARCHIVED','作品已归档');this.invalidateTasks(projectId,`作者接管「${o.title}」`);o.revision++;o.fields.control='author';o.updatedAt=now();this.store.put('objects',o);this.bump(projectId);this.store.event(projectId,null,'takeover',`作者已接管「${o.title}」；旧调用只可保留为过期成果`);return o;});
  }
  saveChapter(projectId:string,chapterId:string,revision:number,body:unknown):StoryObject {
    const content=z.string().max(100000).parse(body);
    return this.store.transaction(()=>{const c=this.object(projectId,chapterId);requireThat(c.kind==='chapter','KIND','请选择章节');requireThat(c.revision===revision,'STALE','正文版本冲突，您的编辑仍保留在本地');requireThat(!c.locked,'LOCKED','章节已锁定');requireThat(!this.project(projectId).archived,'ARCHIVED','作品已归档');
      requireThat(!this.store.list('tasks',projectId).some(t=>activeStatuses.includes(t.status)&&(t.chapterId===chapterId||t.checkpoint.chapterId===chapterId)),'TAKEOVER_REQUIRED','导演正在处理本章，请先接管再保存');
      requireThat(c.fields.control!=='director','TAKEOVER_REQUIRED','请先接管导演交付的正文，再进行人工保存');
      this.invalidateTasks(projectId,'正文已修改，旧上下文已失效');this.invalidateDerived(projectId,chapterId,true);
      const v:ChapterVersion={id:id('version'),projectId,chapterId,content,chapterRevision:c.revision+1,createdAt:now(),actor:'author',accepted:true,summary:''};this.store.put('versions',v);
      const updated={...c,body:content,status:'accepted' as const,revision:c.revision+1,updatedAt:now(),fields:{...c.fields,currentVersion:v.id,summary:'',summaryVersion:'',extractionPending:true,control:'author'}};
      this.store.put('objects',updated);this.bump(projectId);this.store.change(projectId,'chapter.authorSave',{chapterId,versionId:v.id});return updated;
    });
  }
  invalidateDerived(projectId:string,chapterId:string,downstream:boolean){
    const chapters=this.chapters(projectId);const position=chapters.findIndex(c=>c.id===chapterId);const affected=new Set((downstream?chapters.slice(position):chapters.filter(c=>c.id===chapterId)).map(c=>c.id));
    for(const o of this.store.objects(projectId)){
      if(o.source?.chapterId&&affected.has(o.source.chapterId)&&['accepted','candidate'].includes(o.status)){o.status=o.source.chapterId===chapterId?'revoked':'stale';this.store.put('objects',o);}
      if(o.kind==='chapter'&&affected.has(o.id)){o.fields.summaryVersion='';o.fields.extractionPending=true;if(o.id!==chapterId)o.fields.needsReview=true;this.store.put('objects',o);}
    }
  }
  chapters(projectId:string){return orderedChapters(this.store.objects(projectId));}
  versions(projectId:string,chapterId:string){this.object(projectId,chapterId);return this.store.list('versions',projectId).filter(v=>v.chapterId===chapterId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  history(projectId:string,objectId:string){
    const object=this.object(projectId,objectId);const all=this.store.objects(projectId);const ids=new Set([object.id]);let ancestor=object.source?.supersedes;
    while(ancestor&&!ids.has(ancestor)){ids.add(ancestor);ancestor=all.find(o=>o.id===ancestor)?.source?.supersedes;}
    const records=all.filter(o=>ids.has(o.id)||o.fields.entityId===objectId).map(o=>({id:o.id,title:o.title,status:o.status,fields:o.fields,source:o.source,updatedAt:o.updatedAt}));
    const changes=this.store.db.prepare('SELECT * FROM changesets WHERE projectId=? ORDER BY at DESC').all(projectId).map(c=>({...c,data:JSON.parse(String(c.data))})).filter(c=>ids.has(c.data.before?.id)||ids.has(c.data.after?.id)||ids.has(c.data.chapterId)).slice(0,50);
    return {records,changes};
  }
  adoptIdea(projectId:string,ideaId:string,revision:number){
    return this.store.transaction(()=>{const idea=this.object(projectId,ideaId);requireThat(idea.kind==='idea','KIND','请选择灵感');if(idea.fields.adoptedChapterId)return this.object(projectId,String(idea.fields.adoptedChapterId));requireThat(idea.revision===revision&&!idea.locked,'STALE','灵感已更新或锁定');requireThat(idea.status==='candidate','SCOPE','只有候选灵感可采用为章纲');requireThat(!this.project(projectId).archived,'ARCHIVED','作品已归档');
      this.invalidateTasks(projectId,'作者采用灵感为未来章纲');let volume=this.store.objects(projectId,'volume').find(o=>!o.locked);if(!volume)volume=this.addObject(projectId,{kind:'volume',title:'新的旅程',status:'planned',parentId:this.store.objects(projectId,'book')[0].id,order:this.store.objects(projectId,'volume').length+1});
      const chapter=this.addObject(projectId,{kind:'chapter',title:idea.title,parentId:volume.id,order:this.chapters(projectId).length+1,status:'planned',fields:{goal:idea.body,inspirationId:idea.id,targetWords:2000}});const updated={...idea,status:'planned' as const,fields:{...idea.fields,adoptedChapterId:chapter.id},revision:idea.revision+1,updatedAt:now()};this.store.put('objects',updated);this.bump(projectId);this.store.change(projectId,'idea.adopt',{before:idea,after:updated,chapterId:chapter.id});return chapter;});
  }
  revertReplan(projectId:string,artifactId:string,revision:number){
    return this.store.transaction(()=>{const a=this.artifact(projectId,artifactId);if(a.data.revertedAt)return a;this.guard(projectId,revision);requireThat(a.type==='replan'&&a.status==='accepted'&&Array.isArray(a.data.beforePlans),'SCOPE','此成果没有可撤销的规划快照');
      for(const old of a.data.beforePlans){const current=this.object(projectId,old.id);requireThat(editablePlan(current)&&current.revision===old.revision+1,'STALE','规划已被后续操作修改或锁定，不能覆盖；请重新提出规划变更');}
      this.invalidateTasks(projectId,'作者撤销未来规划变更');for(const old of a.data.beforePlans)this.store.put('objects',{...old,revision:old.revision+2,updatedAt:now()});a.data.revertedAt=now();this.store.put('artifacts',a);this.bump(projectId);this.store.change(projectId,'replan.revert',{artifactId,beforePlans:a.data.beforePlans});this.store.event(projectId,a.taskId,'replan.reverted','已撤销未来规划变更，依赖任务需重新委派');return a;});
  }
  rollback(projectId:string,chapterId:string,revision:number,versionId:string){
    return this.store.transaction(()=>{const c=this.object(projectId,chapterId);requireThat(c.revision===revision,'STALE','章节已修改');requireThat(!c.locked,'LOCKED','章节已锁定');requireThat(!this.project(projectId).archived,'ARCHIVED','作品已归档');const v=this.store.get('versions',versionId);requireThat(v.projectId===projectId&&v.chapterId===chapterId,'SCOPE','版本不属于本章');
      this.invalidateTasks(projectId,'正文版本回滚，下游依赖需要重新验证');this.invalidateDerived(projectId,chapterId,true);
      const nv={...v,id:id('version'),createdAt:now(),chapterRevision:c.revision+1,actor:'author-rollback',restoredFrom:v.id,commitKey:undefined};this.store.put('versions',nv);
      const records=this.store.objects(projectId);
      for(const o of records)if(o.source?.versionId===v.id&&o.source?.chapterId===chapterId&&!records.some(r=>r.source?.type==='user'&&r.source.supersedes===o.id)){const restored={...o,id:id(o.kind),revision:1,status:o.source.inference||o.source.modality!=='objective'&&o.source.modality!=='knowledge'?'candidate' as const:'accepted' as const,source:{...o.source,versionId:nv.id,supersedes:o.id},updatedAt:now()};this.store.put('objects',restored);}
      const updated={...c,body:v.content,status:v.accepted?'accepted' as const:'draft' as const,revision:c.revision+1,fields:{...c.fields,currentVersion:nv.id,summary:v.summary,summaryVersion:nv.id,extractionPending:!v.summary,needsReview:false},updatedAt:now()};this.store.put('objects',updated);this.bump(projectId);this.store.change(projectId,'chapter.rollback',{chapterId,from:c.fields.currentVersion,to:nv.id});return updated;
    });
  }
  createTask(projectId:string,input:unknown):CreativeTask {
    const data=taskInputSchema.parse(input);const p=this.project(projectId);requireThat(!p.archived,'ARCHIVED','作品已归档');
    if(data.kind==='bootstrap')requireThat(!this.chapters(projectId).some(c=>c.body.trim()),'SCOPE','已有正文请提取资料或重规划未来章节，开书不能替换现有故事前提');
    requireThat(!this.store.list('tasks',projectId).some(t=>activeStatuses.includes(t.status)),'BUSY','本作品已有运行任务，请先暂停或取消');
    if(data.chapterId){const c=this.object(projectId,data.chapterId);requireThat(c.kind==='chapter','SCOPE','任务目标必须是章节');if(['write','review','assist'].includes(data.kind))requireThat(!c.locked,'LOCKED','任务不能改写锁定章节');if(data.kind==='write')requireThat(c.status!=='accepted'||!c.body.trim(),'ACCEPTED_SCOPE','已接受正文请使用审查修复任务或生成后续章节');}
    if(['review','assist'].includes(data.kind))requireThat(data.chapterId,'SCOPE','请选择指定章节');
    if(data.draft!==undefined||data.draftArtifactId){requireThat(data.kind==='review'&&data.draftArtifactId&&data.draft!==undefined,'SCOPE','手工工作稿必须基于一个现有章节成果');const a=this.artifact(projectId,data.draftArtifactId);requireThat(a.status==='pending'&&a.chapterId===data.chapterId&&a.baseRevision===p.revision&&a.chapterRevision===this.object(projectId,data.chapterId!).revision,'STALE','原成果已过期，不能用旧工作稿覆盖当前版本');}
    if(data.kind==='assist'){const c=this.object(projectId,data.chapterId!);requireThat(data.range&&data.range.start<=data.range.end&&c.body.slice(data.range.start,data.range.end)===data.range.expectedText,'RANGE','选区已变化');}
    const t:CreativeTask={...data,id:id('task'),projectId,status:'QUEUED',inputRevision:p.revision,expectedRevision:p.revision,epoch:0,createdAt:now(),updatedAt:now(),currentStep:'queued',completedChapters:0,steps:[],usage:{calls:0,outputTokens:0,estimated:false},checkpoint:{committed:[]},contract:{scope:data.chapterId?`指定章节 ${this.object(projectId,data.chapterId).title}`:`${data.kind==='write'?`最多 ${data.count} 章新正文`:'本作品的候选资料与未锁定未来规划'}`,lockedIds:this.store.objects(projectId).filter(o=>o.locked).map(o=>o.id),permitted:['读取有界资料','创建候选与草稿','最多两轮局部修复',...(data.autoAccept?['按合格成果策略自动接受']:[])],forbidden:['覆盖锁定对象','改写范围外已接受正文','删除用户内容','发布到外部平台'],deliverables:data.kind==='write'?['正文','一致性报告','有来源的候选事实','上下文依据']:['可审阅成果','影响与依据'],stop:['预算耗尽','重大冲突','版本变化','用户暂停或取消']}};
    this.store.transaction(()=>{this.store.put('tasks',t);this.store.event(projectId,t.id,'task.queued','任务约定已保存，可开始执行',{scope:t.contract.scope,budget:t.budget});});return t;
  }
  controlTask(projectId:string,taskId:string,action:'pause'|'cancel'|'resume'|'redelegate',answer?:string){
    return this.store.transaction(()=>{const t=this.task(projectId,taskId);requireThat(!['COMPLETED','CANCELED'].includes(t.status),'TERMINAL','任务已经结束');
      if(answer!==undefined){requireThat(action==='redelegate'&&t.status==='NEEDS_INPUT'&&t.error?.code==='TASK_CLARIFICATION','SCOPE','此任务没有待回答的约定问题');t.goal=z.string().max(6000).parse(`${t.goal}\n作者补充：${z.string().trim().min(1).max(1500).parse(answer)}`);}
      if(action==='cancel'){t.status='CANCELED';t.error=undefined;this.onInterrupt(t.id);}
      if(action==='pause'){t.status=t.status==='RUNNING'?'PAUSE_REQUESTED':'PAUSED';this.onInterrupt(t.id);}
      if(action==='resume'||action==='redelegate'){
        requireThat(!this.store.list('tasks',projectId).some(x=>x.id!==taskId&&activeStatuses.includes(x.status)),'BUSY','另一个任务正在执行');
        requireThat(!this.project(projectId).archived,'ARCHIVED','作品已归档');
        if(action==='resume')requireThat(t.expectedRevision===this.project(projectId).revision,'STALE','作品已变更，请选择「根据新版本重新委派」');
        if(action==='redelegate'){requireThat(!activeStatuses.includes(t.status),'RUNNING','先暂停任务再重新委派');t.epoch++;t.expectedRevision=this.project(projectId).revision;t.checkpoint={committed:t.checkpoint.committed};t.contract.lockedIds=this.store.objects(projectId).filter(o=>o.locked).map(o=>o.id);for(const a of this.store.list('artifacts',projectId))if(a.taskId===t.id&&a.status==='pending'){a.status='stale';this.store.put('artifacts',a);}}
        t.status='QUEUED';t.error=undefined;
      }
      t.updatedAt=now();this.store.put('tasks',t);this.store.event(projectId,t.id,`task.${action}`,({pause:'暂停已请求，将在安全边界停下',cancel:'任务已取消，未接受草稿保留',resume:'从检查点恢复',redelegate:'已绑定当前作品版本，重建必要上下文'})[action]);return t;
    });
  }
  clarifyTask(projectId:string,taskId:string,answer:string){return this.controlTask(projectId,taskId,'redelegate',answer);}
  recover(){for(const t of this.store.list('tasks')){if(t.usage.calls>t.steps.reduce((n,s)=>n+(s.calls?.length??0),0)&&!t.usage.estimated){t.usage.estimated=true;this.store.put('tasks',t);}if(activeStatuses.includes(t.status)){t.status='PAUSED';t.error={code:'INTERRUPTED',message:'服务曾中断；已保留检查点，点击恢复继续'};this.store.put('tasks',t);this.store.event(t.projectId,t.id,'task.recovered','服务重启；任务停在安全检查点');}}}
  putArtifact(task:CreativeTask,type:Artifact['type'],data:any,chapter?:StoryObject):Artifact {
    const fresh=this.task(task.projectId,task.id);const valid=fresh.expectedRevision===task.expectedRevision&&this.project(task.projectId).revision===task.expectedRevision&&!['CANCELED','PAUSED','PAUSE_REQUESTED'].includes(fresh.status);
    const a:Artifact={id:id('artifact'),taskId:task.id,projectId:task.projectId,type,data,baseRevision:task.expectedRevision,chapterId:chapter?.id,chapterRevision:chapter?.revision,status:valid?'pending':'stale',createdAt:now()};this.store.put('artifacts',a);this.store.event(task.projectId,task.id,'artifact.saved',valid?'成果已落盘，等待检查或接受':'过期成果已保留，未覆盖作者内容',{artifactId:a.id,type});return a;
  }
  acceptArtifact(projectId:string,artifactId:string,actor:'author'|'auto',partialText?:string){
    return this.store.transaction(()=>{
      const a=this.artifact(projectId,artifactId);if(a.status==='accepted')return a;
      requireThat(a.status==='pending','STALE','成果已过期或已拒绝');this.guard(projectId,a.baseRevision);const t=this.task(projectId,a.taskId);
      requireThat(t.status!=='CANCELED'&&t.status!=='PAUSE_REQUESTED'&&(actor!=='auto'||t.status==='RUNNING'),'PAUSED','任务已停止，不能自动接受');
      if(actor==='auto')requireThat(t.autoAccept,'AUTHORIZATION','任务没有自动接受授权');
      if(a.type==='state-review'){
        const c=this.object(projectId,a.chapterId!);const v=this.store.get('versions',String(c.fields.currentVersion));const review=a.data.review as Review;requireThat(c.revision===a.chapterRevision&&v.id===a.data.versionId,'STALE','作者正文又有修改');requireThat(!review.issues.some(i=>i.blocks&&i.status==='open'),'CONFLICT','请先处理状态审查中的阻塞问题');this.invalidateDerived(projectId,c.id,false);this.commitEvidence(c,v,review,t,actor);c.fields.summary=review.summary;c.fields.summaryVersion=v.id;c.fields.extractionPending=false;this.store.put('objects',c);t.checkpoint.artifactId=undefined;
      } else if(a.type==='chapter'){
        const review=a.data.review as Review;requireThat(review,'REVIEW_REQUIRED','尚未审校，不能接受');requireThat(!review.issues.some(i=>i.blocks&&i.status==='open'),'CONFLICT','存在阻塞问题，需要先处理');
        const c=this.object(projectId,a.chapterId!);requireThat(c.revision===a.chapterRevision&&!c.locked,'STALE','章节版本已变化或被锁定');
        const version:ChapterVersion={id:id('version'),projectId,chapterId:c.id,content:a.data.content,chapterRevision:c.revision+1,createdAt:now(),actor:actor==='auto'?`auto:${t.id}:qualified-v1`:'author',accepted:true,summary:review.summary,commitKey:a.id};
        this.invalidateDerived(projectId,c.id,true);this.store.put('versions',version);this.commitEvidence(c,version,review,t,actor);
        this.store.put('objects',{...c,body:version.content,status:'accepted',revision:c.revision+1,updatedAt:now(),fields:{...c.fields,...a.data.plan,targetWords:t.targetWords,currentVersion:version.id,summary:review.summary,summaryVersion:version.id,extractionPending:false,needsReview:false,control:actor==='auto'?'director':'author'}});
        t.completedChapters++;t.checkpoint.committed.push(a.id);t.checkpoint.artifactId=undefined;t.checkpoint.chapterId=undefined;
      } else if(a.type==='edit'){
        const c=this.object(projectId,a.chapterId!);requireThat(c.revision===a.chapterRevision&&!c.locked,'STALE','正文已修改或锁定');const range=t.range!;requireThat(c.body.slice(range.start,range.end)===range.expectedText,'STALE','选区已经改变');
        const replacement=partialText===undefined?a.data.content:z.string().max(50000).parse(partialText);requireThat(actor==='author','AUTHORIZATION','选区操作由作者接受');
        this.invalidateDerived(projectId,c.id,true);const content=c.body.slice(0,range.start)+replacement+c.body.slice(range.end);const v:ChapterVersion={id:id('version'),projectId,chapterId:c.id,content,chapterRevision:c.revision+1,createdAt:now(),actor:'author-selection',accepted:true,summary:'',commitKey:a.id};this.store.put('versions',v);this.store.put('objects',{...c,body:content,status:'accepted',revision:c.revision+1,fields:{...c.fields,currentVersion:v.id,summaryVersion:'',extractionPending:true},updatedAt:now()});
      } else if(a.type==='setup'){
        const objects=a.data.objects as ObjectInput[];const titleMap=new Map<string,string>();let book=this.store.objects(projectId,'book')[0];let volume:StoryObject|undefined;
        requireThat(a.data.directions[a.data.chosen],'DIRECTION','所选故事方向不存在');
        for(const input of objects){requireThat(['book','volume','chapter','character','world'].includes(input.kind),'PLAN_CANON','开书只接受基础人物、世界与未来章纲');chapterMetadata(input);if(input.kind==='book'){titleMap.set(input.title,book.id);continue;}const parentId=input.kind==='volume'?book.id:input.kind==='chapter'?volume?.id??null:null;
          if(input.kind==='chapter'&&!parentId){volume=this.addObject(projectId,{kind:'volume',title:'第一卷',status:'planned',parentId:book.id});}
          const o=this.addObject(projectId,{...input,parentId:input.kind==='chapter'?volume!.id:parentId,status:['character','world','relationship'].includes(input.kind)?'accepted':'planned',source:{type:'ai',quote:a.data.rationale,taskId:t.id,policy:actor==='auto'?'qualified-v1':'author-accept'}});titleMap.set(o.title,o.id);if(o.kind==='volume')volume=o;
        }
        const p=this.project(projectId);p.premise=a.data.directions[a.data.chosen]?.premise??p.premise;this.store.put('projects',p);
      } else if(a.type==='replan'){
        const known=new Set([...this.store.objects(projectId),...this.store.list('tasks',projectId)].map(o=>o.id));requireThat(a.data.impacts.every((i:any)=>known.has(i.id)),'DEPENDENCY','影响分析引用了不存在的对象');
        requireThat(new Set(a.data.changes.map((c:any)=>c.id)).size===a.data.changes.length,'SCOPE','同一规划不能重复修改');const before=[];for(const change of a.data.changes){const o=this.object(projectId,change.id);requireThat(editablePlan(o)&&(!t.chapterId||o.id===t.chapterId),'SCOPE','重规划仅可修改任务范围内未锁定的未来大纲');const updated={...o,title:change.title??o.title,body:o.kind==='chapter'?o.body:change.body,fields:{...o.fields,...change.fields,goal:change.body},revision:o.revision+1,updatedAt:now()};chapterMetadata(oldInput(updated),o);before.push(o);this.store.put('objects',updated);}a.data.beforePlans=before;this.store.change(projectId,'replan',{artifactId:a.id,before,changes:a.data.changes,impacts:a.data.impacts});
      } else if(a.type==='ideas'){
        for(const idea of a.data.ideas)this.addObject(projectId,{kind:'idea',title:idea.title,body:idea.body,status:'candidate',fields:{tradeoff:idea.tradeoff},source:{type:'ai',quote:idea.body,taskId:t.id}});
      } else if(a.type==='extraction'){
        for(const input of a.data.objects??[])this.addObject(projectId,{...input,locked:false,status:'candidate',source:{type:'import',quote:input.source?.quote??'',chapterId:a.chapterId,versionId:a.data.versionId,taskId:t.id,inference:true,modality:'uncertain'}});
      }
      a.status='accepted';this.store.put('artifacts',a);if(a.type==='chapter')for(const previous of this.store.list('artifacts',projectId))if(previous.id!==a.id&&previous.taskId===a.taskId&&previous.chapterId===a.chapterId&&previous.status==='pending'){previous.status='stale';this.store.put('artifacts',previous);}const p=this.bump(projectId);this.invalidateTasks(projectId,'其他任务接受了新成果',t.id);t.expectedRevision=p.revision;
      if(a.type==='extraction')for(const sibling of this.store.list('artifacts',projectId).filter(x=>x.taskId===t.id&&x.type==='extraction'&&x.status==='pending')){const c=this.object(projectId,sibling.chapterId!);if(c.revision===sibling.chapterRevision&&c.fields.currentVersion===sibling.data.versionId){sibling.baseRevision=p.revision;this.store.put('artifacts',sibling);}}
      if(actor==='author'&&t.status==='NEEDS_INPUT'){t.status=a.type==='state-review'?'PAUSED':a.type==='extraction'&&this.store.list('artifacts',projectId).some(x=>x.taskId===t.id&&x.status==='pending')?'NEEDS_INPUT':a.type==='chapter'&&t.completedChapters<t.count?'PAUSED':'COMPLETED';t.error=undefined;}
      this.store.put('tasks',t);this.store.change(projectId,'artifact.accept',{artifactId:a.id,actor,taskId:t.id,policy:actor==='auto'?'qualified-v1':'author'});this.store.event(projectId,t.id,'artifact.accepted','成果与关联资料已一致提交',{artifactId:a.id,revision:p.revision});return a;
    });
  }
  commitEvidence(chapter:StoryObject,version:ChapterVersion,review:Review,task:CreativeTask,actor:string){
    const ordinal=this.chapters(chapter.projectId).findIndex(c=>c.id===chapter.id)+1;
    const source=(quote:string)=>({type:'chapter' as const,chapterId:chapter.id,versionId:version.id,quote,start:version.content.indexOf(quote),end:version.content.indexOf(quote)+quote.length,time:'当前章',fromChapter:ordinal,taskId:task.id,policy:actor==='auto'?'qualified-v1':'author-accept'});
    for(const claim of review.claims){requireThat(version.content.includes(claim.quote),'EVIDENCE','事实证据未出现在正文');this.object(chapter.projectId,claim.entityId);this.addObject(chapter.projectId,{kind:'fact',title:`${claim.property}：${claim.value}`,body:claim.quote,status:claim.inference||!['objective','knowledge'].includes(claim.modality)?'candidate':'accepted',fields:{entityId:claim.entityId,property:claim.property,value:claim.value},source:{...source(claim.quote),time:claim.time,supersedes:claim.supersedes,inference:claim.inference,modality:claim.modality}});}
    for(const e of review.events){requireThat(version.content.includes(e.quote),'EVIDENCE','事件证据未出现在正文');this.addObject(chapter.projectId,{kind:'event',title:e.title,body:e.quote,status:e.inference||(e.modality??'objective')!=='objective'?'candidate':'accepted',fields:{entityIds:e.entityIds,storyTime:e.time,chapterOrder:ordinal},source:{...source(e.quote),time:e.time,modality:e.modality,inference:e.inference}});}
    for(const f of review.foreshadowUpdates){const o=this.object(chapter.projectId,f.id);requireThat(o.kind==='foreshadow'&&!o.locked&&version.content.includes(f.quote),'FORESHADOW','伏笔更新不合法');this.addObject(chapter.projectId,{kind:'fact',title:`伏笔${f.state}`,body:f.quote,status:'accepted',fields:{entityId:o.id,property:'foreshadowState',value:f.state},source:source(f.quote)});}
  }
  refreshEvidence(taskId:string,chapterId:string,review:Review){return this.store.transaction(()=>{const t=this.store.get('tasks',taskId);this.guard(t.projectId,t.expectedRevision);requireThat(t.status==='RUNNING','PAUSED','任务已停止');const c=this.object(t.projectId,chapterId);const v=this.store.get('versions',String(c.fields.currentVersion));requireThat(v.content===c.body,'STALE','正文已修改');requireThat(!review.issues.some(i=>i.blocks&&i.status==='open'),'CONFLICT','作者修改后的正文存在重大冲突，请先审查');this.invalidateDerived(t.projectId,c.id,false);this.commitEvidence(c,v,review,t,'author');c.fields.summary=review.summary;c.fields.summaryVersion=v.id;c.fields.extractionPending=false;this.store.put('objects',c);t.expectedRevision=this.bump(t.projectId).revision;this.store.put('tasks',t);this.store.event(t.projectId,t.id,'canon.refreshed','已根据作者最新正文重建候选事实与摘要',{chapterId,versionId:v.id});return t;});}
  rejectArtifact(projectId:string,artifactId:string){return this.store.transaction(()=>{const a=this.artifact(projectId,artifactId);requireThat(a.status!=='accepted','ACCEPTED','已接受成果请通过版本恢复撤销');a.status='rejected';this.store.put('artifacts',a);const t=this.task(projectId,a.taskId);if(t.status==='NEEDS_INPUT'&&!this.store.list('artifacts',projectId).some(x=>x.taskId===t.id&&x.status==='pending')){t.status='CANCELED';t.error=undefined;this.store.put('tasks',t);}this.store.event(projectId,a.taskId,'artifact.rejected','作者拒绝成果');return a;});}
  resolveIssue(projectId:string,artifactId:string,issueId:string,status:'ignored'|'intentional',reason:string){return this.store.transaction(()=>{requireThat(reason.trim().length>=3,'REASON','请记录具体理由');const a=this.artifact(projectId,artifactId);requireThat(a.status==='pending','STALE','成果不是待审状态');const issue=(a.data.review as Review).issues.find(i=>i.id===issueId);requireThat(issue,'NOT_FOUND','找不到问题');requireThat(!(issue.blocks&&issue.engine==='deterministic'),'LOCKED_CONFLICT','结构化硬约束冲突必须修复正文或显式修改设定');issue.status=status;issue.reason=reason;this.store.put('artifacts',a);this.store.change(projectId,'review.decision',{artifactId,issueId,status,reason});return a;});}
  splitImport(raw:string){
    requireThat(raw.length<=5_000_000,'SIZE','单次导入限 500 万字符',413);const re=/^(?:#{1,3}\s+.+|第[零〇一二三四五六七八九十百千万\d]+[章节回][^\r\n]*|Chapter\s+\d+[^\r\n]*)$/gimu;const matches=[...raw.matchAll(re)];
    if(!matches.length)return [{title:'导入正文',body:raw,start:0,end:raw.length}];const result=[];if(matches[0].index!>0)result.push({title:'序言',body:raw.slice(0,matches[0].index),start:0,end:matches[0].index!});for(let n=0;n<matches.length;n++){const m=matches[n];const end=matches[n+1]?.index??raw.length;result.push({title:m[0].replace(/^#+\s*/,''),body:raw.slice(m.index!+m[0].length,end).replace(/^\r?\n/,''),start:m.index!,end});}return result;
  }
  importText(projectId:string,revision:number,name:string,raw:string,parts?:{title:string;body:string}[]){
    const chunks=z.array(z.object({title:z.string().min(1).max(240),body:z.string().max(100000)})).min(1).max(5000).parse(parts??this.splitImport(raw));
    requireThat(raw.length<=5_000_000,'SIZE','单次导入限 500 万字符',413);
    return this.store.transaction(()=>{this.guard(projectId,revision);this.invalidateTasks(projectId,'导入了新正文');this.store.db.prepare('INSERT INTO imports VALUES(?,?,?,?,?)').run(id('import'),projectId,name,raw,now());const book=this.store.objects(projectId,'book')[0];const volume=this.addObject(projectId,{kind:'volume',title:name,parentId:book.id,status:'planned',order:Math.max(-1,...this.store.objects(projectId,'volume').map(o=>o.order))+1});
      const ids=[];for(const [n,chunk] of chunks.entries()){const c=this.addObject(projectId,{kind:'chapter',title:chunk.title,parentId:volume.id,order:n,status:'accepted',body:chunk.body});const v:ChapterVersion={id:id('version'),projectId,chapterId:c.id,content:c.body,chapterRevision:1,createdAt:now(),actor:'author-import',accepted:true,summary:''};this.store.put('versions',v);c.fields={currentVersion:v.id,extractionPending:true,control:'author'};this.store.put('objects',c);ids.push(c.id);}this.bump(projectId);this.store.event(projectId,null,'import.saved',`已保留原文并导入 ${chunks.length} 章；资料抽取需单独委派`);return {chapterIds:ids};});
  }
  exportText(projectId:string,format:'txt'|'md'){const p=this.project(projectId);return (format==='md'?`# ${p.title}\n\n`:`${p.title}\n\n`)+this.chapters(projectId).map(c=>`${format==='md'?'## ':''}${c.title}\n\n${c.body}`).join('\n\n');}
  backup(projectId:string){const payload={schema:1,project:this.project(projectId),objects:this.store.objects(projectId),versions:this.store.list('versions',projectId),tasks:this.store.list('tasks',projectId),artifacts:this.store.list('artifacts',projectId),events:this.store.db.prepare('SELECT * FROM events WHERE projectId=?').all(projectId),changesets:this.store.db.prepare('SELECT * FROM changesets WHERE projectId=?').all(projectId),imports:this.store.db.prepare('SELECT * FROM imports WHERE projectId=?').all(projectId)};return {checksum:hash(payload),payload};}
  restoreBackup(input:unknown){
    const envelope=z.object({checksum:z.string(),payload:z.object({schema:z.literal(1),project:z.any(),objects:z.array(z.any()),versions:z.array(z.any()),tasks:z.array(z.any()),artifacts:z.array(z.any()),events:z.array(z.any()),changesets:z.array(z.any()),imports:z.array(z.any())})}).parse(input);
    requireThat(hash(envelope.payload)===envelope.checksum,'CHECKSUM','备份完整性校验失败',422);const data=envelope.payload;const p=projectSchema.parse(oldProjectInput(data.project));for(const o of data.objects)objectSchema.parse(oldInput(o));
    const ids=new Map<string,string>();for(const value of [data.project,...data.objects,...data.versions,...data.tasks,...data.artifacts,...data.changesets,...data.imports]){requireThat(typeof value.id==='string'&&!ids.has(value.id),'BACKUP','备份 ID 重复或无效',422);ids.set(value.id,id(value.id.split('_')[0]));}
    const remap=(v:any):any=>typeof v==='string'?(ids.get(v)??v):Array.isArray(v)?v.map(remap):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,remap(x)])):v;
    return this.store.transaction(()=>{const project={...data.project,...p,id:ids.get(data.project.id)!,title:p.title+' · 恢复副本',archived:false};this.store.put('projects',project);
      for(const o of data.objects){requireThat(o.projectId===data.project.id,'BACKUP','对象归属无效',422);const r=remap(o);this.store.put('objects',r);}
      for(const c of data.versions){requireThat(c.projectId===data.project.id&&ids.has(c.chapterId)&&typeof c.content==='string','BACKUP','正文版本关联无效',422);this.store.put('versions',remap(c));}
      for(const t of data.tasks){requireThat(t.projectId===data.project.id,'BACKUP','任务归属无效',422);taskInputSchema.parse(Object.fromEntries(Object.keys(taskInputSchema.shape).map(k=>[k,t[k]])));const r=remap(t);if(activeStatuses.includes(r.status))r.status='PAUSED';this.store.put('tasks',r);}
      for(const a of data.artifacts){requireThat(a.projectId===data.project.id&&ids.has(a.taskId),'BACKUP','成果归属无效',422);this.store.put('artifacts',remap(a));}
      for(const i of data.imports)this.store.db.prepare('INSERT INTO imports VALUES(?,?,?,?,?)').run(ids.get(i.id)!,project.id,i.name,i.raw,i.at);
      for(const c of data.changesets)this.store.change(project.id,c.kind,remap(JSON.parse(c.data)));
      for(const e of data.events)this.store.event(project.id,ids.get(e.taskId)??null,e.type,e.message,remap(JSON.parse(e.data??'{}')));
      this.store.event(project.id,null,'backup.restored','项目备份已校验并恢复为独立副本');return project;});
  }
}
export function oldInput(o:StoryObject):ObjectInput {const {id:_,projectId:__,revision:___,updatedAt:____,...input}=o;return input;}
function oldProjectInput(p:Project){const {id:_,revision:__,createdAt:___,updatedAt:____,...input}=p;return input;}
