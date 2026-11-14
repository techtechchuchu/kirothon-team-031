import {z} from 'zod';
import {schedule,type Course,type Place,type Preferences} from './planner.ts';
export const draftSchema=z.object({region:z.string().max(80).optional(),start:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),end:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),budget:z.number().int().min(1000).max(10000000).optional(),people:z.number().int().min(1).max(30).optional(),companion:z.string().max(30).optional(),transport:z.enum(['도보','대중교통','자동차']).optional(),activities:z.array(z.enum(['식사','카페','산책','문화','놀거리'])).max(5).optional(),indoor:z.boolean().optional(),shortWalk:z.boolean().optional(),drinks:z.boolean().optional(),dessert:z.boolean().optional(),noChain:z.boolean().optional(),request:z.string().max(1000).optional()});
export type AgentDraft=z.infer<typeof draftSchema>;
/** Keep valid conditions even when one model field is malformed. */
export function mergeAgentDraft(previous:AgentDraft,patch:Record<string,unknown>,message:string){
 const next:Record<string,unknown>={...previous};const invalid:string[]=[];
 for(const [key,schema] of Object.entries(draftSchema.shape)){
  let value=patch[key];if(value===null||value===undefined||key==='request')continue;
  if((key==='start'||key==='end')&&typeof value==='string'){
   value=value.trim();if(value==='24:00')value='00:00';
   if(/^\d:\d{2}$/.test(value as string))value='0'+value;
  }
  const result=schema.safeParse(value);if(result.success)next[key]=result.data;else invalid.push(key);
 }
 next.request=[previous.request,message].filter(Boolean).join(' ').slice(-1000);
 return {draft:draftSchema.parse(next),invalid};
}
export function missingConditions(d:AgentDraft){return [['region','지역'],['start','시작 시간'],['end','종료 시간'],['budget','1인 예산']].filter(([k])=>d[k as keyof AgentDraft]===undefined).map(([,label])=>label);}
export function agentPreferences(d:AgentDraft,center:{lat:number;lng:number}):Preferences{
 if(missingConditions(d).length)throw new Error('조건이 부족해요');
 return {region:d.region!,...center,start:d.start!,end:d.end!,budget:d.budget!,people:d.people??2,companion:d.companion??'친구와',transport:d.transport??'도보',activities:d.activities??[],food:'상관없어요',indoor:d.indoor??false,request:[d.request,d.dessert?'디저트 카페':'',d.noChain?'독립 카페':''].filter(Boolean).join(' '),...(d.shortWalk?{maxLegMinutes:10,maxTravelMinutes:30}:{})};
}
export function replaceAgentStop(course:Course,index:number,candidates:Place[],prefs:Preferences):Course|null{
 const old=course.stops[index];if(!old)return null;
 for(const candidate of candidates){
  if(candidate.category!==old.category||course.stops.some(s=>s.id===candidate.id))continue;
  const list=course.stops.map((s,i)=>i===index?candidate:s);
  const next=schedule(list,prefs,course.title,course.subtitle,course.id);
  if(next.stops.length===list.length&&next.stops.every((s,i)=>s.id===list[i].id)&&next.total<=prefs.budget)return next;
 }
 return null;
}

export function agentCourseReady(c:Course,p:Preferences){return c.stops.length>=2&&new Set(c.stops.map(s=>s.id)).size===c.stops.length&&c.total<=p.budget&&p.activities.every(category=>c.stops.some(s=>s.category===category));}
