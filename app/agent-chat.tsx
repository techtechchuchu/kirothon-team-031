'use client';
import {useEffect,useRef,useState} from 'react';
import type {Course} from '../lib/planner';
import type {AgentDraft} from '../lib/day-agent';
type Message={role:'user'|'assistant';content:string};
export default function AgentChat(){
 const [messages,setMessages]=useState<Message[]>([{role:'assistant',content:'안녕! 나와예요. 오늘 어디서 누구와, 어떤 하루를 보내고 싶어요? 시작·종료 시간과 1인 예산도 알려주세요.'}]);
 const [draft,setDraft]=useState<AgentDraft>({}),[course,setCourse]=useState<Course|null>(null),[text,setText]=useState(''),[busy,setBusy]=useState(false),[stage,setStage]=useState(''),[error,setError]=useState(''),[target,setTarget]=useState<number|null>(null);
 const abort=useRef<AbortController|null>(null),bottom=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>()=>abort.current?.abort(),[]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:'nearest'});},[messages,stage]);
 async function send(){
  if(abort.current||busy||!text.trim())return;const content=text.trim();const previous=messages.slice(-10);setMessages(m=>m.at(-1)?.role==='user'&&m.at(-1)?.content===content?m:[...m,{role:'user',content}]);setText('');setBusy(true);setError('');abort.current=new AbortController();
  try{
   const r=await fetch('/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.current.signal,body:JSON.stringify({message:content,draft,course,target,history:previous})});
   if(!r.ok||!r.body)throw new Error('요청을 보내지 못했어요. 다시 시도해 주세요.');
   const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='',completed=false;
   for(;;){const chunk=await reader.read();buffer+=decoder.decode(chunk.value,{stream:!chunk.done});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){if(!line.trim())continue;const event=JSON.parse(line);if(event.type==='status')setStage(event.message);if(event.type==='error')throw new Error(event.message);if(event.type==='result'){setDraft(event.draft);setCourse(event.course);setMessages(m=>[...m,{role:'assistant',content:event.message}]);setTarget(null);completed=true;}}if(chunk.done)break;}
   if(!completed)throw new Error('응답이 중단됐어요. 기존 코스는 유지했습니다. 다시 보내 주세요.');
  }catch(e){setError(e instanceof Error&&e.name==='AbortError'?'요청을 취소했어요. 기존 코스는 유지됩니다.':(e as Error).message);setText(content);}
  finally{setBusy(false);setStage('');abort.current=null;}
 }
 return <section className="agent-shell" aria-label="나와와 코스 대화"><header className="agent-heading"><img src="/nawa-loading.png" alt="나와 캐릭터"/><div><h1>나와와 오늘을 준비해요</h1><p>말로 알려주면 찾고, 계산하고, 한 곳씩 바꿔요.</p></div></header>
 <div className="agent-conditions" aria-label="기억 중인 조건">{[draft.region,draft.start&&draft.end?`${draft.start}–${draft.end}`:null,draft.budget?`1인 ${draft.budget.toLocaleString()}원`:null,`${draft.people??2}명 · ${draft.transport??'도보'}${!draft.people&&!draft.transport?' (기본값)':''}`,draft.shortWalk?'도보 구간 10분·총 30분 이내 추정':null,draft.dessert?'디저트 카페':null].filter(Boolean).map(v=><span key={v}>{v}</span>)}</div>
 <div className="agent-messages" role="log" aria-label="대화 내역">{messages.map((m,i)=><div key={i} className={`agent-message ${m.role}`}><b>{m.role==='assistant'?'나와':'나'}</b><p>{m.content}</p></div>)}<div ref={bottom}/></div>
 {busy&&<p role="status" className="agent-status">{stage||'서버에 요청을 보내고 있어요'}</p>}{error&&<p role="alert">{error}</p>}
 {target!==null&&course&&<p>바꿀 장소: {course.stops[target]?.name} <button type="button" onClick={()=>setTarget(null)}>선택 취소</button></p>}
 <form className="agent-compose" onSubmit={e=>{e.preventDefault();send();}}><label htmlFor="agent-message">오늘 하고 싶은 일이나 바꾸고 싶은 점</label><textarea id="agent-message" ref={input} value={text} onChange={e=>setText(e.target.value)} maxLength={600} placeholder="오늘 성수에서 친구랑 14시부터 21시까지, 1인 3만 원. 많이 걷기 싫어." onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/><div>{busy?<button type="button" onClick={()=>abort.current?.abort()}>요청 취소</button>:<button type="submit" disabled={!text.trim()}>나와에게 보내기 →</button>}</div></form>
 {course&&<section className="agent-course"><h2>{course.title}</h2><p>{course.stops.length}곳 · 1인 약 {course.total.toLocaleString()}원 · 이동 합계 약 {course.stops.reduce((a,s)=>a+s.travel,0)}분 (추정)</p><p>실제 가격·영업시간·후기 미확인. 방문 전 장소 상세에서 확인해 주세요.</p>{course.stops.map((s,i)=><article key={s.id}><small>{i+1} · {s.arrival}–{s.departure} · {s.category}</small><h3>{s.name}</h3><p>{s.address}</p><p>약 {s.cost.toLocaleString()}원 · 이전 장소에서 약 {s.travel}분 (추정)</p><a href={s.url} target="_blank" rel="noreferrer">카카오 장소 상세 ↗</a> <button disabled={busy} onClick={()=>{setTarget(i);setText(s.category==='카페'?'디저트가 있는 다른 카페로 바꿔줘':'다른 장소로 바꿔줘');input.current?.focus();}}>이 장소 바꾸기</button></article>)}</section>}
 </section>;
}
