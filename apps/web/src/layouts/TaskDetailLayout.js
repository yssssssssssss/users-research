import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, Card, Empty, Space, Tabs, Typography } from 'antd';
import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CurrentTaskSummaryBar } from '../components/CurrentTaskSummaryBar';
import { useTaskStore } from '../store/taskStore';
import { buildTaskDetailPath, getTaskDetailTabKey, TASK_DETAIL_SECTION_EXPERIENCE, TASK_DETAIL_SECTION_EVIDENCE, TASK_DETAIL_SECTION_OPS, TASK_DETAIL_SECTION_OVERVIEW, TASK_DETAIL_SECTION_PERSONA, TASK_DETAIL_SECTION_REPORT, TASK_DETAIL_SECTION_RESULT, TASK_DETAIL_SECTION_VISION, TASK_HISTORY_PATH, TASK_NEW_PATH, } from '../lib/navigation';
const { Title, Paragraph, Text } = Typography;
export const TaskDetailLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { taskId: routeTaskId } = useParams();
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const taskSummary = useTaskStore((state) => state.taskSummary);
    const setCurrentTaskId = useTaskStore((state) => state.setCurrentTaskId);
    const activeKey = getTaskDetailTabKey(location.pathname);
    const resolvedTaskId = routeTaskId || currentTaskId;
    useEffect(() => {
        if (!routeTaskId)
            return;
        if (routeTaskId === currentTaskId)
            return;
        setCurrentTaskId(routeTaskId);
    }, [currentTaskId, routeTaskId, setCurrentTaskId]);
    const tabItems = [
        { key: TASK_DETAIL_SECTION_OVERVIEW, label: '总览 / 输入解析' },
        { key: TASK_DETAIL_SECTION_EXPERIENCE, label: '体验模型' },
        { key: TASK_DETAIL_SECTION_EVIDENCE, label: '外部检索 / 证据' },
        { key: TASK_DETAIL_SECTION_VISION, label: '视觉评审' },
        { key: TASK_DETAIL_SECTION_PERSONA, label: '模拟用户' },
        { key: TASK_DETAIL_SECTION_RESULT, label: '综合结论' },
        { key: TASK_DETAIL_SECTION_REPORT, label: '正式报告' },
        { key: TASK_DETAIL_SECTION_OPS, label: '审核与观测' },
    ].map((item) => ({
        ...item,
        disabled: !resolvedTaskId,
    }));
    if (routeTaskId && currentTaskId !== routeTaskId) {
        return _jsx(Card, { loading: true, className: "page-card" });
    }
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsx("div", { children: _jsxs(Space, { wrap: true, style: { width: '100%', justifyContent: 'space-between' }, children: [_jsxs("div", { children: [_jsx(Title, { level: 2, children: "\u4EFB\u52A1\u8BE6\u60C5" }), _jsx(Paragraph, { children: "\u5F53\u524D\u8BE6\u60C5\u9875\u6309\u5206\u6790\u94FE\u8DEF\u5207\u5206\uFF1A\u5148\u770B\u8F93\u5165\u89E3\u6790\uFF0C\u518D\u5206\u522B\u67E5\u770B\u4F53\u9A8C\u6A21\u578B\u3001\u5916\u90E8\u68C0\u7D22\u3001\u89C6\u89C9\u8BC4\u5BA1\u3001\u6A21\u62DF\u7528\u6237\uFF0C\u6700\u540E\u6536\u53E3\u5230\u7EFC\u5408\u7ED3\u8BBA\u4E0E\u6B63\u5F0F\u62A5\u544A\u3002" })] }), _jsx(Button, { children: _jsx(Link, { to: TASK_HISTORY_PATH, children: "\u8FD4\u56DE\u5386\u53F2\u4EFB\u52A1" }) })] }) }), resolvedTaskId ? _jsx(CurrentTaskSummaryBar, { taskId: resolvedTaskId, taskSummary: taskSummary }) : null, _jsx(Tabs, { activeKey: activeKey, items: tabItems, onChange: (key) => {
                    if (!resolvedTaskId)
                        return;
                    navigate(buildTaskDetailPath(resolvedTaskId, key));
                } }), routeTaskId ? (_jsx(Outlet, {})) : (_jsxs(Card, { className: "page-card", children: [_jsx(Empty, { description: "\u5F53\u524D\u8FD8\u6CA1\u6709\u9009\u4E2D\u7684\u4EFB\u52A1\uFF0C\u8BF7\u5148\u53BB\u5386\u53F2\u4EFB\u52A1\u6062\u590D\uFF0C\u6216\u65B0\u5EFA\u4E00\u4E2A\u4EFB\u52A1\u3002", image: Empty.PRESENTED_IMAGE_SIMPLE, children: _jsxs(Space, { wrap: true, children: [_jsx(Button, { children: _jsx(Link, { to: TASK_HISTORY_PATH, children: "\u67E5\u770B\u5386\u53F2\u4EFB\u52A1" }) }), _jsx(Button, { type: "primary", children: _jsx(Link, { to: TASK_NEW_PATH, children: "\u65B0\u5EFA\u4EFB\u52A1" }) })] }) }), _jsx(Paragraph, { type: "secondary", style: { marginTop: 16, marginBottom: 0 }, children: _jsx(Text, { children: "\u4EFB\u52A1\u8BE6\u60C5\u5DF2\u7ECF\u6539\u4E3A\u663E\u5F0F URL\uFF1B\u8BF7\u5148\u4ECE\u5386\u53F2\u4EFB\u52A1\u8FDB\u5165\uFF0C\u6216\u65B0\u5EFA\u4E00\u4E2A\u4EFB\u52A1\uFF0C\u518D\u4F7F\u7528\u8FD9\u4E9B\u4E8C\u7EA7\u89C6\u56FE\u3002" }) })] }))] }));
};
