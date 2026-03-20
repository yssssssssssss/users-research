import type { FastifyPluginAsync } from 'fastify';
import type { ReviewEvidenceRequest } from '@users-research/shared';
import { getEvidence, getPersona, getVision, reviewEvidence } from '../services/taskService';

export const evidenceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/tasks/:taskId/evidence', async (request) => {
    const { taskId } = request.params as { taskId: string };
    return getEvidence(taskId);
  });

  app.get('/tasks/:taskId/vision', async (request) => {
    const { taskId } = request.params as { taskId: string };
    return getVision(taskId);
  });

  app.get('/tasks/:taskId/persona', async (request) => {
    const { taskId } = request.params as { taskId: string };
    return getPersona(taskId);
  });

  app.post('/evidence/:evidenceId/review', async (request) => {
    const { evidenceId } = request.params as { evidenceId: string };
    return reviewEvidence(evidenceId, request.body as ReviewEvidenceRequest);
  });

  app.post('/tasks/:taskId/vision/rerun', async (request) => {
    const { taskId } = request.params as { taskId: string };
    return { taskId, branch: 'vision_moe', status: 'queued' };
  });

  app.post('/tasks/:taskId/persona/rerun', async (request) => {
    const { taskId } = request.params as { taskId: string };
    return { taskId, branch: 'persona_sandbox', status: 'queued' };
  });
};
