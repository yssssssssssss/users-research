import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Collapse, Empty, List, Row, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import type { EvidenceItem, PersonaFinding, ReportResponse, VisionFinding } from '@users-research/shared';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { ProvenanceSummaryCard } from '../components/ProvenanceSummaryCard';
import { RouteLoading } from '../components/RouteLoading';
import { api } from '../lib/api';
import { getEvidenceAuthenticityKind, getEvidenceAuthenticityTag, getEvidenceSourceDomain } from '../lib/evidenceMeta';
import { TASK_DETAIL_EVIDENCE_PATH, TASK_DETAIL_OVERVIEW_PATH, TASK_DETAIL_REPORT_PATH } from '../lib/navigation';
import { buildProvenanceSummary } from '../lib/provenance';
import { splitTaskWarnings } from '../lib/taskWarnings';
import { useTaskStore } from '../store/taskStore';

const ResultDetailPanels = lazy(() =>
  import('../components/result/ResultDetailPanels').then((module) => ({ default: module.ResultDetailPanels })),
);

const { Title, Paragraph, Text } = Typography;

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

const reportStatusLabelMap: Record<string, string> = {
  approved: '已通过',
  pending_review: '待审核',
  rejected: '已退回',
  draft: '草稿',
};

const reportStatusColorMap: Record<string, string> = {
  approved: 'green',
  pending_review: 'gold',
  rejected: 'red',
  draft: 'default',
};

