// 코스 경로(출발지 → 1번 → … → 마지막 장소)를 길찾기 API 응답으로 만들거나, 실패하면 직선으로 둔다.
// 직선은 방문 순서 표시일 뿐 실제 길찾기 경로가 아니다.

export type LatLng=[number,number];
export type LegSource='tmap-pedestrian'|'kakao-car'|'straight';
export type Leg={path:LatLng[];source:LegSource;duration:number|null;distance:number|null};
export type RoutePlan={legs:Leg[];verified:boolean;provider:string|null;reason?:string};

export const ROUTE_LABEL:Record<LegSource,string>={'tmap-pedestrian':'TMAP 도보 경로','kakao-car':'카카오모빌리티 자동차 경로','straight':'방문 순서 표시 · 실제 길찾기 경로 아님'};

export function validPoint(p:unknown):p is {lat:number;lng:number}{
 const q=p as {lat?:unknown;lng?:unknown};
 return !!q&&typeof q.lat==='number'&&typeof q.lng==='number'&&Number.isFinite(q.lat)&&Number.isFinite(q.lng)&&q.lat>=33&&q.lat<=39&&q.lng>=124&&q.lng<=132;
}

export function straightLeg(a:{lat:number;lng:number},b:{lat:number;lng:number}):Leg{
 return {path:[[a.lat,a.lng],[b.lat,b.lng]],source:'straight',duration:null,distance:null};
}

/** TMAP 보행자 경로안내 응답(GeoJSON)을 구간으로 바꾼다. 좌표가 없으면 null. */
export function parseTmapPedestrian(body:unknown):Leg|null{
 const features=(body as {features?:{geometry?:{type?:string;coordinates?:unknown};properties?:{totalTime?:unknown;totalDistance?:unknown}}[]})?.features;
 if(!Array.isArray(features))return null;
 const path:LatLng[]=[];let duration:number|null=null,distance:number|null=null;
 for(const f of features){
  const t=f?.properties?.totalTime,d=f?.properties?.totalDistance;
  if(duration===null&&typeof t==='number'&&Number.isFinite(t))duration=t;
  if(distance===null&&typeof d==='number'&&Number.isFinite(d))distance=d;
  if(f?.geometry?.type!=='LineString'||!Array.isArray(f.geometry.coordinates))continue;
  for(const c of f.geometry.coordinates as unknown[]){
   if(!Array.isArray(c)||typeof c[0]!=='number'||typeof c[1]!=='number')continue;
   const last=path.at(-1);const point:LatLng=[c[1],c[0]];
   if(!last||last[0]!==point[0]||last[1]!==point[1])path.push(point);
  }
 }
 return path.length>=2?{path,source:'tmap-pedestrian',duration,distance}:null;
}

/** 카카오모빌리티 자동차 길찾기 응답을 구간으로 바꾼다. result_code가 0이 아니면 null. */
export function parseKakaoCar(body:unknown):Leg|null{
 const route=(body as {routes?:{result_code?:number;summary?:{duration?:number;distance?:number};sections?:{roads?:{vertexes?:number[]}[]}[]}[]})?.routes?.[0];
 if(!route||route.result_code!==0)return null;
 const path:LatLng[]=[];
 for(const section of route.sections||[])for(const road of section.roads||[]){
  const v=road.vertexes||[];
  for(let i=0;i+1<v.length;i+=2){
   const point:LatLng=[v[i+1],v[i]];const last=path.at(-1);
   if(Number.isFinite(point[0])&&Number.isFinite(point[1])&&(!last||last[0]!==point[0]||last[1]!==point[1]))path.push(point);
  }
 }
 const duration=route.summary?.duration,distance=route.summary?.distance;
 return path.length>=2?{path,source:'kakao-car',duration:typeof duration==='number'?duration:null,distance:typeof distance==='number'?distance:null}:null;
}

/** 모든 구간을 하나의 선으로 잇는다. 이어지는 점이 같으면 하나만 남긴다. */
export function joinPath(legs:Leg[]):LatLng[]{
 const out:LatLng[]=[];
 for(const leg of legs)for(const p of leg.path){const last=out.at(-1);if(!last||last[0]!==p[0]||last[1]!==p[1])out.push(p);}
 return out;
}

/** 선을 거리 비율(0~1)만큼 자른 점 목록. 애니메이션에 쓴다. */
export function slicePath(path:LatLng[],ratio:number):LatLng[]{
 if(path.length<2||ratio>=1)return path.slice();
 if(ratio<=0)return path.slice(0,1);
 const seg=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));
 const total=seg.reduce((a,b)=>a+b,0);if(total===0)return path.slice();
 let left=total*ratio;const out:LatLng[]=[path[0]];
 for(let i=0;i<seg.length;i++){
  // 자르는 지점이 꼭짓점과 정확히 같으면 아래에서 k=1로 그 점을 한 번만 넣는다.
  if(left-seg[i]>total*1e-9){out.push(path[i+1]);left-=seg[i];continue;}
  const k=seg[i]?left/seg[i]:0;out.push([path[i][0]+(path[i+1][0]-path[i][0])*k,path[i][1]+(path[i+1][1]-path[i][1])*k]);break;
 }
 return out;
}

/** 구간 소요시간(초)을 분으로 올림한다. 값이 없으면 null. */
export const legMinutes=(leg:Leg)=>leg.duration===null?null:Math.max(1,Math.ceil(leg.duration/60));
