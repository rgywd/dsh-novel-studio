import { useEffect, useState } from 'react';
import { Modal, Field } from './Modal.js';
import { TextDiff } from './CreativeConfig.js';
import { api } from './api.js';

interface Props {pid:string;taskId?:string;requestId?:string;chapterId?:string;onClose:()=>void;}

export function GenerationInspector({pid,taskId,requestId,chapterId,onClose}:Props) {
  const [page,setPage]=useState<{items:any[];total:number;nextOffset?:number}>({items:[],total:0});
  const [offset,setOffset]=useState(0);
  const [record,setRecord]=useState<any>();
  const [retention,setRetention]=useState<any>();
  const [preview,setPreview]=useState<any>();
  const [goal,setGoal]=useState('继续当前故事');
  const [prompt,setPrompt]=useState('write');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [clearBefore,setClearBefore]=useState('');
  const [removeSummaries,setRemoveSummaries]=useState(false);
  const [receipt,setReceipt]=useState('');
  const perform=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(caught){setError((caught as Error).message);}finally{setBusy(false);}};
  const load=async(next=offset)=>{const suffix=`?paged=1&offset=${next}&limit=50${taskId?'&taskId='+encodeURIComponent(taskId):''}`;const [rows,policy]=await Promise.all([api(`/projects/${pid}/requests${suffix}`),api(`/projects/${pid}/requests/retention`)]);setPage(rows);setRetention(policy);setOffset(next);};
  useEffect(()=>{let active=true;void perform(async()=>{const suffix=`?paged=1&offset=0&limit=50${taskId?'&taskId='+encodeURIComponent(taskId):''}`;const [rows,policy,detail]=await Promise.all([api(`/projects/${pid}/requests${suffix}`),api(`/projects/${pid}/requests/retention`),requestId?api(`/projects/${pid}/requests/${requestId}`):Promise.resolve(undefined)]);if(active){setPage(rows);setRetention(policy);setRecord(detail);setOffset(0);}});return()=>{active=false;};},[pid,taskId,requestId]);
  const compiled=record?.compiled??preview;
  const summary=record??page.items.find(item=>item.id===requestId);
  return <Modal title="生成检查器" wide onClose={onClose}>
    <p className="muted">请求摘要与详细正文分开保存。活跃任务、待审成果和已接受版本引用的详情受保护；清理只影响可清理记录。预览不调用模型。</p>
    {error&&<div role="alert" className="notice error">{error}</div>}
    {receipt&&<p role="status" className="notice">{receipt}</p>}
    <div className="inspector-picker">
      <select aria-label="选择生成记录" value={record?.id??''} onChange={event=>void perform(async()=>{setPreview(undefined);setRecord(event.target.value?await api(`/projects/${pid}/requests/${event.target.value}`):undefined);})}>
        <option value="">选择实际生成记录</option>
        {record&&!page.items.some(item=>item.id===record.id)&&<option value={record.id}>{record.role} · {record.stepKey} · {record.status}</option>}
        {page.items.map(item=><option key={item.id} value={item.id}>{item.role} · {item.stepKey.split(':').at(-1)} · {item.status} · {item.detailState==='cleared'?'详情已清理':new Date(item.createdAt).toLocaleString('zh-CN')}</option>)}
      </select>
      <button disabled={busy} onClick={()=>void perform(()=>load())}>刷新</button>
    </div>
    <div className="inline-actions"><span className="muted">{page.total} 条摘要 · 本页 {page.total?offset+1:0}–{Math.min(offset+page.items.length,page.total)}</span><button disabled={busy||offset===0} onClick={()=>void perform(()=>load(Math.max(0,offset-50)))}>上一页</button><button disabled={busy||page.nextOffset===undefined} onClick={()=>void perform(()=>load(page.nextOffset!))}>下一页</button></div>
    {retention&&<details><summary>本地保留与清理 · 详情 {retention.availableDetails} · 已清理 {retention.clearedDetails} · 受保护 {retention.protected}</summary><p className="muted">未引用详情保留最近 {retention.policy.detailLimit} 条或 {retention.policy.detailDays} 天；摘要保留最近 {retention.policy.summaryLimit} 条或 {retention.policy.summaryDays} 天。服务端缓存读写用量保留在摘要里，清理后完整 Prompt 无法恢复。</p><Field label="清理此时间之前的非受保护请求"><input type="datetime-local" value={clearBefore} onChange={event=>setClearBefore(event.target.value)}/></Field><label className="check-field"><input type="checkbox" checked={removeSummaries} onChange={event=>setRemoveSummaries(event.target.checked)}/>同时清理对应摘要（默认只清详情）</label><button disabled={busy||!clearBefore} onClick={()=>void perform(async()=>{const result=await api(`/projects/${pid}/requests/cleanup`,{before:new Date(clearBefore).toISOString(),removeSummaries});setReceipt(`已清理 ${result.detailsCleared} 条详情、${result.summariesRemoved} 条摘要；受保护引用未动。`);setRecord(undefined);await load(0);})}>执行本地清理</button></details>}
    <details><summary>编译预览（不产生模型调用）</summary><Field label="任务类型"><select value={prompt} onChange={event=>setPrompt(event.target.value)}>{[['write','Writer 正文'],['plan','Planner 章纲'],['review','Reviewer 审校'],['extract','Extractor 抽取'],['summarize','Summarizer 总结']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field><Field label="预览目标"><textarea value={goal} onChange={event=>setGoal(event.target.value)}/></Field><button disabled={busy||!goal.trim()} onClick={()=>void perform(async()=>{setRecord(undefined);setPreview(await api(`/projects/${pid}/compile-preview`,{prompt,task:{kind:'write',goal,chapterId}}));})}>编译当前配置</button></details>
    {summary?.detailState==='cleared'&&<p className="notice">详情已清理：{summary.clearReason} · {summary.clearedAt}。摘要、用量、任务和成果关联仍可查看。</p>}
    {summary?.protectedReasons?.length>0&&<p className="notice">保护依据：{summary.protectedReasons.join('；')}</p>}
    {summary&&<div className="usage-panel"><p>本地编译缓存：{summary.localCompilationCache} · 本地前缀相同：{summary.localPrefixReuse===undefined?'UNKNOWN':String(summary.localPrefixReuse)}</p><p>服务端缓存读 / 写：{summary.usage?.cacheReadTokens??'UNKNOWN'} / {summary.usage?.cacheWriteTokens??'UNKNOWN'} tokens</p><p>DSH 未缓存输入 / 总输入 / 输出：{summary.usage?.uncachedInputTokens??'UNKNOWN'} / {summary.usage?.inputTokens??'UNKNOWN'} / {summary.usage?.outputTokens??'UNKNOWN'} tokens</p><p>首 token / 总耗时：{summary.usage?.firstTokenMs??'UNKNOWN'} / {summary.usage?.elapsedMs??'UNKNOWN'} ms</p><small>服务端未报告字段时显示 UNKNOWN；本地编译和前缀判断不代表服务端命中，也不推算费用。</small></div>}
    {record?.error&&<p role="alert" className="notice error">{record.error.code}：{record.error.message}</p>}
    {compiled&&<><div className="config-current"><strong>{record?'实际调用记录':'编译预览，尚未发送'}</strong><span>{compiled.role} · 约 {record?.observedEstimatedTokens??compiled.estimatedTokens} tokens</span><small>配置 {compiled.config.hash.slice(0,12)} · {compiled.config.versions.map((version:any)=>version.name).join(' → ')||'原有文风'}</small></div>
      {compiled.warnings.length>0&&<details open><summary>兼容与宏警告（{compiled.warnings.length}）</summary>{compiled.warnings.map((warning:string,index:number)=><p key={index}>{warning}</p>)}</details>}
      <div className="prompt-blocks">{compiled.blocks.map((block:any,index:number)=><details key={index}><summary><span className="badge">{block.layer}</span> {block.source} · {block.role} · {block.chars} 字符</summary><p>{block.purpose} · {block.trust} · {block.stability} · {block.position}</p><small>版本 {block.version} / 依赖 {block.dependencies.join('、')}</small><pre>{block.text}</pre></details>)}</div>
      <details><summary>宏、资料命中与省略、有效来源</summary><pre>{JSON.stringify({macros:compiled.macros,context:compiled.context,origins:compiled.config.origins},null,2)}</pre></details>
      {record&&<><details><summary>最终可观察 DSH 请求与相邻 Diff</summary><pre>{JSON.stringify(record.observed??'未提供最终请求',null,2)}</pre><pre>{JSON.stringify(record.diff??'没有可比较的相邻请求',null,2)}</pre></details><details><summary>原始响应 → 正文候选</summary><TextDiff before={record.rawResponse??''} after={record.candidate??record.rawResponse??''}/></details></>}
      {[...compiled.transformations,...record?.transformations??[]].map((transform:any,index:number)=><details key={index}><summary>变换 {transform.stage}/{transform.scope} · {transform.name} · {transform.elapsedMs} ms</summary><TextDiff before={transform.before} after={transform.after}/></details>)}
    </>}
    {!compiled&&!busy&&<p className="muted empty-line">选择真实请求或编译预览。已清理详情的请求仍保留摘要和保护依据。</p>}
  </Modal>;
}
