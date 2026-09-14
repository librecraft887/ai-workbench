(function(root, factory) {
  const api = factory(root);
  Object.assign(root, api);
  if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  async function runTrainingWorkflow({ messages, customerName, previousRequirement, cachedResearch, cachedFingerprint, forceResearch = false, post, onStage = () => {}, onResearch = () => {} }) {
    onStage('requirements');
    const prepared = await post({ action: 'prepare_training', messages, customer_name: customerName, requirement_summary: previousRequirement });
    if (prepared.mode === 'clarify') return prepared;
    if (prepared.mode !== 'requirements_ready') throw new Error('需求整理未完成，请重试');
    const requirement = prepared.requirement_summary;
    const fingerprint = root.researchRequestFingerprint(requirement);
    let research = null;
    if (requirement.customer_name && !requirement.skip_research) {
      onStage('research');
      if (!forceResearch && cachedResearch && cachedFingerprint === fingerprint) {
        research = cachedResearch;
      } else {
        try {
          research = await post({ action: 'research_customer', customer_name: requirement.customer_name, training_request: requirement });
        } catch {
          research = { status: 'failed', sources: [], user_message: '公开资料暂未获取成功，本次方案先依据已确认需求设计。' };
        }
      }
    } else {
      research = { status: 'skipped', sources: [] };
    }
    await onResearch(research, requirement, fingerprint);
    onStage('design');
    return post({ action: 'compose_training_plan', messages, training_request: requirement, customer_research: research, research_attempted: true });
  }
  return { runTrainingWorkflow };
});
