import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type EnvMap = Record<string, string>;

const parseEnvFile = (filepath: string): EnvMap => {
  if (!existsSync(filepath)) return {};

  const content = readFileSync(filepath, 'utf-8');
  return content.split(/\r?\n/).reduce<EnvMap>((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;
    const index = trimmed.indexOf('=');
    if (index <= 0) return acc;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    acc[key] = value.replace(/^['"]|['"]$/g, '');
    return acc;
  }, {});
};

const findNearestEnvFile = (filename: string): string | undefined => {
  let currentDir = process.cwd();

  while (true) {
    const candidate = resolve(currentDir, filename);
    if (existsSync(candidate)) return candidate;

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) return undefined;
    currentDir = parentDir;
  }
};

const fileEnv = parseEnvFile(findNearestEnvFile('.env.local') || resolve(process.cwd(), '.env.local'));

const readEnv = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key] ?? fileEnv[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

export const appConfig = {
  env: readEnv('NODE_ENV') || 'development',
  server: {
    host: readEnv('HOST') || '0.0.0.0',
    port: Number(readEnv('PORT') || '8787'),
  },
  persistence: {
    databaseUrl: readEnv('DATABASE_URL'),
    enabled: Boolean(readEnv('DATABASE_URL')),
  },
  models: {
    textApiUrl: readEnv('TEXT_MODEL_API_URL', 'VITE_TEXT_MODEL_API_URL'),
    textApiKey: readEnv('TEXT_MODEL_API_KEY', 'VITE_TEXT_MODEL_API_KEY'),
    anthropicApiUrl: readEnv('ANTHROPIC_API_URL', 'VITE_ANTHROPIC_API_URL'),
    anthropicApiKey: readEnv('ANTHROPIC_API_KEY', 'VITE_ANTHROPIC_API_KEY'),
    geminiImageApiUrl: readEnv('GEMINI_IMAGE_API_URL', 'VITE_GEMINI_IMAGE_API_URL'),
    geminiApiKey: readEnv('GEMINI_API_KEY', 'VITE_GEMINI_API_KEY'),
    jimengImageApiUrl: readEnv('JIMENG_IMAGE_API_URL', 'VITE_JIMENG_IMAGE_API_URL'),
    jimengApiKey: readEnv('JIMENG_API_KEY', 'VITE_JIMENG_API_KEY'),
  },
  oss: {
    region: readEnv('JD_OSS_REGION'),
    endpoint: readEnv('JD_OSS_ENDPOINT'),
    bucket: readEnv('JD_OSS_BUCKET'),
    accessKeyId: readEnv('JD_OSS_ACCESS_KEY_ID'),
    secretAccessKey: readEnv('JD_OSS_SECRET_ACCESS_KEY'),
    uploadPrefix: readEnv('JD_OSS_UPLOAD_PREFIX'),
  },
};

export type AppConfig = typeof appConfig;
