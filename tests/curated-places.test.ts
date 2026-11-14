import {test} from 'node:test';
import assert from 'node:assert/strict';
import {curatedFor,withCurated,type CuratedPlace} from '../lib/curated-places.ts';
import {refineCandidates,suitablePlace} from '../lib/place-suitability.ts';
import {categories,samplePlaces,type Place,type Preferences} from '../lib/planner.ts';

// 아래 장소와 확인 문구는 시험용 가짜 데이터다. 실제로 확인된 장소가 아니다.
const base:Preferences={region:'서울 성수동',lat:37.5445,lng:127.0557,companion:'친구와',people:3,start:'14:00',end:'19:00',budget:30000,transport:'도보',activities:[],food:'상관없어요',indoor:false,request:''};
const entry:CuratedPlace={kakaoId:'900001',name:'시험 소품샵',lat:37.5450,lng:127.0560,category:'놀거리',address:'서울 성동구 시험로 1',note:'시험용 확인 문구',cost:0,duration:40};
const mall:Place={id:'kakao/42',name:'고려쇼핑몰',lat:37.5446,lng:127.0558,category:'놀거리',...categories['놀거리'],indoor:true,url:'https://example.test',source:'kakao',sourceCategory:'가정,생활 > 복합쇼핑몰',address:'서울 종로구 시험'};

test('shopping complexes are excluded from play candidates unless the team verified them',()=>{
 assert.equal(suitablePlace(mall,base),false);
 assert.equal(suitablePlace({...mall,verified:{note:'시험용'}},base),true);
 assert.ok(!refineCandidates([mall],base).some(p=>p.name==='고려쇼핑몰'));
});

test('curated places carry their note, estimate-only price basis and overridden cost',()=>{
 const [p]=curatedFor(base,[entry]);
 assert.equal(p.id,'kakao/900001');
 assert.equal(p.verified?.note,'시험용 확인 문구');
 assert.equal(p.cost,0);
 assert.equal(p.duration,40);
 assert.equal(p.priceBasis,'category_estimate');
 assert.equal(p.url,'https://place.map.kakao.com/900001');
});

test('curated places outside the radius or with bad data are ignored',()=>{
 assert.equal(curatedFor(base,[{...entry,lat:37.60}]).length,0,'3km 밖');
 assert.equal(curatedFor(base,[{...entry,kakaoId:'abc'}]).length,0,'숫자 id가 아님');
 assert.equal(curatedFor(base,[{...entry,category:'없는업종'}]).length,0,'알 수 없는 카테고리');
});

test('withCurated merges, replaces same id, and leaves demo samples alone',()=>{
 const merged=withCurated([mall],base,[entry]);
 assert.deepEqual(merged.map(p=>p.name).sort(),['고려쇼핑몰','시험 소품샵'].sort());
 const dup=withCurated([{...mall,id:'kakao/900001',name:'중복'}],base,[entry]);
 assert.equal(dup.length,1);
 assert.equal(dup[0].verified?.note,'시험용 확인 문구');
 const samples=samplePlaces();
 assert.equal(withCurated(samples,base,[entry]).length,samples.length);
});
