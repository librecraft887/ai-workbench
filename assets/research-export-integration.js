(function() {
  const numerals = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  function heading(number, title) {
    return `${numerals[number] || number}、${title}`;
  }

  function proposalSections(plan) {
    return typeof buildProposalSections === 'function'
      ? buildProposalSections(plan)
      : [];
  }

  function proposalParagraph(text) {
    return `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:ind w:firstLine="440" w:firstLineChars="200"/><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`;
  }

  function appendResearchText(lines, sections, start) {
    let section = start;
    sections.forEach(item => {
      lines.push('', heading(section, item.heading));
      item.lines.forEach(line => lines.push('', `　　${line}`));
      section += 1;
    });
    return section;
  }

  function exportPlanText() {
    if (!currentPlan?.proposal) return '';

    const requirement = currentPlan.requirement_summary || {};
    const lines = [`${currentProject?.title || 'AI教研助手'}培训方案`];
    let section = appendResearchText(lines, proposalSections(currentPlan), 1);
    lines.push('', heading(section, '培训安排概览'));
    section += 1;
    if (currentProject?.customerName) lines.push(`客户名称：${currentProject.customerName}`);
    buildTrainingOverview(currentPlan).forEach(([label, value]) => lines.push(`${label}：${value}`));
    if (requirement.assumptions?.length) lines.push(`安排说明：${requirement.assumptions.join('；')}`);

    lines.push('', heading(section, '配课方案'));
    (currentPlan.formal_schedule || []).forEach((row, index) => {
      lines.push(`${index + 1}. ${row.day || ''} ${row.period || ''}｜${row.course_title || '待匹配'}｜${row.teacher_name || '待匹配'}${row.institution ? `｜${row.institution}` : ''}`);
      if (row.reason) lines.push(`课程设计理由：${cleanClientText(row.reason)}`);
    });
    section += 1;

    const profiles = uniqueProfiles().filter(profile => profile.profile);
    if (profiles.length) {
      lines.push('', heading(section, '推荐师资简介'));
      profiles.forEach(profile => {
        lines.push(`${profile.name}${profile.institution ? `｜${profile.institution}` : ''}`, ...clientParagraphs(profile.profile).map(text => `　　${text}`));
      });
      section += 1;
    }

    const external = currentPlan.external_candidates || [];
    if (external.length) {
      lines.push('', heading(section, '备选师资（待确认）'));
      external.forEach((candidate, index) => {
        lines.push(`${index + 1}. ${candidate.teacher_name || ''}｜${candidate.institution || ''}`);
        if (candidate.suggested_topic) lines.push(`建议专题：${candidate.suggested_topic}`);
        if (candidate.reason) lines.push(`推荐理由：${cleanClientText(candidate.reason)}`);
        lines.push('说明：师资及授课安排需进一步沟通确认。');
      });
    }
    return lines.join('\n');
  }

  async function exportResearchDocx() {
    if (!currentPlan?.proposal) {
      showToast('请先补充培养目标并更新方案，再导出 Word');
      return;
    }

    const zip = new JSZip();
    const requirement = currentPlan.requirement_summary || {};
    const sections = proposalSections(currentPlan);
    let body = '';
    body += wP(`${currentProject?.title || 'AI教研助手'}培训方案`, 'Title');
    let section = 1;
    sections.forEach(item => {
      body += wP(heading(section, item.heading), 'Heading1');
      item.lines.forEach(line => { body += proposalParagraph(line); });
      section += 1;
    });
    body += wP(heading(section, '培训安排概览'), 'Heading1');
    section += 1;
    const info = [['项目', '内容'], ...buildTrainingOverview(currentPlan)];
    if(requirement.assumptions?.length)info.push(['安排说明',requirement.assumptions.join('；')]);
    body += wTable(info, [1800, 7000]);

    body += wP(heading(section, '配课方案'), 'Heading1');
    const rows = [['时间', '课程模块', '课程名称', '推荐师资', '单位', '推荐理由']];
    (currentPlan.formal_schedule || []).forEach(row => rows.push([
      `${row.day || ''} ${row.period || ''}`.trim(),
      row.module || '',
      row.course_title || '待匹配',
      row.teacher_name || '待匹配',
      row.institution || '',
      cleanClientText(row.reason)
    ]));
    body += wTable(rows, [900, 1100, 2200, 1000, 1500, 2500]);
    section += 1;

    const profiles = uniqueProfiles().filter(profile => profile.profile);
    if (profiles.length) {
      body += wP(heading(section, '推荐师资简介'), 'Heading1');
      profiles.forEach(profile => {
        body += wP(`${profile.name}${profile.institution ? `｜${profile.institution}` : ''}`, 'Normal', true);
        clientParagraphs(profile.profile).forEach(text => {body += proposalParagraph(text)});
      });
      section += 1;
    }

    const external = currentPlan.external_candidates || [];
    if (external.length) {
      body += wP(heading(section, '备选师资（待确认）'), 'Heading1');
      external.forEach((candidate, index) => {
        body += wP(`${index + 1}. ${candidate.teacher_name || ''}｜${candidate.institution || ''}`, 'Normal', true);
        if (candidate.suggested_topic) body += wP(`建议专题：${candidate.suggested_topic}`);
        if (candidate.reason) body += proposalParagraph(`推荐理由：${cleanClientText(candidate.reason)}`);
        body += wP('说明：师资及授课安排需进一步沟通确认。');
      });
    }

    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1276" w:right="1276" w:bottom="1276" w:left="1276"/><w:pgNumType w:start="1"/></w:sectPr></w:body></w:document>`;
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
    if (!currentPlan?.proposal) {
      showToast('请先补充培养目标并更新方案，再复制文本');
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
