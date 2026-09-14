import { researchCustomer as runCustomerResearch } from "../lib/research/service.js";
import { createBochaSearch } from "../lib/research/providers/bocha.js";
import { proposalFallback, normalizeProposal, proposalPrompt, normalizeTrainingOverview } from "../lib/proposal.js";
import { researchTimeWindow } from "../lib/research/time-window.js";

const SYSTEM_PROMPT = `你是“AI教研助手”，服务于培训、干部教育、终身教育、企业培训等教研场景。

核心事实规则：
1. 正式课表只能使用服务端提供的 formal_candidates。
2. formal_candidates 已由服务端限定为：库内师资 + active 教师 + active 课程 + confirmed 教师课程关系。
3. external_candidates 只能作为外部候选补充，不能进入正式课表。
4. 不得编造数据库中不存在的老师、单位、课程名称、教师课程关系、学历、职务、兼职、成果、荣誉或来源。
5. 数据库没有合适正式师资时，对应时段写“待匹配”，绝不能虚构。
6. 师资简介仅当服务端提供了有依据的 profile 时才可以使用；没有则省略。
7. 使用简体中文。
8. 必须输出严格 JSON，不要输出 Markdown 代码块或 JSON 之外的文字。`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function cloudbaseGet(envId, apiKey, table, query = "") {
  const base = `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/${table}`;
  const url = query ? `${base}?${query}` : base;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json"
    }
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`CloudBase ${table} 查询失败 ${res.status}: ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`CloudBase ${table} 返回非 JSON 数据`);
  }
}

function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch {}
  }
  return null;
}

async function callDeepSeek(apiKey, messages, maxTokens = 1800) {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages,
      thinking: { type: "disabled" },
      max_tokens: maxTokens,
      stream: false
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `DeepSeek API 返回 ${res.status}`);
  return data?.choices?.[0]?.message?.content || "";
}


function normalizedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedArray(value) {
  return Array.isArray(value)
    ? value.map(normalizedString).filter(Boolean)
    : [];
}

function normalizedSourceUrl(value) {
  const url = normalizedString(value);
  if (!/^https?:\/\//i.test(url)) return "";

  try {
    return new URL(url).toString();
  } catch {
    return "";
  }
}

function normalizedSourceProvider(value) {
  const provider = normalizedString(value);
  return ["backup", "deepseek_web_search"].includes(provider) ? provider : "";
}

function collectCitationUrls(output) {
  const urls = new Set();
  const collect = value => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== "object") return;

    const url = normalizedSourceUrl(value.url || value.href);
    if (url) urls.add(url);
    Object.values(value).forEach(child => {
      if (child && typeof child === "object") collect(child);
    });
  };

  for (const item of Array.isArray(output) ? output : []) {
    if (item?.type === "message") {
      for (const part of Array.isArray(item?.content) ? item.content : []) {
        collect(part?.annotations);
        collect(part?.citations);
        collect(part?.sources);
        collect(part?.references);
      }
      continue;
    }

    if (/search|citation/i.test(String(item?.type || ""))) collect(item);
  }

  return urls;
}

function normalizeTrainingIntelligence(result, citationUrls) {
  const requireCitation = citationUrls instanceof Set;
  const sourceIdMap = new Map();
  const sources = [];

  for (const source of Array.isArray(result?.sources) ? result.sources : []) {
    const url = normalizedSourceUrl(source?.url);
    if (!url || (requireCitation && !citationUrls.has(url)) || sources.length >= 8) continue;

    const originalId = normalizedString(source?.source_id).toUpperCase();
    const sourceId = `S${sources.length + 1}`;
    if (originalId && !sourceIdMap.has(originalId)) {
      sourceIdMap.set(originalId, sourceId);
    }
    sourceIdMap.set(sourceId, sourceId);

    const sourceType = normalizedString(source?.source_type).toLowerCase();
    const provider = normalizedSourceProvider(source?.provider);
    sources.push({
      source_id: sourceId,
      title: normalizedString(source?.title),
      url,
      published_at: normalizedString(source?.published_at),
      source_type: ["official", "government", "media", "other"].includes(sourceType)
        ? sourceType
        : "other",
      evidence: normalizedString(source?.evidence || source?.summary || source?.content),
      ...(provider ? { provider } : {})
    });
  }

  const normalizeSourceIds = value => [...new Set(
    normalizedArray(value)
      .map(sourceId => sourceIdMap.get(sourceId.toUpperCase()))
      .filter(Boolean)
  )];

  const trainingImplications = (Array.isArray(result?.training_implications)
    ? result.training_implications
    : [])
    .map(implication => ({
      point: normalizedString(implication?.point),
      basis: normalizedString(implication?.basis),
      source_ids: normalizeSourceIds(implication?.source_ids)
    }))
    .filter(implication => implication.source_ids.length > 0);

  return {
    customer_profile: {
      institution_type: normalizedString(result?.customer_profile?.institution_type),
      business_scope: normalizedString(result?.customer_profile?.business_scope),
      strategic_priorities: normalizedArray(result?.customer_profile?.strategic_priorities),
      recent_business_signals: normalizedArray(result?.customer_profile?.recent_business_signals)
    },
    talent_development: {
      public_training_signals: normalizedArray(result?.talent_development?.public_training_signals),
      capability_signals: normalizedArray(result?.talent_development?.capability_signals),
      talent_programs: normalizedArray(result?.talent_development?.talent_programs)
    },
    training_implications: trainingImplications,
    sources
  };
}

export function buildResearchPrompt(customerName, request = {}, options = {}) {
  const window = researchTimeWindow(options.now);
  const trainingRequest = {
    audience: normalizedString(request?.audience),
    industry: normalizedString(request?.industry),
    theme: normalizedString(request?.theme),
    days: normalizedString(request?.days),
    sessions: normalizedString(request?.sessions),
    goals: normalizedString(request?.goals),
    business_challenges: normalizedString(request?.business_challenges),
    learner_context: normalizedString(request?.learner_context),
    preferences: normalizedString(request?.preferences)
  };

  return `请调研客户“${normalizedString(customerName)}”，围绕本次培训需求检索公开资料。

