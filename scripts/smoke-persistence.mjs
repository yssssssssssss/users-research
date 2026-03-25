import { spawn } from 'node:child_process';
import { existsSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { assertRealSmokeReady } from './smoke-preflight.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const mode = process.argv[2] === 'real' ? 'real' : 'fallback';
const host = '127.0.0.1';
const port = mode === 'real' ? 8791 : 8790;
const baseUrl = `http://${host}:${port}`;
const databasePath = resolve(rootDir, `apps/server/tmp/smoke-persistence-${mode}.sqlite`);
const TERMINAL_SUCCESS_STATUSES = new Set(['awaiting_review', 'completed']);

if (mode === 'real') {
  assertRealSmokeReady({ requireExternalSearch: true });
}

const cleanupSqliteFiles = (filepath) => {
  for (const suffix of ['', '-shm', '-wal']) {
    const target = `${filepath}${suffix}`;
    if (existsSync(target)) {
      rmSync(target, { force: true });
    }
  }
};

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
    throw new Error(`${init?.method || 'GET'} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
};

const isFatalFallbackWarning = (warning) => {
  const text = String(warning || '');
  if (!text.trim()) return false;
  if (/\[externalSearch\]\[partial_fallback\]/i.test(text)) return false;
  if (/\[externalSearch\]\[search_result\]/i.test(text)) return false;
  return /mock|回退到本地 mock|文本模型未配置|\[externalSearch\]\[fallback\]|弱视觉推断/i.test(text);
};

const failIfWarningsContainFallback = (warnings = []) => {
  const matched = warnings.filter((item) => isFatalFallbackWarning(item));
  if (matched.length > 0) {
    throw new Error(`real persistence smoke detected fallback warnings: ${matched.join(' | ')}`);
  }
};

const failIfEvidenceContainsMock = (items = []) => {
  const bad = items.filter((item) => {
    const trace = item?.traceLocation || {};
    return trace.generatedBy === 'mock_seed_evidence' || trace.fallbackMode === 'demo_only';
  });
  if (bad.length > 0) {
    throw new Error(`real persistence smoke detected mock evidence: ${bad.map((item) => item.id).join(', ')}`);
  }
};

const waitForHealth = async (retries = 40) => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // ignore startup race
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

const startServer = () =>
  spawn('node', ['apps/server/dist/apps/server/src/index.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
      DATABASE_URL: `file:${databasePath}`,
      DISABLE_TEXT_MODELS: mode === 'real' ? 'false' : 'true',
      USE_MOCK_EVIDENCE: mode === 'real' ? 'false' : 'true',
    },
    stdio: 'inherit',
  });

const verifyPersistence = async ({ taskId, reportId, outputId, before }) => {
  const [taskList, summary, state, outputs, report] = await Promise.all([
    requestJson('/api/research/tasks?limit=20'),
    requestJson(`/api/research/tasks/${taskId}`),
    requestJson(`/api/research/tasks/${taskId}/state`),
    requestJson(`/api/research/tasks/${taskId}/outputs`),
    requestJson(`/api/research/reports/${reportId}`),
  ]);

  if (!taskList.items?.some((item) => item.id === taskId || item.taskId === taskId)) {
    throw new Error(`restarted server could not find task ${taskId} in task list`);
  }

  if (summary.taskId !== taskId) {
    throw new Error(`task summary mismatch after restart: expected ${taskId}, got ${summary.taskId}`);
  }

  if (!state.finalReports?.some((item) => item.id === reportId)) {
    throw new Error(`state missing persisted report ${reportId}`);
  }

  if (!outputs.candidateOutputs?.some((item) => item.id === outputId)) {
    throw new Error(`outputs missing persisted candidate output ${outputId}`);
  }

  if (report.id !== reportId) {
    throw new Error(`report mismatch after restart: expected ${reportId}, got ${report.id}`);
  }

  if ((state.evidencePool?.length || 0) !== before.evidenceCount) {
    throw new Error(
      `evidence count mismatch after restart: expected ${before.evidenceCount}, got ${state.evidencePool?.length || 0}`,
    );
  }

  if ((state.candidateOutputs?.length || 0) !== before.outputCount) {
    throw new Error(
      `candidate output count mismatch after restart: expected ${before.outputCount}, got ${state.candidateOutputs?.length || 0}`,
    );
  }

  if ((state.finalReports?.length || 0) !== before.reportCount) {
    throw new Error(
      `report count mismatch after restart: expected ${before.reportCount}, got ${state.finalReports?.length || 0}`,
    );
  }

  if (!existsSync(databasePath)) {
    throw new Error(`sqlite file not found: ${databasePath}`);
  }

  const dbStat = statSync(databasePath);
  if (dbStat.size <= 0) {
    throw new Error(`sqlite file is empty: ${databasePath}`);
  }

  return {
    summary,
    state,
    outputs,
    report,
    databaseBytes: dbStat.size,
  };
};

cleanupSqliteFiles(databasePath);

let server;

try {
  server = startServer();
  await waitForHealth();

  const created = await requestJson('/api/research/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: `smoke-persistence-${mode}`,
      query:
        mode === 'real'
          ? '评估电商首页内容种草区是否会干扰主交易链路，请输出最小可执行研究判断，并补充外部证据真实性边界。'
          : '验证本地 SQLite 持久化链路是否可跑通，并保存任务、证据、候选结果与报告。',
      inputType: 'text',
      taskMode: 'quick_judgment',
      enabledModules: {
        evidence: true,
        visionMoE: false,
        personaSandbox: false,
        externalSearch: mode === 'real',
        multiModelReview: false,
      },
    }),
  });

  const runResult = await requestJson(`/api/research/tasks/${created.taskId}/run`, {
    method: 'POST',
    body: JSON.stringify({ runMode: 'async' }),
  });

  const terminalSummary = await waitForTaskTerminal(created.taskId);

  const [summary, state, outputs, evidence] = await Promise.all([
    requestJson(`/api/research/tasks/${created.taskId}`),
    requestJson(`/api/research/tasks/${created.taskId}/state`),
    requestJson(`/api/research/tasks/${created.taskId}/outputs`),
    requestJson(`/api/research/tasks/${created.taskId}/evidence`),
  ]);

  const selectedOutputId = outputs.candidateOutputs?.[0]?.id;
  if (!selectedOutputId) {
    throw new Error('no candidate outputs generated');
  }

  const report = await requestJson(`/api/research/tasks/${created.taskId}/reports/generate`, {
    method: 'POST',
    body: JSON.stringify({ candidateOutputId: selectedOutputId }),
  });

  let reviewResult = null;
  if (!report.gateResult?.blockedReasons?.length) {
    reviewResult = await requestJson(`/api/research/reports/${report.id}/review`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'approve',
        reviewer: 'smoke_persistence',
      }),
    });
  }

  if (runResult.status !== 'queued') {
    throw new Error(`unexpected async run status: ${runResult.status}`);
  }

  if (!TERMINAL_SUCCESS_STATUSES.has(terminalSummary.status)) {
    throw new Error(`unexpected run status: ${runResult.status}`);
  }

  if (!report?.id) {
    throw new Error('report generation failed');
  }

  if (mode === 'real') {
    failIfWarningsContainFallback(summary?.stats?.warnings || []);
    failIfEvidenceContainsMock(evidence?.items || []);
    if (!state?.subQuestions?.length) {
      throw new Error('real persistence smoke expected sub-questions but got none');
    }
  }

  const beforeRestart = {
    evidenceCount: state.evidencePool?.length || 0,
    outputCount: state.candidateOutputs?.length || 0,
    reportCount: Math.max(state.finalReports?.length || 0, 1),
  };

  await stopServer(server);

  server = startServer();
  await waitForHealth();

  const persisted = await verifyPersistence({
    taskId: created.taskId,
    reportId: report.id,
    outputId: selectedOutputId,
    before: beforeRestart,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        databasePath,
        databaseBytes: persisted.databaseBytes,
        taskId: created.taskId,
        status: summary.status,
        reviewStatus: reviewResult?.report?.status || report.status,
        rqLevel: summary.rqLevel,
        evidenceCount: beforeRestart.evidenceCount,
        outputCount: beforeRestart.outputCount,
        reportId: report.id,
        reportVersion: report.version,
        persistedReportCount: persisted.state.finalReports?.length || 0,
        persistedWarnings: persisted.summary.stats?.warnings || [],
      },
      null,
      2,
    ),
  );
} finally {
  await stopServer(server);
}
