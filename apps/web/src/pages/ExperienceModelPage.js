import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, Card, Descriptions, Empty, List, Space, Tag, Typography } from 'antd';
import { useCallback, useEffect } from 'react';
import { ExperienceModelPanel } from '../components/ExperienceModelPanel';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';
const { Title, Paragraph, Text } = Typography;
export const ExperienceModelPage = () => {
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const taskSummary = useTaskStore((state) => state.taskSummary);
    const taskState = useTaskStore((state) => state.taskState);
    const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
    const setTaskState = useTaskStore((state) => state.setTaskState);
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
        if (taskState)
            return;
        void loadTaskContext();
    }, [currentTaskId, loadTaskContext, taskState]);
    if (!currentTaskId)
        return _jsx(Empty, { description: "\u8BF7\u5148\u521B\u5EFA\u4EFB\u52A1" });
    const plan = taskState?.analysisPlan?.experienceModelPlan;
    const result = taskState?.moduleResults?.experienceModel;
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Title, { level: 2, children: "\u4F53\u9A8C\u6A21\u578B" }), _jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: "\u8FD9\u4E2A\u677F\u5757\u53EA\u56DE\u7B54\u4E00\u4EF6\u4E8B\uFF1A\u7CFB\u7EDF\u9009\u4E86\u54EA\u4E9B\u4F53\u9A8C\u6A21\u578B\uFF0C\u7528\u4EC0\u4E48\u7EF4\u5EA6\u8BC4\u4F30\uFF0C\u4EE5\u53CA\u4EA7\u51FA\u4E86\u4EC0\u4E48\u7ED3\u6784\u5316\u5224\u65AD\u3002" })] }), _jsx(Alert, { type: "info", showIcon: true, message: "\u4EFB\u52A1\u5B9A\u4E49", description: "\u4F53\u9A8C\u6A21\u578B\u662F\u65B9\u6CD5\u8BBA\u5206\u6790\u5C42\uFF0C\u7528\u6765\u8865\u5145\u8BC4\u4F30\u6846\u67B6\u4E0E\u8FFD\u95EE\u65B9\u5411\uFF0C\u4E0D\u76F4\u63A5\u7B49\u4E8E\u771F\u5B9E\u7528\u6237\u8BC1\u636E\u3002" }), plan ? (_jsx(Card, { className: "page-card", title: "\u672C\u6A21\u5757\u4EFB\u52A1", children: _jsxs(Descriptions, { column: 1, size: "small", children: [_jsx(Descriptions.Item, { label: "\u4EFB\u52A1", children: plan.task }), _jsx(Descriptions.Item, { label: "\u5173\u6CE8\u7EF4\u5EA6", children: _jsx(Space, { wrap: true, children: plan.focusDimensions.map((item) => _jsx(Tag, { children: item }, item)) }) }), _jsx(Descriptions.Item, { label: "\u4F18\u5148\u6A21\u578B", children: _jsx(Space, { wrap: true, children: plan.preferredModelIds.map((item) => _jsx(Tag, { color: "blue", children: item }, item)) }) }), _jsx(Descriptions.Item, { label: "\u6838\u5FC3\u95EE\u9898", children: _jsx(List, { size: "small", dataSource: plan.evaluationQuestions, renderItem: (item) => _jsx(List.Item, { children: item }) }) })] }) })) : null, _jsx(ExperienceModelPanel, { taskId: currentTaskId, evidencePool: taskState?.evidencePool, currentNode: taskSummary?.currentNode || taskState?.currentNode, onTaskUpdated: (summary, state) => {
                    setTaskSummary(summary);
                    setTaskState(state);
                } }), _jsx(Card, { className: "page-card", title: "\u7ED3\u6784\u5316\u8BC4\u4F30\u7ED3\u679C", children: result?.evaluations?.length ? (_jsx(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: result.evaluations.map((evaluation) => (_jsx(Card, { type: "inner", title: evaluation.modelName, extra: evaluation.overallScore !== undefined ? _jsxs(Tag, { color: "green", children: ["\u603B\u5206 ", evaluation.overallScore, "/10"] }) : null, children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsxs(Paragraph, { style: { marginBottom: 0 }, children: [_jsx(Text, { strong: true, children: "\u9002\u914D\u6027\uFF1A" }), evaluation.suitability] }), evaluation.dimensions.length ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u7EF4\u5EA6\u8BC4\u4F30" }), _jsx(List, { style: { marginTop: 8 }, itemLayout: "vertical", dataSource: evaluation.dimensions, renderItem: (dimension) => (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", size: 4, style: { width: '100%' }, children: [_jsxs(Space, { wrap: true, children: [_jsx(Text, { strong: true, children: dimension.name }), dimension.score !== undefined ? _jsxs(Tag, { color: "blue", children: [dimension.score, "/10"] }) : null] }), _jsx("span", { children: dimension.observation }), dimension.rationale ? _jsxs(Text, { type: "secondary", children: ["\u4F9D\u636E\uFF1A", dimension.rationale] }) : null, dimension.suggestion ? _jsxs(Text, { type: "secondary", children: ["\u5EFA\u8BAE\uFF1A", dimension.suggestion] }) : null] }) }, dimension.name)) })] })) : null, evaluation.strengths.length ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u4F18\u52BF" }), _jsx(List, { size: "small", dataSource: evaluation.strengths, renderItem: (item) => _jsx(List.Item, { children: item }) })] })) : null, evaluation.risks.length ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u98CE\u9669" }), _jsx(List, { size: "small", dataSource: evaluation.risks, renderItem: (item) => _jsx(List.Item, { children: item }) })] })) : null, evaluation.followupQuestions.length ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u5EFA\u8BAE\u8FFD\u95EE" }), _jsx(List, { size: "small", dataSource: evaluation.followupQuestions, renderItem: (item) => _jsx(List.Item, { children: item }) })] })) : null, evaluation.topPriorityFix ? (_jsx(Alert, { type: "warning", showIcon: true, message: `最高优先动作：${evaluation.topPriorityFix}` })) : null, evaluation.limitations.length ? (_jsx(Alert, { type: "info", showIcon: true, message: `边界：${evaluation.limitations.join('；')}` })) : null] }) }, `${evaluation.modelId}-${evaluation.modelName}`))) })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u8FD8\u6CA1\u6709\u7ED3\u6784\u5316\u4F53\u9A8C\u6A21\u578B\u7ED3\u679C" })) })] }));
};
