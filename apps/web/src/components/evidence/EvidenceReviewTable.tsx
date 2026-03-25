import { Button, Card, Collapse, Empty, Select, Space, Tag, Typography } from 'antd';
import type { EvidenceItem, TierLevel } from '@users-research/shared';
import {
  getEvidenceAuthenticityKind,
  getEvidenceAuthenticityTag,
  getEvidenceSourceDomain,
} from '../../lib/evidenceMeta';

const { Link, Paragraph, Text } = Typography;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const sourceTypeLabelMap: Record<EvidenceItem['sourceType'], string> = {
  internal_metric: '内部指标',
  internal_report: '内部报告',
  interview: '访谈',
  survey: '问卷',
  prd: 'PRD',
  web_article: '网页文章',
  industry_report: '行业报告',
  historical_case: '历史案例',
  experience_model: '体验模型',
  vision_generated: 'Vision',
  persona_generated: 'Persona',
};

const sourceLevelLabelMap: Record<EvidenceItem['sourceLevel'], string> = {
  internal: '内部',
  external: '外部',
  simulated: '模拟',
  framework: '框架',
};

const reviewSortWeight: Record<EvidenceItem['reviewStatus'], number> = {
  unreviewed: 0,
  accepted: 1,
  downgraded: 2,
  rejected: 3,
};

const authenticitySortWeight = {
  reviewed_external: 0,
  fetched_article: 1,
  fetched_document: 1,
  search_result: 2,
  internal: 3,
  framework: 4,
  simulated: 5,
  unknown: 6,
} as const;

const buildPreview = (value: string, maxLength = 220) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '暂无内容';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
};

