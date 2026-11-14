import {test} from 'node:test';
import assert from 'node:assert/strict';
import {joinPath,legMinutes,parseKakaoCar,parseTmapPedestrian,slicePath,straightLeg,validPoint} from '../lib/route-plan.ts';

// 아래 응답은 공식 문서의 응답 형식을 본뜬 시험용 데이터다. 실제 API 응답이 아니다.
test('TMAP pedestrian GeoJSON becomes a lat/lng path with total time', ()=>{
 const body={type:'FeatureCollection',features:[
  {type:'Feature',geometry:{type:'Point',coordinates:[127.0557,37.5445]},properties:{totalDistance:420,totalTime:360}},
  {type:'Feature',geometry:{type:'LineString',coordinates:[[127.0557,37.5445],[127.0560,37.5448]]},properties:{}},
  {type:'Feature',geometry:{type:'LineString',coordinates:[[127.0560,37.5448],[127.0565,37.5450]]},properties:{}},
 ]};
 const leg=parseTmapPedestrian(body)!;
 assert.equal(leg.source,'tmap-pedestrian');
 assert.deepEqual(leg.path,[[37.5445,127.0557],[37.5448,127.0560],[37.5450,127.0565]],'경도·위도 순서를 위도·경도로 바꾸고 이어지는 점 중복 제거');
 assert.equal(leg.duration,360);
 assert.equal(leg.distance,420);
 assert.equal(legMinutes(leg),6);
 assert.equal(parseTmapPedestrian({features:[]}),null);
 assert.equal(parseTmapPedestrian({error:'x'}),null);
});

test('Kakao Mobility car directions become a path; failures are rejected', ()=>{
 const ok={routes:[{result_code:0,summary:{duration:300,distance:1500},sections:[{roads:[{vertexes:[127.0,37.5,127.001,37.501]},{vertexes:[127.001,37.501,127.002,37.502]}]}]}]};
 const leg=parseKakaoCar(ok)!;
 assert.equal(leg.source,'kakao-car');
 assert.deepEqual(leg.path,[[37.5,127.0],[37.501,127.001],[37.502,127.002]]);
 assert.equal(leg.duration,300);
 assert.equal(parseKakaoCar({routes:[{result_code:104,result_message:'출발지와 도착지가 너무 가까움'}]}),null);
 assert.equal(parseKakaoCar({}),null);
});

test('straight legs carry no duration and are labelled by source', ()=>{
 const leg=straightLeg({lat:37.5,lng:127},{lat:37.51,lng:127.01});
 assert.equal(leg.source,'straight');
 assert.equal(leg.duration,null);
 assert.equal(legMinutes(leg),null);
});

test('joinPath and slicePath support the drawing animation', ()=>{
 const a=straightLeg({lat:0+37,lng:127},{lat:37,lng:127.002});
 const b=straightLeg({lat:37,lng:127.002},{lat:37,lng:127.004});
 const path=joinPath([a,b]);
 assert.equal(path.length,3,'이어지는 점은 하나로 합친다');
 assert.deepEqual(slicePath(path,0),[path[0]]);
 assert.deepEqual(slicePath(path,1),path);
 const half=slicePath(path,0.5);
 assert.equal(half.length,2);
 assert.ok(Math.abs(half[1][1]-127.002)<1e-9,'절반 지점은 두 번째 점');
 const quarter=slicePath(path,0.25);
 assert.ok(Math.abs(quarter.at(-1)![1]-127.001)<1e-9);
});

test('route request points are validated to Korea coordinates', ()=>{
 assert.equal(validPoint({lat:37.5,lng:127}),true);
 assert.equal(validPoint({lat:40.5,lng:127}),false);
 assert.equal(validPoint({lat:'37',lng:127}),false);
 assert.equal(validPoint(null),false);
});
