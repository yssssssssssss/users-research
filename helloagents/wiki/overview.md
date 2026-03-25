# users-research

> AI 用研分析系统 Monorepo，当前已具备“任务创建 → 研究编排 → 结果展示 → 报告生成 → 持久化”主链路。

---

## 1. 项目概述

### 目标与背景
项目用于把输入解析、体验模型、外部检索、视觉评审、Persona 模拟、综合判断串成可运行的 AI 用研流程，并支持结果页、报告、审核与持久化。

### 范围
- **范围内:** 任务编排、证据池、Vision / Persona / Experience Model、报告、审核、SQLite / PostgreSQL 持久化。
- **范围外:** 生产级高可信证据引擎、成熟的配置中心、稳定的管理后台。

### 干系人
- **负责人:** 当前仓库维护者 / 内部产品与研发协作人员

---

## 2. 模块索引

| 模块名称 | 职责 | 状态 | 文档 |
|---------|------|------|------|
| `apps/server` | API、编排、持久化、证据与报告服务 | 🚧开发中 | [server](modules/server.md) |
| `apps/web` | 研究工作台、结果页、审核与展示 | 🚧开发中 | [web](modules/web.md) |
| `packages/shared` | 共享类型、状态模型、接口契约 | ✅稳定 | [shared](modules/shared.md) |
| `packages/model-clients` | 文本 / 图像模型适配层 | 🚧开发中 | [model-clients](modules/model-clients.md) |

---

## 3. 快速链接
- [技术约定](../project.md)
- [架构设计](arch.md)
- [API 手册](api.md)
- [数据模型](data.md)
- [变更历史](../history/index.md)

