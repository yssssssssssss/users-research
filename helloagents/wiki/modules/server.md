# apps/server

## 目的
承载 API、研究编排、模型调用、证据处理与持久化。

## 模块概述
- **职责:** Fastify 路由、taskService、textNodes、searchClient、experienceModelService、uploadService。
- **状态:** 🚧开发中
- **最后更新:** 2026-03-25

## 规范
### 需求: 分析链路配置能力升级
**模块:** apps/server
需要把外部源治理、视觉 prompt 策略、Persona 文档化生成与体验模型索引能力从硬编码迁移到可配置结构。

#### 场景: 服务端按策略执行分析
已有任务运行时
- 服务端应能读取策略并决定外部源 / prompt / persona 生成方式
- 策略缺失时应安全降级到默认行为

## API接口
### [GET] /api/research/tasks/:taskId/state
**描述:** 返回完整任务状态。

## 依赖
- `packages/shared`
- `packages/model-clients`

## 变更历史
- 待实施后补充

