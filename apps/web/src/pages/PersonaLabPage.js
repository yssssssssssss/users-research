import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';
const { Title, Paragraph } = Typography;
const stanceColorMap = {
    support: 'green',
    oppose: 'red',
    hesitate: 'orange',
    confused: 'gold',
    mixed: 'blue',
};
export const PersonaLabPage = () => {
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const [data, setData] = useState();
    useEffect(() => {
        if (!currentTaskId)
            return;
        api.getPersona(currentTaskId).then(setData);
    }, [currentTaskId]);
    if (!currentTaskId)
        return _jsx(Empty, { description: "\u8BF7\u5148\u521B\u5EFA\u4EFB\u52A1" });
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsx(Title, { level: 2, children: "Persona Lab" }), _jsx(Alert, { type: "warning", message: data?.notice || '以下内容为模拟生成，不代表真实用户证据。' }), _jsxs(Row, { gutter: 16, children: [_jsx(Col, { span: 8, children: _jsx(Card, { children: _jsx(Statistic, { title: "Persona \u6570\u91CF", value: data?.summary.personaCount || 0 }) }) }), _jsx(Col, { span: 8, children: _jsx(Card, { children: _jsx(Statistic, { title: "\u4E3B\u9898\u7C07\u6570\u91CF", value: data?.summary.clusterCount || 0 }) }) }), _jsx(Col, { span: 8, children: _jsx(Card, { children: _jsx(Statistic, { title: "\u6A21\u62DF\u6027\u8D28", value: data?.summary.simulated ? '是' : '否' }) }) })] }), _jsx(Card, { className: "page-card", children: _jsx(List, { dataSource: data?.clusters || [], renderItem: (cluster) => (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", style: { width: '100%' }, size: 12, children: [_jsxs("div", { children: [_jsx(Tag, { color: "purple", children: cluster.theme }), _jsxs(Paragraph, { type: "secondary", style: { marginTop: 8, marginBottom: 0 }, children: ["\u8BE5\u4E3B\u9898\u4E0B\u5171 ", cluster.items.length, " \u6761\u6A21\u62DF\u89C2\u70B9\u3002"] })] }), cluster.items.map((item) => (_jsx(Card, { type: "inner", title: `${item.personaName} / ${item.stance || 'mixed'}`, extra: _jsx(Tag, { color: stanceColorMap[item.stance || 'mixed'] || 'default', children: item.stance || 'mixed' }), children: item.content }, item.id)))] }) })) }) })] }));
};
