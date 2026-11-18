// 3D 코스 지도용 주변 지도: 벡터 타일(OpenFreeMap, OpenMapTiles 형식)을 받아 건물·도로·녹지·물 삼각형 메쉬로 바꾼다.
// 타일은 키 없이 쓰는 무료 서비스이고 전국을 같은 방식으로 받는다.
// 좌표는 기준점에서 동쪽(x)·북쪽(z)으로 떨어진 미터. 건물 높이는 타일에 값이 없으면 추정값이다.
// 지도 데이터 © OpenStreetMap contributors (ODbL) · 타일 © OpenMapTiles · OpenFreeMap

type P2=[number,number];
/** v,t: 건물 · rv,rt: 도로 · gv,gt: 녹지 · wv,wt: 물. v는 x,y,z 순서로 이어 붙인 좌표, t는 삼각형 꼭짓점 번호. */
export type MapMesh={v:number[];t:number[];rv:number[];rt:number[];gv:number[];gt:number[];wv:number[];wt:number[];count:number};
export const emptyMapMesh=():MapMesh=>({v:[],t:[],rv:[],rt:[],gv:[],gt:[],wv:[],wt:[],count:0});

// ---------- 벡터 타일(MVT, protobuf) 읽기 ----------
type Value=string|number|boolean;
export type TileFeature={type:number;props:Record<string,Value>;parts:P2[][]};
export type TileLayer={name:string;extent:number;features:TileFeature[]};

class Reader{
 pos=0;
 buf:Uint8Array;
 end:number;
 constructor(buf:Uint8Array){this.buf=buf;this.end=buf.length;}
 varint(){let v=0,m=1,b:number;do{b=this.buf[this.pos++];v+=(b&127)*m;m*=128;}while(b>=128&&this.pos<=this.end);return v;}
 bytes(){const n=this.varint(),start=this.pos;this.pos+=n;return new Reader(this.buf.subarray(start,start+n));}
 skip(wire:number){if(wire===0)this.varint();else if(wire===1)this.pos+=8;else if(wire===2)this.pos+=this.varint();else if(wire===5)this.pos+=4;else this.pos=this.end;}
 /** 필드를 차례로 넘긴다. 처리하지 않은 필드는 건너뛴다. */
 each(read:(field:number,wire:number)=>boolean){while(this.pos<this.end){const tag=this.varint(),before=this.pos;if(!read(Math.floor(tag/8),tag&7)&&this.pos===before)this.skip(tag&7);}}
}
const zigzag=(n:number)=>n%2?-(n+1)/2:n/2;

function readValue(r:Reader):Value{
 let out:Value='';
 const view=new DataView(r.buf.buffer,r.buf.byteOffset,r.buf.byteLength);
 r.each((field,wire)=>{
  if(field===1&&wire===2){const b=r.bytes();out=new TextDecoder().decode(b.buf);}
  else if(field===2&&wire===5){out=view.getFloat32(r.pos,true);r.pos+=4;}
  else if(field===3&&wire===1){out=view.getFloat64(r.pos,true);r.pos+=8;}
  else if((field===4||field===5)&&wire===0)out=r.varint();
  else if(field===6&&wire===0)out=zigzag(r.varint());
  else if(field===7&&wire===0)out=r.varint()!==0;
  else return false;
  return true;
 });
 return out;
}

