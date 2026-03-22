import { Alert, Card, Col, Row, Space, Statistic, Tag, Typography } from 'antd';
import type { TaskSummaryResponse } from '@users-research/shared';

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

      {taskSummary.stats.warnings.length ? (
        <Alert
          type="warning"
          showIcon
          message="该任务存在提醒"
          description={taskSummary.stats.warnings.join('；')}
        />
      ) : null}
    </Space>
  );
};
