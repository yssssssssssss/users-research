import type { FastifyPluginAsync } from 'fastify';
import type { ReviewReportRequest } from '@users-research/shared';
import { getReport, reviewReport } from '../services/taskService.js';
import { reportIdParamsSchema, reviewReportBodySchema } from './schemas.js';

type ReportIdParams = { reportId: string };

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: ReportIdParams }>(
    '/reports/:reportId',
    {
      schema: {
        params: reportIdParamsSchema,
      },
    },
    async (request) => getReport(request.params.reportId),
  );

  app.post<{ Params: ReportIdParams; Body: ReviewReportRequest }>(
    '/reports/:reportId/review',
    {
      schema: {
        params: reportIdParamsSchema,
        body: reviewReportBodySchema,
      },
    },
    async (request) => reviewReport(request.params.reportId, request.body),
  );

  app.post<{ Params: ReportIdParams }>(
    '/reports/:reportId/export',
    {
      schema: {
        params: reportIdParamsSchema,
      },
    },
    async (request) => ({
      reportId: request.params.reportId,
      exportUrl: `/mock-exports/${request.params.reportId}.md`,
    }),
  );
};
