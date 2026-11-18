'use client';
import {useEffect,useRef,useState} from 'react';
import {useT} from './i18n-provider';
type Options={message:string;input?:boolean;confirm?:boolean};
export function useAppDialog(){
 const tr=useT();
 const [options,setOptions]=useState<Options|null>(null);const ref=useRef<HTMLDialogElement>(null);const resolve=useRef<((value:string|null)=>void)|null>(null);const previous=useRef<HTMLElement|null>(null);
 function finish(value:string|null){ref.current?.close();setOptions(null);resolve.current?.(value);resolve.current=null;previous.current?.focus();}
 function ask(value:Options){resolve.current?.(null);previous.current=document.activeElement as HTMLElement;setOptions(value);return new Promise<string|null>(done=>{resolve.current=done;});}
 useEffect(()=>{if(options)ref.current?.showModal();},[options]);
 useEffect(()=>()=>{resolve.current?.(null);},[]);
 const dialog=options&&<dialog ref={ref} className="app-dialog" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message" onCancel={e=>{e.preventDefault();finish(null);}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)finish(null);}}}><form onSubmit={e=>{e.preventDefault();const value=new FormData(e.currentTarget).get('answer');finish(options.input?String(value||'').trim():'ok');}}><h2 id="app-dialog-title">{tr(options.input?'장소 변경 요청':options.confirm?'추천 확인':'일단나와 안내')}</h2><p id="app-dialog-message">{options.message}</p>{options.input&&<input autoFocus name="answer" aria-label={tr('장소 변경 요청')} maxLength={300} required/>}<div className="dialog-actions">{(options.confirm||options.input)&&<button type="button" className="chip" onClick={()=>finish(null)}>{tr('취소')}</button>}<button autoFocus={!options.input} type="submit" className="primary">{tr('확인')}</button></div></form></dialog>;
 return {ask,dialog};
}