本次培训需求：
${JSON.stringify(trainingRequest, null, 2)}

资料时效：本次调研日期为${window.end}，优先研究最近一年（${window.start}至${window.end}）的战略重点、业务进展、人才培养和培训举措。年度指标优先使用最新已披露完整年度或最新报告期数据，核对数据所属时期，不能用网页发布日期代替指标年份。
较早资料仅用于仍有效的机构背景或中长期战略补充，不作为近期业务变化的主要依据。没有近一年可靠数据时保留信息缺口，不用旧数据冒充现状；没有标注发布日期时不要猜日期。

重点覆盖以下范围：
1. 战略：中长期战略、年度重点与近期重点工作；
2. 业务：机构性质、主营业务/核心职责，以及与主题相关的业务变化；
3. 人才培养：公开的人才队伍、干部培养和培训体系信息；
4. 能力建设：数字化、人工智能、金融科技、岗位能力等公开线索；
5. 培训设计：结合已明确的培训对象、主题、培养目标和业务问题，筛选最影响本次培训的2—3条背景线索，提出对应的能力方向、课程模块和教学方式建议。只检索有助于本次培训方案设计的信息，避免泛泛介绍客户全部业务。

事实规则：
1. 只能使用本次联网搜索实际找到的公开信息，不得使用模型记忆补充客户事实。
2. 优先客户官网、政府/监管官网、官方新闻稿和权威媒体；普通网页仅作补充。
3. 不得把推测写成客户内部事实或已明确需求。培训设计启示只能使用“结合公开资料可关注”的分析口径。
4. 每条来源 URL 必须来自本次搜索结果，不得编造 URL；无可靠依据的字段留空字符串或空数组。
5. 每条 training_implications 必须引用至少一个 sources 中的 source_id；没有可靠来源时不要输出该启示。
6. 只输出严格 JSON，不要输出 Markdown 代码块或 JSON 之外的文字。输出对象只能包含 customer_profile、talent_development、training_implications、sources 四个字段。

输出 JSON：
{
  "customer_profile": {
    "institution_type": "",
    "business_scope": "",
    "strategic_priorities": [],
    "recent_business_signals": []
  },
  "talent_development": {
    "public_training_signals": [],
    "capability_signals": [],
    "talent_programs": []
  },
  "training_implications": [
    { "point": "", "basis": "", "source_ids": ["S1"] }
  ],
  "sources": [
    {
      "source_id": "S1",
      "title": "",
      "url": "",
      "published_at": "",
      "source_type": "official|government|media|other",
      "evidence": ""
    }
  ]
}

