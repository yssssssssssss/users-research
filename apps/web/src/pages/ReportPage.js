import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Radio, Space, Typography, message } from 'antd';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { ProvenanceSummaryCard } from '../components/ProvenanceSummaryCard';
import { RouteLoading } from '../components/RouteLoading';
import { api } from '../lib/api';
import { buildProvenanceSummary } from '../lib/provenance';
import { useTaskStore } from '../store/taskStore';
const ReportTabsPanel = lazy(() => import('../components/report/ReportTabsPanel').then((module) => ({ default: module.ReportTabsPanel })));
const { Title, Paragraph, Text } = Typography;
const reportStatusColorMap = {
    approved: 'green',
    pending_review: 'gold',
    rejected: 'red',
    draft: 'default',
};
const reportStatusLabelMap = {
    approved: '已通过',
    pending_review: '待审核',
    rejected: '已退回',
    draft: '草稿',
};
const diffStatusColorMap = {
    added: 'green',
    removed: 'red',
    changed: 'gold',
    unchanged: 'default',
};
const diffStatusLabelMap = {
    added: '新增',
    removed: '删除',
    changed: '修改',
    unchanged: '未变更',
};
const getSectionKey = (section) => `${section.type}::${section.title}`;
const reportGenerationLocks = new Set();
const buildSectionDiff = (baseReport, targetReport) => {
    if (!baseReport || !targetReport)
        return [];
    const baseMap = new Map(baseReport.sections.map((section) => [getSectionKey(section), section]));
    const targetMap = new Map(targetReport.sections.map((section) => [getSectionKey(section), section]));
    const keys = Array.from(new Set([...baseMap.keys(), ...targetMap.keys()]));
    return keys
        .map((key) => {
        const before = baseMap.get(key);
        const after = targetMap.get(key);
        if (!before && after) {
            return {
                key,
                title: after.title,
                type: after.type,
                status: 'added',
                after: after.content,
            };
        }
        if (before && !after) {
            return {
                key,
                title: before.title,
                type: before.type,
                status: 'removed',
                before: before.content,
            };
        }
        const status = before?.content === after?.content ? 'unchanged' : 'changed';
        return {
            key,
            title: after?.title || before?.title || key,
            type: after?.type || before?.type || 'unknown',
            status,
            before: before?.content,
            after: after?.content,
        };
    })
        .sort((left, right) => {
        const order = {
            changed: 0,
            added: 1,
            removed: 2,
            unchanged: 3,
        };
        return order[left.status] - order[right.status];
    });
};
export const ReportPage = () => {
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const taskSummary = useTaskStore((state) => state.taskSummary);
    const taskState = useTaskStore((state) => state.taskState);
    const selectedOutput = useTaskStore((state) => state.selectedOutput);
    const currentReport = useTaskStore((state) => state.currentReport);
    const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
    const setTaskState = useTaskStore((state) => state.setTaskState);
    const setSelectedOutput = useTaskStore((state) => state.setSelectedOutput);
    const setCurrentReport = useTaskStore((state) => state.setCurrentReport);
    const [submitting, setSubmitting] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyReports, setHistoryReports] = useState([]);
    const [activeReportId, setActiveReportId] = useState();
    const [historyMode, setHistoryMode] = useState(false);
    const [compareBaseId, setCompareBaseId] = useState();
    const [compareTargetId, setCompareTargetId] = useState();
    const candidateOutputs = useMemo(() => taskState?.candidateOutputs || [], [taskState?.candidateOutputs]);
    const refreshTaskContext = useCallback(async () => {
        if (!currentTaskId)
            return undefined;
        const [summary, state] = await Promise.all([
            api.getTask(currentTaskId),
            api.getTaskState(currentTaskId),
        ]);
        setTaskSummary(summary);
        setTaskState(state);
        return state;
    }, [currentTaskId, setTaskState, setTaskSummary]);
    useEffect(() => {
        if (!currentTaskId || taskState)
            return;
        void refreshTaskContext().then((state) => {
            if (!selectedOutput && state?.candidateOutputs[0]) {
                setSelectedOutput(state.candidateOutputs[0]);
            }
        });
    }, [currentTaskId, refreshTaskContext, selectedOutput, setSelectedOutput, taskState]);
    useEffect(() => {
        if (!selectedOutput && candidateOutputs[0]) {
            setSelectedOutput(candidateOutputs[0]);
        }
    }, [candidateOutputs, selectedOutput, setSelectedOutput]);
    const reportHistoryRefs = useMemo(() => (taskState?.finalReports || [])
        .filter((item) => item.reportType === selectedOutput?.outputType)
        .sort((left, right) => right.version - left.version), [selectedOutput?.outputType, taskState?.finalReports]);
    const latestReportId = reportHistoryRefs[0]?.id;
    const isViewingHistoryVersion = Boolean(currentReport &&
        latestReportId &&
        currentReport.reportType === selectedOutput?.outputType &&
        currentReport.id !== latestReportId);
    useEffect(() => {
        setHistoryMode(false);
        setActiveReportId(undefined);
        setCompareBaseId(undefined);
        setCompareTargetId(undefined);
        setCurrentReport(undefined);
    }, [selectedOutput?.outputType, setCurrentReport]);
    useEffect(() => {
        const reportIdsKey = reportHistoryRefs.map((item) => item.id).join('|');
        if (!currentTaskId || !selectedOutput || !reportIdsKey) {
            setHistoryReports([]);
            return;
        }
        let disposed = false;
        setHistoryLoading(true);
        Promise.all(reportHistoryRefs.map((item) => api.getReport(item.id)))
            .then((reports) => {
            if (disposed)
                return;
            const sortedReports = reports.sort((left, right) => right.version - left.version);
            setHistoryReports(sortedReports);
            setCompareTargetId((prev) => prev && sortedReports.some((item) => item.id === prev)
                ? prev
                : sortedReports[0]?.id);
            setCompareBaseId((prev) => prev && sortedReports.some((item) => item.id === prev)
                ? prev
                : sortedReports[1]?.id || sortedReports[0]?.id);
        })
            .finally(() => {
            if (!disposed)
                setHistoryLoading(false);
        });
        return () => {
            disposed = true;
        };
    }, [currentTaskId, reportHistoryRefs, selectedOutput]);
    useEffect(() => {
        if (!currentTaskId || !selectedOutput)
            return;
        if (!latestReportId) {
            const generationKey = `${currentTaskId}:${selectedOutput.id}`;
            if (reportGenerationLocks.has(generationKey)) {
                return;
            }
            reportGenerationLocks.add(generationKey);
            let disposed = false;
            api.generateReport(currentTaskId, selectedOutput.id)
                .then(async (report) => {
                if (disposed)
                    return;
                setActiveReportId(report.id);
                setHistoryMode(false);
                setCurrentReport(report);
                await refreshTaskContext();
            })
                .catch((error) => {
                if (!disposed) {
                    message.error(error instanceof Error ? error.message : '自动生成报告失败');
                }
            })
                .finally(() => {
                reportGenerationLocks.delete(generationKey);
            });
            return () => {
                disposed = true;
            };
        }
        const targetReportId = historyMode && activeReportId ? activeReportId : latestReportId;
        if (currentReport?.id === targetReportId)
            return;
        let disposed = false;
        api.getReport(targetReportId).then((report) => {
            if (!disposed)
                setCurrentReport(report);
        });
        return () => {
            disposed = true;
        };
    }, [
        activeReportId,
        currentReport?.id,
        currentTaskId,
        historyMode,
        latestReportId,
        refreshTaskContext,
        selectedOutput,
        setCurrentReport,
    ]);
    const compareBaseReport = useMemo(() => historyReports.find((item) => item.id === compareBaseId), [compareBaseId, historyReports]);
    const compareTargetReport = useMemo(() => historyReports.find((item) => item.id === compareTargetId), [compareTargetId, historyReports]);
    const diffItems = useMemo(() => buildSectionDiff(compareBaseReport, compareTargetReport), [compareBaseReport, compareTargetReport]);
    const diffSummary = useMemo(() => diffItems.reduce((acc, item) => {
        acc[item.status] += 1;
        return acc;
    }, { added: 0, removed: 0, changed: 0, unchanged: 0 }), [diffItems]);
    const provenanceSummary = useMemo(() => buildProvenanceSummary({
        taskState,
        taskSummary,
        selectedOutput,
        report: currentReport,
    }), [currentReport, selectedOutput, taskState, taskSummary]);
    const selectReportVersion = useCallback(async (reportId) => {
        const nextReport = await api.getReport(reportId);
        setActiveReportId(reportId);
        setHistoryMode(reportId !== latestReportId);
        setCurrentReport(nextReport);
    }, [latestReportId, setCurrentReport]);
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
            await refreshTaskContext();
            message.success(action === 'approve' ? '报告已通过审核' : '报告已退回重做');
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
    if (!candidateOutputs.length)
        return _jsx(Empty, { description: "\u8BE5\u4EFB\u52A1\u8FD8\u6CA1\u6709\u53EF\u751F\u6210\u62A5\u544A\u7684\u5019\u9009\u8F93\u51FA" });
    if (!currentReport || !selectedOutput)
        return _jsx(Card, { loading: true, className: "page-card" });
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Title, { level: 3, style: { marginBottom: 8 }, children: "\u7EFC\u5408\u62A5\u544A" }), _jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: "\u7BA1\u7406\u5F53\u524D\u8F93\u51FA\u7684\u6B63\u5F0F\u62A5\u544A\u3001\u7248\u672C\u5386\u53F2\u3001\u5DEE\u5F02\u5BF9\u6BD4\u4E0E\u5BA1\u6838\u72B6\u6001\u3002" })] }), selectedOutput.gateLevel === 'blocked_by_rq' ? (_jsx(Alert, { type: "warning", showIcon: true, message: "\u5F53\u524D\u8F93\u51FA\u88AB RQ \u95E8\u7981\u9650\u5236", description: currentReport.gateResult.blockedReasons?.length
                    ? currentReport.gateResult.blockedReasons.join('；')
                    : '你仍可预览内容，但正式发布前需要补足证据等级与审核。' })) : null, isViewingHistoryVersion ? (_jsx(Alert, { type: "info", showIcon: true, message: `当前正在回看历史版本 v${currentReport.version}`, description: _jsxs(Space, { direction: "vertical", size: 8, children: [_jsx(Text, { children: "\u5386\u53F2\u7248\u672C\u4EC5\u7528\u4E8E\u56DE\u770B\u4E0E\u5BF9\u6BD4\uFF0C\u4E0D\u4F1A\u8986\u76D6\u5F53\u524D\u6700\u65B0\u7248\u672C\u3002" }), _jsx(Button, { type: "link", style: { paddingInline: 0 }, onClick: () => {
                                if (latestReportId)
                                    void selectReportVersion(latestReportId);
                            }, children: "\u8FD4\u56DE\u6700\u65B0\u7248\u672C" })] }) })) : null, currentReport.reviewMeta ? (_jsx(Alert, { type: currentReport.reviewMeta.action === 'approve' ? 'success' : 'info', showIcon: true, message: currentReport.reviewMeta.action === 'approve' ? '该报告已通过审核' : '该报告已被退回重做', description: `审核时间：${currentReport.reviewMeta.reviewedAt}${currentReport.reviewMeta.reviewer ? `；审核人：${currentReport.reviewMeta.reviewer}` : ''}` })) : null, _jsx(ProvenanceSummaryCard, { summary: provenanceSummary }), _jsxs(Card, { className: "page-card", children: [_jsxs(Paragraph, { children: ["\u5F53\u524D\u67E5\u770B\u7248\u672C\uFF1Av", currentReport.version] }), _jsxs(Paragraph, { children: ["\u62A5\u544A\u7C7B\u578B\uFF1A", currentReport.reportType] }), _jsxs(Paragraph, { children: ["\u5BA1\u6838\u72B6\u6001\uFF1A", reportStatusLabelMap[currentReport.status] || currentReport.status] }), _jsxs(Paragraph, { children: ["\u6765\u6E90\u8282\u70B9\uFF1A", selectedOutput.sourceNode] }), _jsxs(Paragraph, { children: ["\u95E8\u7981\u7EA7\u522B\uFF1A", selectedOutput.gateLevel || '未标注'] }), _jsx(Radio.Group, { value: selectedOutput.id, onChange: (event) => {
                            const next = candidateOutputs.find((item) => item.id === event.target.value);
                            if (next)
                                setSelectedOutput(next);
                        }, children: _jsx(Space, { wrap: true, children: candidateOutputs.map((output) => (_jsx(Radio.Button, { value: output.id, children: output.outputType }, output.id))) }) })] }), _jsx(OutputPreviewCard, { output: selectedOutput, provenanceTags: provenanceSummary.tags, fallbackWarnings: provenanceSummary.fallbackWarnings }), _jsx(Suspense, { fallback: _jsx(RouteLoading, {}), children: _jsx(ReportTabsPanel, { currentReport: currentReport, historyLoading: historyLoading, historyReports: historyReports, reportStatusColorMap: reportStatusColorMap, reportStatusLabelMap: reportStatusLabelMap, currentReportId: currentReport.id, latestReportId: latestReportId, selectReportVersion: selectReportVersion, compareBaseId: compareBaseId, compareTargetId: compareTargetId, setCompareBaseId: setCompareBaseId, setCompareTargetId: setCompareTargetId, diffSummary: diffSummary, diffItems: diffItems, compareBaseReport: compareBaseReport, compareTargetReport: compareTargetReport, diffStatusColorMap: diffStatusColorMap, diffStatusLabelMap: diffStatusLabelMap }) }), _jsxs(Space, { children: [_jsx(Button, { type: "primary", loading: submitting, disabled: currentReport.status === 'approved' || Boolean(currentReport.gateResult.blockedReasons?.length), onClick: () => handleReview('approve'), children: "\u901A\u8FC7" }), _jsx(Button, { loading: submitting, disabled: currentReport.status === 'rejected', onClick: () => handleReview('request_rework'), children: "\u9000\u56DE\u91CD\u505A" })] })] }));
};
