import { useEffect,useRef,type ReactNode } from 'react';import { X } from 'lucide-react';
export function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
  const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close();},[]);
  return <dialog ref={dialog} className={`modal ${wide?'wide':''}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}><div className="modal-inner"><header><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={19}/></button></header><div className="modal-content">{children}</div></div></dialog>;
}
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
