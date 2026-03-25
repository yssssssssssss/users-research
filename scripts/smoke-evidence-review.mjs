import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { assertRealSmokeReady } from './smoke-preflight.mjs';

assertRealSmokeReady({ requireExternalSearch: true });

const host = '127.0.0.1';
const port = 8792;
const baseUrl = `http://${host}:${port}`;
const TERMINAL_SUCCESS_STATUSES = new Set(['awaiting_review', 'completed']);

const requestJson = async (path, init) => {
  const headers = {
    ...(init?.headers || {}),
  };
  if (init?.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.message || `${response.status}`;
    throw new Error(message);
  }

  return payload;
};

const waitForHealth = async (retries = 40) => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // ignore
    }
    await sleep(500);
  }
  throw new Error('server health check timed out');
};

const waitForTaskTerminal = async (taskId, retries = 120, intervalMs = 5000) => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const summary = await requestJson(`/api/research/tasks/${taskId}`);
    if (TERMINAL_SUCCESS_STATUSES.has(summary.status)) {
      return summary;
    }
    if (['failed', 'cancelled', 'partial_failed'].includes(summary.status)) {
      throw new Error(`task ${taskId} ended unexpectedly: ${summary.status}`);
    }
    await sleep(intervalMs);
  }

  throw new Error(`task ${taskId} did not reach terminal success status within ${retries * intervalMs}ms`);
};

const stopServer = async (server) => {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    if (server.exitCode !== null) return;
    await sleep(200);
  }
  if (server.exitCode === null) {
    server.kill('SIGKILL');
    await sleep(200);
  }
};

const server = spawn('node', ['apps/server/dist/apps/server/src/index.js'], {
  env: {
    ...process.env,
    HOST: host,
    PORT: String(port),
    DISABLE_TEXT_MODELS: 'false',
    USE_MOCK_EVIDENCE: 'false',
  },
  stdio: 'inherit',
});

try {
  await waitForHealth();

  const created = await requestJson('/api/research/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: 'smoke-evidence-review-real',
      query: '评估电商首页内容种草区是否会干扰主交易链路，请输出最小可执行研究判断。',
      inputType: 'text',
      taskMode: 'quick_judgment',
      enabledModules: {
        evidence: true,
        visionMoE: false,
        personaSandbox: false,
        externalSearch: true,
        multiModelReview: false,
      },
    }),
  });

  const runResult = await requestJson(`/api/research/tasks/${created.taskId}/run`, {
    method: 'POST',
    body: JSON.stringify({ runMode: 'async' }),
  });

  if (runResult.status !== 'queued') {
    throw new Error(`unexpected async run status: ${runResult.status}`);
  }

  await waitForTaskTerminal(created.taskId);

  const evidence = await requestJson(`/api/research/tasks/${created.taskId}/evidence`);
  const items = evidence.items || [];

  const searchLead = items.find((item) => item?.traceLocation?.authenticity === 'search_result');
  const fetchedExternal = items.find((item) => {
    const authenticity = item?.traceLocation?.authenticity;
    return authenticity === 'fetched_article' || authenticity === 'fetched_document';
  });

  let blockedPromotionMessage;
  if (searchLead) {
    try {
      await requestJson(`/api/research/evidence/${searchLead.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          reviewStatus: 'accepted',
          tier: 'T1',
          reviewer: 'smoke_evidence_review',
          comment: '尝试将搜索线索直接提升为 T1。',
        }),
      });
      throw new Error('search_result was incorrectly promoted to T1');
    } catch (error) {
      blockedPromotionMessage = error instanceof Error ? error.message : String(error);
    }
  }

  if (!fetchedExternal) {
    throw new Error('no fetched external evidence found to validate promotion');
  }

  let missingReasonMessage;
  try {
    await requestJson(`/api/research/evidence/${fetchedExternal.id}/review`, {
      method: 'POST',
      body: JSON.stringify({
        reviewStatus: 'accepted',
        tier: 'T2',
        reviewer: 'smoke_evidence_review',
      }),
    });
    throw new Error('fetched external evidence was promoted without review reason');
  } catch (error) {
    missingReasonMessage = error instanceof Error ? error.message : String(error);
  }

  const promoted = await requestJson(`/api/research/evidence/${fetchedExternal.id}/review`, {
    method: 'POST',
    body: JSON.stringify({
      reviewStatus: 'accepted',
      tier: 'T2',
      reviewer: 'smoke_evidence_review',
      comment: '已核对原始内容、来源域名与引用摘要，允许提升为 T2 进入后续复核。',
    }),
  });

  const latestTask = await requestJson(`/api/research/tasks/${created.taskId}`);
  const updatedEvidence = await requestJson(`/api/research/tasks/${created.taskId}/evidence`);
  const promotedEvidence = updatedEvidence.items.find((item) => item.id === fetchedExternal.id);

  console.log(
    JSON.stringify(
      {
        ok: true,
        taskId: created.taskId,
        searchLeadCheck: searchLead ? 'validated' : 'skipped_no_search_result',
        searchLeadBlocked: Boolean(blockedPromotionMessage),
        searchLeadBlockedMessage: blockedPromotionMessage,
        missingReasonBlocked: Boolean(missingReasonMessage),
        missingReasonMessage,
        promotedEvidenceId: fetchedExternal.id,
        promotedTier: promotedEvidence?.tier,
        promotedReviewStatus: promotedEvidence?.reviewStatus,
        promotedUpdatedAt: promoted.updatedAt,
        queuedTaskStatus: latestTask.status,
        queuedReviewStatus: latestTask.reviewStatus,
        queuedCurrentNode: latestTask.currentNode,
      },
      null,
      2,
    ),
  );
} finally {
  await stopServer(server);
}
