import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type EnvMap = Record<string, string>;

const parseCorsOrigin = (value?: string): true | string | string[] => {
  if (!value || value === '*') return true;

  const origins = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (origins.length <= 1) {
    return origins[0] || true;
  }

  return origins;
};

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

const resolvedEnvFilePath = findNearestEnvFile('.env.local') || resolve(process.cwd(), '.env.local');
const fileEnv = parseEnvFile(resolvedEnvFilePath);

const readEnv = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key] ?? fileEnv[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

const databaseUrl = readEnv('DATABASE_URL');
const persistenceMode: 'memory' | 'sqlite' | 'postgresql' = !databaseUrl
  ? 'memory'
  : databaseUrl.startsWith('file:')
    ? 'sqlite'
    : 'postgresql';

export const appConfig = {
  paths: {
    cwd: process.cwd(),
    envFilePath: resolvedEnvFilePath,
    envDir: dirname(resolvedEnvFilePath),
  },
  env: readEnv('NODE_ENV') || 'development',
  server: {
    host: readEnv('HOST') || '0.0.0.0',
    port: Number(readEnv('PORT') || '8787'),
    corsOrigin: parseCorsOrigin(readEnv('CORS_ORIGIN')),
  },
  persistence: {
    databaseUrl,
    enabled: Boolean(databaseUrl),
    mode: persistenceMode,
  },
  research: {
    useMockEvidence: readEnv('USE_MOCK_EVIDENCE') === 'true',
  },
  models: {
    disabled: readEnv('DISABLE_TEXT_MODELS') === 'true',
    textApiUrl: readEnv('TEXT_MODEL_API_URL', 'VITE_TEXT_MODEL_API_URL'),
    textApiKey: readEnv('TEXT_MODEL_API_KEY', 'VITE_TEXT_MODEL_API_KEY'),
    anthropicApiUrl: readEnv('ANTHROPIC_API_URL', 'VITE_ANTHROPIC_API_URL'),
    anthropicApiKey: readEnv('ANTHROPIC_API_KEY', 'VITE_ANTHROPIC_API_KEY'),
    geminiImageApiUrl: readEnv('GEMINI_IMAGE_API_URL', 'VITE_GEMINI_IMAGE_API_URL'),
    geminiApiKey: readEnv('GEMINI_API_KEY', 'VITE_GEMINI_API_KEY'),
    jimengImageApiUrl: readEnv('JIMENG_IMAGE_API_URL', 'VITE_JIMENG_IMAGE_API_URL'),
    jimengApiKey: readEnv('JIMENG_API_KEY', 'VITE_JIMENG_API_KEY'),
  },
  search: {
    tavilyApiKey: readEnv('TAVILY_API_KEY'),
    tavilyApiUrl: readEnv('TAVILY_API_URL') || 'https://api.tavily.com/search',
    googlePseApiKey: readEnv('GOOGLE_PSE_API_KEY'),
    googlePseCx: readEnv('GOOGLE_PSE_CX'),
    googlePseApiUrl:
      readEnv('GOOGLE_PSE_API_URL') || 'https://www.googleapis.com/customsearch/v1',
    exaApiKey: readEnv('EXA_API_KEY'),
    exaApiUrl: readEnv('EXA_API_URL') || 'https://api.exa.ai/search',
    timeoutMs: Number(readEnv('SEARCH_TIMEOUT_MS') || '12000'),
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