/** 타일 한 장을 층·도형으로 푼다. 도형 좌표는 타일 안 좌표(0~extent, y는 아래쪽이 큼). */
export function readTile(data:Uint8Array):TileLayer[]{
 const layers:TileLayer[]=[];
 const top=new Reader(data);
 top.each((field,wire)=>{
  if(field!==3||wire!==2)return false;
  const r=top.bytes();
  const layer:TileLayer={name:'',extent:4096,features:[]};
  const keys:string[]=[],values:Value[]=[];
  const raw:{type:number;tags:number[];geom:number[]}[]=[];
  r.each((f,w)=>{
   if(f===1&&w===2)layer.name=new TextDecoder().decode(r.bytes().buf);
   else if(f===3&&w===2)keys.push(new TextDecoder().decode(r.bytes().buf));
   else if(f===4&&w===2)values.push(readValue(r.bytes()));
   else if(f===5&&w===0)layer.extent=r.varint();
   else if(f===2&&w===2){
    const fr=r.bytes();const feat={type:0,tags:[] as number[],geom:[] as number[]};
    fr.each((ff,fw)=>{
     if(ff===3&&fw===0)feat.type=fr.varint();
     else if(ff===2&&fw===2){const p=fr.bytes();while(p.pos<p.end)feat.tags.push(p.varint());}
     else if(ff===4&&fw===2){const p=fr.bytes();while(p.pos<p.end)feat.geom.push(p.varint());}
     else return false;
     return true;
    });
    raw.push(feat);
   }else return false;
   return true;
  });
  for(const f of raw){
   const props:Record<string,Value>={};
   for(let i=0;i+1<f.tags.length;i+=2)props[keys[f.tags[i]]]=values[f.tags[i+1]];
   // 도형 명령: 1 이동(새 선 시작) · 2 선 긋기 · 7 닫기
   const parts:P2[][]=[];let x=0,y=0,cur:P2[]|null=null;
   for(let i=0;i<f.geom.length;){
    const cmd=f.geom[i]&7,count=Math.floor(f.geom[i]/8);i++;
    if(cmd===7)continue;
    for(let k=0;k<count&&i+1<f.geom.length;k++,i+=2){
     x+=zigzag(f.geom[i]);y+=zigzag(f.geom[i+1]);
     if(cmd===1){cur=[];parts.push(cur);}
     cur?.push([x,y]);
    }
   }
   layer.features.push({type:f.type,props,parts});
  }
  layers.push(layer);
  return true;
 });
 return layers;
}

// ---------- 메쉬 만들기 ----------
const r1=(n:number)=>Math.round(n*10)/10;

function area(p:P2[]){let a=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];a+=p[i][0]*q[1]-q[0]*p[i][1];}return a/2;}

/** 겹친 점을 지우고 반시계 방향으로 맞춘 윤곽. 점이 3개 미만이면 null. */
function ring(pts:P2[]):P2[]|null{
 const out:P2[]=[];
 for(const p of pts){const last=out.at(-1);if(!last||Math.hypot(p[0]-last[0],p[1]-last[1])>0.05)out.push(p);}
 if(out.length>1&&Math.hypot(out[0][0]-out.at(-1)![0],out[0][1]-out.at(-1)![1])<0.05)out.pop();
 if(out.length<3)return null;
 if(area(out)<0)out.reverse();
 return out;
}

function earclip(p:P2[]):number[]{
 const n=p.length,idx=[...Array(n).keys()],tris:number[]=[];
 const cross=(a:P2,b:P2,c:P2)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const inTri=(q:P2,a:P2,b:P2,c:P2)=>cross(a,b,q)>=0&&cross(b,c,q)>=0&&cross(c,a,q)>=0;
 let guard=0;
 while(idx.length>3&&guard++<n*n){
  let cut=false;
  for(let i=0;i<idx.length;i++){
   const ia=idx[(i+idx.length-1)%idx.length],ib=idx[i],ic=idx[(i+1)%idx.length];
   if(cross(p[ia],p[ib],p[ic])<=1e-9)continue;
   let ok=true;
   for(const k of idx){if(k===ia||k===ib||k===ic)continue;if(inTri(p[k],p[ia],p[ib],p[ic])){ok=false;break;}}
   if(!ok)continue;
   tris.push(ia,ib,ic);idx.splice(i,1);cut=true;break;
  }
  if(!cut)idx.splice(0,1); // 퇴화 다각형: 한 점 버리고 계속
 }
 if(idx.length===3)tris.push(idx[0],idx[1],idx[2]);
 return tris;
}

/** 건물 높이(미터). 타일에 5m보다 큰 값이 있으면 그 값을, 없으면 건물마다 일정한 추정값(7~14m)을 쓴다. */
export function buildingHeight(renderHeight:unknown,seed:number){
 const h=typeof renderHeight==='number'&&Number.isFinite(renderHeight)?renderHeight:0;
 return Math.min(h>5?h:7+(Math.abs(Math.round(seed))%8),200);
}

/** 도로 종류(OpenMapTiles transportation.class)별 절반 폭(미터). 표시용 추정값이며, 그리지 않는 종류는 0. */
export function roadHalfWidth(props:Record<string,Value>){
 if(props.brunnel==='tunnel')return 0;
 switch(props.class){
  case 'motorway':case 'trunk':case 'primary':return 7;
  case 'secondary':return 5;
  case 'tertiary':return 4;
  case 'minor':case 'busway':return 3;
  case 'service':return 1.8;
  case 'track':return 1.4;
  case 'path':return 1;
  default:return 0;
 }
}

