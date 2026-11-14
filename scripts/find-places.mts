// 확인된 장소 목록(lib/curated-places.ts)에 넣을 후보를 카카오 키워드 검색으로 찾는다.
// 이 스크립트는 후보를 보여 줄 뿐 검증하지 않는다. 방문하거나 상세 페이지로 직접 확인한 곳만 목록에 넣는다.
// 사용:
//   $env:KAKAO_REST_API_KEY = Read-Host "카카오 REST API 키"   (키는 이 셸에만 두고 파일에 저장하지 않는다)
//   node --experimental-strip-types scripts/find-places.mts 소품샵 [위도] [경도]
// 위도·경도를 생략하면 서울 성수동(37.5445, 127.0557) 기준이다.
const key=process.env.KAKAO_REST_API_KEY;
const [query,latArg,lngArg]=process.argv.slice(2);
if(!key){console.error('KAKAO_REST_API_KEY가 설정되지 않았어요.');process.exit(2);}
if(!query){console.error('검색어를 입력해 주세요. 예: 소품샵');process.exit(2);}
const lat=latArg?Number(latArg):37.5445,lng=lngArg?Number(lngArg):127.0557;
if(!Number.isFinite(lat)||!Number.isFinite(lng)){console.error('위도·경도가 올바르지 않아요.');process.exit(2);}
type Doc={id:string;place_name:string;category_name:string;address_name:string;road_address_name:string;phone:string;x:string;y:string;place_url:string};
const rows:Doc[]=[];
for(const page of [1,2]){
 const params=new URLSearchParams({query,x:String(lng),y:String(lat),radius:'3000',size:'15',sort:'distance',page:String(page)});
 const r=await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`,{headers:{Authorization:`KakaoAK ${key}`},signal:AbortSignal.timeout(10000)});
 if(!r.ok){console.error(`카카오 검색 실패(HTTP ${r.status})`);process.exit(1);}
 rows.push(...((await r.json()) as {documents?:Doc[]}).documents||[]);
}
console.log(`'${query}' 후보 ${rows.length}곳 (확인 전 후보입니다)\n`);
for(const d of rows)console.log(`${d.id} | ${d.place_name} | ${d.category_name} | ${d.road_address_name||d.address_name} | ${d.phone||'-'} | ${d.y},${d.x}`);
console.log('\n직접 확인한 곳은 lib/curated-places.ts의 curatedPlaces에 아래 형식으로 추가하세요.');
console.log(`{kakaoId:'<id>',name:'<이름>',lat:<위도>,lng:<경도>,category:'놀거리',address:'<주소>',note:'<누가 언제 무엇을 확인했는지>',cost:0,duration:40}`);
