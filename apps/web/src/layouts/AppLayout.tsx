import { Layout, Menu } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  getPrimaryNavKey,
  isTaskDetailPath,
  PRIMARY_NAV_NEW_TASK,
  PRIMARY_NAV_TASK_HISTORY,
  TASK_HISTORY_PATH,
  TASK_NEW_PATH,
} from '../lib/navigation';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: PRIMARY_NAV_NEW_TASK, label: <Link to={TASK_NEW_PATH}>新建任务</Link> },
  { key: PRIMARY_NAV_TASK_HISTORY, label: <Link to={TASK_HISTORY_PATH}>历史任务</Link> },
];

export const AppLayout = () => {
  const location = useLocation();
  const selectedKey = getPrimaryNavKey(location.pathname);
  const headerTitle = selectedKey === PRIMARY_NAV_NEW_TASK
    ? '新建任务'
    : isTaskDetailPath(location.pathname)
      ? '任务详情'
      : '历史任务';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={240} theme="light">
        <div style={{ height: 64, padding: 20, fontWeight: 700 }}>AI 用研分析系统</div>
        <Menu selectedKeys={[selectedKey]} items={menuItems} mode="inline" />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', fontWeight: 600 }}>
          {headerTitle}
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};
