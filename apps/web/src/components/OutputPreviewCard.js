import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Alert, Card, Descriptions, Empty, List, Space, Tag, Typography } from 'antd';
const { Paragraph, Text } = Typography;
const asRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;
const asStringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
const asFindings = (value) => Array.isArray(value)
    ? value
        .map((item) => asRecord(item))
        .filter(Boolean)
        .map((item) => ({
        personaName: typeof item?.personaName === 'string' ? item.personaName : undefined,
        theme: typeof item?.theme === 'string' ? item.theme : undefined,
        stance: typeof item?.stance === 'string' ? item.stance : undefined,
        findingType: typeof item?.findingType === 'string' ? item.findingType : undefined,
        riskLevel: typeof item?.riskLevel === 'string' ? item.riskLevel : undefined,
        content: typeof item?.content === 'string' ? item.content : undefined,
        isConsensus: typeof item?.isConsensus === 'boolean' ? item.isConsensus : undefined,
        isConflict: typeof item?.isConflict === 'boolean' ? item.isConflict : undefined,
    }))
    : [];
const asJudgments = (value) => Array.isArray(value)
    ? value
        .map((item) => asRecord(item))
        .filter(Boolean)
        .map((item) => ({
        title: typeof item?.title === 'string' ? item.title : undefined,
        content: typeof item?.content === 'string' ? item.content : undefined,
        confidence: typeof item?.confidence === 'string' ? item.confidence : undefined,
        risk: typeof item?.risk === 'string' ? item.risk : undefined,
    }))
    : [];
const gateColorMap = {
    allowed: 'green',
    review_required: 'orange',
    blocked_by_rq: 'red',
};
const statusColorMap = {
    selected: 'blue',
    generated: 'default',
    gated_out: 'red',
    discarded: 'default',
};
export const OutputPreviewCard = ({ output, extra, provenanceTags, fallbackWarnings, }) => {
    const content = asRecord(output.contentJson);
    const judgments = asJudgments(content?.judgments);
    const nextActions = asStringArray(content?.nextActions);
    const findings = asFindings(content?.findings);
    const reviewNotes = asStringArray(content?.reviewNotes);
    return (_jsx(Card, { className: "page-card", title: output.outputType, extra: extra, children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsxs(Space, { wrap: true, children: [_jsxs(Tag, { color: gateColorMap[output.gateLevel || 'review_required'] || 'default', children: ["\u95E8\u7981\uFF1A", output.gateLevel || '未标注'] }), _jsxs(Tag, { color: statusColorMap[output.status] || 'default', children: ["\u72B6\u6001\uFF1A", output.status] }), _jsxs(Tag, { children: ["\u8282\u70B9\uFF1A", output.sourceNode] }), typeof content?.kind === 'string' ? _jsxs(Tag, { children: ["\u7C7B\u578B\uFF1A", content.kind] }) : null] }), output.summary ? _jsx(Paragraph, { style: { marginBottom: 0 }, children: output.summary }) : null, fallbackWarnings?.length ? (_jsx(Alert, { type: "warning", showIcon: true, message: "\u68C0\u6D4B\u5230 fallback / mock / \u5F31\u89C6\u89C9\u63A8\u65AD\u4FE1\u53F7", description: fallbackWarnings.slice(0, 3).join('；') })) : null, provenanceTags?.length ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u771F\u5B9E\u6027\u8FB9\u754C" }), _jsx("div", { style: { marginTop: 8 }, children: _jsx(Space, { wrap: true, children: provenanceTags.map((item) => (_jsx(Tag, { color: item.color, children: item.label }, item.key))) }) })] })) : null, output.gateNotes?.length ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "Gate \u8BF4\u660E" }), _jsx(List, { size: "small", dataSource: output.gateNotes, renderItem: (item) => _jsx(List.Item, { children: item }) })] })) : null, reviewNotes.length > 0 ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u591A\u6A21\u578B\u590D\u6838\u610F\u89C1" }), _jsx(List, { size: "small", dataSource: reviewNotes, renderItem: (item) => _jsx(List.Item, { children: item }) })] })) : null, judgments.length > 0 ? (_jsx(List, { size: "small", dataSource: judgments, renderItem: (item, index) => (_jsx(List.Item, { children: _jsxs(Descriptions, { size: "small", column: 1, title: `判断 ${index + 1}`, children: [_jsx(Descriptions.Item, { label: "\u6807\u9898", children: item.title || '未命名判断' }), _jsx(Descriptions.Item, { label: "\u5185\u5BB9", children: item.content || '暂无内容' }), item.confidence ? (_jsx(Descriptions.Item, { label: "\u7F6E\u4FE1\u5EA6", children: item.confidence })) : null, item.risk ? _jsx(Descriptions.Item, { label: "\u98CE\u9669", children: item.risk }) : null] }) })) })) : null, nextActions.length > 0 ? (_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u5EFA\u8BAE\u52A8\u4F5C" }), _jsx(List, { size: "small", dataSource: nextActions, renderItem: (item) => _jsx(List.Item, { children: item }) })] })) : null, findings.length > 0 ? (_jsx(List, { size: "small", dataSource: findings, renderItem: (item) => (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", size: 4, children: [_jsxs(Space, { wrap: true, children: [item.personaName ? _jsx(Tag, { color: "purple", children: item.personaName }) : null, item.theme ? _jsx(Tag, { children: item.theme }) : null, item.stance ? _jsx(Tag, { color: "blue", children: item.stance }) : null, item.findingType ? _jsx(Tag, { children: item.findingType }) : null, item.riskLevel ? _jsx(Tag, { color: item.riskLevel === 'high' ? 'red' : item.riskLevel === 'medium' ? 'orange' : 'blue', children: item.riskLevel }) : null, item.isConsensus ? _jsx(Tag, { color: "green", children: "\u5171\u8BC6" }) : null, item.isConflict ? _jsx(Tag, { color: "gold", children: "\u5206\u6B67" }) : null] }), _jsx("span", { children: item.content || '暂无内容' })] }) })) })) : null, !judgments.length && !nextActions.length && !findings.length && !reviewNotes.length ? (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u8F93\u51FA\u6682\u672A\u63D0\u4F9B\u53EF\u7ED3\u6784\u5316\u9884\u89C8\u5185\u5BB9" })) : null] }) }));
};
