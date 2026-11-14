import {z} from 'zod';
import {agentCourseReady,draftSchema,mergeAgentDraft,missingConditions,agentPreferences,replaceAgentStop} from '../../../lib/day-agent';
import {searchKakaoPlaces} from '../../../lib/kakao-place-search';
import {suitablePlace,estimateCost,isChainCafe} from '../../../lib/place-suitability';
import {propose,ensureMeal,type Course} from '../../../lib/planner';
export const maxDuration=120;
const place=z.object({id:z.string().max(100),name:z.string().max(200),lat:z.number().min(33).max(39),lng:z.number().min(124).max(132),category:z.enum(['식사','카페','산책','문화','놀거리']),cost:z.number().min(0).max(10000000),duration:z.number().int().min(1).max(600),url:z.string().url().refine(v=>/^https?:/.test(v)),indoor:z.boolean(),source:z.enum(['kakao','osm','sample']).optional(),sourceCategory:z.string().max(300).optional(),address:z.string().max(300).optional(),arrival:z.string(),departure:z.string(),travel:z.number().min(0),reason:z.string().max(1000)});
const course=z.object({id:z.string(),title:z.string().max(200),subtitle:z.string().max(500),stops:z.array(place).min(1).max(8),total:z.number(),minutes:z.number()});
const inputSchema=z.object({message:z.string().trim().min(1).max(600),draft:draftSchema.default({}),course:course.nullable().optional(),target:z.number().int().min(0).max(7).nullable().optional(),history:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(1500)})).max(12).default([])});
const nullable=(type:string)=>({type:[type,'null']});
const properties={action:{type:'string',enum:['plan','replace','clarify']},region:nullable('string'),start:nullable('string'),end:nullable('string'),budget:nullable('number'),people:nullable('number'),companion:nullable('string'),transport:{type:['string','null'],enum:['도보','대중교통','자동차',null]},indoor:nullable('boolean'),shortWalk:nullable('boolean'),drinks:nullable('boolean'),dessert:nullable('boolean'),noChain:nullable('boolean'),activities:{type:['array','null'],items:{type:'string',enum:['식사','카페','산책','문화','놀거리']}},category:{type:['string','null'],enum:['식사','카페','산책','문화','놀거리',null]},index:nullable('number'),question:nullable('string')};
export async function POST(req:Request){
 const raw=await req.text();if(raw.length>50000)return Response.json({error:'요청이 너무 길어요'},{status:413});
 let input:z.infer<typeof inputSchema>;try{input=inputSchema.parse(JSON.parse(raw));}catch{return Response.json({error:'대화 내용을 다시 입력해 주세요'},{status:400});}
 const encoder=new TextEncoder();const stream=new ReadableStream({async start(controller){
  const send=(value:unknown)=>{if(req.signal.aborted)throw new Error('취소됨');controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));};
  const status=(message:string)=>send({type:'status',message});
  try{
   const key=process.env.OPENAI_API_KEY||process.env.open_api_key;const kakao=process.env.KAKAO_REST_API_KEY||process.env.kakao_rest_api_key;
   if(!key||!kakao)throw new Error('대화 추천에 필요한 서버 연결이 준비되지 않았어요. 조건 입력으로 이용해 주세요.');
   status('말씀하신 조건과 이전 대화를 읽고 있어요');
   const now=new Date().toLocaleString('sv-SE',{timeZone:'Asia/Seoul'});
   const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:AbortSignal.any([req.signal,AbortSignal.timeout(25000)]),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',messages:[{role:'system',content:`한국 여가 코스 에이전트의 요청 해석기. 현재 한국 시각 ${now}. 사용자 최신 발화에서 명시한 변경만 반환. 술 마시기/한잔/술집 요청은 drinks true. 술집 대신 식사·카페 추천에 동의하거나 술 제외 요청이면 drinks false, activities [식사,카페]. 술을 놀거리로 분류하지 마. 언급 안 한 필드는 null(기존 유지). 시작/끝 HH:mm. 밤 12시와 자정은 00:00(다음 날), 24:00을 사용하지 마. 예산 미언급은 null. 연극은 문화로 분류. 술집/팝업의 실제 운영일·공연 시간은 확인할 수 없으므로 원문 요청을 기억하고 그 한계를 question에 설명하되 가능한 조건은 추출. '지금'은 현재 시각. 9시까지는 문맥상 저녁이면21:00, 애매하면 question으로 확인하고 action clarify. 예산은 1인 원. 총예산이면 인원으로 나눠라; 인원 불명이면 질문. 이동 짧게/많이 걷기 싫어는 shortWalk true. 카페 하나 변경은 replace, category 카페. index는 명시된 순서의 0-based. 그 외 전체 일정 조건 변경은 plan. 정보 제공 후 조건 충분하면 plan. unsupported(예약, 실제 영업/메뉴/후기 검증 등)는 clarify로 한계를 짧게 설명. 추측한 장소명/가격을 생성하지 마. 분위기는 사용자의 원문으로 검색에 전달됨. 기존 조건 ${JSON.stringify(input.draft)}. 기존 코스 ${JSON.stringify(input.course?.stops.map((s,i)=>({index:i,name:s.name,category:s.category})))}`},...input.history,{role:'user',content:input.message}],response_format:{type:'json_schema',json_schema:{name:'day_request',strict:true,schema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}}})});
   if(!response.ok)throw new Error('AI 연결이 지연되고 있어요. 잠시 후 다시 보내 주세요.');
   const data=await response.json() as {choices?:{message?:{content?:string}}[]};const intent=JSON.parse(data.choices?.[0]?.message?.content||'{}');
   if(intent.action==='replace'||input.target!=null)intent.activities=null;
   const {draft,invalid}=mergeAgentDraft(input.draft,intent,input.message);
   const done=(message:string,next:Course|null=input.course??null,ready=false)=>send({type:'result',draft,course:next,message,ready});
   if(invalid.length){const labels:Record<string,string>={start:'시작 시간',end:'종료 시간',budget:'1인 예산',people:'인원',activities:'원하는 활동'};done('다른 조건은 기억했어요. '+invalid.map(k=>labels[k]||k).join(' · ')+'만 다시 알려주세요.');return;}
   if(intent.action==='clarify'){done(intent.question||'어떤 조건을 바꾸고 싶으세요?');return;}
   if(input.target!==null&&input.target!==undefined&&input.course)intent.action='replace';
   if(draft.drinks){done('친구와 한잔할 곳을 찾으시는군요. 지금은 일반 술집과 유흥업소를 충분히 구분하지 못해서 술집 추천을 제공하지 않아요. 대신 식사와 카페 코스를 먼저 짜드릴까요?');return;}
   const missing=missingConditions(draft);if(missing.length){done(`${draft.region?draft.region+'에서 보내는 하루군요! ':''}${missing.includes('1인 예산')&&missing.length===1?'한 사람당 얼마 정도 생각하세요?':missing.join(' · ')+'만 알려주면 찾아볼게요.'}`);return;}
   let index=input.target??intent.index;
   if(intent.action==='replace'){
    if(!input.course){done('먼저 코스를 만든 다음 바꿀 장소를 알려주세요.');return;}
    if(index==null){const indexes=input.course.stops.map((s,i)=>s.category===intent.category?i:-1).filter(i=>i>=0);if(indexes.length===1)index=indexes[0];}
    if(!Number.isInteger(index)||!input.course.stops[index]){done('바꿀 장소 아래의 “이 장소 바꾸기”를 눌러 선택해 주세요.');return;}
   }
   status(`${draft.region}의 위치를 확인하고 있어요`);
   const regionResponse=await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(draft.region!)}&size=1`,{headers:{Authorization:`KakaoAK ${kakao}`},signal:AbortSignal.any([req.signal,AbortSignal.timeout(10000)])});
   if(!regionResponse.ok)throw new Error('지역 검색이 지연되고 있어요. 다시 시도해 주세요.');
   const regionData=await regionResponse.json() as {documents?:{x:string;y:string}[]};const region=regionData.documents?.[0];if(!region){done('지역을 찾지 못했어요. 시·구와 동 이름을 함께 알려주세요.');return;}
   const p=agentPreferences(draft,{lat:Number(region.y),lng:Number(region.x)});
   status(`${draft.region} 주변 실제 장소를 카카오에서 검색하고 있어요`);
   const searchPrefs=intent.action==='replace'?{...p,activities:[input.course!.stops[index].category]}:p;
   const found=await searchKakaoPlaces(searchPrefs,kakao);if(req.signal.aborted)return;
   status('업종과 중복 장소를 거르고 이동시간·예산 추정을 계산하고 있어요');
   const candidates=found.filter(s=>suitablePlace(s,p)&&!(draft.noChain&&s.category==='카페'&&isChainCafe(s))&&!(draft.dessert&&s.category==='카페'&&!/디저트|케이크|베이커리|제과/.test(s.name+' '+s.sourceCategory))).map(s=>({...s,cost:estimateCost(s)}));
   let next:Course|null;
   if(intent.action==='replace')next=replaceAgentStop(input.course as Course,index,candidates,p);
   else next=propose(candidates,p).map(c=>ensureMeal(c,candidates,p)).sort((a,b)=>b.stops.length-a.stops.length)[0]??null;
   status('최종 일정의 중복·종료 시간·추정 예산을 확인하고 있어요');
   if(!next||!agentCourseReady(next,p)){done('요청하신 활동을 갖춘 코스를 충분히 찾지 못했어요. 시간이나 원하는 활동을 조정해볼까요? 기존 코스가 있다면 그대로 둘게요.');return;}
   if(new Set(next.stops.map(s=>s.id)).size!==next.stops.length||next.total>p.budget)throw new Error('조건을 만족하는 코스를 만들지 못했어요. 기존 코스를 유지합니다.');
   done(`${intent.action==='replace'?'다른 장소와 순서를 유지하고 한 곳을 바꿨어요.':'실제 검색한 장소로 코스를 준비했어요.'} ${next.stops.length}곳, 1인 약 ${next.total.toLocaleString()}원. 가격·이동시간은 추정이며 메뉴·영업시간·후기는 확인하지 않았어요.${draft.shortWalk?' 도보 구간당 10분·총 30분 이내 추정으로 골랐어요.':''}`,next,true);
  }catch(error){if(!req.signal.aborted)send({type:'error',message:error instanceof Error&& !/JSON|validation|parse/i.test(error.message)?error.message:'조건을 읽지 못했어요. 짧게 다시 알려주세요. 기존 코스는 유지됩니다.'});}
  finally{controller.close();}
 }});return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'}});
}
