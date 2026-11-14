import {schedule,type Course,type Place,type Preferences} from './planner.ts';
import {isChainCafe,refineCandidates} from './place-suitability.ts';

export type ReplaceOptions={noChain?:boolean;cheaper?:boolean;excluded?:string[]};

/**
 * 코스의 장소 하나만 바꾼다. 나머지 장소와 순서는 그대로 두고,
 * 종료 시간과 1인 예산을 지키는 첫 후보를 돌려준다. 없으면 null.
 */
export function replaceStop(course:Course,index:number,candidates:Place[],p:Preferences,options:ReplaceOptions={}):Course|null{
 const current=course.stops[index];
 if(!current)return null;
 const used=new Set([...course.stops.map(s=>s.id),...(options.excluded||[])]);
 const refined=refineCandidates(candidates,p);
 for(const place of refined){
  if(place.category!==current.category||used.has(place.id))continue;
  if(current.category==='카페'&&options.noChain&&isChainCafe(place))continue;
  if(options.cheaper&&place.cost>=current.cost)continue;
  const list=course.stops.map((s,i)=>i===index?place:s);
  const updated=schedule(list,p,course.title,course.subtitle,course.id);
  const keepsOthers=updated.stops.length===list.length&&updated.stops.every((s,i)=>s.id===list[i].id);
  if(keepsOthers&&updated.total<=p.budget)return updated;
 }
 return null;
}
