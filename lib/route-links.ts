import {distance,type Course,type Stop} from './planner.ts';

const MODE:Record<string,string>={'도보':'walk','대중교통':'traffic','자동차':'car'};
// 카카오맵 URL은 쉼표·슬래시를 구분자로 쓰므로 이름에서 뺀다.
const clean=(name:string)=>name.replace(/[,/]/g,' ').replace(/\s+/g,' ').trim()||'장소';
const point=(p:{name:string;lat:number;lng:number})=>`${encodeURIComponent(clean(p.name))},${p.lat},${p.lng}`;

/** 두 장소 사이 카카오맵 길찾기 URL. 실제 경로·시간은 카카오맵에서 계산된다. */
export function directionsUrl(from:{name:string;lat:number;lng:number},to:{name:string;lat:number;lng:number},transport:string):string{
 return `https://map.kakao.com/link/by/${MODE[transport]||'walk'}/${point(from)}/${point(to)}`;
}

export type CourseSummary={count:number;start:string;end:string;travel:number;total:number};
/** 지도 위 요약 줄에 쓰는 값. 이동시간은 직선거리 보정 추정치의 합이다. */
export function courseSummary(course:Course):CourseSummary|null{
 if(!course.stops.length)return null;
 return {count:course.stops.length,start:course.stops[0].arrival,end:course.stops.at(-1)!.departure,travel:course.stops.reduce((sum,s)=>sum+s.travel,0),total:course.total};
}

/** 핀끼리 이 거리(m)보다 가까우면 지도에서 겹치므로 시간 라벨을 줄인다. */
export const CROWDED_METERS=80;
/** i번째 핀이 앞선 핀과 겹치는지. */
export function crowdedPin(stops:Stop[],i:number):boolean{
 return stops.slice(0,i).some(s=>distance(s,stops[i])<CROWDED_METERS);
}
/** i번째 구간(i-1 → i)이 너무 짧아 라벨을 둘 자리가 없는지. */
export function shortSegment(stops:Stop[],i:number):boolean{
 return i<1||distance(stops[i-1],stops[i])<CROWDED_METERS*1.5;
}
