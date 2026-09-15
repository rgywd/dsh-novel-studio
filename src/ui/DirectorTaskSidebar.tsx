import { useState } from 'react';
import { Clapperboard, Plus, Search } from 'lucide-react';
import { statusText } from './api.js';

const kindLabels: Record<string, string> = {
  write: '章节创作',
  bootstrap: '开书准备',
  review: '审校修复',
  replan: '未来重规划',
  extract: '资料提取',
  summarize: '记忆总结',
  ideas: '剧情推演',
  assist: '写作协助',
};

interface DirectorTaskSidebarProps {
  projectTitle: string;
  tasks: any[];
  selectedTaskId?: string;
  onSelect: (task: any) => void;
  onCreate: () => void;
}

export function DirectorTaskSidebar({ projectTitle, tasks, selectedTaskId, onSelect, onCreate }: DirectorTaskSidebarProps) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase('zh-CN');
  const filtered = [...tasks].reverse().filter(task => !needle || `${task.goal} ${kindLabels[task.kind] ?? ''}`.toLocaleLowerCase('zh-CN').includes(needle));

  return <>
    <header className="director-sidebar-heading">
      <div><strong>导演会话</strong><small>{projectTitle}</small></div>
      <button className="icon-button" aria-label="新建导演任务" title="新建导演任务" onClick={onCreate}><Plus size={16}/></button>
    </header>
    <label className="director-task-search">
      <Search size={14}/><input aria-label="搜索导演任务" placeholder="搜索任务…" value={query} onChange={event => setQuery(event.target.value)}/>
    </label>
    <div className="director-task-list">
      {filtered.map(task => <button key={task.id} className={selectedTaskId === task.id ? 'active' : ''} onClick={() => onSelect(task)}>
        <Clapperboard size={14}/>
        <span>
          <span className="director-task-title"><strong>{task.contract?.brief?.objective ?? task.goal}</strong><i className={`status-dot ${task.status}`}/></span>
          <small>{kindLabels[task.kind] ?? '创作任务'} · {statusText[task.status]}</small>
          <time>{new Date(task.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
        </span>
      </button>)}
      {!filtered.length && <div className="director-task-empty">{tasks.length ? '没有匹配的任务' : '还没有导演任务。\n从一个有边界的目标开始。'}</div>}
    </div>
  </>;
}
