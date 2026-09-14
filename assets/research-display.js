(function(root, factory) {
  const api = factory();
  root.formatResearchCard = api.formatResearchCard;
  if (typeof module !== 'undefined' && module.exports) module.exports.formatResearchCard = api.formatResearchCard;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function fallbackEsc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function formatResearchCard(research, esc = fallbackEsc) {
    const sources = Array.isArray(research?.sources) ? research.sources : [];
    const profile = research?.customer_profile || {};
    const talent = research?.talent_development || {};
    const implications = Array.isArray(research?.training_implications) ? research.training_implications : [];
    const profileItems = [
      ['机构类型', profile.institution_type],
      ['业务范围', profile.business_scope]
    ].filter(([, value]) => value);
    const strategyItems = [
      ['战略重点', profile.strategic_priorities],
      ['近期业务信号', profile.recent_business_signals]
    ].filter(([, values]) => Array.isArray(values) && values.length);
    const talentItems = [
      ['公开培训信号', talent.public_training_signals],
      ['能力建设信号', talent.capability_signals],
      ['人才项目', talent.talent_programs]
    ].filter(([, values]) => Array.isArray(values) && values.length);
    if (!sources.length && !profileItems.length && !strategyItems.length && !talentItems.length && !implications.length) return '';

    const list = values => `<ul>${values.map(value => `<li>${esc(value)}</li>`).join('')}</ul>`;
    const labelledLists = items => items.map(([label, values]) => `<div style="margin-top:8px"><small>${esc(label)}：</small>${list(values)}</div>`).join('');
    const profileHtml = profileItems.length ? `<div style="margin-top:12px"><b>客户画像</b>${profileItems.map(([label, value]) => `<div style="margin-top:6px"><small>${esc(label)}：</small>${esc(value)}</div>`).join('')}</div>` : '';
    const strategyHtml = strategyItems.length ? `<div style="margin-top:12px"><b>战略与业务信号</b>${labelledLists(strategyItems)}</div>` : '';
    const talentHtml = talentItems.length ? `<div style="margin-top:12px"><b>人才发展信号</b>${labelledLists(talentItems)}</div>` : '';
    const implicationsHtml = implications.length ? `<div style="margin-top:12px"><b>培训设计启示</b><ul>${implications.map(implication => `<li>${esc(implication?.point)}${implication?.basis ? `（依据：${esc(implication.basis)}）` : ''}${Array.isArray(implication?.source_ids) && implication.source_ids.length ? `（来源：${implication.source_ids.map(sourceId => esc(sourceId)).join('、')}）` : ''}</li>`).join('')}</ul></div>` : '';
    const sourcesHtml = sources.length ? `<div style="margin-top:12px"><b>可追溯来源</b>${sources.map(source => `<div class="research-source"><b>${esc(source?.title)}</b><div style="margin-top:6px"><small>证据：</small>${esc(source?.evidence)}</div><div style="margin-top:6px"><small>URL：</small>${esc(source?.url)}</div></div>`).join('')}</div>` : '';

    return `<div class="section"><div class="section-title"><span class="dot"></span>客户公开资料调研</div><div class="research-card">${profileHtml}${strategyHtml}${talentHtml}${implicationsHtml}${sourcesHtml}</div></div>`;
  }

  return { formatResearchCard };
});
