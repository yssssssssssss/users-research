import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';
const { Title, Paragraph, Text } = Typography;
const stanceColorMap = {
    support: 'green',
    oppose: 'red',
    hesitate: 'orange',
    confused: 'gold',
    mixed: 'blue',
};
export const PersonaLabPage = () => {
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const taskSummary = useTaskStore((state) => state.taskSummary);
    const taskState = useTaskStore((state) => state.taskState);
    const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
    const setTaskState = useTaskStore((state) => state.setTaskState);
    const [data, setData] = useState();
    const loadTaskContext = useCallback(async () => {
        if (!currentTaskId)
            return;
        const [summary, state, persona] = await Promise.all([
            api.getTask(currentTaskId),
            api.getTaskState(currentTaskId),
            api.getPersona(currentTaskId),
        ]);
        setTaskSummary(summary);
        setTaskState(state);
        setData(persona);
    }, [currentTaskId, setTaskState, setTaskSummary]);
    useEffect(() => {
        if (!currentTaskId)
            return;
        void loadTaskContext();
    }, [currentTaskId, loadTaskContext]);
    if (!currentTaskId)
        return _jsx(Empty, { description: "\u8BF7\u5148\u521B\u5EFA\u4EFB\u52A1" });
    const personaResult = taskState?.moduleResults?.personaSimulation;
    const digitalPersonas = personaResult?.digitalPersonas || [];
    const reviews = personaResult?.reviews || [];
    const warnings = personaResult?.warnings || [];
    const aggregate = personaResult?.aggregate;
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Title, { level: 2, children: "\u6A21\u62DF\u7528\u6237" }), _jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: "\u8FD9\u91CC\u5BF9\u5E94\u6A21\u62DF\u7528\u6237\u6A21\u5757\uFF1A\u770B\u7528\u4E86\u54EA\u4E9B\u4EBA\u7FA4\u539F\u578B\u3001\u6570\u5B57\u4EBA\u600E\u4E48\u6253\u5206\u3001\u5171\u6027\u75DB\u70B9\u548C\u5206\u6B67\u5728\u54EA\u91CC\u3002" })] }), _jsx(Alert, { type: "warning", message: data?.notice || '以下内容为模拟生成，不代表真实用户证据。' }), taskState?.analysisPlan?.personaSimulationPlan ? (_jsx(Card, { className: "page-card", title: "\u672C\u6A21\u5757\u4EFB\u52A1", children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsx(Paragraph, { style: { marginBottom: 0 }, children: taskState.analysisPlan.personaSimulationPlan.task }), _jsxs("div", { children: [_jsx(Tag, { color: "blue", children: "\u76EE\u6807\u4EBA\u7FA4" }), _jsx(Space, { wrap: true, style: { marginTop: 8 }, children: taskState.analysisPlan.personaSimulationPlan.personaTypes.map((item) => _jsx(Tag, { children: item }, item)) })] }), _jsxs("div", { children: [_jsx(Tag, { color: "purple", children: "\u8BC4\u5206\u7EF4\u5EA6" }), _jsx(Space, { wrap: true, style: { marginTop: 8 }, children: taskState.analysisPlan.personaSimulationPlan.ratingDimensions.map((item) => _jsx(Tag, { children: item }, item)) })] }), taskState.moduleResults?.personaSimulation?.aggregate.sharedPainPoints?.length ? (_jsxs("div", { children: [_jsx(Paragraph, { strong: true, style: { marginBottom: 8 }, children: "\u5171\u6027\u75DB\u70B9" }), _jsx(List, { size: "small", dataSource: taskState.moduleResults.personaSimulation.aggregate.sharedPainPoints, renderItem: (item) => _jsx(List.Item, { children: item }) })] })) : null] }) })) : null, _jsxs(Row, { gutter: 16, children: [_jsx(Col, { span: 8, children: _jsx(Card, { children: _jsx(Statistic, { title: "Persona \u6570\u91CF", value: reviews.length || data?.summary.personaCount || 0 }) }) }), _jsx(Col, { span: 8, children: _jsx(Card, { children: _jsx(Statistic, { title: "\u4E3B\u9898\u7C07\u6570\u91CF", value: aggregate?.divergences.length || data?.summary.clusterCount || 0 }) }) }), _jsx(Col, { span: 8, children: _jsx(Card, { children: _jsx(Statistic, { title: "\u5F53\u524D\u8282\u70B9", value: taskSummary?.currentNode || taskState?.currentNode || '未开始' }) }) })] }), digitalPersonas.length ? (_jsx(Card, { className: "page-card", title: "\u6570\u5B57\u4EBA\u753B\u50CF", children: _jsx(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: digitalPersonas.map((persona) => (_jsx(Card, { type: "inner", title: persona.personaName, children: _jsxs(Space, { direction: "vertical", size: 8, style: { width: '100%' }, children: [_jsx(Paragraph, { style: { marginBottom: 0 }, children: persona.description }), persona.usageScenario ? _jsxs(Text, { type: "secondary", children: ["\u4F7F\u7528\u573A\u666F\uFF1A", persona.usageScenario] }) : null, persona.concerns.length ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u987E\u8651" }), _jsx(List, { size: "small", dataSource: persona.concerns, renderItem: (item) => _jsx(List.Item, { children: item }) })] })) : null, persona.motivations.length ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u52A8\u673A" }), _jsx(List, { size: "small", dataSource: persona.motivations, renderItem: (item) => _jsx(List.Item, { children: item }) })] })) : null] }) }, persona.profileId))) }) })) : null, reviews.length ? (_jsx(Card, { className: "page-card", title: "\u6A21\u62DF\u8BC4\u8BBA\u4E0E\u8BC4\u5206", children: _jsx(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: reviews.map((review) => (_jsx(Card, { type: "inner", title: review.personaName, extra: _jsx(Tag, { color: stanceColorMap[review.stance || 'mixed'] || 'default', children: review.stance || 'mixed' }), children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsxs(Paragraph, { style: { marginBottom: 0 }, children: [_jsx(Text, { strong: true, children: "\u7B2C\u4E00\u5370\u8C61\uFF1A" }), review.firstImpression] }), _jsxs(Paragraph, { style: { marginBottom: 0 }, children: [_jsx(Text, { strong: true, children: "\u8BE6\u7EC6\u4F53\u9A8C\uFF1A" }), review.detailedExperience] }), review.overallScore !== undefined ? _jsxs(Tag, { color: "green", children: ["\u603B\u4F53\u8BC4\u5206 ", review.overallScore, "/10"] }) : null, _jsx(Space, { wrap: true, children: Object.entries(review.scores || {}).map(([key, value]) => value !== undefined ? _jsxs(Tag, { children: [key, ": ", value] }, key) : null) }), review.quoteToFriend ? _jsx(Alert, { type: "success", showIcon: true, message: `会对朋友说：${review.quoteToFriend}` }) : null, review.topChangeRequest ? _jsx(Alert, { type: "warning", showIcon: true, message: `最想改的点：${review.topChangeRequest}` }) : null] }) }, `${review.profileId}-${review.personaName}`))) }) })) : null, _jsx(Card, { className: "page-card", children: _jsx(List, { dataSource: data?.clusters || [], renderItem: (cluster) => (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", style: { width: '100%' }, size: 12, children: [_jsxs("div", { children: [_jsx(Tag, { color: "purple", children: cluster.theme }), _jsxs(Paragraph, { type: "secondary", style: { marginTop: 8, marginBottom: 0 }, children: ["\u8BE5\u4E3B\u9898\u4E0B\u5171 ", cluster.items.length, " \u6761\u6A21\u62DF\u89C2\u70B9\u3002"] })] }), cluster.items.map((item) => (_jsx(Card, { type: "inner", title: `${item.personaName} / ${item.stance || 'mixed'}`, extra: _jsx(Tag, { color: stanceColorMap[item.stance || 'mixed'] || 'default', children: item.stance || 'mixed' }), children: item.content }, item.id)))] }) })) }) }), aggregate?.sharedHighlights?.length || aggregate?.churnRisks?.length ? (_jsxs(Row, { gutter: 16, children: [_jsx(Col, { span: 12, children: _jsx(Card, { className: "page-card", title: "\u5171\u6027\u4EAE\u70B9", children: _jsx(List, { size: "small", dataSource: aggregate?.sharedHighlights || [], renderItem: (item) => _jsx(List.Item, { children: item }) }) }) }), _jsx(Col, { span: 12, children: _jsx(Card, { className: "page-card", title: "\u6D41\u5931\u98CE\u9669", children: _jsx(List, { size: "small", dataSource: aggregate?.churnRisks || [], renderItem: (item) => _jsx(List.Item, { children: item }) }) }) })] })) : null, warnings.length ? (_jsx(Alert, { type: "warning", showIcon: true, message: "\u6A21\u62DF\u7528\u6237\u63D0\u9192", description: _jsx(List, { size: "small", dataSource: warnings, renderItem: (item) => _jsx(List.Item, { children: item }) }) })) : null] }));
};
