import { Alert, Button, Card, Empty, Space, Tag, Typography, message } from 'antd';
import type { TaskSummaryResponse } from '@users-research/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  TASK_DETAIL_OVERVIEW_PATH,
  TASK_DETAIL_REPORT_PATH,
  TASK_DETAIL_RESULT_PATH,
} from '../lib/navigation';
import { useTaskStore } from '../store/taskStore';

const { Paragraph, Text } = Typography;

export const TaskHistoryPage = () => {
  const navigate = useNavigate();
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const setCurrentTaskId = useTaskStore((state) => state.setCurrentTaskId);
  const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
  const [recentTasks, setRecentTasks] = useState<TaskSummaryResponse[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string>();

  const shouldPollRecentTasks = useMemo(
    () => recentTasks.some((task) => ['draft', 'queued', 'running'].includes(task.status)),
    [recentTasks],
  );

  const loadRecentTasks = useCallback(async (silent = false) => {
    if (!silent) {
      setRecentLoading(true);
    }
    try {
      const response = await api.listTasks(12);
      setRecentTasks(response.items);
      setRecentError(undefined);
    } catch (error) {
      const nextError = error instanceof Error ? error.message : '加载历史任务失败';
      setRecentError(nextError);
      if (!silent) message.error(nextError);
    } finally {
      if (!silent) {
        setRecentLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadRecentTasks(true);
  }, [loadRecentTasks]);

  useEffect(() => {
    if (!shouldPollRecentTasks) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void loadRecentTasks(true);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadRecentTasks, shouldPollRecentTasks]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadRecentTasks(true);
      }
    };

    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadRecentTasks]);

  const openTask = useCallback(
    (taskId: string, route: string, summary?: TaskSummaryResponse) => {
      setCurrentTaskId(taskId);
      if (summary) setTaskSummary(summary);
      navigate(route);
    },
    [navigate, setCurrentTaskId, setTaskSummary],
  );

  return (
    <Card
      className="page-card"
      title="历史任务"
      extra={(
        <Space>
          {currentTaskId ? (
            <Button type="link" onClick={() => openTask(currentTaskId, TASK_DETAIL_OVERVIEW_PATH(currentTaskId))}>
              继续上次查看
            </Button>
          ) : null}
          <Button onClick={() => void loadRecentTasks()}>刷新</Button>
        </Space>
      )}
      loading={recentLoading}
    >
      {recentError ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="历史任务加载失败"
          description={recentError}
        />
      ) : null}

      {recentTasks.length ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {recentTasks.map((task) => (
            <Card key={task.taskId} type="inner" size="small">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space wrap>
                  <Text strong>{task.title || '未命名任务'}</Text>
                  <Tag color="blue">{task.status}</Tag>
                  <Tag>{task.reviewStatus}</Tag>
                  {task.rqLevel ? <Tag color="purple">{task.rqLevel}</Tag> : null}
                </Space>
                <Text type="secondary">{task.taskId}</Text>
                <Paragraph style={{ marginBottom: 0 }}>{task.query}</Paragraph>
                <Space wrap>
                  {task.currentNode ? <Text type="secondary">当前节点：{task.currentNode}</Text> : null}
                  <Text type="secondary">模式：{task.taskMode}</Text>
                  <Text type="secondary">输入：{task.inputType}</Text>
                </Space>
                <Space wrap>
                  <Button size="small" onClick={() => openTask(task.taskId, TASK_DETAIL_OVERVIEW_PATH(task.taskId), task)}>
                    进入详情
                  </Button>
                  <Button size="small" onClick={() => openTask(task.taskId, TASK_DETAIL_RESULT_PATH(task.taskId), task)}>
                    查看结果
                  </Button>
                  <Button size="small" type="primary" onClick={() => openTask(task.taskId, TASK_DETAIL_REPORT_PATH(task.taskId), task)}>
                    查看报告
                  </Button>
                </Space>
              </Space>
            </Card>
          ))}
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前还没有可恢复的任务。若你刚新建过任务，请点击刷新；SQLite 模式下任务会在 server 重启后继续保留。"
        />
      )}
    </Card>
  );
};
