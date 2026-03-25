# 项目技术约定

---

## 技术栈
- **核心:** Node.js 20 / TypeScript / npm workspaces
- **后端:** Fastify + Prisma（可切 SQLite / PostgreSQL）
- **前端:** React + Vite
- **共享层:** `packages/shared` + `packages/model-clients`

---

## 开发约定
- **代码规范:** 保持最小改动、避免重复配置、优先复用现有 orchestrator / service / shared types。
- **命名约定:** TypeScript 使用驼峰；路由、模块目录延续现有命名。

---

## 错误与日志
- **策略:** 服务端通过 warnings / fallback 暴露降级信息；高风险结论必须降级口径。
- **日志:** Fastify JSON 日志；任务级状态通过 `runStats.warnings` 与 SSE / REST 输出。

---

## 测试与流程
- **测试:** 优先 `typecheck`、`build`、smoke；新增配置能力时补服务层和编排层回归。
- **提交:** 方案先落 `helloagents/plan`，实施后同步知识库并迁移至 `helloagents/history`。

