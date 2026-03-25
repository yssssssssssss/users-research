import type { ReactNode } from 'react';
import { Alert, Card, Descriptions, Empty, List, Space, Tag, Typography } from 'antd';
import type { CandidateOutput } from '@users-research/shared';
import type { ProvenanceTag } from '../lib/provenance';

const { Paragraph, Text } = Typography;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const asFindings = (
  value: unknown,
): Array<{
  personaName?: string;
  theme?: string;
  stance?: string;
  findingType?: string;
  riskLevel?: string;
  content?: string;
  isConsensus?: boolean;
  isConflict?: boolean;
}> =>
  Array.isArray(value)
    ? value
        .map((item) => asRecord(item))
        .filter(Boolean)
        .map((item) => ({
          personaName: typeof item?.personaName === 'string' ? item.personaName : undefined,
          theme: typeof item?.theme === 'string' ? item.theme : undefined,
          stance: typeof item?.stance === 'string' ? item.stance : undefined,
          findingType: typeof item?.findingType === 'string' ? item.findingType : undefined,
          riskLevel: typeof item?.riskLevel === 'string' ? item.riskLevel : undefined,
          content: typeof item?.content === 'string' ? item.content : undefined,
          isConsensus: typeof item?.isConsensus === 'boolean' ? item.isConsensus : undefined,
          isConflict: typeof item?.isConflict === 'boolean' ? item.isConflict : undefined,
        }))
    : [];

const asJudgments = (
  value: unknown,
): Array<{ title?: string; content?: string; confidence?: string; risk?: string }> =>
  Array.isArray(value)
    ? value
        .map((item) => asRecord(item))
        .filter(Boolean)
        .map((item) => ({
          title: typeof item?.title === 'string' ? item.title : undefined,
          content: typeof item?.content === 'string' ? item.content : undefined,
          confidence: typeof item?.confidence === 'string' ? item.confidence : undefined,
          risk: typeof item?.risk === 'string' ? item.risk : undefined,
        }))
    : [];

const gateColorMap: Record<string, string> = {
  allowed: 'green',
  review_required: 'orange',
  blocked_by_rq: 'red',
};

const statusColorMap: Record<string, string> = {
  selected: 'blue',
  generated: 'default',
  gated_out: 'red',
  discarded: 'default',
};

interface OutputPreviewCardProps {
  output: CandidateOutput;
  extra?: ReactNode;
  provenanceTags?: ProvenanceTag[];
  fallbackWarnings?: string[];
}

export const OutputPreviewCard = ({
  output,
  extra,
  provenanceTags,
  fallbackWarnings,
}: OutputPreviewCardProps) => {
  const content = asRecord(output.contentJson);
  const judgments = asJudgments(content?.judgments);
  const nextActions = asStringArray(content?.nextActions);
  const findings = asFindings(content?.findings);
  const reviewNotes = asStringArray(content?.reviewNotes);

  return (
    <Card className="page-card" title={output.outputType} extra={extra}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space wrap>
          <Tag color={gateColorMap[output.gateLevel || 'review_required'] || 'default'}>
            门禁：{output.gateLevel || '未标注'}
          </Tag>
          <Tag color={statusColorMap[output.status] || 'default'}>
            状态：{output.status}
          </Tag>
          <Tag>节点：{output.sourceNode}</Tag>
          {typeof content?.kind === 'string' ? <Tag>类型：{content.kind}</Tag> : null}
        </Space>

        {output.summary ? <Paragraph style={{ marginBottom: 0 }}>{output.summary}</Paragraph> : null}

        {fallbackWarnings?.length ? (
          <Alert
            type="warning"
            showIcon
            message="检测到 fallback / mock / 弱视觉推断信号"
            description={fallbackWarnings.slice(0, 3).join('；')}
          />
        ) : null}

        {provenanceTags?.length ? (
          <div>
            <Text strong>真实性边界</Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                {provenanceTags.map((item) => (
                  <Tag key={item.key} color={item.color}>
                    {item.label}
                  </Tag>
                ))}
              </Space>
            </div>
          </div>
        ) : null}

        {output.gateNotes?.length ? (
          <div>
            <Text strong>Gate 说明</Text>
            <List
              size="small"
              dataSource={output.gateNotes}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </div>
        ) : null}

        {reviewNotes.length > 0 ? (
          <div>
            <Text strong>多模型复核意见</Text>
            <List
              size="small"
              dataSource={reviewNotes}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </div>
        ) : null}

        {judgments.length > 0 ? (
          <List
            size="small"
            dataSource={judgments}
            renderItem={(item, index) => (
              <List.Item>
                <Descriptions size="small" column={1} title={`判断 ${index + 1}`}>
                  <Descriptions.Item label="标题">{item.title || '未命名判断'}</Descriptions.Item>
                  <Descriptions.Item label="内容">{item.content || '暂无内容'}</Descriptions.Item>
                  {item.confidence ? (
                    <Descriptions.Item label="置信度">{item.confidence}</Descriptions.Item>
                  ) : null}
                  {item.risk ? <Descriptions.Item label="风险">{item.risk}</Descriptions.Item> : null}
                </Descriptions>
              </List.Item>
            )}
          />
        ) : null}

        {nextActions.length > 0 ? (
          <div>
            <Text strong>建议动作</Text>
            <List
              size="small"
              dataSource={nextActions}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </div>
        ) : null}

        {findings.length > 0 ? (
          <List
            size="small"
            dataSource={findings}
            renderItem={(item) => (
              <List.Item>
                <Space direction="vertical" size={4}>
                  <Space wrap>
                    {item.personaName ? <Tag color="purple">{item.personaName}</Tag> : null}
                    {item.theme ? <Tag>{item.theme}</Tag> : null}
                    {item.stance ? <Tag color="blue">{item.stance}</Tag> : null}
                    {item.findingType ? <Tag>{item.findingType}</Tag> : null}
                    {item.riskLevel ? <Tag color={item.riskLevel === 'high' ? 'red' : item.riskLevel === 'medium' ? 'orange' : 'blue'}>{item.riskLevel}</Tag> : null}
                    {item.isConsensus ? <Tag color="green">共识</Tag> : null}
                    {item.isConflict ? <Tag color="gold">分歧</Tag> : null}
                  </Space>
                  <span>{item.content || '暂无内容'}</span>
                </Space>
              </List.Item>
            )}
          />
        ) : null}

        {!judgments.length && !nextActions.length && !findings.length && !reviewNotes.length ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前输出暂未提供可结构化预览内容"
          />
        ) : null}
      </Space>
    </Card>
  );
};
