import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, Button, Card, Empty, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
const { Paragraph, Text } = Typography;
export const ReportTabsPanel = ({ currentReport, historyLoading, historyReports, reportStatusColorMap, reportStatusLabelMap, currentReportId, latestReportId, selectReportVersion, compareBaseId, compareTargetId, setCompareBaseId, setCompareTargetId, diffSummary, diffItems, compareBaseReport, compareTargetReport, diffStatusColorMap, diffStatusLabelMap, }) => (_jsx(Card, { className: "page-card", children: _jsx(Tabs, { items: [
            {
                key: 'content',
                label: '当前内容',
                children: currentReport.sections.map((section) => (_jsx(Card, { type: "inner", title: section.title, style: { marginBottom: 12 }, children: section.content }, `${section.type}-${section.title}`))),
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
                                    })), onChange: setCompareTargetId })] }), _jsxs(Space, { wrap: true, children: [_jsxs(Tag, { color: "gold", children: ["\u4FEE\u6539 ", diffSummary.changed] }), _jsxs(Tag, { color: "green", children: ["\u65B0\u589E ", diffSummary.added] }), _jsxs(Tag, { color: "red", children: ["\u5220\u9664 ", diffSummary.removed] }), _jsxs(Tag, { children: ["\u672A\u53D8\u5316 ", diffSummary.unchanged] })] }), compareBaseReport && compareTargetReport ? (_jsx(Alert, { type: "info", showIcon: true, message: `正在对比 v${compareBaseReport.version} → v${compareTargetReport.version}`, description: "\u5BF9\u6BD4\u7ED3\u679C\u6309\u7AE0\u8282\u805A\u5408\u5C55\u793A\uFF0C\u53EF\u5FEB\u901F\u5224\u65AD\u672C\u8F6E\u62A5\u544A\u65B0\u589E\u3001\u5220\u9664\u548C\u6539\u5199\u5185\u5BB9\u3002" })) : null, diffItems.length ? (diffItems.map((item) => (_jsx(Card, { type: "inner", title: (_jsxs(Space, { children: [_jsx("span", { children: item.title }), _jsx(Tag, { children: item.type }), _jsx(Tag, { color: diffStatusColorMap[item.status], children: diffStatusLabelMap[item.status] })] })), children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsx(Card, { size: "small", title: `基线内容${compareBaseReport ? ` · v${compareBaseReport.version}` : ''}`, children: _jsx(Paragraph, { style: { whiteSpace: 'pre-wrap', marginBottom: 0 }, children: item.before || '该版本无此章节' }) }), _jsx(Card, { size: "small", title: `对比内容${compareTargetReport ? ` · v${compareTargetReport.version}` : ''}`, children: _jsx(Paragraph, { style: { whiteSpace: 'pre-wrap', marginBottom: 0 }, children: item.after || '该版本无此章节' }) })] }) }, item.key)))) : (_jsx(Empty, { description: "\u5F53\u524D\u6CA1\u6709\u53EF\u5C55\u793A\u7684\u7248\u672C\u5DEE\u5F02" }))] })),
            },
            {
                key: 'gaps',
                label: 'Gate 与缺口',
                children: `RQ：${currentReport.gateResult.rqLevel}；屏蔽来源：${currentReport.gateResult.blockedSources.join(', ') || '无'}；门禁原因：${currentReport.gateResult.blockedReasons?.join('；') || '无'}`,
            },
        ] }) }));
