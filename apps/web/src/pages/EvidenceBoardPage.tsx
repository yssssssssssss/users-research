import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Card, Empty, List, Space, Statistic, Tag, Typography, message } from 'antd';
import type { EvidenceItem, ResearchTaskState, TierLevel } from '@users-research/shared';
import { RouteLoading } from '../components/RouteLoading';
import { api } from '../lib/api';
import { getEvidenceAuthenticityKind } from '../lib/evidenceMeta';
import { useTaskStore } from '../store/taskStore';

const { Title, Paragraph, Link, Text } = Typography;
const EvidenceReviewTable = lazy(() =>
  import('../components/evidence/EvidenceReviewTable').then((module) => ({ default: module.EvidenceReviewTable })),
);

const RECOMPUTE_POLL_INTERVAL_MS = 2000;
const MAX_RECOMPUTE_POLL_ATTEMPTS = 12;

const tierColorMap: Record<string, string> = {
  T1: 'green',
  T2: 'orange',
  T3: 'blue',
};

const reviewColorMap: Record<EvidenceItem['reviewStatus'], string> = {
  accepted: 'green',
  downgraded: 'gold',
  rejected: 'red',
  unreviewed: 'default',
};

const reviewLabelMap: Record<EvidenceItem['reviewStatus'], string> = {
  accepted: '已接受',
  downgraded: '已降权',
  rejected: '已拒绝',
  unreviewed: '未复核',
};

const isJudgmentRecomputing = (
  task?: Pick<ResearchTaskState, 'status' | 'currentNode'>,
): boolean => task?.status === 'running' && task.currentNode === 'judgment_synthesizer';

