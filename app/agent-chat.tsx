'use client';
import {useEffect,useRef,useState} from 'react';
import type {Course} from '../lib/planner';
import type {AgentDraft} from '../lib/day-agent';
type Message={role:'user'|'assistant';content:string};
export default function AgentChat({onReady}:{onReady:(course:Course)=>void}){
 const [messages,setMessages]=useState<Message[]>([{role:'assistant',content:'안녕! 나와예요 👋 오늘 누구와 어디서 놀고 싶어요? 하고 싶은 일부터 편하게 이야기해 주세요.'}]);
 const [draft,setDraft]=useState<AgentDraft>({}),[course,setCourse]=useState<Course|null>(null),[text,setText]=useState(''),[busy,setBusy]=useState(false),[stage,setStage]=useState(''),[error,setError]=useState(''),[target,setTarget]=useState<number|null>(null);
 const abort=useRef<AbortController|null>(null),bottom=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>()=>abort.current?.abort(),[]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:'nearest'});},[messages,stage]);
 async function send(suggestion?:string){
  if(abort.current||busy||!(suggestion??text).trim())return;const content=(suggestion??text).trim();const previous=messages.slice(-10);setMessages(m=>m.at(-1)?.role==='user'&&m.at(-1)?.content===content?m:[...m,{role:'user',content}]);setText('');setBusy(true);setError('');abort.current=new AbortController();
  try{
   const r=await fetch('/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.current.signal,body:JSON.stringify({message:content,draft,course,target,history:previous})});
   if(!r.ok||!r.body)throw new Error('요청을 보내지 못했어요. 다시 시도해 주세요.');
   const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='',completed=false;
   for(;;){const chunk=await reader.read();buffer+=decoder.decode(chunk.value,{stream:!chunk.done});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){if(!line.trim())continue;const event=JSON.parse(line);if(event.type==='status')setStage(event.message);if(event.type==='error')throw new Error(event.message);if(event.type==='result'){setDraft(event.draft);setCourse(event.course);setMessages(m=>[...m,{role:'assistant',content:event.message}]);setTarget(null);completed=true;if(event.ready&&event.course?.preferences){if(!input.current?.value.trim())onReady(event.course);}}}if(chunk.done)break;}
   if(!completed)throw new Error('응답이 중단됐어요. 기존 코스는 유지했습니다. 다시 보내 주세요.');
  }catch(e){setError(e instanceof Error&&e.name==='AbortError'?'요청을 취소했어요. 기존 코스는 유지됩니다.':(e as Error).message);setText(content);}
  finally{setBusy(false);setStage('');abort.current=null;}
 }
 return <section className="agent-shell" aria-label="나와와 코스 대화"><header className="agent-heading"><img src="/nawa-loading.png" alt="나와 캐릭터"/><div><h1>나와와 오늘을 준비해요</h1><p>말로 알려주면 찾고, 계산하고, 한 곳씩 바꿔요.</p></div></header>
 <div className="agent-conditions" aria-label="기억 중인 조건">{[draft.region,draft.start&&draft.end?`${draft.start}–${draft.end}`:null,draft.budget?`1인 ${draft.budget.toLocaleString()}원`:null,`${draft.people??2}명 · ${draft.transport??'도보'}${!draft.people&&!draft.transport?' (기본값)':''}`,draft.shortWalk?'도보 구간 10분·총 30분 이내 추정':null,draft.dessert?'디저트 카페':null].filter(Boolean).map(v=><span key={v}>{v}</span>)}</div>
 <div className="agent-messages" role="log" aria-label="대화 내역">{messages.map((m,i)=><div key={i} className={`agent-message ${m.role}`}><b>{m.role==='assistant'?'나와':'나'}</b><p>{m.content}</p></div>)}<div ref={bottom}/></div>
 {busy&&<div role="status" className="agent-finding"><div className="agent-walker"><img src="/nawa-loading.png" alt=""/></div><strong>{/검색|계산|확인하고/.test(stage)?'잠깐만요, 어울리는 곳을 찾아볼게요!':'말씀하신 하루를 생각하고 있어요…'}</strong><p>{stage||'요청을 보내고 있어요'}</p></div>}{error&&<p role="alert">{error}</p>}
 {target!==null&&course&&<p>바꿀 장소: {course.stops[target]?.name} <button type="button" onClick={()=>setTarget(null)}>선택 취소</button></p>}
 <form className="agent-compose" onSubmit={e=>{e.preventDefault();send();}}><label htmlFor="agent-message">오늘 하고 싶은 일이나 바꾸고 싶은 점</label><textarea id="agent-message" ref={input} value={text} onChange={e=>setText(e.target.value)} maxLength={600} placeholder="오늘 성수에서 친구랑 14시부터 21시까지, 1인 3만 원. 많이 걷기 싫어." onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/><div>{busy?<button type="button" onClick={()=>abort.current?.abort()}>요청 취소</button>:<button type="submit" disabled={!text.trim()}>나와에게 보내기 →</button>}</div></form>
 {!busy&&<div className="agent-quick" aria-label="빠른 답변">{(draft.drinks?['술은 빼고 식사와 카페로 짜줘']:!draft.region?['성수에서 친구랑 놀고 싶어','혜화에서 데이트하고 싶어']:!draft.budget?['1인 3만 원','1인 5만 원']:['카페를 다른 곳으로 바꿔줘','실내 위주로 다시 짜줘']).map(v=><button type="button" className="chip" key={v} onClick={()=>send(v)}>{v}</button>)}</div>}
 {course?.preferences&&<button className="save-button" onClick={()=>onReady(course)}>지도와 추천 코스 보기 →</button>}
 </section>;
}
