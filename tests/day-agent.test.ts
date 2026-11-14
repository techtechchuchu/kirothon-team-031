import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeAgentDraft,agentPreferences,missingConditions,replaceAgentStop,draftSchema} from '../lib/day-agent.ts';
import {schedule,type Place} from '../lib/planner.ts';
const draft={region:'서울 성수동',start:'14:00',end:'18:00',budget:30000};
const p=agentPreferences(draft,{lat:37.54,lng:127.05});
const cafe:Place={id:'a',name:'카페',lat:37.54,lng:127.05,category:'카페',cost:6500,duration:45,url:'https://example.com',indoor:true};
const play:Place={...cafe,id:'b',name:'볼링',category:'놀거리',cost:15000,duration:60};
test('partial conditions preserve previously supplied values',()=>{const remembered=draftSchema.parse({...{region:'서울 성수동',shortWalk:true},...{budget:30000,end:'21:00'}});assert.deepEqual(missingConditions(remembered),['시작 시간']);assert.equal(remembered.shortWalk,true);});
test('one replacement preserves other IDs and recalculates cost',()=>{const c=schedule([cafe,play],p,'test','','c');const next=replaceAgentStop(c,0,[{...cafe,id:'new',cost:8000}],p)!;assert.deepEqual(next.stops.map(s=>s.id),['new','b']);assert.equal(next.total,23000);assert.equal(c.stops[0].id,'a');});
test('unaffordable replacement leaves original unchanged',()=>{const c=schedule([cafe,play],p,'test','','c');assert.equal(replaceAgentStop(c,0,[{...cafe,id:'new',cost:25000}],p),null);assert.equal(c.total,21500);});
test('short walking limit rejects far candidate',()=>{const short=agentPreferences({...draft,shortWalk:true},{lat:37.54,lng:127.05});const c=schedule([cafe,play],short,'test','','c');assert.equal(replaceAgentStop(c,0,[{...cafe,id:'far',lat:37.59}],short),null);});
test('replacement cannot drop another stop to fit deadline',()=>{const c=schedule([cafe,play],p,'test','','c');assert.equal(replaceAgentStop(c,0,[{...cafe,id:'long',duration:240}],p),null);});

test('midnight normalizes and missing budget stays missing',()=>{const {draft,invalid}=mergeAgentDraft({}, {region:'서울 혜화동',start:'11:00',end:'24:00',budget:null},'밤 12시까지');assert.equal(draft.end,'00:00');assert.deepEqual(invalid,[]);assert.deepEqual(missingConditions(draft),['1인 예산']);});
test('bad field does not discard valid region and time',()=>{const {draft,invalid}=mergeAgentDraft({}, {region:'혜화동',start:'11:00',end:'00:00',budget:0},'요청');assert.equal(draft.region,'혜화동');assert.equal(draft.start,'11:00');assert.deepEqual(invalid,['budget']);});