// Unity는 위에서 볼 때 시계 방향 삼각형이 앞면
function flat(v:number[],t:number[],p:P2[],y:number){
 const b=v.length/3;
 for(const q of p)v.push(r1(q[0]),y,r1(q[1]));
 const tri=earclip(p);
 for(let i=0;i<tri.length;i+=3)t.push(b+tri[i],b+tri[i+2],b+tri[i+1]);
}

/** 선분 a→c를 반지름 R 원 안쪽 부분만 남긴다. 전부 바깥이면 null. */
function clipSegment(a:P2,c:P2,R:number):[P2,P2]|null{
 const ia=Math.hypot(a[0],a[1])<=R,ic=Math.hypot(c[0],c[1])<=R;
 if(ia&&ic)return [a,c];
 if(!ia&&!ic)return null;
 const dx=c[0]-a[0],dz=c[1]-a[1],A=dx*dx+dz*dz,B=2*(a[0]*dx+a[1]*dz),C=a[0]*a[0]+a[1]*a[1]-R*R,D=B*B-4*A*C;
 if(A<1e-9||D<0)return null;
 const s=Math.sqrt(D),t=ia?(-B+s)/(2*A):(-B-s)/(2*A),m:P2=[a[0]+dx*t,a[1]+dz*t];
 return ia?[a,m]:[m,c];
}

export type TileAt={z:number;x:number;y:number;layers:TileLayer[]};

/** 타일들을 메쉬로 바꾼다. 기준점에서 radius(미터)를 벗어나는 부분은 빼고, 건물은 가까운 것부터 limit개까지. */
export function mapMesh(tiles:TileAt[],lat0:number,lng0:number,radius:number,limit=7000):MapMesh{
 const out=emptyMapMesh();
 const mx=Math.cos(lat0*Math.PI/180)*111320,mz=110574;
 const inside=(q:P2)=>Math.hypot(q[0],q[1])<=radius;
 const houses:{p:P2[];h:number;d:number}[]=[];
 for(const tile of tiles){
  const n=2**tile.z;
  for(const layer of tile.layers){
   const kind=layer.name==='building'?'building':layer.name==='transportation'?'road':layer.name==='water'?'water':layer.name==='park'||layer.name==='landcover'?'green':'';
   if(!kind)continue;
   const meters=(q:P2):P2=>{
    const X=(tile.x+q[0]/layer.extent)/n,Y=(tile.y+q[1]/layer.extent)/n;
    const lng=X*360-180,lat=Math.atan(Math.sinh(Math.PI*(1-2*Y)))*180/Math.PI;
    return [(lng-lng0)*mx,(lat-lat0)*mz];
   };
   for(const f of layer.features){
    if(kind==='road'){
     const w=f.type===2?roadHalfWidth(f.props):0;
     if(!w)continue;
     for(const part of f.parts){
      const pts=part.map(meters);
      for(let i=0;i+1<pts.length;i++){
       const seg=clipSegment(pts[i],pts[i+1],radius);
       if(!seg)continue;
       const [a,c]=seg,len=Math.hypot(c[0]-a[0],c[1]-a[1]);
       if(len<0.2)continue;
       // 꺾이는 곳이 벌어지지 않게 양끝을 폭의 절반만큼 늘린다
       const dx=(c[0]-a[0])/len,dz=(c[1]-a[1])/len,nx=-dz*w,nz=dx*w,ex=dx*w*.5,ez=dz*w*.5,b=out.rv.length/3,y=w>=4?0.34:0.3;
       out.rv.push(r1(a[0]-ex+nx),y,r1(a[1]-ez+nz),r1(c[0]+ex+nx),y,r1(c[1]+ez+nz),r1(c[0]+ex-nx),y,r1(c[1]+ez-nz),r1(a[0]-ex-nx),y,r1(a[1]-ez-nz));
       out.rt.push(b,b+1,b+2,b,b+2,b+3);
      }
     }
     continue;
    }
    if(f.type!==3)continue;
    if(kind==='green'&&layer.name==='landcover'&&f.props.class!=='grass'&&f.props.class!=='wood')continue;
    for(const part of f.parts){
     // 바깥 윤곽만 쓴다(타일 좌표에서 넓이가 양수). 안쪽 구멍(중정·섬)은 채워진 채로 둔다
     if(part.length<3||part.length>600||area(part)<=0)continue;
     const pts=part.map(meters);
     if(kind==='building'){
      const p=ring(pts);
      if(!p||!p.every(inside))continue;
      const cx=p.reduce((s,q)=>s+q[0],0)/p.length,cz=p.reduce((s,q)=>s+q[1],0)/p.length;
      houses.push({p,h:r1(buildingHeight(f.props.render_height,cx*7+cz*13)),d:Math.hypot(cx,cz)});
     }else{
      // 원판 밖으로 나간 꼭짓점은 가장자리로 당겨서 원판 안에만 그린다
      if(!pts.some(inside))continue;
      const p=ring(pts.map(q=>{const d=Math.hypot(q[0],q[1]);return d>radius?[q[0]*radius/d,q[1]*radius/d] as P2:q;}));
      if(!p)continue;
      if(kind==='water')flat(out.wv,out.wt,p,0.2);else flat(out.gv,out.gt,p,0.12);
     }
    }
   }
  }
 }
 houses.sort((a,b)=>a.d-b.d);
 for(const {p,h} of houses.slice(0,limit)){
  flat(out.v,out.t,p,h);
  for(let i=0;i<p.length;i++){
   const a=p[i],c=p[(i+1)%p.length],b=out.v.length/3;
   out.v.push(r1(a[0]),0,r1(a[1]),r1(c[0]),0,r1(c[1]),r1(c[0]),h,r1(c[1]),r1(a[0]),h,r1(a[1]));
   out.t.push(b,b+3,b+2,b,b+2,b+1);
  }
  out.count++;
 }
 return out;
}

