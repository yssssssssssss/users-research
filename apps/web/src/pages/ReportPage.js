import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Collapse, Descriptions, Empty, List, Radio, Row, Space, Statistic, Tag, Typography, message } from 'antd';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { ProvenanceSummaryCard } from '../components/ProvenanceSummaryCard';
import { RouteLoading } from '../components/RouteLoading';
import { api } from '../lib/api';
import { buildProvenanceSummary } from '../lib/provenance';
import { splitTaskWarnings } from '../lib/taskWarnings';
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
const confidenceColorMap = {
    high: 'green',
    medium: 'gold',
    low: 'red',
};
const gateColorMap = {
    allowed: 'green',
    review_required: 'gold',
    blocked_by_rq: 'red',
};
const getSectionKey = (section) => `${section.type}::${section.title}`;
const reportGenerationLocks = new Set();
const takeFirstSentence = (value, maxLength = 140) => {
    if (!value)
        return undefined;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized)
        return undefined;
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};
const buildSectionBuckets = (sections) => {
    const buckets = {
        decisionSections: [],
        evidenceSections: [],
        analysisSections: [],
        boundarySections: [],
        otherSections: [],
    };
    for (const section of sections) {
        if (['summary', 'gate', 'action'].includes(section.type)) {
            buckets.decisionSections.push(section);
            continue;
        }
        if (['evidence', 'external_evidence', 'search_leads'].includes(section.type)) {
            buckets.evidenceSections.push(section);
            continue;
        }
        if (['framework', 'vision', 'persona'].includes(section.type)) {
            buckets.analysisSections.push(section);
            continue;
        }
        if (['boundary', 'review'].includes(section.type)) {
            buckets.boundarySections.push(section);
            continue;
        }
        buckets.otherSections.push(section);
    }
    return buckets;
};
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
    const [reportLoading, setReportLoading] = useState(false);
    const [reportError, setReportError] = useState();
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
    const isViewingHistoryVersion = Boolean(currentReport
        && latestReportId
        && currentReport.reportType === selectedOutput?.outputType
        && currentReport.id !== latestReportId);
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
            setReportLoading(true);
            setReportError(undefined);
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
                    const nextError = error instanceof Error ? error.message : '自动生成报告失败';
                    setReportError(nextError);
                    message.error(nextError);
                }
            })
                .finally(() => {
                if (!disposed)
                    setReportLoading(false);
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
        setReportLoading(true);
        setReportError(undefined);
        api.getReport(targetReportId)
            .then((report) => {
            if (!disposed)
                setCurrentReport(report);
        })
            .catch((error) => {
            if (!disposed) {
                const nextError = error instanceof Error ? error.message : '加载报告失败';
                setReportError(nextError);
                message.error(nextError);
            }
        })
            .finally(() => {
            if (!disposed)
                setReportLoading(false);
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
    const warningGroups = useMemo(() => splitTaskWarnings(taskSummary?.stats.warnings), [taskSummary?.stats.warnings]);
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
    const handleRetryReport = useCallback(async () => {
        if (!currentTaskId || !selectedOutput)
            return;
        setReportError(undefined);
        setReportLoading(true);
        try {
            const report = await api.generateReport(currentTaskId, selectedOutput.id);
            setActiveReportId(report.id);
            setHistoryMode(false);
            setCurrentReport(report);
            await refreshTaskContext();
            message.success('报告已重新生成');
        }
        catch (error) {
            const nextError = error instanceof Error ? error.message : '重新生成报告失败';
            setReportError(nextError);
            message.error(nextError);
        }
        finally {
            setReportLoading(false);
        }
    }, [currentTaskId, refreshTaskContext, selectedOutput, setCurrentReport]);
    if (!currentTaskId)
        return _jsx(Empty, { description: "\u8BF7\u5148\u521B\u5EFA\u4EFB\u52A1" });
    if (!candidateOutputs.length)
        return _jsx(Empty, { description: "\u8BE5\u4EFB\u52A1\u8FD8\u6CA1\u6709\u53EF\u751F\u6210\u62A5\u544A\u7684\u5019\u9009\u8F93\u51FA" });
    if (!selectedOutput)
        return _jsx(Card, { loading: true, className: "page-card" });
    if (!currentReport && !reportError)
        return _jsx(Card, { loading: true, className: "page-card" });
    if (!currentReport) {
        return (_jsx(Card, { className: "page-card", children: _jsx(Empty, { description: reportError || '当前还没有成功加载正式报告', image: Empty.PRESENTED_IMAGE_SIMPLE, children: _jsx(Space, { children: _jsx(Button, { type: "primary", loading: reportLoading, onClick: () => void handleRetryReport(), children: "\u91CD\u65B0\u751F\u6210\u62A5\u544A" }) }) }) }));
    }
    const sectionBuckets = buildSectionBuckets(currentReport.sections);
    const primaryDecision = selectedOutput.summary
        || takeFirstSentence(sectionBuckets.decisionSections[0]?.content, 160)
        || takeFirstSentence(currentReport.sections[0]?.content, 160)
        || '当前已生成正式报告，但仍需结合下方依据与审核边界阅读。';
    const actionItems = sectionBuckets.decisionSections
        .filter((section) => section.type === 'action')
        .flatMap((section) => section.content.split(/\r?\n|；|;/).map((item) => item.trim()).filter(Boolean))
        .slice(0, 5);
    const summaryConfidence = selectedOutput.contentJson
        && typeof selectedOutput.contentJson === 'object'
        && !Array.isArray(selectedOutput.contentJson)
        && Array.isArray(selectedOutput.contentJson.judgments)
        ? selectedOutput.contentJson.judgments
            .find((item) => typeof item?.confidence === 'string')?.confidence
        : undefined;
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Title, { level: 3, style: { marginBottom: 8 }, children: "\u6B63\u5F0F\u62A5\u544A" }), _jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: "\u8FD9\u662F\u6B63\u5F0F\u4EA7\u7269\u9875\u3002\u9996\u5C4F\u5148\u770B\u6B63\u5F0F\u7ED3\u8BBA\u3001\u6B63\u5F0F\u4F9D\u636E\u3001\u5BA1\u6838\u8FB9\u754C\uFF1B\u5B8C\u6574\u6B63\u6587\u548C\u7248\u672C\u80FD\u529B\u653E\u5728\u4E0B\u9762\u3002" })] }), _jsx(Alert, { type: "info", showIcon: true, message: "\u6B63\u5F0F\u62A5\u544A vs \u7EFC\u5408\u7ED3\u8BBA", description: "\u7EFC\u5408\u7ED3\u8BBA\u7528\u4E8E\u5FEB\u901F\u6D88\u8D39\uFF1B\u6B63\u5F0F\u62A5\u544A\u7528\u4E8E\u6B63\u5F0F\u7559\u6863\u3001\u7248\u672C\u7BA1\u7406\u3001Gate \u4E0E\u5BA1\u6838\u3002" }), selectedOutput.gateLevel === 'blocked_by_rq' ? (_jsx(Alert, { type: "warning", showIcon: true, message: "\u5F53\u524D\u8F93\u51FA\u88AB RQ \u95E8\u7981\u9650\u5236", description: currentReport.gateResult.blockedReasons?.length
                    ? currentReport.gateResult.blockedReasons.join('；')
                    : '你仍可预览内容，但正式发布前需要补足证据等级与审核。' })) : null, isViewingHistoryVersion ? (_jsx(Alert, { type: "info", showIcon: true, message: `当前正在回看历史版本 v${currentReport.version}`, description: _jsxs(Space, { direction: "vertical", size: 8, children: [_jsx(Text, { children: "\u5386\u53F2\u7248\u672C\u53EA\u7528\u4E8E\u56DE\u770B\u4E0E\u5BF9\u6BD4\uFF0C\u4E0D\u4F1A\u8986\u76D6\u6700\u65B0\u6B63\u5F0F\u7248\u672C\u3002" }), _jsx(Button, { type: "link", style: { paddingInline: 0 }, onClick: () => {
                                if (latestReportId)
                                    void selectReportVersion(latestReportId);
                            }, children: "\u8FD4\u56DE\u6700\u65B0\u7248\u672C" })] }) })) : null, _jsx(Card, { className: "page-card", title: "\u7B2C\u4E00\u5C42\uFF1A\u6B63\u5F0F\u7ED3\u8BBA", children: _jsxs(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: [_jsxs(Row, { gutter: [16, 16], children: [_jsx(Col, { xs: 24, xl: 14, children: _jsxs(Descriptions, { column: 1, size: "small", title: "\u5F53\u524D\u6B63\u5F0F\u7ED3\u8BBA", children: [_jsx(Descriptions.Item, { label: "\u4EFB\u52A1", children: taskSummary?.title || '未命名任务' }), _jsx(Descriptions.Item, { label: "\u95EE\u9898", children: taskSummary?.query || '未记录' }), _jsx(Descriptions.Item, { label: "\u62A5\u544A\u7ED3\u8BBA", children: primaryDecision })] }) }), _jsx(Col, { xs: 24, xl: 10, children: _jsxs(Row, { gutter: [12, 12], children: [_jsx(Col, { xs: 12, md: 6, xl: 12, children: _jsx(Card, { size: "small", children: _jsx(Statistic, { title: "\u5F53\u524D\u7248\u672C", value: `v${currentReport.version}` }) }) }), _jsx(Col, { xs: 12, md: 6, xl: 12, children: _jsx(Card, { size: "small", children: _jsx(Statistic, { title: "\u62A5\u544A\u72B6\u6001", value: reportStatusLabelMap[currentReport.status] || currentReport.status }) }) }), _jsx(Col, { xs: 12, md: 6, xl: 12, children: _jsx(Card, { size: "small", children: _jsx(Statistic, { title: "RQ", value: currentReport.gateResult.rqLevel || taskSummary?.rqLevel || '未判定' }) }) }), _jsx(Col, { xs: 12, md: 6, xl: 12, children: _jsx(Card, { size: "small", children: _jsx(Statistic, { title: "\u7AE0\u8282\u6570", value: currentReport.sections.length }) }) })] }) })] }), _jsxs(Space, { wrap: true, children: [_jsxs(Tag, { color: reportStatusColorMap[currentReport.status] || 'default', children: ["\u6B63\u5F0F\u72B6\u6001\uFF1A", reportStatusLabelMap[currentReport.status] || currentReport.status] }), _jsxs(Tag, { color: gateColorMap[selectedOutput.gateLevel || 'review_required'] || 'default', children: ["\u95E8\u7981\uFF1A", selectedOutput.gateLevel || '未标注'] }), _jsxs(Tag, { children: ["\u6765\u6E90\u8282\u70B9\uFF1A", selectedOutput.sourceNode] }), summaryConfidence ? (_jsxs(Tag, { color: confidenceColorMap[summaryConfidence] || 'default', children: ["\u53EF\u4FE1\u5EA6\uFF1A", summaryConfidence] })) : null, warningGroups.authenticityDowngrade.length ? _jsx(Tag, { color: "red", children: "\u771F\u5B9E\u6027\u5DF2\u964D\u7EA7" }) : null] }), _jsxs(Row, { gutter: [16, 16], children: [_jsx(Col, { xs: 24, xl: 14, children: _jsx(Card, { type: "inner", title: "\u6B63\u5F0F\u6B63\u6587\u4E2D\u7684\u5173\u952E\u7AE0\u8282", children: sectionBuckets.decisionSections.length ? (_jsx(List, { itemLayout: "vertical", dataSource: sectionBuckets.decisionSections.slice(0, 4), renderItem: (section) => (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", size: 8, style: { width: '100%' }, children: [_jsxs(Space, { wrap: true, children: [_jsx(Text, { strong: true, children: section.title }), _jsx(Tag, { color: "blue", children: section.type })] }), _jsx(Paragraph, { style: { whiteSpace: 'pre-wrap', marginBottom: 0 }, children: takeFirstSentence(section.content, 220) || section.content })] }) }, `${section.type}-${section.title}`)) })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u62A5\u544A\u6CA1\u6709\u72EC\u7ACB\u7684\u7ED3\u8BBA\u7AE0\u8282" })) }) }), _jsx(Col, { xs: 24, xl: 10, children: _jsx(Card, { type: "inner", title: "\u5EFA\u8BAE\u52A8\u4F5C", children: actionItems.length ? (_jsx(List, { size: "small", dataSource: actionItems, renderItem: (item) => _jsx(List.Item, { children: item }) })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u6B63\u5F0F\u62A5\u544A\u4E2D\u6682\u65E0\u5355\u5217\u884C\u52A8\u9879" })) }) })] })] }) }), _jsx(Card, { className: "page-card", title: "\u7B2C\u4E8C\u5C42\uFF1A\u6B63\u5F0F\u4F9D\u636E", children: _jsxs(Row, { gutter: [16, 16], children: [_jsx(Col, { xs: 24, xl: 12, children: _jsx(Card, { type: "inner", title: "\u8BC1\u636E\u7AE0\u8282", children: sectionBuckets.evidenceSections.length ? (_jsx(List, { itemLayout: "vertical", dataSource: sectionBuckets.evidenceSections.slice(0, 4), renderItem: (section) => (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", size: 8, style: { width: '100%' }, children: [_jsxs(Space, { wrap: true, children: [_jsx(Text, { strong: true, children: section.title }), _jsx(Tag, { color: section.type === 'search_leads' ? 'gold' : 'green', children: section.type })] }), _jsx(Paragraph, { style: { whiteSpace: 'pre-wrap', marginBottom: 0 }, children: takeFirstSentence(section.content, 260) || section.content })] }) }, `${section.type}-${section.title}`)) })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u6B63\u5F0F\u62A5\u544A\u4E2D\u6CA1\u6709\u72EC\u7ACB\u8BC1\u636E\u7AE0\u8282" })) }) }), _jsx(Col, { xs: 24, xl: 12, children: _jsxs(Card, { type: "inner", title: "\u8F85\u52A9\u5206\u6790\u7AE0\u8282", children: [_jsx(Paragraph, { type: "secondary", children: "\u4F53\u9A8C\u6A21\u578B / \u89C6\u89C9 / Persona \u53EA\u4F5C\u4E3A\u8F85\u52A9\u89E3\u91CA\uFF0C\u4E0D\u7B49\u4E8E\u771F\u5B9E\u8BC1\u636E\u3002" }), sectionBuckets.analysisSections.length ? (_jsx(List, { itemLayout: "vertical", dataSource: sectionBuckets.analysisSections.slice(0, 4), renderItem: (section) => (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", size: 8, style: { width: '100%' }, children: [_jsxs(Space, { wrap: true, children: [_jsx(Text, { strong: true, children: section.title }), _jsx(Tag, { children: section.type })] }), _jsx(Paragraph, { style: { whiteSpace: 'pre-wrap', marginBottom: 0 }, children: takeFirstSentence(section.content, 220) || section.content })] }) }, `${section.type}-${section.title}`)) })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u6B63\u5F0F\u62A5\u544A\u4E2D\u6CA1\u6709\u8F85\u52A9\u5206\u6790\u7AE0\u8282" }))] }) })] }) }), _jsx(Card, { className: "page-card", title: "\u7B2C\u4E09\u5C42\uFF1A\u5BA1\u6838\u4E0E\u8FB9\u754C", children: _jsxs(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: [warningGroups.authenticityDowngrade.length ? (_jsx(Alert, { type: "warning", showIcon: true, message: "\u771F\u5B9E\u6027\u964D\u7EA7\u5DF2\u89E6\u53D1", description: warningGroups.authenticityDowngrade.join('；') })) : null, currentReport.reviewMeta ? (_jsx(Alert, { type: currentReport.reviewMeta.action === 'approve' ? 'success' : 'info', showIcon: true, message: currentReport.reviewMeta.action === 'approve' ? '该报告已通过审核' : '该报告已被退回重做', description: `审核时间：${currentReport.reviewMeta.reviewedAt}${currentReport.reviewMeta.reviewer ? `；审核人：${currentReport.reviewMeta.reviewer}` : ''}` })) : null, _jsxs(Row, { gutter: [16, 16], children: [_jsx(Col, { xs: 24, xl: 8, children: _jsx(Card, { type: "inner", title: "Gate \u7ED3\u679C", children: _jsxs(Space, { direction: "vertical", size: 8, style: { width: '100%' }, children: [_jsxs(Text, { children: ["RQ\uFF1A", currentReport.gateResult.rqLevel || '未判定'] }), _jsxs(Text, { children: ["\u5C4F\u853D\u6765\u6E90\uFF1A", currentReport.gateResult.blockedSources.join('、') || '无'] }), _jsxs(Text, { children: ["\u95E8\u7981\u539F\u56E0\uFF1A", currentReport.gateResult.blockedReasons?.join('；') || '无'] })] }) }) }), _jsx(Col, { xs: 24, xl: 8, children: _jsx(Card, { type: "inner", title: "\u8FB9\u754C\u4E0E\u590D\u6838\u7AE0\u8282", children: sectionBuckets.boundarySections.length ? (_jsx(List, { size: "small", dataSource: sectionBuckets.boundarySections.slice(0, 5), renderItem: (section) => (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", size: 4, children: [_jsxs(Space, { wrap: true, children: [_jsx(Text, { strong: true, children: section.title }), _jsx(Tag, { children: section.type })] }), _jsx("span", { children: takeFirstSentence(section.content, 180) || section.content })] }) }, `${section.type}-${section.title}`)) })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u6CA1\u6709\u72EC\u7ACB\u7684\u8FB9\u754C\u7AE0\u8282" })) }) }), _jsx(Col, { xs: 24, xl: 8, children: _jsx(Card, { type: "inner", title: "\u64CD\u4F5C", children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsx(Radio.Group, { value: selectedOutput.id, onChange: (event) => {
                                                        const next = candidateOutputs.find((item) => item.id === event.target.value);
                                                        if (next)
                                                            setSelectedOutput(next);
                                                    }, children: _jsx(Space, { wrap: true, children: candidateOutputs.map((output) => (_jsx(Radio.Button, { value: output.id, children: output.outputType }, output.id))) }) }), _jsxs(Space, { children: [_jsx(Button, { type: "primary", loading: submitting, disabled: currentReport.status === 'approved' || Boolean(currentReport.gateResult.blockedReasons?.length), onClick: () => handleReview('approve'), children: "\u901A\u8FC7" }), _jsx(Button, { loading: submitting, disabled: currentReport.status === 'rejected', onClick: () => handleReview('request_rework'), children: "\u9000\u56DE\u91CD\u505A" })] })] }) }) })] }), warningGroups.otherWarnings.length ? (_jsx(Card, { type: "inner", title: "\u5176\u4ED6\u63D0\u9192", children: _jsx(List, { size: "small", dataSource: warningGroups.otherWarnings.slice(0, 5), renderItem: (item) => _jsx(List.Item, { children: item }) }) })) : null] }) }), _jsx(Collapse, { items: [
                    {
                        key: 'formal-details',
                        label: '展开正式正文、版本历史与调试细节',
                        children: (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsx(ProvenanceSummaryCard, { summary: provenanceSummary }), _jsx(OutputPreviewCard, { output: selectedOutput, provenanceTags: provenanceSummary.tags, fallbackWarnings: provenanceSummary.fallbackWarnings }), _jsx(Suspense, { fallback: _jsx(RouteLoading, {}), children: _jsx(ReportTabsPanel, { currentReport: currentReport, historyLoading: historyLoading, historyReports: historyReports, reportStatusColorMap: reportStatusColorMap, reportStatusLabelMap: reportStatusLabelMap, currentReportId: currentReport.id, latestReportId: latestReportId, selectReportVersion: selectReportVersion, compareBaseId: compareBaseId, compareTargetId: compareTargetId, setCompareBaseId: setCompareBaseId, setCompareTargetId: setCompareTargetId, diffSummary: diffSummary, diffItems: diffItems, compareBaseReport: compareBaseReport, compareTargetReport: compareTargetReport, diffStatusColorMap: diffStatusColorMap, diffStatusLabelMap: diffStatusLabelMap }) })] })),
                    },
                ] })] }));
};