最多保留 8 条最可靠、最相关来源。`;
}

function isWebResearchOptions(value) {
  return value && typeof value === "object" && (
    Object.hasOwn(value, "fetchImpl") || Object.hasOwn(value, "timeoutMs")
  );
}

export async function callDeepSeekWebResearch(apiKey, customerName, request = {}, options = {}) {
  if (isWebResearchOptions(request) && !isWebResearchOptions(options)) {
    options = request;
    request = {};
  }

  const {
    fetchImpl = fetch,
    timeoutMs = 35000
  } = options;
  const instructions = `你是企业/机构培训项目前期公开资料调研助手。必须先使用联网搜索工具，再根据搜索到的公开网页作答。\n\n事实规则：\n1. 只能使用本次联网搜索实际找到的公开信息，不得使用模型记忆补充客户事实。\n2. 优先客户官网、政府官网、官方新闻稿、权威媒体；普通网页仅作补充。\n3. 不得把推测写成客户内部事实或真实需求。\n4. 来源 URL 必须来自本次搜索结果，不得编造 URL。\n5. 无可靠依据的字段留空。\n6. 只输出严格 JSON。`;
  const input = buildResearchPrompt(customerName, request);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let data;

  try {
    const res = await fetchImpl("https://api.deepseek.com/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        instructions,
        input,
        tools: [{ type: "web_search" }],
        tool_choice: { type: "web_search" },
        text: { format: { type: "json_object" } },
        max_output_tokens: 2200,
        temperature: 0.1,
        stream: false
      }),
      signal: controller.signal
    });

    try {
      data = await res.json();
    } catch {
      throw Object.assign(new Error("DeepSeek 联网调研返回非 JSON 数据"), { status: res.status });
    }
    if (!res.ok) {
      throw Object.assign(
        new Error(data?.error?.message || `DeepSeek 联网调研返回 ${res.status}`),
        { status: res.status }
      );
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("DeepSeek research timed out"), { code: "TIMEOUT" });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const outputText = (Array.isArray(data?.output) ? data.output : [])
    .filter(item => item?.type === "message")
    .flatMap(item => Array.isArray(item?.content) ? item.content : [])
    .filter(part => part?.type === "output_text" && typeof part?.text === "string")
    .map(part => part.text)
    .join("\n")
    .trim();

  const parsed = extractJson(outputText);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("DeepSeek 联网调研未返回有效结构化结果");
  }

  return normalizeTrainingIntelligence(parsed, collectCitationUrls(data?.output));
}

async function researchCustomer(deepseekKey, customerName, bochaKey, request = {}) {
  if (!deepseekKey) {
    return {
      research_available: false,
      customer_name: customerName,
      status: "failed",
      provider: "",
      user_message: "客户公开资料调研尚未启用。",
      message: "客户公开资料调研尚未启用。",
      ...normalizeTrainingIntelligence()
    };
  }

  const bochaSearch = createBochaSearch({ apiKey: bochaKey });
  let primaryIntelligence = null;
  const research = await runCustomerResearch({
    customerName,
    trainingRequest: request,
    primarySearch: async () => {
      primaryIntelligence = await callDeepSeekWebResearch(deepseekKey, customerName, request);
      return {
        sources: primaryIntelligence.sources.map(source => ({
          ...source,
          summary: source.evidence
        }))
      };
    },
    backupSearch: bochaSearch
      ? async query => ({
        sources: await bochaSearch(query)
      })
      : undefined,
    wait: () => new Promise(resolve => setTimeout(resolve, 400))
  });

  const intelligence = research.provider === "deepseek_web_search" && primaryIntelligence
    ? primaryIntelligence
    : normalizeTrainingIntelligence(research);

  return {
    research_available: true,
    customer_name: customerName,
    researched_at: new Date().toISOString(),
    status: research.status,
    provider: research.provider || "",
    user_message: research.user_message,
    message: research.user_message,
    ...intelligence,
    time_window: researchTimeWindow()
  };
}

function researchRequestFromBody(body) {
  const request = body?.training_request || body?.research_request || body?.requirement_summary || body;
  return {
    audience: request?.audience,
    industry: request?.industry,
    theme: request?.theme,
    days: request?.days,
    sessions: request?.sessions,
    goals: request?.goals,
    business_challenges: request?.business_challenges,
    learner_context: request?.learner_context,
    preferences: request?.preferences
  };
}

function cnNum(n) {
  const map = { "一":1,"二":2,"两":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10 };
  return map[n] || null;
}

function parseDaysFromText(text) {
  let m = text.match(/(\d+)\s*天/);
  if (m) return Math.max(1, Number(m[1]));
  m = text.match(/([一二两三四五六七八九十])\s*天/);
  if (m) return cnNum(m[1]);
  return null;
}

function parseExplicitSessions(text) {
  let m = text.match(/(\d+)\s*(?:讲|门课|课次)/);
  if (m) return Math.max(1, Number(m[1]));
  if (/上午.*下午|上午和下午|上午下午|各\s*1\s*讲|各一讲|每天.*两讲|每天.*2\s*讲/.test(text)) {
    const days = parseDaysFromText(text);
    return days ? days * 2 : null;
  }
  return null;
}

function inferAudience(text) {
  const patterns = [
    ["金融机构干部", /金融机构干部/],
    ["农商行中高层", /农商行.*(?:中高层|中层|高管|干部)/],
    ["国企中层", /国企中层/],
    ["国企高管", /国企高管|国有企业高管/],
    ["党政干部", /党政干部/],
    ["园区干部", /园区干部/],
    ["企业管理者", /企业管理者|企业中高层/],
    ["财务负责人", /财务负责人|财务管理人员/]
  ];
  for (const [label, re] of patterns) if (re.test(text)) return label;
  return "";
}

function inferIndustry(text) {
  if (/银行|农商行|金融机构|金融中心|跨境金融|金融监管/.test(text)) return "金融";
  if (/国企|国有企业/.test(text)) return "国有企业";
  if (/园区|招商引资|区域经济/.test(text)) return "区域经济/园区";
  if (/党政|治理|公共政策/.test(text)) return "党政/公共治理";
  if (/财务|会计|业财/.test(text)) return "财务管理";
  return "";
}

function heuristicTheme(text) {
  const explicit = text.match(/(?:培训主题|主题|培训内容)[：:为是\s]+([^，。；;\n]+)/);
  if (explicit) return explicit[1].trim();
  return ['人工智能', '数字化转型', '数字化经营', '跨境金融', '风险管理', '业财融合', '领导力', '战略管理'].filter(topic => text.includes(topic)).join('与');
}

function heuristicRequirement(text) {
  const days = parseDaysFromText(text);
  const sessions = parseExplicitSessions(text);
  return {
    audience: text.match(/(?:培训对象|对象)[：:为是\s]+([^，。；;\n]+)/)?.[1]?.trim() || inferAudience(text),
    industry: inferIndustry(text),
    theme: heuristicTheme(text),
    days: days ? `${days}天` : "",
    sessions: sessions ? `${sessions}讲` : "",
    goals: text.match(/(?:培训目标|培养目标|希望解决的问题|目标)[：:为是\s]+([^。；;\n]+)/)?.[1]?.trim() || (/目标.*(?:请建议|你来建议)|(?:请建议|你来建议).*目标/.test(text) ? '培养目标由方案提出建议，待客户确认' : ''),
    assumptions: []
  };
}

const REQUIREMENT_FIELDS = ['customer_name', 'audience', 'industry', 'theme', 'days', 'sessions', 'goals', 'business_challenges', 'learner_context', 'preferences'];

function cleanRequirement(value = {}) {
  return {
    ...Object.fromEntries(REQUIREMENT_FIELDS.map(field => [field, normalizedString(value[field])])),
    skip_research: value.skip_research === true,
    assumptions: normalizedArray(value.assumptions)
  };
}

async function parseRequirement(apiKey, conversationText, previous = {}, userText = conversationText) {
  const inferred = heuristicRequirement(userText);
  const fallback = cleanRequirement({ ...previous, ...Object.fromEntries(Object.entries(inferred).filter(([, value]) => typeof value === 'string' && value)), assumptions: previous.assumptions });
  if (/客户(?:名称)?[：:为是\s]+/.test(userText)) fallback.customer_name = userText.match(/客户(?:名称)?[：:为是\s]+([^，。；;\n]+)/)?.[1]?.trim() || fallback.customer_name;
  if (/暂不提供客户|无需调研|不需要调研|不做客户调研/.test(userText)) fallback.skip_research = true;

  const prompt = `请从完整对话中提取培训需求，只输出 JSON：

