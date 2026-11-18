export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
import {validPoint} from '../../../lib/route-plan';
import {emptyMapMesh,loadMapMesh,type MapMesh} from '../../../lib/buildings';

// 3D 코스 지도에 세울 주변 건물·도로·녹지·물. 무료 벡터 타일(OpenFreeMap)을 받아 삼각형으로 바꾼다.
// 받지 못하면 빈 결과를 주고 3D 지도는 건물 없이 보인다.
const cache=new Map<string,{until:number;mesh:MapMesh}>();

export async function POST(req:Request){
 let body:{center?:unknown;radius?:unknown};
 try{body=await req.json();}catch{return Response.json({error:'요청 형식을 확인해 주세요.'},{status:400});}
 const {center,radius}=body;
 if(!validPoint(center)||typeof radius!=='number'||!Number.isFinite(radius)||radius<=0)return Response.json({error:'위치 정보를 확인해 주세요.'},{status:400});
 const key=`${center.lat.toFixed(4)},${center.lng.toFixed(4)},${Math.round(radius/10)}`;
 const hit=cache.get(key);
 if(hit&&hit.until>Date.now())return Response.json(hit.mesh);
 const reason='건물 정보를 받지 못했어요.';
 let mesh:MapMesh|null=null;
 try{
  mesh=await loadMapMesh(center.lat,center.lng,radius);
  // 범위가 아주 넓으면 건물이 점처럼 작아지고 요청도 무거워져서 받지 않는다
  if(!mesh)return Response.json({...emptyMapMesh(),reason:'범위가 넓어 주변 지도를 표시하지 않아요.'});
 }catch{mesh=null;}
 if(cache.size>40)cache.clear();
 cache.set(key,{until:Date.now()+(mesh?6*3600000:60000),mesh:mesh||emptyMapMesh()});
 return Response.json(mesh||{...emptyMapMesh(),reason});
}
