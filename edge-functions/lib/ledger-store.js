import {buildLedgerCandidates} from './ledger.js';
export async function database(env,path,{method='GET',body,prefer}={}){
 if(!env.CLOUDBASE_ENV_ID||!env.CLOUDBASE_API_KEY)throw new Error('数据库未配置');
 const response=await fetch(`https://${env.CLOUDBASE_ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest/${path}`,{
  method,headers:{Authorization:`Bearer ${env.CLOUDBASE_API_KEY}`,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},
  ...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw new Error(`Database request failed (${response.status})`);
 const text=await response.text();return text?JSON.parse(text):null;
}
export async function listImports(env,publishedOnly=false){
 const all=[];let offset=0;
 // Respect server page caps, never silently truncate the resource pool.
 for(let page=0;page<200;page++){
  const rows=await database(env,`wb_imports?select=*&order=created_at.asc,id.asc&limit=50&offset=${offset}${publishedOnly?'&status=eq.published':''}`);
  if(!Array.isArray(rows))throw new Error('数据库响应格式不正确');
  if(!rows.length)return all;
  all.push(...rows);offset+=rows.length;
 }
 throw new Error('资源量超过当前读取上限，请联系管理员扩容');
}
export async function ledgerState(env){
 const imports=await listImports(env,true),links=[];let offset=0;
 for(let page=0;page<200;page++){
  const rows=await database(env,`wb_identity_links?select=course_id,teacher_id&order=course_id&limit=100&offset=${offset}`);
  if(!Array.isArray(rows))throw new Error('关联读取失败');
  if(!rows.length)return {imports,records:imports.flatMap(b=>b.records),links};
  links.push(...rows);offset+=rows.length;
 }
 throw new Error('关联读取超出上限');
}
export async function loadLedger(env){const state=await ledgerState(env);return {...buildLedgerCandidates(state.records,state.links),version:state.imports.map(b=>b.id).join('.')};}
