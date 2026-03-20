import type { FastifyPluginAsync } from 'fastify';
import { taskRoutes } from './tasks';
import { evidenceRoutes } from './evidence';
import { reportRoutes } from './reports';
import { systemRoutes } from './system';

export const apiRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ status: 'ok' }));
  await app.register(taskRoutes, { prefix: '/api/research' });
  await app.register(evidenceRoutes, { prefix: '/api/research' });
  await app.register(reportRoutes, { prefix: '/api/research' });
  await app.register(systemRoutes, { prefix: '/api' });
};
