import { Alert, Button, Card, Col, Descriptions, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EvidenceItem, PersonaFinding, ReportResponse, VisionFinding } from '@users-research/shared';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';

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

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const takeFirstSentence = (value?: string) => {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
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

export const ResultPage = () => {
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const taskSummary = useTaskStore((state) => state.taskSummary);
  const taskState = useTaskStore((state) => state.taskState);
  const selectedOutput = useTaskStore((state) => state.selectedOutput);
  const currentReport = useTaskStore((state) => state.currentReport);
  const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
  const setTaskState = useTaskStore((state) => state.setTaskState);
  const setSelectedOutput = useTaskStore((state) => state.setSelectedOutput);

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
      || takeFirstSentence(judgmentCards[0]?.content)
      || takeFirstSentence(report?.sections[0]?.content)
      || '当前结果已生成，可进入细节验证与审核。',
    [judgmentCards, report?.sections, selectedOutput?.summary],
  );

  const nextActions = useMemo(() => {
    const actions = asStringArray(content?.nextActions);
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

  const evidenceHighlights = useMemo(
    () =>
      (taskState?.evidencePool || [])
        .filter((item) => item.reviewStatus !== 'rejected')
        .sort((left, right) => buildEvidencePriority(left).localeCompare(buildEvidencePriority(right)))
        .slice(0, 5),
    [taskState?.evidencePool],
  );

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

  const boundaryNotes = useMemo(() => {
    const items = [
      ...(report?.gateResult.blockedReasons || []),
      ...(selectedOutput?.gateNotes || []),
      ...(taskSummary?.stats.warnings || []),
    ];
    return Array.from(new Set(items)).slice(0, 5);
  }, [report?.gateResult.blockedReasons, selectedOutput?.gateNotes, taskSummary?.stats.warnings]);

  if (!currentTaskId) {
    return <Empty description="请先创建任务，再查看结果展示页" />;
  }

  if (!taskSummary || !taskState) {
    return <Card loading className="page-card" />;
  }

  if (!selectedOutput) {
    return (
      <Empty
        description="当前任务尚未形成可展示的候选结果"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Space
        align="start"
        style={{ width: '100%', justifyContent: 'space-between' }}
        wrap
      >
        <div>
          <Title level={2} style={{ marginBottom: 8 }}>
            结果总览页
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            面向演示、评审与真实案例回放的最终结果展示。
          </Paragraph>
        </div>
        <Space wrap>
          <Button><Link to="/workbench">返回工作台</Link></Button>
          <Button><Link to="/evidence">查看证据池</Link></Button>
          <Button type="primary"><Link to="/report">进入综合报告</Link></Button>
        </Space>
      </Space>

      {report?.gateResult.blockedReasons?.length ? (
        <Alert
          type="warning"
          showIcon
          message="当前结果存在门禁限制"
          description={report.gateResult.blockedReasons.join('；')}
        />
      ) : null}

      <Card className="page-card">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12} xl={8}>
            <Descriptions column={1} size="small" title="任务摘要">
              <Descriptions.Item label="标题">
                {taskSummary.title || '未命名任务'}
              </Descriptions.Item>
              <Descriptions.Item label="问题">
                {taskSummary.query}
              </Descriptions.Item>
              <Descriptions.Item label="一句话结论">
                {conclusion}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col xs={24} md={12} xl={16}>
            <Row gutter={[16, 16]}>
              <Col xs={12} md={6}>
                <Card><Statistic title="任务状态" value={taskStatusLabelMap[taskSummary.status] || taskSummary.status} /></Card>
              </Col>
              <Col xs={12} md={6}>
                <Card><Statistic title="RQ 等级" value={taskSummary.rqLevel || '未判定'} /></Card>
              </Col>
              <Col xs={12} md={6}>
                <Card><Statistic title="审核状态" value={reviewStatusLabelMap[taskSummary.reviewStatus] || taskSummary.reviewStatus} /></Card>
              </Col>
              <Col xs={12} md={6}>
                <Card><Statistic title="候选结果" value={taskState.candidateOutputs.length} /></Card>
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title="核心结论" className="page-card">
            {judgmentCards.length ? (
              <Row gutter={[16, 16]}>
                {judgmentCards.map((item) => (
                  <Col xs={24} md={12} key={item.key}>
                    <Card type="inner" title={item.title}>
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Paragraph style={{ marginBottom: 0 }}>{item.content}</Paragraph>
                        <Space wrap>
                          {item.confidence ? <Tag color="blue">置信度：{item.confidence}</Tag> : null}
                          {item.risk ? <Tag>{item.risk}</Tag> : null}
                        </Space>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前结果暂未形成结构化结论" />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="当前成果状态" className="page-card" loading={reportLoading}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap>
                <Tag color="blue">输出：{selectedOutput.outputType}</Tag>
                <Tag color={selectedOutput.gateLevel === 'allowed' ? 'green' : selectedOutput.gateLevel === 'blocked_by_rq' ? 'red' : 'gold'}>
                  门禁：{selectedOutput.gateLevel || '未标注'}
                </Tag>
                <Tag>节点：{selectedOutput.sourceNode}</Tag>
              </Space>
              <Paragraph style={{ marginBottom: 0 }}>
                {selectedOutput.summary || '当前候选结果已生成，可继续查看报告、证据和体验模型视角。'}
              </Paragraph>
              {report ? (
                <Space wrap>
                  <Tag color={reportStatusColorMap[report.status] || 'default'}>
                    报告：{reportStatusLabelMap[report.status] || report.status}
                  </Tag>
                  <Tag>版本：v{report.version}</Tag>
                  <Tag>
                    Tier 覆盖：T1 {report.gateResult.tierCoverage.T1} / T2 {report.gateResult.tierCoverage.T2} / T3 {report.gateResult.tierCoverage.T3}
                  </Tag>
                </Space>
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message="当前还没有最终报告版本"
                  description="你仍然可以先查看候选结果、体验模型和证据概览。"
                />
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      <OutputPreviewCard output={selectedOutput} />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card title="体验模型视角" className="page-card">
            {experienceModels.length ? (
              <List
                itemLayout="vertical"
                dataSource={experienceModels}
                renderItem={(item) => (
                  <List.Item key={item.id}>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Space wrap>
                        <Text strong>{item.name}</Text>
                        <Tag color={item.mode === '手动覆盖' ? 'purple' : 'green'}>
                          {item.mode}
                        </Tag>
                      </Space>
                      <Paragraph style={{ marginBottom: 0 }}>{item.content}</Paragraph>
                      {item.dimensions.length ? (
                        <Space wrap>
                          {item.dimensions.map((dimension) => (
                            <Tag key={dimension}>{dimension}</Tag>
                          ))}
                        </Space>
                      ) : null}
                      {item.reasons.length ? (
                        <div>
                          <Text strong>推荐原因</Text>
                          <List
                            size="small"
                            dataSource={item.reasons.slice(0, 3)}
                            renderItem={(reason) => <List.Item>{reason}</List.Item>}
                          />
                        </div>
                      ) : null}
                      {item.questions.length ? (
                        <div>
                          <Text strong>建议追问</Text>
                          <List
                            size="small"
                            dataSource={item.questions.slice(0, 3)}
                            renderItem={(question) => <List.Item>{question}</List.Item>}
                          />
                        </div>
                      ) : null}
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="当前任务尚未产出体验模型视角"
              />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="核心证据" className="page-card">
            {evidenceHighlights.length ? (
              <List
                itemLayout="vertical"
                dataSource={evidenceHighlights}
                renderItem={(item) => (
                  <List.Item key={item.id}>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Space wrap>
                        <Tag color={item.tier === 'T1' ? 'green' : item.tier === 'T2' ? 'blue' : 'gold'}>
                          {item.tier}
                        </Tag>
                        <Tag>{sourceTypeLabelMap[item.sourceType] || item.sourceType}</Tag>
                        <Tag>{item.reviewStatus}</Tag>
                        {item.isUsedInReport ? <Tag color="cyan">已入报告</Tag> : null}
                      </Space>
                      <Paragraph style={{ marginBottom: 0 }}>
                        {item.content}
                      </Paragraph>
                      <Text type="secondary">
                        {item.sourceName || '未命名来源'}
                        {item.sourceDate ? `｜${item.sourceDate}` : ''}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可展示证据" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card title="Vision / Persona 摘要" className="page-card">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div>
                <Text strong>视觉风险</Text>
                {visionHighlights.length ? (
                  <List
                    size="small"
                    dataSource={visionHighlights}
                    renderItem={(item) => (
                      <List.Item key={item.id}>
                        <Space direction="vertical" size={4}>
                          <Space wrap>
                            <Tag color={item.riskLevel === 'high' ? 'red' : item.riskLevel === 'medium' ? 'gold' : 'blue'}>
                              {item.riskLevel}
                            </Tag>
                            <Tag>{item.findingType}</Tag>
                            {item.isConflict ? <Tag color="purple">有分歧</Tag> : null}
                          </Space>
                          <span>{item.content}</span>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Vision 结论" />
                )}
              </div>

              <div>
                <Text strong>人群差异</Text>
                {personaHighlights.length ? (
                  <List
                    size="small"
                    dataSource={personaHighlights}
                    renderItem={(item) => (
                      <List.Item key={item.id}>
                        <Space direction="vertical" size={4}>
                          <Space wrap>
                            <Tag color="purple">{item.personaName}</Tag>
                            {item.stance ? <Tag>{item.stance}</Tag> : null}
                            {item.theme ? <Tag color="blue">{item.theme}</Tag> : null}
                          </Space>
                          <span>{item.content}</span>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Persona 结论" />
                )}
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="建议动作与边界" className="page-card">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div>
                <Text strong>下一步建议</Text>
                {nextActions.length ? (
                  <List
                    size="small"
                    dataSource={nextActions}
                    renderItem={(item) => <List.Item>{item}</List.Item>}
                  />
                ) : (
                  <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                    当前结果未给出结构化的下一步动作，建议到综合报告页查看完整章节。
                  </Paragraph>
                )}
              </div>

              <div>
                <Text strong>当前边界说明</Text>
                {boundaryNotes.length ? (
                  <List
                    size="small"
                    dataSource={boundaryNotes}
                    renderItem={(item) => <List.Item>{item}</List.Item>}
                  />
                ) : (
                  <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                    当前结果没有额外门禁提醒，可继续进入审核或真实验证。
                  </Paragraph>
                )}
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
};
