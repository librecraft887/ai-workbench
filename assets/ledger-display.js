function formatIdentityNotice(row,index,escape){
 const notice=row.notice?`<div class="notice">${escape(row.notice)}</div>`:'';
 const options=Array.isArray(row.identity_options)?row.identity_options:[];
 if(!options.length)return notice;
 return `${notice}<details class="evidence"><summary>选择对应师资</summary>${options.map((t,j)=>`<p>${escape(t.name)} · ${escape(t.institution||'单位未提供')}<br>${escape(t.topics||t.titles||'')}<br><button class="mini" onclick="confirmLedgerIdentity(${index},${j})">确认对应此人</button></p>`).join('')}</details>`;
}
function formatExpertSources(candidate,escape){return (candidate.sources||[]).filter(s=>/^https?:\/\//i.test(s.url||'')).map(s=>`<p><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer" style="color:#90dce8">${escape(s.title)}</a></p>`).join('');}
async function confirmLedgerIdentity(index,optionIndex){
 const project=currentProject,plan=currentPlan,row=plan?.formal_schedule?.[index],teacher=row?.identity_options?.[optionIndex];
 if(!row||!teacher)return;
 if(!confirm(`确认“${row.original_course_title||row.course_title}”对应 ${teacher.name}（${teacher.institution||'单位未提供'}）？该关联将供后续配课使用。`))return;
 try{
  const response=await fetch('./api/resources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'confirm_identity',course_id:row.candidate_id,teacher_id:teacher.id})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'确认失败');
  // Do not mutate a new project after an asynchronous confirmation completes.
  if(currentProject!==project||currentPlan!==plan)return;
  showToast('关联已保存。重新生成方案后使用已确认师资；当前方案保留原记录。');
 }catch(e){showToast(e.message);}
}
