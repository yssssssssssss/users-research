import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, Card, Col, Empty, List, Row, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';
const { Title } = Typography;
export const VisionLabPage = () => {
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const [data, setData] = useState();
    useEffect(() => {
        if (!currentTaskId)
            return;
        api.getVision(currentTaskId).then(setData);
    }, [currentTaskId]);
    if (!currentTaskId)
        return _jsx(Empty, { description: "\u8BF7\u5148\u521B\u5EFA\u4EFB\u52A1" });
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsx(Title, { level: 2, children: "Vision Lab" }), _jsx(Alert, { type: "warning", message: "Vision \u8F93\u51FA\u5C5E\u4E8E AI \u89C6\u89C9\u8BC4\u4F30\uFF0C\u4E0D\u7B49\u4EF7\u4E8E\u771F\u5B9E\u7528\u6237\u6D4B\u8BD5\u7ED3\u679C\u3002" }), _jsx(Card, { title: "\u6A21\u578B\u6267\u884C\u6982\u89C8", className: "page-card", children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsx(Space, { wrap: true, children: (data?.summary.models || []).map((model) => (_jsx(Tag, { color: "blue", children: model }, model))) }), _jsxs(Space, { wrap: true, children: [_jsxs(Tag, { color: "green", children: ["\u5171\u8BC6 ", data?.summary.consensusCount || 0] }), _jsxs(Tag, { color: "orange", children: ["\u51B2\u7A81 ", data?.summary.conflictCount || 0] })] })] }) }), _jsxs(Row, { gutter: 16, children: [_jsx(Col, { span: 12, children: _jsx(Card, { title: "\u5171\u8BC6\u95EE\u9898", className: "page-card", children: _jsx(List, { dataSource: data?.consensus || [], renderItem: (item) => (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", children: [_jsx(Tag, { color: item.riskLevel === 'high' ? 'red' : item.riskLevel === 'medium' ? 'orange' : 'blue', children: item.findingType }), _jsx("span", { children: item.content })] }) })) }) }) }), _jsx(Col, { span: 12, children: _jsx(Card, { title: "\u51B2\u7A81\u4E3B\u9898", className: "page-card", children: _jsx(List, { dataSource: data?.conflicts || [], renderItem: (item) => (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", style: { width: '100%' }, children: [_jsx("strong", { children: item.topic }), item.items.map((child) => (_jsx(Card, { size: "small", children: _jsxs(Space, { direction: "vertical", size: 8, style: { width: '100%' }, children: [_jsxs(Space, { wrap: true, children: [_jsx(Tag, { color: "purple", children: child.model }), child.requestedModel ? _jsxs(Tag, { children: ["\u8BF7\u6C42\u6A21\u578B\uFF1A", child.requestedModel] }) : null, child.actualModel ? (_jsxs(Tag, { color: child.actualModel === child.requestedModel ? 'green' : 'orange', children: ["\u5B9E\u9645\u6A21\u578B\uFF1A", child.actualModel] })) : null] }), child.attemptedModels?.length ? (_jsxs("span", { children: ["\u5C1D\u8BD5\u94FE\u8DEF\uFF1A", child.attemptedModels.join(' → ')] })) : null, _jsx("span", { children: child.content }), child.warnings?.length ? (_jsx(Alert, { type: "warning", showIcon: false, message: child.warnings.join('；') })) : null] }) }, `${item.topic}-${child.model}-${child.content}`)))] }) })) }) }) })] })] }));
};
