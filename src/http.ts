import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Domain } from './domain.js';
import { Runner, publicError } from './runtime.js';
import { buildContext } from './context.js';
import { DomainError, requireThat } from './contracts.js';
import { prompts } from './prompts.js';
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
        if(!['GET','HEAD'].includes(method)){requireThat(req.headers['content-type']?.startsWith('application/json')&&req.headers['x-novel-studio']==='1','CONTENT_TYPE','写请求需要 JSON 和本地工作台标识',403);body=await readJson(req);}
        const value=this.dispatch(method,url.pathname.slice(API.length),body,url.searchParams);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));return;
      }
      if(req.method!=='GET')throw new DomainError('NOT_FOUND','找不到页面',404);
      const files:Record<string,[string,string]>={'/novel-studio/':['index.html','text/html; charset=utf-8'],'/novel-studio/app.js':['app.js','text/javascript'],'/novel-studio/app.css':['app.css','text/css']};
      if(url.pathname==='/'||url.pathname==='/novel-studio'){res.writeHead(302,{Location:'/novel-studio/'});res.end();return;}
      const file=files[url.pathname];requireThat(file,'NOT_FOUND','找不到页面',404);
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
      res.setHeader('Content-Type',file[1]);res.end(await readFile(resolve(this.assets,file[0])));
    }catch(error){const e=publicError(error);const status=error instanceof DomainError?error.status:error instanceof z.ZodError?422:500;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:e}));}
  }
  dispatch(method:string,path:string,body:any={},query=new URLSearchParams()):any{
    const segments=path.split('/').filter(Boolean);const [group,pid,resource,key,action]=segments;
    if(method==='GET'&&path==='/health')return {version:'0.1.0',dsh:this.runner.provider.info(),demo:this.runner.demo.info(),schema:1,prompts:Object.values(prompts).map(p=>({id:p.id,version:p.version,purpose:p.purpose}))};
    if(group==='projects'&&!pid){if(method==='GET')return this.domain.store.list('projects');if(method==='POST')return this.domain.createProject(body);}
    if(path==='/backups/restore'&&method==='POST')return this.domain.restoreBackup(body);
    requireThat(group==='projects'&&pid,'NOT_FOUND','未知接口',404);this.domain.project(pid);
    if(!resource){if(method==='GET')return this.domain.snapshot(pid);if(method==='PATCH')return this.domain.updateProject(pid,num.parse(body.revision),body.project);}
    if(resource==='status'&&method==='GET')return {project:this.domain.project(pid),tasks:this.domain.store.list('tasks',pid).map(t=>({...t,steps:[]}))};
    if(resource==='objects'){
      if(method==='GET'&&!key){const q=query.get('q')??'';const kind=query.get('kind');const all=this.domain.store.objects(pid,kind??undefined).filter(o=>!q||`${o.title} ${o.body} ${JSON.stringify(o.fields)}`.toLowerCase().includes(q.toLowerCase()));const offset=Math.max(0,Number(query.get('offset'))||0);const limit=Math.min(300,Math.max(1,Number(query.get('limit'))||100));return {items:all.slice(offset,offset+limit),total:all.length};}
      if(method==='POST'&&!key)return this.domain.createObject(pid,num.parse(body.revision),body.object);
      if(method==='GET'&&key&&!action)return this.domain.object(pid,key);
      if(method==='PATCH'&&key)return this.domain.updateObject(pid,key,num.parse(body.revision),body.object);
      if(method==='POST'&&key&&action==='takeover')return this.domain.takeover(pid,key,num.parse(body.revision));
      if(method==='POST'&&key&&action==='body')return this.domain.saveChapter(pid,key,num.parse(body.revision),body.body);
      if(method==='POST'&&key&&action==='rollback')return this.domain.rollback(pid,key,num.parse(body.revision),z.string().parse(body.versionId));
      if(method==='GET'&&key&&action==='versions')return this.domain.versions(pid,key);
      if(method==='GET'&&key&&action==='history')return this.domain.history(pid,key);
    }
    if(resource==='tasks'){
      if(method==='GET'&&!key)return this.domain.store.list('tasks',pid);
      if(method==='POST'&&!key){const task=this.domain.createTask(pid,body);this.runner.start(task.id);return task;}
      if(method==='GET'&&key){const t=this.domain.task(pid,key);return {...t,events:this.domain.store.events(pid,key),artifacts:this.domain.store.list('artifacts',pid).filter(a=>a.taskId===key).map(a=>({...a,data:{title:a.data.title,content:a.data.content,review:a.data.review,context:a.data.context,late:a.data.late}}))};}
      if(method==='POST'&&key&&action){const parsed=z.enum(['pause','resume','redelegate','cancel']).parse(action);const task=this.domain.controlTask(pid,key,parsed);if(task.status==='QUEUED')this.runner.start(task.id);return task;}
    }
    if(resource==='artifacts'&&key){
      if(method==='GET')return this.domain.artifact(pid,key);
      if(method==='POST'&&action==='accept')return this.domain.acceptArtifact(pid,key,'author',body.partialText);
      if(method==='POST'&&action==='reject')return this.domain.rejectArtifact(pid,key);
      if(method==='POST'&&action==='issues')return this.domain.resolveIssue(pid,key,z.string().parse(body.issueId),z.enum(['ignored','intentional']).parse(body.status),z.string().parse(body.reason));
    }
    if(method==='GET'&&resource==='context')return buildContext(this.domain,pid,{chapterId:query.get('chapterId')??undefined,goal:query.get('goal')??undefined,maxChars:Number(query.get('maxChars'))||18000});
    if(method==='GET'&&resource==='events')return this.domain.store.events(pid);
    if(method==='POST'&&resource==='import-preview')return this.domain.splitImport(z.string().parse(body.raw));
    if(method==='POST'&&resource==='imports')return this.domain.importText(pid,num.parse(body.revision),z.string().max(240).parse(body.name),z.string().parse(body.raw),body.parts);
    if(method==='GET'&&resource==='imports')return this.domain.store.db.prepare('SELECT id,name,raw,at FROM imports WHERE projectId=?').all(pid);
    if(method==='GET'&&resource==='export')return {text:this.domain.exportText(pid,z.enum(['txt','md']).parse(query.get('format')??'md'))};
    if(method==='GET'&&resource==='backup')return this.domain.backup(pid);
    throw new DomainError('NOT_FOUND','未知接口',404);
  }
}
