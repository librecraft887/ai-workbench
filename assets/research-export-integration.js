(function() {
  const numerals = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  function heading(number, title) {
    return `${numerals[number] || number}、${title}`;
  }

  function researchSections(research) {
    return typeof buildResearchExportSections === 'function'
      ? buildResearchExportSections(research)
      : [];
  }

  function appendResearchText(lines, sections, start) {
    let section = start;
    sections.forEach(item => {
      lines.push('', heading(section, item.heading), ...item.lines);
      section += 1;
    });
    return section;
  }

  function exportPlanText() {
    if (!currentPlan) return '';

    const requirement = currentPlan.requirement_summary || {};
    const research = currentProject?.customerResearch;
    const lines = [`${currentProject?.title || 'AI教研助手'}课程方案`, '', '一、培训需求概览'];
    if (currentProject?.customerName) lines.push(`客户名称：${currentProject.customerName}`);
    if (requirement.audience) lines.push(`培训对象：${requirement.audience}`);
    if (requirement.industry) lines.push(`行业：${requirement.industry}`);
    if (requirement.theme) lines.push(`培训主题：${requirement.theme}`);
    if (requirement.days) lines.push(`培训天数：${requirement.days}`);
    if (requirement.sessions) lines.push(`课程安排：${requirement.sessions}`);
    if (requirement.goals) lines.push(`培训目标：${requirement.goals}`);

    let section = appendResearchText(lines, researchSections(research), 2);
    lines.push('', heading(section, '课程设计思路'));
    lines.push(`围绕“${requirement.theme || '培训主题'}”，按照${requirement.days || ''}${requirement.sessions ? `、共${requirement.sessions}` : ''}进行模块化安排；正式课表仅使用已确认的库内师资课程关系。`);
    section += 1;

    lines.push('', heading(section, '正式推荐课表'));
    (currentPlan.formal_schedule || []).forEach((row, index) => {
      lines.push(`${index + 1}. ${row.day || ''} ${row.period || ''}｜${row.course_title || '待匹配'}｜${row.teacher_name || '待匹配'}${row.institution ? `｜${row.institution}` : ''}`);
      if (row.reason) lines.push(`推荐理由：${row.reason}`);
    });
    section += 1;

    const profiles = uniqueProfiles().filter(profile => profile.profile);
    if (profiles.length) {
      lines.push('', heading(section, '推荐师资简介'));
      profiles.forEach(profile => {
        lines.push(`${profile.name}${profile.institution ? `｜${profile.institution}` : ''}`, profile.profile);
      });
      section += 1;
    }

    const external = currentPlan.external_candidates || [];
    if (external.length) {
      lines.push('', heading(section, '外部候选补充'));
      external.forEach((candidate, index) => {
        lines.push(`${index + 1}. ${candidate.teacher_name || ''}｜${candidate.institution || ''}`);
        if (candidate.suggested_topic) lines.push(`建议专题：${candidate.suggested_topic}`);
        if (candidate.reason) lines.push(`推荐理由：${candidate.reason}`);
        lines.push(`说明：${candidate.notice || '未入正式库，需核验'}`);
      });
    }
    return lines.join('\n');
  }

  async function exportResearchDocx() {
    if (!currentPlan) {
      showToast('还没有可导出的正式方案');
      return;
    }

    const zip = new JSZip();
    const requirement = currentPlan.requirement_summary || {};
    const sections = researchSections(currentProject?.customerResearch);
    let body = '';
    body += wP(`${currentProject?.title || 'AI教研助手'}课程方案`, 'Title');
    if (currentProject?.customerName) body += wP(`客户：${currentProject.customerName}`, 'Normal');
    body += wP('一、培训需求概览', 'Heading1');
    const info = [
      ['项目', '内容'],
      ['培训对象', requirement.audience || ''],
      ['行业', requirement.industry || ''],
      ['培训主题', requirement.theme || ''],
      ['培训天数', requirement.days || ''],
      ['课程安排', requirement.sessions || ''],
      ['培训目标', requirement.goals || '']
    ].filter(row => row[1] || row[0] === '项目');
    body += wTable(info, [1800, 7000]);

    let section = 2;
    sections.forEach(item => {
      body += wP(heading(section, item.heading), 'Heading1');
      item.lines.forEach(line => { body += wP(line); });
      section += 1;
    });
    body += wP(heading(section, '课程设计思路'), 'Heading1');
    body += wP(`围绕“${requirement.theme || '培训主题'}”，按照${requirement.days || ''}${requirement.sessions ? `、共${requirement.sessions}` : ''}进行模块化安排，优先从正式师资课程库中选择已确认课程关系，并依据主题匹配度、适用对象和研究方向进行组合。`);
    section += 1;

    body += wP(heading(section, '课程安排'), 'Heading1');
    const rows = [['时间', '课程模块', '课程名称', '推荐师资', '单位', '推荐理由']];
    (currentPlan.formal_schedule || []).forEach(row => rows.push([
      `${row.day || ''} ${row.period || ''}`.trim(),
      row.module || '',
      row.course_title || '待匹配',
      row.teacher_name || '待匹配',
      row.institution || '',
      row.reason || ''
    ]));
    body += wTable(rows, [1400, 1800, 2600, 1400, 2200, 2600]);
    section += 1;

    const profiles = uniqueProfiles().filter(profile => profile.profile);
    if (profiles.length) {
      body += wP(heading(section, '推荐师资简介'), 'Heading1');
      profiles.forEach(profile => {
        body += wP(`${profile.name}${profile.institution ? `｜${profile.institution}` : ''}`, 'Normal', true);
        body += wP(profile.profile);
      });
      section += 1;
    }

    const external = currentPlan.external_candidates || [];
    if (external.length) {
      body += wP(heading(section, '外部候选补充'), 'Heading1');
      external.forEach((candidate, index) => {
        body += wP(`${index + 1}. ${candidate.teacher_name || ''}｜${candidate.institution || ''}`, 'Normal', true);
        if (candidate.suggested_topic) body += wP(`建议专题：${candidate.suggested_topic}`);
        if (candidate.reason) body += wP(`推荐理由：${candidate.reason}`);
        body += wP(`说明：${candidate.notice || '未入正式库，需核验'}`);
      });
    }

    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1276" w:right="1276" w:bottom="1276" w:left="1276"/><w:pgNumType w:start="1"/></w:sectPr></w:body></w:document>`;
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.styles+xml"/></Types>');
    zip.folder('_rels').file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.folder('word').file('document.xml', document);
    zip.folder('word').file('styles.xml', docStyles());
    zip.folder('word').folder('_rels').file('document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    downloadBlob(await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${currentProject?.title || 'AI教研助手'}_课程方案.docx`);
    showToast('Word 已生成');
  }

  window.planText = exportPlanText;
  window.copyFormatted = async function() {
    if (!currentPlan) {
      showToast('还没有可复制的正式方案');
      return;
    }
    try {
      await navigator.clipboard.writeText(exportPlanText());
      showToast('已复制排版文本');
    } catch {
      showToast('复制失败');
    }
  };
  window.exportDocx = exportResearchDocx;
})();
