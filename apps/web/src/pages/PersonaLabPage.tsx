import { Alert, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';
import type { PersonaResponse } from '@users-research/shared';

const { Title, Paragraph, Text } = Typography;

const stanceColorMap: Record<string, string> = {
  support: 'green',
  oppose: 'red',
  hesitate: 'orange',
  confused: 'gold',
  mixed: 'blue',
};

export const PersonaLabPage = () => {
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const taskSummary = useTaskStore((state) => state.taskSummary);
  const taskState = useTaskStore((state) => state.taskState);
  const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
  const setTaskState = useTaskStore((state) => state.setTaskState);
  const [data, setData] = useState<PersonaResponse>();

  const loadTaskContext = useCallback(async () => {
    if (!currentTaskId) return;
    const [summary, state, persona] = await Promise.all([
      api.getTask(currentTaskId),
      api.getTaskState(currentTaskId),
      api.getPersona(currentTaskId),
    ]);
    setTaskSummary(summary);
    setTaskState(state);
    setData(persona);
  }, [currentTaskId, setTaskState, setTaskSummary]);

  useEffect(() => {
    if (!currentTaskId) return;
    void loadTaskContext();
  }, [currentTaskId, loadTaskContext]);

  if (!currentTaskId) return <Empty description="请先创建任务" />;

  const personaResult = taskState?.moduleResults?.personaSimulation;
  const digitalPersonas = personaResult?.digitalPersonas || [];
  const reviews = personaResult?.reviews || [];
  const warnings = personaResult?.warnings || [];
  const aggregate = personaResult?.aggregate;

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Title level={2}>模拟用户</Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          这里对应模拟用户模块：看用了哪些人群原型、数字人怎么打分、共性痛点和分歧在哪里。
        </Paragraph>
      </div>
      <Alert type="warning" message={data?.notice || '以下内容为模拟生成，不代表真实用户证据。'} />

      {taskState?.analysisPlan?.personaSimulationPlan ? (
        <Card className="page-card" title="本模块任务">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Paragraph style={{ marginBottom: 0 }}>{taskState.analysisPlan.personaSimulationPlan.task}</Paragraph>
            <div>
              <Tag color="blue">目标人群</Tag>
              <Space wrap style={{ marginTop: 8 }}>
                {taskState.analysisPlan.personaSimulationPlan.personaTypes.map((item) => <Tag key={item}>{item}</Tag>)}
              </Space>
            </div>
            <div>
              <Tag color="purple">评分维度</Tag>
              <Space wrap style={{ marginTop: 8 }}>
                {taskState.analysisPlan.personaSimulationPlan.ratingDimensions.map((item) => <Tag key={item}>{item}</Tag>)}
              </Space>
            </div>
            {taskState.moduleResults?.personaSimulation?.aggregate.sharedPainPoints?.length ? (
              <div>
                <Paragraph strong style={{ marginBottom: 8 }}>共性痛点</Paragraph>
                <List
                  size="small"
                  dataSource={taskState.moduleResults.personaSimulation.aggregate.sharedPainPoints}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              </div>
            ) : null}
          </Space>
        </Card>
      ) : null}

      <Row gutter={16}>
        <Col span={8}>
          <Card><Statistic title="Persona 数量" value={reviews.length || data?.summary.personaCount || 0} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="主题簇数量" value={aggregate?.divergences.length || data?.summary.clusterCount || 0} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="当前节点" value={taskSummary?.currentNode || taskState?.currentNode || '未开始'} /></Card>
        </Col>
      </Row>

      {digitalPersonas.length ? (
        <Card className="page-card" title="数字人画像">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {digitalPersonas.map((persona) => (
              <Card key={persona.profileId} type="inner" title={persona.personaName}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Paragraph style={{ marginBottom: 0 }}>{persona.description}</Paragraph>
                  {persona.usageScenario ? <Text type="secondary">使用场景：{persona.usageScenario}</Text> : null}
                  {persona.concerns.length ? (
                    <div>
                      <Text strong>顾虑</Text>
                      <List size="small" dataSource={persona.concerns} renderItem={(item) => <List.Item>{item}</List.Item>} />
                    </div>
                  ) : null}
                  {persona.motivations.length ? (
                    <div>
                      <Text strong>动机</Text>
                      <List size="small" dataSource={persona.motivations} renderItem={(item) => <List.Item>{item}</List.Item>} />
                    </div>
                  ) : null}
                </Space>
              </Card>
            ))}
          </Space>
        </Card>
      ) : null}

      {reviews.length ? (
        <Card className="page-card" title="模拟评论与评分">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {reviews.map((review) => (
              <Card
                key={`${review.profileId}-${review.personaName}`}
                type="inner"
                title={review.personaName}
                extra={<Tag color={stanceColorMap[review.stance || 'mixed'] || 'default'}>{review.stance || 'mixed'}</Tag>}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Paragraph style={{ marginBottom: 0 }}>
                    <Text strong>第一印象：</Text>{review.firstImpression}
                  </Paragraph>
                  <Paragraph style={{ marginBottom: 0 }}>
                    <Text strong>详细体验：</Text>{review.detailedExperience}
                  </Paragraph>
                  {review.overallScore !== undefined ? <Tag color="green">总体评分 {review.overallScore}/10</Tag> : null}
                  <Space wrap>
                    {Object.entries(review.scores || {}).map(([key, value]) =>
                      value !== undefined ? <Tag key={key}>{key}: {value}</Tag> : null)}
                  </Space>
                  {review.quoteToFriend ? <Alert type="success" showIcon message={`会对朋友说：${review.quoteToFriend}`} /> : null}
                  {review.topChangeRequest ? <Alert type="warning" showIcon message={`最想改的点：${review.topChangeRequest}`} /> : null}
                </Space>
              </Card>
            ))}
          </Space>
        </Card>
      ) : null}

      <Card className="page-card">
        <List
          dataSource={data?.clusters || []}
          renderItem={(cluster) => (
            <List.Item>
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <div>
                  <Tag color="purple">{cluster.theme}</Tag>
                  <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                    该主题下共 {cluster.items.length} 条模拟观点。
                  </Paragraph>
                </div>
                {cluster.items.map((item) => (
                  <Card
                    key={item.id}
                    type="inner"
                    title={`${item.personaName} / ${item.stance || 'mixed'}`}
                    extra={<Tag color={stanceColorMap[item.stance || 'mixed'] || 'default'}>{item.stance || 'mixed'}</Tag>}
                  >
                    {item.content}
                  </Card>
                ))}
              </Space>
            </List.Item>
          )}
        />
      </Card>

      {aggregate?.sharedHighlights?.length || aggregate?.churnRisks?.length ? (
        <Row gutter={16}>
          <Col span={12}>
            <Card className="page-card" title="共性亮点">
              <List
                size="small"
                dataSource={aggregate?.sharedHighlights || []}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card className="page-card" title="流失风险">
              <List
                size="small"
                dataSource={aggregate?.churnRisks || []}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Card>
          </Col>
        </Row>
      ) : null}

      {warnings.length ? (
        <Alert
          type="warning"
          showIcon
          message="模拟用户提醒"
          description={<List size="small" dataSource={warnings} renderItem={(item) => <List.Item>{item}</List.Item>} />}
        />
      ) : null}
    </Space>
  );
};