// ---------- 타일 받기 ----------
const TILEJSON='https://tiles.openfreemap.org/planet';
/** 건물이 들어 있는 확대 단계와, 그 단계로 받는 최대 범위(미터). 더 넓으면 도로·물만 있는 단계로 받는다. */
const DETAIL={zoom:14,radius:2500};
const WIDE={zoom:12,radius:9000};
let template:{until:number;url:string}|null=null;

async function tileTemplate(){
 if(template&&template.until>Date.now())return template.url;
 const r=await fetch(TILEJSON,{signal:AbortSignal.timeout(8000),cache:'no-store'});
 if(!r.ok)throw new Error(`tilejson ${r.status}`);
 const url=((await r.json()) as {tiles?:string[]}).tiles?.[0];
 if(typeof url!=='string'||!url.startsWith('https://tiles.openfreemap.org/'))throw new Error('tilejson');
 template={until:Date.now()+3600000,url};
 return url;
}

/** 기준점 둘레 radius(미터) 안의 지도 메쉬. 범위가 너무 넓으면 null. */
export async function loadMapMesh(lat0:number,lng0:number,radius:number):Promise<MapMesh|null>{
 const level=radius<=DETAIL.radius?DETAIL:radius<=WIDE.radius?WIDE:null;
 if(!level)return null;
 const url=await tileTemplate(),n=2**level.zoom;
 const dlat=radius/110574,dlng=radius/(Math.cos(lat0*Math.PI/180)*111320);
 const tx=(lng:number)=>Math.floor((lng+180)/360*n);
 const ty=(lat:number)=>{const s=lat*Math.PI/180;return Math.floor((1-Math.log(Math.tan(s)+1/Math.cos(s))/Math.PI)/2*n);};
 const jobs:Promise<TileAt|null>[]=[];
 for(let x=tx(lng0-dlng);x<=tx(lng0+dlng);x++)for(let y=ty(lat0+dlat);y<=ty(lat0-dlat);y++){
  if(jobs.length>=30)break;
  jobs.push(fetch(url.replace('{z}',String(level.zoom)).replace('{x}',String(x)).replace('{y}',String(y)),{signal:AbortSignal.timeout(12000),cache:'no-store'})
   .then(async r=>r.ok?{z:level.zoom,x,y,layers:readTile(new Uint8Array(await r.arrayBuffer()))}:null).catch(()=>null));
 }
 const tiles=(await Promise.all(jobs)).filter((t):t is TileAt=>!!t);
 if(!tiles.length)throw new Error('tiles');
 return mapMesh(tiles,lat0,lng0,radius);
}
