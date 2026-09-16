// XLSX is read locally; no workbook or private contact column is sent to an LLM.
function xml(text){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('Excel XML格式不正确');return doc;}
function elements(node,name){return [...node.getElementsByTagNameNS('*',name)];}
function content(node){return elements(node,'t').map(n=>n.textContent).join('').replace(/_x000D_/g,'');}
function colIndex(ref){return [...ref.replace(/[0-9]/g,'')].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;}
export function readCSV(text){
 const rows=[];let row=[],value='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value='';}else value+=c;}
 if(quoted)throw new Error('CSV引号未闭合');if(value||row.length){row.push(value);rows.push(row);}return rows;
}
export async function readWorkbook(file){
 if(file.size>5*1024*1024)throw new Error('首版单文件上限5MB，请拆分上传');
 if(/\.csv$/i.test(file.name))return [{name:file.name,rows:readCSV(await file.text())}];
 if(!/\.xlsx$/i.test(file.name))throw new Error('请选择.xlsx或UTF-8 CSV文件，旧版.xls请另存为.xlsx');
 const zip=await window.JSZip.loadAsync(await file.arrayBuffer());
 const entries=Object.values(zip.files);let total=0;
 for(const entry of entries){total+=entry._data?.uncompressedSize||0;}
 if(entries.length>1500||total>30*1024*1024)throw new Error('解压后文件过大，请拆分');
 const read=async path=>{const entry=zip.file(path);if(!entry)throw new Error('Excel缺少必要文件');return xml(await entry.async('string'));};
 const shared=zip.file('xl/sharedStrings.xml')?elements(await read('xl/sharedStrings.xml'),'si').map(content):[];
 const relations=elements(await read('xl/_rels/workbook.xml.rels'),'Relationship');
 const result=[];
 for(const sheet of elements(await read('xl/workbook.xml'),'sheet')){
  const id=sheet.getAttribute('r:id'),rel=relations.find(r=>r.getAttribute('Id')===id);
  if(!rel||rel.getAttribute('TargetMode')==='External')continue;
  const target=rel.getAttribute('Target');const path=target.startsWith('/')?target.slice(1):`xl/${target}`;
  if(path.includes('..'))throw new Error('不支持的工作表路径');
  const doc=await read(path),rows=[];
  for(const row of elements(doc,'row')){
   const index=Number(row.getAttribute('r'))-1;if(index>2000)throw new Error('单表超过2000行，请拆分');
   const cells=[];
   for(const c of elements(row,'c')){const col=colIndex(c.getAttribute('r')||'A1');if(col>199)throw new Error('工作表超过200列');const v=elements(c,'v')[0]?.textContent||'';cells[col]=c.getAttribute('t')==='s'?shared[Number(v)]||'':c.getAttribute('t')==='inlineStr'?content(c):v;}
   rows[index]=cells;
  }
  // Expand only explicit merges, never blindly fill down blank teacher names.
  for(const merge of elements(doc,'mergeCell')){
   const [a,b]=merge.getAttribute('ref').split(':');if(!b)continue;
   const r1=Number(a.match(/\d+/)[0])-1,r2=Number(b.match(/\d+/)[0])-1,c1=colIndex(a),c2=colIndex(b);
   if(r2>2000||c2>199)throw new Error('合并区域过大');
   const value=rows[r1]?.[c1]||'';for(let r=r1;r<=r2;r++){rows[r]||=[];for(let c=c1;c<=c2;c++)rows[r][c]??=value;}
  }
  result.push({name:sheet.getAttribute('name'),rows:Array.from({length:rows.length},(_,i)=>Array.from({length:rows[i]?.length||0},(_,j)=>rows[i][j]??''))});
 }
 return result;
}
