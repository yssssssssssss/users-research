import { Alert, Button, Card, Collapse, Empty, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { ReportResponse } from '@users-research/shared';

const { Paragraph, Text } = Typography;

export type SectionDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface SectionDiffItem {
  key: string;
  title: string;
  type: string;
  status: SectionDiffStatus;
  before?: string;
  after?: string;
}

interface SectionGroup {
  key: string;
  title: string;
  description: string;
  types: string[];
}

const sectionGroups: SectionGroup[] = [
  {
    key: 'decision',
    title: '结论与建议',
    description: '面向决策的最终摘要、Gate 说明与建议动作。',
    types: ['summary', 'gate', 'action'],
  },
  {
    key: 'evidence',
    title: '真实性证据',
    description: '真实证据、已抓原文外部证据与待核查搜索线索分开呈现。',
    types: ['evidence', 'external_evidence', 'search_leads'],
  },
  {
    key: 'analysis',
    title: '分析视角',
    description: '体验模型、视觉评审和 Persona 线索属于辅助分析层，不等于真实事实。',
    types: ['framework', 'vision', 'persona'],
  },
  {
    key: 'boundary',
    title: '边界与风险',
    description: '集中展示真实性边界、fallback、门禁风险以及多模型复核意见。',
    types: ['boundary', 'review'],
  },
];

const takeFirstSentence = (value?: string, maxLength = 180) => {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const buildGroupedSections = (sections: ReportResponse['sections']) => {
  const grouped = sectionGroups
    .map((group) => ({
      ...group,
      sections: sections.filter((section) => group.types.includes(section.type)),
    }))
    .filter((group) => group.sections.length > 0);

  const groupedTypes = new Set(grouped.flatMap((group) => group.types));
  const ungroupedSections = sections.filter((section) => !groupedTypes.has(section.type));

  if (ungroupedSections.length > 0) {
    grouped.push({
      key: 'other',
      title: '其他章节',
      description: '尚未归类的章节内容。',
      types: [],
      sections: ungroupedSections,
    });
  }

  return grouped;
};

interface ReportTabsPanelProps {
  currentReport: ReportResponse;
  historyLoading: boolean;
  historyReports: ReportResponse[];
  reportStatusColorMap: Record<string, string>;
  reportStatusLabelMap: Record<string, string>;
  currentReportId: string;
  latestReportId?: string;
  selectReportVersion: (reportId: string) => void | Promise<void>;
  compareBaseId?: string;
  compareTargetId?: string;
  setCompareBaseId: (value: string) => void;
  setCompareTargetId: (value: string) => void;
  diffSummary: Record<SectionDiffStatus, number>;
  diffItems: SectionDiffItem[];
  compareBaseReport?: ReportResponse;
  compareTargetReport?: ReportResponse;
  diffStatusColorMap: Record<SectionDiffStatus, string>;
  diffStatusLabelMap: Record<SectionDiffStatus, string>;
}

export const ReportTabsPanel = ({
  currentReport,
  historyLoading,
  historyReports,
  reportStatusColorMap,
  reportStatusLabelMap,
  currentReportId,
  latestReportId,
  selectReportVersion,
  compareBaseId,
  compareTargetId,
  setCompareBaseId,
  setCompareTargetId,
  diffSummary,
  diffItems,
  compareBaseReport,
  compareTargetReport,
  diffStatusColorMap,
  diffStatusLabelMap,
}: ReportTabsPanelProps) => {
  const groupedSections = buildGroupedSections(currentReport.sections);
  const decisionSections = groupedSections.find((group) => group.key === 'decision')?.sections || [];
  const evidenceSections = groupedSections.find((group) => group.key === 'evidence')?.sections || [];
  const boundarySections = groupedSections.find((group) => group.key === 'boundary')?.sections || [];

  return (
    <Card className="page-card">
      <Tabs
        items={[
          {
            key: 'content',
            label: '正式正文',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Alert
                  type="info"
                  showIcon
                  message="先读执行摘要，再展开正文"
                  description="这个 tab 先告诉你正式报告说了什么、拿什么支撑、边界在哪，再展开全部章节。"
                />

                <Space wrap size={12}>
                  <Card size="small">
                    <Statistic title="结论章节" value={decisionSections.length} />
                  </Card>
                  <Card size="small">
                    <Statistic title="证据章节" value={evidenceSections.length} />
                  </Card>
                  <Card size="small">
                    <Statistic title="边界章节" value={boundarySections.length} />
                  </Card>
                  <Card size="small">
                    <Statistic title="总章节" value={currentReport.sections.length} />
                  </Card>
                </Space>

                <Card type="inner" title="执行摘要">
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <div>
                      <Text strong>正式结论</Text>
                      {decisionSections.length ? (
                        <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
                          {decisionSections.slice(0, 3).map((section) => (
                            <Card
                              key={`${section.type}-${section.title}`}
                              size="small"
                              title={(
                                <Space wrap>
                                  <span>{section.title}</span>
                                  <Tag color="blue">{section.type}</Tag>
                                </Space>
                              )}
                            >
                              <Paragraph style={{ marginBottom: 0 }}>
                                {takeFirstSentence(section.content, 220) || section.content}
                              </Paragraph>
                            </Card>
                          ))}
                        </Space>
                      ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有单列的结论章节" />
                      )}
                    </div>

                    <div>
                      <Text strong>依据摘要</Text>
                      {evidenceSections.length ? (
                        <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
                          {evidenceSections.slice(0, 3).map((section) => (
                            <Card
                              key={`${section.type}-${section.title}`}
                              size="small"
                              title={(
                                <Space wrap>
                                  <span>{section.title}</span>
                                  <Tag color={section.type === 'search_leads' ? 'gold' : 'green'}>{section.type}</Tag>
                                </Space>
                              )}
                            >
                              <Paragraph style={{ marginBottom: 0 }}>
                                {takeFirstSentence(section.content, 220) || section.content}
                              </Paragraph>
                            </Card>
                          ))}
                        </Space>
                      ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有单列的证据章节" />
                      )}
                    </div>

                    <div>
                      <Text strong>边界摘要</Text>
                      {boundarySections.length ? (
                        <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
                          {boundarySections.slice(0, 3).map((section) => (
                            <Card
                              key={`${section.type}-${section.title}`}
                              size="small"
                              title={(
                                <Space wrap>
                                  <span>{section.title}</span>
                                  <Tag>{section.type}</Tag>
                                </Space>
                              )}
                            >
                              <Paragraph style={{ marginBottom: 0 }}>
                                {takeFirstSentence(section.content, 220) || section.content}
                              </Paragraph>
                            </Card>
                          ))}
                        </Space>
                      ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有单列的边界章节" />
                      )}
                    </div>
                  </Space>
                </Card>

                <Collapse
                  items={groupedSections.map((group) => ({
                    key: group.key,
                    label: (
                      <Space wrap>
                        <span>{group.title}</span>
                        <Tag>{group.sections.length} 节</Tag>
                      </Space>
                    ),
                    children: (
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Text type="secondary">{group.description}</Text>
                        {group.sections.map((section) => (
                          <Card
                            key={`${section.type}-${section.title}`}
                            size="small"
                            title={(
                              <Space wrap>
                                <span>{section.title}</span>
                                <Tag color="blue">{section.type}</Tag>
                              </Space>
                            )}
                          >
                            <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                              {section.content}
                            </Paragraph>
                          </Card>
                        ))}
                      </Space>
                    ),
                  }))}
                />
              </Space>
            ),
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
                          type={currentReportId === record.id ? 'primary' : 'default'}
                          ghost={currentReportId === record.id}
                          onClick={() => void selectReportVersion(record.id)}
                        >
                          {currentReportId === record.id ? '当前查看' : '查看此版本'}
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
                    description="对比结果按章节聚合展示，用于判断本轮正式报告到底改了什么。"
                  />
                ) : null}

                {diffItems.length ? (
                  diffItems.map((item) => (
                    <Card
                      key={item.key}
                      type="inner"
                      title={(
                        <Space>
                          <span>{item.title}</span>
                          <Tag>{item.type}</Tag>
                          <Tag color={diffStatusColorMap[item.status]}>
                            {diffStatusLabelMap[item.status]}
                          </Tag>
                        </Space>
                      )}
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
            label: 'Gate / 缺口',
            children: `RQ：${currentReport.gateResult.rqLevel}；屏蔽来源：${currentReport.gateResult.blockedSources.join(', ') || '无'}；门禁原因：${currentReport.gateResult.blockedReasons?.join('；') || '无'}`,
          },
        ]}
      />
    </Card>
  );
};
