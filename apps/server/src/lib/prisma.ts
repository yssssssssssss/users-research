import { PrismaClient } from '@prisma/client';
import { appConfig } from '../config/env';

declare global {
  // eslint-disable-next-line no-var
  var __usersResearchPrisma__: PrismaClient | undefined;
}

let prismaSingleton: PrismaClient | null = null;

export const getPrismaClient = (): PrismaClient => {
  if (!appConfig.persistence.enabled) {
    throw new Error('当前未配置 DATABASE_URL，数据库持久化不可用。');
  }

  if (prismaSingleton) return prismaSingleton;

  prismaSingleton =
    globalThis.__usersResearchPrisma__ ??
    new PrismaClient({
      log: appConfig.env === 'development' ? ['warn', 'error'] : ['error'],
    });

  if (appConfig.env !== 'production') {
    globalThis.__usersResearchPrisma__ = prismaSingleton;
  }

  return prismaSingleton;
};
