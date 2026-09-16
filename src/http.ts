import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Domain } from './domain.js';
import { Runner, publicError } from './runtime.js';
import { buildContext } from './context.js';
import { DomainError, requireThat } from './contracts.js';
import { prompts } from './prompts.js';
import { binding,bindConfig,listConfigs,configVersion,importConfiguration,saveConfig,resolveConfig,adaptToNovel,nativePresets } from './config.js';
import { configPatchSchema,regexRuleSchema } from './config-contracts.js';
import { compilePrompt,macroEnvironment } from './compiler.js';
import { transformText } from './text-pipeline.js';
import { pruneRequests,requestGet,requestRetention,requestSummaries } from './requests.js';
import { taskInputSchema,now,type CreativeTask } from './contracts.js';
import { memoryStatus,memoryGet,editMemory,recallMemory,rollingPlanning } from './memory.js';
import { temporalObjects } from './temporal.js';
import { previewLorebook,acceptLorebook } from './lorebook.js';
import { sourceRoute } from './source-http.js';
import { resolveStoryScope,type StoryScopeOptions } from './scope.js';
import { planningInput } from './planning.js';
import { artifactSummaries,chapterDetail,projectMetadata,projectNavigation,taskSummaries } from './projections.js';
import { shelfProjects,coverGet,coverSave,coverRemove } from './shelf.js';
export const API='/api/novel-studio';
const num=z.number().int().positive();
export async function readJson(req:IncomingMessage){let size=0;const chunks:Buffer[]=[];for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;requireThat(size<=64*1024*1024,'BODY_LIMIT','请求超过 64 MiB',413);chunks.push(b);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw new DomainError('INVALID_JSON','请求不是有效 JSON',400);}}
export class HttpApp {
  constructor(public domain:Domain,public runner:Runner,public assets=resolve('dist')){}
  async handle(req:IncomingMessage,res:ServerResponse){
    try{
      const host=req.headers.host??'';requireThat(/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host),'HOST','仅允许本机访问',403);
      if(req.headers.origin)requireThat(req.headers.origin===`http://${host}`||req.headers.origin===`https://${host}`,'ORIGIN','不允许跨站操作',403);
      requireThat(req.headers['sec-fetch-site']!=='cross-site','ORIGIN','不允许跨站操作',403);
      const url=new URL(req.url??'/',`http://${host}`);
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
      if(url.pathname.startsWith(API)){
        const method=req.method??'GET';let body:any={};
        const download=url.pathname.slice(API.length).match(/^\/projects\/([^/]+)\/download$/);
        const cover=url.pathname.slice(API.length).match(/^\/projects\/([^/]+)\/cover$/);
        if(cover&&method==='GET'){const image=coverGet(this.domain,cover[1]);requireThat(image,'NOT_FOUND','封面不存在',404);res.writeHead(200,{'Content-Type':image.mime,'Content-Length':image.data.length,'Cache-Control':'private, max-age=0, must-revalidate'});res.end(Buffer.from(image.data));return;}
        if(download&&method==='GET'){const project=this.domain.project(download[1]);const format=z.enum(['txt','md','backup']).parse(url.searchParams.get('format'));const name=project.title+(format==='backup'?'.novel.json':'.'+format);const content=format==='backup'?JSON.stringify(this.domain.backup(project.id),null,2):this.domain.exportText(project.id,format);res.writeHead(200,{'Content-Type':format==='backup'?'application/json; charset=utf-8':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="novel-studio.${format==='backup'?'json':format}"; filename*=UTF-8''${encodeURIComponent(name)}`});res.end(content);return;}
        if(!['GET','HEAD'].includes(method)){requireThat(req.headers['content-type']?.startsWith('application/json')&&req.headers['x-novel-studio']==='1','CONTENT_TYPE','写请求需要 JSON 和本地工作台标识',403);body=await readJson(req);}
        const value=await this.dispatch(method,url.pathname.slice(API.length),body,url.searchParams);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));return;
      }
      if(req.method!=='GET')throw new DomainError('NOT_FOUND','找不到页面',404);
      const files:Record<string,[string,string]>={'/novel-studio/':['index.html','text/html; charset=utf-8'],'/novel-studio/app.js':['app.js','text/javascript'],'/novel-studio/app.css':['app.css','text/css']};
      if(url.pathname==='/'||url.pathname==='/novel-studio'){res.writeHead(302,{Location:'/novel-studio/'});res.end();return;}
      const file=files[url.pathname];requireThat(file,'NOT_FOUND','找不到页面',404);
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
      res.setHeader('Content-Type',file[1]);res.end(await readFile(resolve(this.assets,file[0])));
    }catch(error){const e=publicError(error);const status=error instanceof DomainError?error.status:error instanceof z.ZodError?422:500;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:e}));}
  }
  async dispatch(method:string,path:string,body:any={},query=new URLSearchParams()):Promise<any>{
    const segments=path.split('/').filter(Boolean);const [group,pid,resource,key,action]=segments;
    if(['sources','source-versions','source-runs','manifests'].includes(group))return sourceRoute(this.domain,this.runner,method,segments,body,query);
    if(method==='GET'&&path==='/health')return {version:'0.3.0',dsh:this.runner.provider.info(),demo:this.runner.demo.info(),schema:5,prompts:Object.values(prompts).map(p=>({id:p.id,version:p.version,purpose:p.purpose}))};
    if(method==='GET'&&path==='/shelf')return shelfProjects(this.domain);
    if(group==='creative-assets'){
      const store=this.domain.store;
      if(method==='GET'&&!pid)return {versions:listConfigs(store),global:binding(store,'global'),effective:resolveConfig(store,'global-preview'),samples:nativePresets};
      if(method==='POST'&&pid==='preview')return importConfiguration(z.string().parse(body.raw),z.string().max(160).parse(body.name??'导入配置'),'本地文件',body.orderId);
      if(method==='POST'&&pid==='save'){const raw=body.raw!==undefined?z.string().parse(body.raw):JSON.stringify({format:'dsh-novel-config',config:configPatchSchema.parse(body.config)});let version=importConfiguration(raw,z.string().trim().min(1).max(160).parse(body.name),'作者保存');if(body.parentId)version.parentId=configVersion(store,z.string().parse(body.parentId)).id;return store.transaction(()=>saveConfig(store,version));}
      if(method==='POST'&&pid==='bind')return store.transaction(()=>{const key=z.string().nullable().parse(body.versionId);if(key){const version=configVersion(store,key);requireThat(!version.config.bindings?.characterId&&!version.config.bindings?.viewpointId,'GLOBAL_BINDING','全局规则不能绑定某本作品的可变角色；请改用项目配置',422);}bindConfig(store,'global',key,z.string().nullable().parse(body.expected));return {global:binding(store,'global'),effective:resolveConfig(store,'global-preview')};});
      if(method==='POST'&&pid&&resource==='adapt')return adaptToNovel(configVersion(store,pid));
    }
    if(group==='projects'&&!pid){if(method==='GET')return this.domain.store.list('projects').filter(p=>!p.sourceWorkspace);if(method==='POST')return this.domain.createProject(body);}
    if(path==='/backups/restore'&&method==='POST')return this.domain.restoreBackup(body);
    requireThat(group==='projects'&&pid,'NOT_FOUND','未知接口',404);requireThat(!this.domain.project(pid).sourceWorkspace||method==='GET'&&['requests','tasks','events'].includes(resource),'SOURCE_SCOPE','原作分析空间只允许通过有范围的原作接口操作',403);
    if(!resource){if(method==='GET')return this.domain.snapshot(pid);if(method==='PATCH')return this.domain.updateProject(pid,num.parse(body.revision),body.project);}
    if(resource==='metadata'&&method==='GET')return projectMetadata(this.domain,pid);
    if(resource==='cover'){
      if(method==='POST')return coverSave(this.domain,pid,z.object({base64:z.string(),mime:z.string(),expectedRevision:z.number().int().positive().nullable()}).parse(body));
      if(method==='DELETE')return coverRemove(this.domain,pid,z.number().int().positive().parse(body.expectedRevision));
    }
    if(resource==='navigation'&&method==='GET')return projectNavigation(this.domain,pid);
    if(resource==='source-baseline'&&method==='GET'){const row=this.domain.store.db.prepare("SELECT data FROM changesets WHERE projectId=? AND kind='source.activated' ORDER BY rowid LIMIT 1").get(pid);return row?JSON.parse(row.data as string):{assets:[]};}
    if(resource==='status'&&method==='GET')return {project:this.domain.project(pid),tasks:taskSummaries(this.domain,pid)};
    if(resource==='planning-check'&&method==='GET'){const read=resolveStoryScope(this.domain,pid,scopeQuery(query));return rollingPlanning(this.domain,pid,read);}
    if(resource==='memories'){
      if(method==='GET'&&!key)return memoryStatus(this.domain,pid);
      if(method==='GET'&&key)return memoryGet(this.domain.store,pid,key);
      if(method==='PATCH'&&key)return editMemory(this.domain,pid,key,num.parse(body.revision),z.object({content:z.unknown().optional(),locked:z.boolean().optional(),invalidate:z.boolean().optional(),restoreRevision:z.number().int().positive().optional()}).strict().parse(body.change));
    }
    if(resource==='recall'&&method==='POST')return recallMemory(this.domain,pid,z.object({goal:z.string().max(6000),asOf:z.number().int().nonnegative(),branch:z.string().max(100).default('main'),entityIds:z.array(z.string()).max(30).optional(),viewpointId:z.string().optional(),audience:z.enum(['author','character','reader']).optional(),limit:z.number().int().min(1).max(12).optional()}).parse(body));
    if(resource==='temporal'&&method==='POST')return temporalObjects(this.domain,pid,z.object({asOfChapter:z.number().int().nonnegative().optional(),viewpointId:z.string().optional(),audience:z.enum(['author','character','reader']).optional(),branch:z.string().max(100).default('main'),storyTime:z.string().max(240).optional()}).parse(body));
    if(resource==='lorebook'&&method==='POST')return key==='preview'?previewLorebook(z.string().parse(body.raw),z.string().max(160).parse(body.name)):acceptLorebook(this.domain,pid,num.parse(body.revision),z.string().parse(body.raw),z.string().max(160).parse(body.name),z.string().parse(body.sourceHash));
    if(resource==='configurations'){
      if(method==='GET'&&!key)return {versions:listConfigs(this.domain.store),bindings:{global:binding(this.domain.store,'global'),project:binding(this.domain.store,'project:'+pid)},effective:resolveConfig(this.domain.store,pid),samples:nativePresets};
      if(method==='GET'&&key)return configVersion(this.domain.store,key);
      if(method==='POST'&&key==='preview')return importConfiguration(z.string().parse(body.raw),z.string().max(160).parse(body.name??'导入配置'),'本地文件',body.orderId);
      if(method==='POST'&&!key){this.domain.guard(pid,this.domain.project(pid).revision);const raw=body.raw!==undefined?z.string().parse(body.raw):JSON.stringify({format:'dsh-novel-config',config:configPatchSchema.parse(body.config)});let v=importConfiguration(raw,z.string().trim().min(1).max(160).parse(body.name),'作者保存',body.orderId);if(body.parentId)v.parentId=configVersion(this.domain.store,z.string().parse(body.parentId)).id;return this.domain.store.transaction(()=>{v=saveConfig(this.domain.store,v);this.domain.store.event(pid,null,'config.saved','已保存独立配置版本；尚未自动应用',{versionId:v.id});return v;});}
      if(method==='POST'&&key==='bind'){const scope=z.enum(['global','project']).parse(body.scope)==='global'?'global':'project:'+pid;return this.domain.store.transaction(()=>{this.domain.guard(pid,this.domain.project(pid).revision);bindConfig(this.domain.store,scope,z.string().nullable().parse(body.versionId),z.string().nullable().parse(body.expected));this.domain.store.event(pid,null,'config.bound','后续任务采用新配置；运行任务保持原配置版本',{scope,versionId:body.versionId});return resolveConfig(this.domain.store,pid);});}
      if(method==='POST'&&key&&action==='adapt')return adaptToNovel(configVersion(this.domain.store,key));
    }
    if(resource==='regex-test'&&method==='POST'){const task=previewTask(this.domain,pid,{kind:'write',goal:'规则测试',configuration:{patch:body.config}}),env=macroEnvironment(this.domain,task,task.configSnapshot!,{});const result=await transformText(z.string().max(100000).parse(body.input),z.array(regexRuleSchema).max(40).parse(body.rules),z.enum(['before','after','display']).parse(body.stage),z.enum(['goal','selection','world','prose']).parse(body.scope??'prose'),{test:true,edited:body.edited===true,expand:env.expand});return {...result,macros:env.trace,warnings:env.warnings};}
    if(resource==='display'&&method==='POST'){const chapter=this.domain.object(pid,z.string().parse(body.chapterId)),task=previewTask(this.domain,pid,{kind:'write',goal:'展示正文',chapterId:chapter.id}),config=task.configSnapshot!,env=macroEnvironment(this.domain,task,config,{});const result=await transformText(chapter.body,config.config.enabled?config.config.regex??[]:[],'display','prose',{test:true,expand:env.expand});return {...result,macros:env.trace,warnings:env.warnings};}
    if(resource==='compile-preview'&&method==='POST'){
      const prompt=z.enum(Object.keys(prompts) as [keyof typeof prompts,...(keyof typeof prompts)[]]).parse(body.prompt??'write'),t=previewTask(this.domain,pid,body.task??{kind:'write',goal:'继续当前章节'}),config=t.configSnapshot!.config;
      const options={chapterId:t.chapterId,goal:t.goal,maxChars:t.budget.contextChars,...t.perspective,planningScope:t.planningScope,viewpointId:t.perspective?.viewpointId??config.bindings?.viewpointId,audience:t.perspective?.audience??config.bindings?.audience,memory:config.enabled?config.memory:undefined},read=resolveStoryScope(this.domain,pid,options),pack=buildContext(this.domain,pid,{...options,resolvedScope:read}),extra=prompt==='replan'?planningInput(this.domain,t,read):{};return compilePrompt(this.domain,t,prompt,{goal:t.goal,targetWords:t.targetWords,constraints:t.constraints,context:pack.text,_contextPack:pack,chapterId:t.chapterId,...extra});
    }
    if(resource==='requests'){
      if(method==='GET'&&key==='retention')return requestRetention(this.domain.store,pid);
      if(method==='GET'&&key)return requestGet(this.domain.store,pid,key);
      if(method==='GET'){const page=requestSummaries(this.domain.store,pid,{offset:Number(query.get('offset'))||0,limit:Number(query.get('limit'))||100,taskId:query.get('taskId')??undefined});return query.get('paged')==='1'?page:page.items;}
      if(method==='POST'&&key==='cleanup')return pruneRequests(this.domain.store,pid,{user:true,before:z.string().datetime().parse(body.before),removeSummaries:body.removeSummaries===true});
    }
    if(resource==='objects'){
      if(method==='GET'&&!key){const q=query.get('q')??'';const kind=query.get('kind');const all=this.domain.store.objects(pid,kind??undefined).filter(o=>!q||`${o.title} ${o.body} ${JSON.stringify(o.fields)}`.toLowerCase().includes(q.toLowerCase()));const offset=Math.max(0,Number(query.get('offset'))||0);const limit=Math.min(300,Math.max(1,Number(query.get('limit'))||100));return {items:all.slice(offset,offset+limit),total:all.length};}
      if(method==='POST'&&!key)return this.domain.createObject(pid,num.parse(body.revision),body.object);
      if(method==='GET'&&key&&!action)return chapterDetail(this.domain,pid,key);
      if(method==='PATCH'&&key)return this.domain.updateObject(pid,key,num.parse(body.revision),body.object);
      if(method==='POST'&&key&&action==='takeover')return this.domain.takeover(pid,key,num.parse(body.revision));
      if(method==='POST'&&key&&action==='adopt')return this.domain.adoptIdea(pid,key,num.parse(body.revision));
      if(method==='POST'&&key&&action==='body')return this.domain.saveChapter(pid,key,num.parse(body.revision),body.body);
      if(method==='POST'&&key&&action==='rollback')return this.domain.rollback(pid,key,num.parse(body.revision),z.string().parse(body.versionId));
      if(method==='GET'&&key&&action==='versions')return this.domain.versions(pid,key);
      if(method==='GET'&&key&&action==='history')return this.domain.history(pid,key);
    }
    if(resource==='tasks'){
      if(method==='GET'&&!key)return taskSummaries(this.domain,pid);
      if(method==='POST'&&!key){const task=this.domain.createTask(pid,body);this.runner.start(task.id);return task;}
      if(method==='GET'&&key){const t=this.domain.task(pid,key);const artifacts=this.domain.store.db.prepare('SELECT data FROM artifacts WHERE projectId=? AND taskId=?').all(pid,key).map(row=>JSON.parse(String(row.data))).map(a=>({...a,data:{title:a.data.title,content:a.data.content,review:a.data.review,context:a.data.context,late:a.data.late}}));return {...t,events:this.domain.store.events(pid,key),artifacts};}
      if(method==='POST'&&key&&action==='clarify'){const t=this.domain.clarifyTask(pid,key,z.string().parse(body.answer));this.runner.start(t.id);return t;}
      if(method==='POST'&&key&&action==='budget')return this.domain.grantTaskBudget(pid,key,body);
      if(method==='POST'&&key&&action){const parsed=z.enum(['pause','resume','redelegate','cancel']).parse(action);const task=this.domain.controlTask(pid,key,parsed);if(task.status==='QUEUED')this.runner.start(task.id);return task;}
    }
    if(resource==='artifact-summaries'&&method==='GET')return artifactSummaries(this.domain,pid);
    if(resource==='artifacts'&&key){
      if(method==='GET')return this.domain.artifact(pid,key);
      if(method==='POST'&&action==='accept')return this.domain.acceptArtifact(pid,key,'author',body.partialText);
      if(method==='POST'&&action==='revert')return this.domain.revertReplan(pid,key,num.parse(body.revision));
      if(method==='POST'&&action==='reject')return this.domain.rejectArtifact(pid,key);
      if(method==='POST'&&action==='issues')return this.domain.resolveIssue(pid,key,z.string().parse(body.issueId),z.enum(['ignored','intentional']).parse(body.status),z.string().parse(body.reason));
    }
    if(method==='GET'&&resource==='context'){const scope=scopeQuery(query),read=resolveStoryScope(this.domain,pid,scope);return buildContext(this.domain,pid,{...scope,resolvedScope:read,goal:query.get('goal')??undefined,maxChars:Number(query.get('maxChars'))||18000});}
    if(method==='GET'&&resource==='events')return this.domain.store.events(pid);
    if(method==='POST'&&resource==='import-preview')return this.domain.splitImport(z.string().parse(body.raw));
    if(method==='POST'&&resource==='imports')return this.domain.importText(pid,num.parse(body.revision),z.string().max(240).parse(body.name),z.string().parse(body.raw),body.parts);
    if(method==='GET'&&resource==='imports')return this.domain.store.db.prepare('SELECT id,name,raw,at FROM imports WHERE projectId=?').all(pid);
    if(method==='GET'&&resource==='export')return {text:this.domain.exportText(pid,z.enum(['txt','md']).parse(query.get('format')??'md'))};
    if(method==='GET'&&resource==='backup')return this.domain.backup(pid);
    throw new DomainError('NOT_FOUND','未知接口',404);
  }
}

function scopeQuery(query:URLSearchParams):StoryScopeOptions {
 return {chapterId:query.get('chapterId')??undefined,branch:query.get('branch')??undefined,asOfChapter:query.has('asOfChapter')?z.coerce.number().int().nonnegative().parse(query.get('asOfChapter')):undefined,viewpointId:query.get('viewpointId')??undefined,audience:query.has('audience')?z.enum(['author','character','reader']).parse(query.get('audience')):undefined,planningScope:query.has('planningScope')?z.enum(['current-branch','all-branches']).parse(query.get('planningScope')):undefined};
}

function previewTask(domain:Domain,pid:string,input:unknown):CreativeTask {
 const data=taskInputSchema.parse(input),at='2000-01-01T00:00:00.000Z';
 return {...data,id:'preview',projectId:pid,status:'QUEUED',createdAt:at,updatedAt:at,inputRevision:domain.project(pid).revision,expectedRevision:domain.project(pid).revision,epoch:0,currentStep:'preview',completedChapters:0,steps:[],usage:{calls:0,outputTokens:0,estimated:false},contract:{scope:'预览，不执行',lockedIds:[],permitted:[],forbidden:[],deliverables:[],stop:[]},checkpoint:{committed:[]},configSnapshot:resolveConfig(domain.store,pid,data.configuration,'preview',at)};
}
