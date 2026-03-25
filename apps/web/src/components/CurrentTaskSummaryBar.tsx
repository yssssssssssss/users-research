import { Card, Col, Collapse, Row, Space, Statistic, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import type { TaskSummaryResponse } from '@users-research/shared';
import { splitTaskWarnings } from '../lib/taskWarnings';

const { Text } = Typography;

interface CurrentTaskSummaryBarProps {
  taskId: string;
  taskSummary?: TaskSummaryResponse;
}

const taskStatusLabelMap: Record<string, string> = {
  draft: '草稿',
  queued: '排队中',
  running: '运行中',
  partial_failed: '部分失败',
  awaiting_review: '待审核',
  completed: '已完成',
  cancelled: '已取消',
  failed: '失败',
};

const reviewStatusLabelMap: Record<string, string> = {
  not_required: '无需审核',
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  rework_required: '需返工',
};

type WarningPanelItem = {
  key: string;
  className: string;
  label: ReactNode;
  children: ReactNode;
};

export const CurrentTaskSummaryBar = ({ taskId, taskSummary }: CurrentTaskSummaryBarProps) => {
  if (!taskSummary) {
    return (
      <Card className="page-card">
        <Space wrap>
          <Tag>{taskId}</Tag>
          <Text type="secondary">正在加载任务摘要…</Text>
        </Space>
      </Card>
    );
  }

  const warningGroups = splitTaskWarnings(taskSummary.stats.warnings);
  const warningPanels: WarningPanelItem[] = [];

  if (warningGroups.authenticityDowngrade.length) {
    warningPanels.push({
      key: 'authenticity-downgrade',
      className: 'task-warning-collapse task-warning-collapse-warning',
      label: (
        <Text strong style={{ color: '#ad6800' }}>
          真实性降级已触发
        </Text>
      ),
      children: (
        <Text className="content-wrap-safe">
          {warningGroups.authenticityDowngrade.join('；')}
        </Text>
      ),
    });
  }

  if (warningGroups.otherWarnings.length) {
    warningPanels.push({
      key: 'other-warnings',
      className: 'task-warning-collapse task-warning-collapse-info',
      label: (
        <Text strong style={{ color: '#0958d9' }}>
          该任务存在其他提醒
        </Text>
      ),
      children: (
        <Text className="content-wrap-safe">
          {warningGroups.otherWarnings.join('；')}
        </Text>
      ),
    });
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card className="page-card current-task-summary-card">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <Tag color="blue">{taskSummary.title || '未命名任务'}</Tag>
            <Tag>{taskId}</Tag>
            <Tag color="gold">{taskStatusLabelMap[taskSummary.status] || taskSummary.status}</Tag>
            {taskSummary.rqLevel ? <Tag color="purple">{taskSummary.rqLevel}</Tag> : null}
            <Tag>{reviewStatusLabelMap[taskSummary.reviewStatus] || taskSummary.reviewStatus}</Tag>
          </Space>

          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic title="当前节点" value={taskSummary.currentNode || '未开始'} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="输入类型" value={taskSummary.inputType} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="分析模式" value={taskSummary.taskMode} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="预计成本" value={taskSummary.stats.costEstimate || 0} suffix="元" />
            </Col>
          </Row>
        </Space>
      </Card>

      {warningPanels.map((panel) => (
        <Collapse key={panel.key} size="small" ghost items={[panel]} />
      ))}
    </Space>
  );
};
