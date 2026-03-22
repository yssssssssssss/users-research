import { Alert, Card, Col, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import type { ProvenanceSummary } from '../lib/provenance';

const { Paragraph, Text } = Typography;

interface ProvenanceSummaryCardProps {
  summary: ProvenanceSummary;
}

export const ProvenanceSummaryCard = ({ summary }: ProvenanceSummaryCardProps) => (
  <Space direction="vertical" size={12} style={{ width: '100%' }}>
    {summary.riskLevel === 'fallback' ? (
      <Alert
        type="warning"
        showIcon
        message="当前结果包含 fallback / mock / 弱视觉推断信号"
        description={summary.fallbackWarnings.slice(0, 3).join('；')}
      />
    ) : null}

    {summary.riskLevel === 'mixed' ? (
      <Alert
        type="info"
        showIcon
        message="当前结果混合了真实证据、框架视角与模拟线索"
        description="体验模型、Vision、Persona 只能作为辅助判断，不能伪装成 T1 真实事实。"
      />
    ) : null}

    <Card title="真实性边界" className="page-card">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          绿色代表已接受的真实证据基础；金色/紫色/红色分别代表框架证据、模拟线索和回退风险。
        </Paragraph>

        <Row gutter={[12, 12]}>
          <Col xs={12} md={8} xl={4}>
            <Card size="small">
              <Statistic title="真实证据" value={summary.acceptedRealEvidenceCount} />
            </Card>
          </Col>
          <Col xs={12} md={8} xl={4}>
            <Card size="small">
              <Statistic title="T1 真实" value={summary.acceptedRealT1EvidenceCount} />
            </Card>
          </Col>
          <Col xs={12} md={8} xl={4}>
            <Card size="small">
              <Statistic title="外部待核查" value={summary.pendingExternalEvidenceCount} />
            </Card>
          </Col>
          <Col xs={12} md={8} xl={4}>
            <Card size="small">
              <Statistic title="框架证据" value={summary.frameworkEvidenceCount} />
            </Card>
          </Col>
          <Col xs={12} md={8} xl={4}>
            <Card size="small">
              <Statistic title="模拟线索" value={Math.max(summary.simulatedEvidenceCount, summary.personaFindingCount)} />
            </Card>
          </Col>
          <Col xs={12} md={8} xl={4}>
            <Card size="small">
              <Statistic title="fallback 警告" value={summary.fallbackWarnings.length} />
            </Card>
          </Col>
        </Row>

        {summary.tags.length ? (
          <Space wrap>
            {summary.tags.map((item) => (
              <Tag key={item.key} color={item.color}>
                {item.label}
              </Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">当前未识别到额外的真实性边界标签。</Text>
        )}

        {summary.boundaryNotes.length ? (
          <div>
            <Text strong>边界说明</Text>
            <List
              size="small"
              dataSource={summary.boundaryNotes.slice(0, 5)}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </div>
        ) : null}
      </Space>
    </Card>
  </Space>
);
