# AI 用研分析链路重构实施包

日期：2026-03-24

## 1. 目标

将当前系统从“松散串联的分析节点”重构为“输入解析层 + 四模块分析层 + 总结层 + 页面展示层”的真实可执行架构。

目标链路：

```text
输入解析层
  -> 体验模型模块
  -> 外部检索模块
  -> 视觉评审模块
  -> 模拟用户模块
  -> 总结层
  -> 页面展示 / 报告 / 持久化
```

## 2. 现状结论

### 2.1 已经具备的基础
- 已有任务状态持久化（SQLite）
- 已有真实图片上传链路
- 已有真实搜索 + 原文抓取能力
- 已有 Vision 多模型调用能力
- 已有 Persona 模拟能力
- 已有结果页 / 综合报告页 / 证据池页

### 2.2 与目标流程的差距

#### 输入解析层
当前只输出 `subQuestions`，没有统一的分析计划对象，缺：
- coreGoal
- artifactType
- targetAudience
- businessContext
- subprompt1~4

#### 体验模型模块
当前只是体验模型库路由 + 框架内容注入，不是“按 subprompt1 对稿件做结构化评估”的评估引擎。

#### 外部检索模块
当前更像“外部证据候选入池器”，不是“检索 -> 抓取 -> 摘要 -> 结构化洞察”的完整研究模块。

#### 视觉评审模块
当前有真实多模型视觉分析，但没有：
- 三角色定义
- 角色级评分结构
- 角色共识/冲突汇总对象

#### 模拟用户模块
当前只有固定 persona 一条反馈，不是：
- 人群画像 -> 数字人实例化
- 多维评分 + 评论
- 汇总评分表 / 共性痛点 / 分歧点

#### 总结层
当前已经有综合判断，但输入源不是四模块结构化结果对象，而是零散 evidence / vision / persona 拼接。

## 3. 控制合同（Control Contract）

### Primary Setpoint
构建一个以 `AnalysisPlan` 为中心的分析链路，确保四模块各自拥有明确输入、执行结果、真实性边界和可追溯输出。

### Acceptance
1. 输入解析层输出完整 `AnalysisPlan`
2. 四模块各自输出结构化 `Result`
3. 页面可独立展示四模块与总结层
4. 结果持久化并在重启后恢复
5. fallback / mock 触发时，结论与 UI 同步降级

### Guardrails
- Persona 永不升级为真实用户证据
- 搜索 snippet 永不直接当已验证事实
- Vision 推演永不伪装为 T1 证据
- mock 路径必须显式暴露，不得隐式走通

## 4. 目标数据模型

建议在 `packages/shared/src/types/research.ts` 扩展：

```ts
interface AnalysisPlan {
  coreGoal: string;
  artifactType: 'ui_design' | 'copy' | 'product_plan' | 'marketing_asset' | 'prototype';
  evaluationFocus: string[];
  targetAudience: string;
  businessContext: string;

  experienceModelPlan: {
    task: string;
    focusDimensions: string[];
    preferredModelIds: string[];
    evaluationQuestions: string[];
  };

  externalSearchPlan: {
    task: string;
    searchQueries: string[];
    searchIntent: string;
    expectedInsights: string[];
  };

  visualReviewPlan: {
    task: string;
    reviewDimensions: string[];
    businessGoal: string;
    keyConcerns: string[];
  };

  personaSimulationPlan: {
    task: string;
    personaTypes: string[];
    simulationScenarios: string[];
    ratingDimensions: string[];
  };
}
```

建议在 `ResearchTaskState` 增加：

```ts
analysisPlan?: AnalysisPlan;
moduleResults?: {
  experienceModel?: ExperienceModelResult;
  externalSearch?: ExternalSearchResult;
  visualReview?: VisualReviewResult;
  personaSimulation?: PersonaSimulationResult;
};
synthesisResult?: SynthesisResult;
```

## 5. 目标编排结构

### 5.1 输入解析层
新增节点：`executeInputParser()`

输出：
- `AnalysisPlan`
- `subQuestions`（作为派生字段保留）

### 5.2 体验模型模块
拆成：
- `routeExperienceModels(plan)`
- `evaluateExperienceModels(plan, selectedModels, artifact)`

输出对象：
- 模型适配性
- 逐维度评分
- 综合评分
- 风险 / 优势 / 改进建议 / 追问建议

### 5.3 外部检索模块
拆成：
- `buildExternalSearchQueries(plan)`
- `runExternalSearch(queries)`
- `fetchExternalSources(urls)`
- `summarizeExternalFindings(plan, searchResults, snapshots)`

输出对象：
- 检索查询
- 原始结果
- 抓取快照
- 结构化洞察摘要
- 可信度分层

### 5.4 视觉评审模块
引入三角色：
- `structural`
- `emotional`
- `behavioral`

每个角色输出：
- 逐维度评分
- 问题列表
- 单点最高优先建议

再做：
- 共识汇总
- 冲突汇总
- 优先级行动清单

