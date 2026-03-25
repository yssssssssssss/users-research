import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, Button, Card, Collapse, Empty, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
const { Paragraph, Text } = Typography;
const sectionGroups = [
    {
        key: 'decision',
        title: '结论与建议',
        description: '面向决策的最终摘要、Gate 说明与建议动作。',
        types: ['summary', 'gate', 'action'],
    },
    {
        key: 'evidence',
        title: '真实性证据',
        description: '真实证据、已抓原文外部证据与待核查搜索线索分开呈现。',
        types: ['evidence', 'external_evidence', 'search_leads'],
    },
    {
        key: 'analysis',
        title: '分析视角',
        description: '体验模型、视觉评审和 Persona 线索属于辅助分析层，不等于真实事实。',
        types: ['framework', 'vision', 'persona'],
    },
    {
        key: 'boundary',
        title: '边界与风险',
        description: '集中展示真实性边界、fallback、门禁风险以及多模型复核意见。',
        types: ['boundary', 'review'],
    },
];
const takeFirstSentence = (value, maxLength = 180) => {
    if (!value)
        return undefined;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized)
        return undefined;
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};
const buildGroupedSections = (sections) => {
    const grouped = sectionGroups
        .map((group) => ({
        ...group,
        sections: sections.filter((section) => group.types.includes(section.type)),
    }))
        .filter((group) => group.sections.length > 0);
    const groupedTypes = new Set(grouped.flatMap((group) => group.types));
    const ungroupedSections = sections.filter((section) => !groupedTypes.has(section.type));
    if (ungroupedSections.length > 0) {
        grouped.push({
            key: 'other',
            title: '其他章节',
            description: '尚未归类的章节内容。',
            types: [],
            sections: ungroupedSections,
        });
    }
    return grouped;
};
export const ReportTabsPanel = ({ currentReport, historyLoading, historyReports, reportStatusColorMap, reportStatusLabelMap, currentReportId, latestReportId, selectReportVersion, compareBaseId, compareTargetId, setCompareBaseId, setCompareTargetId, diffSummary, diffItems, compareBaseReport, compareTargetReport, diffStatusColorMap, diffStatusLabelMap, }) => {
    const groupedSections = buildGroupedSections(currentReport.sections);
    const decisionSections = groupedSections.find((group) => group.key === 'decision')?.sections || [];
    const evidenceSections = groupedSections.find((group) => group.key === 'evidence')?.sections || [];
    const boundarySections = groupedSections.find((group) => group.key === 'boundary')?.sections || [];
    return (_jsx(Card, { className: "page-card", children: _jsx(Tabs, { items: [
                {
                    key: 'content',
                    label: '正式正文',
                    children: (_jsxs(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: [_jsx(Alert, { type: "info", showIcon: true, message: "\u5148\u8BFB\u6267\u884C\u6458\u8981\uFF0C\u518D\u5C55\u5F00\u6B63\u6587", description: "\u8FD9\u4E2A tab \u5148\u544A\u8BC9\u4F60\u6B63\u5F0F\u62A5\u544A\u8BF4\u4E86\u4EC0\u4E48\u3001\u62FF\u4EC0\u4E48\u652F\u6491\u3001\u8FB9\u754C\u5728\u54EA\uFF0C\u518D\u5C55\u5F00\u5168\u90E8\u7AE0\u8282\u3002" }), _jsxs(Space, { wrap: true, size: 12, children: [_jsx(Card, { size: "small", children: _jsx(Statistic, { title: "\u7ED3\u8BBA\u7AE0\u8282", value: decisionSections.length }) }), _jsx(Card, { size: "small", children: _jsx(Statistic, { title: "\u8BC1\u636E\u7AE0\u8282", value: evidenceSections.length }) }), _jsx(Card, { size: "small", children: _jsx(Statistic, { title: "\u8FB9\u754C\u7AE0\u8282", value: boundarySections.length }) }), _jsx(Card, { size: "small", children: _jsx(Statistic, { title: "\u603B\u7AE0\u8282", value: currentReport.sections.length }) })] }), _jsx(Card, { type: "inner", title: "\u6267\u884C\u6458\u8981", children: _jsxs(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u6B63\u5F0F\u7ED3\u8BBA" }), decisionSections.length ? (_jsx(Space, { direction: "vertical", size: 8, style: { width: '100%', marginTop: 8 }, children: decisionSections.slice(0, 3).map((section) => (_jsx(Card, { size: "small", title: (_jsxs(Space, { wrap: true, children: [_jsx("span", { children: section.title }), _jsx(Tag, { color: "blue", children: section.type })] })), children: _jsx(Paragraph, { style: { marginBottom: 0 }, children: takeFirstSentence(section.content, 220) || section.content }) }, `${section.type}-${section.title}`))) })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u6CA1\u6709\u5355\u5217\u7684\u7ED3\u8BBA\u7AE0\u8282" }))] }), _jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u4F9D\u636E\u6458\u8981" }), evidenceSections.length ? (_jsx(Space, { direction: "vertical", size: 8, style: { width: '100%', marginTop: 8 }, children: evidenceSections.slice(0, 3).map((section) => (_jsx(Card, { size: "small", title: (_jsxs(Space, { wrap: true, children: [_jsx("span", { children: section.title }), _jsx(Tag, { color: section.type === 'search_leads' ? 'gold' : 'green', children: section.type })] })), children: _jsx(Paragraph, { style: { marginBottom: 0 }, children: takeFirstSentence(section.content, 220) || section.content }) }, `${section.type}-${section.title}`))) })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u6CA1\u6709\u5355\u5217\u7684\u8BC1\u636E\u7AE0\u8282" }))] }), _jsxs("div", { children: [_jsx(Text, { strong: true, children: "\u8FB9\u754C\u6458\u8981" }), boundarySections.length ? (_jsx(Space, { direction: "vertical", size: 8, style: { width: '100%', marginTop: 8 }, children: boundarySections.slice(0, 3).map((section) => (_jsx(Card, { size: "small", title: (_jsxs(Space, { wrap: true, children: [_jsx("span", { children: section.title }), _jsx(Tag, { children: section.type })] })), children: _jsx(Paragraph, { style: { marginBottom: 0 }, children: takeFirstSentence(section.content, 220) || section.content }) }, `${section.type}-${section.title}`))) })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u6CA1\u6709\u5355\u5217\u7684\u8FB9\u754C\u7AE0\u8282" }))] })] }) }), _jsx(Collapse, { items: groupedSections.map((group) => ({
                                    key: group.key,
                                    label: (_jsxs(Space, { wrap: true, children: [_jsx("span", { children: group.title }), _jsxs(Tag, { children: [group.sections.length, " \u8282"] })] })),
                                    children: (_jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsx(Text, { type: "secondary", children: group.description }), group.sections.map((section) => (_jsx(Card, { size: "small", title: (_jsxs(Space, { wrap: true, children: [_jsx("span", { children: section.title }), _jsx(Tag, { color: "blue", children: section.type })] })), children: _jsx(Paragraph, { style: { whiteSpace: 'pre-wrap', marginBottom: 0 }, children: section.content }) }, `${section.type}-${section.title}`)))] })),
                                })) })] })),
                },
                {
                    key: 'history',
                    label: '版本历史',
                    children: (_jsx(Table, { rowKey: "id", loading: historyLoading, pagination: false, dataSource: historyReports, columns: [
                            {
                                title: '版本',
                                render: (_, record) => _jsxs(Text, { strong: true, children: ["v", record.version] }),
                            },
                            {
                                title: '状态',
                                render: (_, record) => (_jsx(Tag, { color: reportStatusColorMap[record.status] || 'default', children: reportStatusLabelMap[record.status] || record.status })),
                            },
                            {
                                title: 'RQ / Gate',
                                render: (_, record) => (_jsxs(Text, { children: [record.gateResult.rqLevel || '未判定', record.gateResult.blockedReasons?.length
                                            ? ` / ${record.gateResult.blockedReasons.join('；')}`
                                            : ' / 已放行'] })),
                            },
                            {
                                title: '审核信息',
                                render: (_, record) => record.reviewMeta ? (_jsxs(Text, { type: "secondary", children: [record.reviewMeta.action === 'approve' ? '已通过' : '已退回', record.reviewMeta.reviewer ? ` · ${record.reviewMeta.reviewer}` : ''] })) : (_jsx(Text, { type: "secondary", children: "\u672A\u5BA1\u6838" })),
                            },
                            {
                                title: '操作',
                                render: (_, record) => (_jsxs(Space, { size: 4, children: [_jsx(Button, { type: currentReportId === record.id ? 'primary' : 'default', ghost: currentReportId === record.id, onClick: () => void selectReportVersion(record.id), children: currentReportId === record.id ? '当前查看' : '查看此版本' }), latestReportId === record.id ? _jsx(Tag, { color: "green", children: "\u6700\u65B0" }) : null] })),
                            },
                        ] })),
                },
                {
                    key: 'diff',
                    label: '版本对比',
                    children: (_jsxs(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: [_jsxs(Space, { wrap: true, children: [_jsx("span", { children: "\u57FA\u7EBF\u7248\u672C\uFF1A" }), _jsx(Select, { style: { width: 180 }, value: compareBaseId, options: historyReports.map((report) => ({
                                            label: `v${report.version} · ${reportStatusLabelMap[report.status] || report.status}`,
                                            value: report.id,
                                        })), onChange: setCompareBaseId }), _jsx("span", { children: "\u5BF9\u6BD4\u7248\u672C\uFF1A" }), _jsx(Select, { style: { width: 180 }, value: compareTargetId, options: historyReports.map((report) => ({
                                            label: `v${report.version} · ${reportStatusLabelMap[report.status] || report.status}`,
                                            value: report.id,
                                        })), onChange: setCompareTargetId })] }), _jsxs(Space, { wrap: true, children: [_jsxs(Tag, { color: "gold", children: ["\u4FEE\u6539 ", diffSummary.changed] }), _jsxs(Tag, { color: "green", children: ["\u65B0\u589E ", diffSummary.added] }), _jsxs(Tag, { color: "red", children: ["\u5220\u9664 ", diffSummary.removed] }), _jsxs(Tag, { children: ["\u672A\u53D8\u5316 ", diffSummary.unchanged] })] }), compareBaseReport && compareTargetReport ? (_jsx(Alert, { type: "info", showIcon: true, message: `正在对比 v${compareBaseReport.version} → v${compareTargetReport.version}`, description: "\u5BF9\u6BD4\u7ED3\u679C\u6309\u7AE0\u8282\u805A\u5408\u5C55\u793A\uFF0C\u7528\u4E8E\u5224\u65AD\u672C\u8F6E\u6B63\u5F0F\u62A5\u544A\u5230\u5E95\u6539\u4E86\u4EC0\u4E48\u3002" })) : null, diffItems.length ? (diffItems.map((item) => (_jsx(Card, { type: "inner", title: (_jsxs(Space, { children: [_jsx("span", { children: item.title }), _jsx(Tag, { children: item.type }), _jsx(Tag, { color: diffStatusColorMap[item.status], children: diffStatusLabelMap[item.status] })] })), children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsx(Card, { size: "small", title: `基线内容${compareBaseReport ? ` · v${compareBaseReport.version}` : ''}`, children: _jsx(Paragraph, { style: { whiteSpace: 'pre-wrap', marginBottom: 0 }, children: item.before || '该版本无此章节' }) }), _jsx(Card, { size: "small", title: `对比内容${compareTargetReport ? ` · v${compareTargetReport.version}` : ''}`, children: _jsx(Paragraph, { style: { whiteSpace: 'pre-wrap', marginBottom: 0 }, children: item.after || '该版本无此章节' }) })] }) }, item.key)))) : (_jsx(Empty, { description: "\u5F53\u524D\u6CA1\u6709\u53EF\u5C55\u793A\u7684\u7248\u672C\u5DEE\u5F02" }))] })),
                },
                {
                    key: 'gaps',
                    label: 'Gate / 缺口',
                    children: `RQ：${currentReport.gateResult.rqLevel}；屏蔽来源：${currentReport.gateResult.blockedSources.join(', ') || '无'}；门禁原因：${currentReport.gateResult.blockedReasons?.join('；') || '无'}`,
                },
            ] }) }));
};
