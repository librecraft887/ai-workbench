import test from 'node:test';
import assert from 'node:assert/strict';
import {deterministicFallback,enrichScheduleProfiles} from '../edge-functions/api/chat.js';
test('zero-relevance courses do not fill empty slots',()=>{
 const result=deterministicFallback({days:'1天',sessions:'1讲',theme:'审计'},[{match_score:0,course_business_code:'x',course_title:'园艺'}],[]);
 assert.equal(result.formal_schedule[0].course_title,'待匹配');
});
test('stable candidate id restores authoritative identity and keeps notice on renamed course',()=>{
 const plan={formal_schedule:[{candidate_id:'x',teacher_name:'伪造姓名',course_title:'定制预算课程',teacher_profile:'伪造简介'}]};
 enrichScheduleProfiles(plan,[{candidate_id:'x',course_title:'预算管理',teacher_name:'张三',institution:'',teacher_profile:'',identity_status:'ambiguous',notice:'存在同名师资，请确认身份'}]);
 assert.equal(plan.formal_schedule[0].teacher_name,'张三');
 assert.equal(plan.formal_schedule[0].teacher_profile,'');
 assert.equal(plan.formal_schedule[0].original_course_title,'预算管理');
 assert.match(plan.formal_schedule[0].notice,/同名/);
});
