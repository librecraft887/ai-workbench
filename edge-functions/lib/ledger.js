// Imported text is evidence, never an instruction. Keep this module dependency-free.
const clean = value => String(value ?? '').trim();
const key = value => clean(value).replace(/\s/g, '').toLowerCase();
const aliases = {
 name:['姓名','授课老师','师资姓名','老师姓名','讲师','教师姓名'],
 institution:['所在单位（曾）','工作单位（如已退休填原单位）','工作单位','所在单位','单位'],
 department:['所在部门','院系','部门'], position:['职务职称','职称','职务'],
 profile:['个人简介','师资背景','师资简介','简介'], topics:['研究领域','研究方向','核心主题标签（多级）','主题标签'],
 title:['课程名称','主讲课程名称'], titles:['讲授课程','授课课程','主讲课程'],
 agency:['师资经纪机构','经纪机构'], industry:['行业标签','行业'], source_type:['师资来源','来源'], source_id:['ID','序号']
};
const sourceType=value=>['库内师资','中介师资'].includes(clean(value))?clean(value):'';
export function normalizeSheets(sheets) {
 if(!Array.isArray(sheets)||sheets.length>30) throw new Error('工作表数量不正确');
 const records=[],issues=[];
 for(const sheet of sheets){
  const rows=sheet.rows;
  if(!Array.isArray(rows)||rows.length>2001) throw new Error('每个工作表最多支持2000条，请拆分文件');
  const headerIndex=rows.slice(0,20).findIndex(row=>Array.isArray(row)&&row.some(v=>aliases.name.some(a=>key(a)===key(v))));
  if(headerIndex<0){issues.push({sheet:clean(sheet.name),message:'没有识别到姓名表头，未导入该工作表'});continue;}
  const header=rows[headerIndex].map(key), mapping={};
  for(const [field,names] of Object.entries(aliases)) mapping[field]=header.findIndex(v=>names.some(a=>key(a)===v));
  for(let i=headerIndex+1;i<rows.length;i++){
   const row=rows[i]; if(!Array.isArray(row)||!row.some(v=>clean(v)))continue;
   const r=Object.fromEntries(Object.entries(mapping).map(([f,j])=>[f,j<0?'':clean(row[j])]));
   if(!r.name){issues.push({sheet:clean(sheet.name),row:i+1,message:'姓名为空，未导入'});continue;}
   if(Object.values(r).some(v=>v.length>12000))throw new Error('单元格内容过长，请拆分');
   r.name=r.name.replace(/\s/g,'');
   r.source_type=sourceType(r.source_type)||(r.agency?'中介师资':'库内师资');
   r.kind=r.profile||r.titles||r.topics||r.agency?'teacher':'course';
   if(r.title&&r.kind==='teacher'){r.titles=[r.titles,r.title].filter(Boolean).join('；');r.title='';}
   if(r.kind==='course'&&!r.title){issues.push({sheet:clean(sheet.name),row:i+1,message:'缺少课程名称，未导入'});continue;}
   if(r.kind==='teacher'&&!r.titles&&!r.topics)issues.push({sheet:clean(sheet.name),row:i+1,message:'无课程或研究方向，可保存师资但暂不能匹配'});
   records.push({...r,source:`${clean(sheet.name)} 第${i+1}行`,row:i+1});
  }
 }
 if(records.length>2000)throw new Error('每次最多导入2000条，请拆分文件');
 return {records,issues};
}
export function splitTitles(value){
 const text=clean(value);const quoted=[...text.matchAll(/《([^》]+)》/g)].map(m=>m[1].trim());
 // Commas and enumeration commas can be part of a course title.
 return [...new Set((quoted.length?quoted:text.split(/[\n；;]+/)).map(v=>v.replace(/^\s*\d+[.、．]\s*/, '').trim()).filter(Boolean))];
}
export function buildLedgerCandidates(records,links=[]){
 const unique=new Map();
 for(const r of records){const signature=JSON.stringify([r.kind,key(r.name),key(r.institution),key(r.agency),key(r.title),key(r.titles),key(r.topics),key(r.profile)]);if(!unique.has(signature))unique.set(signature,r);}
 const all=[...unique.values()], teachers=all.filter(r=>r.kind==='teacher');
 const formal=[],external=[];
 const candidate=(c,t,status,options=[])=>({
  candidate_id:c.id,course_business_code:c.id,teacher_business_code:t?.id||'',
  teacher_name:c.name,course_title:c.title,original_course_title:c.title,
  institution:t?.institution||c.institution||'',department:t?.department||'',
  teacher_profile:t?.profile||'',research_topics:t?.topics||'',course_topics:c.title,
  teacher_audiences:'',course_audiences:c.industry||'',duration:'',
  source_type:t?.source_type||c.source_type||(t?.agency?'中介师资':'库内师资'),evidence_note:c.source||'',
  identity_status:status,identity_options:options.map(x=>({id:x.id,name:x.name,institution:x.institution||'',topics:x.topics||'',titles:x.titles||''})),
  notice:status==='ambiguous'?'存在同名师资，请确认身份':status==='unlinked'?'仅有课程记录，师资身份待确认':'',
  basis_type:'recorded_course'
 });
 for(const c of all.filter(r=>r.kind==='course')){
  const options=teachers.filter(t=>key(t.name)===key(c.name));
  const confirmed=links.find(l=>l.course_id===c.id), selected=options.find(t=>t.id===confirmed?.teacher_id);
  const unit=c.institution?options.filter(t=>key(t.institution)===key(c.institution)):[];
  const match=selected||(unit.length===1?unit[0]:options.length===1&&(!c.institution||!options[0].institution||key(options[0].institution)===key(c.institution))?options[0]:null);
  formal.push(candidate(c,match,match?'linked':options.length?'ambiguous':'unlinked',match?[]:options));
 }
 for(const t of teachers){
  const titles=splitTitles(t.titles);
  titles.forEach((title,i)=>formal.push(candidate({...t,id:`${t.id}:course:${i}`,title},t,'linked')));
  if(!titles.length&&t.topics)external.push({...candidate({...t,id:`${t.id}:research`,title:t.topics},t,'linked'),basis_type:'research_only',notice:'仅研究方向相关，建议课题及授课能力待确认'});
 }
 const dedup=new Map();
 for(const c of formal){const signature=[key(c.teacher_name),key(c.institution),key(c.course_title)].join('|');const old=dedup.get(signature);if(!old||old.identity_status!=='linked'&&c.identity_status==='linked')dedup.set(signature,c);}
 return {formal:[...dedup.values()],external};
}
