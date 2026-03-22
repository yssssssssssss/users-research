import { Button, Select, Space, Table, Tag, Typography } from 'antd';
import type { EvidenceItem, TierLevel } from '@users-research/shared';

const { Link, Text } = Typography;

interface EvidenceReviewTableProps {
  items: EvidenceItem[];
  tierColorMap: Record<string, string>;
  reviewColorMap: Record<EvidenceItem['reviewStatus'], string>;
  reviewLabelMap: Record<EvidenceItem['reviewStatus'], string>;
  tierDrafts: Record<string, TierLevel>;
  tierOptions: Array<{ label: string; value: string }>;
  actionLocked: boolean;
  submittingId?: string;
  isRecomputing: boolean;
  onTierChange: (itemId: string, value: TierLevel) => void;
  onReview: (item: EvidenceItem, reviewStatus: EvidenceItem['reviewStatus']) => void;
}

export const EvidenceReviewTable = ({
  items,
  tierColorMap,
  reviewColorMap,
  reviewLabelMap,
  tierDrafts,
  tierOptions,
  actionLocked,
  submittingId,
  isRecomputing,
  onTierChange,
  onReview,
}: EvidenceReviewTableProps) => (
  <Table
    rowKey="id"
    dataSource={items}
    pagination={false}
    columns={[
      {
        title: '来源名称',
        render: (_, item) => <Text strong>{item.sourceName || '未命名来源'}</Text>,
      },
      {
        title: '来源类型',
        dataIndex: 'sourceType',
        render: (value: string) => <Tag>{value}</Tag>,
      },
      {
        title: '来源级别',
        dataIndex: 'sourceLevel',
        render: (value: string) => <Tag>{value}</Tag>,
      },
      {
        title: 'Tier',
        dataIndex: 'tier',
        render: (value: string) => <Tag color={tierColorMap[value] || 'default'}>{value}</Tag>,
      },
      {
        title: '证据内容',
        dataIndex: 'content',
        width: '24%',
      },
      {
        title: '引用文本',
        render: (_, item) => <Text type="secondary">{item.citationText || '暂无引用文本'}</Text>,
      },
      {
        title: '来源链接',
        render: (_, item) =>
          item.sourceUrl ? (
            <Link href={item.sourceUrl} target="_blank">
              打开来源
            </Link>
          ) : (
            <Text type="secondary">暂无</Text>
          ),
      },
      {
        title: '复核状态',
        render: (_, item) => (
          <Tag color={reviewColorMap[item.reviewStatus] || 'default'}>
            {reviewLabelMap[item.reviewStatus]}
          </Tag>
        ),
      },
      {
        title: '复核操作',
        render: (_, item) => (
          <Space direction="vertical" size={8}>
            <Select
              size="small"
              style={{ width: 96 }}
              options={tierOptions}
              value={tierDrafts[item.id] || item.tier}
              disabled={actionLocked}
              onChange={(value) => onTierChange(item.id, value as TierLevel)}
            />
            <Space wrap size={4}>
              <Button
                size="small"
                type="primary"
                loading={submittingId === item.id}
                disabled={actionLocked}
                onClick={() => onReview(item, 'accepted')}
              >
                接受
              </Button>
              <Button
                size="small"
                loading={submittingId === item.id}
                disabled={actionLocked}
                onClick={() => onReview(item, 'downgraded')}
              >
                降权
              </Button>
              <Button
                size="small"
                danger
                loading={submittingId === item.id}
                disabled={actionLocked}
                onClick={() => onReview(item, 'rejected')}
              >
                拒绝
              </Button>
            </Space>
            {isRecomputing ? <Text type="secondary">重算进行中，操作已锁定</Text> : null}
          </Space>
        ),
      },
    ]}
  />
);
