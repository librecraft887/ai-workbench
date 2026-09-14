import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const JSZip = require('../assets/jszip.min.js');

test('page, copy and Word use client language, complete overview and two-character paragraph indents', async () => {
  const nodes = new Map();
  const node = () => ({ innerHTML: '', textContent: '', scrollHeight: 0, appendChild() {}, remove() {}, focus() {}, addEventListener() {}, classList: { add() {}, remove() {} }, style: {} });
  let downloaded;
  const context = vm.createContext({ JSZip, Blob, console, setTimeout: () => 0, clearTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, navigator: {}, document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }, createElement: node }, capture(blob) { downloaded = blob; } });
  context.window = context;
  for (const file of ['research-session.js', 'training-workflow.js', 'client-copy.js', 'proposal-display.js', 'research-display.js']) vm.runInContext(await readFile(new URL(`../assets/${file}`, import.meta.url), 'utf8'), context);
  const html = await readFile(new URL('../assistant.html', import.meta.url), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  vm.runInContext(await readFile(new URL('../assets/research-export-integration.js', import.meta.url), 'utf8'), context);
  context.fixture = { requirement_summary: { audience: '中层干部', theme: '数字化经营', days: '1天', sessions: '1讲', goals: '提升数据决策能力' }, proposal: {
    project_background: { text: '结合公开资料，客户重视数据应用。[S1]\n\n本项目连接业务背景与培训目标。', source_ids: ['S1'] },
    client_needs_analysis: { text: '根据本次培训需求，建议围绕数据判断与业务应用形成学习目标。', source_ids: [] },
    design_logic: { text: '先建立分析框架，再通过“数据决策”模块练习岗位应用。正式课表均来自库内师资与课程，未安排外部候选。\n\n具体配课方案如下。', source_ids: [] }
  }, formal_schedule: [{ day: '第1天', period: '上午', module: '数据决策', course_title: '数据驱动经营', teacher_name: '库内老师', reason: '结合公开资料，回应数据应用问题，并形成经营判断能力。[S1]', evidence: '正式测试关系' }], customer_research: { sources: [{ source_id: 'S1', title: '年度报告', url: 'https://example.test/report?a=1&b=2', evidence: '不应堆在正文中的原始长摘要。' }] } };
  vm.runInContext("currentPlan=fixture;currentProject={id:'P1',title:'培训项目',customerName:'示例客户',history:[]};downloadBlob=(blob)=>capture(blob);renderPlan(currentPlan,false)", context);
  const page = nodes.get('resultBody').innerHTML;
  assert.ok(page.indexOf('项目背景') < page.indexOf('客户需求分析'));
  assert.ok(page.indexOf('客户需求分析') < page.indexOf('方案设计逻辑'));
  assert.ok(page.indexOf('方案设计逻辑') < page.indexOf('配课方案</div>'));
  assert.match(page, /<details class="section evidence">/);
  assert.doesNotMatch(page, /正式测试关系|查看依据|结合公开资料|\[S1\]|正式课表均来自/);
  assert.match(page, /text-indent:2em/);
  assert.match(page, /教学方式/);
  assert.match(page, /预期学习成果/);
  assert.doesNotMatch(page, /<b>—<\/b>/);
  assert.doesNotMatch(page, /课程场次/);
  const copied = vm.runInContext('planText()', context);
  assert.match(copied, /一、项目背景/);
  assert.match(copied, /二、客户需求分析/);
  assert.match(copied, /三、方案设计逻辑/);
  assert.doesNotMatch(copied, /原始长摘要/);
  assert.doesNotMatch(copied, /课程场次/);
  assert.doesNotMatch(copied, /\[S1\]|结合公开资料|正式课表均来自|公开资料参考/);
  assert.match(copied, /　　客户重视数据应用。\n\n　　本项目连接业务背景与培训目标。/);
  await vm.runInContext('exportDocx()', context);
  assert.ok(downloaded instanceof Blob);
  const zip = await JSZip.loadAsync(await downloaded.arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  const rels = await zip.file('word/_rels/document.xml.rels').async('string');
  assert.ok(xml.indexOf('一、项目背景') < xml.indexOf('二、客户需求分析'));
  assert.ok(xml.indexOf('三、方案设计逻辑') < xml.indexOf('五、配课方案'));
  for (const section of Object.values(context.fixture.proposal)) for (const text of context.clientParagraphs(section.text)) assert.ok(xml.includes(text));
  assert.doesNotMatch(xml, /原始长摘要/);
  assert.doesNotMatch(xml, /\[S1\]|结合公开资料|正式课表均来自|公开资料参考/);
  assert.match(xml, /w:firstLineChars="200"/);
  assert.doesNotMatch(rels, /TargetMode="External"/);
  assert.match(xml, /教学方式/);
  assert.match(xml, /预期学习成果/);
  assert.doesNotMatch(xml, /课程场次/);
  assert.doesNotMatch(xml, /客户：示例客户/);
  context.fixture.formal_schedule[0].evidence_sources = [{ title: '课程相关资料', url: 'https://example.test/report' }];
  vm.runInContext('renderPlan(currentPlan,false)',context);
  assert.match(nodes.get('resultBody').innerHTML, /查看依据/);
  assert.match(nodes.get('resultBody').innerHTML, /href="https:\/\/example.test\/report"/);

  // Exercise the actual page's async completion after switching projects.
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const planA = { ...context.fixture, assistant_message: '项目A处理完成' };
  context.workflowMock = async options => {
    await gate;
    options.onResearch(planA.customer_research, { ...planA.requirement_summary, customer_name: '客户A' }, 'fingerprintA');
    return { ...planA, mode: 'plan' };
  };
  vm.runInContext('runTrainingWorkflow=workflowMock;window.projectA=currentProject', context);
  const pending = vm.runInContext('processProjectTraining(projectA,[])', context);
  context.planB = { ...context.fixture, requirement_summary: { goals: '项目B的目标' } };
  vm.runInContext("currentProject={id:'P2',title:'项目B',history:[],currentPlan:planB};currentPlan=planB;history=currentProject.history", context);
  finish();
  await pending;
  assert.equal(vm.runInContext('currentPlan.requirement_summary.goals', context), '项目B的目标');
  assert.equal(context.projectA.currentPlan.assistant_message, '项目A处理完成');
  assert.equal(vm.runInContext('history.length', context), 0);
  context.recentFixtures=Array.from({length:12},(_,i)=>({id:`recent${i}`,title:`历史方案${i}`,updatedAt:new Date(Date.UTC(2026,8,1,i)).toISOString()}));
  vm.runInContext('currentProject=null;projects=recentFixtures;openProjects()',context);
  const recent=nodes.get('projectsList').innerHTML;
  assert.equal((recent.match(/class="project-item /g)||[]).length,10);
  assert.ok(recent.indexOf('历史方案11')<recent.indexOf('历史方案10'));
  assert.doesNotMatch(recent, /<b>历史方案[01]<\/b>/);
  assert.equal(vm.runInContext('projects.length',context),12);
});
