import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticRank} from '../edge-functions/lib/semantic-match.js';
import {validateExperts} from '../edge-functions/lib/expert-search.js';
test('semantic matching selects existing IDs without importing fabricated identity fields',async()=>{
 const ranked=await semanticRank([{candidate_id:'1',teacher_name:'甲',course_title:'财务管理',match_score:0},{candidate_id:'2',teacher_name:'乙',course_title:'园艺',match_score:0}],{theme:'财务'},async()=>JSON.stringify({matches:[{candidate_id:'1',suitable:true,reason:'内容相符',teacher_name:'伪造'},{candidate_id:'missing',suitable:true}]}));
 assert.equal(ranked.length,1);assert.equal(ranked[0].teacher_name,'甲');
});
test('market candidates require actual cited snippet naming the person',()=>{
 const sources=[{title:'财务讲座',url:'https://example.test/a',content:'张三主讲财务管理'}];
 assert.equal(validateExperts([{teacher_name:'李四',source_urls:['https://example.test/a']}],sources).length,0);
 const result=validateExperts([{teacher_name:'张三',institution:'虚构大学',source_urls:['https://example.test/a']}],sources);
 assert.equal(result[0].institution,'');assert.match(result[0].notice,/未核验原文/);
});
