import type { FastifyPluginAsync } from 'fastify';
import { taskRoutes } from './tasks.js';
import { evidenceRoutes } from './evidence.js';
import { reportRoutes } from './reports.js';
import { systemRoutes } from './system.js';

export const apiRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ status: 'ok' }));
  await app.register(taskRoutes, { prefix: '/api/research' });
  await app.register(evidenceRoutes, { prefix: '/api/research' });
  await app.register(reportRoutes, { prefix: '/api/research' });
  await app.register(systemRoutes, { prefix: '/api' });
};
