import {test} from 'node:test';
import assert from 'node:assert/strict';
import {convertKakaoDocument} from '../lib/kakao-place-search.ts';
import {reviewLinks} from '../lib/review-links.ts';
const center={lat:37.5445,lng:127.0557};
const doc={id:'123',place_name:'검증용 식당',category_name:'음식점 > 한식',category_group_code:'FD6',address_name:'서울 성동구 성수동',road_address_name:'서울 성동구 왕십리로',phone:'02-123-4567',x:'127.0558',y:'37.5446',place_url:'https://place.map.kakao.com/123'};
test('preserves Kakao identity and labels category prices as estimates',()=>{const p=convertKakaoDocument(doc,'식사',center)!;assert.equal(p.source,'kakao');assert.equal(p.phone,doc.phone);assert.equal(p.priceBasis,'category_estimate');assert.equal(p.url,'https://place.map.kakao.com/123');});
test('rejects distant or misclassified keyword matches',()=>{assert.equal(convertKakaoDocument({...doc,x:'129.334',y:'35.539'},'식사',center),null);assert.equal(convertKakaoDocument(doc,'산책',center),null);assert.equal(convertKakaoDocument(doc,'카페',center),null);});
test('uses an exact Kakao detail page for review verification links',()=>{const p=convertKakaoDocument(doc,'식사',center)!;const links=reviewLinks(p);assert.equal(links.kakao,p.url);assert.ok(links.instagram.startsWith('https://www.instagram.com/explore/tags/'));assert.ok(!decodeURIComponent(links.blog).includes(p.address!));});

test('excludes bars from meal recommendations',()=>{assert.equal(convertKakaoDocument({...doc,category_name:'음식점 > 술집 > 호프,요리주점'},'식사',center),null);});

test('filters small parks and park facilities from walking candidates',()=>{const park={...doc,category_name:'여행 > 공원',place_name:'삼산어린이공원'};assert.equal(convertKakaoDocument(park,'산책',center),null);assert.equal(convertKakaoDocument({...park,place_name:'울산대공원 주차장'},'산책',center),null);assert.ok(convertKakaoDocument({...park,place_name:'울산대공원'},'산책',center));});

// 운영 화면에서 실제로 추천된 사례(상호·업종 문자열만 사용).
test('rejects online shopping businesses as play venues, keeps real shopping malls',()=>{
 const online={...doc,place_name:'원스탑몰',category_name:'가정,생활 > 통신판매 > 인터넷쇼핑몰',phone:'010-0000-0000'};
 assert.equal(convertKakaoDocument(online,'놀거리',center),null);
 assert.equal(convertKakaoDocument({...online,place_name:'일지인센스',phone:'02-732-2666'},'놀거리',center),null);
 // 운영 화면에서 나온 상가(고려쇼핑몰: 가정,생활 > 복합쇼핑몰)는 기본 후보에서 제외한다.
 assert.equal(convertKakaoDocument({...doc,place_name:'고려쇼핑몰',category_name:'가정,생활 > 복합쇼핑몰'},'놀거리',center),null);
 // 백화점·방탈출·볼링 같은 놀거리 업종은 그대로 통과한다.
 assert.ok(convertKakaoDocument({...doc,place_name:'시험 방탈출',category_name:'가정,생활 > 여가시설 > 방탈출카페'},'놀거리',center));
 assert.ok(convertKakaoDocument({...doc,place_name:'시험 백화점',category_name:'쇼핑,유통 > 백화점'},'놀거리',center));
});