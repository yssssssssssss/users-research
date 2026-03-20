import { Alert, Button, Card, Col, Empty, Row, Space, Statistic, Table, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';

const { Title, Paragraph } = Typography;

export const ReviewOpsPage = () => {
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const taskSummary = useTaskStore((state) => state.taskSummary);
  const taskState = useTaskStore((state) => state.taskState);
  const currentReport = useTaskStore((state) => state.currentReport);
  const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
  const setTaskState = useTaskStore((state) => state.setTaskState);
  const setCurrentReport = useTaskStore((state) => state.setCurrentReport);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!currentTaskId) return;
    Promise.all([api.getTask(currentTaskId), api.getTaskState(currentTaskId)]).then(([summary, state]) => {
      setTaskSummary(summary);
      setTaskState(state);
      const latestReportId = currentReport?.id || state.finalReports[0]?.id;
      if (latestReportId) {
        api.getReport(latestReportId).then(setCurrentReport);
      }
    });
  }, [currentTaskId, currentReport?.id, setCurrentReport, setTaskState, setTaskSummary]);

  const pendingCount = useMemo(
    () => taskState?.finalReports.filter((item) => item.status === 'pending_review').length || 0,
    [taskState?.finalReports],
  );

  const handleReview = async (action: 'approve' | 'request_rework') => {
    if (!currentTaskId || !currentReport) return;
    setSubmitting(true);
    try {
      const reviewed = await api.reviewReport(currentReport.id, {
        action,
        reviewer: 'review_ops_console',
      });
      setCurrentReport(reviewed.report);
      const [summary, state] = await Promise.all([
        api.getTask(currentTaskId),
        api.getTaskState(currentTaskId),
      ]);
      setTaskSummary(summary);
      setTaskState(state);
      message.success(action === 'approve' ? '审核通过成功' : '已退回重做');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '审核失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentTaskId) return <Empty description="请先创建任务" />;

  return (
    <div>
      <Title level={2}>审核与观测</Title>
      <Paragraph>本页用于承载待审报告、审核状态、模型成本与降级治理信息。</Paragraph>
      <Row gutter={16}>
        <Col span={6}><Card><Statistic title="待审报告" value={pendingCount} /></Card></Col>
        <Col span={6}><Card><Statistic title="平均耗时" value={taskSummary?.stats.elapsedSeconds || 0} suffix="s" /></Card></Col>
        <Col span={6}><Card><Statistic title="平均成本" value={taskSummary?.stats.costEstimate || 0} suffix="元" /></Card></Col>
        <Col span={6}><Card><Statistic title="审核状态" value={taskSummary?.reviewStatus || '未开始'} /></Card></Col>
      </Row>

      {taskSummary?.stats.warnings?.length ? (
        <Alert
          style={{ marginTop: 24 }}
          type="warning"
          message="任务存在提醒"
          description={taskSummary.stats.warnings.join('；')}
        />
      ) : null}

      <Card className="page-card" style={{ marginTop: 24 }} title="报告队列">
        <Table
          rowKey="id"
          pagination={false}
          dataSource={taskState?.finalReports || []}
          columns={[
            { title: '报告 ID', dataIndex: 'id' },
            { title: '版本', dataIndex: 'version' },
            { title: '类型', dataIndex: 'reportType' },
            { title: '状态', dataIndex: 'status' },
            {
              title: '操作',
              render: (_, record) => (
                <Button type="link" onClick={() => api.getReport(record.id).then(setCurrentReport)}>
                  查看
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Card className="page-card" style={{ marginTop: 24 }} title="当前审核对象">
        {currentReport ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Paragraph>报告版本：v{currentReport.version}</Paragraph>
            <Paragraph>报告类型：{currentReport.reportType}</Paragraph>
            <Paragraph>报告状态：{currentReport.status}</Paragraph>
            <Paragraph>
              Gate：RQ {currentReport.gateResult.rqLevel || '未判定'} / 屏蔽来源 {currentReport.gateResult.blockedSources.join(', ') || '无'}
            </Paragraph>
            {currentReport.gateResult.blockedReasons?.length ? (
              <Alert
                type="warning"
                message="当前报告受服务端 Gate 限制"
                description={currentReport.gateResult.blockedReasons.join('；')}
              />
            ) : null}
            {currentReport.reviewMeta ? (
              <Alert
                type={currentReport.reviewMeta.action === 'approve' ? 'success' : 'info'}
                message={currentReport.reviewMeta.action === 'approve' ? '已审核通过' : '已退回重做'}
                description={`审核时间：${currentReport.reviewMeta.reviewedAt}${currentReport.reviewMeta.reviewer ? `；审核人：${currentReport.reviewMeta.reviewer}` : ''}`}
              />
            ) : null}
            <Space>
              <Button
                type="primary"
                loading={submitting}
                disabled={currentReport.status === 'approved' || Boolean(currentReport.gateResult.blockedReasons?.length)}
                onClick={() => handleReview('approve')}
              >
                通过
              </Button>
              <Button
                loading={submitting}
                disabled={currentReport.status === 'rejected'}
                onClick={() => handleReview('request_rework')}
              >
                退回重做
              </Button>
            </Space>
          </Space>
        ) : (
          <Empty description="当前暂无报告可审核" />
        )}
      </Card>
    </div>
  );
};
