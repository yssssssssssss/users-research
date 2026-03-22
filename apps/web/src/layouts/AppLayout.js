import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Layout, Menu } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { getPrimaryNavKey, isTaskDetailPath, PRIMARY_NAV_NEW_TASK, PRIMARY_NAV_TASK_HISTORY, TASK_HISTORY_PATH, TASK_NEW_PATH, } from '../lib/navigation';
const { Header, Sider, Content } = Layout;
const menuItems = [
    { key: PRIMARY_NAV_NEW_TASK, label: _jsx(Link, { to: TASK_NEW_PATH, children: "\u65B0\u5EFA\u4EFB\u52A1" }) },
    { key: PRIMARY_NAV_TASK_HISTORY, label: _jsx(Link, { to: TASK_HISTORY_PATH, children: "\u5386\u53F2\u4EFB\u52A1" }) },
];
export const AppLayout = () => {
    const location = useLocation();
    const selectedKey = getPrimaryNavKey(location.pathname);
    const headerTitle = selectedKey === PRIMARY_NAV_NEW_TASK
        ? '新建任务'
        : isTaskDetailPath(location.pathname)
            ? '任务详情'
            : '历史任务';
    return (_jsxs(Layout, { style: { minHeight: '100vh' }, children: [_jsxs(Sider, { width: 240, theme: "light", children: [_jsx("div", { style: { height: 64, padding: 20, fontWeight: 700 }, children: "AI \u7528\u7814\u5206\u6790\u7CFB\u7EDF" }), _jsx(Menu, { selectedKeys: [selectedKey], items: menuItems, mode: "inline" })] }), _jsxs(Layout, { children: [_jsx(Header, { style: { background: '#fff', padding: '0 24px', fontWeight: 600 }, children: headerTitle }), _jsx(Content, { style: { padding: 24 }, children: _jsx(Outlet, {}) })] })] }));
};
