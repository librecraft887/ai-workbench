import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/client-copy.js';
import { normalizeTrainingOverview } from '../edge-functions/lib/proposal.js';

test('client paragraphs suppress source markers and internal selection statements', () => {
  const text = globalThis.cleanClientText('结合公开资料，贵单位重视能力建设。[S6][S7][S8]正式课表均来自库内师资与课程，未安排外部候选。模块设计围绕实际工作展开。');
  assert.equal(text, '贵单位重视能力建设。模块设计围绕实际工作展开。');
});
test('placeholder evidence is hidden and genuine evidence links are retained safely', () => {
  const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  assert.equal(globalThis.formatCourseEvidence({ evidence: '正式测试关系' },esc),'');
  assert.equal(globalThis.formatCourseEvidence({ evidence: '', evidence_sources: [] },esc),'');
  const html = globalThis.formatCourseEvidence({ evidence: '讲授记录见 https://example.test/report?a=1&b=2' },esc);
  assert.match(html, /查看依据/);
  assert.match(html, /href="https:\/\/example.test\/report\?a=1&amp;b=2"/);
});
test('training overview fills learning design without changing confirmed goals', () => {
  const overview = normalizeTrainingOverview({ goals: '错误目标' }, { goals: '提升团队执行能力' });
  assert.equal(overview.goals,'提升团队执行能力');
  assert.ok(overview.learning_methods);
  assert.ok(overview.expected_outputs);
  for (const [, value] of globalThis.buildTrainingOverview({requirement_summary:{audience:'中层干部',theme:'执行力',days:'2天',sessions:'4讲'},training_overview:overview})) assert.ok(value.trim());
});
