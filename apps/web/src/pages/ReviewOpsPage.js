import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, Button, Card, Col, Empty, Row, Space, Statistic, Table, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';
const { Title, Paragraph } = Typography;
export const ReviewOpsPage = () => {
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const taskSummary = useTaskStore((state) => state.taskSummary);
    const taskState = useTaskStore((state) => state.taskState);
    const currentReport = useTaskStore((state) => state.currentReport);
    const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
    const setTaskState = useTaskStore((state) => state.setTaskState);
    const setCurrentReport = useTaskStore((state) => state.setCurrentReport);
    const [submitting, setSubmitting] = useState(false);
    useEffect(() => {
        if (!currentTaskId)
            return;
        Promise.all([api.getTask(currentTaskId), api.getTaskState(currentTaskId)]).then(([summary, state]) => {
            setTaskSummary(summary);
            setTaskState(state);
            const latestReportId = currentReport?.id || state.finalReports[0]?.id;
            if (latestReportId) {
                api.getReport(latestReportId).then(setCurrentReport);
            }
        });
    }, [currentTaskId, currentReport?.id, setCurrentReport, setTaskState, setTaskSummary]);
    const pendingCount = useMemo(() => taskState?.finalReports.filter((item) => item.status === 'pending_review').length || 0, [taskState?.finalReports]);
    const handleReview = async (action) => {
        if (!currentTaskId || !currentReport)
            return;
        setSubmitting(true);
        try {
            const reviewed = await api.reviewReport(currentReport.id, {
                action,
                reviewer: 'review_ops_console',
            });
            setCurrentReport(reviewed.report);
            const [summary, state] = await Promise.all([
                api.getTask(currentTaskId),
                api.getTaskState(currentTaskId),
            ]);
            setTaskSummary(summary);
            setTaskState(state);
            message.success(action === 'approve' ? '审核通过成功' : '已退回重做');
        }
        catch (error) {
            message.error(error instanceof Error ? error.message : '审核失败');
        }
        finally {
            setSubmitting(false);
        }
    };
    if (!currentTaskId)
        return _jsx(Empty, { description: "\u8BF7\u5148\u521B\u5EFA\u4EFB\u52A1" });
    return (_jsxs("div", { children: [_jsx(Title, { level: 3, children: "\u5BA1\u6838\u4E0E\u89C2\u6D4B" }), _jsx(Paragraph, { children: "\u672C\u9875\u7528\u4E8E\u627F\u8F7D\u8BE5\u4EFB\u52A1\u7684\u5F85\u5BA1\u62A5\u544A\u3001\u5BA1\u6838\u72B6\u6001\u3001\u6A21\u578B\u6210\u672C\u4E0E\u964D\u7EA7\u6CBB\u7406\u4FE1\u606F\u3002" }), _jsxs(Row, { gutter: 16, children: [_jsx(Col, { span: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: "\u5F85\u5BA1\u62A5\u544A", value: pendingCount }) }) }), _jsx(Col, { span: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: "\u5E73\u5747\u8017\u65F6", value: taskSummary?.stats.elapsedSeconds || 0, suffix: "s" }) }) }), _jsx(Col, { span: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: "\u5E73\u5747\u6210\u672C", value: taskSummary?.stats.costEstimate || 0, suffix: "\u5143" }) }) }), _jsx(Col, { span: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: "\u5BA1\u6838\u72B6\u6001", value: taskSummary?.reviewStatus || '未开始' }) }) })] }), taskSummary?.stats.warnings?.length ? (_jsx(Alert, { style: { marginTop: 24 }, type: "warning", message: "\u4EFB\u52A1\u5B58\u5728\u63D0\u9192", description: taskSummary.stats.warnings.join('；') })) : null, _jsx(Card, { className: "page-card", style: { marginTop: 24 }, title: "\u62A5\u544A\u961F\u5217", children: _jsx(Table, { rowKey: "id", pagination: false, dataSource: taskState?.finalReports || [], columns: [
                        { title: '报告 ID', dataIndex: 'id' },
                        { title: '版本', dataIndex: 'version' },
                        { title: '类型', dataIndex: 'reportType' },
                        { title: '状态', dataIndex: 'status' },
                        {
                            title: '操作',
                            render: (_, record) => (_jsx(Button, { type: "link", onClick: () => api.getReport(record.id).then(setCurrentReport), children: "\u67E5\u770B" })),
                        },
                    ] }) }), _jsx(Card, { className: "page-card", style: { marginTop: 24 }, title: "\u5F53\u524D\u5BA1\u6838\u5BF9\u8C61", children: currentReport ? (_jsxs(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: [_jsxs(Paragraph, { children: ["\u62A5\u544A\u7248\u672C\uFF1Av", currentReport.version] }), _jsxs(Paragraph, { children: ["\u62A5\u544A\u7C7B\u578B\uFF1A", currentReport.reportType] }), _jsxs(Paragraph, { children: ["\u62A5\u544A\u72B6\u6001\uFF1A", currentReport.status] }), _jsxs(Paragraph, { children: ["Gate\uFF1ARQ ", currentReport.gateResult.rqLevel || '未判定', " / \u5C4F\u853D\u6765\u6E90 ", currentReport.gateResult.blockedSources.join(', ') || '无'] }), currentReport.gateResult.blockedReasons?.length ? (_jsx(Alert, { type: "warning", message: "\u5F53\u524D\u62A5\u544A\u53D7\u670D\u52A1\u7AEF Gate \u9650\u5236", description: currentReport.gateResult.blockedReasons.join('；') })) : null, currentReport.reviewMeta ? (_jsx(Alert, { type: currentReport.reviewMeta.action === 'approve' ? 'success' : 'info', message: currentReport.reviewMeta.action === 'approve' ? '已审核通过' : '已退回重做', description: `审核时间：${currentReport.reviewMeta.reviewedAt}${currentReport.reviewMeta.reviewer ? `；审核人：${currentReport.reviewMeta.reviewer}` : ''}` })) : null, _jsxs(Space, { children: [_jsx(Button, { type: "primary", loading: submitting, disabled: currentReport.status === 'approved' || Boolean(currentReport.gateResult.blockedReasons?.length), onClick: () => handleReview('approve'), children: "\u901A\u8FC7" }), _jsx(Button, { loading: submitting, disabled: currentReport.status === 'rejected', onClick: () => handleReview('request_rework'), children: "\u9000\u56DE\u91CD\u505A" })] })] })) : (_jsx(Empty, { description: "\u5F53\u524D\u6682\u65E0\u62A5\u544A\u53EF\u5BA1\u6838" })) })] }));
};
