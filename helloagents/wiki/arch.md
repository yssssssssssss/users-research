# 架构设计

## 总体架构
```mermaid
flowchart TD
    UI[apps/web 工作台] --> API[apps/server Fastify API]
    API --> ORCH[orchestrator/textNodes]
    ORCH --> EXP[experienceModelService]
    ORCH --> SEARCH[searchClient]
    ORCH --> MODEL[modelGateway / modelClients]
    ORCH --> STORE[SQLite / Prisma]
    STORE --> REPORT[报告 / 审核 / 持久化]
```

## 技术栈
- **后端:** Fastify、TypeScript、Prisma、better-sqlite3
- **前端:** React、Vite
- **数据:** SQLite（当前默认）、PostgreSQL（可切换）

## 核心流程
```mermaid
sequenceDiagram
    participant U as 用户
    participant W as Web
    participant S as Server
    participant O as Orchestrator
    U->>W: 新建任务 / 上传图片
    W->>S: 创建任务 + 运行
    S->>O: 执行输入解析
    O->>O: 体验模型 / 外部检索 / Vision / Persona
    O->>S: 综合判断与候选输出
    S->>W: 任务状态 / 结果 / 报告
```

## 重大架构决策
完整的 ADR 存储在各变更的 how.md 中，本章节提供索引。

| adr_id | title | date | status | affected_modules | details |
|--------|-------|------|--------|------------------|---------|
| ADR-20260325-01 | 分析链路配置能力从硬编码转向注册表 + 策略层 | 2026-03-25 | 📝规划中 | server, web, shared | 待本次方案实施后补链接 |

