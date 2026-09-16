import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSheets, buildLedgerCandidates } from '../edge-functions/lib/ledger.js';
import { issueSession, readSession } from '../edge-functions/lib/admin-auth.js';

test('maps all three real header layouts without copying private columns', () => {
 const result = normalizeSheets([{name:'课程',rows:[['ID','授课老师','课程名称','所在单位（曾）'],['1','张三','预算管理','甲大学']]},{name:'师资',rows:[['姓名','工作单位（如已退休填原单位）','个人简介','研究领域','讲授课程'],['李四','乙大学','教授','审计','投资审计；财务审计']]},{name:'中介',rows:[['师资姓名','师资背景','核心主题标签（多级）','主讲课程名称','师资经纪机构','机构联系方式'],['王五','金融专家','银行/风控','银行风控','机构甲','13800000000']]}]);
 assert.equal(result.records.length,3);
 assert.equal(result.records[0].kind,'course');
 assert.equal(result.records[1].institution,'乙大学');
 assert.equal(result.records[2].agency,'机构甲');
 assert.ok(!JSON.stringify(result.records).includes('13800000000'));
});
test('uses the three visible source channels and defaults ordinary forms to library', () => {
 const result=normalizeSheets([{name:'课程',rows:[['授课老师','课程名称','师资来源'],['甲','课程甲','库内师资']]},{name:'师资',rows:[['姓名','讲授课程'],['乙','课程乙']]},{name:'中介',rows:[['师资姓名','主讲课程名称','师资经纪机构'],['丙','课程丙','机构']]}]);
 const candidates=buildLedgerCandidates(result.records.map((r,i)=>({...r,id:String(i)})),[]).formal;
 assert.equal(candidates.find(x=>x.teacher_name==='甲').source_type,'库内师资');
 assert.equal(candidates.find(x=>x.teacher_name==='乙').source_type,'库内师资');
  assert.equal(candidates.find(x=>x.teacher_name==='丙').source_type,'中介师资');
});
test('uploaded forms cannot label a resource as web-search evidence', () => {
 const result=normalizeSheets([{name:'课程',rows:[['授课老师','课程名称','师资来源'],['甲','课程甲','网络检索']]}]);
 const candidate=buildLedgerCandidates(result.records.map((r,i)=>({...r,id:String(i)}))).formal[0];
 assert.equal(candidate.source_type,'库内师资');
});
test('duplicate data does not inflate results and ambiguous identities never borrow profiles', () => {
 const t=(id,institution)=>({id,kind:'teacher',name:'张三',institution,profile:'私有身份简介',topics:'预算',titles:'',source:'样表'});
 const c={id:'c',kind:'course',name:'张三',title:'预算管理',source:'样表'};
 const result=buildLedgerCandidates([t('a','甲大学'),t('b','乙大学'),c,{...c,id:'duplicate'}],[]);
 assert.equal(result.formal.length,1);
 assert.equal(result.formal[0].identity_status,'ambiguous');
 assert.equal(result.formal[0].teacher_profile,'');
 assert.equal(result.formal[0].identity_options.length,2);
 const confirmed=buildLedgerCandidates([t('a','甲大学'),t('b','乙大学'),c],[{course_id:'c',teacher_id:'b'}]);
 assert.equal(confirmed.formal[0].institution,'乙大学');
});
test('teacher embedded courses become resources; research-only stays a suggested topic', () => {
 const result=buildLedgerCandidates([{id:'a',kind:'teacher',name:'李四',institution:'乙大学',titles:'投资审计；财务审计',topics:'风险'},{id:'b',kind:'teacher',name:'王五',topics:'数字经济'}],[]);
 assert.equal(result.formal.length,2);
 assert.equal(result.external.length,1);
 assert.equal(result.external[0].basis_type,'research_only');
});
test('signed session rejects tampering and expires',async()=>{
 const env={ADMIN_SESSION_SECRET:'a'.repeat(48)};
 const token=await issueSession(env,'admin',1000);
 assert.equal((await readSession(new Request('https://example.org',{headers:{Cookie:`wb_session=${token}`}}),env,1001)).role,'admin');
 assert.equal(await readSession(new Request('https://example.org',{headers:{Cookie:`wb_session=${token}x`}}),env,1001),null);
 assert.equal(await readSession(new Request('https://example.org',{headers:{Cookie:`wb_session=${token}`}}),env,1000+9*3600),null);
});
