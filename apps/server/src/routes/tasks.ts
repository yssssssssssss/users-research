import type { FastifyPluginAsync } from 'fastify';
import {
  createTask,
  enqueueTaskRun,
  generateReport,
  getOutputs,
  getTask,
  getTaskSummary,
  overrideExperienceModels,
  previewPlan,
  runTask,
} from '../services/taskService';

export const taskRoutes: FastifyPluginAsync = async (app) => {
  app.post('/tasks', async (request) => {
    const task = await createTask(request.body as any);
    return {
      taskId: task.taskId,
      status: task.status,
      createdAt: new Date().toISOString(),
    };
  });

  app.post('/tasks/:taskId/preview-plan', async (request) => {
    const { taskId } = request.params as { taskId: string };
    return previewPlan(taskId);
  });

  app.post('/tasks/:taskId/run', async (request) => {
    const { taskId } = request.params as { taskId: string };
    const body = request.body as { runMode?: 'sync' | 'async' } | undefined;

    if (body?.runMode === 'async') {
      void enqueueTaskRun(taskId);
      return { taskId, status: 'queued' };
    }

    await runTask(taskId);
    return { taskId, status: 'completed' };
  });

  app.get('/tasks/:taskId', async (request) => {
    const { taskId } = request.params as { taskId: string };
    return getTaskSummary(taskId);
  });

  app.get('/tasks/:taskId/state', async (request) => {
    const { taskId } = request.params as { taskId: string };
    return getTask(taskId);
  });

  app.get('/tasks/:taskId/sub-questions', async (request) => {
    const { taskId } = request.params as { taskId: string };
    const task = await getTask(taskId);
    return { items: task.subQuestions };
  });

  app.get('/tasks/:taskId/stream', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
    let closed = false;
    let snapshotTimer: NodeJS.Timeout | undefined;
    let heartbeatTimer: NodeJS.Timeout | undefined;

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (snapshotTimer) clearInterval(snapshotTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      request.raw.off('close', cleanup);
    };

    const writeEvent = (event: string, data: unknown) => {
      if (closed) return;
      reply.raw.write(`event: ${event}
`);
      reply.raw.write(`data: ${JSON.stringify(data)}

`);
    };

    const pushSnapshot = async () => {
      if (closed) return;

      const [summary, state] = await Promise.all([getTaskSummary(taskId), getTask(taskId)]);

      writeEvent('task_status', {
        summary,
        state,
        emittedAt: new Date().toISOString(),
      });

      if (state.subQuestions.length > 0) {
        writeEvent('sub_questions_ready', { items: state.subQuestions });
      }

      if (state.candidateOutputs.length > 0) {
        writeEvent('candidate_output_ready', {
          outputType: state.candidateOutputs[0]?.outputType,
          id: state.candidateOutputs[0]?.id,
        });
      }

      if (terminalStatuses.has(state.status)) {
        writeEvent('task_complete', {
          status: state.status,
          reviewStatus: state.reviewStatus,
          finishedAt: state.runStats.finishedAt,
        });
        cleanup();
        reply.raw.end();
      }
    };

    request.raw.on('close', cleanup);

    writeEvent('connected', { taskId, connectedAt: new Date().toISOString() });
    await pushSnapshot();

    if (!closed) {
      snapshotTimer = setInterval(() => {
        void pushSnapshot();
      }, 3000);
      heartbeatTimer = setInterval(() => {
        writeEvent('heartbeat', { taskId, timestamp: new Date().toISOString() });
      }, 15000);
    }

    return reply;
  });

  app.get('/tasks/:taskId/outputs', async (request) => {
    const { taskId } = request.params as { taskId: string };
    return getOutputs(taskId);
  });

  app.post('/tasks/:taskId/experience-models/override', async (request) => {
    const { taskId } = request.params as { taskId: string };
    const body = request.body as { mode?: 'auto' | 'manual'; modelIds?: string[] } | undefined;
    return overrideExperienceModels({
      taskId,
      mode: body?.mode,
      modelIds: body?.modelIds,
    });
  });

  app.post('/tasks/:taskId/reports/generate', async (request) => {
    const { taskId } = request.params as { taskId: string };
    const body = request.body as { candidateOutputId?: string };
    return generateReport(taskId, body.candidateOutputId);
  });
};
