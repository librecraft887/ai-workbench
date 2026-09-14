(function(root, factory) {
  const api = factory(root);
  Object.assign(root, api);
  if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  const fields = [['project_background', '项目背景'], ['client_needs_analysis', '客户需求分析'], ['design_logic', '方案设计逻辑']];
  function buildProposalSections(plan) {
    const r = plan?.requirement_summary || {};
    const legacy = {
      project_background: `本项目面向${r.audience || '参训人员'}，围绕“${r.theme || '培训主题'}”开展${r.days || ''}专题培训。`,
      client_needs_analysis: `本次培训以${r.goals || '已明确的学习需求'}为依据，结合参训人员岗位实践设计课程内容。`,
      design_logic: plan?.proposal ? `围绕“${r.theme || '岗位能力提升'}”，方案按共同认知、方法理解与岗位应用组织学习，模块之间相互衔接，帮助参训人员形成可用于工作的分析思路。具体课程对上述学习路径作进一步展开。` : '本方案需要按新的流程更新分析。请在对话中补充培养目标，或点击“重新调研并更新方案”，形成与课程安排对应的设计逻辑。'
    };
    return fields.map(([field, heading]) => {
      const section = plan?.proposal?.[field];
      const text = typeof section?.text === 'string' && section.text.trim() ? section.text.trim() : legacy[field];
      const paragraphs = root.clientParagraphs(text);
      return { heading, lines: paragraphs.length ? paragraphs : root.clientParagraphs(legacy[field]) };
    });
  }
  function formatProposal(plan, esc) {
    return buildProposalSections(plan).map(section => `<div class="section"><div class="section-title"><span class="dot"></span>${esc(section.heading)}</div><div class="research-card">${section.lines.map(line => `<p style="margin:0 0 10px;line-height:1.9;text-indent:2em">${esc(line)}</p>`).join('')}</div></div>`).join('');
  }
  return { buildProposalSections, formatProposal };
});
