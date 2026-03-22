import { Card, Col, Empty, List, Row, Space, Tag, Typography } from 'antd';
import type { EvidenceItem, PersonaFinding, VisionFinding } from '@users-research/shared';

const { Paragraph, Text } = Typography;

interface ExperienceModelView {
  id: string;
  name: string;
  content: string;
  dimensions: string[];
  reasons: string[];
  questions: string[];
  mode: string;
}

interface ResultDetailPanelsProps {
  experienceModels: ExperienceModelView[];
  evidenceHighlights: EvidenceItem[];
  sourceTypeLabelMap: Record<string, string>;
  visionHighlights: VisionFinding[];
  personaHighlights: PersonaFinding[];
  nextActions: string[];
  boundaryNotes: string[];
}

export const ResultDetailPanels = ({
  experienceModels,
  evidenceHighlights,
  sourceTypeLabelMap,
  visionHighlights,
  personaHighlights,
  nextActions,
  boundaryNotes,
}: ResultDetailPanelsProps) => (
  <>
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
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该任务尚未产出体验模型视角" />
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
                    <Paragraph style={{ marginBottom: 0 }}>{item.content}</Paragraph>
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
  </>
);
