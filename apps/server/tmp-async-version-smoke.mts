import { buildServer } from './src/app.ts';

const app = buildServer();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const injectJson = async (options) => {
  const response = await app.inject({
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  let body;
  try { body = response.json(); } catch { body = response.body; }
  return { statusCode: response.statusCode, body };
};

try {
  await app.ready();
  const create = await injectJson({
    method: 'POST',
    url: '/api/research/tasks',
    payload: {
      title: 'Async Recompute Smoke',
      query: '验证补证后 RQ 是否重算',
      inputType: 'mixed',
      taskMode: 'deep_research',
      enabledModules: {
        evidence: true,
        visionMoE: false,
        personaSandbox: true,
        externalSearch: true,
        multiModelReview: false,
      },
      attachments: [],
      designFiles: [],
    },
  });
  const taskId = create.body.taskId;

  await injectJson({ method: 'POST', url: `/api/research/tasks/${taskId}/run`, payload: { runMode: 'async' } });

  const before = await injectJson({ method: 'GET', url: `/api/research/tasks/${taskId}/state` });
  const promotableEvidence = before.body.evidencePool.find((item) => item.sourceType === 'industry_report');
  const evidenceOutputBefore = before.body.candidateOutputs.find((item) => item.outputType === 'evidence_report');
  expect(evidenceOutputBefore?.gateLevel === 'blocked_by_rq', 'evidence report should start blocked');

  const review = await injectJson({
    method: 'POST',
    url: `/api/research/evidence/${promotableEvidence.id}/review`,
    payload: { reviewStatus: 'accepted', tier: 'T1', reviewer: 'async_smoke' },
  });
  expect(review.statusCode === 200, `review failed ${review.statusCode}`);
  expect(review.body.recomputeStatus === 'queued', 'review should queue recompute');

  let after;
  for (let i = 0; i < 20; i += 1) {
    await sleep(200);
    after = await injectJson({ method: 'GET', url: `/api/research/tasks/${taskId}/state` });
    if (after.body.status !== 'running') break;
  }

  const evidenceOutputAfter = after.body.candidateOutputs.find((item) => item.outputType === 'evidence_report');
  expect(after.body.rqLevel === 'RQ3', `expected RQ3 after async recompute, got ${after.body.rqLevel}`);
  expect(evidenceOutputAfter?.gateLevel === 'allowed', 'evidence report should be allowed after recompute');

  const report1 = await injectJson({
    method: 'POST',
    url: `/api/research/tasks/${taskId}/reports/generate`,
    payload: { candidateOutputId: evidenceOutputAfter.id },
  });
  const report2 = await injectJson({
    method: 'POST',
    url: `/api/research/tasks/${taskId}/reports/generate`,
    payload: { candidateOutputId: evidenceOutputAfter.id },
  });

  const stateWithReports = await injectJson({ method: 'GET', url: `/api/research/tasks/${taskId}/state` });
  expect(report2.body.version === report1.body.version + 1, 'report version should increment');
  expect(stateWithReports.body.finalReports.length >= 2, 'report history should be preserved');

  console.log(JSON.stringify({
    taskId,
    reviewResponse: review.body,
    rqAfter: after.body.rqLevel,
    evidenceReportGate: evidenceOutputAfter?.gateLevel,
    reportVersions: stateWithReports.body.finalReports.map((item) => item.version),
  }, null, 2));
} finally {
  await app.close();
}
