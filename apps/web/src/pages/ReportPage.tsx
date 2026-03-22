import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Radio, Space, Tag, Typography, message } from 'antd';
import type { ReportResponse } from '@users-research/shared';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { ProvenanceSummaryCard } from '../components/ProvenanceSummaryCard';
import { RouteLoading } from '../components/RouteLoading';
import { api } from '../lib/api';
import { buildProvenanceSummary } from '../lib/provenance';
import { useTaskStore } from '../store/taskStore';
const ReportTabsPanel = lazy(() =>
  import('../components/report/ReportTabsPanel').then((module) => ({ default: module.ReportTabsPanel })),
);

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
  const taskSummary = useTaskStore((state) => state.taskSummary);
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
  const provenanceSummary = useMemo(
    () =>
      buildProvenanceSummary({
        taskState,
        taskSummary,
        selectedOutput,
        report: currentReport,
      }),
    [currentReport, selectedOutput, taskState, taskSummary],
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
  if (!candidateOutputs.length) return <Empty description="该任务还没有可生成报告的候选输出" />;
  if (!currentReport || !selectedOutput) return <Card loading className="page-card" />;

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 8 }}>综合报告</Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          管理当前输出的正式报告、版本历史、差异对比与审核状态。
        </Paragraph>
      </div>

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

      <ProvenanceSummaryCard summary={provenanceSummary} />

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

      <OutputPreviewCard
        output={selectedOutput}
        provenanceTags={provenanceSummary.tags}
        fallbackWarnings={provenanceSummary.fallbackWarnings}
      />

      <Suspense fallback={<RouteLoading />}>
        <ReportTabsPanel
          currentReport={currentReport}
          historyLoading={historyLoading}
          historyReports={historyReports}
          reportStatusColorMap={reportStatusColorMap}
          reportStatusLabelMap={reportStatusLabelMap}
          currentReportId={currentReport.id}
          latestReportId={latestReportId}
          selectReportVersion={selectReportVersion}
          compareBaseId={compareBaseId}
          compareTargetId={compareTargetId}
          setCompareBaseId={setCompareBaseId}
          setCompareTargetId={setCompareTargetId}
          diffSummary={diffSummary}
          diffItems={diffItems}
          compareBaseReport={compareBaseReport}
          compareTargetReport={compareTargetReport}
          diffStatusColorMap={diffStatusColorMap}
          diffStatusLabelMap={diffStatusLabelMap}
        />
      </Suspense>

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
