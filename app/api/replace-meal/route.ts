import {categories,samplePlaces,type Preferences,type Course} from '../../../lib/planner';
import {searchKakaoPlaces} from '../../../lib/kakao-place-search';
import {searchPlaces} from '../../../lib/place-search';
import {replaceStop} from '../../../lib/replace-stop';
export const runtime='nodejs';
export async function POST(req:Request){
 try{
  const {preferences:p,course,index,excluded=[],reason=''}=await req.json() as {preferences:Preferences;course:Course;index:number;excluded:string[];reason?:string};
  if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||!Number.isFinite(p.budget)||!Array.isArray(p.activities)||!course||!Array.isArray(course.stops)||course.stops.length>5||!Number.isInteger(index)||!(course.stops[index]?.category in categories)||!Array.isArray(excluded)||excluded.length>100)return Response.json({error:'코스 정보를 확인해 주세요.'},{status:400});
  if(typeof reason!=='string'||reason.length>120)return Response.json({error:'변경 이유를 확인해 주세요.'},{status:400});
  const reasonText=reason.trim();const noChain=/^(프랜차이즈|프차|체인)(\s*(제외|빼줘|말고))?$/.test(reasonText);const cheaper=/^(더\s*)?(저렴한\s*곳|저렴하게|싸게|예산\s*줄여줘)$/.test(reasonText);
  if(reasonText&&!noChain&&!cheaper)return Response.json({error:'현재는 ‘프랜차이즈 제외’ 또는 ‘더 저렴한 곳’ 요청을 반영할 수 있어요. 분위기와 실제 가격은 확인되지 않아요.'},{status:400});
  const demo=course.stops[index].id.startsWith('sample-');
  const category=course.stops[index].category;const searchPrefs={...p,activities:[category]};
  if(noChain&&category!=='카페')return Response.json({error:'프랜차이즈 제외는 현재 카페 변경에서만 지원해요.'},{status:400});
  const key=process.env.KAKAO_REST_API_KEY||process.env.kakao_rest_api_key;
  const candidates=demo?samplePlaces():key?await searchKakaoPlaces(searchPrefs,key):await searchPlaces(searchPrefs);
  const updated=replaceStop(course,index,candidates,p,{noChain,cheaper,excluded});
  if(updated)return Response.json({course:updated});
  return Response.json({error:cheaper?'더 낮은 업종별 추정가를 가진 대안을 찾지 못했어요. 실제 가격은 메뉴에서 확인해 주세요.':'시간과 예산에 맞는 다른 장소를 찾지 못했어요. 조건을 바꿔 다시 시도해 주세요.'},{status:404});
 }catch{return Response.json({error:'다른 식당을 찾지 못했어요. 잠시 후 다시 시도해 주세요.'},{status:503});}
}
