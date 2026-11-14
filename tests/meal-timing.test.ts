import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arrange,categories,ensureMeal,mealRequired,minutes,schedule,type Place,type Preferences} from '../lib/planner.ts';

// 아래 장소는 시험용 가짜 데이터다. 실제 카카오 검색 결과가 아니다.
const base:Preferences={region:'서울 성수동',lat:37.5445,lng:127.0557,companion:'친구와',people:3,start:'18:00',end:'21:00',budget:30000,transport:'도보',activities:[],food:'상관없어요',indoor:false,request:''};
let n=0;
const mk=(name:string,category:string,sourceCategory:string,dLat=0,cost?:number):Place=>({id:`t/${++n}`,name,category,sourceCategory,lat:base.lat+dLat,lng:base.lng,...categories[category],...(cost===undefined?{}:{cost}),indoor:category!=='산책',url:'https://example.test',address:'서울 성동구 성수동',source:'kakao',priceBasis:'category_estimate'});
const cafe=(d=0.0005)=>mk('시험 카페','카페','음식점 > 카페',d);
const heavyMeal=(d=0.0005)=>mk('시험 고기집','식사','음식점 > 한식 > 육류,고기',d,22000);
const lightMeal=(d=0.0005)=>mk('시험 분식','식사','음식점 > 분식',d,10000);
const afternoon:Preferences={...base,start:'14:00',end:'19:00'};

test('a full meal cannot start in the mid-afternoon gap, but a light meal can',()=>{
 const afterCafe=schedule([cafe(),heavyMeal(0.001)],afternoon,'t','','a');
 assert.deepEqual(afterCafe.stops.map(s=>s.category),['카페'],'14:50경 고기집은 넣지 않는다');
 const light=schedule([cafe(),lightMeal(0.001)],afternoon,'t','','b');
 assert.deepEqual(light.stops.map(s=>s.category),['카페','식사'],'가벼운 식사는 허용');
});

test('a full meal waits for its window only briefly',()=>{
 const course=schedule([heavyMeal(0.0001)],{...base,start:'17:00',end:'21:00'},'t','','c');
 assert.equal(course.stops[0].arrival,'17:30');
 const tooEarly=schedule([heavyMeal(0.0001)],{...base,start:'15:00',end:'21:00'},'t','','d');
 assert.equal(tooEarly.stops.length,0,'대기 40분을 넘으면 넣지 않는다');
});

test('only one meal per time window',()=>{
 const course=schedule([heavyMeal(0.0003),heavyMeal(0.0006)],base,'t','','e');
 assert.equal(course.stops.filter(s=>s.category==='식사').length,1);
});

test('arrange puts the meal before the cafe when the evening window is included',()=>{
 const course=arrange([cafe(0.0005),heavyMeal(0.001)],base,'t','','f');
 const cats=course.stops.map(s=>s.category);
 assert.deepEqual(cats,['식사','카페']);
 assert.ok(minutes(course.stops[0].arrival)>=17*60+30&&minutes(course.stops[0].arrival)<=20*60+30);
});

test('mealRequired follows the time window',()=>{
 assert.equal(mealRequired(base),true,'18~21시');
 assert.equal(mealRequired(afternoon),true,'14~19시는 저녁 시간대가 들어간다');
 assert.equal(mealRequired({...base,start:'15:00',end:'17:00'}),false,'15~17시는 강제하지 않는다');
 assert.equal(mealRequired({...base,activities:['카페','산책']}),false,'식사를 고르지 않으면 필요 없다');
});

test('ensureMeal adds a dinner when the course has none, within budget and end time',()=>{
 const start=schedule([mk('시험 공원','산책','여행 > 공원',0.0003),cafe(0.0006)],base,'t','','g');
 assert.ok(!start.stops.some(s=>s.category==='식사'));
 const fixed=ensureMeal(start,[heavyMeal(0.0009)],base);
 const meal=fixed.stops.find(s=>s.category==='식사');
 assert.ok(meal,'식사가 들어가야 한다');
 assert.ok(minutes(meal!.arrival)>=17*60+30&&minutes(meal!.arrival)<=20*60+30);
 assert.ok(fixed.total<=base.budget);
 assert.ok(minutes(fixed.stops.at(-1)!.departure)<=minutes(base.end));
 assert.equal(fixed.stops.length,start.stops.length+1,'기존 장소는 유지');
});

test('ensureMeal leaves the course alone when no meal window fits or no candidate works',()=>{
 const noWindow={...base,start:'15:00',end:'17:00'};
 const c=schedule([cafe()],noWindow,'t','','h');
 assert.equal(ensureMeal(c,[heavyMeal()],noWindow),c);
 const dinner=schedule([cafe()],base,'t','','i');
 assert.equal(ensureMeal(dinner,[],base),dinner);
 const tight=schedule([cafe()],{...base,budget:6500},'t','','j');
 assert.equal(ensureMeal(tight,[heavyMeal()],{...base,budget:6500}),tight,'예산을 넘으면 넣지 않는다');
});
