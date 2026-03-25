import Fastify from 'fastify';
import cors from '@fastify/cors';
import { appConfig } from './config/env.js';
import { apiRoutes } from './routes/index.js';

export const buildServer = () => {
  const app = Fastify({
    logger: appConfig.env === 'development',
    bodyLimit: 50 * 1024 * 1024,
  });

  app.register(cors, {
    origin: appConfig.server.corsOrigin,
  });
  app.register(apiRoutes);

  app.setErrorHandler((error, _request, reply) => {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode =
      typeof (error as { statusCode?: number })?.statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500;
    reply.status(statusCode).send({
      message,
    });
  });

  return app;
};
