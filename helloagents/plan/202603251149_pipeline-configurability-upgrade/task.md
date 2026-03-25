# 任务清单: 分析链路可配置化升级

目录: `helloagents/plan/202603251149_pipeline-configurability-upgrade/`

---

## 1. 外部源治理层
- [ ] 1.1 在 `packages/shared/src/types/*` 中定义外部源策略类型（引擎顺序、域名 allow/block、来源信誉、版本字段），验证 why.md#需求-外部源策略热更新
- [ ] 1.2 在 `apps/server/src/services/searchClient.ts` 中接入 source policy 过滤与引擎优先级读取，验证 why.md#需求-外部源策略热更新，依赖任务1.1
- [ ] 1.3 在 `apps/server/src/routes/system.ts` 与对应 service 中暴露 source policy 读取/更新接口，验证 why.md#需求-外部源策略热更新，依赖任务1.2

## 2. 视觉 Prompt 注册表
- [ ] 2.1 在 `apps/server/src/prompts/roles/visualReviewers.ts`、新建 prompt registry 文件中重构静态角色定义为模板注册表，验证 why.md#需求-视觉-prompt-库动态匹配
- [ ] 2.2 在 `apps/server/src/prompts/visualReview.ts` 与 `apps/server/src/orchestrator/textNodes.ts` 中实现 matcher 逻辑与默认回退，验证 why.md#需求-视觉-prompt-库动态匹配，依赖任务2.1

## 3. Persona 文档化生成
- [ ] 3.1 在 `apps/server/src/prompts/roles/personas.ts` 与相关 shared types 中引入“文档来源 persona”结构，验证 why.md#需求-persona-基于文档生成
- [ ] 3.2 在 `apps/server/src/orchestrator/textNodes.ts` 中改造 Persona 选择逻辑：优先使用文档抽取结果，其次回退内置库，验证 why.md#需求-persona-基于文档生成，依赖任务3.1
- [ ] 3.3 在 `apps/server/src/routes/uploads.ts` / 新增 service 中预留 persona 文档导入与抽取入口，验证 why.md#需求-persona-基于文档生成，依赖任务3.2

## 4. 体验模型资料索引
- [ ] 4.1 在 `apps/server/src/services/experienceModelService.ts` 中新增 chunk/metadata 索引构建与缓存层，验证 why.md#需求-体验模型资料索引升级
- [ ] 4.2 在 `apps/server/src/services/experienceModelService.ts` 中保留直接 PDF 读取回退，并抽象可选 embedding 接口，验证 why.md#需求-体验模型资料索引升级，依赖任务4.1

## 5. 配置持久化与观测
- [ ] 5.1 在 `apps/server` 持久化层中加入 analysis policy / persona document 基础存储，验证 why.md#变更内容
- [ ] 5.2 在任务结果与系统接口中补充“本次命中的 source policy / prompt template / persona source / experience model chunk”追踪信息，验证 why.md#变更内容，依赖任务5.1

## 6. 安全检查
- [ ] 6.1 执行安全检查（配置 schema 校验、热更新回退、敏感文档处理、错误 prompt 输入约束、EHRB风险规避）

## 7. 文档更新
- [ ] 7.1 更新 `helloagents/wiki/arch.md`
- [ ] 7.2 更新 `helloagents/wiki/api.md`
- [ ] 7.3 更新 `helloagents/wiki/data.md`
- [ ] 7.4 更新 `README.md`

## 8. 测试
- [ ] 8.1 为 source policy / visual prompt matcher / persona 文档抽取 / experience model 索引补充测试与 smoke 场景

---

## 任务状态符号
- `[ ]` 待执行
- `[√]` 已完成
- `[X]` 执行失败
- `[-]` 已跳过
- `[?]` 待确认