{
  "customer_name": "",
  "skip_research": false,
  "audience": "",
  "industry": "",
  "theme": "",
  "days": "",
  "sessions": "",
  "goals": "",
  "business_challenges": "",
  "learner_context": "",
  "preferences": "",
  "assumptions": []
}

规则：
- 只能从用户明确表达或可直接确定的信息中提取，不要猜。
- days 使用“1天/2天/3天”格式。
- sessions 使用“2讲/4讲/6讲”格式。
- 若用户明确说每天上午下午各1讲，则 sessions = days × 2。
- 信息缺失就留空字符串，不要为了完整而补造。
- theme 应提炼培训主题。
- goals 必须来自用户明确的培养目标或希望解决的问题；用户明确让方案建议目标时可写“培养目标由方案提出建议，待客户确认”。
- business_challenges 为用户说明的业务问题，learner_context 为学员岗位/经验/基础，preferences 为师资、教学方式、场次、排课或其他限制，未说明则留空。
- 结合助手追问理解用户的简短补充，以用户最近一次明确修改为准；助手提出但用户未接受的建议不能当成已确认需求。
- 客户名称可从已有需求或用户新输入获取。仅当用户明确表示不提供客户或无需调研时 skip_research=true，其他情况为false。
- 已明确的信息保留，不重复追问。已确认的前次需求：${JSON.stringify(previous)}

