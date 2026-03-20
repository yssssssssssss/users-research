# users-research

AI 用研分析系统 monorepo 骨架。

## 目录结构

- `apps/web`：前端研究工作台
- `apps/server`：后端 API / Orchestrator / BFF
- `packages/shared`：共享类型与状态模型
- `packages/model-clients`：模型适配层（复用根目录 `modelClients.ts`）

## 启动前提

1. 在根目录安装依赖：`npm install`
2. 按需准备 PostgreSQL / Redis / `.env.local`
3. 分别执行：
   - `npm run dev:server`
   - `npm run dev:web`

### 环境变量说明

- 当前服务端会优先读取进程环境变量
- 若未提供，会回退读取根目录 `.env.local`
- 模型相关变量同时兼容：
  - `TEXT_MODEL_API_URL` / `VITE_TEXT_MODEL_API_URL`
  - `TEXT_MODEL_API_KEY` / `VITE_TEXT_MODEL_API_KEY`
  - `GEMINI_IMAGE_API_URL` / `VITE_GEMINI_IMAGE_API_URL`
  - `GEMINI_API_KEY` / `VITE_GEMINI_API_KEY`
  - `JIMENG_IMAGE_API_URL` / `VITE_JIMENG_IMAGE_API_URL`
  - `JIMENG_API_KEY` / `VITE_JIMENG_API_KEY`
- 若配置 `DATABASE_URL`，后端会自动启用 Prisma 持久化
- 若未配置 `DATABASE_URL`，后端继续使用内存存储，便于本地骨架联调

## 当前状态

本次提交完成了工程骨架、共享类型、基础 API、页面路由、Prisma 初版 schema、服务端配置层以及可切换的内存/数据库任务存储，后续可继续补充真实数据库迁移、队列和模型执行链。
