// 성수동 시연 조건을 실제 카카오 장소 검색으로 확인한다. (규칙 기반 추천 경로, GPT 미사용)
// 사용: $env:KAKAO_REST_API_KEY 는 .env.local 또는 현재 셸에만 두고, 이 스크립트는 키를 출력하지 않는다.
import {searchKakaoPlaces} from '../lib/kakao-place-search.ts';
import {refineCandidates} from '../lib/place-suitability.ts';
import {propose,minutes,type Preferences,type Place} from '../lib/planner.ts';
import {replaceStop} from '../lib/replace-stop.ts';
const key=process.env.KAKAO_REST_API_KEY;
if(!key){console.error('KAKAO_REST_API_KEY가 설정되지 않았어요.');process.exit(2);}
const prefs:Preferences={region:'서울 성수동',lat:37.5445,lng:127.0557,companion:'친구와',people:3,start:'18:00',end:'21:00',budget:30000,transport:'도보',activities:[],food:'상관없어요',indoor:false,request:''};
const row=(p:Place)=>`${p.name} | ${p.category} | ${p.sourceCategory||'-'} | ${p.address||'-'} | 추정 ${p.cost.toLocaleString()}원`;
const raw=await searchKakaoPlaces(prefs,key);
const places=refineCandidates(raw,prefs);
console.log(`검색 후보 ${raw.length}곳 -> 규칙 적용 후 ${places.length}곳`);
const courses=propose(places,prefs);
courses.forEach((c,i)=>{
 console.log(`\n[코스 ${i+1}] ${c.title} · 합계 ${c.total.toLocaleString()}원(추정) · 종료 ${c.stops.at(-1)?.departure}`);
 c.stops.forEach((s,j)=>console.log(` ${j+1}. ${s.arrival} ${row(s)} · 이동 ${s.travel}분`));
});
const course=courses[0];const idx=course?.stops.findIndex(s=>s.category==='카페')??-1;
if(course&&idx>=0){
 const updated=replaceStop(course,idx,places,prefs);
 console.log(`\n[카페 바꾸기] ${course.stops[idx].name} -> ${updated?updated.stops[idx].name:'대체 없음'}`);
 if(updated){
  const same=updated.stops.every((s,i)=>i===idx||s.id===course.stops[i].id);
  console.log(` 나머지 유지: ${same} · 합계 ${updated.total.toLocaleString()}원 ≤ ${prefs.budget.toLocaleString()} : ${updated.total<=prefs.budget} · 종료 ${updated.stops.at(-1)?.departure} ≤ ${prefs.end} : ${minutes(updated.stops.at(-1)!.departure)<=minutes(prefs.end)}`);
 }
}
