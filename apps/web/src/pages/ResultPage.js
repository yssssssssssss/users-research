import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Collapse, Empty, List, Row, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { OutputPreviewCard } from '../components/OutputPreviewCard';
import { ProvenanceSummaryCard } from '../components/ProvenanceSummaryCard';
import { RouteLoading } from '../components/RouteLoading';
import { api } from '../lib/api';
import { getEvidenceAuthenticityKind, getEvidenceAuthenticityTag, getEvidenceSourceDomain } from '../lib/evidenceMeta';
import { TASK_DETAIL_EVIDENCE_PATH, TASK_DETAIL_OVERVIEW_PATH, TASK_DETAIL_REPORT_PATH } from '../lib/navigation';
import { buildProvenanceSummary } from '../lib/provenance';
import { splitTaskWarnings } from '../lib/taskWarnings';
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
const asRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;
const asStringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
const takeFirstSentence = (value, maxLength = 120) => {
    if (!value)
        return undefined;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized)
        return undefined;
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
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
const formatEvidenceMeta = (item) => [item.sourceName || '未命名来源', getEvidenceSourceDomain(item), item.sourceDate].filter(Boolean).join('｜');
export const ResultPage = () => {
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const taskSummary = useTaskStore((state) => state.taskSummary);
    const taskState = useTaskStore((state) => state.taskState);
    const selectedOutput = useTaskStore((state) => state.selectedOutput);
    const currentReport = useTaskStore((state) => state.currentReport);
    const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
    const setTaskState = useTaskStore((state) => state.setTaskState);
    const setSelectedOutput = useTaskStore((state) => state.setSelectedOutput);
    const synthesisResult = taskState?.synthesisResult;
    const moduleResults = taskState?.moduleResults;
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
        || takeFirstSentence(synthesisResult?.conclusions?.[0]?.content, 150)
        || takeFirstSentence(judgmentCards[0]?.content, 150)
        || takeFirstSentence(report?.sections[0]?.content, 150)
        || '当前结果已生成，但仍需继续校验证据与边界。', [judgmentCards, report?.sections, selectedOutput?.summary, synthesisResult?.conclusions]);
    const nextActions = useMemo(() => {
        const actions = synthesisResult?.nextResearchActions || synthesisResult?.topRecommendations || asStringArray(content?.nextActions);
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
    const reviewNotes = useMemo(() => asStringArray(content?.reviewNotes).slice(0, 5), [content?.reviewNotes]);
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
    const { fetchedArticleHighlights, searchLeadHighlights, evidenceHighlights } = useMemo(() => {
        const rankedEvidence = (taskState?.evidencePool || [])
            .filter((item) => item.reviewStatus !== 'rejected')
            .sort((left, right) => buildEvidencePriority(left).localeCompare(buildEvidencePriority(right)));
        const fetchedArticleHighlights = [];
        const searchLeadHighlights = [];
        const evidenceHighlights = [];
        for (const item of rankedEvidence) {
            const authenticity = getEvidenceAuthenticityKind(item);
            if (authenticity === 'fetched_article' || authenticity === 'fetched_document') {
                if (fetchedArticleHighlights.length < 3)
                    fetchedArticleHighlights.push(item);
                continue;
            }
            if (authenticity === 'search_result') {
                if (searchLeadHighlights.length < 3)
                    searchLeadHighlights.push(item);
                continue;
            }
            if (evidenceHighlights.length < 5) {
                evidenceHighlights.push(item);
            }
        }
        return {
            fetchedArticleHighlights,
            searchLeadHighlights,
            evidenceHighlights,
        };
    }, [taskState?.evidencePool]);
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
    const warningGroups = useMemo(() => splitTaskWarnings(taskSummary?.stats.warnings), [taskSummary?.stats.warnings]);
    const primaryConfidence = judgmentCards.find((item) => item.confidence)?.confidence || '未标注';
    const verifiedEvidenceHighlights = useMemo(() => [...fetchedArticleHighlights, ...evidenceHighlights]
        .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
        .filter((item) => {
        const authenticity = getEvidenceAuthenticityKind(item);
        return authenticity === 'reviewed_external' || authenticity === 'fetched_article' || authenticity === 'fetched_document' || authenticity === 'internal';
    })
        .slice(0, 4), [evidenceHighlights, fetchedArticleHighlights]);
    const evidenceGapNotes = useMemo(() => {
        const notes = [];
        if (searchLeadHighlights.length > 0) {
            notes.push(`仍有 ${searchLeadHighlights.length} 条外部搜索线索未完成抓取或复核`);
        }
        if (provenanceSummary.acceptedRealEvidenceCount === 0) {
            notes.push('当前没有已接受的真实证据可直接支撑最终定论');
        }
        if (!report) {
            notes.push('当前还没有最终报告版本，仍以候选结果为准');
        }
        return notes;
    }, [provenanceSummary.acceptedRealEvidenceCount, report, searchLeadHighlights.length]);
    if (!currentTaskId) {
        return _jsx(Empty, { description: "\u8BF7\u5148\u521B\u5EFA\u4EFB\u52A1\uFF0C\u518D\u67E5\u770B\u7ED3\u679C\u5C55\u793A\u9875" });
    }
    if (!taskSummary || !taskState) {
        return _jsx(Card, { loading: true, className: "page-card" });
    }
    if (!selectedOutput) {
        return (_jsx(Empty, { description: "\u8BE5\u4EFB\u52A1\u5C1A\u672A\u5F62\u6210\u53EF\u5C55\u793A\u7684\u5019\u9009\u7ED3\u679C", image: Empty.PRESENTED_IMAGE_SIMPLE }));
    }
    const heroBackground = selectedOutput.gateLevel === 'blocked_by_rq'
        ? '#fff1f0'
        : primaryConfidence === 'high'
            ? '#f6ffed'
            : primaryConfidence === 'medium'
                ? '#fffbe6'
                : '#fafafa';
    const heroBorderColor = selectedOutput.gateLevel === 'blocked_by_rq'
        ? '#ffccc7'
        : primaryConfidence === 'high'
            ? '#b7eb8f'
            : primaryConfidence === 'medium'
                ? '#ffe58f'
                : '#f0f0f0';
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx(Title, { level: 4, style: { marginBottom: 4 }, children: "\u7EFC\u5408\u7ED3\u8BBA" }), _jsx(Text, { type: "secondary", style: { wordBreak: 'break-word' }, children: taskSummary.title || '未命名任务' })] }), _jsxs(Space, { wrap: true, style: { flexShrink: 0 }, children: [_jsx(Button, { size: "small", children: _jsx(Link, { to: TASK_DETAIL_OVERVIEW_PATH(currentTaskId), children: "\u8FD4\u56DE\u603B\u89C8" }) }), _jsx(Button, { size: "small", children: _jsx(Link, { to: TASK_DETAIL_EVIDENCE_PATH(currentTaskId), children: "\u67E5\u770B\u8BC1\u636E\u6C60" }) }), _jsx(Button, { size: "small", type: "primary", children: _jsx(Link, { to: TASK_DETAIL_REPORT_PATH(currentTaskId), children: "\u8FDB\u5165\u6B63\u5F0F\u62A5\u544A" }) })] })] }), _jsxs("div", { style: {
                    background: heroBackground,
                    border: `1px solid ${heroBorderColor}`,
                    borderRadius: 8,
                    padding: '20px 24px',
                }, children: [taskSummary.query && (_jsx(Text, { type: "secondary", style: { fontSize: 12, display: 'block', marginBottom: 8, wordBreak: 'break-word' }, children: taskSummary.query })), _jsx(Paragraph, { style: { fontSize: 17, fontWeight: 500, marginBottom: 12, wordBreak: 'break-word', lineHeight: 1.7 }, children: conclusion }), _jsxs(Space, { wrap: true, children: [_jsxs(Tag, { color: confidenceColorMap[primaryConfidence] || 'default', children: ["\u53EF\u4FE1\u5EA6\uFF1A", primaryConfidence] }), _jsxs(Tag, { color: gateColorMap[selectedOutput.gateLevel || 'review_required'] || 'default', children: ["\u95E8\u7981\uFF1A", selectedOutput.gateLevel || '未标注'] }), _jsxs(Tag, { children: ["RQ\uFF1A", taskSummary.rqLevel || '未判定'] }), _jsxs(Tag, { children: ["\u8F93\u51FA\uFF1A", selectedOutput.outputType] }), warningGroups.authenticityDowngrade.length > 0 && (_jsx(Tag, { color: "red", children: "\u771F\u5B9E\u6027\u5DF2\u964D\u7EA7" }))] })] }), _jsxs(Row, { gutter: [24, 24], children: [_jsxs(Col, { xs: 24, xl: 16, children: [_jsx(Text, { strong: true, style: { fontSize: 15, display: 'block', marginBottom: 12 }, children: "\u5173\u952E\u5224\u65AD" }), judgmentCards.length ? (_jsx(Space, { direction: "vertical", size: 12, style: { width: '100%' }, children: judgmentCards.map((item, index) => (_jsxs("div", { style: {
                                        display: 'flex',
                                        gap: 16,
                                        padding: '16px',
                                        background: '#fafafa',
                                        borderRadius: 6,
                                        border: '1px solid #f0f0f0',
                                    }, children: [_jsx("div", { style: {
                                                fontSize: 22,
                                                fontWeight: 700,
                                                color: '#d9d9d9',
                                                lineHeight: 1.2,
                                                flexShrink: 0,
                                                width: 24,
                                                paddingTop: 2,
                                            }, children: index + 1 }), _jsxs("div", { style: { minWidth: 0, flex: 1 }, children: [_jsxs("div", { style: {
                                                        display: 'flex',
                                                        flexWrap: 'wrap',
                                                        gap: 6,
                                                        alignItems: 'center',
                                                        marginBottom: 6,
                                                    }, children: [_jsx(Text, { strong: true, className: "content-wrap-safe", children: item.title }), item.confidence && (_jsx(Tag, { color: confidenceColorMap[item.confidence] || 'default', style: { margin: 0 }, children: item.confidence })), item.risk && _jsx(Tag, { style: { margin: 0 }, children: item.risk })] }), _jsx(Paragraph, { className: "content-wrap-safe content-wrap-safe-pre", style: { marginBottom: 0, color: '#595959' }, children: item.content })] })] }, item.key))) })) : (_jsx(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: "\u5F53\u524D\u7ED3\u679C\u6682\u672A\u5F62\u6210\u7ED3\u6784\u5316\u7ED3\u8BBA" }))] }), _jsx(Col, { xs: 24, xl: 8, children: _jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Text, { strong: true, style: { fontSize: 15, display: 'block', marginBottom: 12 }, children: "\u72B6\u6001\u6458\u8981" }), _jsx(Space, { direction: "vertical", size: 10, style: { width: '100%' }, children: [
                                                { label: '任务状态', value: taskStatusLabelMap[taskSummary.status] || taskSummary.status },
                                                { label: '审核状态', value: reviewStatusLabelMap[taskSummary.reviewStatus] || taskSummary.reviewStatus },
                                                { label: '真实证据', value: `${provenanceSummary.acceptedRealEvidenceCount} 条` },
                                                { label: '待核查线索', value: `${provenanceSummary.pendingExternalEvidenceCount} 条` },
                                            ].map(({ label, value }) => (_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }, children: [_jsx(Text, { type: "secondary", children: label }), _jsx(Text, { style: { flexShrink: 0 }, children: value })] }, label))) })] }), _jsxs("div", { children: [_jsx(Text, { strong: true, style: { fontSize: 15, display: 'block', marginBottom: 12 }, children: "\u5EFA\u8BAE\u4E0B\u4E00\u6B65" }), nextActions.length ? (_jsx(Space, { direction: "vertical", size: 6, style: { width: '100%' }, children: nextActions.map((item, index) => (_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'flex-start' }, children: [_jsx("span", { style: { color: '#1677ff', flexShrink: 0, lineHeight: '22px' }, children: "\u2022" }), _jsx(Text, { style: { wordBreak: 'break-word' }, children: item })] }, index))) })) : (_jsx(Text, { type: "secondary", style: { fontSize: 13 }, children: "\u6682\u65E0\u660E\u786E\u4E0B\u4E00\u6B65\u5EFA\u8BAE" }))] })] }) })] }), _jsxs("div", { children: [_jsx(Text, { strong: true, style: { fontSize: 15, display: 'block', marginBottom: 12 }, children: "\u4F9D\u636E\u6458\u8981" }), _jsxs(Space, { wrap: true, style: { marginBottom: 12 }, children: [_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 6 }, children: [_jsx("span", { style: { color: '#52c41a', fontWeight: 600 }, children: "\u2713" }), _jsxs(Text, { children: ["\u5DF2\u9A8C\u8BC1\u5916\u90E8\u8BC1\u636E ", _jsx(Text, { strong: true, children: fetchedArticleHighlights.length }), " \u6761"] })] }), searchLeadHighlights.length > 0 && (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 6 }, children: [_jsx("span", { style: { color: '#faad14', fontWeight: 600 }, children: "\u26A0" }), _jsxs(Text, { children: ["\u5F85\u6838\u67E5\u7EBF\u7D22 ", _jsx(Text, { strong: true, children: searchLeadHighlights.length }), " \u6761"] })] })), verifiedEvidenceHighlights.length > 0 && (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 6 }, children: [_jsx("span", { style: { color: '#1677ff', fontWeight: 600 }, children: "\u25CB" }), _jsxs(Text, { children: ["\u5176\u4ED6\u5DF2\u9A8C\u8BC1\u4F9D\u636E ", _jsx(Text, { strong: true, children: verifiedEvidenceHighlights.length }), " \u6761"] })] })), !report && (_jsx(Text, { type: "secondary", style: { fontSize: 13 }, children: "\u6682\u65E0\u62A5\u544A\u7248\u672C" }))] }), _jsx(Collapse, { size: "small", items: [
                            {
                                key: 'evidence-detail',
                                label: '展开查看证据详情',
                                children: (_jsxs(Space, { direction: "vertical", size: 16, style: { width: '100%' }, children: [verifiedEvidenceHighlights.length > 0 && (_jsxs("div", { children: [_jsx(Text, { strong: true, style: { display: 'block', marginBottom: 8 }, children: "\u5DF2\u9A8C\u8BC1\u4F9D\u636E" }), _jsx(List, { size: "small", itemLayout: "vertical", dataSource: verifiedEvidenceHighlights, renderItem: (item) => {
                                                        const authenticityTag = getEvidenceAuthenticityTag(item);
                                                        return (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", size: 6, className: "content-block-safe", children: [_jsxs(Space, { wrap: true, children: [_jsx(Tag, { color: item.tier === 'T1'
                                                                                    ? 'green'
                                                                                    : item.tier === 'T2'
                                                                                        ? 'blue'
                                                                                        : 'gold', children: item.tier }), _jsx(Tag, { color: authenticityTag.color, children: authenticityTag.label }), item.isUsedInReport && _jsx(Tag, { color: "cyan", children: "\u5DF2\u5165\u62A5\u544A" })] }), _jsx(Paragraph, { className: "content-wrap-safe content-wrap-safe-pre", style: { marginBottom: 0 }, children: takeFirstSentence(item.content, 160) }), _jsx(Text, { type: "secondary", className: "content-wrap-safe", children: formatEvidenceMeta(item) })] }) }, item.id));
                                                    } })] })), visionHighlights.length > 0 && (_jsxs("div", { children: [_jsx(Text, { strong: true, style: { display: 'block', marginBottom: 4 }, children: "\u89C6\u89C9\u89C2\u5BDF\uFF08\u8F85\u52A9\uFF09" }), _jsx(Text, { type: "secondary", style: { fontSize: 12, display: 'block', marginBottom: 8 }, children: "\u53EA\u4F5C\u4E3A\u8F85\u52A9\u7EBF\u7D22\uFF0C\u4E0D\u80FD\u5355\u72EC\u66FF\u4EE3\u771F\u5B9E\u8BC1\u636E\u3002" }), _jsx(List, { size: "small", dataSource: visionHighlights.slice(0, 3), renderItem: (item) => (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", size: 4, className: "content-block-safe", children: [_jsxs(Space, { wrap: true, children: [_jsx(Tag, { color: item.riskLevel === 'high'
                                                                                ? 'red'
                                                                                : item.riskLevel === 'medium'
                                                                                    ? 'gold'
                                                                                    : 'blue', children: item.riskLevel }), _jsx(Tag, { children: item.findingType }), item.isConflict && _jsx(Tag, { color: "purple", children: "\u6709\u5206\u6B67" })] }), _jsx("span", { className: "content-wrap-safe content-wrap-safe-pre", children: item.content })] }) }, item.id)) })] })), personaHighlights.length > 0 && (_jsxs("div", { children: [_jsx(Text, { strong: true, style: { display: 'block', marginBottom: 4 }, children: "\u6A21\u62DF\u7528\u6237\u53CD\u9988\uFF08\u8F85\u52A9\uFF09" }), _jsx(Text, { type: "secondary", style: { fontSize: 12, display: 'block', marginBottom: 8 }, children: "\u8FD9\u662F Persona \u6A21\u62DF\uFF0C\u4E0D\u662F\u771F\u5B9E\u7528\u6237\u8BBF\u8C08\u539F\u59CB\u8BC1\u636E\u3002" }), _jsx(List, { size: "small", dataSource: personaHighlights.slice(0, 3), renderItem: (item) => (_jsx(List.Item, { children: _jsxs(Space, { direction: "vertical", size: 4, className: "content-block-safe", children: [_jsxs(Space, { wrap: true, children: [_jsx(Tag, { color: "purple", children: item.personaName }), item.stance && _jsx(Tag, { children: item.stance }), item.theme && _jsx(Tag, { color: "blue", children: item.theme })] }), _jsx("span", { className: "content-wrap-safe content-wrap-safe-pre", children: item.content })] }) }, item.id)) })] })), evidenceGapNotes.length > 0 && (_jsx(Alert, { type: "warning", showIcon: true, message: "\u4F9D\u636E\u4ECD\u6709\u7F3A\u53E3", description: evidenceGapNotes.join('；') }))] })),
                            },
                        ] })] }), (warningGroups.authenticityDowngrade.length > 0 ||
                (report?.gateResult.blockedReasons?.length ?? 0) > 0 ||
                provenanceSummary.boundaryNotes.length > 0) && (_jsxs("div", { children: [_jsx(Text, { strong: true, style: { fontSize: 15, display: 'block', marginBottom: 12 }, children: "\u98CE\u9669\u4E0E\u8FB9\u754C" }), _jsxs(Space, { direction: "vertical", size: 8, style: { width: '100%' }, children: [warningGroups.authenticityDowngrade.length > 0 && (_jsxs("div", { style: {
                                    borderLeft: '4px solid #faad14',
                                    paddingLeft: 12,
                                    paddingTop: 8,
                                    paddingBottom: 8,
                                    background: '#fffbe6',
                                    borderRadius: '0 4px 4px 0',
                                }, children: [_jsx(Text, { strong: true, style: { color: '#d46b08', display: 'block', marginBottom: 4 }, children: "\u771F\u5B9E\u6027\u964D\u7EA7\u5DF2\u89E6\u53D1" }), _jsx(Text, { className: "content-wrap-safe", children: warningGroups.authenticityDowngrade.join('；') })] })), (report?.gateResult.blockedReasons?.length ?? 0) > 0 && (_jsxs("div", { style: {
                                    borderLeft: '4px solid #ff4d4f',
                                    paddingLeft: 12,
                                    paddingTop: 8,
                                    paddingBottom: 8,
                                    background: '#fff1f0',
                                    borderRadius: '0 4px 4px 0',
                                }, children: [_jsx(Text, { strong: true, style: { color: '#cf1322', display: 'block', marginBottom: 4 }, children: "\u5F53\u524D\u7ED3\u679C\u5B58\u5728\u95E8\u7981\u9650\u5236" }), _jsx(Text, { className: "content-wrap-safe", children: report.gateResult.blockedReasons.join('；') })] })), provenanceSummary.boundaryNotes.length > 0 && (_jsxs("div", { style: {
                                    borderLeft: '4px solid #d9d9d9',
                                    paddingLeft: 12,
                                    paddingTop: 8,
                                    paddingBottom: 8,
                                }, children: [_jsx(Text, { strong: true, style: { display: 'block', marginBottom: 4 }, children: "\u771F\u5B9E\u6027\u8FB9\u754C\u8BF4\u660E" }), _jsx(Space, { direction: "vertical", size: 4, style: { width: '100%' }, children: provenanceSummary.boundaryNotes.slice(0, 5).map((note, i) => (_jsx(Text, { type: "secondary", className: "content-wrap-safe", style: { display: 'block' }, children: note }, i))) })] }))] })] })), _jsx(Collapse, { items: [
                    {
                        key: 'full-detail',
                        label: '展开完整分析链路',
                        children: (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsx(ProvenanceSummaryCard, { summary: provenanceSummary }), _jsx(OutputPreviewCard, { output: selectedOutput, provenanceTags: provenanceSummary.tags, fallbackWarnings: provenanceSummary.fallbackWarnings }), _jsx(Suspense, { fallback: _jsx(RouteLoading, {}), children: _jsx(ResultDetailPanels, { experienceModels: experienceModels, evidenceHighlights: evidenceHighlights, fetchedArticleHighlights: fetchedArticleHighlights, searchLeadHighlights: searchLeadHighlights, sourceTypeLabelMap: sourceTypeLabelMap, visionHighlights: visionHighlights, personaHighlights: personaHighlights, nextActions: nextActions, boundaryNotes: provenanceSummary.boundaryNotes }) })] })),
                    },
                ] })] }));
};
