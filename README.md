# users-research

AI 用研分析系统 Monorepo。

当前项目已经具备一条可运行的“任务创建 → 研究编排 → 结果展示 → 报告生成”链路，适合用于演示、联调、真实案例回放与能力边界验证。

---

## 当前已实现能力

- Web 研究工作台
  - 新建任务
  - 任务流状态查看
  - 候选输出预览
  - 证据 / Vision / Persona / 报告页面
- 结果总览页
  - 专门路由：`/result`
  - 面向演示和最终结果展示
  - 展示任务摘要、核心结论、体验模型视角、核心证据、Vision / Persona 摘要、建议动作
- 服务端研究编排链路
  - Problem Decomposer
  - Experience Model Router
  - External Search
  - Vision MoE
  - Persona Sandbox
  - Judgment Synthesizer
- 体验模型能力
  - 先读 `体验评估模型/整体总结-体验模型.pdf`
  - 再路由到具体模型 PDF
  - 支持自动推荐 + 手动覆盖
  - 已接入最终报告与结果页展示
- 报告与门禁
  - 支持候选输出生成报告
  - 支持 RQ / T1-T3 门禁
  - 支持审核状态流转

---

## 本次验证过的真实案例

已验证案例：

- **电商首页内容种草区价值评估**

验证结果表明：

- 项目可以跑通完整链路
- Web 端可以展示最终结果页
- 可生成待审核报告
- 当前仍存在部分节点超时后 fallback 的情况，因此更适合：
  - 演示
  - 联调
  - 方法链路验证
  - 真实案例试跑

而不是直接作为完全稳定的生产级自动研究系统。

---

## 项目结构

- `apps/web`：前端研究工作台
- `apps/server`：后端 API / Orchestrator / BFF
- `packages/shared`：共享类型与状态模型
- `packages/model-clients`：模型适配层（复用根目录 `modelClients.ts`）
- `体验评估模型`：体验模型 PDF 资料
- `doc`：方案说明与验收记录

---

## 本地启动

### 1. 安装依赖

```bash
npm install
```

### 2. 准备环境变量

根目录放置 `.env.local`。

服务端会优先读取进程环境变量；若未提供，则回退读取根目录 `.env.local`。

支持的核心变量：

- `TEXT_MODEL_API_URL` / `VITE_TEXT_MODEL_API_URL`
- `TEXT_MODEL_API_KEY` / `VITE_TEXT_MODEL_API_KEY`
- `ANTHROPIC_API_URL` / `VITE_ANTHROPIC_API_URL`
- `ANTHROPIC_API_KEY` / `VITE_ANTHROPIC_API_KEY`
- `GEMINI_IMAGE_API_URL` / `VITE_GEMINI_IMAGE_API_URL`
- `GEMINI_API_KEY` / `VITE_GEMINI_API_KEY`
- `JIMENG_IMAGE_API_URL` / `VITE_JIMENG_IMAGE_API_URL`
- `JIMENG_API_KEY` / `VITE_JIMENG_API_KEY`
- `DATABASE_URL`

说明：

- 不配置 `DATABASE_URL` 时，后端使用内存存储，适合本地联调
- 配置 `DATABASE_URL=file:apps/server/tmp/users-research.sqlite` 时，启用 SQLite 持久化
- 配置 `DATABASE_URL` 为 PostgreSQL 连接串时，持久化模式切到 PostgreSQL

### 3. 启动服务

推荐直接用脚本：

```bash
npm run stack:start
```

或分别启动：

```bash
npm run dev:server
npm run dev:web
```

默认地址：

- Web：`http://localhost:5173`
- Server：`http://127.0.0.1:8787`

若默认端口已被占用，`npm run stack:start` 会自动顺延到下一个可用端口，并在启动完成后打印实际地址；可用 `npm run stack:status` 查看当前端口。

停止 / 查看状态：

```bash
npm run stack:stop
npm run stack:status
```

---

## 本地验证脚本

### 1. 基础链路 smoke

```bash
npm run smoke:server
```

### 2. SQLite 持久化 smoke

会自动执行：

- 创建任务
- 运行完整流程
- 生成报告
- 重启 server
- 再次读取任务 / 输出 / 报告
- 验证 SQLite 文件确实落盘

```bash
npm run smoke:persistence
```

真实模式（依赖真实模型 / 检索配置）：

先检查真实模式配置是否齐全：

```bash
npm run smoke:preflight
```

再执行：

```bash
npm run smoke:server:real
npm run smoke:persistence:real
```

---

## 常用页面

- `/`：新建任务
- `/workbench`：任务工作台
- `/evidence`：证据看板
- `/vision`：Vision Lab
- `/persona`：Persona Lab
- `/report`：综合报告
- `/result`：结果总览页
- `/ops`：审核与观测

---

## 当前已知边界

- 文本模型节点在复杂提示下仍可能超时
- Vision 在未提供真实设计图时，只能做弱视觉推断
- Persona 输出属于模拟结果，不能视为真实用户证据
- 体验模型属于方法论框架证据，不能提升为 T1
- 证据型报告仍依赖更高等级事实证据与更高 RQ 才能放行

---

## 最近补充的稳定性策略

- 为编排节点增加了超时回退
- 当模型长时间无响应时，会自动退回本地 fallback，而不是一直卡死
- 结果页与报告页仍可继续产出可展示结果

---

## 当前仓库状态建议

如果你要继续推进，优先级建议是：

1. 继续增强模型调用超时与取消机制
2. 提升 PDF 文本提取稳定性
3. 增加真实外部检索与证据校验
4. 强化报告页与审核页联动
