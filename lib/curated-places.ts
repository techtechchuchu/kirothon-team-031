import {categories,distance,type Place,type Preferences} from './planner.ts';

export type CuratedPlace={
 /** 카카오맵 장소 상세 주소(place.map.kakao.com/<id>)의 숫자 id. */
 kakaoId:string;
 name:string;
 lat:number;
 lng:number;
 category:string;
 address:string;
 /** 누가 무엇을 확인했는지. 화면에 그대로 표시되므로 사실만 적는다. 예: "2026-11 팀원이 직접 방문해 영업 확인" */
 note:string;
 sourceCategory?:string;
 phone?:string;
 /** 소품샵처럼 입장료가 없는 곳은 0원 등으로 지정한다. 실제 구매 비용이 아닌 계획용 값이다. */
 cost?:number;
 duration?:number;
};

/**
 * 팀이 직접 확인한 장소만 넣는 목록이다.
 * 카카오 API는 별점·후기·영업 여부를 제공하지 않으므로, 소품샵 같은 곳의 "검증"은 사람이 확인한 항목으로만 보장한다.
 * 목록에 없는 장소를 검증된 것처럼 표시하지 않는다. 후보는 `scripts/find-places.mts`로 찾을 수 있다.
 */
export const curatedPlaces:CuratedPlace[]=[];

const RADIUS=3000;

/** 사용자 위치 근처의 확인된 장소를 Place로 바꿔 돌려준다. */
export function curatedFor(prefs:Pick<Preferences,'lat'|'lng'>,list:CuratedPlace[]=curatedPlaces):Place[]{
 return list.flatMap(c=>{
  const base=categories[c.category];
  if(!base||!/^\d+$/.test(c.kakaoId)||!Number.isFinite(c.lat)||!Number.isFinite(c.lng)||distance(prefs,c)>RADIUS)return [];
  return [{id:`kakao/${c.kakaoId}`,name:c.name,lat:c.lat,lng:c.lng,category:c.category,cost:c.cost??base.cost,duration:c.duration??base.duration,indoor:c.category!=='산책',url:`https://place.map.kakao.com/${c.kakaoId}`,address:c.address,phone:c.phone,source:'kakao' as const,sourceCategory:c.sourceCategory,priceBasis:'category_estimate' as const,verified:{note:c.note}}];
 });
}

/** 검색 후보에 확인된 장소를 합친다. 같은 id는 확인된 쪽으로 바꾼다. 가상 샘플 코스에는 합치지 않는다. */
export function withCurated(candidates:Place[],prefs:Pick<Preferences,'lat'|'lng'>,list:CuratedPlace[]=curatedPlaces):Place[]{
 // 샘플 데이터는 source가 비어 있고 id가 sample-로 시작한다.
 if(candidates.length>0&&candidates.every(p=>p.source==='sample'||p.id.startsWith('sample-')))return candidates;
 const extra=curatedFor(prefs,list);
 if(!extra.length)return candidates;
 const ids=new Set(extra.map(p=>p.id));
 return [...candidates.filter(p=>!ids.has(p.id)),...extra];
}
