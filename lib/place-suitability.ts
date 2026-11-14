import type {Place,Preferences} from './planner.ts';

export const chainCafe=/스타벅스|컴포즈|메가커피|메가MGC|메가엠지씨|빽다방|이디야|투썸플레이스|할리스|더벤티|매머드|요거프레소|커피빈|엔제리너스|폴바셋|파스쿠찌|커피베이/i;
export const fastFood=/패스트푸드|맥도날드|버거킹|롯데리아|맘스터치|KFC|서브웨이|파파이스|노브랜드버거|프랭크버거/i;
export const wantsChain=(request:string)=>/프랜차이즈|프차|스타벅스|컴포즈|이디야|메가커피|빽다방/.test(request);
export const wantsFastFood=(p:Pick<Preferences,'food'|'request'>)=>p.food==='패스트푸드'||/패스트푸드|햄버거|버거|맥도날드|롯데리아|맘스터치/.test(p.request);
const expensivePattern=/횟집|생선회|회센터|참치|오마카세|대게|킹크랩|장어구이|한우|스테이크/;
const isExpensiveMeal=(text:string)=>expensivePattern.test(text.replace(/참치\s*김밥/g,'김밥'));
// 후보가 이만큼 있으면 프랜차이즈·패스트푸드를 뒤로 미룬다. 부족하면 남긴다.
export const ENOUGH_ALTERNATIVES=3;
const label=(place:Place)=>place.name+' '+(place.sourceCategory||'');
export const isChainCafe=(place:Place)=>place.category==='카페'&&chainCafe.test(label(place));
export const isFastFood=(place:Place)=>place.category==='식사'&&fastFood.test(label(place));

export function suitablePlace(place:Place,prefs:Preferences):boolean{
 const text=[place.name,place.sourceCategory||''].join(' ');
 const all=text+' '+(place.address||'');
 // 온라인 판매·통신판매 사업자는 방문할 수 있는 매장이 아니다. 상호에 '몰'이 있어도 제외한다.
 if(/통신판매|인터넷\s*쇼핑몰|온라인/.test(place.sourceCategory||''))return false;
 if(/배달\s*전문|포장\s*전문|배달[·및\s]*포장|유흥주점|단란주점|룸싸롱|노래주점|성인주점/.test(text))return false;
 if(place.category==='식사'){
  if(/술집|호프,요리주점|바,칵테일|포장마차/.test(place.sourceCategory||''))return false;
  // 카카오는 베이커리·간식점도 음식점 그룹으로 분류한다. 식사 자리에는 넣지 않는다.
  if(/간식|제과|베이커리|디저트|아이스크림|도넛|와플|빙수/.test(place.sourceCategory||''))return false;
  if(/분식|김밥|떡볶이/.test(text)&&/(역사\s*내|지하철역\s*내|역내\s*매장|역구내|역사\s*안)/.test(all))return false;
 }
 if(place.category==='산책'&&/어린이|키즈|플레이파크|놀이터|놀이공원/.test(text))return false;
 if(place.category==='카페'&&/무인\s*카페/.test(text)&&!/무인(?:\s*카페)?\s*(?:추천|찾|원|가고|좋)/.test(prefs.request))return false;
 return true;
}

/** 업종별 계획용 추정 금액. 실제 메뉴 가격이 아니다. */
export function estimateCost(place:Place):number{
 if(place.category!=='식사')return place.cost;
 const text=label(place);
 return isExpensiveMeal(text)?35000:/고기|삼겹살|갈비|초밥|스시|장어/.test(text)?22000:/국밥|분식|김밥|국수|라면|패스트푸드|햄버거/.test(text)?10000:15000;
}

/**
 * 코스 생성과 '장소 바꾸기'가 함께 쓰는 후보 정리 규칙.
 * - 부적합 업종은 항상 제외
 * - 프랜차이즈 카페·패스트푸드는 사용자가 원하지 않고 대체 후보가 충분할 때만 제외
 * - 예산이 적을 때 고가 업종 제외
 */
export function refineCandidates(candidates:Place[],prefs:Preferences):Place[]{
 const priced=candidates.map(place=>place.category==='식사'?{...place,cost:estimateCost(place)}:place).filter(place=>suitablePlace(place,prefs));
 const independentCafes=priced.filter(place=>place.category==='카페'&&!isChainCafe(place)).length;
 const regularMeals=priced.filter(place=>place.category==='식사'&&!isFastFood(place)).length;
 const dropChains=!wantsChain(prefs.request)&&independentCafes>=ENOUGH_ALTERNATIVES;
 const dropFast=!wantsFastFood(prefs)&&regularMeals>=ENOUGH_ALTERNATIVES;
 return priced.filter(place=>{
  if(dropChains&&isChainCafe(place))return false;
  if(dropFast&&isFastFood(place))return false;
  if(prefs.budget<=20000&&place.category==='식사'&&isExpensiveMeal(label(place)))return false;
  return true;
 });
}
