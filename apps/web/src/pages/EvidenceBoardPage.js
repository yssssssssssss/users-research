import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Card, Empty, Space, Statistic, Typography, message } from 'antd';
import { RouteLoading } from '../components/RouteLoading';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';
const { Title, Paragraph, Link, Text } = Typography;
const EvidenceReviewTable = lazy(() => import('../components/evidence/EvidenceReviewTable').then((module) => ({ default: module.EvidenceReviewTable })));
const RECOMPUTE_POLL_INTERVAL_MS = 2000;
const MAX_RECOMPUTE_POLL_ATTEMPTS = 12;
const tierColorMap = {
    T1: 'green',
    T2: 'orange',
    T3: 'blue',
};
const reviewColorMap = {
    accepted: 'green',
    downgraded: 'gold',
    rejected: 'red',
    unreviewed: 'default',
};
const reviewLabelMap = {
    accepted: '已接受',
    downgraded: '已降权',
    rejected: '已拒绝',
    unreviewed: '未复核',
};
const isJudgmentRecomputing = (task) => task?.status === 'running' && task.currentNode === 'judgment_synthesizer';
export const EvidenceBoardPage = () => {
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const taskSummary = useTaskStore((state) => state.taskSummary);
    const taskState = useTaskStore((state) => state.taskState);
    const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
    const setTaskState = useTaskStore((state) => state.setTaskState);
    const [items, setItems] = useState([]);
    const [summary, setSummary] = useState({ total: 0, tier1: 0, tier2: 0, tier3: 0, conflictCount: 0 });
    const [tierDrafts, setTierDrafts] = useState({});
    const [submittingId, setSubmittingId] = useState();
    const [pollAttempt, setPollAttempt] = useState(0);
    const [nextRefreshIn, setNextRefreshIn] = useState(0);
    const [notifyWhenRecomputeDone, setNotifyWhenRecomputeDone] = useState(false);
    const loadEvidence = useCallback(async () => {
        if (!currentTaskId)
            return undefined;
        const [evidence, nextTaskSummary, nextTaskState] = await Promise.all([
            api.getEvidence(currentTaskId),
            api.getTask(currentTaskId),
            api.getTaskState(currentTaskId),
        ]);
        setItems(evidence.items);
        setSummary(evidence.summary);
        setTaskSummary(nextTaskSummary);
        setTaskState(nextTaskState);
        setTierDrafts((prev) => {
            const next = { ...prev };
            evidence.items.forEach((item) => {
                next[item.id] = prev[item.id] || item.tier;
            });
            return next;
        });
        return { nextTaskSummary, nextTaskState };
    }, [currentTaskId, setTaskState, setTaskSummary]);
    useEffect(() => {
        void loadEvidence();
    }, [loadEvidence]);
    const isRecomputing = isJudgmentRecomputing(taskState) || isJudgmentRecomputing(taskSummary);
    const actionLocked = Boolean(submittingId) || isRecomputing;
    useEffect(() => {
        if (!currentTaskId || !isRecomputing) {
            setPollAttempt(0);
            setNextRefreshIn(0);
            return undefined;
        }
        let disposed = false;
        let countdownTimer;
        let pollTimer;
        const runPollCycle = (attempt) => {
            if (disposed)
                return;
            if (attempt > MAX_RECOMPUTE_POLL_ATTEMPTS) {
                setNextRefreshIn(0);
                message.warning('后台重算时间较长，请稍后手动刷新证据看板。');
                return;
            }
            setPollAttempt(attempt);
            setNextRefreshIn(RECOMPUTE_POLL_INTERVAL_MS / 1000);
            countdownTimer = setInterval(() => {
                setNextRefreshIn((prev) => {
                    const next = Number((prev - 0.5).toFixed(1));
                    return next > 0 ? next : 0;
                });
            }, 500);
            pollTimer = setTimeout(async () => {
                if (countdownTimer)
                    clearInterval(countdownTimer);
                const snapshot = await loadEvidence();
                if (disposed)
                    return;
                if (isJudgmentRecomputing(snapshot?.nextTaskState)) {
                    runPollCycle(attempt + 1);
                }
                else {
                    setNextRefreshIn(0);
                }
            }, RECOMPUTE_POLL_INTERVAL_MS);
        };
        runPollCycle(1);
        return () => {
            disposed = true;
            if (countdownTimer)
                clearInterval(countdownTimer);
            if (pollTimer)
                clearTimeout(pollTimer);
        };
    }, [currentTaskId, isRecomputing, loadEvidence]);
    useEffect(() => {
        if (!isRecomputing && notifyWhenRecomputeDone) {
            message.success('证据复核与综合重算已完成。');
            setNotifyWhenRecomputeDone(false);
        }
    }, [isRecomputing, notifyWhenRecomputeDone]);
    const tierOptions = useMemo(() => [
        { label: 'T1', value: 'T1' },
        { label: 'T2', value: 'T2' },
        { label: 'T3', value: 'T3' },
    ], []);
    const handleReview = async (item, reviewStatus) => {
        setSubmittingId(item.id);
        try {
            const result = await api.reviewEvidence(item.id, {
                reviewStatus,
                tier: tierDrafts[item.id] || item.tier,
                reviewer: 'evidence_board',
            });
            await loadEvidence();
            if (result.recomputeStatus === 'queued') {
                setNotifyWhenRecomputeDone(true);
                message.info('证据复核已提交，系统正在后台重算 RQ 与输出 Gate。');
                return;
            }
            message.success('证据复核已更新。');
        }
        catch (error) {
            message.error(error instanceof Error ? error.message : '证据复核失败');
        }
        finally {
            setSubmittingId(undefined);
        }
    };
    if (!currentTaskId) {
        return _jsx(Empty, { description: "\u8BF7\u5148\u521B\u5EFA\u4EFB\u52A1" });
    }
    return (_jsxs(Space, { direction: "vertical", size: 24, style: { width: '100%' }, children: [_jsx(Title, { level: 2, children: "\u8BC1\u636E\u770B\u677F" }), isRecomputing ? (_jsx(Alert, { type: "info", showIcon: true, message: "\u540E\u53F0\u6B63\u5728\u91CD\u7B97\u7EFC\u5408\u5224\u65AD\uFF0C\u65B0\u7684\u8BC1\u636E\u590D\u6838\u5DF2\u4E34\u65F6\u9501\u5B9A", description: _jsxs(Space, { direction: "vertical", size: 4, children: [_jsx(Text, { children: "\u7CFB\u7EDF\u6B63\u5728\u91CD\u65B0\u8BA1\u7B97 RQ\u3001\u5019\u9009\u8F93\u51FA\u4E0E\u670D\u52A1\u7AEF Gate\uFF0C\u8BF7\u7B49\u5F85\u5F53\u524D\u91CD\u7B97\u7ED3\u675F\u540E\u518D\u7EE7\u7EED\u63D0\u4EA4\u3002" }), _jsxs(Text, { type: "secondary", children: ["\u5F53\u524D\u8F6E\u8BE2\uFF1A\u7B2C ", pollAttempt || 1, "/", MAX_RECOMPUTE_POLL_ATTEMPTS, " \u6B21\uFF1B \u9884\u8BA1 ", nextRefreshIn.toFixed(1), " \u79D2\u540E\u81EA\u52A8\u5237\u65B0\u3002"] }), taskSummary?.stats.warnings?.length ? (_jsxs(Text, { type: "secondary", children: ["\u4EFB\u52A1\u63D0\u9192\uFF1A", taskSummary.stats.warnings.join('；')] })) : null] }) })) : null, _jsxs("div", { className: "metric-grid", children: [_jsx(Card, { children: _jsx(Statistic, { title: "\u8BC1\u636E\u603B\u6570", value: summary.total }) }), _jsx(Card, { children: _jsx(Statistic, { title: "T1 \u8BC1\u636E", value: summary.tier1 }) }), _jsx(Card, { children: _jsx(Statistic, { title: "T2 \u8BC1\u636E", value: summary.tier2 }) }), _jsx(Card, { children: _jsx(Statistic, { title: "T3 \u7EBF\u7D22", value: summary.tier3 }) }), _jsx(Card, { children: _jsx(Statistic, { title: "\u51B2\u7A81\u7EC4", value: summary.conflictCount }) })] }), _jsxs(Card, { className: "page-card", children: [_jsx(Paragraph, { children: "\u672C\u9875\u7528\u4E8E\u67E5\u770B\u8BC1\u636E\u6765\u6E90\u3001Tier \u5206\u7EA7\u3001\u5F15\u7528\u4F4D\u7F6E\u4E0E\u4EBA\u5DE5\u590D\u6838\u72B6\u6001\u3002 \u5F53\u590D\u6838\u89E6\u53D1\u540E\u53F0\u91CD\u7B97\u65F6\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u9501\u5B9A\u65B0\u7684\u590D\u6838\u63D0\u4EA4\uFF0C\u5E76\u5468\u671F\u6027\u5237\u65B0\u4EFB\u52A1\u72B6\u6001\u3002" }), _jsx(Suspense, { fallback: _jsx(RouteLoading, {}), children: _jsx(EvidenceReviewTable, { items: items, tierColorMap: tierColorMap, reviewColorMap: reviewColorMap, reviewLabelMap: reviewLabelMap, tierDrafts: tierDrafts, tierOptions: tierOptions, actionLocked: actionLocked, submittingId: submittingId, isRecomputing: isRecomputing, onTierChange: (itemId, value) => setTierDrafts((prev) => ({ ...prev, [itemId]: value })), onReview: handleReview }) })] })] }));
};
