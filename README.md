# AI教研助手 V1.2｜客户调研培训设计情报包

本版把客户公开资料调研升级为“培训设计情报包”：先在对话中补齐关键培训需求，再依据培训对象、主题、天数、课次和目标检索客户战略、业务、人才培养与能力建设信息。页面、复制文本和 Word 使用同一份可追溯结构。

## 部署到 GitHub / EdgeOne

上传或替换以下文件，并提交到 `main`：

- `assistant.html`
- `edge-functions/api/chat.js`
- `edge-functions/lib/research/service.js`
- `edge-functions/lib/research/providers/bocha.js`
- `assets/jszip.min.js`
- `assets/research-display.js`
- `assets/research-session.js`
- `assets/research-export.js`
- `assets/research-export-integration.js`

`tests/`、`docs/` 和 `.superpowers/` 仅用于开发验收，不影响线上运行。

## 环境变量

- `DEEPSEEK_API_KEY`
- `CLOUDBASE_ENV_ID`
- `CLOUDBASE_API_KEY`
- `BOCHA_API_KEY`（备用联网检索）

## 工作流程

1. 在新项目中填写客户名称，并在对话框录入培训需求。
2. 若培训对象、培训主题或培训天数缺失，系统先用对话追问补充；此时不会启动客户调研，也不会生成正式课表。
3. 关键需求齐备后，系统先生成结构化需求摘要，再将该摘要传给客户调研。
4. 调研优先使用 DeepSeek 联网检索；主链路失败时，博查会按四组问题备用检索：战略/年度重点、人才培养/干部培训、数字化/业务变革、能力建设/培训体系。
5. 调研结果以“事实 + 来源”和“带来源编号的课程设计启示”分开保存。备用检索只有来源时，页面与 Word 仍会展示来源，不会补写未经证实的客户事实。

## 客户调研输出

每次调研围绕以下维度：

- 客户画像：机构性质、业务范围；
- 战略与业务：中长期战略、年度重点、近期业务信号；
- 人才与能力：干部培养、培训体系、数字化及岗位能力线索；
- 培训设计启示：必须对应至少一个来源编号，不代表客户已经提出未被公开资料证明的内部需求；
- 公开资料来源：标题、证据、URL、发布日期（如有）。

主检索的 URL 必须有联网响应中的引用支撑；没有可验证引用时，主检索不会保留模型写出的 URL。备用博查结果直接保留供应商返回的 URL。所有链路均不向前端显示供应商错误、Key、HTTP 响应或堆栈。

## 页面、Word 与项目隔离

- 客户调研卡片即使只有来源也会显示，并展示标题、证据和 URL。
- 同一项目的培训需求发生实质变化时，系统会按新需求重新调研，不复用旧的课程设计启示。
- 异步请求会绑定发起项目；用户切换项目后，旧请求不会污染新项目。
- Word 和“复制文本”共用同一研究章节，顺序为：客户公开背景、战略与业务重点、人才培养与能力建设线索、课程设计启示、客户公开资料来源、课程设计思路、正式推荐课表、推荐师资简介、外部候选补充。
- 正式课表仍只使用库内、状态有效且教师课程关系已确认的数据；外部候选只作补充，不能进入正式课表。

## 本地验证

在项目目录执行：

```powershell
node --test tests/*.test.mjs
node --check edge-functions/api/chat.js
node --check edge-functions/lib/research/service.js
git diff --check
```

本版已覆盖：提示词契约、来源编号与引用过滤、博查响应与四路备用检索、源头失败状态、页面 source-only 展示、项目隔离、需求指纹缓存、Word 章节与来源 URL。
