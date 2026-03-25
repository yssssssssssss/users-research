import { Alert, Card, Col, Descriptions, Empty, List, Row, Space, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import type { VisionResponse } from '@users-research/shared';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';

const { Title, Paragraph, Text } = Typography;

export const VisionLabPage = () => {
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const taskSummary = useTaskStore((state) => state.taskSummary);
  const taskState = useTaskStore((state) => state.taskState);
  const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
  const setTaskState = useTaskStore((state) => state.setTaskState);
  const [data, setData] = useState<VisionResponse>();

  const loadTaskContext = useCallback(async () => {
    if (!currentTaskId) return;
    const [summary, state, vision] = await Promise.all([
      api.getTask(currentTaskId),
      api.getTaskState(currentTaskId),
      api.getVision(currentTaskId),
    ]);
    setTaskSummary(summary);
    setTaskState(state);
    setData(vision);
  }, [currentTaskId, setTaskState, setTaskSummary]);

  useEffect(() => {
    if (!currentTaskId) return;
    void loadTaskContext();
  }, [currentTaskId, loadTaskContext]);

  if (!currentTaskId) return <Empty description="请先创建任务" />;

  const visualResult = taskState?.moduleResults?.visualReview;
  const warnings = visualResult?.warnings || [];
  const reviewerList = visualResult?.reviewers || [];
  const prioritizedActions = visualResult?.prioritizedActions || [];
  const confidenceNotes = visualResult?.confidenceNotes || [];
  const modelTags = reviewerList.length
    ? reviewerList.map((item) => item.actualModel || item.requestedModel || item.roleLabel)
    : data?.summary.models || [];

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Title level={2}>视觉评审</Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          这里对应视觉评审模块：看角色分工、共识、冲突，以及最高优先级视觉动作。
        </Paragraph>
      </div>
      <Alert type="warning" message="Vision 输出属于 AI 视觉评估，不等价于真实用户测试结果。" />

      {taskState?.analysisPlan?.visualReviewPlan ? (
        <Card title="本模块任务" className="page-card">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="任务">{taskState.analysisPlan.visualReviewPlan.task}</Descriptions.Item>
            <Descriptions.Item label="业务目标">{taskState.analysisPlan.visualReviewPlan.businessGoal}</Descriptions.Item>
            <Descriptions.Item label="评审维度">
              <Space wrap>
                {taskState.analysisPlan.visualReviewPlan.reviewDimensions.map((item) => <Tag key={item}>{item}</Tag>)}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="重点关注">
              <List
                size="small"
                dataSource={taskState.analysisPlan.visualReviewPlan.keyConcerns}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Descriptions.Item>
          </Descriptions>
        </Card>
      ) : null}

      <Card title="模型执行概览" className="page-card">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            {modelTags.map((model) => (
              <Tag color="blue" key={model}>{model}</Tag>
            ))}
          </Space>
          <Space wrap>
            <Tag color="green">共识 {data?.summary.consensusCount || 0}</Tag>
            <Tag color="orange">冲突 {data?.summary.conflictCount || 0}</Tag>
            {prioritizedActions[0] ? (
              <Tag color="purple">最高优先动作：{prioritizedActions[0]}</Tag>
            ) : null}
            {taskSummary?.currentNode ? <Tag>当前节点：{taskSummary.currentNode}</Tag> : null}
          </Space>
        </Space>
      </Card>

      {reviewerList.length ? (
        <Card title="角色评审明细" className="page-card">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {reviewerList.map((reviewer) => (
              <Card
                key={`${reviewer.role}-${reviewer.actualModel || reviewer.requestedModel || reviewer.roleLabel}`}
                type="inner"
                title={reviewer.roleLabel}
                extra={reviewer.overallScore !== undefined ? <Tag color="green">评分 {reviewer.overallScore}/10</Tag> : null}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap>
                    {reviewer.requestedModel ? <Tag>请求模型：{reviewer.requestedModel}</Tag> : null}
                    {reviewer.actualModel ? <Tag color="blue">实际模型：{reviewer.actualModel}</Tag> : null}
                    {reviewer.attemptedModels?.length ? <Tag>尝试链路：{reviewer.attemptedModels.join(' → ')}</Tag> : null}
                  </Space>

                  {reviewer.dimensions.length ? (
                    <div>
                      <Text strong>维度评审</Text>
                      <List
                        size="small"
                        dataSource={reviewer.dimensions}
                        renderItem={(item) => (
                          <List.Item>
                            <Space direction="vertical" size={4}>
                              <Space wrap>
                                <Text strong>{item.name}</Text>
                                {item.score !== undefined ? <Tag color="blue">{item.score}/10</Tag> : null}
                              </Space>
                              <span>{item.evidence}</span>
                              {item.suggestion ? <Text type="secondary">建议：{item.suggestion}</Text> : null}
                            </Space>
                          </List.Item>
                        )}
                      />
                    </div>
                  ) : null}

                  {reviewer.issues.length ? (
                    <div>
                      <Text strong>问题清单</Text>
                      <List
                        size="small"
                        dataSource={reviewer.issues}
                        renderItem={(item) => (
                          <List.Item>
                            <Space direction="vertical" size={4}>
                              <Tag color={item.severity === 'high' ? 'red' : item.severity === 'medium' ? 'orange' : 'blue'}>
                                {item.severity}
                              </Tag>
                              <span>{item.issue}</span>
                              {item.suggestion ? <Text type="secondary">建议：{item.suggestion}</Text> : null}
                            </Space>
                          </List.Item>
                        )}
                      />
                    </div>
                  ) : null}

                  {reviewer.topSuggestion ? <Alert type="info" showIcon message={`该角色最高优先建议：${reviewer.topSuggestion}`} /> : null}
                </Space>
              </Card>
            ))}
          </Space>
        </Card>
      ) : null}

      <Row gutter={16}>
        <Col span={12}>
          <Card title="共识问题" className="page-card">
            <List
              dataSource={data?.consensus || []}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical">
                    <Tag color={item.riskLevel === 'high' ? 'red' : item.riskLevel === 'medium' ? 'orange' : 'blue'}>{item.findingType}</Tag>
                    <span>{item.content}</span>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="冲突主题" className="page-card">
            <List
              dataSource={data?.conflicts || []}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <strong>{item.topic}</strong>
                    {item.items.map((child) => (
                      <Card key={`${item.topic}-${child.model}-${child.content}`} size="small">
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <Space wrap>
                            <Tag color="purple">{child.model}</Tag>
                            {child.requestedModel ? <Tag>请求模型：{child.requestedModel}</Tag> : null}
                            {child.actualModel ? (
                              <Tag color={child.actualModel === child.requestedModel ? 'green' : 'orange'}>
                                实际模型：{child.actualModel}
                              </Tag>
                            ) : null}
                          </Space>
                          {child.attemptedModels?.length ? (
                            <span>尝试链路：{child.attemptedModels.join(' → ')}</span>
                          ) : null}
                          <span>{child.content}</span>
                          {child.warnings?.length ? (
                            <Alert
                              type="warning"
                              showIcon={false}
                              message={child.warnings.join('；')}
                            />
                          ) : null}
                        </Space>
                      </Card>
                    ))}
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {confidenceNotes.length ? (
        <Card title="可信度与边界" className="page-card">
          <List size="small" dataSource={confidenceNotes} renderItem={(item) => <List.Item>{item}</List.Item>} />
        </Card>
      ) : null}

      {warnings.length ? (
        <Alert
          type="warning"
          showIcon
          message="视觉评审提醒"
          description={
            <List
              size="small"
              dataSource={warnings}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          }
        />
      ) : null}
    </Space>
  );
};
