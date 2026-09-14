(function(root, factory) {
  const api = factory();
  Object.assign(root, api);
  if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function cleanClientText(value) {
    return String(value || '')
      .replace(/(?:【|\[)\s*S\d+(?:\s*[,，、]\s*S?\d+)*\s*(?:】|\])/gi, '')
      .replace(/(?:（|\()\s*(?:来源|来源编号|公开资料依据)[：:][^）)\n]*(?:）|\))/g, '')
      .replace(/(?:结合|根据|依据)公开资料(?:显示)?[，,：:\s]*/g, '')
      .replace(/(?:公开检索线索提及|公开资料(?:显示|表明|提及))[，,：:\s]*/g, '')
      .replace(/[^。！？\n]*(?:正式课表|正式课程|正式推荐课表)[^。！？\n]*(?:库内|正式库)[^。！？\n]*[。！？]?/g, '')
      .replace(/[^。！？\n]*(?:未安排外部候选|外部候选不能进入正式课表)[^。！？\n]*[。！？]?/g, '')
      .replace(/以及[ \t\u3000]+/g, '以及')
      .replace(/[ \t]+([，。；！？])/g, '$1')
      .replace(/^[，,；;\s]+/g, '').trim();
  }
  function clientParagraphs(value) {
    const text = cleanClientText(value);
    if (!text) return [];
    const explicit = text.split(/\n+/).map(part => part.trim()).filter(Boolean);
    if (explicit.length > 1) return explicit;
    if (text.length <= 180) return [text];
    const sentences = text.match(/[^。！？]+[。！？]?/g) || [text];
    const paragraphs = [];
    let paragraph = '';
    for (const sentence of sentences) {
      paragraph += sentence;
      if (paragraph.length >= 130) { paragraphs.push(paragraph); paragraph = ''; }
    }
    if (paragraph) {
      if (paragraph.length < 45 && paragraphs.length) paragraphs[paragraphs.length - 1] += paragraph;
      else paragraphs.push(paragraph);
    }
    return paragraphs;
  }
  function meaningfulEvidence(value) {
    const text = String(value || '').trim();
    if (!text || /^(?:正式)?测试(?:关系|数据|课程)/.test(text)) return '';
    if (/^(?:已确认)?(?:正式)?师资课程关系[；;，,]|^课程编号|^教师编号/.test(text)) return '';
    if (/^(?:已确认|已核验|正式关系|已确认授课关系)[。.!！\s]*$/.test(text)) return '';
    return text;
  }
  function formatCourseEvidence(row, esc) {
    const evidence = meaningfulEvidence(row.evidence);
    const links = (Array.isArray(row.evidence_sources) ? row.evidence_sources : []).filter(source => /^https?:\/\//i.test(source?.url || ''));
    if (!evidence && !links.length) return '';
    let content = '';
    let position = 0;
    for (const match of evidence.matchAll(/https?:\/\/[^\s<>"'，。；）]+/g)) {
      content += esc(evidence.slice(position, match.index));
      content += `<a href="${esc(match[0])}" target="_blank" rel="noopener noreferrer">${esc(match[0])}</a>`;
      position = match.index + match[0].length;
    }
    content += esc(evidence.slice(position));
    return `<details class="evidence"><summary>查看依据</summary>${content ? `<div>${content}</div>` : ''}${links.map(source => `<div><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title || '相关资料')}</a></div>`).join('')}</details>`;
  }
  function buildTrainingOverview(plan) {
    const r = plan?.requirement_summary || {};
    const o = plan?.training_overview || {};
    const methods = [...new Set((r.preferences || '').match(/专题讲授|案例研讨|案例讨论|研讨|互动|实操|工作坊|讲授|岗位问题讨论|行动学习/g) || [])].join('、');
    return [
      ['培训对象', r.audience || o.audience || '项目参训人员'],
      ['培训主题', r.theme || o.theme || '岗位能力提升'],
      ['培训周期', r.days || o.days || '按项目安排实施'],
      ['培养目标', o.goals || r.goals || '提升专题理解、方法运用与岗位实践能力'],
      ['教学方式', o.learning_methods || methods || '专题讲授、案例研讨与岗位问题讨论'],
      ['预期学习成果', o.expected_outputs || '形成岗位问题分析思路与后续行动建议']
    ].map(([label, value]) => [label, cleanClientText(value)]);
  }
  return { cleanClientText, clientParagraphs, meaningfulEvidence, formatCourseEvidence, buildTrainingOverview };
});
