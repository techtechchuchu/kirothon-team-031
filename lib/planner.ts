export type Place = { id: string; name: string; lat: number; lng: number; category: string; cost: number; duration: number; url: string; address?: string; cuisine?: string; indoor: boolean; source?: 'kakao'|'osm'|'sample'; sourceCategory?: string; phone?: string; priceBasis?: 'category_estimate'; verified?: { note: string } };
export type Preferences = { region: string; lat: number; lng: number; companion: string; people: number; start: string; end: string; budget: number; transport: string; activities: string[]; food: string; indoor: boolean; request: string; excluded?: string[] };
export type Stop = Place & { arrival: string; departure: string; travel: number; reason: string };
export type Course = { id: string; title: string; subtitle: string; stops: Stop[]; total: number; minutes: number; preferences?: Preferences };
export const categories: Record<string, { cost: number; duration: number }> = { '식사': {cost:14000,duration:60}, '카페': {cost:6500,duration:45}, '산책': {cost:0,duration:40}, '문화': {cost:10000,duration:60}, '놀거리': {cost:15000,duration:60} };
export function distance(a: {lat:number;lng:number},b:{lat:number;lng:number}) {const r=Math.PI/180;const h=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
export function travel(a:{lat:number;lng:number},b:{lat:number;lng:number},mode:string){return Math.ceil(distance(a,b)*1.4/(mode==='도보'?75:mode==='자동차'?400:220))+(mode==='도보'?0:5);}
export function minutes(t:string){const [h,m]=t.split(':').map(Number);return h*60+m;}
export function time(n:number){return `${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}

// 식사 시작 가능 시간대(분). 한국 식사 관행에 맞춘 기본값이며 행사 규정이나 통계 근거는 아니다.
export const MEAL_WINDOWS=[{name:'점심',start:11*60+30,end:14*60},{name:'저녁',start:17*60+30,end:20*60+30}] as const;
/** 시간대 시작 전에 도착했을 때 기다릴 수 있는 최대 시간(분). */
export const MAX_MEAL_WAIT=40;
/** 분식·국수처럼 가벼운 식사는 시간대와 관계없이 허용한다. 추정 금액 1만 원 이하 또는 업종 이름으로 판단한다. */
export function isLightMeal(p:Place){return p.category==='식사'&&(p.cost<=10000||/분식|김밥|국수|라면|샌드위치|토스트|만두/.test(p.name+' '+(p.sourceCategory||'')));}
const mealSlot=(minute:number)=>{const m=minute%1440;return MEAL_WINDOWS.findIndex(w=>m>=w.start&&m<=w.end);};
/** 식사를 시작할 수 있는 시각을 돌려준다. 시간대가 맞지 않으면 null. */
function mealStart(arrival:number,p:Place):number|null{
 if(isLightMeal(p))return arrival;
 const m=arrival%1440,base=arrival-m;
 for(const w of MEAL_WINDOWS){if(m>=w.start&&m<=w.end)return arrival;if(m<w.start&&w.start-m<=MAX_MEAL_WAIT)return base+w.start;}
 return null;
}
/** 이용 시간 안에 식사 시간대가 한 번이라도 들어가면 식사가 필요한 코스로 본다. */
export function mealRequired(prefs:Preferences):boolean{
 if(prefs.excluded?.includes('식사')||(prefs.activities.length>0&&!prefs.activities.includes('식사')))return false;
 const begin=minutes(prefs.start);let end=minutes(prefs.end);if(end<=begin)end+=1440;
 return [0,1440].some(offset=>MEAL_WINDOWS.some(w=>{const s=Math.max(begin,w.start+offset);return s<=w.end+offset&&s+categories['식사'].duration<=end;}));
}
/** 받은 순서 그대로 일정을 만든다. 순서를 바꾸지 않는다(장소 바꾸기에서 순서 유지를 위해). */
export function schedule(places:Place[],prefs:Preferences,title:string,subtitle:string,id:string):Course {
 let now=minutes(prefs.start), deadline=minutes(prefs.end); if(deadline<=now)deadline+=1440;
 const begin=now;let last={lat:prefs.lat,lng:prefs.lng},total=0;const stops:Stop[]=[];const used=new Set<string>();
 const multiCafe=/카페[ ]*(투어|여러|2곳|3곳)/.test(prefs.request);
 for(const p of places){
  if(used.has(p.id)||prefs.excluded?.includes(p.category)||(prefs.activities.length>0&&!prefs.activities.includes(p.category))||(prefs.indoor&&!p.indoor))continue;
  if(p.category==='카페'&&stops.some(s=>s.category==='카페')&&!multiCafe)continue;
  if(p.category==='산책'&&stops.some(s=>s.category==='산책'))continue;
  const walk=travel(last,p,prefs.transport);
  let arrival=now+walk;
  if(p.category==='식사'){
   const meals=stops.filter(s=>s.category==='식사');
   const start=mealStart(arrival,p);
   // 식사는 최대 2번, 같은 시간대(또는 시간대 밖)에는 한 번만 넣는다.
   if(start===null||meals.length>=2||meals.some(s=>mealSlot(minutes(s.arrival))===mealSlot(start)))continue;
   arrival=start;
  }
  if(arrival+p.duration>deadline||total+p.cost>prefs.budget)continue;
  now=arrival;
  stops.push({...p,arrival:time(now),departure:time(now+p.duration),travel:walk,reason:`${p.category} 시간을 넣어 여유 있게 즐겨요.`});
  now+=p.duration;total+=p.cost;last=p;used.add(p.id);
 }
 return {id,title,subtitle,stops,total,minutes:now-begin,preferences:prefs};
}
function permutations<T>(items:T[]):T[][]{
 if(items.length<=1)return [items];
 return items.flatMap((item,i)=>permutations([...items.slice(0,i),...items.slice(i+1)]).map(rest=>[item,...rest]));
}
/**
 * 고른 장소들의 방문 순서를 정한다. 가능한 순서를 모두 일정으로 만들어 보고,
 * 더 많은 장소가 들어가고, 식사가 시간대 안에 있고, 식사가 카페보다 앞이고, 이동이 짧은 순서를 고른다.
 * 점수가 같으면 입력 순서를 유지한다.
 */
export function arrange(places:Place[],prefs:Preferences,title:string,subtitle:string,id:string):Course{
 const unique=places.filter((p,i)=>places.findIndex(q=>q.id===p.id)===i);
 if(unique.length<2||unique.length>6)return schedule(unique,prefs,title,subtitle,id);
 const needMeal=mealRequired(prefs);let best:Course|null=null,bestScore=-Infinity;
 for(const order of permutations(unique)){
  const course=schedule(order,prefs,title,subtitle,id);
  const meal=course.stops.findIndex(s=>s.category==='식사'),cafe=course.stops.findIndex(s=>s.category==='카페');
  const walking=course.stops.reduce((sum,s)=>sum+s.travel,0);
  const score=course.stops.length*10000+(needMeal&&meal>=0?5000:0)+(meal>=0&&cafe>=0&&meal<cafe?300:0)-course.minutes-walking;
  if(score>bestScore){best=course;bestScore=score;}
 }
 return best!;
}
/** 식사 시간대가 포함된 코스에 식사가 없으면, 후보 중에서 들어갈 수 있는 식당을 넣어 본다. 못 넣으면 그대로 돌려준다. */
export function ensureMeal(course:Course,candidates:Place[],prefs:Preferences):Course{
 if(!course.stops.length||!mealRequired(prefs)||course.stops.some(s=>s.category==='식사'))return course;
 const used=new Set(course.stops.map(s=>s.id));
 const center={lat:course.stops.reduce((a,s)=>a+s.lat,0)/course.stops.length,lng:course.stops.reduce((a,s)=>a+s.lng,0)/course.stops.length};
 const pool=candidates.filter(p=>p.category==='식사'&&!used.has(p.id)).sort((a,b)=>distance(center,a)-distance(center,b)).slice(0,20);
 for(const meal of pool){
  const trial=arrange([...course.stops,meal],prefs,course.title,course.subtitle,course.id);
  if(trial.stops.length===course.stops.length+1&&trial.stops.some(s=>s.id===meal.id))return trial;
 }
 return course;
}
export function propose(places:Place[],prefs:Preferences):Course[]{
 const themes=[{title:'맛있는 하루',subtitle:'밥부터 커피까지, 취향을 채우는 시간',order:['식사','카페','산책','문화','놀거리']},{title:'조금 색다르게',subtitle:'평소와 다른 경험이 필요한 날',order:['놀거리','문화','식사','카페','산책']},{title:'느긋한 나들이',subtitle:'커피 한 잔과 천천히 걷는 오후',order:['카페','산책','식사','문화','놀거리']}];
 return themes.map((theme,index)=>{let last={lat:prefs.lat,lng:prefs.lng};const selected:Place[]=[];const order=prefs.activities.length?prefs.activities:theme.order.slice(0,3);for(const cat of order){const pool=places.filter(p=>p.category===cat&&(!prefs.indoor||p.indoor)).sort((a,b)=>distance(last,a)-distance(last,b));if(pool.length){const p=pool[Math.min(index,pool.length-1)];selected.push(p);last=p;}}return arrange(selected,prefs,theme.title,theme.subtitle,`course-${index}`);}).filter(c=>c.stops.length>0);
}
export function samplePlaces():Place[]{return Array.from({length:15},(_,i)=>{const category=Object.keys(categories)[Math.floor(i/3)];const d=categories[category];return{id:`sample-${i}`,name:`${['한식 식당','브런치 식당','작은 식당','디저트 카페','로스터리 카페','동네 카페','강변 산책','공원 산책','골목 산책','작은 전시','문화 공간','갤러리','보드게임','볼링','체험 공방'][i]} 예시`,lat:37.5445+Math.sin(i*2)*.004,lng:127.0557+Math.cos(i*2)*.004,category,...d,indoor:category!=='산책',url:'https://www.openstreetmap.org/#map=16/37.5445/127.0557'};});}
