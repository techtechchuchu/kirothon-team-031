'use client';
import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';
import {LANGS,isLang,translate,type Lang} from '../lib/i18n';

// 화면 언어. 고른 언어는 이 브라우저에 기억하고, 처음에는 브라우저 언어를 따른다(지원하지 않는 언어는 영어).
const STORAGE_KEY='ildan-lang';
type Tr=(text:string,vars?:Record<string,string|number>)=>string;
const Context=createContext<{lang:Lang;setLang:(lang:Lang)=>void;tr:Tr}>({lang:'ko',setLang:()=>{},tr:text=>text});

export function LanguageProvider({children}:{children:ReactNode}){
 const [lang,setLangState]=useState<Lang>('ko');
 useEffect(()=>{
  let next:Lang='ko';
  try{
   const saved=localStorage.getItem(STORAGE_KEY);
   const browser=navigator.language.slice(0,2).toLowerCase();
   next=isLang(saved)?saved:isLang(browser)?browser:'en';
  }catch{/* 저장소를 못 쓰면 한국어로 둔다 */}
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setLangState(next);
 },[]);
 useEffect(()=>{document.documentElement.lang=lang==='zh'?'zh-Hans':lang;},[lang]);
 const setLang=useCallback((next:Lang)=>{setLangState(next);try{localStorage.setItem(STORAGE_KEY,next);}catch{/* 기억하지 못해도 화면은 바뀐다 */}},[]);
 const tr=useCallback<Tr>((text,vars)=>translate(lang,text,vars),[lang]);
 return <Context.Provider value={{lang,setLang,tr}}>{children}</Context.Provider>;
}

/** 한국어 원문을 현재 언어로 바꾸는 함수. 사전에 없는 글(가게 이름 등)은 그대로 돌려준다. */
export function useT(){return useContext(Context).tr;}
export function useLang(){return useContext(Context).lang;}

export function LangSwitch(){
 const {lang,setLang}=useContext(Context);
 return <label className="theme-switch lang-switch"><span>Language</span><select aria-label="Language" value={lang} onChange={e=>{if(isLang(e.target.value))setLang(e.target.value);}}>{LANGS.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}</select></label>;
}
