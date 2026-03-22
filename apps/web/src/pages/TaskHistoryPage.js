import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, Button, Card, Empty, Space, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { TASK_DETAIL_OVERVIEW_PATH, TASK_DETAIL_REPORT_PATH, TASK_DETAIL_RESULT_PATH, } from '../lib/navigation';
import { useTaskStore } from '../store/taskStore';
const { Paragraph, Text } = Typography;
export const TaskHistoryPage = () => {
    const navigate = useNavigate();
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const setCurrentTaskId = useTaskStore((state) => state.setCurrentTaskId);
    const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
    const [recentTasks, setRecentTasks] = useState([]);
    const [recentLoading, setRecentLoading] = useState(false);
    const [recentError, setRecentError] = useState();
    const shouldPollRecentTasks = useMemo(() => recentTasks.some((task) => ['draft', 'queued', 'running'].includes(task.status)), [recentTasks]);
    const loadRecentTasks = useCallback(async (silent = false) => {
        if (!silent) {
            setRecentLoading(true);
        }
        try {
            const response = await api.listTasks(12);
            setRecentTasks(response.items);
            setRecentError(undefined);
        }
        catch (error) {
            const nextError = error instanceof Error ? error.message : '加载历史任务失败';
            setRecentError(nextError);
            if (!silent)
                message.error(nextError);
        }
        finally {
            if (!silent) {
                setRecentLoading(false);
            }
        }
    }, []);
    useEffect(() => {
        void loadRecentTasks(true);
    }, [loadRecentTasks]);
    useEffect(() => {
        if (!shouldPollRecentTasks) {
            return undefined;
        }
        const timer = window.setInterval(() => {
            if (document.visibilityState !== 'visible') {
                return;
            }
            void loadRecentTasks(true);
        }, 15000);
        return () => window.clearInterval(timer);
    }, [loadRecentTasks, shouldPollRecentTasks]);
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void loadRecentTasks(true);
            }
        };
        window.addEventListener('focus', handleVisibilityChange);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('focus', handleVisibilityChange);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [loadRecentTasks]);
    const openTask = useCallback((taskId, route, summary) => {
        setCurrentTaskId(taskId);
        if (summary)
            setTaskSummary(summary);
        navigate(route);
    }, [navigate, setCurrentTaskId, setTaskSummary]);
    return (_jsxs(Card, { className: "page-card", title: "\u5386\u53F2\u4EFB\u52A1", extra: (_jsxs(Space, { children: [currentTaskId ? (_jsx(Button, { type: "link", onClick: () => openTask(currentTaskId, TASK_DETAIL_OVERVIEW_PATH(currentTaskId)), children: "\u7EE7\u7EED\u4E0A\u6B21\u67E5\u770B" })) : null, _jsx(Button, { onClick: () => void loadRecentTasks(), children: "\u5237\u65B0" })] })), loading: recentLoading, children: [recentError ? (_jsx(Alert, { type: "warning", showIcon: true, style: { marginBottom: 16 }, message: "\u5386\u53F2\u4EFB\u52A1\u52A0\u8F7D\u5931\u8D25", description: recentError })) : null, recentTasks.length ? (_jsx(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: recentTasks.map((task) => (_jsx(Card, { type: "inner", size: "small", children: _jsxs(Space, { direction: "vertical", size: 8, style: { width: '100%' }, children: [_jsxs(Space, { wrap: true, children: [_jsx(Text, { strong: true, children: task.title || '未命名任务' }), _jsx(Tag, { color: "blue", children: task.status }), _jsx(Tag, { children: task.reviewStatus }), task.rqLevel ? _jsx(Tag, { color: "purple", children: task.rqLevel }) : null] }), _jsx(Text, { type: "secondary", children: task.taskId }), _jsx(Paragraph, { style: { marginBottom: 0 }, children: task.query }), _jsxs(Space, { wrap: true, children: [task.currentNode ? _jsxs(Text, { type: "secondary", children: ["\u5F53\u524D\u8282\u70B9\uFF1A", task.currentNode] }) : null, _jsxs(Text, { type: "secondary", children: ["\u6A21\u5F0F\uFF1A", task.taskMode] }), _jsxs(Text, { type: "secondary", children: ["\u8F93\u5165\uFF1A", task.inputType] })] }), _jsxs(Space, { wrap: true, children: [_jsx(Button, { size: "small", onClick: () => openTask(task.taskId, TASK_DETAIL_OVERVIEW_PATH(task.taskId), task), children: "\u8FDB\u5165\u8BE6\u60C5" }), _jsx(Button, { size: "small", onClick: () => openTask(task.taskId, TASK_DETAIL_RESULT_PATH(task.taskId), task), children: "\u67E5\u770B\u7ED3\u679C" }), _jsx(Button, { size: "small", type: "primary", onClick: () => openTask(task.taskId, TASK_DETAIL_REPORT_PATH(task.taskId), task), children: "\u67E5\u770B\u62A5\u544A" })] })] }) }, task.taskId))) })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u8FD8\u6CA1\u6709\u53EF\u6062\u590D\u7684\u4EFB\u52A1\u3002\u82E5\u4F60\u521A\u65B0\u5EFA\u8FC7\u4EFB\u52A1\uFF0C\u8BF7\u70B9\u51FB\u5237\u65B0\uFF1BSQLite \u6A21\u5F0F\u4E0B\u4EFB\u52A1\u4F1A\u5728 server \u91CD\u542F\u540E\u7EE7\u7EED\u4FDD\u7559\u3002" }))] }));
};
