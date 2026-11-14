import {test} from 'node:test';
import assert from 'node:assert/strict';
import {courseSummary,crowdedPin,directionsUrl,shortSegment} from '../lib/route-links.ts';
import {categories,schedule,type Place,type Preferences} from '../lib/planner.ts';

// 시험용 가짜 장소다.
const prefs:Preferences={region:'서울 홍대',lat:37.5563,lng:126.9236,companion:'친구와',people:3,start:'18:00',end:'21:00',budget:30000,transport:'도보',activities:[],food:'상관없어요',indoor:false,request:''};
const mk=(id:string,name:string,category:string,dLat:number):Place=>({id,name,category,lat:prefs.lat+dLat,lng:prefs.lng,...categories[category],indoor:true,url:'https://example.test'});

test('directions url follows the Kakao Maps link pattern and escapes separators',()=>{
 const url=directionsUrl({name:'카페, A/B',lat:37.5,lng:127},{name:'식당',lat:37.6,lng:127.1},'도보');
 assert.equal(url,`https://map.kakao.com/link/by/walk/${encodeURIComponent('카페 A B')},37.5,127/${encodeURIComponent('식당')},37.6,127.1`);
 assert.ok(directionsUrl({name:'a',lat:1,lng:2},{name:'b',lat:3,lng:4},'대중교통').includes('/link/by/traffic/'));
 assert.ok(directionsUrl({name:'a',lat:1,lng:2},{name:'b',lat:3,lng:4},'자동차').includes('/link/by/car/'));
});

test('course summary adds up estimated travel and keeps start/end times',()=>{
 const course=schedule([mk('a','식당','식사',0.001),mk('b','카페','카페',0.004)],prefs,'t','','c');
 const s=courseSummary(course)!;
 assert.equal(s.count,2);
 assert.equal(s.start,course.stops[0].arrival);
 assert.equal(s.end,course.stops[1].departure);
 assert.equal(s.travel,course.stops[0].travel+course.stops[1].travel);
 assert.equal(s.total,course.total);
 assert.equal(courseSummary({...course,stops:[]}),null);
});

test('crowded pins and short segments are detected',()=>{
 const course=schedule([mk('a','식당','식사',0),mk('b','카페','카페',0.0003),mk('c','공원','산책',0.006)],prefs,'t','','c');
 assert.equal(course.stops.length,3);
 assert.equal(crowdedPin(course.stops,0),false);
 assert.equal(crowdedPin(course.stops,1),true,'약 33m 떨어진 핀');
 assert.equal(crowdedPin(course.stops,2),false);
 assert.equal(shortSegment(course.stops,1),true);
 assert.equal(shortSegment(course.stops,2),false);
});
