import { Card, Space, Spin, Typography } from 'antd';

const { Text } = Typography;

export const RouteLoading = () => (
  <Card className="page-card">
    <Space direction="vertical" align="center" size={12} style={{ width: '100%', padding: '24px 0' }}>
      <Spin size="large" />
      <Text type="secondary">页面加载中…</Text>
    </Space>
  </Card>
);
