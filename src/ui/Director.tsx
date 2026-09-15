import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clapperboard,
  FileText,
  Layers,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  UserRound,
} from 'lucide-react';
import type { StoryObject } from '../contracts.js';
import { api, statusText } from './api.js';
import { Field } from './Modal.js';

const taskKindNames: Record<string, string> = {
  write: '章节创作',
  bootstrap: '开书准备',
  review: '审校修复',
  replan: '未来重规划',
  extract: '资料提取',
  summarize: '记忆总结',
  ideas: '剧情推演',
  assist: '写作协助',
};

interface DirectorProps {
  onInspect?: (id?: string) => void;
  composerRequest?: number;
  task: any;
  objects: StoryObject[];
  chapter?: StoryObject;
  health: any;
  initialGoal?: string;
  onCreate: (input: any) => Promise<void>;
  onControl: (action: string) => void;
  onArtifact: (id: string) => void;
  onView: (id: string) => void;
  onTakeover: (id: string) => void;
}

export function Director({ onInspect, composerRequest = 0, task, objects, chapter, health, initialGoal, onCreate, onControl, onArtifact, onView, onTakeover }: DirectorProps) {
  const [grantCalls, setGrantCalls] = useState<number>();
  const [grantTokens, setGrantTokens] = useState<number>();
  const [grantMessage, setGrantMessage] = useState('');
  const [scene, setScene] = useState('');
  const [viewpoint, setViewpoint] = useState('');
  const [composerOpen, setComposerOpen] = useState(!task);
  const [replanScope, setReplanScope] = useState('future');
  const [answer, setAnswer] = useState('');
  const [goal, setGoal] = useState(initialGoal ?? '');
  const [kind, setKind] = useState(objects.some(object => object.kind === 'character') ? 'write' : objects.some(object => object.kind === 'chapter' && object.body) ? 'extract' : 'bootstrap');
  const [provider, setProvider] = useState('dsh');
  const [reasoning, setReasoning] = useState('balanced');
  const [count, setCount] = useState(1);
  const [words, setWords] = useState(2000);
  const [auto, setAuto] = useState(true);
  const [constraints, setConstraints] = useState('');
  const [calls, setCalls] = useState(18);
  const [tokens, setTokens] = useState(48000);
  const [chars, setChars] = useState(18000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setComposerOpen(!task), [task?.id]);
  useEffect(() => { if (composerRequest) setComposerOpen(true); }, [composerRequest]);
  useEffect(() => {
    if (kind === 'bootstrap' && objects.some(object => object.kind === 'chapter' && object.body)) {
      setKind(objects.some(object => object.kind === 'character') ? 'write' : 'extract');
    }
  }, [kind, objects]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onCreate({
        configuration: scene ? { patch: { enabled: true, native: { scene } } } : undefined,
        perspective: viewpoint ? { viewpointId: viewpoint, audience: 'character' } : undefined,
        kind,
        goal: goal || chapter?.fields.goal || '沿着当前故事继续，保持人物状态和世界规则一致',
        provider,
        reasoning,
        count,
        targetWords: words,
        autoAccept: auto,
        constraints: constraints.split('\n').filter(Boolean),
        budget: { calls, outputTokens: tokens, contextChars: chars },
        ...((['review', 'extract', 'summarize'].includes(kind) || kind === 'replan' && replanScope === 'chapter') && chapter
          ? { chapterId: chapter.id }
          : kind === 'write' && chapter && chapter.status !== 'accepted' && !chapter.locked
            ? { chapterId: chapter.id }
            : {}),
      });
      setGoal('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const active = task && ['QUEUED', 'RUNNING', 'PAUSE_REQUESTED'].includes(task.status);
  const selected = objects.find(object => object.id === task?.checkpoint?.chapterId);
  const artifacts = task?.artifacts ?? [];
  const steps = task?.steps ?? [];
  const objective = task?.contract.brief?.objective ?? task?.goal;

  return <div className="director-layout">
    <main className="director-main">
      <header className="director-session-header">
        <div className="director-session-identity">
          <span className="director-avatar"><Clapperboard size={15}/></span>
          <div>
            <div className="director-title-line"><strong>{task ? objective : '新的导演会话'}</strong>{task && <span className={`badge task-state ${task.status}`}>{statusText[task.status]}</span>}</div>
            <small>{task ? `${taskKindNames[task.kind] ?? '创作任务'} · 输入修订 ${task.inputRevision}` : '把目标交给导演，执行过程与成果会持续留在这里'}</small>
          </div>
        </div>
        <div className="director-header-actions">
          {active ? <>
            <button onClick={() => onControl('pause')} disabled={task.status === 'PAUSE_REQUESTED'}><Pause size={14}/>暂停</button>
            <button onClick={() => onControl('cancel')}><Square size={12}/>取消</button>
          </> : task && ['PAUSED', 'FAILED', 'NEEDS_INPUT'].includes(task.status) ? <>
            <button onClick={() => onControl('resume')}><Play size={14}/>恢复</button>
            <button onClick={() => onControl('redelegate')} title="保留已完成章节与用量，根据作品新版本重建上下文"><RotateCcw size={14}/>重新委派</button>
          </> : null}
          <button className="new-director-task" onClick={() => setComposerOpen(true)}><Plus size={14}/>新任务</button>
        </div>
      </header>

      <div className="director-flow">
        {task ? <section className="task-work">
          <article className="director-user-turn">
            <div className="director-turn-heading"><span><UserRound size={14}/></span><strong>你的委派</strong><time>{new Date(task.createdAt).toLocaleString('zh-CN')}</time></div>
            <h2 className="task-objective">{objective}</h2>
            {(task.goal.length > 180 || task.contract.brief) && <details><summary>查看原始委派</summary><p className="original-goal">{task.goal}</p></details>}
          </article>

          {task.error && <div className={`notice director-error ${task.status === 'FAILED' ? 'error' : ''}`}><AlertCircle size={17}/><div><strong>{task.error.message}</strong><small>{task.error.code}</small></div></div>}

          <article className="director-agent-turn">
            <div className="director-turn-heading"><span className="agent-mark"><Sparkles size={14}/></span><strong>导演执行</strong><small>{active ? '正在处理真实任务' : statusText[task.status]}</small></div>
            {selected && <div className="current-object"><div><FileText size={17}/><span>当前对象 <strong>{selected.title}</strong></span></div><div><button onClick={() => onView(selected.id)}>查看 <ArrowUpRight size={13}/></button><button onClick={() => onTakeover(selected.id)}>接管编辑</button></div></div>}

            <div className="run-steps" aria-live="polite">
              {steps.map((step: any, index: number) => <div className={`run-step ${step.status}`} key={`${step.key}:${step.inputHash}`}>
                <span className="step-marker">{step.status === 'COMPLETED' ? <Check size={13}/> : step.status === 'RUNNING' ? <span className="tiny-spinner"/> : index + 1}</span>
                <div><strong>{step.name}</strong>{step.requestIds?.length > 0 && <button className="step-inspect" onClick={() => onInspect?.(step.requestIds.at(-1))}>检查请求</button>}<p>{step.status === 'COMPLETED' ? `已保存 · 来源修订 ${step.inputRevision}` : step.error ?? '正在执行实际模型调用'}</p>{step.partial && step.status !== 'COMPLETED' && <details><summary>已保留的生成片段</summary><pre>{step.partial}</pre></details>}</div>
                <small>{step.usage ? `${step.usage.outputTokens.toLocaleString()} tokens` : step.attempts > 1 ? `尝试 ${step.attempts}/3` : ''}</small>
              </div>)}
              {!steps.length && <p className="director-awaiting">任务步骤建立后会依次出现在这里。</p>}
            </div>

            <div className="artifacts-heading"><h3>交付成果</h3><span>{artifacts.length} 项已落盘</span></div>
            {artifacts.length ? <div className="artifact-list">{artifacts.map((artifact: any) => <button className="artifact-card" key={artifact.id} onClick={() => onArtifact(artifact.id)}><div className="artifact-icon"><FileText size={18}/></div><div><strong>{objects.find(object => object.id === artifact.chapterId)?.title ?? ({ setup: '故事方向与基础资料', ideas: '剧情候选', replan: '未来章纲变更', extraction: '待确认作品资料', memory: '有证据的章节记忆', edit: '选区修改提案' } as any)[artifact.type] ?? '创作成果'}</strong><p>{statusText[artifact.status]}{artifact.type === 'chapter' ? artifact.data.review ? ' · 已审校' : ' · 工作稿，尚未审校' : ''} {artifact.data?.content ? `· ${artifact.data.content.length.toLocaleString()} 字符` : ''}{artifact.data?.late ? ' · 旧调用晚到' : ''}</p></div><ArrowUpRight size={15}/></button>)}</div> : <p className="muted empty-line">成果落盘后会出现在这里。</p>}

            <details className="event-log"><summary>实际执行事件 <span>{task.events?.length ?? 0}</span></summary>{task.events?.map((event: any) => <div key={event.id}><time>{new Date(event.at).toLocaleTimeString('zh-CN', { hour12: false })}</time><span>{event.message}</span></div>)}</details>
          </article>
        </section> : <div className="director-empty"><span className="director-empty-icon"><Sparkles size={21}/></span><h2>从一个有边界的目标开始</h2><p>导演会读取当前作品，规划、创作、审校并留下可接管的成果。</p><div className="workflow-preview"><span>规划</span><ChevronDown size={13}/><span>起草</span><ChevronDown size={13}/><span>审校</span><ChevronDown size={13}/><span>交付</span></div></div>}
      </div>

      <details className="composer-fold" open={composerOpen} onToggle={event => setComposerOpen(event.currentTarget.open)}>
        <summary><span><Sparkles size={15}/>{task ? '委派下一项创作任务…' : '告诉导演接下来要完成什么…'}</span><small>{composerOpen ? '收起' : active ? '当前任务运行中' : '展开委派'}</small></summary>
        <div className="task-composer">
          <div className="composer-head"><span>新任务</span><select aria-label="导演任务类型" value={kind} onChange={event => setKind(event.target.value)}>{[['write', '创作章节'], ['bootstrap', '从灵感开书'], ['review', '审查并局部修复'], ['replan', '重规划未来章纲'], ['extract', '从正文提取资料'], ['summarize', '总结作品记忆'], ['ideas', '剧情推演']].map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></div>
          <textarea aria-label="创作目标" placeholder={kind === 'bootstrap' ? '例如：在一个以记忆支付灯火的港口，邮差收到一封寄给失踪母亲的信…' : '例如：继续两章，让沈砚开始怀疑导师，但不要揭露身份。不修改前文，不新增核心角色。'} rows={3} value={goal} onChange={event => setGoal(event.target.value)}/>
          <div className="composer-options"><label>章节数 <select aria-label="章节数" value={count} onChange={event => setCount(Number(event.target.value))}>{[1, 2, 3].map(number => <option value={number} key={number}>{number} 章</option>)}</select></label><label>目标 <input aria-label="目标字数" type="number" min="300" max="8000" step="100" value={words} onChange={event => setWords(Number(event.target.value))}/> 字 / 章</label><select aria-label="模型提供方" value={provider} onChange={event => { setProvider(event.target.value); if (event.target.value === 'demo') setWords(600); else if (words === 600) setWords(2000); }}><option value="dsh">DSH 当前模型</option><option value="demo">演示提供方 · 非真实 AI</option></select></div>
          {kind === 'replan' && <Field label="规划作用范围"><select value={replanScope} onChange={event => setReplanScope(event.target.value)}><option value="future">全部未锁定未来大纲</option>{chapter && chapter.status === 'planned' && !chapter.locked && !chapter.body && <option value="chapter">仅当前章：{chapter.title}</option>}</select></Field>}
          <details className="task-boundaries"><summary>创作边界与预算 <ChevronDown size={14}/></summary><Field label="模型推理配置" hint="均衡优先使用模型支持的非推理模式，否则使用低推理档；保留预算用于正文与审校，不修改 DSH 配置。"><select value={reasoning} onChange={event => setReasoning(event.target.value)}><option value="balanced">均衡创作（默认）</option><option value="configured">沿用 DSH 当前配置</option></select></Field><Field label="本次场景文风（临时覆盖）"><textarea rows={2} value={scene} onChange={event => setScene(event.target.value)} placeholder="留空沿用作品配置；本次任务固定版本"/></Field><Field label="本次视角人物"><select value={viewpoint} onChange={event => setViewpoint(event.target.value)}><option value="">沿用作品配置 / 作者视角</option>{objects.filter(object => object.kind === 'character').map(object => <option key={object.id} value={object.id}>{object.title}</option>)}</select></Field><Field label="必须遵守（每行一条）"><textarea rows={3} value={constraints} onChange={event => setConstraints(event.target.value)} placeholder={'不揭露导师身份\n不新增核心角色'}/></Field><div className="form-grid three"><Field label="最多模型调用"><input type="number" min="1" max="40" value={calls} onChange={event => setCalls(Number(event.target.value))}/></Field><Field label="输出 token 上限"><input type="number" min="500" max="150000" value={tokens} onChange={event => setTokens(Number(event.target.value))}/></Field><Field label="上下文字符上限"><input type="number" min="1000" max="48000" value={chars} onChange={event => setChars(Number(event.target.value))}/></Field></div></details>
          <div className="composer-bottom"><label className="check-field"><input type="checkbox" checked={auto} onChange={event => setAuto(event.target.checked)}/>自动接受通过检查的成果</label><button className="solid" disabled={busy || active} onClick={() => void submit()}>{busy ? '正在建立任务…' : active ? '当前任务运行中' : '开始执行'}<ArrowRight size={15}/></button></div>
          {provider === 'demo' && <p className="composer-note">演示使用原创固定样本，验证工作流与状态；不代表真实模型创作。</p>}{provider === 'dsh' && !health?.dsh?.available && <p className="composer-note warning">尚未连接 DSH 模型。仍可写作、导入或选择演示；真实调用会明确报错。</p>}{error && <div className="notice error" role="alert">{error}</div>}
        </div>
      </details>
    </main>

    <aside className="director-inspector"><div className="panel-label"><Layers size={16}/>任务约定</div>{task ? <><h3>共同守住的边界</h3><p className="muted">固定配置：{task.configSnapshot?.versions.map((version: any) => version.name).join(' → ') || '原有作品文风'} · {task.configSnapshot?.hash.slice(0, 8)}</p>{task.error?.code === 'TASK_CLARIFICATION' && <div className="note-card"><p>{task.error.message}</p><textarea aria-label="补充任务约定" value={answer} onChange={event => setAnswer(event.target.value)}/><button disabled={busy || !answer.trim()} onClick={() => { setBusy(true); void api(`/projects/${task.projectId}/tasks/${task.id}/clarify`, { answer }).then(() => setAnswer('')).catch(caught => setError(caught.message)).finally(() => setBusy(false)); }}>补充后重新委派</button></div>}{task.contract.brief && <div className="note-card"><h4>执行安排</h4><details><summary>展开步骤与默认假设</summary><p>{task.contract.brief.approach}</p>{task.contract.brief.assumptions.map((assumption: string) => <p className="muted" key={assumption}>默认：{assumption}</p>)}</details>{task.contract.brief.constraints.map((constraint: string) => <p key={constraint}>约束：{constraint}</p>)}</div>}<p className="contract-scope">{task.contract.scope}</p><dl className="contract-list"><div><dt>推理配置</dt><dd>{task.reasoning === 'configured' ? 'DSH 当前配置' : '均衡创作'}</dd></div><div><dt>输入版本</dt><dd>修订 {task.inputRevision} → 当前绑定 {task.expectedRevision}</dd></div><div><dt>允许自主决定</dt><dd>{task.contract.permitted.join('；')}</dd></div><div><dt>受保护的对象</dt><dd>{task.contract.lockedIds.length ? task.contract.lockedIds.map((id: string) => objects.find(object => object.id === id)?.title ?? id).join('、') : '遵守作品约束，不改范围外已接受正文'}</dd></div><div><dt>交付物</dt><dd>{task.contract.deliverables.join('、')}</dd></div><div><dt>停止条件</dt><dd>{task.contract.stop.join('、')}</dd></div></dl>{task.constraints.length > 0 && <div className="note-card"><h4>本次特别约束</h4>{task.constraints.map((constraint: string) => <p key={constraint}>{constraint}</p>)}</div>}<div className="usage-panel"><h4>用量与预算</h4><p><span>模型调用</span><strong>{task.usage.calls} / {task.budget.calls}</strong></p><p><span>输出 tokens</span><strong>{task.usage.outputTokens.toLocaleString()} / {task.budget.outputTokens.toLocaleString()}</strong></p><p><span>已接受章节</span><strong>{task.completedChapters} / {task.count}</strong></p><small>{task.usage.estimated ? '含演示估算或未结算调用的保守预留' : '提供方实际用量'} · 不估算金额</small></div>{['PAUSED', 'FAILED', 'NEEDS_INPUT'].includes(task.status) && <details><summary>明确增加任务预算</summary><p className="muted">不会自动重试，也不重置已用额度；先修复错误再恢复。</p><Field label="新的调用总预算"><input type="number" min={task.budget.calls} max="40" value={grantCalls ?? task.budget.calls} onChange={event => setGrantCalls(Number(event.target.value))}/></Field><Field label="新的输出 token 总预算"><input type="number" min={task.budget.outputTokens} max="150000" value={grantTokens ?? task.budget.outputTokens} onChange={event => setGrantTokens(Number(event.target.value))}/></Field><button disabled={busy} onClick={() => { setBusy(true); void api(`/projects/${task.projectId}/tasks/${task.id}/budget`, { calls: grantCalls ?? task.budget.calls, outputTokens: grantTokens ?? task.budget.outputTokens }).then(() => setGrantMessage('预算已记录，可点击恢复继续')).catch(caught => setGrantMessage(caught.message)).finally(() => setBusy(false)); }}>保存明确授权的预算</button>{grantMessage && <p role="status">{grantMessage}</p>}</details>}<p className="model-caption">{task.provider === 'demo' ? '演示提供方 · 非真实 AI' : health?.dsh?.name}</p></> : <><div className="contract-illustration"><span>01</span><div/><span>02</span><div/><span>03</span></div><h3>一份清楚的委派</h3><p>给出目标、作用范围与禁区。普通细节交给导演决定，关键边界由运行器保护。</p><div className="note-card"><h4>试着这样说</h4><p>“继续两章，让两个人的信任出现裂缝，但不要揭露信件的真正来源。”</p></div><small>默认最多 3 章，每步最多重试 2 次，每章最多局部修复 2 轮。</small></>}</aside>
  </div>;
}
