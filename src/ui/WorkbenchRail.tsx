import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  Bookmark,
  CheckCheck,
  Clock,
  Feather,
  FileText,
  GitBranch,
  Globe,
  Lightbulb,
  Network,
  Search,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import type { Kind } from '../contracts.js';

type Surface = Kind | 'workspace';
type Tool = 'inheritance' | 'sources' | 'memory' | 'creative-config' | 'generation-inspector' | 'transfer';

interface WorkbenchRailProps {
  mode: 'writer' | 'director';
  surface: Surface;
  hasLineage: boolean;
  inspectorOpen: boolean;
  onNavigate: (surface: Surface) => void;
  onOpenTool: (tool: Tool) => void;
  onToggleInspector: () => void;
  onBack: () => void;
}

const destinations: Array<{ surface: Surface; label: string; icon: typeof FileText }> = [
  { surface: 'workspace', label: '正文', icon: FileText },
  { surface: 'book', label: '故事大纲', icon: GitBranch },
  { surface: 'character', label: '人物档案', icon: Users },
  { surface: 'world', label: '世界设定', icon: Globe },
  { surface: 'relationship', label: '人物关系', icon: Network },
  { surface: 'event', label: '时间线', icon: Clock },
  { surface: 'foreshadow', label: '伏笔', icon: Bookmark },
  { surface: 'fact', label: '事实账本', icon: CheckCheck },
  { surface: 'idea', label: '灵感收件箱', icon: Lightbulb },
];

const tools: Array<{ tool: Tool; label: string; icon: typeof FileText }> = [
  { tool: 'sources', label: '原作资料库', icon: BookOpen },
  { tool: 'memory', label: '作品记忆', icon: BookMarked },
  { tool: 'creative-config', label: '创作配置', icon: Feather },
  { tool: 'generation-inspector', label: '生成检查器', icon: Search },
  { tool: 'transfer', label: '导入、导出与备份', icon: Upload },
];

export function WorkbenchRail(props: WorkbenchRailProps) {
  return <nav className="workbench-rail" aria-label="工作台导航">
    <div className="rail-group">
      {destinations.map(({ surface, label, icon: Icon }) => {
        const active = props.surface === surface && (surface !== 'workspace' || props.mode === 'writer');
        return <button
          key={surface}
          className={active ? 'active' : ''}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          title={label}
          onClick={() => props.onNavigate(surface)}
        ><Icon size={18} strokeWidth={1.7}/></button>;
      })}
    </div>
    <div className="rail-group rail-tools">
      <button
        className={props.inspectorOpen ? 'active' : ''}
        aria-label={props.inspectorOpen ? '收起 AI 助手' : '展开 AI 助手'}
        aria-pressed={props.inspectorOpen}
        title={props.inspectorOpen ? '收起 AI 助手' : '展开 AI 助手'}
        onClick={props.onToggleInspector}
      ><Sparkles size={18} strokeWidth={1.7}/></button>
      {props.hasLineage && <button
        aria-label="继承与改编"
        title="继承与改编"
        onClick={() => props.onOpenTool('inheritance')}
      ><GitBranch size={18} strokeWidth={1.7}/></button>}
      {tools.map(({ tool, label, icon: Icon }) => <button
        key={tool}
        aria-label={label}
        title={label}
        onClick={() => props.onOpenTool(tool)}
      ><Icon size={18} strokeWidth={1.7}/></button>)}
      <button aria-label="返回书架" title="返回书架" onClick={props.onBack}><ArrowLeft size={18} strokeWidth={1.7}/></button>
    </div>
  </nav>;
}
