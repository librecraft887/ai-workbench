import {normalizeSheets} from '../lib/ledger.js';
import {database,listImports,ledgerState} from '../lib/ledger-store.js';
import {digest,equalSecret,hashPassword,issueSession,readSession,sameOrigin,sessionCookie,verifyPassword} from '../lib/admin-auth.js';
const reply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const validId=id=>/^[a-f0-9]{64}$/.test(id||'');
export async function onRequestGet({request,env}){
 const session=await readSession(request,env);
 if(!session)return reply({error:'请先登录工作台'},401);
 const query=new URL(request.url).searchParams;
 if(query.has('session'))return reply({role:session.role,ledger_enabled:env.RESOURCE_LEDGER_ENABLED==='true'});
 if(!['super_admin','resource_admin'].includes(session.role))return reply({error:'需要资源管理员权限'},403);
 try{
  const result={imports:await listImports(env)};
  if(query.has('users')&&session.role==='super_admin')result.users=await database(env,'wb_admin_users?select=id,username,display_name,role,status,created_at,last_login_at&order=created_at.asc');
  return reply(result);
 }catch{return reply({error:'台账暂不可用，请检查数据库迁移及服务权限'},503);}
}
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return reply({error:'请求来源不正确'},403);
 let stage='读取请求';
 try{
  if(!request.headers.get('Content-Type')?.includes('application/json'))return reply({error:'请求格式不正确'},415);
  const text=await request.text();if(new TextEncoder().encode(text).length>2_000_000)return reply({error:'导入内容超过2MB，请拆分'},413);
  const body=JSON.parse(text);
  if(body.action==='login'){
   if(!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32)return reply({error:'登录服务尚未完成配置'},503);
   stage='检查登录频率';
   const allowedResult=await database(env,'rpc/wb_allow_login',{method:'POST',body:{}});
   const allowed=allowedResult===true
    || allowedResult?.wb_allow_login===true
    || allowedResult?.[0]?.wb_allow_login===true
    || allowedResult?.[0]===true;
   if(!allowed)return reply({error:'登录尝试过多，请10分钟后再试'},429);
   const username=String(body.username||'').trim();
   if(!/^[A-Za-z0-9_.-]{3,64}$/.test(username)||String(body.password||'').length<12)return reply({error:'账号或密码不正确'},401);
   stage='查询管理员账号';
   let users=await database(env,`wb_admin_users?username=eq.${encodeURIComponent(username)}&select=*`),user=users[0];
   if(!user&&env.ADMIN_BOOTSTRAP_USERNAME===username&&env.ADMIN_BOOTSTRAP_PASSWORD?.length>=12&&await equalSecret(body.password||'',env.ADMIN_BOOTSTRAP_PASSWORD)){
    const password=await hashPassword(body.password),id=crypto.randomUUID();
    const created={id,username,display_name:String(env.ADMIN_BOOTSTRAP_DISPLAY_NAME||username).slice(0,100),password_salt:password.salt,password_hash:password.hash,role:'super_admin',status:'active'};
    stage='创建首个管理员账号';
    await database(env,'wb_admin_users',{method:'POST',body:created});user=created;
   }
   if(!user||user.status!=='active'||!await verifyPassword(body.password||'',user.password_salt,user.password_hash))return reply({error:'账号或密码不正确'},401);
   stage='更新登录时间';
   await database(env,`wb_admin_users?id=eq.${user.id}`,{method:'PATCH',body:{last_login_at:new Date().toISOString(),updated_at:new Date().toISOString()}});
   return reply({role:user.role},200,{'Set-Cookie':sessionCookie(await issueSession(env,user.role,user.id))});
  }
  if(body.action==='logout')return reply({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
  const session=await readSession(request,env);if(!session)return reply({error:'请先登录'},401);
  if(body.action==='create_admin'){
   if(session.role!=='super_admin')return reply({error:'仅超级管理员可创建账号'},403);
   const username=String(body.username||'').trim(),displayName=String(body.display_name||'').trim(),password=String(body.password||''),role=body.role==='super_admin'?'super_admin':'resource_admin';
   if(!/^[A-Za-z0-9_.-]{3,64}$/.test(username)||!displayName||displayName.length>100||password.length<12)return reply({error:'请填写合规的账号、姓名和至少12位密码'},400);
   if((await database(env,`wb_admin_users?username=eq.${encodeURIComponent(username)}&select=id`)).length)return reply({error:'该账号已存在'},409);
   const credential=await hashPassword(password);await database(env,'wb_admin_users',{method:'POST',body:{id:crypto.randomUUID(),username,display_name:displayName,password_salt:credential.salt,password_hash:credential.hash,role,status:'active'}});
   return reply({ok:true});
  }
  if(body.action==='set_admin_status'){
   if(session.role!=='super_admin')return reply({error:'仅超级管理员可管理账号'},403);
   if(!/^[a-f0-9-]{36}$/.test(body.id||'')||!['active','disabled'].includes(body.status))return reply({error:'账号信息不正确'},400);
   if(body.id===session.userId&&body.status==='disabled')return reply({error:'不能停用当前登录账号'},400);
   await database(env,`wb_admin_users?id=eq.${body.id}`,{method:'PATCH',body:{status:body.status,updated_at:new Date().toISOString()}});return reply({ok:true});
  }
  if(body.action==='reset_admin_password'){
   if(session.role!=='super_admin')return reply({error:'仅超级管理员可重置密码'},403);
   if(!/^[a-f0-9-]{36}$/.test(body.id||'')||String(body.password||'').length<12)return reply({error:'密码至少12位'},400);
   const credential=await hashPassword(body.password);await database(env,`wb_admin_users?id=eq.${body.id}`,{method:'PATCH',body:{password_salt:credential.salt,password_hash:credential.hash,updated_at:new Date().toISOString()}});return reply({ok:true});
  }
  if(body.action==='confirm_identity'){
   if(!validId(body.course_id)||!validId(body.teacher_id))return reply({error:'记录编号不正确'},400);
   const state=await ledgerState(env),course=state.records.find(r=>r.id===body.course_id&&r.kind==='course'),teacher=state.records.find(r=>r.id===body.teacher_id&&r.kind==='teacher');
   if(!course||!teacher||course.name!==teacher.name)return reply({error:'仅能确认已发布且同名的师资记录'},400);
   await database(env,'wb_identity_links?on_conflict=course_id',{method:'POST',prefer:'resolution=merge-duplicates',body:{course_id:course.id,teacher_id:teacher.id,confirmed_by:session.userId,updated_at:new Date().toISOString()}});
   return reply({ok:true});
  }
  if(!['super_admin','resource_admin'].includes(session.role))return reply({error:'需要资源管理员权限'},403);
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
 }catch(error){if(error instanceof SyntaxError)return reply({error:'JSON格式错误'},400);return reply({error:`处理未完成：${stage}失败。请检查数据库迁移和服务权限后重试`},503);}
}
