'use client';
import {useEffect,useRef,useState} from 'react';
import type {Course} from '../lib/planner';
import 'leaflet/dist/leaflet.css';

// 카카오맵 JavaScript 키. 브라우저에 노출되는 키이므로 카카오디벨로퍼스에서 사이트 도메인을 등록해 사용을 제한한다.
// 장소 검색용 REST 키(KAKAO_REST_API_KEY)를 여기에 넣지 않는다.
const KAKAO_JS_KEY=process.env.NEXT_PUBLIC_KAKAO_MAP_KEY||'';
export const mapProvider=KAKAO_JS_KEY?'카카오맵':'OpenStreetMap';

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

function markerElement(className:string,text:string,title:string){
 const wrap=document.createElement('div');wrap.className=className;wrap.title=title;
 const span=document.createElement('span');span.textContent=text;wrap.appendChild(span);
 return wrap;
}

function drawKakao(k:Kakao,el:HTMLDivElement,lat:number,lng:number,course?:Course){
 const {maps}=k;
 const map=new maps.Map(el,{center:new maps.LatLng(lat,lng),level:4,scrollwheel:false});
 map.addControl(new maps.ZoomControl(),maps.ControlPosition.RIGHT);
 const stops=course?.stops;
 if(stops?.length){
  const path=stops.map(s=>new maps.LatLng(s.lat,s.lng));
  new maps.Polyline({map,path,strokeWeight:4,strokeColor:'#9856e8',strokeOpacity:.8,strokeStyle:'shortdash'});
  const bounds=new maps.LatLngBounds();
  stops.forEach((s,i)=>{
   const pin=markerElement('number-marker kakao-pin',String(i+1),s.name);
   pin.setAttribute('aria-label',`${i+1}번 ${s.name}`);
   new maps.CustomOverlay({map,position:path[i],content:pin,yAnchor:1,xAnchor:.5});
   bounds.extend(path[i]);
  });
  if(stops.length>1)map.setBounds(bounds,45,45,45,45);else map.setCenter(path[0]);
 }else{
  new maps.CustomOverlay({map,position:new maps.LatLng(lat,lng),content:markerElement('center-marker','',''),yAnchor:.5,xAnchor:.5});
 }
 setTimeout(()=>{const center=map.getCenter();map.relayout();map.setCenter(center);},150);
}

export default function MapPanel({lat,lng,course}:{lat:number;lng:number;course?:Course}){
 const ref=useRef<HTMLDivElement>(null);
 const [failed,setFailed]=useState(false);
 const [provider,setProvider]=useState<'kakao'|'osm'>(KAKAO_JS_KEY?'kakao':'osm');
 useEffect(()=>{
  let map:import('leaflet').Map|undefined;let cancelled=false;
  const el=ref.current;if(!el)return;
  const osm=()=>import('leaflet').then(L=>{
   if(cancelled||!ref.current)return;
   setProvider('osm');setFailed(false);
   map=L.map(ref.current,{scrollWheelZoom:false}).setView([lat,lng],15);
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).on('tileerror',()=>setFailed(true)).addTo(map);
   const stops=course?.stops;
   if(stops?.length){
    const coords=stops.map(s=>[s.lat,s.lng] as [number,number]);
    L.polyline(coords,{color:'#9856e8',weight:4,dashArray:'7 9',opacity:.8}).addTo(map);
    stops.forEach((s,i)=>{const marker=L.marker([s.lat,s.lng],{icon:L.divIcon({className:'number-marker',html:`<span>${i+1}</span>`,iconSize:[32,38],iconAnchor:[16,35]})}).addTo(map!);const label=document.createElement('div');label.textContent=s.name;marker.bindPopup(label);});
    map.fitBounds(L.latLngBounds(coords),{padding:[45,45],maxZoom:16});
   }else{
    L.marker([lat,lng],{icon:L.divIcon({className:'center-marker',html:'<span></span>',iconSize:[24,24]})}).addTo(map);
   }
   setTimeout(()=>map?.invalidateSize(),150);
  }).catch(()=>setFailed(true));
  if(KAKAO_JS_KEY){
   loadKakao().then(k=>{if(cancelled||!ref.current)return;setProvider('kakao');setFailed(false);drawKakao(k,ref.current,lat,lng,course);}).catch(()=>{if(!cancelled)osm();});
  }else osm();
  return()=>{cancelled=true;map?.remove();el.innerHTML='';};
 },[lat,lng,course]);
 const fallbackUrl=provider==='kakao'?`https://map.kakao.com/link/map/${lat},${lng}`:`https://www.openstreetmap.org/#map=15/${lat}/${lng}`;
 return <div className="map-container"><div ref={ref} className="leaflet-host" aria-label={provider==='kakao'?'카카오맵 지도':'OpenStreetMap 지도'}/>{failed&&<a className="map-fallback" href={fallbackUrl} target="_blank" rel="noreferrer">지도 연결 지연 · 새 창에서 보기 ↗</a>}</div>;
}
