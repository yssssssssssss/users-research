import { Alert, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';
import type { PersonaResponse } from '@users-research/shared';

const { Title, Paragraph } = Typography;

const stanceColorMap: Record<string, string> = {
  support: 'green',
  oppose: 'red',
  hesitate: 'orange',
  confused: 'gold',
  mixed: 'blue',
};

export const PersonaLabPage = () => {
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const [data, setData] = useState<PersonaResponse>();

  useEffect(() => {
    if (!currentTaskId) return;
    api.getPersona(currentTaskId).then(setData);
  }, [currentTaskId]);

  if (!currentTaskId) return <Empty description="请先创建任务" />;

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Title level={2}>Persona Lab</Title>
      <Alert type="warning" message={data?.notice || '以下内容为模拟生成，不代表真实用户证据。'} />

      <Row gutter={16}>
        <Col span={8}>
          <Card><Statistic title="Persona 数量" value={data?.summary.personaCount || 0} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="主题簇数量" value={data?.summary.clusterCount || 0} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="模拟性质" value={data?.summary.simulated ? '是' : '否'} /></Card>
        </Col>
      </Row>

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
    </Space>
  );
};
