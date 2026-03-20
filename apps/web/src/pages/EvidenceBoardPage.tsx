import { Alert, Button, Card, Empty, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EvidenceItem, ResearchTaskState, TierLevel } from '@users-research/shared';
import { api } from '../lib/api';
import { useTaskStore } from '../store/taskStore';

const { Title, Paragraph, Link, Text } = Typography;

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
    } catch (error) {
      message.error(error instanceof Error ? error.message : '证据复核失败');
    } finally {
      setSubmittingId(undefined);
    }
  };

  if (!currentTaskId) {
    return <Empty description="请先创建任务" />;
  }

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Title level={2}>证据看板</Title>

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
        <Table
          rowKey="id"
          dataSource={items}
          pagination={false}
          columns={[
            {
              title: '来源名称',
              render: (_, item) => <Text strong>{item.sourceName || '未命名来源'}</Text>,
            },
            {
              title: '来源类型',
              dataIndex: 'sourceType',
              render: (value: string) => <Tag>{value}</Tag>,
            },
            {
              title: '来源级别',
              dataIndex: 'sourceLevel',
              render: (value: string) => <Tag>{value}</Tag>,
            },
            {
              title: 'Tier',
              dataIndex: 'tier',
              render: (value: string) => <Tag color={tierColorMap[value] || 'default'}>{value}</Tag>,
            },
            {
              title: '证据内容',
              dataIndex: 'content',
              width: '24%',
            },
            {
              title: '引用文本',
              render: (_, item) => <Text type="secondary">{item.citationText || '暂无引用文本'}</Text>,
            },
            {
              title: '来源链接',
              render: (_, item) =>
                item.sourceUrl ? (
                  <Link href={item.sourceUrl} target="_blank">
                    打开来源
                  </Link>
                ) : (
                  <Text type="secondary">暂无</Text>
                ),
            },
            {
              title: '复核状态',
              render: (_, item) => (
                <Tag color={reviewColorMap[item.reviewStatus] || 'default'}>
                  {reviewLabelMap[item.reviewStatus]}
                </Tag>
              ),
            },
            {
              title: '复核操作',
              render: (_, item) => (
                <Space direction="vertical" size={8}>
                  <Select
                    size="small"
                    style={{ width: 96 }}
                    options={tierOptions}
                    value={tierDrafts[item.id] || item.tier}
                    disabled={actionLocked}
                    onChange={(value) => setTierDrafts((prev) => ({ ...prev, [item.id]: value as TierLevel }))}
                  />
                  <Space wrap size={4}>
                    <Button
                      size="small"
                      type="primary"
                      loading={submittingId === item.id}
                      disabled={actionLocked}
                      onClick={() => handleReview(item, 'accepted')}
                    >
                      接受
                    </Button>
                    <Button
                      size="small"
                      loading={submittingId === item.id}
                      disabled={actionLocked}
                      onClick={() => handleReview(item, 'downgraded')}
                    >
                      降权
                    </Button>
                    <Button
                      size="small"
                      danger
                      loading={submittingId === item.id}
                      disabled={actionLocked}
                      onClick={() => handleReview(item, 'rejected')}
                    >
                      拒绝
                    </Button>
                  </Space>
                  {isRecomputing ? <Text type="secondary">重算进行中，操作已锁定</Text> : null}
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
};
