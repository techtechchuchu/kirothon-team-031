// 화면 언어 전환. 코드에는 한국어 원문을 그대로 쓰고, 원문을 열쇠로 번역을 찾는다(lib/i18n-dict.ts).
// 사전에 없는 글(가게 이름, 주소, AI가 쓴 문장)은 원문 그대로 보여준다.
// '일단나와'는 고유명사라 번역하지 않는다.
import {DICT} from './i18n-dict.ts';

export const LANGS=[{code:'ko',label:'한국어'},{code:'en',label:'English'},{code:'zh',label:'中文'},{code:'ja',label:'日本語'},{code:'vi',label:'Tiếng Việt'}] as const;
export type Lang=typeof LANGS[number]['code'];
export const isLang=(value:unknown):value is Lang=>LANGS.some(l=>l.code===value);
/** AI에게 답변 언어를 알려줄 때 쓰는 이름. */
export const LANG_NAME:Record<Lang,string>={ko:'한국어',en:'English',zh:'简体中文',ja:'日本語',vi:'Tiếng Việt'};
const COLUMN:Record<Exclude<Lang,'ko'>,number>={en:0,zh:1,ja:2,vi:3};

/** 한국어 원문을 lang으로 바꾼다. 원문과 번역의 {이름} 자리에 vars 값을 넣는다. */
export function translate(lang:Lang,text:string,vars?:Record<string,string|number>):string{
 // 같은 한국어가 자리에 따라 다르게 번역될 때는 원문 뒤에 '#구분'을 붙여 쓴다(예: '확인#verified'). 한국어 화면에는 '#' 앞부분만 나온다.
 const plain=text.replace(/#[a-z]+$/,'');
 const row=lang==='ko'?undefined:DICT[text];
 let out=row?row[COLUMN[lang as Exclude<Lang,'ko'>]]||plain:plain;
 if(vars)for(const [key,value] of Object.entries(vars))out=out.split(`{${key}}`).join(String(value));
 return out;
}
