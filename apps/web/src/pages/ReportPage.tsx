import { Alert, Button, Card, Empty, Radio, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReportResponse } from '@users-research/shared';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';

const { Title, Paragraph, Text } = Typography;

type SectionDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

interface SectionDiffItem {
  key: string;
  title: string;
  type: string;
  status: SectionDiffStatus;
  before?: string;
  after?: string;
}

const reportStatusColorMap: Record<string, string> = {
  approved: 'green',
  pending_review: 'gold',
  rejected: 'red',
  draft: 'default',
};

const reportStatusLabelMap: Record<string, string> = {
  approved: '已通过',
  pending_review: '待审核',
  rejected: '已退回',
  draft: '草稿',
};

const diffStatusColorMap: Record<SectionDiffStatus, string> = {
  added: 'green',
  removed: 'red',
  changed: 'gold',
  unchanged: 'default',
};

const diffStatusLabelMap: Record<SectionDiffStatus, string> = {
  added: '新增',
  removed: '删除',
  changed: '修改',
  unchanged: '未变更',
};

const getSectionKey = (section: ReportResponse['sections'][number]) =>
  `${section.type}::${section.title}`;

const reportGenerationLocks = new Set<string>();

const buildSectionDiff = (
  baseReport?: ReportResponse,
  targetReport?: ReportResponse,
): SectionDiffItem[] => {
  if (!baseReport || !targetReport) return [];

  const baseMap = new Map(baseReport.sections.map((section) => [getSectionKey(section), section]));
  const targetMap = new Map(targetReport.sections.map((section) => [getSectionKey(section), section]));
  const keys = Array.from(new Set([...baseMap.keys(), ...targetMap.keys()]));

  return keys
    .map((key) => {
      const before = baseMap.get(key);
      const after = targetMap.get(key);

      if (!before && after) {
        return {
          key,
          title: after.title,
          type: after.type,
          status: 'added' as const,
          after: after.content,
        };
      }

      if (before && !after) {
        return {
          key,
          title: before.title,
          type: before.type,
          status: 'removed' as const,
          before: before.content,
        };
      }

      const status: SectionDiffStatus =
        before?.content === after?.content ? 'unchanged' : 'changed';

      return {
        key,
        title: after?.title || before?.title || key,
        type: after?.type || before?.type || 'unknown',
        status,
        before: before?.content,
        after: after?.content,
      };
    })
    .sort((left, right) => {
      const order: Record<SectionDiffStatus, number> = {
        changed: 0,
        added: 1,
        removed: 2,
        unchanged: 3,
      };
      return order[left.status] - order[right.status];
    });
};

