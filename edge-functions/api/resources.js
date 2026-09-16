import {normalizeSheets} from '../lib/ledger.js';
import {database,listImports,ledgerState} from '../lib/ledger-store.js';
import {digest,equalSecret,issueSession,readSession,sameOrigin,sessionCookie} from '../lib/admin-auth.js';
const reply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const validId=id=>/^[a-f0-9]{64}$/.test(id||'');
export async function onRequestGet({request,env}){
 const session=await readSession(request,env);
 if(!session)return reply({error:'请先登录工作台'},401);
 if(new URL(request.url).searchParams.has('session'))return reply({role:session.role,ledger_enabled:env.RESOURCE_LEDGER_ENABLED==='true'});
 if(session.role!=='admin')return reply({error:'需要资源管理员权限'},403);
 try{return reply({imports:await listImports(env)});}catch{return reply({error:'台账暂不可用，请检查数据库迁移及服务权限'},503);}
}
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return reply({error:'请求来源不正确'},403);
 try{
  if(!request.headers.get('Content-Type')?.includes('application/json'))return reply({error:'请求格式不正确'},415);
  const text=await request.text();if(new TextEncoder().encode(text).length>2_000_000)return reply({error:'导入内容超过2MB，请拆分'},413);
  const body=JSON.parse(text);
  if(body.action==='login'){
   if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<16||!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32)return reply({error:'登录服务尚未完成配置'},503);
   const allowed=await database(env,'rpc/wb_allow_login',{method:'POST',body:{}});
   if(allowed!==true)return reply({error:'登录尝试过多，请10分钟后再试'},429);
   const role=await equalSecret(body.password||'',env.ADMIN_PASSWORD)?'admin':env.WORKBENCH_PASSWORD?.length>=16&&await equalSecret(body.password||'',env.WORKBENCH_PASSWORD)?'user':'';
   if(!role)return reply({error:'访问口令不正确'},401);
   return reply({role},200,{'Set-Cookie':sessionCookie(await issueSession(env,role))});
  }
  if(body.action==='logout')return reply({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
  const session=await readSession(request,env);if(!session)return reply({error:'请先登录'},401);
  if(body.action==='confirm_identity'){
   if(!validId(body.course_id)||!validId(body.teacher_id))return reply({error:'记录编号不正确'},400);
   const state=await ledgerState(env),course=state.records.find(r=>r.id===body.course_id&&r.kind==='course'),teacher=state.records.find(r=>r.id===body.teacher_id&&r.kind==='teacher');
   if(!course||!teacher||course.name!==teacher.name)return reply({error:'仅能确认已发布且同名的师资记录'},400);
   await database(env,'wb_identity_links?on_conflict=course_id',{method:'POST',prefer:'resolution=merge-duplicates',body:{course_id:course.id,teacher_id:teacher.id,confirmed_by:session.role,updated_at:new Date().toISOString()}});
   return reply({ok:true});
  }
  if(session.role!=='admin')return reply({error:'需要资源管理员权限'},403);
  if(body.action==='import'){
   const normalized=normalizeSheets(body.sheets);
   if(!normalized.records.length)return reply({error:'未识别到有效记录，请检查表头',issues:normalized.issues},400);
   const id=await digest(JSON.stringify(normalized.records));
   const existing=await database(env,`wb_imports?id=eq.${id}&select=*`);
   if(existing.length)return reply({batch:existing[0],duplicate:true});
   const filename=String(body.filename||'上传资料').slice(0,150);
   const records=await Promise.all(normalized.records.map(async(r,i)=>({...r,id:await digest(`${id}:${i}`),source:`${filename} / ${r.source}`})));
   const batch={id,filename,status:'draft',records,issues:normalized.issues};
   await database(env,'wb_imports?on_conflict=id',{method:'POST',prefer:'resolution=ignore-duplicates',body:batch});
   return reply({batch});
  }
  if(['publish','archive'].includes(body.action)){
   if(!validId(body.id))return reply({error:'批次编号不正确'},400);
   const rows=await database(env,`wb_imports?id=eq.${body.id}&select=*`);if(!rows.length)return reply({error:'批次不存在'},404);
   if(body.action==='publish'&&rows[0].issues.length&&body.acknowledge_issues!==true)return reply({error:'请先确认本批次的识别提示'},409);
   await database(env,`wb_imports?id=eq.${body.id}`,{method:'PATCH',body:{status:body.action==='publish'?'published':'archived',updated_at:new Date().toISOString()}});
   return reply({ok:true});
  }
  return reply({error:'未知操作'},400);
 }catch(error){if(error instanceof SyntaxError)return reply({error:'JSON格式错误'},400);return reply({error:'处理未完成。请检查文件格式、数据库迁移和服务配置后重试'},503);}
}