完整用户对话：
${conversationText}`;

  try {
    const raw = await callDeepSeek(apiKey, [
      { role: "system", content: "你是培训需求解析器。宁缺勿假，只输出严格 JSON。" },
      { role: "user", content: prompt }
    ], 900);
    const parsed = extractJson(raw);

    if (parsed && typeof parsed === "object") {
      return cleanRequirement({
        ...Object.fromEntries(REQUIREMENT_FIELDS.map(field => [field, normalizedString(parsed[field]) || fallback[field] || ''])),
        skip_research: typeof parsed.skip_research === 'boolean' ? parsed.skip_research : fallback.skip_research,
        assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : []
      });
    }
  } catch {}

  return fallback;
}

function missingCriticalFields(req) {
  const missing = [];
  if (!req.customer_name && !req.skip_research) missing.push("客户名称");
  if (!req.audience) missing.push("培训对象");
  if (!req.theme) missing.push("培训主题");
  if (!req.days) missing.push("培训天数");
  if (!req.goals) missing.push("培养目标或希望解决的问题");
  return missing;
}

function clarificationMessage(missing, req) {
  const confirmed = [req.customer_name && `客户为${req.customer_name}`, req.audience && `对象为${req.audience}`, req.theme && `主题为${req.theme}`, req.days && `安排${req.days}`, req.goals && `目标为${req.goals}`].filter(Boolean).join('，');
  const hints = {
    '客户名称': '请提供客户完整名称（如不方便提供，可回复“暂不提供客户”）。',
    '培训对象': '参训人员是什么岗位/层级？',
    '培训主题': '希望围绕什么主题或业务方向开展培训？',
    '培训天数': '计划培训几天？是否有固定场次？',
    '培养目标或希望解决的问题': '本次培训最希望解决什么问题，或让学员具备什么能力？例如提升数字化经营能力、改善团队执行、推动某项业务转型；暂不明确时可回复“请建议培养目标”。'
  };
  return `${confirmed ? `目前已明确：${confirmed}。\n` : ''}在调研和设计配课前，还需要补充：\n${missing.map((field, i) => `${i + 1}. ${hints[field]}`).join('\n')}\n如有具体业务问题、学员基础、师资偏好或教学方式要求，也可一并说明。`;
}

function normalizeSessions(req) {
  if (req.sessions) return req;

  const dayMatch = String(req.days || "").match(/(\d+)/);
  const days = dayMatch ? Math.max(1, Number(dayMatch[1])) : 1;

  return {
    ...req,
    sessions: `${days * 2}讲`,
    assumptions: [
      ...(Array.isArray(req.assumptions) ? req.assumptions : []),
      "未明确每日课次，按每天上午、下午各1讲生成"
    ]
  };
}


export function buildSafeTeacherProfile(t) {
  if (
    String(t?.profile_status || "").trim().toLowerCase() === "verified" &&
    typeof t?.profile === "string" &&
    t.profile.trim()
  ) {
    return t.profile.trim();
  }
  return "";
}

async function loadTeachers(envId, apiKey) {
  const extended = "select=business_code,name,institution,department,research_topics,audiences,source_type,status,profile,profile_source_type,profile_status,profile_evidence&is_test_data=eq.true";
  try {
    return await cloudbaseGet(envId, apiKey, "teachers", extended);
  } catch {
    return await cloudbaseGet(
      envId,
      apiKey,
      "teachers",
      "select=business_code,name,institution,department,research_topics,audiences,source_type,status&is_test_data=eq.true"
    );
  }
}

function buildFacultyContext(teachers, courses, relations) {
  const teacherMap = new Map(teachers.map(t => [t.business_code, t]));
  const courseMap = new Map(courses.map(c => [c.business_code, c]));

  const formal = [];
  const external = [];

  for (const r of relations) {
    const t = teacherMap.get(r.teacher_business_code);
    const c = courseMap.get(r.course_business_code);

    if (!t || !c) continue;
    if (t.status !== "active") continue;
    if (c.status !== "active") continue;
    if (r.confirmed_status !== "confirmed") continue;

    const item = {
      teacher_business_code: t.business_code,
      teacher_name: t.name,
      institution: t.institution,
      department: t.department,
      research_topics: t.research_topics || "",
      teacher_audiences: t.audiences || "",
      source_type: t.source_type,
      course_business_code: c.business_code,
      course_title: c.title,
      course_topics: c.topics || "",
      course_audiences: c.audiences || "",
      duration: c.duration || "",
      evidence_note: r.evidence_note || "",
      teacher_profile: buildSafeTeacherProfile(t),
      profile_source_type: t.profile_source_type || (t.profile ? "library" : ""),
      profile_status: t.profile_status || ""
    };

    if (t.source_type === "库内师资") formal.push(item);
    else external.push(item);
  }

  return { formal, external };
}

function splitTerms(text) {
  return String(text || "")
    .split(/[；;、，,\s/｜|：:]+/)
    .map(x => x.trim())
    .filter(x => x.length >= 2);
}

function scoreCandidate(candidate, req, rawText) {
  const haystack = [
    candidate.course_title,
    candidate.course_topics,
    candidate.research_topics,
    candidate.course_audiences,
    candidate.teacher_audiences,
    candidate.institution,
    candidate.department
  ].join(" ");

  const terms = new Set([
    ...splitTerms(req.theme),
    ...splitTerms(req.audience),
    ...splitTerms(req.industry),
    ...splitTerms(rawText)
  ]);

  let score = 0;
  const reasons = [];

  for (const term of terms) {
    if (!term) continue;
    if (candidate.course_title.includes(term)) {
      score += 8; reasons.push(`课程名称匹配“${term}”`);
    } else if (candidate.course_topics.includes(term)) {
      score += 6; reasons.push(`课程主题匹配“${term}”`);
    } else if (candidate.research_topics.includes(term)) {
      score += 5; reasons.push(`研究方向匹配“${term}”`);
    } else if (candidate.course_audiences.includes(term) || candidate.teacher_audiences.includes(term)) {
      score += 3; reasons.push(`适用对象匹配“${term}”`);
    }
  }

  const boosts = [
    ["国际金融中心", ["国际金融", "金融中心"]],
    ["跨境金融", ["跨境金融", "人民币国际化"]],
    ["人工智能", ["人工智能", "大模型", "AI"]],
    ["数字化转型", ["数字化转型", "数字化"]],
    ["数据要素", ["数据要素", "数字经济"]],
    ["风险管理", ["风险管理", "智能风控"]],
    ["业财融合", ["业财融合", "财务数字化"]]
  ];

  for (const [needle, aliases] of boosts) {
    if (rawText.includes(needle)) {
      for (const alias of aliases) {
        if (haystack.includes(alias)) {
          score += 7;
          reasons.push(`与“${needle}”方向高度匹配`);
          break;
        }
      }
    }
  }

  return {
    ...candidate,
    match_score: score,
    match_reasons: [...new Set(reasons)].slice(0, 4)
  };
}

function rankCandidates(candidates, req, rawText) {
  return candidates
    .map(c => scoreCandidate(c, req, rawText))
    .sort((a,b) => b.match_score - a.match_score);
}

function parseSessionCount(req) {
  const m = String(req.sessions || "").match(/(\d+)/);
  return m ? Math.max(1, Number(m[1])) : 2;
}

function makeSlots(req) {
  const dayMatch = String(req.days || "").match(/(\d+)/);
  const days = dayMatch ? Math.max(1, Number(dayMatch[1])) : 1;
  const count = parseSessionCount(req);

  const slots = [];
  for (let i=0; i<count; i++) {
    const day = Math.min(days, Math.floor(i/2)+1);
    const period = i % 2 === 0 ? "上午" : "下午";
    slots.push({ day:`第${day}天`, period });
  }
  return slots;
}

function deterministicFallback(req, rankedFormal, rankedExternal) {
  const slots = makeSlots(req);
  const usedCourses = new Set();

  const formal_schedule = slots.map(slot => {
    const candidate =
      rankedFormal.find(x => x.match_score > 0 && !usedCourses.has(x.course_business_code)) ||
      rankedFormal.find(x => !usedCourses.has(x.course_business_code));

    if (!candidate) {
      return {
        ...slot,
        module: req.theme,
        course_title: "待匹配",
        teacher_name: "待匹配",
        institution: "",
        source_type: "",
        teacher_profile: "",
        reason: "该时段暂无满足要求的已确认课程师资组合，需进一步沟通。",
        evidence: ""
      };
    }

    usedCourses.add(candidate.course_business_code);

    return {
      ...slot,
      module: candidate.course_topics?.split(/[；;]/)[0] || req.theme,
      course_title: candidate.course_title,
      teacher_name: candidate.teacher_name,
      institution: [candidate.institution,candidate.department].filter(Boolean).join(" "),
      source_type: candidate.source_type,
      teacher_profile: candidate.teacher_profile || "",
      reason: candidate.match_score > 0
        ? `本课程围绕“${candidate.course_topics || candidate.course_title}”展开，作为“${req.goals}”培养目标的相关专题。建议结合${req.audience}的岗位问题开展案例讨论，并与前后课程衔接。`
        : '本课程暂作备选安排，与本次主题及学员需求的适配程度需进一步确认。',
      evidence: `已确认正式师资课程关系；课程编号 ${candidate.course_business_code}；教师编号 ${candidate.teacher_business_code}`
    };
  });

  const external_candidates = rankedExternal
    .filter(x => x.match_score > 0)
    .slice(0,3)
    .map(x => ({
      teacher_name: x.teacher_name,
      institution: x.institution,
      source_type: x.source_type,
      suggested_topic: x.course_title,
      reason: x.match_reasons.slice(0,2).join("；") || "与培训主题存在匹配点。",
      notice: "未入正式库，需核验"
    }));

  return {
    mode: "plan",
    assistant_message: req.assumptions?.length
      ? `方案已生成。${req.assumptions.join("；")}。`
      : "已根据正式师资课程库生成结构化方案。",
    requirement_summary: req,
    formal_schedule,
    external_candidates,
    suggested_actions: ["调整课程顺序","更换指定时段老师","更换指定课程","导出成果"]
  };
}

async function generatePlan(apiKey, req, rankedFormal, rankedExternal, research) {
  const slots = makeSlots(req);

  const prompt = `${proposalPrompt(req, research)}
