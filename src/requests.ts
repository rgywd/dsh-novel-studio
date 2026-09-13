import type { Store } from './store.js';
import { id,now,requireThat,type CreativeTask } from './contracts.js';
import type { CompiledPrompt } from './compiler.js';
import { requestDiff } from './compiler.js';
import type { Transformation } from './text-pipeline.js';
export interface UsageRecord {uncachedInputTokens?:number;inputTokens?:number;outputTokens?:number;cacheReadTokens?:number;cacheWriteTokens?:number;totalTokens?:number;reasoningTokens?:number;serverCache:'REPORTED'|'UNKNOWN';firstTokenMs?:number;elapsedMs:number;}
export interface RequestRecord {id:string;projectId:string;taskId:string;stepKey:string;attempt:number;createdAt:string;status:'PREPARED'|'SENT'|'COMPLETED'|'FAILED'|'STALE';compiled:CompiledPrompt;observed?:unknown;observedAt?:string;previousId?:string;diff?:ReturnType<typeof requestDiff>;localPrefixReuse?:boolean;usage?:UsageRecord;rawResponse?:string;candidate?:string;transformations?:Transformation[];error?:{code:string;message:string};}
export function requestList(store:Store,pid:string):RequestRecord[]{return store.db.prepare('SELECT data FROM requests WHERE projectId=? ORDER BY rowid DESC LIMIT 100').all(pid).map(r=>JSON.parse(r.data as string));}
export function requestGet(store:Store,pid:string,rid:string):RequestRecord {const row=store.db.prepare('SELECT data FROM requests WHERE id=? AND projectId=?').get(rid,pid);requireThat(row,'NOT_FOUND','请求记录已过保留范围或不属于本作品',404);return JSON.parse(row.data as string);}
export function requestPut(store:Store,record:RequestRecord){store.db.prepare('INSERT INTO requests VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(record.id,record.projectId,record.taskId,JSON.stringify(record));store.db.prepare('DELETE FROM requests WHERE projectId=? AND id NOT IN (SELECT id FROM requests WHERE projectId=? ORDER BY rowid DESC LIMIT 100)').run(record.projectId,record.projectId);return record;}
export function beginRequest(store:Store,t:CreativeTask,stepKey:string,attempt:number,compiled:CompiledPrompt){return requestPut(store,{id:id('request'),projectId:t.projectId,taskId:t.id,stepKey,attempt,createdAt:now(),status:'PREPARED',compiled});}
export function observeRequest(store:Store,record:RequestRecord,observed:unknown){
  const previous=requestList(store,record.projectId).find(r=>r.id!==record.id&&r.compiled.role===record.compiled.role&&r.observed);
  record.observed=observed;record.observedAt=now();if(record.status==='PREPARED')record.status='SENT';record.previousId=previous?.id;record.diff=previous?requestDiff(previous.observed,observed):undefined;record.localPrefixReuse=previous?previous.compiled.stableHash===record.compiled.stableHash:undefined;return requestPut(store,record);
}
