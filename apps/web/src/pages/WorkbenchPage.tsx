import { Button, Card, Col, Descriptions, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ResearchTaskState, TaskSummaryResponse } from '@users-research/shared';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { api } from '../lib/api';
import {
  TASK_DETAIL_EXPERIENCE_PATH,
  TASK_DETAIL_EVIDENCE_PATH,
  TASK_DETAIL_PERSONA_PATH,
  TASK_DETAIL_REPORT_PATH,
  TASK_DETAIL_RESULT_PATH,
  TASK_DETAIL_VISION_PATH,
} from '../lib/navigation';
import { useTaskStore } from '../store/taskStore';

const { Title, Paragraph } = Typography;
const MAX_EVENT_COUNT = 20;

const statusColorMap: Record<string, string> = {
  completed: 'green',
  awaiting_review: 'blue',
  running: 'gold',
  queued: 'gold',
  draft: 'default',
  failed: 'red',
  cancelled: 'red',
  partial_failed: 'orange',
};

export const WorkbenchPage = () => {
  const navigate = useNavigate();
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const taskSummary = useTaskStore((state) => state.taskSummary);
  const taskState = useTaskStore((state) => state.taskState);
  const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
  const setTaskState = useTaskStore((state) => state.setTaskState);
  const setSelectedOutput = useTaskStore((state) => state.setSelectedOutput);
  const [events, setEvents] = useState<string[]>([]);

  const appendEvent = useCallback((message: string) => {
    const normalized = message.trim();
    if (!normalized) return;

    setEvents((prev) => {
      if (prev[prev.length - 1] === normalized) {
        return prev;
      }

      return [...prev.slice(-(MAX_EVENT_COUNT - 1)), normalized];
    });
  }, []);

  const loadTaskContext = useCallback(async () => {
    if (!currentTaskId) return;

    const [summary, state] = await Promise.all([
      api.getTask(currentTaskId),
      api.getTaskState(currentTaskId),
    ]);

    setTaskSummary(summary);
    setTaskState(state);
  }, [currentTaskId, setTaskState, setTaskSummary]);

  useEffect(() => {
    if (!currentTaskId) return;
    let active = true;

    void loadTaskContext();

    const eventSource = new EventSource(`/api/research/tasks/${currentTaskId}/stream`);
    eventSource.onopen = () => {
      appendEvent('实时流已连接');
    };
    eventSource.addEventListener('connected', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          taskId?: string;
        };
        appendEvent(`已接入任务流：${payload.taskId || currentTaskId}`);
      } catch {
        appendEvent('已接入任务流');
      }
    });
    eventSource.addEventListener('task_status', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          summary?: TaskSummaryResponse;
          state?: ResearchTaskState;
        };

        if (!active) return;
        if (payload.summary) setTaskSummary(payload.summary);
        if (payload.state) setTaskState(payload.state);

        appendEvent(
          `任务状态更新：${payload.summary?.status || payload.state?.status || 'unknown'} / ${
            payload.summary?.currentNode || payload.state?.currentNode || '未开始'
          }`,
        );
      } catch {
        appendEvent(`task_status: ${(event as MessageEvent).data}`);
        void loadTaskContext();
      }
    });
    eventSource.addEventListener('task_complete', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          status?: string;
          reviewStatus?: string;
        };
        appendEvent(
          `任务已进入终态：${payload.status || 'unknown'} / ${payload.reviewStatus || 'unknown'}`,
        );
      } catch {
        appendEvent('任务已进入终态');
      }
      eventSource.close();
    });
    eventSource.onerror = () => {
      appendEvent('实时流异常，已回退到接口刷新。');
      void loadTaskContext();
    };

    return () => {
      active = false;
      eventSource.close();
    };
  }, [appendEvent, currentTaskId, loadTaskContext, setTaskState, setTaskSummary]);

  if (!currentTaskId || !taskSummary) {
    return <Empty description="请先创建任务" />;
  }

  const analysisPlan = taskState?.analysisPlan;
  const moduleResults = taskState?.moduleResults;
  const synthesisResult = taskState?.synthesisResult;

  const flowCards = [
    {
      key: 'input',
      title: '输入解析',
      status: analysisPlan ? 'completed' : taskSummary.currentNode === 'input_parser' ? 'running' : 'pending',
      summary: analysisPlan?.coreGoal || '尚未完成输入解析',
      detail: analysisPlan?.targetAudience,
      href: undefined,
    },
    {
      key: 'experience',
      title: '体验模型',
      status: moduleResults?.experienceModel ? 'completed' : taskSummary.currentNode === 'experience_model_router' ? 'running' : 'pending',
      summary: moduleResults?.experienceModel?.summary || analysisPlan?.experienceModelPlan.task || '尚未执行',
      detail: moduleResults?.experienceModel?.selectedModelNames?.join('、'),
      href: TASK_DETAIL_EXPERIENCE_PATH(currentTaskId),
    },
    {
      key: 'evidence',
      title: '外部检索 / 证据',
      status: moduleResults?.externalSearch ? 'completed' : taskSummary.currentNode === 'external_search' ? 'running' : 'pending',
      summary: moduleResults?.externalSearch?.keyInsights?.[0]?.insight || analysisPlan?.externalSearchPlan.task || '尚未执行',
      detail: moduleResults?.externalSearch?.queries?.slice(0, 2).join('；'),
      href: TASK_DETAIL_EVIDENCE_PATH(currentTaskId),
    },
    {
      key: 'vision',
      title: '视觉评审',
      status: moduleResults?.visualReview ? 'completed' : taskSummary.currentNode === 'vision_moe' ? 'running' : 'pending',
      summary: moduleResults?.visualReview?.prioritizedActions?.[0] || analysisPlan?.visualReviewPlan.task || '尚未执行',
      detail: moduleResults?.visualReview?.consensus?.[0],
      href: TASK_DETAIL_VISION_PATH(currentTaskId),
    },
    {
      key: 'persona',
      title: '模拟用户',
      status: moduleResults?.personaSimulation ? 'completed' : taskSummary.currentNode === 'persona_sandbox' ? 'running' : 'pending',
      summary: moduleResults?.personaSimulation?.aggregate.sharedPainPoints?.[0] || analysisPlan?.personaSimulationPlan.task || '尚未执行',
      detail: moduleResults?.personaSimulation?.digitalPersonas?.length ? `${moduleResults.personaSimulation.digitalPersonas.length} 位数字人` : undefined,
      href: TASK_DETAIL_PERSONA_PATH(currentTaskId),
    },
    {
      key: 'synthesis',
      title: '综合结论',
      status: synthesisResult?.conclusions?.length ? 'completed' : taskSummary.currentNode === 'judgment_synthesizer' ? 'running' : 'pending',
      summary: synthesisResult?.conclusions?.[0]?.content || '尚未形成综合结论',
      detail: synthesisResult?.topRecommendations?.[0],
      href: TASK_DETAIL_RESULT_PATH(currentTaskId),
    },
  ];

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 8 }}>任务总览</Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          这里是链路入口页：先看输入解析与执行进度，再进入各模块查看各自的任务定义和执行结果。
        </Paragraph>
      </div>

      <div className="metric-grid">
        <Card><Statistic title="任务状态" value={taskSummary.status} /></Card>
        <Card><Statistic title="RQ 级别" value={taskSummary.rqLevel || '未判定'} /></Card>
        <Card><Statistic title="预计成本" value={taskSummary.stats.costEstimate || 0} suffix="元" /></Card>
        <Card><Statistic title="当前节点" value={taskSummary.currentNode || '未开始'} /></Card>
      </div>

      <Row gutter={16}>
        <Col span={10}>
          <Card title="任务概览" className="page-card">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="标题">{taskSummary.title || '未命名任务'}</Descriptions.Item>
              <Descriptions.Item label="问题">{taskSummary.query}</Descriptions.Item>
              <Descriptions.Item label="输入类型">{taskSummary.inputType}</Descriptions.Item>
              <Descriptions.Item label="分析模式">{taskSummary.taskMode}</Descriptions.Item>
              <Descriptions.Item label="审核状态">{taskSummary.reviewStatus}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={14}>
          <Card title="最近状态" className="page-card">
            <List
              size="small"
              dataSource={events.slice(-5).reverse()}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Card>
        </Col>
      </Row>

      {analysisPlan ? (
        <Card title="输入解析" className="page-card">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="核心目标">{analysisPlan.coreGoal}</Descriptions.Item>
            <Descriptions.Item label="稿件类型">{analysisPlan.artifactType}</Descriptions.Item>
            <Descriptions.Item label="目标用户">{analysisPlan.targetAudience}</Descriptions.Item>
            <Descriptions.Item label="业务背景">{analysisPlan.businessContext}</Descriptions.Item>
          </Descriptions>
        </Card>
      ) : null}

      <Card title="分析流程看板" className="page-card">
        <Row gutter={[16, 16]}>
          {flowCards.map((item) => (
            <Col xs={24} md={12} xl={8} key={item.key}>
              <Card
                size="small"
                title={item.title}
                extra={<Tag color={statusColorMap[item.status] || 'default'}>{item.status === 'completed' ? '已完成' : item.status === 'running' ? '进行中' : '待执行'}</Tag>}
              >
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Paragraph style={{ marginBottom: 0 }}>
                    {item.summary}
                  </Paragraph>
                  {item.detail ? <Paragraph type="secondary" style={{ marginBottom: 0 }}>{item.detail}</Paragraph> : null}
                  {item.href ? (
                    <Button type="link" style={{ paddingInline: 0 }}>
                      <Link to={item.href}>进入板块</Link>
                    </Button>
                  ) : null}
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {moduleResults ? (
        <Card title="模块任务定义" className="page-card">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12} xl={6}>
              <Card size="small" title="体验模型">
                <Paragraph style={{ marginBottom: 8 }}>
                  {analysisPlan?.experienceModelPlan.task || '未定义'}
                </Paragraph>
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {moduleResults.experienceModel?.selectedModelNames?.join('、') || '尚未产出模型选择结果'}
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Card size="small" title="外部检索">
                <Paragraph style={{ marginBottom: 8 }}>
                  {analysisPlan?.externalSearchPlan.task || '未定义'}
                </Paragraph>
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {moduleResults.externalSearch?.queries?.slice(0, 2).join('；') || '尚未产出查询'}
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Card size="small" title="视觉评审">
                <Paragraph style={{ marginBottom: 8 }}>
                  {analysisPlan?.visualReviewPlan.task || '未定义'}
                </Paragraph>
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {moduleResults.visualReview?.reviewDimensions?.slice(0, 2).join('；') || '尚未产出评审维度'}
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Card size="small" title="模拟用户">
                <Paragraph style={{ marginBottom: 8 }}>
                  {analysisPlan?.personaSimulationPlan.task || '未定义'}
                </Paragraph>
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {moduleResults.personaSimulation?.personaTypes?.slice(0, 2).join('；') || '尚未产出人群结果'}
                </Paragraph>
              </Card>
            </Col>
          </Row>
        </Card>
      ) : null}

      <Card title="快速入口" className="page-card">
        <Space wrap>
          <Button><Link to={TASK_DETAIL_EXPERIENCE_PATH(currentTaskId)}>体验模型</Link></Button>
          <Button><Link to={TASK_DETAIL_EVIDENCE_PATH(currentTaskId)}>外部检索 / 证据</Link></Button>
          <Button><Link to={TASK_DETAIL_VISION_PATH(currentTaskId)}>视觉评审</Link></Button>
          <Button><Link to={TASK_DETAIL_PERSONA_PATH(currentTaskId)}>模拟用户</Link></Button>
          <Button><Link to={TASK_DETAIL_RESULT_PATH(currentTaskId)}>综合结论</Link></Button>
          <Button type="primary"><Link to={TASK_DETAIL_REPORT_PATH(currentTaskId)}>正式报告</Link></Button>
        </Space>
      </Card>

      <Card title="候选输出路线" className="page-card">
        {taskState?.candidateOutputs?.length ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {taskState.candidateOutputs.map((output) => (
              <OutputPreviewCard
                key={output.id}
                output={output}
                extra={(
                  <Space>
                    <Button
                      type="link"
                      onClick={() => {
                        setSelectedOutput(output);
                        navigate(TASK_DETAIL_RESULT_PATH(currentTaskId));
                      }}
                    >
                      查看综合结论
                    </Button>
                    <Button
                      type="link"
                      onClick={() => {
                        setSelectedOutput(output);
                        navigate(TASK_DETAIL_REPORT_PATH(currentTaskId));
                      }}
                    >
                      用此输出查看正式报告
                    </Button>
                  </Space>
                )}
              />
            ))}
          </Space>
        ) : (
          <Empty description="任务尚未生成候选输出" />
        )}
      </Card>
    </Space>
  );
};
