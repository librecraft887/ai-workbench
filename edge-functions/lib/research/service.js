function isRetryable(error) {
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || error?.statusCode || 0);
  return code === 'TIMEOUT' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || status >= 500;
}

function normalizeSources(sources, provider) {
  const urls = new Set();
  return (Array.isArray(sources) ? sources : [])
    .filter(source => {
      const url = String(source?.url || '').trim();
      if (!source || !/^https?:\/\//i.test(url) || !String(source.title || '').trim() || urls.has(url)) return false;
      urls.add(url);
      return true;
    })
    .slice(0, 8)
    .map(source => ({
      title: String(source.title).trim(),
      url: String(source.url).trim(),
      published_at: String(source.published_at || '').trim(),
      content: String(source.content || source.summary || '').trim().slice(0, 800),
      provider
    }));
}

function backupQueries(customerName) {
  const customer = String(customerName || '').trim();
  return [
    `${customer} 战略 中长期战略 年度重点 近期重点工作`,
    `${customer} 人才培养 干部培养 培训体系 人才队伍`,
    `${customer} 数字化 人工智能 金融科技 业务变革`,
    `${customer} 能力建设 岗位能力 核心能力 组织能力`
  ];
}

function succeeded(result, provider) {
  const sources = normalizeSources(result?.sources, provider);
  return {
    status: sources.length ? 'succeeded' : 'no_reliable_sources',
    provider,
    background: String(result?.background || '').trim(),
    training_relevance: String(result?.training_relevance || '').trim(),
    sources,
    user_message: sources.length
      ? '客户公开资料调研已完成。'
      : '已完成客户公开资料检索，但暂未获得可保留的可靠来源。'
  };
}

export async function researchCustomer({ customerName, primarySearch, backupSearch, wait = async () => {} }) {
  if (!String(customerName || '').trim()) {
    return { status: 'failed', sources: [], background: '', training_relevance: '', user_message: '未填写客户名称。' };
  }

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return succeeded(await primarySearch(), 'deepseek_web_search');
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) break;
      if (attempt === 0) await wait();
    }
  }

  if (typeof backupSearch === 'function') {
    const sources = [];
    let completedBackupSearch = false;
    for (const query of backupQueries(customerName)) {
      try {
        const result = await backupSearch(query);
        completedBackupSearch = true;
        sources.push(...(Array.isArray(result?.sources) ? result.sources : []));
      } catch {
        // The user-facing result must not disclose provider internals.
      }
    }

    const backupResult = succeeded({ sources }, 'backup');
    if (completedBackupSearch) return backupResult;
  }

  return {
    status: 'retryable_failure',
    provider: '',
    background: '',
    training_relevance: '',
    sources: [],
    user_message: '客户公开资料暂未获取成功，课程方案已继续生成，可点击重新调研客户。'
  };
}
