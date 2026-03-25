# 数据模型

## 概述
当前核心持久化对象为研究任务、证据项、Vision 发现、Persona 发现、候选输出、报告。开发态默认 SQLite。

---

## 数据表/集合

### research_task

**描述:** 研究任务主记录，持有任务状态、输入、配置、结果聚合。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | string | 主键 | 任务 ID |
| status | string | 非空 | running / awaiting_review / completed 等 |
| reviewStatus | string | 非空 | pending / approved / request_rework |
| stateJson / 结构化列 | json/text | 非空 | 完整任务状态 |

### evidence_item

**描述:** 证据池对象。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | string | 主键 | 证据 ID |
| taskId | string | 索引 | 归属任务 |
| sourceLevel | string | 非空 | external / framework / simulated |
| tier | string | 非空 | T1 / T2 / T3 |

### vision_finding / persona_finding / candidate_output / report

**描述:** 各分析支路与报告的持久化结果表。

**关联关系:**
- 一个 `research_task` 关联多条 evidence / vision / persona / output / report。

