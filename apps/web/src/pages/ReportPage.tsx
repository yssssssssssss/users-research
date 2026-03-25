import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Collapse, Descriptions, Empty, List, Radio, Row, Space, Statistic, Tag, Typography, message } from 'antd';
import type { ReportResponse } from '@users-research/shared';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { ProvenanceSummaryCard } from '../components/ProvenanceSummaryCard';
import { RouteLoading } from '../components/RouteLoading';
import { api } from '../lib/api';
import { buildProvenanceSummary } from '../lib/provenance';
import { splitTaskWarnings } from '../lib/taskWarnings';
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

interface ReportSectionBucket {
  decisionSections: ReportResponse['sections'];
  evidenceSections: ReportResponse['sections'];
  analysisSections: ReportResponse['sections'];
  boundarySections: ReportResponse['sections'];
  otherSections: ReportResponse['sections'];
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

const confidenceColorMap: Record<string, string> = {
  high: 'green',
  medium: 'gold',
  low: 'red',
};

const gateColorMap: Record<string, string> = {
  allowed: 'green',
  review_required: 'gold',
  blocked_by_rq: 'red',
};

const getSectionKey = (section: ReportResponse['sections'][number]) =>
  `${section.type}::${section.title}`;

const reportGenerationLocks = new Set<string>();

const takeFirstSentence = (value?: string, maxLength = 140) => {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const buildSectionBuckets = (sections: ReportResponse['sections']): ReportSectionBucket => {
  const buckets: ReportSectionBucket = {
    decisionSections: [],
    evidenceSections: [],
    analysisSections: [],
    boundarySections: [],
    otherSections: [],
  };

  for (const section of sections) {
    if (['summary', 'gate', 'action'].includes(section.type)) {
      buckets.decisionSections.push(section);
      continue;
    }
    if (['evidence', 'external_evidence', 'search_leads'].includes(section.type)) {
      buckets.evidenceSections.push(section);
      continue;
    }
    if (['framework', 'vision', 'persona'].includes(section.type)) {
      buckets.analysisSections.push(section);
      continue;
    }
    if (['boundary', 'review'].includes(section.type)) {
      buckets.boundarySections.push(section);
      continue;
    }
    buckets.otherSections.push(section);
  }

  return buckets;
};

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
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string>();
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
    currentReport
      && latestReportId
      && currentReport.reportType === selectedOutput?.outputType
      && currentReport.id !== latestReportId,
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
      setReportLoading(true);
      setReportError(undefined);
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
            const nextError = error instanceof Error ? error.message : '自动生成报告失败';
            setReportError(nextError);
            message.error(nextError);
          }
        })
        .finally(() => {
          if (!disposed) setReportLoading(false);
          reportGenerationLocks.delete(generationKey);
        });

      return () => {
        disposed = true;
      };
    }

    const targetReportId = historyMode && activeReportId ? activeReportId : latestReportId;
    if (currentReport?.id === targetReportId) return;

    let disposed = false;
    setReportLoading(true);
    setReportError(undefined);

    api.getReport(targetReportId)
      .then((report) => {
        if (!disposed) setCurrentReport(report);
      })
      .catch((error) => {
        if (!disposed) {
          const nextError = error instanceof Error ? error.message : '加载报告失败';
          setReportError(nextError);
          message.error(nextError);
        }
      })
      .finally(() => {
        if (!disposed) setReportLoading(false);
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
  const warningGroups = useMemo(
    () => splitTaskWarnings(taskSummary?.stats.warnings),
    [taskSummary?.stats.warnings],
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

  const handleRetryReport = useCallback(async () => {
    if (!currentTaskId || !selectedOutput) return;
    setReportError(undefined);
    setReportLoading(true);
    try {
      const report = await api.generateReport(currentTaskId, selectedOutput.id);
      setActiveReportId(report.id);
      setHistoryMode(false);
      setCurrentReport(report);
      await refreshTaskContext();
      message.success('报告已重新生成');
    } catch (error) {
      const nextError = error instanceof Error ? error.message : '重新生成报告失败';
      setReportError(nextError);
      message.error(nextError);
    } finally {
      setReportLoading(false);
    }
  }, [currentTaskId, refreshTaskContext, selectedOutput, setCurrentReport]);

  if (!currentTaskId) return <Empty description="请先创建任务" />;
  if (!candidateOutputs.length) return <Empty description="该任务还没有可生成报告的候选输出" />;
  if (!selectedOutput) return <Card loading className="page-card" />;
  if (!currentReport && !reportError) return <Card loading className="page-card" />;
  if (!currentReport) {
    return (
      <Card className="page-card">
        <Empty
          description={reportError || '当前还没有成功加载正式报告'}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Space>
            <Button type="primary" loading={reportLoading} onClick={() => void handleRetryReport()}>
              重新生成报告
            </Button>
          </Space>
        </Empty>
      </Card>
    );
  }

  const sectionBuckets = buildSectionBuckets(currentReport.sections);
  const primaryDecision =
    selectedOutput.summary
    || takeFirstSentence(sectionBuckets.decisionSections[0]?.content, 160)
    || takeFirstSentence(currentReport.sections[0]?.content, 160)
    || '当前已生成正式报告，但仍需结合下方依据与审核边界阅读。';
  const actionItems = sectionBuckets.decisionSections
    .filter((section) => section.type === 'action')
    .flatMap((section) => section.content.split(/\r?\n|；|;/).map((item) => item.trim()).filter(Boolean))
    .slice(0, 5);
  const summaryConfidence = selectedOutput.contentJson
    && typeof selectedOutput.contentJson === 'object'
    && !Array.isArray(selectedOutput.contentJson)
    && Array.isArray((selectedOutput.contentJson as Record<string, unknown>).judgments)
      ? ((selectedOutput.contentJson as Record<string, unknown>).judgments as Array<Record<string, unknown>>)
          .find((item) => typeof item?.confidence === 'string')?.confidence as string | undefined
      : undefined;

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 8 }}>正式报告</Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          这是正式产物页。首屏先看正式结论、正式依据、审核边界；完整正文和版本能力放在下面。
        </Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        message="正式报告 vs 综合结论"
        description="综合结论用于快速消费；正式报告用于正式留档、版本管理、Gate 与审核。"
      />

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
              <Text>历史版本只用于回看与对比，不会覆盖最新正式版本。</Text>
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

      <Card className="page-card" title="第一层：正式结论">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={14}>
              <Descriptions column={1} size="small" title="当前正式结论">
                <Descriptions.Item label="任务">{taskSummary?.title || '未命名任务'}</Descriptions.Item>
                <Descriptions.Item label="问题">{taskSummary?.query || '未记录'}</Descriptions.Item>
                <Descriptions.Item label="报告结论">{primaryDecision}</Descriptions.Item>
              </Descriptions>
            </Col>
            <Col xs={24} xl={10}>
              <Row gutter={[12, 12]}>
                <Col xs={12} md={6} xl={12}>
                  <Card size="small"><Statistic title="当前版本" value={`v${currentReport.version}`} /></Card>
                </Col>
                <Col xs={12} md={6} xl={12}>
                  <Card size="small"><Statistic title="报告状态" value={reportStatusLabelMap[currentReport.status] || currentReport.status} /></Card>
                </Col>
                <Col xs={12} md={6} xl={12}>
                  <Card size="small"><Statistic title="RQ" value={currentReport.gateResult.rqLevel || taskSummary?.rqLevel || '未判定'} /></Card>
                </Col>
                <Col xs={12} md={6} xl={12}>
                  <Card size="small"><Statistic title="章节数" value={currentReport.sections.length} /></Card>
                </Col>
              </Row>
            </Col>
          </Row>

          <Space wrap>
            <Tag color={reportStatusColorMap[currentReport.status] || 'default'}>
              正式状态：{reportStatusLabelMap[currentReport.status] || currentReport.status}
            </Tag>
            <Tag color={gateColorMap[selectedOutput.gateLevel || 'review_required'] || 'default'}>
              门禁：{selectedOutput.gateLevel || '未标注'}
            </Tag>
            <Tag>来源节点：{selectedOutput.sourceNode}</Tag>
            {summaryConfidence ? (
              <Tag color={confidenceColorMap[summaryConfidence] || 'default'}>
                可信度：{summaryConfidence}
              </Tag>
            ) : null}
            {warningGroups.authenticityDowngrade.length ? <Tag color="red">真实性已降级</Tag> : null}
          </Space>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={14}>
              <Card type="inner" title="正式正文中的关键章节">
                {sectionBuckets.decisionSections.length ? (
                  <List
                    itemLayout="vertical"
                    dataSource={sectionBuckets.decisionSections.slice(0, 4)}
                    renderItem={(section) => (
                      <List.Item key={`${section.type}-${section.title}`}>
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <Space wrap>
                            <Text strong>{section.title}</Text>
                            <Tag color="blue">{section.type}</Tag>
                          </Space>
                          <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                            {takeFirstSentence(section.content, 220) || section.content}
                          </Paragraph>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前报告没有独立的结论章节" />
                )}
              </Card>
            </Col>
            <Col xs={24} xl={10}>
              <Card type="inner" title="建议动作">
                {actionItems.length ? (
                  <List
                    size="small"
                    dataSource={actionItems}
                    renderItem={(item) => <List.Item>{item}</List.Item>}
                  />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="正式报告中暂无单列行动项" />
                )}
              </Card>
            </Col>
          </Row>
        </Space>
      </Card>

      <Card className="page-card" title="第二层：正式依据">
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}>
            <Card type="inner" title="证据章节">
              {sectionBuckets.evidenceSections.length ? (
                <List
                  itemLayout="vertical"
                  dataSource={sectionBuckets.evidenceSections.slice(0, 4)}
                  renderItem={(section) => (
                    <List.Item key={`${section.type}-${section.title}`}>
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Space wrap>
                          <Text strong>{section.title}</Text>
                          <Tag color={section.type === 'search_leads' ? 'gold' : 'green'}>{section.type}</Tag>
                        </Space>
                        <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                          {takeFirstSentence(section.content, 260) || section.content}
                        </Paragraph>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前正式报告中没有独立证据章节" />
              )}
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card type="inner" title="辅助分析章节">
              <Paragraph type="secondary">体验模型 / 视觉 / Persona 只作为辅助解释，不等于真实证据。</Paragraph>
              {sectionBuckets.analysisSections.length ? (
                <List
                  itemLayout="vertical"
                  dataSource={sectionBuckets.analysisSections.slice(0, 4)}
                  renderItem={(section) => (
                    <List.Item key={`${section.type}-${section.title}`}>
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Space wrap>
                          <Text strong>{section.title}</Text>
                          <Tag>{section.type}</Tag>
                        </Space>
                        <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                          {takeFirstSentence(section.content, 220) || section.content}
                        </Paragraph>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前正式报告中没有辅助分析章节" />
              )}
            </Card>
          </Col>
        </Row>
      </Card>

      <Card className="page-card" title="第三层：审核与边界">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {warningGroups.authenticityDowngrade.length ? (
            <Alert
              type="warning"
              showIcon
              message="真实性降级已触发"
              description={warningGroups.authenticityDowngrade.join('；')}
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

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={8}>
              <Card type="inner" title="Gate 结果">
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Text>RQ：{currentReport.gateResult.rqLevel || '未判定'}</Text>
                  <Text>屏蔽来源：{currentReport.gateResult.blockedSources.join('、') || '无'}</Text>
                  <Text>门禁原因：{currentReport.gateResult.blockedReasons?.join('；') || '无'}</Text>
                </Space>
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card type="inner" title="边界与复核章节">
                {sectionBuckets.boundarySections.length ? (
                  <List
                    size="small"
                    dataSource={sectionBuckets.boundarySections.slice(0, 5)}
                    renderItem={(section) => (
                      <List.Item key={`${section.type}-${section.title}`}>
                        <Space direction="vertical" size={4}>
                          <Space wrap>
                            <Text strong>{section.title}</Text>
                            <Tag>{section.type}</Tag>
                          </Space>
                          <span>{takeFirstSentence(section.content, 180) || section.content}</span>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有独立的边界章节" />
                )}
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card type="inner" title="操作">
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
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
              </Card>
            </Col>
          </Row>

          {warningGroups.otherWarnings.length ? (
            <Card type="inner" title="其他提醒">
              <List
                size="small"
                dataSource={warningGroups.otherWarnings.slice(0, 5)}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Card>
          ) : null}
        </Space>
      </Card>

      <Collapse
        items={[
          {
            key: 'formal-details',
            label: '展开正式正文、版本历史与调试细节',
            children: (
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                <ProvenanceSummaryCard summary={provenanceSummary} />
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
              </Space>
            ),
          },
        ]}
      />
    </Space>
  );
};
