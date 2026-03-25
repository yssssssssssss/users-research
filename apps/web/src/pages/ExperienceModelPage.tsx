import { Alert, Card, Descriptions, Empty, List, Space, Tag, Typography } from 'antd';
import { useCallback, useEffect } from 'react';
import { ExperienceModelPanel } from '../components/ExperienceModelPanel';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';

const { Title, Paragraph, Text } = Typography;

export const ExperienceModelPage = () => {
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const taskSummary = useTaskStore((state) => state.taskSummary);
  const taskState = useTaskStore((state) => state.taskState);
  const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
  const setTaskState = useTaskStore((state) => state.setTaskState);

  const loadTaskContext = useCallback(async () => {
    if (!currentTaskId) return;
    const [summary, state] = await Promise.all([
      api.getTask(currentTaskId),
      api.getTaskState(currentTaskId),
    ]);
    setTaskSummary(summary);
    setTaskState(state);
  }, [currentTaskId, setTaskState, setTaskSummary]);

  useEffect(() => {
    if (!currentTaskId) return;
    if (taskState) return;
    void loadTaskContext();
  }, [currentTaskId, loadTaskContext, taskState]);

  if (!currentTaskId) return <Empty description="请先创建任务" />;

  const plan = taskState?.analysisPlan?.experienceModelPlan;
  const result = taskState?.moduleResults?.experienceModel;

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Title level={2}>体验模型</Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          这个板块只回答一件事：系统选了哪些体验模型，用什么维度评估，以及产出了什么结构化判断。
        </Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        message="任务定义"
        description="体验模型是方法论分析层，用来补充评估框架与追问方向，不直接等于真实用户证据。"
      />

      {plan ? (
        <Card className="page-card" title="本模块任务">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="任务">{plan.task}</Descriptions.Item>
            <Descriptions.Item label="关注维度">
              <Space wrap>
                {plan.focusDimensions.map((item) => <Tag key={item}>{item}</Tag>)}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="优先模型">
              <Space wrap>
                {plan.preferredModelIds.map((item) => <Tag color="blue" key={item}>{item}</Tag>)}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="核心问题">
              <List
                size="small"
                dataSource={plan.evaluationQuestions}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Descriptions.Item>
          </Descriptions>
        </Card>
      ) : null}

      <ExperienceModelPanel
        taskId={currentTaskId}
        evidencePool={taskState?.evidencePool}
        currentNode={taskSummary?.currentNode || taskState?.currentNode}
        onTaskUpdated={(summary, state) => {
          setTaskSummary(summary);
          setTaskState(state);
        }}
      />

      <Card className="page-card" title="结构化评估结果">
        {result?.evaluations?.length ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {result.evaluations.map((evaluation) => (
              <Card
                key={`${evaluation.modelId}-${evaluation.modelName}`}
                type="inner"
                title={evaluation.modelName}
                extra={evaluation.overallScore !== undefined ? <Tag color="green">总分 {evaluation.overallScore}/10</Tag> : null}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Paragraph style={{ marginBottom: 0 }}>
                    <Text strong>适配性：</Text>{evaluation.suitability}
                  </Paragraph>

                  {evaluation.dimensions.length ? (
                    <div>
                      <Text strong>维度评估</Text>
                      <List
                        style={{ marginTop: 8 }}
                        itemLayout="vertical"
                        dataSource={evaluation.dimensions}
                        renderItem={(dimension) => (
                          <List.Item key={dimension.name}>
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                              <Space wrap>
                                <Text strong>{dimension.name}</Text>
                                {dimension.score !== undefined ? <Tag color="blue">{dimension.score}/10</Tag> : null}
                              </Space>
                              <span>{dimension.observation}</span>
                              {dimension.rationale ? <Text type="secondary">依据：{dimension.rationale}</Text> : null}
                              {dimension.suggestion ? <Text type="secondary">建议：{dimension.suggestion}</Text> : null}
                            </Space>
                          </List.Item>
                        )}
                      />
                    </div>
                  ) : null}

                  {evaluation.strengths.length ? (
                    <div>
                      <Text strong>优势</Text>
                      <List size="small" dataSource={evaluation.strengths} renderItem={(item) => <List.Item>{item}</List.Item>} />
                    </div>
                  ) : null}

                  {evaluation.risks.length ? (
                    <div>
                      <Text strong>风险</Text>
                      <List size="small" dataSource={evaluation.risks} renderItem={(item) => <List.Item>{item}</List.Item>} />
                    </div>
                  ) : null}

                  {evaluation.followupQuestions.length ? (
                    <div>
                      <Text strong>建议追问</Text>
                      <List size="small" dataSource={evaluation.followupQuestions} renderItem={(item) => <List.Item>{item}</List.Item>} />
                    </div>
                  ) : null}

                  {evaluation.topPriorityFix ? (
                    <Alert type="warning" showIcon message={`最高优先动作：${evaluation.topPriorityFix}`} />
                  ) : null}

                  {evaluation.limitations.length ? (
                    <Alert type="info" showIcon message={`边界：${evaluation.limitations.join('；')}`} />
                  ) : null}
                </Space>
              </Card>
            ))}
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前还没有结构化体验模型结果" />
        )}
      </Card>
    </Space>
  );
};
