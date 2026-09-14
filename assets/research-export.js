(function(root, factory) {
  const api = factory();
  root.buildResearchExportSections = api.buildResearchExportSections;
  if (typeof module !== 'undefined' && module.exports) module.exports.buildResearchExportSections = api.buildResearchExportSections;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function textList(value) {
    return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
  }

  function labelledLines(items) {
    return items.flatMap(([label, values]) => textList(values).map(value => `${label}：${value}`));
  }

  function retainedSources(research) {
    return (Array.isArray(research?.sources) ? research.sources : [])
      .map(source => ({
        sourceId: text(source?.source_id),
        title: text(source?.title) || '公开资料来源',
        url: text(source?.url),
        evidence: text(source?.evidence || source?.summary || source?.content),
        publishedAt: text(source?.published_at)
      }))
      .filter(source => /^https?:\/\//i.test(source.url));
  }

  function buildResearchExportSections(research) {
    const profile = research?.customer_profile || {};
    const talent = research?.talent_development || {};
    const sources = retainedSources(research);
    const background = [
      text(profile.institution_type) && `机构类型：${text(profile.institution_type)}`,
      text(profile.business_scope) && `业务范围：${text(profile.business_scope)}`,
      ...sources.filter(source => source.evidence).map(source => `${source.title}：${source.evidence}`)
    ].filter(Boolean);
    const strategy = labelledLines([
      ['战略重点', profile.strategic_priorities],
      ['近期业务信号', profile.recent_business_signals]
    ]);
    const talentSignals = labelledLines([
      ['公开培训信号', talent.public_training_signals],
      ['能力建设信号', talent.capability_signals],
      ['人才项目', talent.talent_programs]
    ]);
    const sourceIds = new Set(sources.map(source => source.sourceId).filter(Boolean));
    const implications = (Array.isArray(research?.training_implications) ? research.training_implications : [])
      .map(implication => ({
        point: text(implication?.point),
        basis: text(implication?.basis),
        sourceIds: textList(implication?.source_ids).filter(sourceId => sourceIds.has(sourceId))
      }))
      .filter(implication => implication.point && implication.sourceIds.length)
      .map(implication => `${implication.point}${implication.basis ? `（公开资料依据：${implication.basis}）` : ''}（来源：${implication.sourceIds.join('、')}）`);
    const sourceLines = sources.map((source, index) => `${index + 1}. ${source.sourceId ? `[${source.sourceId}] ` : ''}${source.title}${source.publishedAt ? `（${source.publishedAt}）` : ''}｜${source.url}`);

    return [
      background.length && { heading: '客户公开背景', lines: background },
      strategy.length && { heading: '战略与业务重点', lines: strategy },
      talentSignals.length && { heading: '人才培养与能力建设线索', lines: talentSignals },
      implications.length && { heading: '课程设计启示', lines: implications },
      sourceLines.length && { heading: '客户公开资料来源', lines: sourceLines }
    ].filter(Boolean);
  }

  return { buildResearchExportSections };
});
