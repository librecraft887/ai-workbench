import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../edge-functions/api/chat.js';
import { proposalFallback, normalizeProposal } from '../edge-functions/lib/proposal.js';
import { researchCustomer } from '../edge-functions/lib/research/service.js';
import '../assets/research-session.js';
import '../assets/training-workflow.js';

const requirement = { customer_name: '示例银行', audience: '中层干部', theme: '数字化经营', days: '1天', sessions: '1讲', goals: '提升数字化业务管理能力', business_challenges: '业务数据应用不足', learner_context: '具备业务管理经验', preferences: '案例研讨' };
const research = {
  status: 'succeeded', customer_name: '示例银行',
  sources: [{ source_id: 'S1', title: '示例银行年度报告', url: 'https://example.test/report?a=1&b=2', source_type: 'official', evidence: '推进数字化经营与数据应用。' }],
  training_implications: [{ point: '数据驱动决策', basis: '年度报告强调数据应用', source_ids: ['S1'] }]
};
const proposal = {
  project_background: { text: '公开资料提出推进数字化经营与数据应用。[S1]本项目围绕中层干部的数字化业务管理能力设计培训。', source_ids: ['S1'] },
  client_needs_analysis: { text: '依据培训需求，本次重点回应业务数据应用不足的问题，建议发展数据分析与经营判断能力。', source_ids: [] },
  design_logic: { text: '课程以“数据决策”模块联系岗位问题，通过案例研讨练习数字化经营分析，具体配课见下文。', source_ids: [] }
};

function request(body) {
  return { env: { DEEPSEEK_API_KEY: 'test', CLOUDBASE_ENV_ID: 'test', CLOUDBASE_API_KEY: 'test' }, request: new Request('https://example.test/api/chat', { method: 'POST', body: JSON.stringify(body) }) };
}

test('real handlers prepare, research, and compose a sourced client proposal in order', async () => {
  const original = globalThis.fetch;
  const events = [];
  let designPrompt;
  globalThis.fetch = async (url, options) => {
    if (url.includes('/responses')) {
      events.push('research');
      return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(research), annotations: [{ type: 'url_citation', url: research.sources[0].url }] }] }] });
    }
    if (url.includes('/chat/completions')) {
      const payload = JSON.parse(options.body);
      const prompt = payload.messages.at(-1).content;
      if (prompt.includes('完整用户对话')) {
        events.push('prepare');
        return Response.json({ choices: [{ message: { content: JSON.stringify(requirement) } }] });
      }
      events.push('compose');
      designPrompt = prompt;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ proposal, requirement_summary: { goals: '模型篡改目标' }, formal_schedule: [{ day: '第1天', period: '上午', module: '数据决策', course_title: '数据驱动经营', teacher_name: '库内老师', reason: '回应数据应用问题，练习经营判断，安排在认知与方法阶段。' }], external_candidates: [] }) } }] });
    }
    events.push('faculty');
    if (url.includes('/teachers?')) return Response.json([{ business_code: 'T1', name: '库内老师', institution: '已核验单位', status: 'active', source_type: '库内师资', profile: '已核验简介', profile_status: 'verified' }]);
    if (url.includes('/teacher_courses?')) return Response.json([{ teacher_business_code: 'T1', course_business_code: 'C1', confirmed_status: 'confirmed' }]);
    if (url.includes('/courses?')) return Response.json([{ business_code: 'C1', title: '数据驱动经营', topics: '数据决策', audiences: '中层干部', status: 'active' }]);
    throw new Error(`unexpected request: ${url}`);
  };
  try {
    const plan = await globalThis.runTrainingWorkflow({ customerName: requirement.customer_name, messages: [{ role: 'user', content: '中层干部，数字化经营，1天1讲，目标提升数字化业务管理能力。' }], post: async body => {
      const response = await onRequestPost(request(body));
      assert.equal(response.status, 200);
      return response.json();
    }});
    assert.equal(plan.mode, 'plan');
    assert.ok(events.indexOf('prepare') < events.indexOf('research'));
    assert.ok(events.indexOf('research') < events.indexOf('faculty'));
    assert.ok(events.indexOf('faculty') < events.indexOf('compose'));
    assert.match(designPrompt, /推进数字化经营与数据应用/);
    assert.match(designPrompt, /项目背景/);
    assert.equal(plan.requirement_summary.goals, requirement.goals);
    assert.deepEqual(plan.proposal.project_background, proposal.project_background);
    assert.equal(plan.formal_schedule[0].teacher_profile, '已核验简介');
    assert.equal(plan.customer_research.sources[0].source_id, 'S1');
  } finally { globalThis.fetch = original; }
});

test('composition is rejected if research has not been attempted', async () => {
  const response = await onRequestPost(request({ action: 'compose_training_plan', training_request: requirement }));
  assert.equal(response.status, 409);
});

test('unsupported citations are replaced with analysis based only on confirmed needs', () => {
  const fallback = proposalFallback(requirement);
  const normalized = normalizeProposal({ project_background: { text: '客户战略事实[S99]', source_ids: ['S99'] } }, fallback, research.sources);
  assert.equal(normalized.project_background, fallback.project_background);
  assert.doesNotMatch(normalized.project_background.text, /客户战略事实/);
});

test('backup research questions include the actual training subject and audience', async () => {
  const queries = [];
  const result = await researchCustomer({ customerName: requirement.customer_name, trainingRequest: requirement, primarySearch: async () => { throw new Error('unavailable'); }, backupSearch: async query => {
    queries.push(query);
    return { sources: [{ title: '公开来源', url: 'https://example.test/report', content: '公开摘要' }] };
  }});
  assert.equal(queries.length, 4);
  assert.ok(queries.some(query => query.includes(requirement.theme)));
  assert.ok(queries.some(query => query.includes(requirement.audience)));
  assert.equal(result.provider, 'backup');
  assert.equal(result.sources.length, 1);
});

export { requirement, research, proposal };
