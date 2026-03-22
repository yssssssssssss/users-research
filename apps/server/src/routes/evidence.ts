import type { FastifyPluginAsync } from 'fastify';
import type { ReviewEvidenceRequest } from '@users-research/shared';
import {
  getEvidence,
  getPersona,
  getVision,
  rerunPersona,
  rerunVision,
  reviewEvidence,
} from '../services/taskService.js';
import {
  evidenceIdParamsSchema,
  reviewEvidenceBodySchema,
  taskIdParamsSchema,
} from './schemas.js';

type TaskIdParams = { taskId: string };
type EvidenceIdParams = { evidenceId: string };

export const evidenceRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: TaskIdParams }>(
    '/tasks/:taskId/evidence',
    {
      schema: {
        params: taskIdParamsSchema,
      },
    },
    async (request) => getEvidence(request.params.taskId),
  );

  app.get<{ Params: TaskIdParams }>(
    '/tasks/:taskId/vision',
    {
      schema: {
        params: taskIdParamsSchema,
      },
    },
    async (request) => getVision(request.params.taskId),
  );

  app.get<{ Params: TaskIdParams }>(
    '/tasks/:taskId/persona',
    {
      schema: {
        params: taskIdParamsSchema,
      },
    },
    async (request) => getPersona(request.params.taskId),
  );

  app.post<{ Params: EvidenceIdParams; Body: ReviewEvidenceRequest }>(
    '/evidence/:evidenceId/review',
    {
      schema: {
        params: evidenceIdParamsSchema,
        body: reviewEvidenceBodySchema,
      },
    },
    async (request) => reviewEvidence(request.params.evidenceId, request.body),
  );

  app.post<{ Params: TaskIdParams }>(
    '/tasks/:taskId/vision/rerun',
    {
      schema: {
        params: taskIdParamsSchema,
      },
    },
    async (request) => rerunVision(request.params.taskId),
  );

  app.post<{ Params: TaskIdParams }>(
    '/tasks/:taskId/persona/rerun',
    {
      schema: {
        params: taskIdParamsSchema,
      },
    },
    async (request) => rerunPersona(request.params.taskId),
  );
};
