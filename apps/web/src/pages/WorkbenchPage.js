import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, Card, Col, Descriptions, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { api } from '../lib/api';
import { TASK_DETAIL_EXPERIENCE_PATH, TASK_DETAIL_EVIDENCE_PATH, TASK_DETAIL_PERSONA_PATH, TASK_DETAIL_REPORT_PATH, TASK_DETAIL_RESULT_PATH, TASK_DETAIL_VISION_PATH, } from '../lib/navigation';
import { useTaskStore } from '../store/taskStore';
const { Title, Paragraph } = Typography;
const MAX_EVENT_COUNT = 20;
const statusColorMap = {
    completed: 'green',
    awaiting_review: 'blue',
    running: 'gold',
    queued: 'gold',
    draft: 'default',
    failed: 'red',
    cancelled: 'red',
    partial_failed: 'orange',
};
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
    const analysisPlan = taskState?.analysisPlan;
    const moduleResults = taskState?.moduleResults;
    const synthesisResult = taskState?.synthesisResult;
    const flowCards = [
        {
            key: 'input',
            title: '输入解析',
            status: analysisPlan ? 'completed' : taskSummary.currentNode === 'input_parser' ? 'running' : 'pending',
            summary: analysisPlan?.coreGoal || '尚未完成输入解析',
            detail: analysisPlan?.targetAudience,
            href: undefined,
        },
        {
            key: 'experience',
            title: '体验模型',
            status: moduleResults?.experienceModel ? 'completed' : taskSummary.currentNode === 'experience_model_router' ? 'running' : 'pending',
            summary: moduleResults?.experienceModel?.summary || analysisPlan?.experienceModelPlan.task || '尚未执行',
            detail: moduleResults?.experienceModel?.selectedModelNames?.join('、'),
            href: TASK_DETAIL_EXPERIENCE_PATH(currentTaskId),
        },
        {
            key: 'evidence',
            title: '外部检索 / 证据',
            status: moduleResults?.externalSearch ? 'completed' : taskSummary.currentNode === 'external_search' ? 'running' : 'pending',
            summary: moduleResults?.externalSearch?.keyInsights?.[0]?.insight || analysisPlan?.externalSearchPlan.task || '尚未执行',
            detail: moduleResults?.externalSearch?.queries?.slice(0, 2).join('；'),
            href: TASK_DETAIL_EVIDENCE_PATH(currentTaskId),
        },
        {
            key: 'vision',
            title: '视觉评审',
            status: moduleResults?.visualReview ? 'completed' : taskSummary.currentNode === 'vision_moe' ? 'running' : 'pending',
            summary: moduleResults?.visualReview?.prioritizedActions?.[0] || analysisPlan?.visualReviewPlan.task || '尚未执行',
            detail: moduleResults?.visualReview?.consensus?.[0],
            href: TASK_DETAIL_VISION_PATH(currentTaskId),
        },
        {
            key: 'persona',
            title: '模拟用户',
            status: moduleResults?.personaSimulation ? 'completed' : taskSummary.currentNode === 'persona_sandbox' ? 'running' : 'pending',
            summary: moduleResults?.personaSimulation?.aggregate.sharedPainPoints?.[0] || analysisPlan?.personaSimulationPlan.task || '尚未执行',
            detail: moduleResults?.personaSimulation?.digitalPersonas?.length ? `${moduleResults.personaSimulation.digitalPersonas.length} 位数字人` : undefined,
            href: TASK_DETAIL_PERSONA_PATH(currentTaskId),
        },
        {
            key: 'synthesis',
            title: '综合结论',
            status: synthesisResult?.conclusions?.length ? 'completed' : taskSummary.currentNode === 'judgment_synthesizer' ? 'running' : 'pending',
            summary: synthesisResult?.conclusions?.[0]?.content || '尚未形成综合结论',
            detail: synthesisResult?.topRecommendations?.[0],
            href: TASK_DETAIL_RESULT_PATH(currentTaskId),
        },
    ];
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Title, { level: 3, style: { marginBottom: 8 }, children: "\u4EFB\u52A1\u603B\u89C8" }), _jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: "\u8FD9\u91CC\u662F\u94FE\u8DEF\u5165\u53E3\u9875\uFF1A\u5148\u770B\u8F93\u5165\u89E3\u6790\u4E0E\u6267\u884C\u8FDB\u5EA6\uFF0C\u518D\u8FDB\u5165\u5404\u6A21\u5757\u67E5\u770B\u5404\u81EA\u7684\u4EFB\u52A1\u5B9A\u4E49\u548C\u6267\u884C\u7ED3\u679C\u3002" })] }), _jsxs("div", { className: "metric-grid", children: [_jsx(Card, { children: _jsx(Statistic, { title: "\u4EFB\u52A1\u72B6\u6001", value: taskSummary.status }) }), _jsx(Card, { children: _jsx(Statistic, { title: "RQ \u7EA7\u522B", value: taskSummary.rqLevel || '未判定' }) }), _jsx(Card, { children: _jsx(Statistic, { title: "\u9884\u8BA1\u6210\u672C", value: taskSummary.stats.costEstimate || 0, suffix: "\u5143" }) }), _jsx(Card, { children: _jsx(Statistic, { title: "\u5F53\u524D\u8282\u70B9", value: taskSummary.currentNode || '未开始' }) })] }), _jsxs(Row, { gutter: 16, children: [_jsx(Col, { span: 10, children: _jsx(Card, { title: "\u4EFB\u52A1\u6982\u89C8", className: "page-card", children: _jsxs(Descriptions, { column: 1, size: "small", children: [_jsx(Descriptions.Item, { label: "\u6807\u9898", children: taskSummary.title || '未命名任务' }), _jsx(Descriptions.Item, { label: "\u95EE\u9898", children: taskSummary.query }), _jsx(Descriptions.Item, { label: "\u8F93\u5165\u7C7B\u578B", children: taskSummary.inputType }), _jsx(Descriptions.Item, { label: "\u5206\u6790\u6A21\u5F0F", children: taskSummary.taskMode }), _jsx(Descriptions.Item, { label: "\u5BA1\u6838\u72B6\u6001", children: taskSummary.reviewStatus })] }) }) }), _jsx(Col, { span: 14, children: _jsx(Card, { title: "\u6700\u8FD1\u72B6\u6001", className: "page-card", children: _jsx(List, { size: "small", dataSource: events.slice(-5).reverse(), renderItem: (item) => _jsx(List.Item, { children: item }) }) }) })] }), analysisPlan ? (_jsx(Card, { title: "\u8F93\u5165\u89E3\u6790", className: "page-card", children: _jsxs(Descriptions, { column: 1, size: "small", children: [_jsx(Descriptions.Item, { label: "\u6838\u5FC3\u76EE\u6807", children: analysisPlan.coreGoal }), _jsx(Descriptions.Item, { label: "\u7A3F\u4EF6\u7C7B\u578B", children: analysisPlan.artifactType }), _jsx(Descriptions.Item, { label: "\u76EE\u6807\u7528\u6237", children: analysisPlan.targetAudience }), _jsx(Descriptions.Item, { label: "\u4E1A\u52A1\u80CC\u666F", children: analysisPlan.businessContext })] }) })) : null, _jsx(Card, { title: "\u5206\u6790\u6D41\u7A0B\u770B\u677F", className: "page-card", children: _jsx(Row, { gutter: [16, 16], children: flowCards.map((item) => (_jsx(Col, { xs: 24, md: 12, xl: 8, children: _jsx(Card, { size: "small", title: item.title, extra: _jsx(Tag, { color: statusColorMap[item.status] || 'default', children: item.status === 'completed' ? '已完成' : item.status === 'running' ? '进行中' : '待执行' }), children: _jsxs(Space, { direction: "vertical", size: 8, style: { width: '100%' }, children: [_jsx(Paragraph, { style: { marginBottom: 0 }, children: item.summary }), item.detail ? _jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: item.detail }) : null, item.href ? (_jsx(Button, { type: "link", style: { paddingInline: 0 }, children: _jsx(Link, { to: item.href, children: "\u8FDB\u5165\u677F\u5757" }) })) : null] }) }) }, item.key))) }) }), moduleResults ? (_jsx(Card, { title: "\u6A21\u5757\u4EFB\u52A1\u5B9A\u4E49", className: "page-card", children: _jsxs(Row, { gutter: [16, 16], children: [_jsx(Col, { xs: 24, md: 12, xl: 6, children: _jsxs(Card, { size: "small", title: "\u4F53\u9A8C\u6A21\u578B", children: [_jsx(Paragraph, { style: { marginBottom: 8 }, children: analysisPlan?.experienceModelPlan.task || '未定义' }), _jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: moduleResults.experienceModel?.selectedModelNames?.join('、') || '尚未产出模型选择结果' })] }) }), _jsx(Col, { xs: 24, md: 12, xl: 6, children: _jsxs(Card, { size: "small", title: "\u5916\u90E8\u68C0\u7D22", children: [_jsx(Paragraph, { style: { marginBottom: 8 }, children: analysisPlan?.externalSearchPlan.task || '未定义' }), _jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: moduleResults.externalSearch?.queries?.slice(0, 2).join('；') || '尚未产出查询' })] }) }), _jsx(Col, { xs: 24, md: 12, xl: 6, children: _jsxs(Card, { size: "small", title: "\u89C6\u89C9\u8BC4\u5BA1", children: [_jsx(Paragraph, { style: { marginBottom: 8 }, children: analysisPlan?.visualReviewPlan.task || '未定义' }), _jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: moduleResults.visualReview?.reviewDimensions?.slice(0, 2).join('；') || '尚未产出评审维度' })] }) }), _jsx(Col, { xs: 24, md: 12, xl: 6, children: _jsxs(Card, { size: "small", title: "\u6A21\u62DF\u7528\u6237", children: [_jsx(Paragraph, { style: { marginBottom: 8 }, children: analysisPlan?.personaSimulationPlan.task || '未定义' }), _jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: moduleResults.personaSimulation?.personaTypes?.slice(0, 2).join('；') || '尚未产出人群结果' })] }) })] }) })) : null, _jsx(Card, { title: "\u5FEB\u901F\u5165\u53E3", className: "page-card", children: _jsxs(Space, { wrap: true, children: [_jsx(Button, { children: _jsx(Link, { to: TASK_DETAIL_EXPERIENCE_PATH(currentTaskId), children: "\u4F53\u9A8C\u6A21\u578B" }) }), _jsx(Button, { children: _jsx(Link, { to: TASK_DETAIL_EVIDENCE_PATH(currentTaskId), children: "\u5916\u90E8\u68C0\u7D22 / \u8BC1\u636E" }) }), _jsx(Button, { children: _jsx(Link, { to: TASK_DETAIL_VISION_PATH(currentTaskId), children: "\u89C6\u89C9\u8BC4\u5BA1" }) }), _jsx(Button, { children: _jsx(Link, { to: TASK_DETAIL_PERSONA_PATH(currentTaskId), children: "\u6A21\u62DF\u7528\u6237" }) }), _jsx(Button, { children: _jsx(Link, { to: TASK_DETAIL_RESULT_PATH(currentTaskId), children: "\u7EFC\u5408\u7ED3\u8BBA" }) }), _jsx(Button, { type: "primary", children: _jsx(Link, { to: TASK_DETAIL_REPORT_PATH(currentTaskId), children: "\u6B63\u5F0F\u62A5\u544A" }) })] }) }), _jsx(Card, { title: "\u5019\u9009\u8F93\u51FA\u8DEF\u7EBF", className: "page-card", children: taskState?.candidateOutputs?.length ? (_jsx(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: taskState.candidateOutputs.map((output) => (_jsx(OutputPreviewCard, { output: output, extra: (_jsxs(Space, { children: [_jsx(Button, { type: "link", onClick: () => {
                                        setSelectedOutput(output);
                                        navigate(TASK_DETAIL_RESULT_PATH(currentTaskId));
                                    }, children: "\u67E5\u770B\u7EFC\u5408\u7ED3\u8BBA" }), _jsx(Button, { type: "link", onClick: () => {
                                        setSelectedOutput(output);
                                        navigate(TASK_DETAIL_REPORT_PATH(currentTaskId));
                                    }, children: "\u7528\u6B64\u8F93\u51FA\u67E5\u770B\u6B63\u5F0F\u62A5\u544A" })] })) }, output.id))) })) : (_jsx(Empty, { description: "\u4EFB\u52A1\u5C1A\u672A\u751F\u6210\u5019\u9009\u8F93\u51FA" })) })] }));
};
