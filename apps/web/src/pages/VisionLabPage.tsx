import { Alert, Card, Col, Empty, List, Row, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { VisionResponse } from '@users-research/shared';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';

const { Title } = Typography;

export const VisionLabPage = () => {
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const [data, setData] = useState<VisionResponse>();

  useEffect(() => {
    if (!currentTaskId) return;
    api.getVision(currentTaskId).then(setData);
  }, [currentTaskId]);

  if (!currentTaskId) return <Empty description="请先创建任务" />;

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Title level={2}>Vision Lab</Title>
      <Alert type="warning" message="Vision 输出属于 AI 视觉评估，不等价于真实用户测试结果。" />

      <Card title="模型执行概览" className="page-card">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            {(data?.summary.models || []).map((model) => (
              <Tag color="blue" key={model}>{model}</Tag>
            ))}
          </Space>
          <Space wrap>
            <Tag color="green">共识 {data?.summary.consensusCount || 0}</Tag>
            <Tag color="orange">冲突 {data?.summary.conflictCount || 0}</Tag>
          </Space>
        </Space>
      </Card>

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
    </Space>
  );
};