请根据下面信息生成结构化培训方案，只输出 JSON。

需求：
${JSON.stringify(req,null,2)}

需要时段：
${JSON.stringify(slots,null,2)}

正式候选（服务端已资格过滤并按相关性排序）：
${JSON.stringify(rankedFormal.slice(0,12),null,2)}

外部候选：
${JSON.stringify(rankedExternal.filter(x=>x.match_score>0).slice(0,6),null,2)}

输出结构：
{
  "mode":"plan",
  "assistant_message":"",
  "requirement_summary":${JSON.stringify(req)},
  "proposal": {
    "project_background": { "text": "", "source_ids": [] },
    "client_needs_analysis": { "text": "", "source_ids": [] },
    "design_logic": { "text": "", "source_ids": [] }
  },
  "training_overview": { "goals": "", "learning_methods": "", "expected_outputs": "" },
  "formal_schedule":[
    {
      "day":"",
      "period":"",
      "module":"",
      "course_title":"",
      "teacher_name":"",
      "institution":"",
      "source_type":"库内师资",
      "teacher_profile":"",
      "reason":"",
      "source_ids":[],
      "evidence":""
    }
  ],
  "external_candidates":[
    {
      "teacher_name":"",
      "institution":"",
      "source_type":"",
      "suggested_topic":"",
      "reason":"",
      "notice":"未入正式库，需核验"
    }
  ],
  "suggested_actions":[]
}

