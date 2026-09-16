import {readWorkbook} from './workbook-reader.js';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let batches=[];
function message(text){$('message').textContent=text;}
async function api(body,query=''){
 const response=await fetch(`./api/resources${query}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'请求失败');return data;
}
async function refresh(){batches=(await api()).imports;
 const published=batches.filter(b=>b.status==='published');
 $('teacher-count').textContent=published.flatMap(b=>b.records).filter(r=>r.kind==='teacher').length;
 $('course-count').textContent=published.flatMap(b=>b.records).filter(r=>r.kind==='course').length;
 $('draft-count').textContent=batches.filter(b=>b.status==='draft').length;
 $('batches').innerHTML=batches.slice().reverse().map(b=>`<div class="batch"><div><b>${esc(b.filename)}</b><p>${esc({draft:'待发布',published:'已发布',archived:'已撤回'}[b.status])} · ${b.records.length}条 · ${b.issues.length}项提示</p></div><div class="actions"><button data-action="view" data-id="${b.id}" class="secondary">查看</button><button data-action="${b.status==='published'?'archive':'publish'}" data-id="${b.id}">${b.status==='published'?'撤回':'发布'}</button></div></div>`).join('')||'<p>尚未上传资料。</p>';
}
async function refreshUsers(){const result=await api(null,'?users=1'),users=result.users||[];$('admin-users').innerHTML=`<div class="table-wrap"><table><thead><tr><th>姓名</th><th>账号</th><th>权限</th><th>状态</th><th>操作</th></tr></thead><tbody>${users.map(u=>`<tr><td>${esc(u.display_name)}</td><td>${esc(u.username)}</td><td>${u.role==='super_admin'?'超级管理员':'资源管理员'}</td><td>${u.status==='active'?'启用':'已停用'}</td><td><button data-user-id="${u.id}" data-user-status="${u.status}" class="secondary">${u.status==='active'?'停用':'启用'}</button> <button data-reset-id="${u.id}" class="secondary">重置密码</button></td></tr>`).join('')}</tbody></table></div>`;}
function preview(b){$('preview').hidden=false;$('preview-title').textContent=b.filename;$('issues').textContent=b.issues.map(i=>`${i.sheet} ${i.row||''}：${i.message}`).join('；');$('records').innerHTML=b.records.map(r=>`<tr><td>${r.kind==='teacher'?'师资':'课程'}</td><td>${esc(r.name)}</td><td>${esc(r.institution||r.agency)}</td><td>${esc(r.title||r.titles||r.topics)}</td><td>${esc(r.source)}</td></tr>`).join('');$('preview').scrollIntoView({behavior:'smooth'});}
async function enter(){const s=await api(null,'?session=1');$('logout').hidden=false;$('login').hidden=true;if(s.role==='user'){message('登录成功，可进入前台配课。');return;}$('workspace').hidden=false;await refresh();if(s.role==='super_admin'){$('account-management').hidden=false;await refreshUsers();}if(!s.ledger_enabled)message('后台已可用；前台台账联动尚未启用，发布并验证后再开启。');}
$('login-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await api({action:'login',username:$('username').value,password:$('password').value});$('password').value='';message('登录成功');await enter();}catch(e){message(e.message);}finally{button.disabled=false;}});
$('logout').onclick=async()=>{try{await api({action:'logout'});location.reload();}catch(e){message(e.message);}};
$('refresh').onclick=()=>refresh().catch(e=>message(e.message));
$('refresh-users').onclick=()=>refreshUsers().catch(e=>message(e.message));
$('create-admin-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await api({action:'create_admin',display_name:$('new-display-name').value,username:$('new-username').value,password:$('new-password').value,role:$('new-role').value});event.target.reset();await refreshUsers();message('管理员账号已创建。');}catch(e){message(e.message);}finally{button.disabled=false;}};
$('admin-users').onclick=async event=>{const button=event.target.closest('button');if(!button)return;try{if(button.dataset.userId){await api({action:'set_admin_status',id:button.dataset.userId,status:button.dataset.userStatus==='active'?'disabled':'active'});await refreshUsers();message('账号状态已更新。');}if(button.dataset.resetId){const password=prompt('输入新密码（至少12位）：');if(password!==null){await api({action:'reset_admin_password',id:button.dataset.resetId,password});message('密码已重置。');}}}catch(e){message(e.message);}};
$('files').onchange=async event=>{const input=event.target;input.disabled=true;try{for(const file of input.files){message(`正在读取 ${file.name}…`);const sheets=await readWorkbook(file);const result=await api({action:'import',filename:file.name,sheets});await refresh();preview(result.batch);message(result.duplicate?`${file.name} 已存在，没有重复入账。`:`${file.name} 已整理，请核对后发布。`);}}catch(e){message(e.message);}finally{input.disabled=false;input.value='';}};
$('batches').onclick=async event=>{const button=event.target.closest('button[data-action]');if(!button)return;const batch=batches.find(b=>b.id===button.dataset.id);if(button.dataset.action==='view'){preview(batch);return;}
 const publish=button.dataset.action==='publish';preview(batch);
 if(!confirm(publish?`确认发布 ${batch.filename} 的${batch.records.length}条记录？${batch.issues.length?'该批次有识别提示，请确认已阅读。':''}`:'撤回后新方案不再使用该批次。已保存方案保留。确认撤回？'))return;
 button.disabled=true;try{await api({action:button.dataset.action,id:batch.id,acknowledge_issues:true});await refresh();message(publish?'已发布，开启台账联动后前台即可使用。':'已撤回。');}catch(e){message(e.message);}finally{button.disabled=false;}};
enter().catch(e=>{if(e.message!=='请先登录工作台')message(e.message);});