### 5.5 模拟用户模块
拆成：
- `selectPersonaProfiles(plan)`
- `instantiateDigitalPersonas(plan, personaProfiles)`
- `reviewByDigitalPersona(artifact, persona)`
- `aggregatePersonaReviews(reviews)`

输出对象：
- 数字人实例
- 单人评分 / 评论
- 汇总评分表
- 共性痛点 / 亮点 / 分歧 / 流失点

### 5.6 总结层
输入：
- 四模块结构化结果

输出：
- 跨模块共识
- 跨模块冲突
- 核心结论（含证据来源和置信度）
- TOP 3 改进建议
- 待验证假设
- 下一步研究建议

## 6. Prompt / Role 系统重构

当前 prompt 主要散落在 `textNodes.ts` 中，后续应拆到：

```text
apps/server/src/prompts/
  inputParser.ts
  experienceModel.ts
  externalSearch.ts
  visualReview.ts
  personaSimulation.ts
  synthesis.ts
```

每个 prompt 模块输出：
- systemPrompt
- userPrompt
- outputSchemaName
- version

角色定义单独维护：

```text
apps/server/src/prompts/roles/
  visualReviewers.ts
  personas.ts
```

原则：
- 角色定义与模型供应商解绑
- 模型只是路由，角色才是业务语义
- prompt 必须版本化，可审计

## 7. 模型路由建议

在 `modelGateway.ts` 中引入逻辑路由，不在业务代码中硬编码供应商名。

建议逻辑路由：
- `inputParser`
- `experienceEvaluator`
- `externalSearchPlanner`
- `externalSearchSummarizer`
- `visionStructural`
- `visionEmotional`
- `visionBehavioral`
- `personaGenerator`
- `personaReviewer`
- `synthesis`
- `synthesisReview`

推荐主路由：
- 输入解析：GPT 5.4
- 体验模型评估：GPT 5.4
- 外部检索摘要：GPT 5.4 / GLM-5
- 视觉结构：GPT 5.4
- 视觉情感：Claude
- 视觉行为：Gemini
- Persona 生成：GPT 5.4
- Persona 审阅：Kimi / GLM / MiniMax
- 总结层：GPT 5.4 + 多模型复核

## 8. 页面重构方案

### 8.1 工作台页
改成“任务编排页”，展示：
- 输入解析结果
- 四模块状态
- 当前真实性状态
- 执行进度

### 8.2 结果页
改成：
- 四模块卡片
- 总结层卡片
- 每个卡片显示真实性等级和证据边界

### 8.3 综合报告页
继续承担：
- 正式报告正文
- 版本历史
- 审核状态
- Gate 和缺口

## 9. 防造假与真实性门禁

### 硬规则
1. mock 代码移动到独立 mock 层
2. 默认生产路径不允许 mock
3. mock 一旦触发：
   - UI 显示
   - 结论降级
   - 报告不得 approved
4. 外部搜索结果必须区分：
   - search_result
   - fetched_article
   - reviewed_external
5. Persona 永远标注为 simulated
6. Vision 永远标注为 expert inference / model review

## 10. 分阶段实施路线

### Phase 1：打基础（P0）
1. 引入 `AnalysisPlan`
2. 输入解析节点重构
3. Prompt registry 建立
4. types / 持久化扩展

### Phase 2：重构四模块（P1）
5. 体验模型模块 router + evaluator
6. 外部检索模块 query + fetch + summarize
7. 视觉评审三角色化
8. Persona 数字人化 + 评分化

### Phase 3：总结层与 UI（P2）
9. synthesisResult 结构化输出
10. 结果页改成“四模块 + 总结层”
11. 工作台页改成任务编排视图

### Phase 4：真实性门禁（P3）
12. mock 隔离
13. 分层真实性标签
14. 报告审批门禁升级

## 11. 验证方案

### L0
- typecheck
- build
- JSON schema 校验
- prompt 输出解析测试

### L1
- 输入解析节点集成测试
- 体验模型模块集成测试
- 外部检索真实搜索链路测试
- 视觉三角色聚合测试
- Persona 聚合测试

### L2
真实任务端到端：
1. 创建任务
2. 上传图片
3. 运行完整流程
4. SQLite 落盘
5. 页面恢复
6. 检查 fallback / mock 是否被正确标注

## 12. 风险

1. `gpt5.4` 当前是否已在网关中可用，需要 capability probe，不应直接假定。
2. Persona 模块如果一开始做“多 persona × 多模型”，时延和成本会爆炸，应先做单模型角色评审版。
3. 外部检索如果继续只总结 snippet，会继续产生伪洞察，必须强制抓原文分层。

## 13. 建议的下一步实施顺序

最优先先做 3 件事：
1. `AnalysisPlan` 引入
2. Prompt registry 引入
3. 输入解析层重构

原因：
没有这三项，后面四模块重构都只是继续堆 patch，不会形成稳定主链。
