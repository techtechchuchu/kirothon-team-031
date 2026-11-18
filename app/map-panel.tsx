'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {useTheme} from 'next-themes';
import type {Course,Stop} from '../lib/planner';
import {distance} from '../lib/planner';
import {ROUTE_LABEL,joinPath,legMinutes,slicePath,type LatLng,type RoutePlan} from '../lib/route-plan';
import type {MapMesh} from '../lib/buildings';
import 'leaflet/dist/leaflet.css';

// 카카오맵 JavaScript 키. 브라우저에 노출되는 키이므로 카카오디벨로퍼스에서 사이트 도메인을 등록해 사용을 제한한다.
// 장소 검색용 REST 키(KAKAO_REST_API_KEY)를 여기에 넣지 않는다.
const KAKAO_JS_KEY=process.env.NEXT_PUBLIC_KAKAO_MAP_KEY||'';
export const mapProvider=KAKAO_JS_KEY?'카카오맵':'OpenStreetMap';
const CROWDED_METERS=80;
const PREVIEW_MS=2400;
// 3D 코스 지도(Unity WebGL 빌드, public/unity). 용량이 커서 '3D로 보기'를 눌렀을 때만 불러온다.
const UNITY_URL='/unity/index.html';
const MAX_3D_PATH=1200;

