import Fastify from 'fastify';
import { appConfig } from './config/env';
import { apiRoutes } from './routes';

export const buildServer = () => {
  const app = Fastify({ logger: appConfig.env === 'development' });

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
