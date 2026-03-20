import { Layout, Menu } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/', label: <Link to="/">新建任务</Link> },
  { key: '/workbench', label: <Link to="/workbench">任务工作台</Link> },
  { key: '/evidence', label: <Link to="/evidence">证据看板</Link> },
  { key: '/vision', label: <Link to="/vision">Vision Lab</Link> },
  { key: '/persona', label: <Link to="/persona">Persona Lab</Link> },
  { key: '/report', label: <Link to="/report">综合报告</Link> },
  { key: '/result', label: <Link to="/result">结果总览</Link> },
  { key: '/ops', label: <Link to="/ops">审核与观测</Link> },
];

export const AppLayout = () => {
  const location = useLocation();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={240} theme="light">
        <div style={{ height: 64, padding: 20, fontWeight: 700 }}>AI 用研分析系统</div>
        <Menu selectedKeys={[location.pathname]} items={menuItems} mode="inline" />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', fontWeight: 600 }}>
          研究工作台
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};
