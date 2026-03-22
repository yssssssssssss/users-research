import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Space, Tabs, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getTaskCenterTabKey, TASK_CENTER_HISTORY_PATH, TASK_CENTER_NEW_PATH } from '../lib/navigation';
const { Title, Paragraph } = Typography;
export const TaskCenterLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const activeKey = getTaskCenterTabKey(location.pathname);
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Title, { level: 2, children: "\u4EFB\u52A1\u4E2D\u5FC3" }), _jsx(Paragraph, { children: "\u5C06\u201C\u5386\u53F2\u4EFB\u52A1\u201D\u548C\u201C\u65B0\u5EFA\u4EFB\u52A1\u201D\u62C6\u5F00\uFF1A\u4E00\u4E2A\u8D1F\u8D23\u6062\u590D\u4E0A\u4E0B\u6587\uFF0C\u4E00\u4E2A\u8D1F\u8D23\u53D1\u8D77\u65B0\u5206\u6790\uFF0C\u907F\u514D\u5165\u53E3\u8BED\u4E49\u6DF7\u6742\u3002" })] }), _jsx(Tabs, { activeKey: activeKey, items: [
                    { key: TASK_CENTER_HISTORY_PATH, label: '历史任务' },
                    { key: TASK_CENTER_NEW_PATH, label: '新建任务' },
                ], onChange: (key) => navigate(key) }), _jsx(Outlet, {})] }));
};
