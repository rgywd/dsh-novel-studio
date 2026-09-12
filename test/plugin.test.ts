import test from 'node:test';import assert from 'node:assert/strict';import { Context,Service } from '@deepseek-ai/cordis';import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { mkdtempSync,rmSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';import { fixture } from './helpers.js';import { apply } from '../src/plugin.js';

test('DSH ToolRuntime invokes shared reads, enforces proposal boundaries and unregisters on disposal',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'novel-plugin-'));const path=join(dir,'studio.sqlite');const f=fixture(path);const projectId=f.p.id;const characterId=f.a.id;f.store.close();const saved=process.env.NOVEL_STUDIO_DB;process.env.NOVEL_STUDIO_DB=path;
  const ctx=new Context();const routes=new Set<string>();
  class PromptHost extends Service {constructor(){super(ctx,'systemPrompt');}tools(){return ()=>{};}}
  class WebHost extends Service {constructor(){super(ctx,'webServer');}register(route:any){routes.add(route.path);return ()=>{routes.delete(route.path);};}tapIndex(){return ()=>{};}}
  class ModelHost extends Service {constructor(){super(ctx,'agentDefaultModel');}currentSelection(){return {provider:'test',model:'test'};}}
  class LlmHost extends Service {constructor(){super(ctx,'llm');}async *stream(){throw new Error('This integration test must not call a model');}}
  new PromptHost();new WebHost();new ModelHost();new LlmHost();const runtime=new ToolRuntime(ctx,{mode:'native'});const dispose=apply(ctx);
  const execute=(name:string,args:any)=>runtime.execute({callId:crypto.randomUUID() as any,name,arguments:args,signal:new AbortController().signal});
  try{const project=await execute('novel_read',{projectId,kind:'project'});assert.equal((project.value as any).title,'可靠性测试作品');const read=await execute('novel_read',{projectId,kind:'character',id:characterId});assert.equal(read.isError,false,JSON.stringify(read));assert.equal((read.value as any).title,'沈砚');const rejected=await execute('novel_propose',{projectId,taskId:'unknown',revision:1,content:'非法写入'});assert.equal(rejected.isError,true);assert.ok(routes.has('/novel-studio'));await dispose();assert.equal(routes.size,0);assert.equal((await execute('novel_read',{projectId,kind:'character',id:characterId})).isError,true);}
  finally{if(saved===undefined)delete process.env.NOVEL_STUDIO_DB;else process.env.NOVEL_STUDIO_DB=saved;await ctx.fiber.dispose();rmSync(dir,{recursive:true});}
});
