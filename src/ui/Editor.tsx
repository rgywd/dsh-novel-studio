import { forwardRef,useEffect,useImperativeHandle,useRef,useState } from 'react';
import { EditorState,Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { basicSetup } from 'codemirror';
import { undo,redo } from '@codemirror/commands';
import { ArrowRight,Check,CloudOff,FileText,Focus,History,Lock,Save,Undo2,Redo2 } from 'lucide-react';
import { countWords,type StoryObject } from '../contracts.js';
import { api } from './api.js';
export interface EditorHandle {flush:()=>Promise<boolean>;selection:()=>{start:number;end:number;expectedText:string};locate:(start:number,end:number)=>void;}
export const Editor=forwardRef<EditorHandle,{chapter:StoryObject;readOnly:boolean;focus:boolean;onFocus:()=>void;onSaved:(c:StoryObject)=>void;onHistory:()=>void;onTakeover:()=>void;onPlan:()=>void;onDelegate:()=>void;onSelection:(selected:boolean)=>void}>((props,ref)=>{
  const {chapter}=props;const mount=useRef<HTMLDivElement>(null);const view=useRef<EditorView>();const readOnly=new Compartment();const readCompartment=useRef(readOnly);const revision=useRef(chapter.revision);const saved=useRef(chapter.body);const timer=useRef<ReturnType<typeof setTimeout>>();const saving=useRef<Promise<boolean>|null>(null);const latest=useRef(props);latest.current=props;
  const [state,setState]=useState('saved');const [message,setMessage]=useState('');const [words,setWords]=useState(countWords(chapter.body));const [recovery,setRecovery]=useState<{body:string;revision:number}|null>(null);const error=useRef(false);
  const key=`novel-recovery:${chapter.projectId}:${chapter.id}`;
  async function flush():Promise<boolean>{
    if(timer.current)clearTimeout(timer.current);if(saving.current)return saving.current;const editor=view.current;if(!editor)return true;
    const text=editor.state.doc.toString();if(text===saved.current)return true;if(latest.current.readOnly){setState('error');setMessage('请先接管或解锁章节。编辑已保留。');return false;}
    saving.current=(async()=>{try{setState('saving');setMessage('');error.current=false;while(view.current&&view.current.state.doc.toString()!==saved.current){const body=view.current.state.doc.toString();const result=await api<StoryObject>(`/projects/${chapter.projectId}/objects/${chapter.id}/body`,{body,revision:revision.current});saved.current=body;revision.current=result.revision;latest.current.onSaved(result);}localStorage.removeItem(key);setState('saved');return true;}catch(e){error.current=true;setState('error');setMessage((e as Error).message);return false;}finally{saving.current=null;}})();return saving.current;
  }
  useImperativeHandle(ref,()=>({flush,selection:()=>{const s=view.current?.state.selection.main;return {start:s?.from??0,end:s?.to??0,expectedText:s?view.current!.state.sliceDoc(s.from,s.to):''};},locate:(start,end)=>{const v=view.current;if(v){const length=v.state.doc.length;v.dispatch({selection:{anchor:Math.min(start,length),head:Math.min(end,length)},effects:EditorView.scrollIntoView(Math.min(start,length),{y:'center'})});v.focus();}}}));
  useEffect(()=>{
    const local=localStorage.getItem(key);if(local){try{const r=JSON.parse(local);if(r.body!==chapter.body)setRecovery(r);}catch{}}
    const editor=new EditorView({parent:mount.current!,state:EditorState.create({doc:chapter.body,extensions:[basicSetup,markdown(),EditorView.lineWrapping,readCompartment.current.of(EditorState.readOnly.of(props.readOnly)),EditorView.contentAttributes.of({'aria-label':'章节正文','spellcheck':'false'}),EditorView.updateListener.of(update=>{
      if(update.selectionSet)latest.current.onSelection(!update.state.selection.main.empty);
      if(update.docChanged){const text=update.state.doc.toString();setWords(countWords(text));if(text!==saved.current){setState('dirty');try{localStorage.setItem(key,JSON.stringify({body:text,revision:revision.current}));}catch{setMessage('浏览器草稿备份不可用，请保持页面打开直至服务保存成功。');}if(timer.current)clearTimeout(timer.current);if(!error.current)timer.current=setTimeout(()=>void flush(),650);}else setState('saved');}
    })]})});view.current=editor;
    const unload=(event:BeforeUnloadEvent)=>{if(view.current?.state.doc.toString()!==saved.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',unload);
    return()=>{if(timer.current)clearTimeout(timer.current);editor.destroy();view.current=undefined;window.removeEventListener('beforeunload',unload);};
  },[chapter.id]);
  useEffect(()=>{view.current?.dispatch({effects:readCompartment.current.reconfigure(EditorState.readOnly.of(props.readOnly))});},[props.readOnly]);
  useEffect(()=>{if(chapter.revision===revision.current||!view.current)return;if(view.current.state.doc.toString()!==saved.current){setState('error');setMessage('正文已在另一处更新。您的编辑保留在这里，请先核对版本。');error.current=true;return;}revision.current=chapter.revision;saved.current=chapter.body;view.current.dispatch({changes:{from:0,to:view.current.state.doc.length,insert:chapter.body}});},[chapter.revision]);
  return <section className="writer-page">
    <div className="editor-toolbar"><div className="toolbar-group editor-toolbar-start"><span className="editor-tab" title={chapter.title}><FileText size={14}/><span>{chapter.title}</span><i className={`tab-state ${state}`} aria-hidden="true"/></span><span className="separator"/><button className="icon-button" title="撤销 Ctrl+Z" aria-label="撤销" onClick={()=>view.current&&undo(view.current)}><Undo2 size={16}/></button><button className="icon-button" title="重做 Ctrl+Y" aria-label="重做" onClick={()=>view.current&&redo(view.current)}><Redo2 size={16}/></button><span className="separator"/><button onClick={props.onPlan}>本章规划</button><button onClick={props.onHistory}><History size={14}/>版本</button></div><div className="toolbar-group"><button className="icon-button" title="专注写作" aria-label="专注写作" onClick={props.onFocus}><Focus size={17}/></button><button onClick={()=>void flush()} className={state==='error'?'danger-text':'save-label'}><span className={state==='saving'?'spin':''}>{state==='error'?<CloudOff size={14}/>:state==='saved'?<Check size={14}/>:<Save size={14}/>}</span>{({saved:'已保存',dirty:'待保存',saving:'保存中',error:'保存失败 · 重试'} as any)[state]}</button></div></div>
    {message&&<div className="notice error" role="alert">{message}</div>}
    {recovery&&<div className="notice">发现上次未保存的本地草稿。<button onClick={()=>{const v=view.current!;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:recovery.body}});setRecovery(null);}}>恢复到编辑器</button><button onClick={()=>{localStorage.removeItem(key);setRecovery(null);}}>使用服务端版本</button></div>}
    {props.readOnly&&<div className="notice">{chapter.locked?<><Lock size={15}/>{chapter.fields.referenceOnly?'这是所选原作的只读参考章节。可阅读、查证；请在本书新章节中改编，原作不能解锁覆盖。':'本章已锁定，在章纲中解锁后可编辑。'}</>:<>此章节由导演交付或正在处理。查看不改变写入控制。<button className="solid small" onClick={props.onTakeover}>接管并编辑</button></>}</div>}
    <div className="manuscript"><div className="chapter-heading"><div className="eyebrow">MANUSCRIPT <span>·</span> 正文</div><h1>{chapter.title}</h1><p>{String(chapter.fields.goal??'写下这一章真正需要发生的事。')}</p></div><div className="editor-mount" ref={mount}/><div className="chapter-end"><span/><span>◇</span><span/></div><div className="writer-next"><span>把下一步交给导演，让故事接着走。</span><button onClick={props.onDelegate}>委派下一章 <ArrowRight size={15}/></button></div></div>
    <footer className="editor-footer"><span>{words.toLocaleString()} 字 <span className="muted">/ 目标 {Number(chapter.fields.targetWords??2000).toLocaleString()} 字</span></span><span title="每个汉字、Latin 单词或数字计 1，标点与空白不计">汉字与单词 · 不计标点</span><span>修订 {revision.current}</span></footer>
  </section>;
});
