import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { assertRealSmokeReady } from "./smoke-preflight.mjs";

const mode = process.argv[2] === "real" ? "real" : "fallback";
const host = "127.0.0.1";
const port = mode === "real" ? 8788 : 8787;
const baseUrl = `http://${host}:${port}`;
const TERMINAL_SUCCESS_STATUSES = new Set(["awaiting_review", "completed"]);

if (mode === 'real') {
  assertRealSmokeReady({ requireExternalSearch: true });
}

const requestJson = async (path, init) => {
  const headers = {
    ...(init?.headers || {}),
  };
  if (init?.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${init?.method || "GET"} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
};

const waitForHealth = async (retries = 40) => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // ignore transient startup failures
    }

    await sleep(500);
  }

  throw new Error("server health check timed out");
};

const waitForTaskTerminal = async (taskId, retries = 120, intervalMs = 5000) => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const summary = await requestJson(`/api/research/tasks/${taskId}`);
    if (TERMINAL_SUCCESS_STATUSES.has(summary.status)) {
      return summary;
    }
    if (["failed", "cancelled", "partial_failed"].includes(summary.status)) {
      throw new Error(`task ${taskId} ended unexpectedly: ${summary.status}`);
    }
    await sleep(intervalMs);
  }

  throw new Error(`task ${taskId} did not reach terminal success status within ${retries * intervalMs}ms`);
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
    throw new Error(`real smoke detected fallback warnings: ${matched.join(' | ')}`);
  }
};

const failIfEvidenceContainsMock = (items = []) => {
  const bad = items.filter((item) => {
    const trace = item?.traceLocation || {};
    return trace.generatedBy === 'mock_seed_evidence' || trace.fallbackMode === 'demo_only';
  });
  if (bad.length > 0) {
    throw new Error(`real smoke detected mock evidence: ${bad.map((item) => item.id).join(', ')}`);
  }
};

const failIfMissingExternalEvidence = (items = []) => {
  const matched = items.filter((item) => {
    const trace = item?.traceLocation || {};
    return item?.sourceLevel === 'external'
      && (
        trace.authenticity === 'fetched_article'
        || trace.authenticity === 'fetched_document'
        || trace.authenticity === 'search_result'
      );
  });
  if (matched.length === 0) {
    throw new Error('real smoke expected external search evidence but got none');
  }
};

const server = spawn("node", ["apps/server/dist/apps/server/src/index.js"], {
  env: {
    ...process.env,
    HOST: host,
    PORT: String(port),
    DISABLE_TEXT_MODELS: mode === "real" ? "false" : "true",
    USE_MOCK_EVIDENCE: mode === "real" ? "false" : "true",
  },
  stdio: "inherit",
});

try {
  await waitForHealth();

  const created = await requestJson("/api/research/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: `smoke-${mode}`,
      query: mode === "real"
        ? "评估电商首页内容种草区是否会干扰主交易链路，请输出最小可执行研究判断"
        : "验证当前链路是否可以在本地 fallback 模式下跑通",
      inputType: "text",
      taskMode: "quick_judgment",
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
    method: "POST",
    body: JSON.stringify({ runMode: "async" }),
  });

  const terminalSummary = await waitForTaskTerminal(created.taskId);

  const [summary, state, outputs, evidence] = await Promise.all([
    requestJson(`/api/research/tasks/${created.taskId}`),
    requestJson(`/api/research/tasks/${created.taskId}/state`),
    requestJson(`/api/research/tasks/${created.taskId}/outputs`),
    requestJson(`/api/research/tasks/${created.taskId}/evidence`),
  ]);

  const report = await requestJson(`/api/research/tasks/${created.taskId}/reports/generate`, {
    method: "POST",
    body: JSON.stringify({ candidateOutputId: outputs.candidateOutputs?.[0]?.id }),
  });

  if (runResult.status !== "queued") {
    throw new Error(`unexpected async run status: ${runResult.status}`);
  }

  if (!TERMINAL_SUCCESS_STATUSES.has(terminalSummary.status)) {
    throw new Error(`unexpected run status: ${runResult.status}`);
  }

  if (!outputs.candidateOutputs?.length) {
    throw new Error("no candidate outputs generated");
  }

  if (!report?.id) {
    throw new Error("report generation failed");
  }

  if (mode === 'real') {
    failIfWarningsContainFallback(summary?.stats?.warnings || []);
    failIfEvidenceContainsMock(evidence?.items || []);
    failIfMissingExternalEvidence(evidence?.items || []);
    if (!state?.subQuestions?.length) {
      throw new Error('real smoke expected sub-questions but got none');
    }
  }

  console.log(JSON.stringify({
    ok: true,
    mode,
    taskId: created.taskId,
    status: summary.status,
    reviewStatus: summary.reviewStatus,
    rqLevel: summary.rqLevel,
    warnings: summary.stats?.warnings || [],
    subQuestionCount: state.subQuestions?.length || 0,
    evidenceCount: evidence.summary?.total || 0,
    outputCount: outputs.candidateOutputs.length,
    reportId: report.id,
  }, null, 2));
} finally {
  server.kill("SIGTERM");
  await sleep(300);
}
