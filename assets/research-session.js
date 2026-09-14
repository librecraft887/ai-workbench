(function(root, factory) {
  const api = factory();
  root.researchRequestFingerprint = api.researchRequestFingerprint;
  root.isActiveProject = api.isActiveProject;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports.researchRequestFingerprint = api.researchRequestFingerprint;
    module.exports.isActiveProject = api.isActiveProject;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const REQUEST_FIELDS = ['audience', 'industry', 'theme', 'days', 'sessions', 'goals'];

  function researchRequestFingerprint(request = {}) {
    return JSON.stringify(Object.fromEntries(REQUEST_FIELDS.map(field => [field, String(request?.[field] ?? '').trim()])));
  }

  function isActiveProject(initiatingProject, activeProject) {
    return Boolean(initiatingProject?.id && initiatingProject.id === activeProject?.id);
  }

  return { researchRequestFingerprint, isActiveProject };
});