export const EvidenceBoardPage = () => {
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const taskSummary = useTaskStore((state) => state.taskSummary);
  const taskState = useTaskStore((state) => state.taskState);
  const setTaskSummary = useTaskStore((state) => state.setTaskSummary);
  const setTaskState = useTaskStore((state) => state.setTaskState);

  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [summary, setSummary] = useState({ total: 0, tier1: 0, tier2: 0, tier3: 0, conflictCount: 0 });
  const [tierDrafts, setTierDrafts] = useState<Record<string, TierLevel>>({});
  const [submittingId, setSubmittingId] = useState<string>();
  const [pollAttempt, setPollAttempt] = useState(0);
  const [nextRefreshIn, setNextRefreshIn] = useState(0);
  const [notifyWhenRecomputeDone, setNotifyWhenRecomputeDone] = useState(false);

  const loadEvidence = useCallback(async () => {
    if (!currentTaskId) return undefined;

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

  const isRecomputing =
    isJudgmentRecomputing(taskState) || isJudgmentRecomputing(taskSummary as ResearchTaskState | undefined);
  const actionLocked = Boolean(submittingId) || isRecomputing;

  useEffect(() => {
    if (!currentTaskId || !isRecomputing) {
      setPollAttempt(0);
      setNextRefreshIn(0);
      return undefined;
    }

    let disposed = false;
    let countdownTimer: ReturnType<typeof setInterval> | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const runPollCycle = (attempt: number) => {
      if (disposed) return;

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
        if (countdownTimer) clearInterval(countdownTimer);
        const snapshot = await loadEvidence();
        if (disposed) return;

        if (isJudgmentRecomputing(snapshot?.nextTaskState)) {
          runPollCycle(attempt + 1);
        } else {
          setNextRefreshIn(0);
        }
      }, RECOMPUTE_POLL_INTERVAL_MS);
    };

    runPollCycle(1);

    return () => {
      disposed = true;
      if (countdownTimer) clearInterval(countdownTimer);
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [currentTaskId, isRecomputing, loadEvidence]);

  useEffect(() => {
    if (!isRecomputing && notifyWhenRecomputeDone) {
      message.success('证据复核与综合重算已完成。');
      setNotifyWhenRecomputeDone(false);
    }
  }, [isRecomputing, notifyWhenRecomputeDone]);

  const tierOptions = useMemo(
    () => [
      { label: 'T1', value: 'T1' },
      { label: 'T2', value: 'T2' },
      { label: 'T3', value: 'T3' },
    ],
    [],
  );

  const handleReview = async (
    item: EvidenceItem,
    reviewStatus: EvidenceItem['reviewStatus'],
  ) => {
    const nextTier = tierDrafts[item.id] || item.tier;
    const authenticity = getEvidenceAuthenticityKind(item);
    const requiresPromotionReason =
      item.sourceLevel === 'external' &&
      reviewStatus === 'accepted' &&
      (nextTier === 'T1' || nextTier === 'T2');

    let comment: string | undefined;
    if (requiresPromotionReason) {
      if (authenticity === 'search_result') {
        message.error('搜索线索在未抓到原始内容前，不能直接提升为 T1/T2。');
        return;
      }

      const input = window.prompt(
        `请输入将该外部证据提升为 ${nextTier} 的复核理由（至少 8 个字，会写入审核记录）：`,
      );

      if (!input || input.trim().length < 8) {
        message.warning('已取消提交：请填写不少于 8 个字的复核理由。');
        return;
      }

      comment = input.trim();
    }

    setSubmittingId(item.id);
    try {
      const result = await api.reviewEvidence(item.id, {
        reviewStatus,
        tier: nextTier,
        reviewer: 'evidence_board',
        comment,
      });
      await loadEvidence();

      if (result.recomputeStatus === 'queued') {
        setNotifyWhenRecomputeDone(true);
        message.info('证据复核已提交，系统正在后台重算 RQ 与输出 Gate。');
        return;
      }

      message.success('证据复核已更新。');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '证据复核失败');
    } finally {
      setSubmittingId(undefined);
    }
  };

  if (!currentTaskId) {
    return <Empty description="请先创建任务" />;
  }

  const searchPlan = taskState?.analysisPlan?.externalSearchPlan;
  const searchResult = taskState?.moduleResults?.externalSearch;

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Title level={2}>外部检索 / 证据</Title>

      {searchPlan ? (
        <Card className="page-card" title="本模块任务">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Paragraph style={{ marginBottom: 0 }}>{searchPlan.task}</Paragraph>
            <div>
              <Text strong>检索查询</Text>
              <Space wrap style={{ marginTop: 8 }}>
                {searchPlan.searchQueries.map((item) => <Tag color="blue" key={item}>{item}</Tag>)}
              </Space>
            </div>
            {searchResult?.keyInsights?.length ? (
              <div>
                <Text strong>结构化洞察</Text>
                <List
                  size="small"
                  dataSource={searchResult.keyInsights}
                  renderItem={(item: { insight: string; source: string; confidence: 'high' | 'medium' | 'low'; tier: TierLevel }) => (
                    <List.Item>
                      <Space wrap>
                        <span>{item.insight}</span>
                        <Tag>{item.source}</Tag>
                        <Tag color={item.confidence === 'high' ? 'green' : item.confidence === 'medium' ? 'gold' : 'red'}>
                          {item.confidence}
                        </Tag>
                        <Tag>{item.tier}</Tag>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            ) : null}
          </Space>
        </Card>
      ) : null}

      {isRecomputing ? (
        <Alert
          type="info"
          showIcon
          message="后台正在重算综合判断，新的证据复核已临时锁定"
          description={
            <Space direction="vertical" size={4}>
              <Text>系统正在重新计算 RQ、候选输出与服务端 Gate，请等待当前重算结束后再继续提交。</Text>
              <Text type="secondary">
                当前轮询：第 {pollAttempt || 1}/{MAX_RECOMPUTE_POLL_ATTEMPTS} 次；
                预计 {nextRefreshIn.toFixed(1)} 秒后自动刷新。
              </Text>
              {taskSummary?.stats.warnings?.length ? (
                <Text type="secondary">任务提醒：{taskSummary.stats.warnings.join('；')}</Text>
              ) : null}
            </Space>
          }
        />
      ) : null}

      <div className="metric-grid">
        <Card><Statistic title="证据总数" value={summary.total} /></Card>
        <Card><Statistic title="T1 证据" value={summary.tier1} /></Card>
        <Card><Statistic title="T2 证据" value={summary.tier2} /></Card>
        <Card><Statistic title="T3 线索" value={summary.tier3} /></Card>
        <Card><Statistic title="冲突组" value={summary.conflictCount} /></Card>
      </div>

      <Card className="page-card">
        <Paragraph>
          本页用于查看证据来源、Tier 分级、引用位置与人工复核状态。
          当复核触发后台重算时，系统会自动锁定新的复核提交，并周期性刷新任务状态。
        </Paragraph>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="外部证据升阶规则"
          description="搜索线索不能直接升为 T1/T2；只有已抓网页正文或已抓文档内容的外部证据，才允许在填写复核理由后升阶。"
        />
        <Suspense fallback={<RouteLoading />}>
          <EvidenceReviewTable
            items={items}
            tierColorMap={tierColorMap}
            reviewColorMap={reviewColorMap}
            reviewLabelMap={reviewLabelMap}
            tierDrafts={tierDrafts}
            tierOptions={tierOptions}
            actionLocked={actionLocked}
            submittingId={submittingId}
            isRecomputing={isRecomputing}
            onTierChange={(itemId, value) => setTierDrafts((prev) => ({ ...prev, [itemId]: value }))}
            onReview={handleReview}
          />
        </Suspense>
      </Card>
    </Space>
  );
};
