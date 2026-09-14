const string = value => typeof value === 'string' ? value.trim() : '';
export const PROPOSAL_FIELDS = ['project_background', 'client_needs_analysis', 'design_logic'];

export function proposalFallback(requirement, schedule = []) {
  const r = requirement;
  const modules = [...new Set(schedule.filter(row => row.course_title !== '待匹配').map(row => string(row.module)).filter(Boolean))];
  return {
    project_background: { text: `本项目面向${r.audience}开展“${r.theme}”专题培训，紧扣${r.goals}的培养方向，将专题学习与岗位实践相结合。\n\n培训安排${r.days}、${r.sessions}，通过聚焦重点问题、深化方法理解与促进实践应用，帮助参训人员把学习内容转化为推动工作的具体思路。`, source_ids: [] },
    client_needs_analysis: { text: `本次培训围绕“${r.goals}”展开${r.business_challenges ? `，重点回应“${r.business_challenges}”这一实际问题` : ''}。面向${r.audience}${r.learner_context ? `，结合“${r.learner_context}”的学员基础` : ''}，学习内容需要兼顾对问题的系统认识与对方法的实际运用。\n\n课程将帮助学员建立分析框架，通过案例和岗位问题讨论深化理解，进一步形成可应用于工作的行动思路。${r.preferences ? `教学组织同时兼顾“${r.preferences}”的实施要求。` : ''}`, source_ids: [] },
    design_logic: { text: `围绕“${r.theme}”和上述培养目标，方案沿“建立共同认知—掌握关键方法—联系岗位应用”的学习路径展开${modules.length ? `，以${modules.map(m => `“${m}”`).join('、')}等模块组织内容` : ''}。模块组合兼顾主题关联、对象适配与学习递进，使专题知识能够逐步连接到参训人员的实际工作。\n\n前段学习建立分析框架，中段以专题讲授和案例研讨深化方法理解，后段通过岗位问题讨论推动应用，帮助学员形成后续行动建议。具体课程安排对上述模块作进一步展开。`, source_ids: [] }
  };
}

export function normalizeProposal(value, fallback, sources = []) {
  const retained = new Set(sources.map(source => source.source_id));
  return Object.fromEntries(PROPOSAL_FIELDS.map(field => {
    const section = value?.[field];
    const ids = Array.isArray(section?.source_ids) ? [...new Set(section.source_ids)] : [];
    const text = string(section?.text);
    const mentions = [...text.matchAll(/\[(S\d+)\]/g)].map(match => match[1]);
    if (!text || [...ids, ...mentions].some(id => !retained.has(id))) return [field, fallback[field]];
    return [field, { text, source_ids: [...new Set([...ids, ...mentions])] }];
  }));
}

export function proposalPrompt(requirement, research) {
  return `你正在编写可直接提交客户的定制培训方案。需求已通过前期对话明确，客户公开资料已检索完成，接下来先形成完整分析，再依据分析编排课程。

已确认需求：${JSON.stringify(requirement)}
可使用的调研资料：${JSON.stringify(research)}

写作立场：以培训项目服务团队的身份直接面向客户，围绕客户实际业务、岗位责任与人才发展关切形成共鸣。语言应体现我们理解贵单位的工作场景和培养目标，专业、具体、自然，不虚构客户未说明的内部状况。少用机械的“建议关注”“依据已明确需求”等句式。
方案正文必须包含 proposal 的三个字段，每个字段为 {"text":"连贯分析，适当使用\\n\\n分段","source_ids":["S1"]}：
1. project_background（项目背景）：把与本次主题相关的客户战略方向、业务变化、人才培养线索综合成150—250字的分析。说明为什么在当前背景下开展本项目，以及与本次培养目标的关联，最多使用2—3条关键事实。
2. client_needs_analysis（客户需求分析）：围绕培训对象、培养目标与业务问题，分析重点发展的2—3类能力，连接客户工作场景、岗位要求与学习重点。采用“本项目聚焦…”“参训人员需要…”“课程重点回应…”等方案表达，不把分析推导称为已经证实的内部短板。写成150—250字，按逻辑分为1—2段。
3. design_logic（方案设计逻辑）：以模块设计依据、模块之间的关系和整体学习路径为主，说明为什么采用这一模块组合、如何从认知到方法再到应用，以及教学方式如何支持培养目标。写成200—350字、2段左右，自然过渡到配课方案。无需逐门课程展开，必要时仅举1—2门实际课程作为补充。只描述课表实际包含的模块，未落实的实践安排表述为项目建议。

training_overview 输出完整培训安排：goals（简洁的培养目标，未委托建议时忠实保留原目标）、learning_methods（根据目标、模块、学员特点与实施偏好设计教学方式）、expected_outputs（合理的学习成果，如分析框架、工具应用思路或岗位行动建议）。所有值必须有内容，不填空、不填“—”。需求未说明的教学组织与学习成果作为本方案设计补充，不虚构日期、地点、人数、预算等执行事实。

课程行 reason 用1—2句适当解释课程回应的学习重点和能力目标，避免逐行重复整套设计逻辑。相关调研编号仅放该行 source_ids，不能写进 reason。
可靠客户事实仅取自 sources.evidence，并把关联编号放在 source_ids 供内部核验。正文 text、reason、training_overview 严禁出现[S1]等编号、来源链接、“结合公开资料”“公开资料显示”“公开检索线索提及”等检索口径。provider=backup 的摘要未经原文核验时，避开无法确证的具体战略、数字和官方定性，可围绕已确认主题与目标形成方案设计。
不得逐条粘贴资料、重复事实或介绍数据来源。正文严禁出现库内师资、正式库、测试关系、外部候选、数据库资格过滤等内部操作说明，例如“正式课表均来自库内师资与课程，未安排外部候选”。这些规则由服务端掌握，不是客户方案内容。
资料状态为 failed、retryable_failure、skipped 或 no_reliable_sources 时，正文只依据已确认需求，source_ids 为空；不要写未证实的客户战略。
需求值必须保持原样。所有正文段落与课程理由必须和实际课表一致。`;
}

export function normalizeTrainingOverview(value, requirement) {
  const delegated = /由方案|待客户确认/.test(requirement.goals || '');
  const methods = [...new Set((requirement.preferences || '').match(/专题讲授|案例研讨|案例讨论|研讨|互动|实操|工作坊|讲授|岗位问题讨论|行动学习/g) || [])].join('、');
  return {
    goals: !delegated && requirement.goals ? requirement.goals : string(value?.goals) || '提升专题理解、方法运用与岗位实践能力',
    learning_methods: string(value?.learning_methods) || methods || '专题讲授、案例研讨与岗位问题讨论',
    expected_outputs: string(value?.expected_outputs) || '形成岗位问题分析框架、方法应用思路与后续行动建议'
  };
}
