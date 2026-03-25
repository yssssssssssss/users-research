import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const parseEnvFile = (filepath) => {
  if (!existsSync(filepath)) return {};

  const content = readFileSync(filepath, 'utf-8');
  return content.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;
    const index = trimmed.indexOf('=');
    if (index <= 0) return acc;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    acc[key] = value;
    return acc;
  }, {});
};

const fileEnv = parseEnvFile(resolve(rootDir, '.env.local'));

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key] ?? fileEnv[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const hasTextModelConfig = () =>
  Boolean(
    readEnv('TEXT_MODEL_API_URL', 'VITE_TEXT_MODEL_API_URL')
      && readEnv('TEXT_MODEL_API_KEY', 'VITE_TEXT_MODEL_API_KEY'),
  );

const getSearchProviderState = () => {
  const tavily = Boolean(readEnv('TAVILY_API_KEY'));
  const google = Boolean(readEnv('GOOGLE_PSE_API_KEY') && readEnv('GOOGLE_PSE_CX'));
  const exa = Boolean(readEnv('EXA_API_KEY'));

  return {
    tavily,
    google_pse: google,
    exa,
    any: tavily || google || exa,
  };
};

export const getRealSmokePreflight = (options = {}) => {
  const requireExternalSearch = options.requireExternalSearch !== false;
  const textModelsReady = hasTextModelConfig();
  const searchProviders = getSearchProviderState();
  const missing = [];

  if (!textModelsReady) {
    missing.push('缺少 TEXT_MODEL_API_URL/VITE_TEXT_MODEL_API_URL 或 TEXT_MODEL_API_KEY/VITE_TEXT_MODEL_API_KEY');
  }

  if (requireExternalSearch && !searchProviders.any) {
    missing.push('缺少可用搜索配置：TAVILY_API_KEY，或 GOOGLE_PSE_API_KEY + GOOGLE_PSE_CX，或 EXA_API_KEY');
  }

  return {
    ok: missing.length === 0,
    requireExternalSearch,
    textModelsReady,
    searchProviders,
    envFilePath: resolve(rootDir, '.env.local'),
    missing,
  };
};

export const assertRealSmokeReady = (options = {}) => {
  const result = getRealSmokePreflight(options);
  if (!result.ok) {
    throw new Error(
      [
        'real smoke 前置检查失败：',
        ...result.missing.map((item, index) => `${index + 1}. ${item}`),
        `环境文件：${result.envFilePath}`,
      ].join('\n'),
    );
  }
  return result;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const requireExternalSearch = process.argv.includes('--no-search') ? false : true;
  const result = getRealSmokePreflight({ requireExternalSearch });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}
