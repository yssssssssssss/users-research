import { Button, Card, Col, Descriptions, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ResearchTaskState, TaskSummaryResponse } from '@users-research/shared';
import { ExperienceModelPanel } from '../components/ExperienceModelPanel';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { api } from '../lib/api';
import {
  TASK_DETAIL_EVIDENCE_PATH,
  TASK_DETAIL_PERSONA_PATH,
  TASK_DETAIL_REPORT_PATH,
  TASK_DETAIL_RESULT_PATH,
  TASK_DETAIL_VISION_PATH,
} from '../lib/navigation';
import { useTaskStore } from '../store/taskStore';

const { Title, Paragraph } = Typography;
const MAX_EVENT_COUNT = 20;

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

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 8 }}>任务总览</Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          查看该任务进度、实时事件、启用模块和候选输出，作为进入各分析视图的总入口。
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
          <Card title="实时事件" className="page-card">
            <List
              size="small"
              dataSource={events.slice(-8).reverse()}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Card>
        </Col>
      </Row>

      <Card title="快速入口" className="page-card">
        <Space wrap>
          <Button><Link to={TASK_DETAIL_EVIDENCE_PATH(currentTaskId)}>查看证据看板</Link></Button>
          <Button><Link to={TASK_DETAIL_VISION_PATH(currentTaskId)}>查看 Vision Lab</Link></Button>
          <Button><Link to={TASK_DETAIL_PERSONA_PATH(currentTaskId)}>查看 Persona Lab</Link></Button>
          <Button><Link to={TASK_DETAIL_RESULT_PATH(currentTaskId)}>查看结果总览</Link></Button>
          <Button type="primary"><Link to={TASK_DETAIL_REPORT_PATH(currentTaskId)}>生成/查看报告</Link></Button>
        </Space>
      </Card>

      <Card title="启用模块" className="page-card">
        <Space wrap>
          {Object.entries(taskSummary.enabledModules).map(([key, value]) => (
            <Tag color={value ? 'blue' : 'default'} key={key}>{key}</Tag>
          ))}
        </Space>
      </Card>

      <ExperienceModelPanel
        taskId={currentTaskId}
        evidencePool={taskState?.evidencePool}
        currentNode={taskSummary.currentNode || taskState?.currentNode}
        onTaskUpdated={(summary, state) => {
          setTaskSummary(summary);
          setTaskState(state);
        }}
      />

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
                      查看结果总览
                    </Button>
                    <Button
                      type="link"
                      onClick={() => {
                        setSelectedOutput(output);
                        navigate(TASK_DETAIL_REPORT_PATH(currentTaskId));
                      }}
                    >
                      用此输出生成报告
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
