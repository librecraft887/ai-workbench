import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/research-session.js';
import '../assets/training-workflow.js';
import { onRequestPost } from '../edge-functions/api/chat.js';

test('clarification stops before research and course composition', async () => {
  const actions = [];
  const result = await globalThis.runTrainingWorkflow({ messages: [], post: async body => {
    actions.push(body.action);
    return { mode: 'clarify', questions: ['培养目标'] };
  }});
  assert.equal(result.mode, 'clarify');
  assert.deepEqual(actions, ['prepare_training']);
});

test('research finishes before composition and its findings are passed to design', async () => {
  const actions = [];
  const requirement = { customer_name: '示例银行', audience: '中层干部', theme: '数字化经营', days: '2天', goals: '提升数字化业务管理能力' };
  const research = { status: 'succeeded', sources: [{ source_id: 'S1', url: 'https://example.test/strategy', evidence: '推进数字化业务' }] };
  const result = await globalThis.runTrainingWorkflow({ messages: [], post: async body => {
    actions.push(body.action);
    if (body.action === 'prepare_training') return { mode: 'requirements_ready', requirement_summary: requirement };
    if (body.action === 'research_customer') return research;
    assert.equal(body.customer_research, research);
    assert.equal(body.training_request, requirement);
    return { mode: 'plan' };
  }});
  assert.equal(result.mode, 'plan');
  assert.deepEqual(actions, ['prepare_training', 'research_customer', 'compose_training_plan']);
});

test('a research failure still reaches design without stale customer facts', async () => {
  let composed;
  await globalThis.runTrainingWorkflow({ messages: [], post: async body => {
    if (body.action === 'prepare_training') return { mode: 'requirements_ready', requirement_summary: { customer_name: '示例客户' } };
    if (body.action === 'research_customer') throw new Error('timeout');
    composed = body;
    return { mode: 'plan' };
  }});
  assert.deepEqual(composed.customer_research.sources, []);
  assert.equal(composed.customer_research.status, 'failed');
});

test('a changed training objective causes fresh research rather than reusing old findings', async () => {
  const old = { customer_name: '示例银行', goals: '提升领导力' };
  const next = { ...old, goals: '提升数据决策能力' };
  const actions = [];
  await globalThis.runTrainingWorkflow({ messages: [], cachedResearch: { status: 'succeeded', sources: [{ evidence: '旧调研' }] }, cachedFingerprint: globalThis.researchRequestFingerprint(old), post: async body => {
    actions.push(body.action);
    if (body.action === 'prepare_training') return { mode: 'requirements_ready', requirement_summary: next };
    if (body.action === 'research_customer') return { status: 'succeeded', sources: [{ evidence: '新调研' }] };
    assert.equal(body.customer_research.sources[0].evidence, '新调研');
    return { mode: 'plan' };
  }});
  assert.deepEqual(actions, ['prepare_training', 'research_customer', 'compose_training_plan']);
});

test('prepare endpoint asks for the training objective before touching the faculty database', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ audience: '中层干部', theme: '数字化经营', days: '2天', goals: '' }) } }] }));
  };
  try {
    const response = await onRequestPost({ env: { DEEPSEEK_API_KEY: 'test' }, request: new Request('https://example.test/api/chat', { method: 'POST', body: JSON.stringify({ action: 'prepare_training', customer_name: '示例银行', messages: [{ role: 'user', content: '中层干部，数字化经营，2天' }] }) }) });
    const data = await response.json();
    assert.equal(data.mode, 'clarify');
    assert.match(data.assistant_message, /目标|解决/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
