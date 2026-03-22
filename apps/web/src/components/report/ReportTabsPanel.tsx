import { Alert, Button, Card, Empty, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
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
}: ReportTabsPanelProps) => (
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
                  description="对比结果按章节聚合展示，可快速判断本轮报告新增、删除和改写内容。"
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
          label: 'Gate 与缺口',
          children: `RQ：${currentReport.gateResult.rqLevel}；屏蔽来源：${currentReport.gateResult.blockedSources.join(', ') || '无'}；门禁原因：${currentReport.gateResult.blockedReasons?.join('；') || '无'}`,
        },
      ]}
    />
  </Card>
);
