import type { FastifyPluginAsync } from 'fastify';
import type {
  CreateTaskRequest,
  OverrideExperienceModelsRequest,
} from '@users-research/shared';
import {
  createTask,
  enqueueTaskRun,
  generateReport,
  getOutputs,
  getTask,
  getTaskSummary,
  listTaskSummaries,
  overrideExperienceModels,
  previewPlan,
  runTask,
} from '../services/taskService.js';
import {
  createTaskBodySchema,
  generateReportBodySchema,
  overrideExperienceModelsBodySchema,
  runTaskBodySchema,
  taskIdParamsSchema,
} from './schemas.js';

type TaskIdParams = { taskId: string };
type ListTasksQuery = { limit?: number };
type RunTaskBody = { runMode?: 'sync' | 'async' };
type GenerateReportBody = { candidateOutputId?: string };

export const taskRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: ListTasksQuery }>(
    '/tasks',
    async (request) => ({
      items: await listTaskSummaries(request.query.limit),
    }),
  );

  app.post<{ Body: CreateTaskRequest }>(
    '/tasks',
    {
      schema: {
        body: createTaskBodySchema,
      },
    },
    async (request) => {
      const task = await createTask(request.body);
      return {
        taskId: task.taskId,
        status: task.status,
        createdAt: new Date().toISOString(),
      };
    },
  );

  app.post<{ Params: TaskIdParams }>(
    '/tasks/:taskId/preview-plan',
    {
      schema: {
        params: taskIdParamsSchema,
      },
    },
    async (request) => previewPlan(request.params.taskId),
  );

  app.post<{ Params: TaskIdParams; Body: RunTaskBody }>(
    '/tasks/:taskId/run',
    {
      schema: {
        params: taskIdParamsSchema,
        body: runTaskBodySchema,
      },
    },
    async (request) => {
      const { taskId } = request.params;

      if (request.body.runMode === 'async') {
        void enqueueTaskRun(taskId);
        return { taskId, status: 'queued' };
      }

      await runTask(taskId);
      return { taskId, status: 'completed' };
    },
  );

  app.get<{ Params: TaskIdParams }>(
    '/tasks/:taskId',
    {
      schema: {
        params: taskIdParamsSchema,
      },
    },
    async (request) => getTaskSummary(request.params.taskId),
  );

  app.get<{ Params: TaskIdParams }>(
    '/tasks/:taskId/state',
    {
      schema: {
        params: taskIdParamsSchema,
      },
    },
    async (request) => getTask(request.params.taskId),
  );

  app.get<{ Params: TaskIdParams }>(
    '/tasks/:taskId/sub-questions',
    {
      schema: {
        params: taskIdParamsSchema,
      },
    },
    async (request) => {
      const task = await getTask(request.params.taskId);
      return { items: task.subQuestions };
    },
  );

  app.get<{ Params: TaskIdParams }>(
    '/tasks/:taskId/stream',
    {
      schema: {
        params: taskIdParamsSchema,
      },
    },
    async (request, reply) => {
      const { taskId } = request.params;
      const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
      let closed = false;
      let snapshotTimer: NodeJS.Timeout | undefined;
      let heartbeatTimer: NodeJS.Timeout | undefined;
      let lastTaskStatusSignature: string | undefined;
      let lastSubQuestionSignature: string | undefined;
      let lastCandidateOutputSignature: string | undefined;
      let completedEmitted = false;

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

        const taskStatusSignature = JSON.stringify({
          status: summary.status,
          reviewStatus: summary.reviewStatus,
          currentNode: summary.currentNode,
          rqLevel: summary.rqLevel,
          warningCount: summary.stats.warnings.length,
          candidateOutputCount: state.candidateOutputs.length,
          finalReportCount: state.finalReports.length,
        });
        if (taskStatusSignature !== lastTaskStatusSignature) {
          lastTaskStatusSignature = taskStatusSignature;
          writeEvent('task_status', {
            summary,
            state,
            emittedAt: new Date().toISOString(),
          });
        }

        const subQuestionSignature = state.subQuestions.map((item) => item.id).join(',');
        if (state.subQuestions.length > 0 && subQuestionSignature !== lastSubQuestionSignature) {
          lastSubQuestionSignature = subQuestionSignature;
          writeEvent('sub_questions_ready', { items: state.subQuestions });
        }

        const candidateOutputSignature = state.candidateOutputs.map((item) => item.id).join(',');
        if (
          state.candidateOutputs.length > 0
          && candidateOutputSignature !== lastCandidateOutputSignature
        ) {
          lastCandidateOutputSignature = candidateOutputSignature;
          writeEvent('candidate_output_ready', {
            outputType: state.candidateOutputs[0]?.outputType,
            id: state.candidateOutputs[0]?.id,
          });
        }

        if (terminalStatuses.has(state.status) && !completedEmitted) {
          completedEmitted = true;
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
    },
  );

  app.get<{ Params: TaskIdParams }>(
    '/tasks/:taskId/outputs',
    {
      schema: {
        params: taskIdParamsSchema,
      },
    },
    async (request) => getOutputs(request.params.taskId),
  );

  app.post<{ Params: TaskIdParams; Body: OverrideExperienceModelsRequest }>(
    '/tasks/:taskId/experience-models/override',
    {
      schema: {
        params: taskIdParamsSchema,
        body: overrideExperienceModelsBodySchema,
      },
    },
    async (request) => {
      const { taskId } = request.params;
      return overrideExperienceModels({
        taskId,
        mode: request.body.mode,
        modelIds: request.body.modelIds,
      });
    },
  );

  app.post<{ Params: TaskIdParams; Body: GenerateReportBody }>(
    '/tasks/:taskId/reports/generate',
    {
      schema: {
        params: taskIdParamsSchema,
        body: generateReportBodySchema,
      },
    },
    async (request) => generateReport(request.params.taskId, request.body.candidateOutputId),
  );
};