要求：
- 不要输出“待确认事项”字段或板块。
- formal_schedule 数量尽量与时段数一致。
- 正式课表只能从正式候选选择。
- teacher_profile 只能复制正式候选中的 teacher_profile，不得补写任何候选中没有的学历、职务、兼职、成果或荣誉。
- 推荐理由控制在1-2句，适当解释学习重点和能力目标；关联调研编号仅放source_ids，不写入正文。不要解释库内、正式库或测试数据等内部处理。
- 如果正式候选不足，对应时段使用“待匹配”。
- requirement_summary 必须直接使用上面的需求值，不要置空。`;

  const raw = await callDeepSeek(apiKey,[
    {role:"system",content:SYSTEM_PROMPT},
    {role:"user",content:prompt}
  ],4200);

  return extractJson(raw);
}

function normalizePlan(modelPlan, fallbackPlan, req) {
  if (!modelPlan || typeof modelPlan !== "object") return fallbackPlan;

  return {
    mode: "plan",
    assistant_message: modelPlan.assistant_message || fallbackPlan.assistant_message,
    requirement_summary: req,
    proposal: modelPlan.proposal,
    training_overview: modelPlan.training_overview,
    formal_schedule:
      Array.isArray(modelPlan.formal_schedule) && modelPlan.formal_schedule.length
        ? modelPlan.formal_schedule
        : fallbackPlan.formal_schedule,
    external_candidates:
      Array.isArray(modelPlan.external_candidates)
        ? modelPlan.external_candidates
        : fallbackPlan.external_candidates,
    suggested_actions:
      Array.isArray(modelPlan.suggested_actions)
        ? modelPlan.suggested_actions
        : fallbackPlan.suggested_actions
  };
}


export function enrichScheduleProfiles(plan, rankedFormal) {
  const rows = Array.isArray(plan?.formal_schedule) ? plan.formal_schedule : [];
  plan.formal_schedule = rows.map(row => {
    const match = rankedFormal.find(x =>
      row.course_title && x.course_title === row.course_title && row.teacher_name && x.teacher_name === row.teacher_name
    );
    if (!match) return { ...row, course_title: '待匹配', teacher_name: '待匹配', institution: '', source_type: '', teacher_profile: '', reason: '该时段暂无已确认的合适课程师资组合。', evidence: '' };
    return {
      ...row,
      teacher_profile: match.teacher_profile || "",
      institution: [match.institution, match.department].filter(Boolean).join(" "),
      source_type: match.source_type
    };
  });
  return plan;
}

export async function onRequestPost(context) {
  try {
    const deepseekKey = context.env.DEEPSEEK_API_KEY;
    const bochaKey = context.env.BOCHA_API_KEY;
    const cloudbaseEnvId = context.env.CLOUDBASE_ENV_ID;
    const cloudbaseApiKey = context.env.CLOUDBASE_API_KEY;

    const body = await context.request.json();

    if (body?.action === "research_customer") {
      const customerName = String(body.customer_name || "").trim();
      if (!customerName) return json({ error: "customer_name 不能为空" }, 400);
      const researchRequest = researchRequestFromBody(body);
      const missing = missingCriticalFields(cleanRequirement({ ...researchRequest, customer_name: customerName }));
      if (deepseekKey && missing.length) return json({ mode: 'clarify', assistant_message: clarificationMessage(missing, researchRequest), questions: missing });
      try {
        const research = await researchCustomer(
          deepseekKey,
          customerName,
          bochaKey,
          researchRequest
        );
        return json(research);
      } catch {
        return json({
          research_available: Boolean(deepseekKey),
          customer_name: customerName,
          researched_at: new Date().toISOString(),
          status: "retryable_failure",
          provider: "",
          user_message: "公开资料暂未获取成功，本次方案将先依据已确认需求设计，可稍后重新调研并更新方案。",
          message: "公开资料暂未获取成功，本次方案将先依据已确认需求设计，可稍后重新调研并更新方案。",
          ...normalizeTrainingIntelligence()
        });
      }
    }

    if (!deepseekKey) {
      return json({ error: "服务暂未就绪，请稍后重试。" }, 503);
    }

    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const messages = incoming
      .filter(m => m && (m.role==="user" || m.role==="assistant") && typeof m.content==="string")
      .slice(-16);

    const userMessages = messages.filter(m=>m.role==="user").map(m=>m.content);
    if (!userMessages.length && body.action !== 'compose_training_plan') return json({error:"缺少用户需求"},400);

    const conversationText = messages.map(message => `${message.role === 'user' ? '用户' : '助手追问/说明'}：${message.content}`).join('\n');
    let req = body.action === 'compose_training_plan'
      ? cleanRequirement(body.training_request)
      : await parseRequirement(deepseekKey, conversationText, cleanRequirement({ ...body.requirement_summary, customer_name: body.customer_name || body.requirement_summary?.customer_name }), userMessages.join('\n'));

    const missing = missingCriticalFields(req);
    if (missing.length) {
      const question = clarificationMessage(missing,req);
      return json({
        mode:"clarify",
        assistant_message:question,
        requirement_summary:req,
        questions:missing,
        formal_schedule:[],
        external_candidates:[],
        suggested_actions:[]
      });
    }

    req = normalizeSessions(req);

    if (body.action !== 'compose_training_plan') {
      return json({ mode: 'requirements_ready', requirement_summary: req, assistant_message: '需求已整理，接下来调研客户相关背景，再设计课程方案。' });
    }
    if (!body.research_attempted) return json({ error: '请先完成客户调研，再设计配课方案。' }, 409);
    if (!cloudbaseEnvId || !cloudbaseApiKey) return json({ error: '师资课程服务暂未就绪，请稍后重试。' }, 503);
    const researchStatus = body.customer_research?.status || 'failed';
    const usableResearch = ['succeeded', 'no_reliable_sources'].includes(researchStatus)
      && (!body.customer_research?.customer_name || body.customer_research.customer_name === req.customer_name)
      && !req.skip_research;
    const research = { status: usableResearch ? researchStatus : req.skip_research ? 'skipped' : 'failed', ...normalizeTrainingIntelligence(usableResearch ? body.customer_research : {}) };

    const [teachers,courses,relations] = await Promise.all([
      loadTeachers(cloudbaseEnvId, cloudbaseApiKey),
      cloudbaseGet(
        cloudbaseEnvId,cloudbaseApiKey,"courses",
        "select=business_code,title,topics,audiences,duration,status&is_test_data=eq.true"
      ),
      cloudbaseGet(
        cloudbaseEnvId,cloudbaseApiKey,"teacher_courses",
        "select=relation_code,teacher_business_code,course_business_code,confirmed_status,evidence_note&is_test_data=eq.true"
      )
    ]);

    const faculty = buildFacultyContext(teachers,courses,relations);
    const designContext = [userMessages.join('\n'), req.goals, req.business_challenges, req.learner_context, ...research.training_implications.map(item => item.point)].filter(Boolean).join('；');
    const rankedFormal = rankCandidates(faculty.formal,req,designContext);
    const rankedExternal = rankCandidates(faculty.external,req,designContext);

    const fallbackPlan = deterministicFallback(req,rankedFormal,rankedExternal);

    let modelPlan = null;
    try {
      modelPlan = await generatePlan(deepseekKey,req,rankedFormal,rankedExternal,research);
    } catch {}

    const plan = normalizePlan(modelPlan,fallbackPlan,req);
    const slots = makeSlots(req);
    const scheduleInvalid = plan.formal_schedule.length !== slots.length || plan.formal_schedule.some((row, i) =>
      !row || row.day !== slots[i].day || row.period !== slots[i].period ||
      (row.course_title !== '待匹配' && !rankedFormal.some(candidate => candidate.course_title === row.course_title && candidate.teacher_name === row.teacher_name))
    );
    if (scheduleInvalid) {
      plan.formal_schedule = fallbackPlan.formal_schedule;
      plan.proposal = null;
    }
    enrichScheduleProfiles(plan, rankedFormal);
    const fallbackProposal = proposalFallback(req, plan.formal_schedule);
    plan.proposal = normalizeProposal(plan.proposal, fallbackProposal, research.sources);
    plan.training_overview = normalizeTrainingOverview(scheduleInvalid ? null : plan.training_overview, req);
    plan.formal_schedule = plan.formal_schedule.map(row => {
      const match = rankedFormal.find(candidate => candidate.course_title === row.course_title && candidate.teacher_name === row.teacher_name);
      const evidence = normalizedString(match?.evidence_note);
      const sourceIds = [...new Set([
        ...normalizedArray(row.source_ids),
        ...[...String(row.reason || '').matchAll(/\[(S\d+)\]/g)].map(item => item[1])
      ])];
      const sourceLinks = research.sources.filter(source => sourceIds.includes(source.source_id)).map(source => ({ title: source.title || '客户相关背景资料', url: source.url }));
      return { ...row, evidence: /^(?:正式)?测试(?:关系|数据|课程)?[。.!！\s]*$/.test(evidence) ? '' : evidence, evidence_sources: sourceLinks };
    });
    plan.customer_research = research;
    plan.research_notice = research.status === 'succeeded' ? '' : research.status === 'skipped'
      ? '本项目按已确认需求设计，未开展客户公开资料调研。'
      : '本次未获得可用于方案分析的可靠公开资料，正文依据已确认需求设计，可重新调研后更新方案。';
    plan.assistant_message = `已完成需求整理${req.skip_research ? '' : '和客户资料检索'}，并形成项目背景、客户需求分析、方案设计逻辑及配课方案。${plan.research_notice}`;

    return json({
      ...plan,
      meta:{
        formal_candidates:faculty.formal.length,
        external_candidates:faculty.external.length,
        top_formal_matches:rankedFormal.slice(0,5).map(x=>({
          teacher:x.teacher_name,course:x.course_title,score:x.match_score
        })),
        data_source:"CloudBase PostgreSQL",
        pipeline:"clarify -> research -> client-facing analysis -> course composition"
      }
    });

  } catch {
    return json({error:"服务暂未完成本次处理，请稍后重试。"},500);
  }
}

export async function onRequestGet(context) {
  const cloudbaseEnvId=context.env.CLOUDBASE_ENV_ID;
  const cloudbaseApiKey=context.env.CLOUDBASE_API_KEY;

  const result={
    ok:true,
    service:"AI Workbench Chat API",
    version:"1.3.2",
    clarification_before_plan:true,
    customer_research_configured:Boolean(context.env.DEEPSEEK_API_KEY),
    customer_research_provider:"deepseek_web_search",
    structured_output:true,
    deterministic_matching:true,
    deepseek_configured:Boolean(context.env.DEEPSEEK_API_KEY),
    cloudbase_configured:Boolean(cloudbaseEnvId && cloudbaseApiKey)
  };

  if (cloudbaseEnvId && cloudbaseApiKey) {
    try {
      const teachers=await cloudbaseGet(
        cloudbaseEnvId,cloudbaseApiKey,"teachers",
        "select=business_code&is_test_data=eq.true"
      );
      result.database_ok=true;
      result.test_teacher_count=Array.isArray(teachers)?teachers.length:0;
    } catch {
      result.database_ok=false;
      result.database_error='师资课程服务暂不可用';
    }
  }

  return json(result);
}