const sourceTypeLabelMap: Record<string, string> = {
  experience_model: '体验模型',
  vision_generated: 'Vision',
  persona_generated: 'Persona',
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

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const takeFirstSentence = (value?: string, maxLength = 120) => {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const buildEvidencePriority = (item: EvidenceItem) => {
  const tierWeight = { T1: 0, T2: 1, T3: 2 }[item.tier] ?? 9;
  const reviewWeight =
    { accepted: 0, unreviewed: 1, downgraded: 2, rejected: 3 }[item.reviewStatus] ?? 9;
  const usedWeight = item.isUsedInReport ? 0 : 1;
  return `${usedWeight}-${reviewWeight}-${tierWeight}`;
};

const buildVisionPriority = (item: VisionFinding) => {
  const riskWeight = { high: 0, medium: 1, low: 2 }[item.riskLevel] ?? 9;
  const conflictWeight = item.isConflict ? 0 : 1;
  return `${riskWeight}-${conflictWeight}`;
};

const buildPersonaPriority = (item: PersonaFinding) =>
  item.stance === 'mixed' || item.stance === 'confused' ? 0 : 1;

const formatEvidenceMeta = (item: EvidenceItem) =>
  [item.sourceName || '未命名来源', getEvidenceSourceDomain(item), item.sourceDate].filter(Boolean).join('｜');

export const ResultPage = () => {
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const taskSummary = useTaskStore((state) => state.taskSummary);
  const taskState = useTaskStore((state) => state.taskState);
  const selectedOutput = useTaskStore((state) => state.selectedOutput);
  const currentReport = useTaskStore((state) => state.currentReport);
  const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
  const setTaskState = useTaskStore((state) => state.setTaskState);
  const setSelectedOutput = useTaskStore((state) => state.setSelectedOutput);
  const synthesisResult = taskState?.synthesisResult;
  const moduleResults = taskState?.moduleResults;

  const [report, setReport] = useState<ReportResponse>();
  const [reportLoading, setReportLoading] = useState(false);

  const loadTaskContext = useCallback(async () => {
    if (!currentTaskId) return undefined;
    const [summary, state] = await Promise.all([
      api.getTask(currentTaskId),
      api.getTaskState(currentTaskId),
    ]);
    setTaskSummary(summary);
    setTaskState(state);
    return { summary, state };
  }, [currentTaskId, setTaskState, setTaskSummary]);

  useEffect(() => {
    if (!currentTaskId) return;
    if (taskSummary && taskState) return;
    void loadTaskContext();
  }, [currentTaskId, loadTaskContext, taskState, taskSummary]);

  useEffect(() => {
    if (!selectedOutput && taskState?.candidateOutputs[0]) {
      setSelectedOutput(taskState.candidateOutputs[0]);
    }
  }, [selectedOutput, setSelectedOutput, taskState?.candidateOutputs]);

  const reportRefs = useMemo(
    () =>
      (taskState?.finalReports || [])
        .filter((item) => item.reportType === selectedOutput?.outputType)
        .sort((left, right) => right.version - left.version),
    [selectedOutput?.outputType, taskState?.finalReports],
  );

  const latestReportId = reportRefs[0]?.id;

  useEffect(() => {
    if (!selectedOutput) {
      setReportLoading(false);
      setReport(undefined);
      return;
    }

    if (!latestReportId) {
      setReportLoading(false);
      setReport(undefined);
      return;
    }

    if (currentReport?.id === latestReportId && currentReport.reportType === selectedOutput.outputType) {
      setReportLoading(false);
      setReport(currentReport);
      return;
    }

    let disposed = false;
    setReportLoading(true);

    api.getReport(latestReportId)
      .then((nextReport) => {
        if (!disposed) setReport(nextReport);
      })
      .catch(() => {
        if (!disposed) setReport(undefined);
      })
      .finally(() => {
        if (!disposed) setReportLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [currentReport, latestReportId, selectedOutput]);

  const content = useMemo(
    () => asRecord(selectedOutput?.contentJson),
    [selectedOutput?.contentJson],
  );

  const judgmentCards = useMemo(() => {
    const judgments = Array.isArray(content?.judgments)
      ? content.judgments
          .map((item) => asRecord(item))
          .filter(Boolean)
          .map((item, index) => ({
            key: `${item?.title || 'judgment'}-${index}`,
            title:
              typeof item?.title === 'string' && item.title.trim()
                ? item.title
                : `关键判断 ${index + 1}`,
            content:
              typeof item?.content === 'string' && item.content.trim()
                ? item.content
                : '暂无内容',
            confidence:
              typeof item?.confidence === 'string' ? item.confidence : undefined,
            risk: typeof item?.risk === 'string' ? item.risk : undefined,
          }))
      : [];

    if (judgments.length > 0) return judgments.slice(0, 3);

    return (report?.sections || []).slice(0, 3).map((section, index) => ({
      key: `${section.type}-${section.title}-${index}`,
      title: section.title || `关键判断 ${index + 1}`,
      content: section.content || '暂无内容',
      confidence: undefined,
      risk: section.type,
    }));
  }, [content?.judgments, report?.sections]);

  const conclusion = useMemo(
    () =>
      selectedOutput?.summary
      || takeFirstSentence(synthesisResult?.conclusions?.[0]?.content, 150)
      || takeFirstSentence(judgmentCards[0]?.content, 150)
      || takeFirstSentence(report?.sections[0]?.content, 150)
      || '当前结果已生成，但仍需继续校验证据与边界。',
    [judgmentCards, report?.sections, selectedOutput?.summary, synthesisResult?.conclusions],
  );

  const nextActions = useMemo(() => {
    const actions = synthesisResult?.nextResearchActions || synthesisResult?.topRecommendations || asStringArray(content?.nextActions);
    if (actions.length > 0) return actions.slice(0, 5);

    const fromSection = report?.sections.find((section) =>
      /建议|行动|下一步/.test(section.title),
    );

    return fromSection?.content
      ? fromSection.content
          .split(/\r?\n|；|;/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];
  }, [content?.nextActions, report?.sections]);

  const reviewNotes = useMemo(() => asStringArray(content?.reviewNotes).slice(0, 5), [content?.reviewNotes]);

  const experienceModels = useMemo(
    () =>
      (taskState?.evidencePool || [])
        .filter((item) => item.sourceType === 'experience_model')
        .map((item) => {
          const trace = asRecord(item.traceLocation);
          return {
            id: item.id,
            name: item.sourceName || '体验模型',
            content: item.content,
            dimensions: asStringArray(trace?.dimensions),
            reasons: asStringArray(trace?.selectionReasons),
            questions: asStringArray(trace?.evaluationQuestions),
            mode: trace?.selectionMode === 'manual' ? '手动覆盖' : '自动推荐',
          };
        }),
    [taskState?.evidencePool],
  );

  const { fetchedArticleHighlights, searchLeadHighlights, evidenceHighlights } = useMemo(() => {
    const rankedEvidence = (taskState?.evidencePool || [])
      .filter((item) => item.reviewStatus !== 'rejected')
      .sort((left, right) => buildEvidencePriority(left).localeCompare(buildEvidencePriority(right)));

    const fetchedArticleHighlights: EvidenceItem[] = [];
    const searchLeadHighlights: EvidenceItem[] = [];
    const evidenceHighlights: EvidenceItem[] = [];

    for (const item of rankedEvidence) {
      const authenticity = getEvidenceAuthenticityKind(item);
      if (authenticity === 'fetched_article' || authenticity === 'fetched_document') {
        if (fetchedArticleHighlights.length < 3) fetchedArticleHighlights.push(item);
        continue;
      }

      if (authenticity === 'search_result') {
        if (searchLeadHighlights.length < 3) searchLeadHighlights.push(item);
        continue;
      }

      if (evidenceHighlights.length < 5) {
        evidenceHighlights.push(item);
      }
    }

    return {
      fetchedArticleHighlights,
      searchLeadHighlights,
      evidenceHighlights,
    };
  }, [taskState?.evidencePool]);

  const visionHighlights = useMemo(
    () =>
      (taskState?.visionFindings || [])
        .slice()
        .sort((left, right) => buildVisionPriority(left).localeCompare(buildVisionPriority(right)))
        .slice(0, 4),
    [taskState?.visionFindings],
  );

  const personaHighlights = useMemo(
    () =>
      (taskState?.personaFindings || [])
        .slice()
        .sort((left, right) => buildPersonaPriority(left) - buildPersonaPriority(right))
        .slice(0, 4),
    [taskState?.personaFindings],
  );

  const provenanceSummary = useMemo(
    () =>
      buildProvenanceSummary({
        taskState,
        taskSummary,
        selectedOutput,
        report,
      }),
    [report, selectedOutput, taskState, taskSummary],
  );

  const warningGroups = useMemo(
    () => splitTaskWarnings(taskSummary?.stats.warnings),
    [taskSummary?.stats.warnings],
  );

  const primaryConfidence = judgmentCards.find((item) => item.confidence)?.confidence || '未标注';
  const verifiedEvidenceHighlights = useMemo(
    () =>
      [...fetchedArticleHighlights, ...evidenceHighlights]
        .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
        .filter((item) => {
          const authenticity = getEvidenceAuthenticityKind(item);
          return authenticity === 'reviewed_external' || authenticity === 'fetched_article' || authenticity === 'fetched_document' || authenticity === 'internal';
        })
        .slice(0, 4),
    [evidenceHighlights, fetchedArticleHighlights],
  );
  const evidenceGapNotes = useMemo(() => {
    const notes: string[] = [];
    if (searchLeadHighlights.length > 0) {
      notes.push(`仍有 ${searchLeadHighlights.length} 条外部搜索线索未完成抓取或复核`);
    }
    if (provenanceSummary.acceptedRealEvidenceCount === 0) {
      notes.push('当前没有已接受的真实证据可直接支撑最终定论');
    }
    if (!report) {
      notes.push('当前还没有最终报告版本，仍以候选结果为准');
    }
    return notes;
  }, [provenanceSummary.acceptedRealEvidenceCount, report, searchLeadHighlights.length]);

  if (!currentTaskId) {
    return <Empty description="请先创建任务，再查看结果展示页" />;
  }

  if (!taskSummary || !taskState) {
    return <Card loading className="page-card" />;
  }

  if (!selectedOutput) {
    return (
      <Empty
        description="该任务尚未形成可展示的候选结果"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  const heroBackground =
    selectedOutput.gateLevel === 'blocked_by_rq'
      ? '#fff1f0'
      : primaryConfidence === 'high'
      ? '#f6ffed'
      : primaryConfidence === 'medium'
      ? '#fffbe6'
      : '#fafafa';

  const heroBorderColor =
    selectedOutput.gateLevel === 'blocked_by_rq'
      ? '#ffccc7'
      : primaryConfidence === 'high'
      ? '#b7eb8f'
      : primaryConfidence === 'medium'
      ? '#ffe58f'
      : '#f0f0f0';

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>

      {/* ── 顶部导航 ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <Title level={4} style={{ marginBottom: 4 }}>综合结论</Title>
          <Text type="secondary" style={{ wordBreak: 'break-word' }}>{taskSummary.title || '未命名任务'}</Text>
        </div>
        <Space wrap style={{ flexShrink: 0 }}>
          <Button size="small"><Link to={TASK_DETAIL_OVERVIEW_PATH(currentTaskId)}>返回总览</Link></Button>
          <Button size="small"><Link to={TASK_DETAIL_EVIDENCE_PATH(currentTaskId)}>查看证据池</Link></Button>
          <Button size="small" type="primary"><Link to={TASK_DETAIL_REPORT_PATH(currentTaskId)}>进入正式报告</Link></Button>
        </Space>
      </div>

      {/* ── Hero 结论区 ── */}
      <div
        style={{
          background: heroBackground,
          border: `1px solid ${heroBorderColor}`,
          borderRadius: 8,
          padding: '20px 24px',
        }}
      >
        {taskSummary.query && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8, wordBreak: 'break-word' }}>
            {taskSummary.query}
          </Text>
        )}
        <Paragraph
          style={{ fontSize: 17, fontWeight: 500, marginBottom: 12, wordBreak: 'break-word', lineHeight: 1.7 }}
        >
          {conclusion}
        </Paragraph>
        <Space wrap>
          <Tag color={confidenceColorMap[primaryConfidence] || 'default'}>
            可信度：{primaryConfidence}
          </Tag>
          <Tag color={gateColorMap[selectedOutput.gateLevel || 'review_required'] || 'default'}>
            门禁：{selectedOutput.gateLevel || '未标注'}
          </Tag>
          <Tag>RQ：{taskSummary.rqLevel || '未判定'}</Tag>
          <Tag>输出：{selectedOutput.outputType}</Tag>
          {warningGroups.authenticityDowngrade.length > 0 && (
            <Tag color="red">真实性已降级</Tag>
          )}
        </Space>
      </div>

      {/* ── 主内容：关键判断 + 状态摘要 ── */}
      <Row gutter={[24, 24]}>
        {/* 左列：关键判断 */}
        <Col xs={24} xl={16}>
          <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>关键判断</Text>
          {judgmentCards.length ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {judgmentCards.map((item, index) => (
                <div
                  key={item.key}
                  style={{
                    display: 'flex',
                    gap: 16,
                    padding: '16px',
                    background: '#fafafa',
                    borderRadius: 6,
                    border: '1px solid #f0f0f0',
                  }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: '#d9d9d9',
                      lineHeight: 1.2,
                      flexShrink: 0,
                      width: 24,
                      paddingTop: 2,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      <Text strong className="content-wrap-safe">{item.title}</Text>
                      {item.confidence && (
                        <Tag
                          color={confidenceColorMap[item.confidence] || 'default'}
                          style={{ margin: 0 }}
                        >
                          {item.confidence}
                        </Tag>
                      )}
                      {item.risk && <Tag style={{ margin: 0 }}>{item.risk}</Tag>}
                    </div>
                    <Paragraph
                      className="content-wrap-safe content-wrap-safe-pre"
                      style={{ marginBottom: 0, color: '#595959' }}
                    >
                      {item.content}
                    </Paragraph>
                  </div>
                </div>
              ))}
            </Space>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前结果暂未形成结构化结论"
            />
          )}
        </Col>

        {/* 右列：状态摘要 + 建议下一步 */}
        <Col xs={24} xl={8}>
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            {/* 状态摘要 */}
            <div>
              <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>状态摘要</Text>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {(
                  [
                    { label: '任务状态', value: taskStatusLabelMap[taskSummary.status] || taskSummary.status },
                    { label: '审核状态', value: reviewStatusLabelMap[taskSummary.reviewStatus] || taskSummary.reviewStatus },
                    { label: '真实证据', value: `${provenanceSummary.acceptedRealEvidenceCount} 条` },
                    { label: '待核查线索', value: `${provenanceSummary.pendingExternalEvidenceCount} 条` },
                  ] as { label: string; value: string }[]
                ).map(({ label, value }) => (
                  <div
                    key={label}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}
                  >
                    <Text type="secondary">{label}</Text>
                    <Text style={{ flexShrink: 0 }}>{value}</Text>
                  </div>
                ))}
              </Space>
            </div>

            {/* 建议下一步 */}
            <div>
              <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>建议下一步</Text>
              {nextActions.length ? (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  {nextActions.map((item, index) => (
                    <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: '#1677ff', flexShrink: 0, lineHeight: '22px' }}>•</span>
                      <Text style={{ wordBreak: 'break-word' }}>{item}</Text>
                    </div>
                  ))}
                </Space>
              ) : (
                <Text type="secondary" style={{ fontSize: 13 }}>暂无明确下一步建议</Text>
              )}
            </div>
          </Space>
        </Col>
      </Row>

      {/* ── 依据摘要 ── */}
      <div>
        <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>依据摘要</Text>
        <Space wrap style={{ marginBottom: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#52c41a', fontWeight: 600 }}>✓</span>
            <Text>
              已验证外部证据 <Text strong>{fetchedArticleHighlights.length}</Text> 条
            </Text>
          </span>
          {searchLeadHighlights.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#faad14', fontWeight: 600 }}>⚠</span>
              <Text>
                待核查线索 <Text strong>{searchLeadHighlights.length}</Text> 条
              </Text>
            </span>
          )}
          {verifiedEvidenceHighlights.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#1677ff', fontWeight: 600 }}>○</span>
              <Text>
                其他已验证依据 <Text strong>{verifiedEvidenceHighlights.length}</Text> 条
              </Text>
            </span>
          )}
          {!report && (
            <Text type="secondary" style={{ fontSize: 13 }}>暂无报告版本</Text>
          )}
        </Space>
        <Collapse
          size="small"
          items={[
            {
              key: 'evidence-detail',
              label: '展开查看证据详情',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  {verifiedEvidenceHighlights.length > 0 && (
                    <div>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>已验证依据</Text>
                      <List
                        size="small"
                        itemLayout="vertical"
                        dataSource={verifiedEvidenceHighlights}
                        renderItem={(item) => {
                          const authenticityTag = getEvidenceAuthenticityTag(item);
                          return (
                            <List.Item key={item.id}>
                              <Space direction="vertical" size={6} className="content-block-safe">
                                <Space wrap>
                                  <Tag
                                    color={
                                      item.tier === 'T1'
                                        ? 'green'
                                        : item.tier === 'T2'
                                        ? 'blue'
                                        : 'gold'
                                    }
                                  >
                                    {item.tier}
                                  </Tag>
                                  <Tag color={authenticityTag.color}>{authenticityTag.label}</Tag>
                                  {item.isUsedInReport && <Tag color="cyan">已入报告</Tag>}
                                </Space>
                                <Paragraph
                                  className="content-wrap-safe content-wrap-safe-pre"
                                  style={{ marginBottom: 0 }}
                                >
                                  {takeFirstSentence(item.content, 160)}
                                </Paragraph>
                                <Text type="secondary" className="content-wrap-safe">
                                  {formatEvidenceMeta(item)}
                                </Text>
                              </Space>
                            </List.Item>
                          );
                        }}
                      />
                    </div>
                  )}

                  {visionHighlights.length > 0 && (
                    <div>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>视觉观察（辅助）</Text>
                      <Text
                        type="secondary"
                        style={{ fontSize: 12, display: 'block', marginBottom: 8 }}
                      >
                        只作为辅助线索，不能单独替代真实证据。
                      </Text>
                      <List
                        size="small"
                        dataSource={visionHighlights.slice(0, 3)}
                        renderItem={(item) => (
                          <List.Item key={item.id}>
                            <Space direction="vertical" size={4} className="content-block-safe">
                              <Space wrap>
                                <Tag
                                  color={
                                    item.riskLevel === 'high'
                                      ? 'red'
                                      : item.riskLevel === 'medium'
                                      ? 'gold'
                                      : 'blue'
                                  }
                                >
                                  {item.riskLevel}
                                </Tag>
                                <Tag>{item.findingType}</Tag>
                                {item.isConflict && <Tag color="purple">有分歧</Tag>}
                              </Space>
                              <span className="content-wrap-safe content-wrap-safe-pre">
                                {item.content}
                              </span>
                            </Space>
                          </List.Item>
                        )}
                      />
                    </div>
                  )}

                  {personaHighlights.length > 0 && (
                    <div>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>模拟用户反馈（辅助）</Text>
                      <Text
                        type="secondary"
                        style={{ fontSize: 12, display: 'block', marginBottom: 8 }}
                      >
                        这是 Persona 模拟，不是真实用户访谈原始证据。
                      </Text>
                      <List
                        size="small"
                        dataSource={personaHighlights.slice(0, 3)}
                        renderItem={(item) => (
                          <List.Item key={item.id}>
                            <Space direction="vertical" size={4} className="content-block-safe">
                              <Space wrap>
                                <Tag color="purple">{item.personaName}</Tag>
                                {item.stance && <Tag>{item.stance}</Tag>}
                                {item.theme && <Tag color="blue">{item.theme}</Tag>}
                              </Space>
                              <span className="content-wrap-safe content-wrap-safe-pre">
                                {item.content}
                              </span>
                            </Space>
                          </List.Item>
                        )}
                      />
                    </div>
                  )}

                  {evidenceGapNotes.length > 0 && (
                    <Alert
                      type="warning"
                      showIcon
                      message="依据仍有缺口"
                      description={evidenceGapNotes.join('；')}
                    />
                  )}
                </Space>
              ),
            },
          ]}
        />
      </div>

      {/* ── 风险与边界（条件渲染）── */}
      {(warningGroups.authenticityDowngrade.length > 0 ||
        (report?.gateResult.blockedReasons?.length ?? 0) > 0 ||
        provenanceSummary.boundaryNotes.length > 0) && (
        <div>
          <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>风险与边界</Text>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {warningGroups.authenticityDowngrade.length > 0 && (
              <div
                style={{
                  borderLeft: '4px solid #faad14',
                  paddingLeft: 12,
                  paddingTop: 8,
                  paddingBottom: 8,
                  background: '#fffbe6',
                  borderRadius: '0 4px 4px 0',
                }}
              >
                <Text strong style={{ color: '#d46b08', display: 'block', marginBottom: 4 }}>
                  真实性降级已触发
                </Text>
                <Text className="content-wrap-safe">
                  {warningGroups.authenticityDowngrade.join('；')}
                </Text>
              </div>
            )}
            {(report?.gateResult.blockedReasons?.length ?? 0) > 0 && (
              <div
                style={{
                  borderLeft: '4px solid #ff4d4f',
                  paddingLeft: 12,
                  paddingTop: 8,
                  paddingBottom: 8,
                  background: '#fff1f0',
                  borderRadius: '0 4px 4px 0',
                }}
              >
                <Text strong style={{ color: '#cf1322', display: 'block', marginBottom: 4 }}>
                  当前结果存在门禁限制
                </Text>
                <Text className="content-wrap-safe">
                  {report!.gateResult.blockedReasons!.join('；')}
                </Text>
              </div>
            )}
            {provenanceSummary.boundaryNotes.length > 0 && (
              <div
                style={{
                  borderLeft: '4px solid #d9d9d9',
                  paddingLeft: 12,
                  paddingTop: 8,
                  paddingBottom: 8,
                }}
              >
                <Text strong style={{ display: 'block', marginBottom: 4 }}>真实性边界说明</Text>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  {provenanceSummary.boundaryNotes.slice(0, 5).map((note, i) => (
                    <Text
                      key={i}
                      type="secondary"
                      className="content-wrap-safe"
                      style={{ display: 'block' }}
                    >
                      {note}
                    </Text>
                  ))}
                </Space>
              </div>
            )}
          </Space>
        </div>
      )}

      {/* ── 完整分析链路（折叠）── */}
      <Collapse
        items={[
          {
            key: 'full-detail',
            label: '展开完整分析链路',
            children: (
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                <ProvenanceSummaryCard summary={provenanceSummary} />
                <OutputPreviewCard
                  output={selectedOutput}
                  provenanceTags={provenanceSummary.tags}
                  fallbackWarnings={provenanceSummary.fallbackWarnings}
                />
                <Suspense fallback={<RouteLoading />}>
                  <ResultDetailPanels
                    experienceModels={experienceModels}
                    evidenceHighlights={evidenceHighlights}
                    fetchedArticleHighlights={fetchedArticleHighlights}
                    searchLeadHighlights={searchLeadHighlights}
                    sourceTypeLabelMap={sourceTypeLabelMap}
                    visionHighlights={visionHighlights}
                    personaHighlights={personaHighlights}
                    nextActions={nextActions}
                    boundaryNotes={provenanceSummary.boundaryNotes}
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
