import { appConfig } from './config/env.js';
import { buildServer } from './app.js';

const start = async () => {
  const app = buildServer();

  try {
    await app.listen({
      port: appConfig.server.port,
      host: appConfig.server.host,
    });
    app.log.info(
      {
        host: appConfig.server.host,
        port: appConfig.server.port,
        persistenceEnabled: appConfig.persistence.enabled,
        persistenceMode: appConfig.persistence.mode,
      },
      'server started',
    );
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
