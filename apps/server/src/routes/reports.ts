import type { FastifyPluginAsync } from 'fastify';
import { getReport, reviewReport } from '../services/taskService';

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/reports/:reportId', async (request) => {
    const { reportId } = request.params as { reportId: string };
    return getReport(reportId);
  });

  app.post('/reports/:reportId/review', async (request) => {
    const { reportId } = request.params as { reportId: string };
    return reviewReport(reportId, request.body as any);
  });

  app.post('/reports/:reportId/export', async (request) => {
    const { reportId } = request.params as { reportId: string };
    return {
      reportId,
      exportUrl: `/mock-exports/${reportId}.md`,
    };
  });
};
