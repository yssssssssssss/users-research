import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Descriptions, Empty, Row, Space, Statistic, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { ProvenanceSummaryCard } from '../components/ProvenanceSummaryCard';
import { RouteLoading } from '../components/RouteLoading';
import { api } from '../lib/api';
import { TASK_DETAIL_EVIDENCE_PATH, TASK_DETAIL_OVERVIEW_PATH, TASK_DETAIL_REPORT_PATH } from '../lib/navigation';
import { buildProvenanceSummary } from '../lib/provenance';
import { useTaskStore } from '../store/taskStore';
const ResultDetailPanels = lazy(() => import('../components/result/ResultDetailPanels').then((module) => ({ default: module.ResultDetailPanels })));
const { Title, Paragraph, Text } = Typography;
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
const reportStatusLabelMap = {
    approved: '已通过',
    pending_review: '待审核',
    rejected: '已退回',
    draft: '草稿',
};
const reportStatusColorMap = {
    approved: 'green',
    pending_review: 'gold',
    rejected: 'red',
    draft: 'default',
};
const sourceTypeLabelMap = {
    experience_model: '体验模型',
    vision_generated: 'Vision',
    persona_generated: 'Persona',
};
const asRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;
const asStringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
const takeFirstSentence = (value) => {
    if (!value)
        return undefined;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized)
        return undefined;
    return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
};
const buildEvidencePriority = (item) => {
    const tierWeight = { T1: 0, T2: 1, T3: 2 }[item.tier] ?? 9;
    const reviewWeight = { accepted: 0, unreviewed: 1, downgraded: 2, rejected: 3 }[item.reviewStatus] ?? 9;
    const usedWeight = item.isUsedInReport ? 0 : 1;
    return `${usedWeight}-${reviewWeight}-${tierWeight}`;
};
const buildVisionPriority = (item) => {
    const riskWeight = { high: 0, medium: 1, low: 2 }[item.riskLevel] ?? 9;
    const conflictWeight = item.isConflict ? 0 : 1;
    return `${riskWeight}-${conflictWeight}`;
};
const buildPersonaPriority = (item) => item.stance === 'mixed' || item.stance === 'confused' ? 0 : 1;
export const ResultPage = () => {
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const taskSummary = useTaskStore((state) => state.taskSummary);
    const taskState = useTaskStore((state) => state.taskState);
    const selectedOutput = useTaskStore((state) => state.selectedOutput);
    const currentReport = useTaskStore((state) => state.currentReport);
    const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
    const setTaskState = useTaskStore((state) => state.setTaskState);
    const setSelectedOutput = useTaskStore((state) => state.setSelectedOutput);
    const [report, setReport] = useState();
    const [reportLoading, setReportLoading] = useState(false);
    const loadTaskContext = useCallback(async () => {
        if (!currentTaskId)
            return undefined;
        const [summary, state] = await Promise.all([
            api.getTask(currentTaskId),
            api.getTaskState(currentTaskId),
        ]);
        setTaskSummary(summary);
        setTaskState(state);
        return { summary, state };
    }, [currentTaskId, setTaskState, setTaskSummary]);
    useEffect(() => {
        if (!currentTaskId)
            return;
        if (taskSummary && taskState)
            return;
        void loadTaskContext();
    }, [currentTaskId, loadTaskContext, taskState, taskSummary]);
    useEffect(() => {
        if (!selectedOutput && taskState?.candidateOutputs[0]) {
            setSelectedOutput(taskState.candidateOutputs[0]);
        }
    }, [selectedOutput, setSelectedOutput, taskState?.candidateOutputs]);
    const reportRefs = useMemo(() => (taskState?.finalReports || [])
        .filter((item) => item.reportType === selectedOutput?.outputType)
        .sort((left, right) => right.version - left.version), [selectedOutput?.outputType, taskState?.finalReports]);
    const latestReportId = reportRefs[0]?.id;
    useEffect(() => {
        if (!selectedOutput) {
            setReportLoading(false);
            setReport(undefined);
            return;
        }
        if (!latestReportId) {
            setReportLoading(false);
            setReport(undefined);
            return;
        }
        if (currentReport?.id === latestReportId && currentReport.reportType === selectedOutput.outputType) {
            setReportLoading(false);
            setReport(currentReport);
            return;
        }
        let disposed = false;
        setReportLoading(true);
        api.getReport(latestReportId)
            .then((nextReport) => {
            if (!disposed)
                setReport(nextReport);
        })
            .catch(() => {
            if (!disposed)
                setReport(undefined);
        })
            .finally(() => {
            if (!disposed)
                setReportLoading(false);
        });
        return () => {
            disposed = true;
        };
    }, [currentReport, latestReportId, selectedOutput]);
    const content = useMemo(() => asRecord(selectedOutput?.contentJson), [selectedOutput?.contentJson]);
    const judgmentCards = useMemo(() => {
        const judgments = Array.isArray(content?.judgments)
            ? content.judgments
                .map((item) => asRecord(item))
                .filter(Boolean)
                .map((item, index) => ({
                key: `${item?.title || 'judgment'}-${index}`,
                title: typeof item?.title === 'string' && item.title.trim()
                    ? item.title
                    : `关键判断 ${index + 1}`,
                content: typeof item?.content === 'string' && item.content.trim()
                    ? item.content
                    : '暂无内容',
                confidence: typeof item?.confidence === 'string' ? item.confidence : undefined,
                risk: typeof item?.risk === 'string' ? item.risk : undefined,
            }))
            : [];
        if (judgments.length > 0)
            return judgments.slice(0, 3);
        return (report?.sections || []).slice(0, 3).map((section, index) => ({
            key: `${section.type}-${section.title}-${index}`,
            title: section.title || `关键判断 ${index + 1}`,
            content: section.content || '暂无内容',
            confidence: undefined,
            risk: section.type,
        }));
    }, [content?.judgments, report?.sections]);
    const conclusion = useMemo(() => selectedOutput?.summary
        || takeFirstSentence(judgmentCards[0]?.content)
        || takeFirstSentence(report?.sections[0]?.content)
        || '当前结果已生成，可进入细节验证与审核。', [judgmentCards, report?.sections, selectedOutput?.summary]);
    const nextActions = useMemo(() => {
        const actions = asStringArray(content?.nextActions);
        if (actions.length > 0)
            return actions.slice(0, 5);
        const fromSection = report?.sections.find((section) => /建议|行动|下一步/.test(section.title));
        return fromSection?.content
            ? fromSection.content
                .split(/\r?\n|；|;/)
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 5)
            : [];
    }, [content?.nextActions, report?.sections]);
    const experienceModels = useMemo(() => (taskState?.evidencePool || [])
        .filter((item) => item.sourceType === 'experience_model')
        .map((item) => {
        const trace = asRecord(item.traceLocation);
        return {
            id: item.id,
            name: item.sourceName || '体验模型',
            content: item.content,
            dimensions: asStringArray(trace?.dimensions),
            reasons: asStringArray(trace?.selectionReasons),
            questions: asStringArray(trace?.evaluationQuestions),
            mode: trace?.selectionMode === 'manual' ? '手动覆盖' : '自动推荐',
        };
    }), [taskState?.evidencePool]);
    const evidenceHighlights = useMemo(() => (taskState?.evidencePool || [])
        .filter((item) => item.reviewStatus !== 'rejected')
        .sort((left, right) => buildEvidencePriority(left).localeCompare(buildEvidencePriority(right)))
        .slice(0, 5), [taskState?.evidencePool]);
    const visionHighlights = useMemo(() => (taskState?.visionFindings || [])
        .slice()
        .sort((left, right) => buildVisionPriority(left).localeCompare(buildVisionPriority(right)))
        .slice(0, 4), [taskState?.visionFindings]);
    const personaHighlights = useMemo(() => (taskState?.personaFindings || [])
        .slice()
        .sort((left, right) => buildPersonaPriority(left) - buildPersonaPriority(right))
        .slice(0, 4), [taskState?.personaFindings]);
    const provenanceSummary = useMemo(() => buildProvenanceSummary({
        taskState,
        taskSummary,
        selectedOutput,
        report,
    }), [report, selectedOutput, taskState, taskSummary]);
    if (!currentTaskId) {
        return _jsx(Empty, { description: "\u8BF7\u5148\u521B\u5EFA\u4EFB\u52A1\uFF0C\u518D\u67E5\u770B\u7ED3\u679C\u5C55\u793A\u9875" });
    }
    if (!taskSummary || !taskState) {
        return _jsx(Card, { loading: true, className: "page-card" });
    }
    if (!selectedOutput) {
        return (_jsx(Empty, { description: "\u8BE5\u4EFB\u52A1\u5C1A\u672A\u5F62\u6210\u53EF\u5C55\u793A\u7684\u5019\u9009\u7ED3\u679C", image: Empty.PRESENTED_IMAGE_SIMPLE }));
    }
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsxs(Space, { align: "start", style: { width: '100%', justifyContent: 'space-between' }, wrap: true, children: [_jsxs("div", { children: [_jsx(Title, { level: 3, style: { marginBottom: 8 }, children: "\u7ED3\u679C\u603B\u89C8" }), _jsx(Paragraph, { type: "secondary", style: { marginBottom: 0 }, children: "\u805A\u5408\u5F53\u524D\u8F93\u51FA\u7684\u7ED3\u8BBA\u3001\u8BC1\u636E\u6458\u8981\u548C\u4E0B\u4E00\u6B65\u52A8\u4F5C\uFF0C\u9002\u5408\u6F14\u793A\u3001\u8BC4\u5BA1\u4E0E\u6848\u4F8B\u56DE\u653E\u3002" })] }), _jsxs(Space, { wrap: true, children: [_jsx(Button, { children: _jsx(Link, { to: TASK_DETAIL_OVERVIEW_PATH(currentTaskId), children: "\u8FD4\u56DE\u603B\u89C8" }) }), _jsx(Button, { children: _jsx(Link, { to: TASK_DETAIL_EVIDENCE_PATH(currentTaskId), children: "\u67E5\u770B\u8BC1\u636E\u6C60" }) }), _jsx(Button, { type: "primary", children: _jsx(Link, { to: TASK_DETAIL_REPORT_PATH(currentTaskId), children: "\u8FDB\u5165\u7EFC\u5408\u62A5\u544A" }) })] })] }), report?.gateResult.blockedReasons?.length ? (_jsx(Alert, { type: "warning", showIcon: true, message: "\u5F53\u524D\u7ED3\u679C\u5B58\u5728\u95E8\u7981\u9650\u5236", description: report.gateResult.blockedReasons.join('；') })) : null, _jsx(ProvenanceSummaryCard, { summary: provenanceSummary }), _jsx(Card, { className: "page-card", children: _jsxs(Row, { gutter: [16, 16], children: [_jsx(Col, { xs: 24, md: 12, xl: 8, children: _jsxs(Descriptions, { column: 1, size: "small", title: "\u4EFB\u52A1\u6458\u8981", children: [_jsx(Descriptions.Item, { label: "\u6807\u9898", children: taskSummary.title || '未命名任务' }), _jsx(Descriptions.Item, { label: "\u95EE\u9898", children: taskSummary.query }), _jsx(Descriptions.Item, { label: "\u4E00\u53E5\u8BDD\u7ED3\u8BBA", children: conclusion })] }) }), _jsx(Col, { xs: 24, md: 12, xl: 16, children: _jsxs(Row, { gutter: [16, 16], children: [_jsx(Col, { xs: 12, md: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: "\u4EFB\u52A1\u72B6\u6001", value: taskStatusLabelMap[taskSummary.status] || taskSummary.status }) }) }), _jsx(Col, { xs: 12, md: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: "RQ \u7B49\u7EA7", value: taskSummary.rqLevel || '未判定' }) }) }), _jsx(Col, { xs: 12, md: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: "\u5BA1\u6838\u72B6\u6001", value: reviewStatusLabelMap[taskSummary.reviewStatus] || taskSummary.reviewStatus }) }) }), _jsx(Col, { xs: 12, md: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: "\u5019\u9009\u7ED3\u679C", value: taskState.candidateOutputs.length }) }) })] }) })] }) }), _jsxs(Row, { gutter: [16, 16], children: [_jsx(Col, { xs: 24, xl: 15, children: _jsx(Card, { title: "\u6838\u5FC3\u7ED3\u8BBA", className: "page-card", children: judgmentCards.length ? (_jsx(Row, { gutter: [16, 16], children: judgmentCards.map((item) => (_jsx(Col, { xs: 24, md: 12, children: _jsx(Card, { type: "inner", title: item.title, children: _jsxs(Space, { direction: "vertical", size: 8, style: { width: '100%' }, children: [_jsx(Paragraph, { style: { marginBottom: 0 }, children: item.content }), _jsxs(Space, { wrap: true, children: [item.confidence ? _jsxs(Tag, { color: "blue", children: ["\u7F6E\u4FE1\u5EA6\uFF1A", item.confidence] }) : null, item.risk ? _jsx(Tag, { children: item.risk }) : null] })] }) }) }, item.key))) })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u7ED3\u679C\u6682\u672A\u5F62\u6210\u7ED3\u6784\u5316\u7ED3\u8BBA" })) }) }), _jsx(Col, { xs: 24, xl: 9, children: _jsx(Card, { title: "\u5F53\u524D\u6210\u679C\u72B6\u6001", className: "page-card", loading: reportLoading, children: _jsxs(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: [_jsxs(Space, { wrap: true, children: [_jsxs(Tag, { color: "blue", children: ["\u8F93\u51FA\uFF1A", selectedOutput.outputType] }), _jsxs(Tag, { color: selectedOutput.gateLevel === 'allowed' ? 'green' : selectedOutput.gateLevel === 'blocked_by_rq' ? 'red' : 'gold', children: ["\u95E8\u7981\uFF1A", selectedOutput.gateLevel || '未标注'] }), _jsxs(Tag, { children: ["\u8282\u70B9\uFF1A", selectedOutput.sourceNode] })] }), _jsx(Paragraph, { style: { marginBottom: 0 }, children: selectedOutput.summary || '当前候选结果已生成，可继续查看报告、证据和体验模型视角。' }), report ? (_jsxs(Space, { wrap: true, children: [_jsxs(Tag, { color: reportStatusColorMap[report.status] || 'default', children: ["\u62A5\u544A\uFF1A", reportStatusLabelMap[report.status] || report.status] }), _jsxs(Tag, { children: ["\u7248\u672C\uFF1Av", report.version] }), _jsxs(Tag, { children: ["Tier \u8986\u76D6\uFF1AT1 ", report.gateResult.tierCoverage.T1, " / T2 ", report.gateResult.tierCoverage.T2, " / T3 ", report.gateResult.tierCoverage.T3] })] })) : (_jsx(Alert, { type: "info", showIcon: true, message: "\u5F53\u524D\u8FD8\u6CA1\u6709\u6700\u7EC8\u62A5\u544A\u7248\u672C", description: "\u4F60\u4ECD\u7136\u53EF\u4EE5\u5148\u67E5\u770B\u5019\u9009\u7ED3\u679C\u3001\u4F53\u9A8C\u6A21\u578B\u548C\u8BC1\u636E\u6982\u89C8\u3002" }))] }) }) })] }), _jsx(OutputPreviewCard, { output: selectedOutput, provenanceTags: provenanceSummary.tags, fallbackWarnings: provenanceSummary.fallbackWarnings }), _jsx(Suspense, { fallback: _jsx(RouteLoading, {}), children: _jsx(ResultDetailPanels, { experienceModels: experienceModels, evidenceHighlights: evidenceHighlights, sourceTypeLabelMap: sourceTypeLabelMap, visionHighlights: visionHighlights, personaHighlights: personaHighlights, nextActions: nextActions, boundaryNotes: provenanceSummary.boundaryNotes }) })] }));
};