/** 3D 지도용 좌표: 코스 중심에서 동쪽(x)·북쪽(z)으로 떨어진 미터. */
function scene3d(origin:LatLng,stops:Stop[],path:LatLng[]){
 const all:LatLng[]=[origin,...stops.map(s=>[s.lat,s.lng] as LatLng),...path];
 const lats=all.map(p=>p[0]),lngs=all.map(p=>p[1]);
 const lat0=(Math.min(...lats)+Math.max(...lats))/2,lng0=(Math.min(...lngs)+Math.max(...lngs))/2;
 const mx=Math.cos(lat0*Math.PI/180)*111320,mz=110574;
 const xz=(p:LatLng):[number,number]=>[Math.round((p[1]-lng0)*mx*10)/10,Math.round((p[0]-lat0)*mz*10)/10];
 const step=Math.max(1,Math.ceil(path.length/MAX_3D_PATH));
 const thin=path.filter((_,i)=>i%step===0||i===path.length-1);
 // 원판 반지름은 Unity(CourseScene.Rebuild)와 같은 식으로 계산한다
 const far=Math.max(90,...all.map(p=>Math.hypot(...xz(p))));
 const radius=far+Math.min(70,Math.max(7,far*.085))*4.5;
 return {center:{lat:lat0,lng:lng0},radius,xz,thin};
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Kakao={maps:any};
declare global{interface Window{kakao?:Kakao}}
let kakaoLoading:Promise<Kakao>|null=null;
function loadKakao():Promise<Kakao>{
 if(window.kakao?.maps?.LatLng)return Promise.resolve(window.kakao);
 if(kakaoLoading)return kakaoLoading;
 kakaoLoading=new Promise<Kakao>((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_JS_KEY)}&autoload=false`;
  script.async=true;
  const timer=setTimeout(()=>reject(new Error('timeout')),10000);
  script.onload=()=>{const k=window.kakao;if(!k?.maps?.load){clearTimeout(timer);reject(new Error('sdk'));return;}k.maps.load(()=>{clearTimeout(timer);resolve(k);});};
  script.onerror=()=>{clearTimeout(timer);reject(new Error('load'));};
  document.head.appendChild(script);
 }).catch(error=>{kakaoLoading=null;throw error;});
 return kakaoLoading;
}

function useMedia(query:string){
 return useSyncExternalStore(cb=>{const m=window.matchMedia(query);m.addEventListener('change',cb);return()=>m.removeEventListener('change',cb);},()=>window.matchMedia(query).matches,()=>false);
}

/** 지도 종류(카카오/OSM)에 상관없이 쓰는 그리기 기능. */
type Adapter={
 setLine(path:LatLng[],verified:boolean):void;
 setHead(p:LatLng|null):void;
 setArrows(list:{at:LatLng;deg:number}[]):void;
 showInfo(i:number|null,content:HTMLElement|null):void;
 markSelected(i:number|null):void;
 focus(i:number,zoomIn:boolean):void;
 destroy():void;
};
type Handlers={onPin:(i:number)=>void;onBlank:()=>void};

function pinElement(n:number,name:string){
 const wrap=document.createElement('div');wrap.className='number-marker kakao-pin';wrap.title=name;
 wrap.setAttribute('role','button');wrap.setAttribute('aria-label',`${n}번 ${name}`);
 const span=document.createElement('span');span.textContent=String(n);wrap.appendChild(span);
 return wrap;
}
/** 코스가 있으면 '출발' 표시, 없으면(조건 입력 화면 미리보기) 지역 중심 표시. */
function originElement(hasStops:boolean){
 const d=document.createElement('div');
 if(hasStops){d.className='origin-marker';d.textContent='출발';}else{d.className='center-marker';d.appendChild(document.createElement('span'));}
 return d;
}
function headElement(){const img=document.createElement('img');img.src='/nawa-loading.png';img.alt='';img.className='route-head';return img;}
function arrowElement(deg:number){const d=document.createElement('div');d.className='route-arrow';d.style.transform=`rotate(${deg}deg)`;d.textContent='›';return d;}

function kakaoAdapter(k:Kakao,el:HTMLDivElement,origin:LatLng,stops:Stop[],h:Handlers):Adapter{
 const {maps}=k;const ll=(p:LatLng)=>new maps.LatLng(p[0],p[1]);
 const map=new maps.Map(el,{center:ll(origin),level:4,scrollwheel:false});
 map.addControl(new maps.ZoomControl(),maps.ControlPosition.RIGHT);
 maps.event.addListener(map,'click',h.onBlank);
 const pins:HTMLElement[]=[];
 new maps.CustomOverlay({map,position:ll(origin),content:originElement(stops.length>0),yAnchor:.5,xAnchor:.5,zIndex:1});
 const bounds=new maps.LatLngBounds();bounds.extend(ll(origin));
 stops.forEach((s,i)=>{
  const pin=pinElement(i+1,s.name);pin.addEventListener('click',e=>{e.stopPropagation();h.onPin(i);});pins.push(pin);
  new maps.CustomOverlay({map,position:ll([s.lat,s.lng]),content:pin,yAnchor:1,xAnchor:.5,clickable:true,zIndex:3});
  bounds.extend(ll([s.lat,s.lng]));
 });
 if(stops.length)map.setBounds(bounds,50,50,50,50);
 setTimeout(()=>{const c=map.getCenter();map.relayout();map.setCenter(c);},150);
 let line:any=null,head:any=null,arrows:any[]=[];
 const info=new maps.CustomOverlay({yAnchor:1,xAnchor:.5,clickable:true,zIndex:5});
 return {
  setLine(path,verified){
   const opts={path:path.map(ll),strokeWeight:verified?5:4,strokeColor:'#9856e8',strokeOpacity:verified?.85:.75,strokeStyle:verified?'solid':'shortdash'};
   if(line)line.setOptions(opts);else line=new maps.Polyline({map,zIndex:0,...opts});
  },
  setHead(p){
   if(!p){head?.setMap(null);head=null;return;}
   if(!head)head=new maps.CustomOverlay({map,content:headElement(),position:ll(p),yAnchor:.9,xAnchor:.5,zIndex:2});else head.setPosition(ll(p));
  },
  setArrows(list){arrows.forEach(a=>a.setMap(null));arrows=list.map(a=>new maps.CustomOverlay({map,position:ll(a.at),content:arrowElement(a.deg),yAnchor:.5,xAnchor:.5,zIndex:1}));},
  showInfo(i,content){if(i===null||!content){info.setMap(null);return;}info.setContent(content);info.setPosition(ll([stops[i].lat,stops[i].lng]));info.setMap(map);},
  markSelected(i){pins.forEach((p,j)=>p.classList.toggle('selected',j===i));},
  focus(i,zoomIn){const p=ll([stops[i].lat,stops[i].lng]);if(zoomIn&&map.getLevel()>2)map.setLevel(map.getLevel()-1,{anchor:p});map.panTo(p);},
  destroy(){el.innerHTML='';},
 };
}

async function leafletAdapter(el:HTMLDivElement,origin:LatLng,stops:Stop[],h:Handlers,onTileError:()=>void):Promise<Adapter>{
 const L=await import('leaflet');
 const map=L.map(el,{scrollWheelZoom:false}).setView(origin,15);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).on('tileerror',onTileError).addTo(map);
 map.on('click',h.onBlank);
 L.marker(origin,{icon:L.divIcon({className:'',html:originElement(stops.length>0),iconSize:stops.length?[40,22]:[24,24],iconAnchor:stops.length?[20,11]:[12,12]}),interactive:false}).addTo(map);
 const pins:HTMLElement[]=[];
 stops.forEach((s,i)=>{
  const pin=pinElement(i+1,s.name);pins.push(pin);
  L.marker([s.lat,s.lng],{icon:L.divIcon({className:'',html:pin,iconSize:[32,38],iconAnchor:[16,35]}),zIndexOffset:300}).on('click',()=>h.onPin(i)).addTo(map);
 });
 if(stops.length)map.fitBounds(L.latLngBounds([origin,...stops.map(s=>[s.lat,s.lng] as LatLng)]),{padding:[45,45],maxZoom:17});
 setTimeout(()=>map.invalidateSize(),150);
 let line:import('leaflet').Polyline|null=null,head:import('leaflet').Marker|null=null,arrows:import('leaflet').Marker[]=[];
 const popup=L.popup({closeButton:false,autoPan:true,offset:[0,-30],className:'pin-popup'});
 return {
  setLine(path,verified){const style={color:'#9856e8',weight:verified?5:4,opacity:verified?.85:.75,dashArray:verified?undefined:'7 9'};if(line){line.setLatLngs(path);line.setStyle(style);}else line=L.polyline(path,style).addTo(map);},
  setHead(p){if(!p){head?.remove();head=null;return;}if(!head)head=L.marker(p,{icon:L.divIcon({className:'',html:headElement(),iconSize:[24,24],iconAnchor:[12,22]}),interactive:false}).addTo(map);else head.setLatLng(p);},
  setArrows(list){arrows.forEach(a=>a.remove());arrows=list.map(a=>L.marker(a.at,{icon:L.divIcon({className:'',html:arrowElement(a.deg),iconSize:[14,14],iconAnchor:[7,7]}),interactive:false}).addTo(map));},
  showInfo(i,content){if(i===null||!content){map.closePopup(popup);return;}popup.setLatLng([stops[i].lat,stops[i].lng]).setContent(content).openOn(map);},
  markSelected(i){pins.forEach((p,j)=>p.classList.toggle('selected',j===i));},
  focus(i,zoomIn){const p:LatLng=[stops[i].lat,stops[i].lng];map.setView(p,zoomIn?Math.min(map.getZoom()+1,19):map.getZoom());},
  destroy(){map.remove();el.innerHTML='';},
 };
}

/** 화면 기준 진행 방향(도). 경도 차이는 위도에 따라 줄여서 계산한다. */
function bearing(a:LatLng,b:LatLng){return Math.atan2(-(b[0]-a[0]),(b[1]-a[1])*Math.cos(a[0]*Math.PI/180))*180/Math.PI;}

function stopInfo(s:Stop,i:number,leg:{minutes:number|null;source:string}|null,transport:string){
 const box=document.createElement('div');box.className='pin-info-card';
 const title=document.createElement('b');title.textContent=`${i+1}. ${s.name}`;
 const time=document.createElement('span');time.textContent=`${s.arrival}~${s.departure} · ${s.category} ${s.duration}분`;
 const move=document.createElement('small');
 move.textContent=leg&&leg.minutes!==null?`이전 지점에서 ${transport} ${leg.minutes}분 (${leg.source})`:`이전 지점에서 약 ${s.travel}분 (직선거리 추정)`;
 box.appendChild(title);box.appendChild(time);box.appendChild(move);
 return box;
}

function MapCanvas({lat,lng,course}:{lat:number;lng:number;course?:Course}){
 const ref=useRef<HTMLDivElement>(null);
 const adapter=useRef<Adapter|null>(null);
 const [ready,setReady]=useState(0);
 const [failed,setFailed]=useState(false);
 const [provider,setProvider]=useState<'kakao'|'osm'>(KAKAO_JS_KEY?'kakao':'osm');
 const [selected,setSelected]=useState<number|null>(null);
 const [route,setRoute]=useState<RoutePlan|null>(null);
 const [routeError,setRouteError]=useState(false);
 const [previewing,setPreviewing]=useState(false);
 const [replay,setReplay]=useState(0);
 const [view3d,setView3d]=useState(false);
 const [opened3d,setOpened3d]=useState(false);
 const [buildings,setBuildings]=useState<string|null>(null);
 const frame=useRef<HTMLIFrameElement>(null);
 const {resolvedTheme}=useTheme();
 const mobile=useMedia('(max-width:650px)');
 const reduced=useMedia('(prefers-reduced-motion: reduce)');
 const stops=course?.stops||[];
 const transport=course?.preferences?.transport||'도보';
 const origin:LatLng=[lat,lng];
 const crowded=(i:number)=>stops.some((s,j)=>j!==i&&distance(s,stops[i])<CROWDED_METERS);

 // 지도와 번호 마커. 코스가 바뀌면 부모가 key를 바꿔 새로 만든다.
 useEffect(()=>{
  const el=ref.current;if(!el)return;let cancelled=false;
  // 가까운 마커를 누르면 한 단계 확대해 고를 수 있게 한다. 좌표는 옮기지 않는다.
 const h:Handlers={onPin:i=>{adapter.current?.focus(i,crowded(i));setSelected(i);},onBlank:()=>setSelected(null)};
  const osm=()=>leafletAdapter(el,origin,stops,h,()=>setFailed(true)).then(a=>{if(cancelled){a.destroy();return;}adapter.current=a;setProvider('osm');setReady(n=>n+1);}).catch(()=>setFailed(true));
  if(KAKAO_JS_KEY)loadKakao().then(k=>{if(cancelled)return;adapter.current=kakaoAdapter(k,el,origin,stops,h);setProvider('kakao');setReady(n=>n+1);}).catch(()=>{if(!cancelled)osm();});
  else osm();
  return()=>{cancelled=true;adapter.current?.destroy();adapter.current=null;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 // 경로 요청. 실패하면 직선(방문 순서 표시)으로 둔다.
 useEffect(()=>{
  if(!stops.length)return;const ctrl=new AbortController();
  fetch('/api/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transport,points:[{lat,lng},...stops.map(s=>({lat:s.lat,lng:s.lng}))]}),signal:ctrl.signal})
   .then(r=>r.ok?r.json() as Promise<RoutePlan>:Promise.reject(new Error(String(r.status))))
   .then(plan=>setRoute(plan))
   .catch(e=>{if((e as Error).name!=='AbortError')setRouteError(true);});
  return()=>ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 const plan:RoutePlan|null=route||(routeError||!stops.length?{legs:[origin,...stops.map(s=>[s.lat,s.lng] as LatLng)].slice(1).map((p,i,arr)=>({path:[i?arr[i-1]:origin,p],source:'straight' as const,duration:null,distance:null})),verified:false,provider:null,reason:'경로 정보를 받지 못했어요.'}:null);

 // 경로 그리기와 코스 미리보기 애니메이션. 동작 줄이기 설정에서는 정적인 선만 그린다.
 useEffect(()=>{
  const a=adapter.current;if(!a||!plan||!stops.length)return;
  const full=joinPath(plan.legs);
  const arrows=plan.legs.filter(l=>l.path.length>=2).map(l=>{const m=Math.floor((l.path.length-1)/2);const p=l.path[m],q=l.path[Math.min(m+1,l.path.length-1)];return {at:[(p[0]+q[0])/2,(p[1]+q[1])/2] as LatLng,deg:bearing(p,q),len:distance({lat:l.path[0][0],lng:l.path[0][1]},{lat:l.path.at(-1)![0],lng:l.path.at(-1)![1]})};}).filter(x=>x.len>=120);
  a.setArrows([]);
  if(reduced){a.setLine(full,plan.verified);a.setHead(null);a.setArrows(arrows);return;}
  let raf=0;const start=performance.now();
  const step=(now:number)=>{
   const t=Math.min(1,(now-start)/PREVIEW_MS);const part=slicePath(full,t);
   a.setLine(part,plan.verified);a.setHead(t<1?part.at(-1)!:null);
   if(t<1)raf=requestAnimationFrame(step);else{a.setArrows(arrows);setPreviewing(false);}
  };
  raf=requestAnimationFrame(now=>{setPreviewing(true);step(now);});
  return()=>{cancelAnimationFrame(raf);a.setHead(null);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,route,routeError,replay,reduced]);

 // 설명창은 하나만. PC는 지도 위 말풍선, 모바일은 지도 아래 카드.
 useEffect(()=>{
  const a=adapter.current;if(!a)return;
  a.markSelected(selected);
  if(selected===null||mobile||!stops[selected]){a.showInfo(null,null);return;}
  const leg=plan?.legs[selected];
  a.showInfo(selected,stopInfo(stops[selected],selected,leg&&leg.source!=='straight'?{minutes:legMinutes(leg),source:ROUTE_LABEL[leg.source]}:null,transport));
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[selected,mobile,ready,route]);

 // 3D 코스 지도: 코스·선택 상태를 Unity 화면(iframe)으로 보내고, 핀 클릭을 받는다.
 const dark=resolvedTheme==='dark';
 const scene=opened3d&&plan&&stops.length?scene3d(origin,stops,joinPath(plan.legs)):null;
 const payload3d=scene&&plan?JSON.stringify({ox:scene.xz(origin)[0],oz:scene.xz(origin)[1],stops:stops.map(s=>{const [x,z]=scene.xz([s.lat,s.lng]);return {name:s.name.replace(/s+/g,' ').slice(0,40),x,z};}),path:scene.thin.flatMap(p=>scene.xz(p)),verified:plan.verified,animate:!reduced,dark}):null;
 const post3d=(message:Record<string,unknown>)=>frame.current?.contentWindow?.postMessage(message,window.location.origin);
 useEffect(()=>{
  if(!payload3d)return;
  const send=()=>{post3d({type:'nawa-course',payload:payload3d});if(buildings)post3d({type:'nawa-buildings',payload:buildings});post3d({type:'nawa-select',index:selected??-1});};
  send();
  const onMessage=(e:MessageEvent)=>{
   if(e.origin!==window.location.origin||e.source!==frame.current?.contentWindow)return;
   if(e.data?.type==='nawa-ready')send();
   if(e.data?.type==='nawa-stop-click'&&typeof e.data.index==='number')setSelected(e.data.index>=0&&e.data.index<stops.length?e.data.index:null);
  };
  window.addEventListener('message',onMessage);
  return()=>window.removeEventListener('message',onMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[payload3d,buildings]);
 useEffect(()=>{if(opened3d)post3d({type:'nawa-select',index:selected??-1});
 },[selected,opened3d]);
 // 주변 건물·도로 윤곽. 받지 못하면 건물 없이 보여준다.
 const routeKey=plan?`${plan.verified}:${plan.legs.length}`:'';
 useEffect(()=>{
  if(!opened3d||!plan||!stops.length)return;
  const s=scene3d(origin,stops,joinPath(plan.legs));
  const ctrl=new AbortController();
  fetch('/api/buildings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({center:s.center,radius:s.radius-2}),signal:ctrl.signal})
   .then(r=>r.ok?r.json() as Promise<MapMesh>:Promise.reject(new Error(String(r.status))))
   .then(mesh=>{if(mesh.t?.length||mesh.rt?.length)setBuildings(JSON.stringify(mesh));})
   .catch(()=>{});
  return()=>ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[opened3d,routeKey]);

 const totalMinutes=plan?.verified?plan.legs.reduce((sum,l)=>sum+(legMinutes(l)||0),0):null;
 const status=!stops.length?null:!plan?'경로 확인 중…':plan.verified?`${ROUTE_LABEL[plan.legs[0].source]} · 이동 합계 ${totalMinutes}분`:ROUTE_LABEL.straight;
 const sel=selected!==null?stops[selected]:null;
 const selLeg=selected!==null?plan?.legs[selected]:undefined;
 const fallbackUrl=provider==='kakao'?`https://map.kakao.com/link/map/${lat},${lng}`:`https://www.openstreetmap.org/#map=15/${lat}/${lng}`;
 return <div className="map-container">
  <div className="map-stage">
   <div ref={ref} className="leaflet-host" aria-label={provider==='kakao'?'카카오맵 지도':'OpenStreetMap 지도'}/>
   {opened3d&&<iframe ref={frame} className="map-3d" src={UNITY_URL} title="3D 코스 지도" hidden={!view3d}/>}
   {!!stops.length&&plan&&<button type="button" className={'map-3d-toggle'+(view3d?' on':'')} aria-pressed={view3d} onClick={()=>{setOpened3d(true);setView3d(v=>!v);}}>{view3d?'지도로 보기':'3D로 보기'}</button>}
  </div>
  {status&&<div className={'route-status '+(plan?.verified?'verified':'estimate')} role="status">{previewing&&!view3d&&<b>코스 미리보기</b>}{status}</div>}
  {!!stops.length&&plan&&!reduced&&(view3d||!previewing)&&<button type="button" className="route-replay" onClick={()=>view3d?post3d({type:'nawa-replay'}):setReplay(n=>n+1)}>▶ 다시 보기</button>}
  {failed&&!view3d&&<a className="map-fallback" href={fallbackUrl} target="_blank" rel="noreferrer">지도 연결 지연 · 새 창에서 보기 ↗</a>}
  {!!stops.length&&<div className="stop-picker" aria-label="장소 선택">{stops.map((s,i)=><button type="button" key={s.id} className={selected===i?'active':''} aria-pressed={selected===i} onClick={()=>{setSelected(i);if(!view3d)adapter.current?.focus(i,crowded(i));}}>{i+1}</button>)}</div>}
  {(mobile||view3d)&&sel&&<div className="stop-sheet" role="dialog" aria-label={`${selected!+1}번 장소 정보`}><button type="button" className="stop-sheet-close" aria-label="닫기" onClick={()=>setSelected(null)}>×</button><b>{selected!+1}. {sel.name}</b><span>{sel.arrival}~{sel.departure} · {sel.category} {sel.duration}분</span><small>{selLeg&&selLeg.source!=='straight'?`이전 지점에서 ${transport} ${legMinutes(selLeg)}분 (${ROUTE_LABEL[selLeg.source]})`:`이전 지점에서 약 ${sel.travel}분 (직선거리 추정)`}</small></div>}
 </div>;
}

export default function MapPanel(props:{lat:number;lng:number;course?:Course}){const {resolvedTheme}=useTheme();const [revealed,setRevealed]=useState(false);const [mounted,setMounted]=useState(false);useEffect(()=>setMounted(true),[]);useEffect(()=>setRevealed(false),[resolvedTheme]);if(!mounted)return <div className="map-theme-placeholder"/>;if(resolvedTheme==='dark'&&!revealed)return <div className="map-theme-placeholder"><b>코스 지도</b><p>지도는 원래의 밝은 색상으로 열려요.<br/>장소명과 마커를 선명하게 확인해 보세요.</p><button className="chip" onClick={()=>setRevealed(true)}>지도 펼치기</button></div>;return <div className="themed-map"><MapCanvas {...props}/>{resolvedTheme==='dark'&&<button className="map-hide chip" onClick={()=>setRevealed(false)}>지도 접기</button>}</div>;}
