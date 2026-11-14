import {test} from 'node:test';
import assert from 'node:assert/strict';
import {refineCandidates,estimateCost} from '../lib/place-suitability.ts';
import {replaceStop} from '../lib/replace-stop.ts';
import {categories,minutes,schedule,type Place,type Preferences} from '../lib/planner.ts';

// 아래 장소는 시험용 가짜 데이터다. 실제 카카오 검색 결과가 아니다.
const base:Preferences={region:'서울 성수동',lat:37.5445,lng:127.0557,companion:'친구와',people:3,start:'18:00',end:'21:00',budget:30000,transport:'도보',activities:[],food:'상관없어요',indoor:false,request:''};
let n=0;
const mk=(name:string,category:string,sourceCategory:string,dLat=0,dLng=0):Place=>({id:`kakao/${++n}`,name,category,sourceCategory,lat:base.lat+dLat,lng:base.lng+dLng,...categories[category],indoor:category!=='산책',url:'https://example.test',address:'서울 성동구 성수동',source:'kakao',priceBasis:'category_estimate'});
const cafe=(name:string,d=0)=>mk(name,'카페','음식점 > 카페 > 커피전문점',d,0);
const meal=(name:string,cat='음식점 > 한식',d=0)=>mk(name,'식사',cat,d,0);

test('independent cafes are preferred over chains only when enough independents exist',()=>{
 const chain=cafe('스타벅스 성수점');
 const few=[chain,cafe('로컬 카페 A'),cafe('로컬 카페 B')];
 assert.ok(refineCandidates(few,base).some(p=>p.name==='스타벅스 성수점'),'독립 카페가 부족하면 프랜차이즈를 남긴다');
 const enough=[chain,cafe('로컬 카페 A'),cafe('로컬 카페 B'),cafe('로컬 카페 C')];
 assert.ok(!refineCandidates(enough,base).some(p=>p.name==='스타벅스 성수점'),'독립 카페가 충분하면 프랜차이즈를 뒤로 미룬다');
 assert.ok(refineCandidates(enough,{...base,request:'스타벅스 가고 싶어'}).some(p=>p.name==='스타벅스 성수점'),'사용자가 원하면 남긴다');
});

test('fast food is kept when alternatives are scarce or requested',()=>{
 const burger=meal('롯데리아 성수점','음식점 > 패스트푸드 > 롯데리아');
 const few=[burger,meal('한식당 A'),meal('한식당 B')];
 assert.ok(refineCandidates(few,base).some(p=>p.name.includes('롯데리아')));
 const enough=[burger,meal('한식당 A'),meal('한식당 B'),meal('한식당 C')];
 assert.ok(!refineCandidates(enough,base).some(p=>p.name.includes('롯데리아')));
 assert.ok(refineCandidates(enough,{...base,food:'패스트푸드'}).some(p=>p.name.includes('롯데리아')));
});

test('unsuitable places are always removed, and tuna gimbap is not treated as expensive',()=>{
 const list=[meal('성수 배달전문 치킨'),meal('성수 포장전문 떡볶이'),meal('성수 호프','음식점 > 술집 > 호프,요리주점'),meal('성수역내 매장 김밥','음식점 > 분식'),meal('정상 식당')];
 assert.deepEqual(refineCandidates(list,base).map(p=>p.name),['정상 식당']);
 assert.equal(estimateCost(meal('참치김밥 전문점','음식점 > 분식')),10000);
 assert.equal(estimateCost(meal('성수 참치 오마카세')),35000);
});

test('replacing one stop keeps the others, budget and end time',()=>{
 const start=meal('한식당 A','음식점 > 한식',0.0005);
 const oldCafe=cafe('기존 카페',0.001);
 const walk=mk('서울숲 산책','산책','여행 > 공원',0.002);
 const course=schedule([start,oldCafe,walk],base,'시험','', 'c1');
 assert.equal(course.stops.length,3);
 const pool=[start,oldCafe,walk,cafe('대체 카페 1',0.0012),cafe('대체 카페 2',0.0013),cafe('대체 카페 3',0.0014),cafe('스타벅스 성수점',0.0011)];
 const updated=replaceStop(course,1,pool,base);
 assert.ok(updated,'대체 후보가 있어야 한다');
 assert.deepEqual(updated!.stops.map(s=>s.id).filter((_,i)=>i!==1),course.stops.map(s=>s.id).filter((_,i)=>i!==1),'나머지 장소와 순서 유지');
 assert.notEqual(updated!.stops[1].id,oldCafe.id);
 assert.ok(!/스타벅스/.test(updated!.stops[1].name),'독립 카페가 충분하면 프랜차이즈를 고르지 않는다');
 assert.ok(updated!.total<=base.budget);
 assert.ok(minutes(updated!.stops.at(-1)!.departure)<=minutes(base.end));
});

test('replacement is refused instead of breaking budget or end time',()=>{
 const start=meal('한식당 A','음식점 > 한식',0.0005);
 const oldCafe=cafe('기존 카페',0.001);
 const course=schedule([start,oldCafe],{...base,budget:21500},'시험','','c2');
 assert.equal(course.stops.length,2);
 const pricey={...cafe('비싼 카페',0.0012),cost:9000};
 assert.equal(replaceStop(course,1,[start,oldCafe,pricey],{...base,budget:21500}),null,'예산을 넘는 대체는 거절');
 const far=cafe('아주 먼 카페',0.2);
 assert.equal(replaceStop(course,1,[start,oldCafe,far],base),null,'종료 시간을 넘기는 대체는 거절');
});

// 2026 성수동 운영 배포 결과에서 실제로 나온 오분류 사례(이름·업종 문자열만 사용).
test('real Seongsu misclassifications: bakery as meal, kids play space as walk',()=>{
 const bakery=mk('어썸스윗 성수','식사','음식점 > 간식 > 제과,베이커리');
 const playpark=mk('성수1플레이파크','산책','여행 > 공원');
 const park=mk('성수동구두테마공원','산책','여행 > 공원 > 도시근린공원');
 const result=refineCandidates([bakery,playpark,park,meal('정상 식당')],base).map(p=>p.name);
 assert.deepEqual(result.sort(),['성수동구두테마공원','정상 식당'].sort());
});

test('a course never contains two walks',()=>{
 const course=schedule([mk('공원 A','산책','여행 > 공원',0.001),mk('공원 B','산책','여행 > 공원',0.002),cafe('카페 A',0.003)],base,'시험','','c3');
 assert.equal(course.stops.filter(s=>s.category==='산책').length,1);
 assert.equal(course.stops.length,2);
});
test('cookie bakery as dinner and online shop as play venue are both refused by the shared rules',()=>{
 const cookie=mk('그래인스쿠키','식사','음식점 > 간식 > 제과,베이커리');
 const online=mk('원스탑몰','놀거리','가정,생활 > 통신판매 > 인터넷쇼핑몰');
 const ok=mk('정상 보드게임','놀거리','가정,생활 > 여가시설 > 보드카페');
 assert.deepEqual(refineCandidates([cookie,online,ok,meal('정상 식당')],base).map(p=>p.name).sort(),['정상 보드게임','정상 식당'].sort());
});