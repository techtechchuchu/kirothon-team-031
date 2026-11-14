export const runtime='nodejs';
export const dynamic='force-dynamic';
import {parseKakaoCar,parseTmapPedestrian,straightLeg,validPoint,type Leg,type RoutePlan} from '../../../lib/route-plan';

// 도보: TMAP 보행자 경로안내(TMAP_APP_KEY 필요). 카카오모빌리티 도보 길찾기는 제휴 계약이 필요해 쓰지 않는다.
// 자동차: 카카오모빌리티 자동차 길찾기(KAKAO_REST_API_KEY).
// 대중교통: 공개 API가 없어 직선으로 둔다. 자동차 경로를 도보·대중교통 경로로 쓰지 않는다.
const cache=new Map<string,{until:number;leg:Leg|null}>();
type P={lat:number;lng:number};

async function tmapLeg(a:P,b:P,key:string):Promise<Leg|null>{
 const r=await fetch('https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1',{method:'POST',headers:{appKey:key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({startX:a.lng,startY:a.lat,endX:b.lng,endY:b.lat,startName:encodeURIComponent('출발'),endName:encodeURIComponent('도착'),reqCoordType:'WGS84GEO',resCoordType:'WGS84GEO'}),signal:AbortSignal.timeout(8000),cache:'no-store'});
 if(!r.ok)throw new Error(`tmap ${r.status}`);
 return parseTmapPedestrian(await r.json());
}
async function kakaoCarLeg(a:P,b:P,key:string):Promise<Leg|null>{
 const q=new URLSearchParams({origin:`${a.lng},${a.lat}`,destination:`${b.lng},${b.lat}`,priority:'RECOMMEND',summary:'false'});
 const r=await fetch(`https://apis-navi.kakaomobility.com/v1/directions?${q}`,{headers:{Authorization:`KakaoAK ${key}`},signal:AbortSignal.timeout(8000),cache:'no-store'});
 if(!r.ok)throw new Error(`kakao ${r.status}`);
 return parseKakaoCar(await r.json());
}

export async function POST(req:Request){
 let body:{transport?:unknown;points?:unknown};
 try{body=await req.json();}catch{return Response.json({error:'요청 형식을 확인해 주세요.'},{status:400});}
 const points=body.points,transport=body.transport;
 if(!Array.isArray(points)||points.length<2||points.length>7||!points.every(validPoint)||typeof transport!=='string'||!['도보','대중교통','자동차'].includes(transport))return Response.json({error:'경로 정보를 확인해 주세요.'},{status:400});
 const pts=points as P[];
 const tmapKey=process.env.TMAP_APP_KEY,kakaoKey=process.env.KAKAO_REST_API_KEY||process.env.kakao_rest_api_key;
 const provider=transport==='도보'&&tmapKey?'tmap':transport==='자동차'&&kakaoKey?'kakao':null;
 const reason=provider?undefined:transport==='도보'?'도보 경로 API 키(TMAP_APP_KEY)가 설정되지 않았어요.':transport==='자동차'?'카카오 REST 키가 설정되지 않았어요.':'대중교통 경로 API는 연결되지 않았어요.';
 const legs:Leg[]=await Promise.all(pts.slice(1).map(async(b,i)=>{
  const a=pts[i];
  if(!provider)return straightLeg(a,b);
  const k=`${provider}:${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
  const hit=cache.get(k);if(hit&&hit.until>Date.now())return hit.leg||straightLeg(a,b);
  let leg:Leg|null=null;
  try{leg=provider==='tmap'?await tmapLeg(a,b,tmapKey!):await kakaoCarLeg(a,b,kakaoKey!);}catch{leg=null;}
  if(cache.size>500)cache.clear();
  cache.set(k,{until:Date.now()+(leg?3600000:60000),leg});
  return leg||straightLeg(a,b);
 }));
 const verified=legs.every(l=>l.source!=='straight');
 const plan:RoutePlan={legs,verified,provider:verified?provider:null,reason:verified?undefined:(reason||'일부 구간의 길찾기 경로를 받지 못했어요.')};
 return Response.json(plan);
}
