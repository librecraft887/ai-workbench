(function(root, factory) {
  const api = factory();
  root.formatResearchCard = api.formatResearchCard;
  if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function fallbackEsc(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }
  function formatResearchCard(research, esc = fallbackEsc) {
    const sources = (Array.isArray(research?.sources) ? research.sources : []).filter(source => /^https?:\/\//i.test(source?.url || ''));
    if (!sources.length) return '';
    return `<details class="section evidence"><summary>调研资料（内部参考，${sources.length}条）</summary><div class="research-card" style="margin-top:10px">${sources.map(source => `<div style="margin:10px 0"><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title || '相关资料')}</a>${source.published_at ? `<small>（${esc(source.published_at)}）</small>` : ''}${source.evidence ? `<div style="margin-top:5px;color:#9fb0c8">${esc(source.evidence)}</div>` : ''}</div>`).join('')}</div></details>`;
  }
  return { formatResearchCard };
});
