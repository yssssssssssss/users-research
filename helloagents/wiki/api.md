# API 手册

## 概述
当前 API 由 `apps/server/src/routes` 提供，覆盖任务、证据、Persona、Vision、上传、系统信息、报告。

## 认证方式
当前本地开发态未实现独立认证层。

---

## 接口列表

### 任务

#### [POST] /api/research/tasks
**描述:** 创建研究任务。

#### [POST] /api/research/tasks/:taskId/run
**描述:** 运行任务，支持同步 / 异步。

#### [GET] /api/research/tasks/:taskId
**描述:** 获取任务摘要。

#### [GET] /api/research/tasks/:taskId/state
**描述:** 获取完整任务状态。

### 证据 / Vision / Persona

#### [GET] /api/research/tasks/:taskId/evidence
**描述:** 获取证据池。

#### [GET] /api/research/tasks/:taskId/vision
**描述:** 获取视觉评审结果。

#### [GET] /api/research/tasks/:taskId/persona
**描述:** 获取 Persona 结果。

#### [POST] /api/research/tasks/:taskId/vision/rerun
**描述:** 重跑 Vision 支路。

#### [POST] /api/research/tasks/:taskId/persona/rerun
**描述:** 重跑 Persona 支路。

### 系统

#### [GET] /api/system/models
**描述:** 返回模型清单。

#### [GET] /api/system/model-policies
**描述:** 返回模型策略预设。

#### [GET] /api/system/experience-models
**描述:** 返回体验模型目录。

### 上传

#### [POST] /api/uploads
**描述:** 上传图片 / 设计稿 / 文档，当前落本地磁盘并回传 URL。

