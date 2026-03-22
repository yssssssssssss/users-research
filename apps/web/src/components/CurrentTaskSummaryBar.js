import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, Card, Col, Row, Space, Statistic, Tag, Typography } from 'antd';
const { Text } = Typography;
const taskStatusLabelMap = {
    draft: '草稿',
    queued: '排队中',
    running: '运行中',
    partial_failed: '部分失败',
    awaiting_review: '待审核',
    completed: '已完成',
    cancelled: '已取消',
    failed: '失败',
};
const reviewStatusLabelMap = {
    not_required: '无需审核',
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
    rework_required: '需返工',
};
export const CurrentTaskSummaryBar = ({ taskId, taskSummary }) => {
    if (!taskSummary) {
        return (_jsx(Card, { className: "page-card", children: _jsxs(Space, { wrap: true, children: [_jsx(Tag, { children: taskId }), _jsx(Text, { type: "secondary", children: "\u6B63\u5728\u52A0\u8F7D\u4EFB\u52A1\u6458\u8981\u2026" })] }) }));
    }
    return (_jsxs(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: [_jsx(Card, { className: "page-card current-task-summary-card", children: _jsxs(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: [_jsxs(Space, { wrap: true, children: [_jsx(Tag, { color: "blue", children: taskSummary.title || '未命名任务' }), _jsx(Tag, { children: taskId }), _jsx(Tag, { color: "gold", children: taskStatusLabelMap[taskSummary.status] || taskSummary.status }), taskSummary.rqLevel ? _jsx(Tag, { color: "purple", children: taskSummary.rqLevel }) : null, _jsx(Tag, { children: reviewStatusLabelMap[taskSummary.reviewStatus] || taskSummary.reviewStatus })] }), _jsxs(Row, { gutter: [16, 16], children: [_jsx(Col, { xs: 12, md: 6, children: _jsx(Statistic, { title: "\u5F53\u524D\u8282\u70B9", value: taskSummary.currentNode || '未开始' }) }), _jsx(Col, { xs: 12, md: 6, children: _jsx(Statistic, { title: "\u8F93\u5165\u7C7B\u578B", value: taskSummary.inputType }) }), _jsx(Col, { xs: 12, md: 6, children: _jsx(Statistic, { title: "\u5206\u6790\u6A21\u5F0F", value: taskSummary.taskMode }) }), _jsx(Col, { xs: 12, md: 6, children: _jsx(Statistic, { title: "\u9884\u8BA1\u6210\u672C", value: taskSummary.stats.costEstimate || 0, suffix: "\u5143" }) })] })] }) }), taskSummary.stats.warnings.length ? (_jsx(Alert, { type: "warning", showIcon: true, message: "\u8BE5\u4EFB\u52A1\u5B58\u5728\u63D0\u9192", description: taskSummary.stats.warnings.join('；') })) : null] }));
};