const sortEvidenceItems = (items: EvidenceItem[]) =>
  items.slice().sort((left, right) => {
    const reviewDiff = reviewSortWeight[left.reviewStatus] - reviewSortWeight[right.reviewStatus];
    if (reviewDiff !== 0) return reviewDiff;

    const leftAuthenticity = authenticitySortWeight[getEvidenceAuthenticityKind(left)];
    const rightAuthenticity = authenticitySortWeight[getEvidenceAuthenticityKind(right)];
    if (leftAuthenticity !== rightAuthenticity) return leftAuthenticity - rightAuthenticity;

    if (left.isUsedInReport !== right.isUsedInReport) {
      return left.isUsedInReport ? -1 : 1;
    }

    return (right.sourceDate || '').localeCompare(left.sourceDate || '');
  });

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
}: EvidenceReviewTableProps) => {
  if (!items.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有可复核的证据" />;
  }

  const sortedItems = sortEvidenceItems(items);

  const groupedSections = [
    {
      key: 'unreviewed',
      title: '待复核',
      description: '优先处理未复核条目，避免关键证据长期停留在待确认状态。',
      items: sortedItems.filter((item) => item.reviewStatus === 'unreviewed'),
    },
    {
      key: 'accepted',
      title: '已接受',
      description: '这些条目已经纳入当前证据判断，可继续微调 Tier 或复核理由。',
      items: sortedItems.filter((item) => item.reviewStatus === 'accepted'),
    },
    {
      key: 'downgraded',
      title: '已降权',
      description: '这类条目保留参考价值，但不应被当作强证据直接引用。',
      items: sortedItems.filter((item) => item.reviewStatus === 'downgraded'),
    },
    {
      key: 'rejected',
      title: '已拒绝',
      description: '已明确排除的条目，保留在这里供追溯与回看。',
      items: sortedItems.filter((item) => item.reviewStatus === 'rejected'),
    },
  ].filter((section) => section.items.length > 0);

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {groupedSections.map((section) => (
        <div key={section.key} className="evidence-review-section">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div className="evidence-review-section-header">
              <div style={{ minWidth: 0 }}>
                <Text strong style={{ fontSize: 15, display: 'block' }}>
                  {section.title}
                </Text>
                <Text type="secondary" className="content-wrap-safe">
                  {section.description}
                </Text>
              </div>
              <Tag color="blue" style={{ margin: 0 }}>
                {section.items.length} 条
              </Tag>
            </div>

            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {section.items.map((item) => {
                const authenticityTag = getEvidenceAuthenticityTag(item);
                const reviewMeta = asRecord(asRecord(item.traceLocation)?.reviewMeta);
                const reviewer = typeof reviewMeta?.reviewer === 'string' ? reviewMeta.reviewer : undefined;
                const comment = typeof reviewMeta?.comment === 'string' ? reviewMeta.comment : undefined;
                const nextTier = tierDrafts[item.id] || item.tier;
                const tierChanged = nextTier !== item.tier;
                const domain = getEvidenceSourceDomain(item);
                const detailItems = [
                  {
                    key: 'full-content',
                    label: '展开完整证据内容',
                    children: (
                      <Paragraph
                        className="content-wrap-safe content-wrap-safe-pre"
                        style={{ marginBottom: 0 }}
                      >
                        {item.content}
                      </Paragraph>
                    ),
                  },
                ];

                if (item.citationText) {
                  detailItems.push({
                    key: 'citation',
                    label: '查看引用文本',
                    children: (
                      <Paragraph
                        className="content-wrap-safe content-wrap-safe-pre"
                        style={{ marginBottom: 0 }}
                      >
                        {item.citationText}
                      </Paragraph>
                    ),
                  });
                }

                if (reviewer || comment) {
                  detailItems.push({
                    key: 'review-meta',
                    label: '查看复核记录',
                    children: (
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        {reviewer ? (
                          <Text className="content-wrap-safe">审核人：{reviewer}</Text>
                        ) : null}
                        {comment ? (
                          <Text className="content-wrap-safe content-wrap-safe-pre">
                            理由：{comment}
                          </Text>
                        ) : null}
                      </Space>
                    ),
                  });
                }

                return (
                  <Card key={item.id} size="small" className="evidence-review-card">
                    <Space direction="vertical" size={16} className="content-block-safe">
                      <div className="evidence-review-card-head">
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Text strong className="content-wrap-safe" style={{ fontSize: 15 }}>
                            {item.sourceName || '未命名来源'}
                          </Text>
                          <Text
                            type="secondary"
                            className="content-wrap-safe"
                            style={{ display: 'block', marginTop: 4 }}
                          >
                            {sourceTypeLabelMap[item.sourceType] || item.sourceType}
                            {' · '}
                            {sourceLevelLabelMap[item.sourceLevel] || item.sourceLevel}
                            {item.sourceDate ? ` · ${item.sourceDate}` : ''}
                          </Text>
                        </div>
                        <Space wrap className="evidence-review-card-tags">
                          <Tag color={authenticityTag.color}>{authenticityTag.label}</Tag>
                          <Tag color={tierColorMap[item.tier] || 'default'}>{item.tier}</Tag>
                          <Tag color={reviewColorMap[item.reviewStatus] || 'default'}>
                            {reviewLabelMap[item.reviewStatus]}
                          </Tag>
                          {tierChanged ? (
                            <Tag color="magenta">待调整至 {nextTier}</Tag>
                          ) : null}
                          {item.isUsedInReport ? <Tag color="cyan">已入报告</Tag> : null}
                        </Space>
                      </div>

                      <div className="evidence-review-card-layout">
                        <div className="content-block-safe">
                          <Text strong style={{ display: 'block', marginBottom: 6 }}>
                            证据摘要
                          </Text>
                          <Paragraph
                            className="content-wrap-safe content-wrap-safe-pre"
                            style={{ marginBottom: 0 }}
                          >
                            {buildPreview(item.content)}
                          </Paragraph>

                          {(item.citationText || detailItems.length > 1) ? (
                            <Collapse
                              size="small"
                              ghost
                              style={{ marginTop: 12 }}
                              items={detailItems}
                            />
                          ) : null}
                        </div>

                        <div className="evidence-review-card-side">
                          <Space direction="vertical" size={10} style={{ width: '100%' }}>
                            <div>
                              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                                来源信息
                              </Text>
                              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                <Text className="content-wrap-safe">
                                  域名：{domain || '未知域名'}
                                </Text>
                                <Text className="content-wrap-safe">
                                  链接：
                                  {item.sourceUrl ? (
                                    <>
                                      {' '}
                                      <Link href={item.sourceUrl} target="_blank">
                                        打开来源
                                      </Link>
                                    </>
                                  ) : (
                                    ' 暂无'
                                  )}
                                </Text>
                                {item.citationText ? (
                                  <Text type="secondary" className="content-wrap-safe">
                                    已附引用文本
                                  </Text>
                                ) : (
                                  <Text type="secondary">暂无引用文本</Text>
                                )}
                              </Space>
                            </div>

                            <div>
                              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                                复核操作
                              </Text>
                              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                <Select
                                  size="small"
                                  style={{ width: 120 }}
                                  options={tierOptions}
                                  value={nextTier}
                                  disabled={actionLocked}
                                  onChange={(value) => onTierChange(item.id, value as TierLevel)}
                                />
                                <Space wrap size={6}>
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
                                {isRecomputing ? (
                                  <Text type="secondary">重算进行中，操作已锁定</Text>
                                ) : null}
                              </Space>
                            </div>
                          </Space>
                        </div>
                      </div>
                    </Space>
                  </Card>
                );
              })}
            </Space>
          </Space>
        </div>
      ))}
    </Space>
  );
};
