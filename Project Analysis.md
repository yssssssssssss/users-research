# 项目问题分析与优化建议

对 `users-research` 项目进行了全面代码审查，以下按优先级分类列出发现的问题。

---

## 🔴 P0 — 安全与数据泄露

| # | 问题 | 位置 | 建议 |
|:-:|:---|:---|:---|
| 1 | **`.env.example` 中硬编码了真实 API Key** | [.env.example](file:///d:/project/agent/users-research/.env.example#L15) | `TAVILY_API_KEY=tvly-G2sfd...` 是真实密钥，应替换为空值或占位符 |
| 2 | **`.env.local` 含全部密钥未被 `.gitignore` 排除** | 需确认 `.gitignore` 是否包含 `.env.local` | 确保 `.env.local` 在 `.gitignore` 中；已提交的历史需要 rotate key |
| 3 | **无 CORS 配置** | [app.ts](file:///d:/project/agent/users-research/apps/server/src/app.ts) | Fastify 未注册 `@fastify/cors`，生产环境存在跨域被拒或无限制风险 |
| 4 | **路由无鉴权 / 无请求校验** | [routes/tasks.ts](file:///d:/project/agent/users-research/apps/server/src/routes/tasks.ts#L16) | 所有 `request.body as any` 无 schema 校验，存在注入风险 |

---

## 🟠 P1 — 架构与可靠性

### 1. `taskService.ts` 过于臃肿（1633 行）
- 包含了创建、运行、持久化、Gate 逻辑、报告生成、证据复核等全部职责
- **建议**: 拆分为 `taskCrud.ts`、`gateEngine.ts`、`reportBuilder.ts`、`persistenceAdapter.ts`

### 2. `textNodes.ts` 同样超大（1250 行）
- 混合了 prompt 构建、LLM 调用、结果解析、fallback 逻辑
- **建议**: 每个节点拆为独立文件，prompt 模板抽出为 `.prompt.ts`

### 3. 内存存储不可靠
- [mockStore.ts](file:///d:/project/agent/users-research/apps/server/src/services/mockStore.ts) 仅 `Map<string, T>`，进程重启数据全丢
- SSE 轮询依赖内存状态，重启后前端任务状态断裂
- **建议**: 默认集成 SQLite (via Prisma) 作为零配置持久化

### 4. 任务 ID 碰撞风险
```typescript
// taskService.ts:1035
const taskId = `task_${Math.random().toString(36).slice(2, 10)}`;
```
- `Math.random()` 生成的 8 字符 base36 ID，约在 ~78K 个任务后有 50% 碰撞概率
- **建议**: 使用 `crypto.randomUUID()` 或 `nanoid`

### 5. 前端状态在 `zustand` 中不持久化
- [taskStore.ts](file:///d:/project/agent/users-research/apps/web/src/store/taskStore.ts): 页面刷新后 `currentTaskId`、`taskSummary` 全部丢失，用户无法恢复进度
- **建议**: 添加 `zustand/middleware` 的 `persist` 中间件，存入 `localStorage`

### 6. `modelClients.ts` 根目录孤立文件
- 根目录的 [modelClients.ts](file:///d:/project/agent/users-research/modelClients.ts)（1217 行）与 `packages/model-clients/src/index.ts`（仅 re-export）分离
- **建议**: 将核心逻辑移入 `packages/model-clients/src/` 下拆分多个文件

---

## 🟡 P2 — 代码质量

| # | 问题 | 位置 | 建议 |
|:-:|:---|:---|:---|
| 1 | **大量 `as any` 类型断言** | `taskService.ts` 中有 `as any` 超 10 处 | 用 Fastify 的 JSON Schema 或 Zod 做运行时校验 |
| 2 | **Prisma 持久化 update/create 重复代码** | `persistStateToDb` 内每个 entity 的 upsert 字段完全重复 | 抽取工厂函数减少 200+ 行重复 |
| 3 | **`modelClients.ts` 声明 `declare const process: any`** | [modelClients.ts:16](file:///d:/project/agent/users-research/modelClients.ts#L16) | 应使用 Node.js 类型或条件导入 |
| 4 | **前端 `api.ts` 无统一的 baseURL 配置** | [api.ts](file:///d:/project/agent/users-research/apps/web/src/lib/api.ts) | 当前依赖 Vite proxy，但无 fallback；建议从环境变量注入 `API_BASE_URL` |
| 5 | **混合行尾** (CRLF / LF) | 多个文件交替出现 `\r\n` 和 `\n` | 添加 `.editorconfig` 和 Prettier 统一格式 |
| 6 | **无 ESLint / Prettier 配置** | 项目无 lint 工具 | 添加 `eslint.config.js` + `prettier` |

---

## 🔵 P2 — 性能

| # | 问题 | 位置 | 建议 |
|:-:|:---|:---|:---|
| 1 | **SSE 轮询每 3 秒全量查询** | [tasks.ts:129-131](file:///d:/project/agent/users-research/apps/server/src/routes/tasks.ts#L129) | 全量 `getTaskSummary + getTask` 含所有子表数据，应改为增量或事件驱动 |
| 2 | **`persistStateToDb` 在单 tx 内做大量串行 upsert** | `taskService.ts:706-1029` | N 条证据 → N 次 upsert，应用 `createMany` + batch 替代 |
| 3 | **Prisma `include` 始终加载全部关联** | `taskInclude` 固定全 `true` | 按场景裁剪 `include`，轻量 API 不需加载 reports/visionFindings |
| 4 | **前端 `WorkbenchPage` 同时 HTTP 轮询 + SSE** | 两套机制可能重复请求 | 统一为 SSE 驱动，移除 HTTP 轮询 fallback |

---

## 🟢 P3 — 前端体验

| # | 问题 | 类型 | 建议 |
|:-:|:---|:---|:---|
| 1 | **无全局错误边界** | 稳定性 | 添加 React `ErrorBoundary` 组件 |
| 2 | **无 loading 态** | UX | `WorkbenchPage`、`EvidenceBoardPage` 数据加载时无骨架屏或 Spin |
| 3 | **路由无 404 页面** | UX | `router.tsx` 缺少通配路由 |
| 4 | **报告页 586 行单文件** | 可维护性 | `ReportPage.tsx` 拆分为 `ReportViewer`、`ReportDiff`、`ReportReview` 组件 |
| 5 | **`styles.css` 仅 344 字节** | 视觉 | 当前样式极简，缺乏专业设计系统 |
| 6 | **Antd 主题仅设了 `borderRadius: 14`** | 视觉 | 应定义完整的配色、间距、字体等 token |

---

## ⚙️ P3 — 工程基建

| # | 问题 | 当前状态 | 建议 |
|:-:|:---|:---|:---|
| 1 | **无单元测试** | 零测试 | 添加 Vitest，覆盖 `gateEngine`、`textNodes` 核心逻辑 |
| 2 | **无 CI/CD 配置** | 无 | 添加 GitHub Actions：lint → typecheck → test → build |
| 3 | **`@esbuild/win32-x64` 手动安装** | 不稳定 | 根因是 `npm install --omit=optional`，应在 `.npmrc` 中设 `optional=true` |
| 4 | **无 Dockerfile / 部署脚本** | 无 | 添加多阶段 Dockerfile，前后端分别构建 |
| 5 | **Prisma 未配置迁移文件** | README 提到"后续补充" | 运行 `prisma migrate dev` 生成初版迁移 |
| 6 | **缺少 `tsconfig` 路径映射** | workspace 靠 npm 软链 | 配合 `paths` 映射提升 IDE 跳转体验 |

---

## 总结：建议优先级路线图

```mermaid
graph LR
  A["P0: 安全加固<br/>~1天"] --> B["P1: 架构拆分<br/>~3天"]
  B --> C["P2: 代码质量+性能<br/>~2天"]
  C --> D["P3: 前端体验+工程基建<br/>~3天"]
```

> 推荐从 **P0 安全问题** 开始，立即清除硬编码密钥并添加 CORS + 请求校验，然后进行 **P1 架构拆分** 以降低后续优化难度。
