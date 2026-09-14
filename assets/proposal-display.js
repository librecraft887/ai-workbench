(function(root, factory) {
  const api = factory();
  Object.assign(root, api);
  if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const fields = [['project_background', '项目背景'], ['client_needs_analysis', '客户需求分析'], ['design_logic', '方案设计逻辑']];
  function buildProposalSections(plan) {
    const r = plan?.requirement_summary || {};
    const legacy = {
      project_background: `本项目面向${r.audience || '参训人员'}，围绕“${r.theme || '培训主题'}”开展${r.days || ''}专题培训。`,
      client_needs_analysis: `本次培训以${r.goals || '已明确的学习需求'}为依据，结合参训人员岗位实践设计课程内容。`,
      design_logic: '本方案需要按新的流程更新分析。请在对话中补充培养目标，或点击“重新调研并更新方案”，形成与课程安排对应的设计逻辑。'
    };
    return fields.map(([field, heading]) => {
      const section = plan?.proposal?.[field];
      let text = typeof section?.text === 'string' && section.text.trim() ? section.text.trim().replace(/\s*\n\s*/g, ' ') : legacy[field];
      const ids = Array.isArray(section?.source_ids) ? section.source_ids.filter(id => /^S\d+$/.test(id)) : [];
      const missing = ids.filter(id => !text.includes(`[${id}]`));
      if (missing.length) text += ` ${missing.map(id => `[${id}]`).join('')}`;
      return { heading, lines: [text] };
    });
  }
  function formatProposal(plan, esc) {
    return buildProposalSections(plan).map(section => `<div class="section"><div class="section-title"><span class="dot"></span>${esc(section.heading)}</div><div class="research-card"><p style="margin:0;line-height:1.9">${esc(section.lines[0])}</p></div></div>`).join('');
  }
  return { buildProposalSections, formatProposal };
});
