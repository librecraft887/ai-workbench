import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost,onRequestGet} from '../edge-functions/api/resources.js';
import {loadLedger} from '../edge-functions/lib/ledger-store.js';

test('authenticated import, duplicate protection, publication and withdrawal use persisted batches',async()=>{
 const originalFetch=globalThis.fetch,imports=[];
 const env={ADMIN_PASSWORD:'test-password-long-enough',WORKBENCH_PASSWORD:'business-password-long-enough',ADMIN_SESSION_SECRET:'x'.repeat(48),CLOUDBASE_ENV_ID:'test',CLOUDBASE_API_KEY:'test'};
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(input),table=url.pathname.split('/').pop(),method=options.method||'GET';let result=[];
  if(table==='wb_allow_login')result=true;
  else if(table==='wb_identity_links')result=[];
  else if(table==='wb_imports'){
   if(method==='POST'){const b=JSON.parse(options.body);if(!imports.some(x=>x.id===b.id))imports.push(b);result=null;}
   else if(method==='PATCH'){const id=url.searchParams.get('id').slice(3);Object.assign(imports.find(b=>b.id===id),JSON.parse(options.body));result=null;}
   else{result=imports.filter(b=>(!url.searchParams.get('id')||b.id===url.searchParams.get('id').slice(3))&&(!url.searchParams.get('status')||b.status===url.searchParams.get('status').slice(3))).slice(Number(url.searchParams.get('offset')||0));}
  }else throw new Error('Unexpected database path');
  return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
 };
 const post=(body,cookie='')=>onRequestPost({env,request:new Request('https://app.test/api/resources',{method:'POST',headers:{Origin:'https://app.test','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)})});
 try{
  const login=await post({action:'login',password:env.ADMIN_PASSWORD});assert.equal(login.status,200);const cookie=login.headers.get('Set-Cookie').split(';')[0];
  const payload={action:'import',filename:'示例.xlsx',sheets:[{name:'课程',rows:[['授课老师','课程名称'],['甲老师','预算管理']]}]};
  const batch=(await (await post(payload,cookie)).json()).batch;assert.equal(batch.status,'draft');
  assert.equal((await loadLedger(env)).formal.length,0);
  assert.equal((await (await post(payload,cookie)).json()).duplicate,true);assert.equal(imports.length,1);
  assert.equal((await post({action:'publish',id:batch.id},cookie)).status,200);
  assert.equal((await loadLedger(env)).formal.length,1);
  const userCookie=(await post({action:'login',password:env.WORKBENCH_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  assert.equal((await post(payload,userCookie)).status,403);
  assert.equal((await onRequestGet({env,request:new Request('https://app.test/api/resources',{headers:{Cookie:userCookie}})})).status,403);
  assert.equal((await post({action:'archive',id:batch.id},cookie)).status,200);
  assert.equal((await loadLedger(env)).formal.length,0);
  assert.equal((await post({action:'confirm_identity',course_id:batch.records[0].id,teacher_id:'f'.repeat(64)},userCookie)).status,400);
 }finally{globalThis.fetch=originalFetch;}
});
