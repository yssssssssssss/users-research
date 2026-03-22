import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, Card, Col, Descriptions, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExperienceModelPanel } from '../components/ExperienceModelPanel';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { api } from '../lib/api';
import { TASK_DETAIL_EVIDENCE_PATH, TASK_DETAIL_PERSONA_PATH, TASK_DETAIL_REPORT_PATH, TASK_DETAIL_RESULT_PATH, TASK_DETAIL_VISION_PATH, } from '../lib/navigation';
import { useTaskStore } from '../store/taskStore';
const { Title, Paragraph } = Typography;
const MAX_EVENT_COUNT = 20;
export const WorkbenchPage = () => {
    const navigate = useNavigate();
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const taskSummary = useTaskStore((state) => state.taskSummary);
    const taskState = useTaskStore((state) => state.taskState);
    const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
    const setTaskState = useTaskStore((state) => state.setTaskState);
    const setSelectedOutput = useTaskStore((state) => state.setSelectedOutput);
    const [events, setEvents] = useState([]);
    const appendEvent = useCallback((message) => {
        const normalized = message.trim();
        if (!normalized)
            return;
        setEvents((prev) => {
            if (prev[prev.length - 1] === normalized) {
                return prev;
            }
            return [...prev.slice(-(MAX_EVENT_COUNT - 1)), normalized];
        });
    }, []);
    const loadTaskContext = useCallback(async () => {
        if (!currentTaskId)
            return;
        const [summary, state] = await Promise.all([
            api.getTask(currentTaskId),
            api.getTaskState(currentTaskId),
        ]);
        setTaskSummary(summary);
        setTaskState(state);
    }, [currentTaskId, setTaskState, setTaskSummary]);
    useEffect(() => {
        if (!currentTaskId)
            return;
        let active = true;
        void loadTaskContext();
        const eventSource = new EventSource(`/api/research/tasks/${currentTaskId}/stream`);
        eventSource.onopen = () => {
            appendEvent('实时流已连接');
        };
        eventSource.addEventListener('connected', (event) => {
            try {
                const payload = JSON.parse(event.data);
                appendEvent(`已接入任务流：${payload.taskId || currentTaskId}`);
            }
            catch {
                appendEvent('已接入任务流');
            }
        });
        eventSource.addEventListener('task_status', (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (!active)
                    return;
                if (payload.summary)
                    setTaskSummary(payload.summary);
                if (payload.state)
                    setTaskState(payload.state);
                appendEvent(`任务状态更新：${payload.summary?.status || payload.state?.status || 'unknown'} / ${payload.summary?.currentNode || payload.state?.currentNode || '未开始'}`);
            }
            catch {
                appendEvent(`task_status: ${event.data}`);
                void loadTaskContext();
            }
        });
        eventSource.addEventListener('task_complete', (event) => {
            try {
                const payload = JSON.parse(event.data);
                appendEvent(`任务已进入终态：${payload.status || 'unknown'} / ${payload.reviewStatus || 'unknown'}`);
            }
            catch {
                appendEvent('任务已进入终态');
            }
            eventSource.close();
        });
        eventSource.onerror = () => {
            appendEvent('实时流异常，已回退到接口刷新。');
            void loadTaskContext();
        };
        return () => {
            active = false;
            eventSource.close();
        };
    }, [appendEvent, currentTaskId, loadTaskContext, setTaskState, setTaskSummary]);
    if (!currentTaskId || !taskSummary) {
        return _jsx(Empty, { description: "\u8BF7\u5148\u521B\u5EFA\u4EFB\u52A1" });
    }
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Title, { level: 3, style: { marginBottom: 8 }, children: "\u4EFB\u52A1\u603B\u89C8" }), _jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: "\u67E5\u770B\u8BE5\u4EFB\u52A1\u8FDB\u5EA6\u3001\u5B9E\u65F6\u4E8B\u4EF6\u3001\u542F\u7528\u6A21\u5757\u548C\u5019\u9009\u8F93\u51FA\uFF0C\u4F5C\u4E3A\u8FDB\u5165\u5404\u5206\u6790\u89C6\u56FE\u7684\u603B\u5165\u53E3\u3002" })] }), _jsxs("div", { className: "metric-grid", children: [_jsx(Card, { children: _jsx(Statistic, { title: "\u4EFB\u52A1\u72B6\u6001", value: taskSummary.status }) }), _jsx(Card, { children: _jsx(Statistic, { title: "RQ \u7EA7\u522B", value: taskSummary.rqLevel || '未判定' }) }), _jsx(Card, { children: _jsx(Statistic, { title: "\u9884\u8BA1\u6210\u672C", value: taskSummary.stats.costEstimate || 0, suffix: "\u5143" }) }), _jsx(Card, { children: _jsx(Statistic, { title: "\u5F53\u524D\u8282\u70B9", value: taskSummary.currentNode || '未开始' }) })] }), _jsxs(Row, { gutter: 16, children: [_jsx(Col, { span: 10, children: _jsx(Card, { title: "\u4EFB\u52A1\u6982\u89C8", className: "page-card", children: _jsxs(Descriptions, { column: 1, size: "small", children: [_jsx(Descriptions.Item, { label: "\u6807\u9898", children: taskSummary.title || '未命名任务' }), _jsx(Descriptions.Item, { label: "\u95EE\u9898", children: taskSummary.query }), _jsx(Descriptions.Item, { label: "\u8F93\u5165\u7C7B\u578B", children: taskSummary.inputType }), _jsx(Descriptions.Item, { label: "\u5206\u6790\u6A21\u5F0F", children: taskSummary.taskMode }), _jsx(Descriptions.Item, { label: "\u5BA1\u6838\u72B6\u6001", children: taskSummary.reviewStatus })] }) }) }), _jsx(Col, { span: 14, children: _jsx(Card, { title: "\u5B9E\u65F6\u4E8B\u4EF6", className: "page-card", children: _jsx(List, { size: "small", dataSource: events.slice(-8).reverse(), renderItem: (item) => _jsx(List.Item, { children: item }) }) }) })] }), _jsx(Card, { title: "\u5FEB\u901F\u5165\u53E3", className: "page-card", children: _jsxs(Space, { wrap: true, children: [_jsx(Button, { children: _jsx(Link, { to: TASK_DETAIL_EVIDENCE_PATH(currentTaskId), children: "\u67E5\u770B\u8BC1\u636E\u770B\u677F" }) }), _jsx(Button, { children: _jsx(Link, { to: TASK_DETAIL_VISION_PATH(currentTaskId), children: "\u67E5\u770B Vision Lab" }) }), _jsx(Button, { children: _jsx(Link, { to: TASK_DETAIL_PERSONA_PATH(currentTaskId), children: "\u67E5\u770B Persona Lab" }) }), _jsx(Button, { children: _jsx(Link, { to: TASK_DETAIL_RESULT_PATH(currentTaskId), children: "\u67E5\u770B\u7ED3\u679C\u603B\u89C8" }) }), _jsx(Button, { type: "primary", children: _jsx(Link, { to: TASK_DETAIL_REPORT_PATH(currentTaskId), children: "\u751F\u6210/\u67E5\u770B\u62A5\u544A" }) })] }) }), _jsx(Card, { title: "\u542F\u7528\u6A21\u5757", className: "page-card", children: _jsx(Space, { wrap: true, children: Object.entries(taskSummary.enabledModules).map(([key, value]) => (_jsx(Tag, { color: value ? 'blue' : 'default', children: key }, key))) }) }), _jsx(ExperienceModelPanel, { taskId: currentTaskId, evidencePool: taskState?.evidencePool, currentNode: taskSummary.currentNode || taskState?.currentNode, onTaskUpdated: (summary, state) => {
                    setTaskSummary(summary);
                    setTaskState(state);
                } }), _jsx(Card, { title: "\u5019\u9009\u8F93\u51FA\u8DEF\u7EBF", className: "page-card", children: taskState?.candidateOutputs?.length ? (_jsx(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: taskState.candidateOutputs.map((output) => (_jsx(OutputPreviewCard, { output: output, extra: (_jsxs(Space, { children: [_jsx(Button, { type: "link", onClick: () => {
                                        setSelectedOutput(output);
                                        navigate(TASK_DETAIL_RESULT_PATH(currentTaskId));
                                    }, children: "\u67E5\u770B\u7ED3\u679C\u603B\u89C8" }), _jsx(Button, { type: "link", onClick: () => {
                                        setSelectedOutput(output);
                                        navigate(TASK_DETAIL_REPORT_PATH(currentTaskId));
                                    }, children: "\u7528\u6B64\u8F93\u51FA\u751F\u6210\u62A5\u544A" })] })) }, output.id))) })) : (_jsx(Empty, { description: "\u4EFB\u52A1\u5C1A\u672A\u751F\u6210\u5019\u9009\u8F93\u51FA" })) })] }));
};
