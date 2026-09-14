import test from 'node:test';
import assert from 'node:assert/strict';
import {researchTimeWindow} from '../edge-functions/lib/research/time-window.js';
import {buildResearchPrompt} from '../edge-functions/api/chat.js';

test('uses the actual China-calendar research day and previous year',()=>{
  assert.deepEqual(researchTimeWindow('2026-09-13T17:00:00Z'),{start:'2025-09-14',end:'2026-09-14'});
});
test('clamps a leap-day anniversary to the final day of February',()=>{
  assert.deepEqual(researchTimeWindow('2024-02-29T04:00:00Z'),{start:'2023-02-28',end:'2024-02-29'});
});
test('research prompt prioritizes the rolling year without inventing data periods',()=>{
  const prompt=buildResearchPrompt('示例客户',{theme:'业务转型'},{now:'2026-09-14T00:00:00Z'});
  assert.match(prompt,/2025-09-14至2026-09-14/);
  assert.match(prompt,/不能用网页发布日期代替指标年份/);
  assert.match(prompt,/较早资料仅用于/);
});
