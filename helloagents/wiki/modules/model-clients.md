# packages/model-clients

## 目的
封装文本 / 图像模型调用与超时控制。

## 模块概述
- **职责:** chatCompletions、stream、多模型串行 fallback、图像生成 / 编辑接口。
- **状态:** 🚧开发中
- **最后更新:** 2026-03-25

## 规范
### 需求: 分析链路模型策略可配置
**模块:** packages/model-clients
模型客户端需要继续保持 provider 无关，同时允许上层注入更细粒度的超时与策略。

#### 场景: 视觉 / Persona 使用不同策略
不同分析节点调用模型时
- 上层可覆盖模型、超时、fallback
- 客户端保持统一调用面

## 依赖
- `modelClients.ts`

## 变更历史
- 待实施后补充

