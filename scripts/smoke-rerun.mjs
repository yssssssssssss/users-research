import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const host = "127.0.0.1";
const port = 8789;
const baseUrl = `http://${host}:${port}`;

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
    } catch {}
    await sleep(500);
  }
  throw new Error('server health check timed out');
};

const server = spawn('node', ['apps/server/dist/apps/server/src/index.js'], {
  env: {
    ...process.env,
    HOST: host,
    PORT: String(port),
    DISABLE_TEXT_MODELS: 'true',
    USE_MOCK_EVIDENCE: 'true',
  },
  stdio: 'inherit',
});

try {
  await waitForHealth();

  const created = await requestJson('/api/research/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: 'smoke-rerun',
      query: '验证 Vision 与 Persona rerun 是否真的执行并重算 Judgment',
      inputType: 'mixed',
      taskMode: 'design_review',
      enabledModules: {
        evidence: true,
        visionMoE: true,
        personaSandbox: true,
        externalSearch: false,
        multiModelReview: false,
      },
      designFiles: [
        {
          fileId: 'design-1',
          fileName: 'placeholder-design',
          fileType: 'design',
          sourceUrl: 'https://example.com/mock-design.png',
        },
      ],
    }),
  });

  await requestJson(`/api/research/tasks/${created.taskId}/run`, {
    method: 'POST',
    body: JSON.stringify({ runMode: 'sync' }),
  });

  const visionRerun = await requestJson(`/api/research/tasks/${created.taskId}/vision/rerun`, {
    method: 'POST',
  });
  const personaRerun = await requestJson(`/api/research/tasks/${created.taskId}/persona/rerun`, {
    method: 'POST',
  });

  if (visionRerun.status !== 'completed') {
    throw new Error(`vision rerun failed: ${JSON.stringify(visionRerun)}`);
  }
  if (personaRerun.status !== 'completed') {
    throw new Error(`persona rerun failed: ${JSON.stringify(personaRerun)}`);
  }
  if (!visionRerun.state?.visionFindings?.length) {
    throw new Error('vision rerun returned no findings');
  }
  if (!personaRerun.state?.personaFindings?.length) {
    throw new Error('persona rerun returned no persona findings');
  }

  console.log(JSON.stringify({
    ok: true,
    taskId: created.taskId,
    visionStatus: visionRerun.status,
    personaStatus: personaRerun.status,
    finalNode: personaRerun.state?.currentNode,
    visionFindings: visionRerun.state?.visionFindings?.length || 0,
    personaFindings: personaRerun.state?.personaFindings?.length || 0,
    outputCount: personaRerun.state?.candidateOutputs?.length || 0,
  }, null, 2));
} finally {
  server.kill('SIGTERM');
  await sleep(300);
}
