import { Button, Card, Empty, Space, Tabs, Typography } from 'antd';
import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CurrentTaskSummaryBar } from '../components/CurrentTaskSummaryBar';
import { useTaskStore } from '../store/taskStore';
import {
  buildTaskDetailPath,
  getTaskDetailTabKey,
  TASK_DETAIL_SECTION_EVIDENCE,
  TASK_DETAIL_SECTION_OPS,
  TASK_DETAIL_SECTION_OVERVIEW,
  TASK_DETAIL_SECTION_PERSONA,
  TASK_DETAIL_SECTION_REPORT,
  TASK_DETAIL_SECTION_RESULT,
  TASK_DETAIL_SECTION_VISION,
  type TaskDetailSection,
  TASK_HISTORY_PATH,
  TASK_NEW_PATH,
} from '../lib/navigation';

const { Title, Paragraph, Text } = Typography;

export const TaskDetailLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { taskId: routeTaskId } = useParams<{ taskId?: string }>();
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const taskSummary = useTaskStore((state) => state.taskSummary);
  const setCurrentTaskId = useTaskStore((state) => state.setCurrentTaskId);
  const activeKey = getTaskDetailTabKey(location.pathname);
  const resolvedTaskId = routeTaskId || currentTaskId;

  useEffect(() => {
    if (!routeTaskId) return;
    if (routeTaskId === currentTaskId) return;
    setCurrentTaskId(routeTaskId);
  }, [currentTaskId, routeTaskId, setCurrentTaskId]);

  const tabItems = [
    { key: TASK_DETAIL_SECTION_OVERVIEW, label: '总览' },
    { key: TASK_DETAIL_SECTION_EVIDENCE, label: '证据看板' },
    { key: TASK_DETAIL_SECTION_VISION, label: 'Vision Lab' },
    { key: TASK_DETAIL_SECTION_PERSONA, label: 'Persona Lab' },
    { key: TASK_DETAIL_SECTION_RESULT, label: '结果总览' },
    { key: TASK_DETAIL_SECTION_REPORT, label: '综合报告' },
    { key: TASK_DETAIL_SECTION_OPS, label: '审核与观测' },
  ].map((item) => ({
    ...item,
    disabled: !resolvedTaskId,
  }));

  if (routeTaskId && currentTaskId !== routeTaskId) {
    return <Card loading className="page-card" />;
  }

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Title level={2}>任务详情</Title>
            <Paragraph>
              你正在查看某个历史任务的详情页，可在这里切换总览、证据、Vision、Persona、结果、报告与审核视图。
            </Paragraph>
          </div>
          <Button>
            <Link to={TASK_HISTORY_PATH}>返回历史任务</Link>
          </Button>
        </Space>
      </div>

      {resolvedTaskId ? <CurrentTaskSummaryBar taskId={resolvedTaskId} taskSummary={taskSummary} /> : null}

      <Tabs
        activeKey={activeKey}
        items={tabItems}
        onChange={(key) => {
          if (!resolvedTaskId) return;
          navigate(buildTaskDetailPath(resolvedTaskId, key as TaskDetailSection));
        }}
      />

      {routeTaskId ? (
        <Outlet />
      ) : (
        <Card className="page-card">
          <Empty
            description="当前还没有选中的任务，请先去历史任务恢复，或新建一个任务。"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Space wrap>
              <Button>
                <Link to={TASK_HISTORY_PATH}>查看历史任务</Link>
              </Button>
              <Button type="primary">
                <Link to={TASK_NEW_PATH}>新建任务</Link>
              </Button>
            </Space>
          </Empty>
          <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
            <Text>任务详情已经改为显式 URL；请先从历史任务进入，或新建一个任务，再使用这些二级视图。</Text>
          </Paragraph>
        </Card>
      )}
    </Space>
  );
};