export const ReportPage = () => {
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const taskState = useTaskStore((state) => state.taskState);
  const selectedOutput = useTaskStore((state) => state.selectedOutput);
  const currentReport = useTaskStore((state) => state.currentReport);
  const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
  const setTaskState = useTaskStore((state) => state.setTaskState);
  const setSelectedOutput = useTaskStore((state) => state.setSelectedOutput);
  const setCurrentReport = useTaskStore((state) => state.setCurrentReport);

  const [submitting, setSubmitting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyReports, setHistoryReports] = useState<ReportResponse[]>([]);
  const [activeReportId, setActiveReportId] = useState<string>();
  const [historyMode, setHistoryMode] = useState(false);
  const [compareBaseId, setCompareBaseId] = useState<string>();
  const [compareTargetId, setCompareTargetId] = useState<string>();

  const candidateOutputs = useMemo(() => taskState?.candidateOutputs || [], [taskState?.candidateOutputs]);

  const refreshTaskContext = useCallback(async () => {
    if (!currentTaskId) return undefined;
    const [summary, state] = await Promise.all([
      api.getTask(currentTaskId),
      api.getTaskState(currentTaskId),
    ]);
    setTaskSummary(summary);
    setTaskState(state);
    return state;
  }, [currentTaskId, setTaskState, setTaskSummary]);

  useEffect(() => {
    if (!currentTaskId || taskState) return;
    void refreshTaskContext().then((state) => {
      if (!selectedOutput && state?.candidateOutputs[0]) {
        setSelectedOutput(state.candidateOutputs[0]);
      }
    });
  }, [currentTaskId, refreshTaskContext, selectedOutput, setSelectedOutput, taskState]);

  useEffect(() => {
    if (!selectedOutput && candidateOutputs[0]) {
      setSelectedOutput(candidateOutputs[0]);
    }
  }, [candidateOutputs, selectedOutput, setSelectedOutput]);

  const reportHistoryRefs = useMemo(
    () =>
      (taskState?.finalReports || [])
        .filter((item) => item.reportType === selectedOutput?.outputType)
        .sort((left, right) => right.version - left.version),
    [selectedOutput?.outputType, taskState?.finalReports],
  );

  const latestReportId = reportHistoryRefs[0]?.id;
  const isViewingHistoryVersion = Boolean(
    currentReport &&
      latestReportId &&
      currentReport.reportType === selectedOutput?.outputType &&
      currentReport.id !== latestReportId,
  );

  useEffect(() => {
    setHistoryMode(false);
    setActiveReportId(undefined);
    setCompareBaseId(undefined);
    setCompareTargetId(undefined);
    setCurrentReport(undefined);
  }, [selectedOutput?.outputType, setCurrentReport]);

  useEffect(() => {
    const reportIdsKey = reportHistoryRefs.map((item) => item.id).join('|');
    if (!currentTaskId || !selectedOutput || !reportIdsKey) {
      setHistoryReports([]);
      return;
    }

    let disposed = false;
    setHistoryLoading(true);

    Promise.all(reportHistoryRefs.map((item) => api.getReport(item.id)))
      .then((reports) => {
        if (disposed) return;

        const sortedReports = reports.sort((left, right) => right.version - left.version);
        setHistoryReports(sortedReports);
        setCompareTargetId((prev) =>
          prev && sortedReports.some((item) => item.id === prev)
            ? prev
            : sortedReports[0]?.id,
        );
        setCompareBaseId((prev) =>
          prev && sortedReports.some((item) => item.id === prev)
            ? prev
            : sortedReports[1]?.id || sortedReports[0]?.id,
        );
      })
      .finally(() => {
        if (!disposed) setHistoryLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [currentTaskId, reportHistoryRefs, selectedOutput]);

  useEffect(() => {
    if (!currentTaskId || !selectedOutput) return;

    if (!latestReportId) {
      const generationKey = `${currentTaskId}:${selectedOutput.id}`;
      if (reportGenerationLocks.has(generationKey)) {
        return;
      }

      reportGenerationLocks.add(generationKey);
      let disposed = false;
      api.generateReport(currentTaskId, selectedOutput.id)
        .then(async (report) => {
          if (disposed) return;
          setActiveReportId(report.id);
          setHistoryMode(false);
          setCurrentReport(report);
          await refreshTaskContext();
        })
        .catch((error) => {
          if (!disposed) {
            message.error(error instanceof Error ? error.message : '自动生成报告失败');
          }
        })
        .finally(() => {
          reportGenerationLocks.delete(generationKey);
        });

      return () => {
        disposed = true;
      };
    }

    const targetReportId = historyMode && activeReportId ? activeReportId : latestReportId;
    if (currentReport?.id === targetReportId) return;

    let disposed = false;
    api.getReport(targetReportId).then((report) => {
      if (!disposed) setCurrentReport(report);
    });

    return () => {
      disposed = true;
    };
  }, [
    activeReportId,
    currentReport?.id,
    currentTaskId,
    historyMode,
    latestReportId,
    refreshTaskContext,
    selectedOutput,
    setCurrentReport,
  ]);

  const compareBaseReport = useMemo(
    () => historyReports.find((item) => item.id === compareBaseId),
    [compareBaseId, historyReports],
  );
  const compareTargetReport = useMemo(
    () => historyReports.find((item) => item.id === compareTargetId),
    [compareTargetId, historyReports],
  );
  const diffItems = useMemo(
    () => buildSectionDiff(compareBaseReport, compareTargetReport),
    [compareBaseReport, compareTargetReport],
  );
  const diffSummary = useMemo(
    () =>
      diffItems.reduce<Record<SectionDiffStatus, number>>(
        (acc, item) => {
          acc[item.status] += 1;
          return acc;
        },
        { added: 0, removed: 0, changed: 0, unchanged: 0 },
      ),
    [diffItems],
  );

  const selectReportVersion = useCallback(
    async (reportId: string) => {
      const nextReport = await api.getReport(reportId);
      setActiveReportId(reportId);
      setHistoryMode(reportId !== latestReportId);
      setCurrentReport(nextReport);
    },
    [latestReportId, setCurrentReport],
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
      await refreshTaskContext();
      message.success(action === 'approve' ? '报告已通过审核' : '报告已退回重做');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '审核失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentTaskId) return <Empty description="请先创建任务" />;
  if (!candidateOutputs.length) return <Empty description="当前任务还没有可生成报告的候选输出" />;
  if (!currentReport || !selectedOutput) return <Card loading className="page-card" />;

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Title level={2}>综合报告</Title>

      {selectedOutput.gateLevel === 'blocked_by_rq' ? (
        <Alert
          type="warning"
          showIcon
          message="当前输出被 RQ 门禁限制"
          description={
            currentReport.gateResult.blockedReasons?.length
              ? currentReport.gateResult.blockedReasons.join('；')
              : '你仍可预览内容，但正式发布前需要补足证据等级与审核。'
          }
        />
      ) : null}

      {isViewingHistoryVersion ? (
        <Alert
          type="info"
          showIcon
          message={`当前正在回看历史版本 v${currentReport.version}`}
          description={
            <Space direction="vertical" size={8}>
              <Text>历史版本仅用于回看与对比，不会覆盖当前最新版本。</Text>
              <Button
                type="link"
                style={{ paddingInline: 0 }}
                onClick={() => {
                  if (latestReportId) void selectReportVersion(latestReportId);
                }}
              >
                返回最新版本
              </Button>
            </Space>
          }
        />
      ) : null}

      {currentReport.reviewMeta ? (
        <Alert
          type={currentReport.reviewMeta.action === 'approve' ? 'success' : 'info'}
          showIcon
          message={currentReport.reviewMeta.action === 'approve' ? '该报告已通过审核' : '该报告已被退回重做'}
          description={`审核时间：${currentReport.reviewMeta.reviewedAt}${currentReport.reviewMeta.reviewer ? `；审核人：${currentReport.reviewMeta.reviewer}` : ''}`}
        />
      ) : null}

      <Card className="page-card">
        <Paragraph>当前查看版本：v{currentReport.version}</Paragraph>
        <Paragraph>报告类型：{currentReport.reportType}</Paragraph>
        <Paragraph>审核状态：{reportStatusLabelMap[currentReport.status] || currentReport.status}</Paragraph>
        <Paragraph>来源节点：{selectedOutput.sourceNode}</Paragraph>
        <Paragraph>门禁级别：{selectedOutput.gateLevel || '未标注'}</Paragraph>
        <Radio.Group
          value={selectedOutput.id}
          onChange={(event) => {
            const next = candidateOutputs.find((item) => item.id === event.target.value);
            if (next) setSelectedOutput(next);
          }}
        >
          <Space wrap>
            {candidateOutputs.map((output) => (
              <Radio.Button key={output.id} value={output.id}>
                {output.outputType}
              </Radio.Button>
            ))}
          </Space>
        </Radio.Group>
      </Card>

      <OutputPreviewCard output={selectedOutput} />

      <Card className="page-card">
        <Tabs
          items={[
            {
              key: 'content',
              label: '当前内容',
              children: currentReport.sections.map((section) => (
                <Card key={`${section.type}-${section.title}`} type="inner" title={section.title} style={{ marginBottom: 12 }}>
                  {section.content}
                </Card>
              )),
            },
            {
              key: 'history',
              label: '版本历史',
              children: (
                <Table
                  rowKey="id"
                  loading={historyLoading}
                  pagination={false}
                  dataSource={historyReports}
                  columns={[
                    {
                      title: '版本',
                      render: (_, record) => <Text strong>v{record.version}</Text>,
                    },
                    {
                      title: '状态',
                      render: (_, record) => (
                        <Tag color={reportStatusColorMap[record.status] || 'default'}>
                          {reportStatusLabelMap[record.status] || record.status}
                        </Tag>
                      ),
                    },
                    {
                      title: 'RQ / Gate',
                      render: (_, record) => (
                        <Text>
                          {record.gateResult.rqLevel || '未判定'}
                          {record.gateResult.blockedReasons?.length
                            ? ` / ${record.gateResult.blockedReasons.join('；')}`
                            : ' / 已放行'}
                        </Text>
                      ),
                    },
                    {
                      title: '审核信息',
                      render: (_, record) =>
                        record.reviewMeta ? (
                          <Text type="secondary">
                            {record.reviewMeta.action === 'approve' ? '已通过' : '已退回'}
                            {record.reviewMeta.reviewer ? ` · ${record.reviewMeta.reviewer}` : ''}
                          </Text>
                        ) : (
                          <Text type="secondary">未审核</Text>
                        ),
                    },
                    {
                      title: '操作',
                      render: (_, record) => (
                        <Space size={4}>
                          <Button
                            type={currentReport.id === record.id ? 'primary' : 'default'}
                            ghost={currentReport.id === record.id}
                            onClick={() => void selectReportVersion(record.id)}
                          >
                            {currentReport.id === record.id ? '当前查看' : '查看此版本'}
                          </Button>
                          {latestReportId === record.id ? <Tag color="green">最新</Tag> : null}
                        </Space>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'diff',
              label: '版本对比',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Space wrap>
                    <span>基线版本：</span>
                    <Select
                      style={{ width: 180 }}
                      value={compareBaseId}
                      options={historyReports.map((report) => ({
                        label: `v${report.version} · ${reportStatusLabelMap[report.status] || report.status}`,
                        value: report.id,
                      }))}
                      onChange={setCompareBaseId}
                    />
                    <span>对比版本：</span>
                    <Select
                      style={{ width: 180 }}
                      value={compareTargetId}
                      options={historyReports.map((report) => ({
                        label: `v${report.version} · ${reportStatusLabelMap[report.status] || report.status}`,
                        value: report.id,
                      }))}
                      onChange={setCompareTargetId}
                    />
                  </Space>

                  <Space wrap>
                    <Tag color="gold">修改 {diffSummary.changed}</Tag>
                    <Tag color="green">新增 {diffSummary.added}</Tag>
                    <Tag color="red">删除 {diffSummary.removed}</Tag>
                    <Tag>未变化 {diffSummary.unchanged}</Tag>
                  </Space>

                  {compareBaseReport && compareTargetReport ? (
                    <Alert
                      type="info"
                      showIcon
                      message={`正在对比 v${compareBaseReport.version} → v${compareTargetReport.version}`}
                      description="对比结果按章节聚合展示，可快速判断本轮报告新增、删除和改写内容。"
                    />
                  ) : null}

                  {diffItems.length ? (
                    diffItems.map((item) => (
                      <Card
                        key={item.key}
                        type="inner"
                        title={
                          <Space>
                            <span>{item.title}</span>
                            <Tag>{item.type}</Tag>
                            <Tag color={diffStatusColorMap[item.status]}>
                              {diffStatusLabelMap[item.status]}
                            </Tag>
                          </Space>
                        }
                      >
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                          <Card size="small" title={`基线内容${compareBaseReport ? ` · v${compareBaseReport.version}` : ''}`}>
                            <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                              {item.before || '该版本无此章节'}
                            </Paragraph>
                          </Card>
                          <Card size="small" title={`对比内容${compareTargetReport ? ` · v${compareTargetReport.version}` : ''}`}>
                            <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                              {item.after || '该版本无此章节'}
                            </Paragraph>
                          </Card>
                        </Space>
                      </Card>
                    ))
                  ) : (
                    <Empty description="当前没有可展示的版本差异" />
                  )}
                </Space>
              ),
            },
            {
              key: 'gaps',
              label: 'Gate 与缺口',
              children: `RQ：${currentReport.gateResult.rqLevel}；屏蔽来源：${currentReport.gateResult.blockedSources.join(', ') || '无'}；门禁原因：${currentReport.gateResult.blockedReasons?.join('；') || '无'}`,
            },
          ]}
        />
      </Card>

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
  );
};
