/**
 * 可迁移的多模型客户端封装
 *
 * 适用场景：
 * 1. 复用当前项目的 JDCloud / OpenAI-compatible 文本接口
 * 2. 复用 Gemini 图片生成/编辑/扩图
 * 3. 复用即梦（Doubao Seedream）图片生成/编辑
 * 4. 复用多模型串行调度逻辑
 *
 * 推荐用法：
 * - 在新项目中直接复制本文件
 * - 通过 createModelClients(config) 注入端点和 API Key
 * - 不依赖当前仓库其他文件
 */

declare const process: any;

export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentPart[];
}

export interface ModelOption {
  id: string;
  name: string;
  selected?: boolean;
  systemPrompt?: string;
}

export interface ModelClientConfig {
  textApiUrl?: string;
  textApiKey?: string;
  anthropicApiUrl?: string;
  anthropicApiKey?: string;
  geminiImageApiUrl?: string;
  geminiApiKey?: string;
  jimengImageApiUrl?: string;
  jimengApiKey?: string;
  defaultSystemPrompt?: string;
  textTimeoutMs?: number;
  streamTimeoutMs?: number;
  /**
   * 在浏览器开发环境下，如果你希望把
   * https://modelservice.jdcloud.com/xxx
   * 自动改写为 /jdcloud/xxx，可开启此项。
   */
  preferJdcloudProxyPath?: boolean;
  fetchImpl?: typeof fetch;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  apiUrl?: string;
  apiKey?: string;
}

export interface ChatCompletionStreamOptions extends ChatCompletionOptions {
  onText?: (fullText: string) => void;
}

export type ImageInput = string | string[] | null | undefined;

export interface GeminiGenerateOptions {
  prompt: string;
  inputImage?: ImageInput;
  model?: string;
  size?: string;
  apiUrl?: string;
  apiKey?: string;
}

export interface GeminiEditOptions {
  originalImage: string;
  maskImage: string;
  prompt: string;
  referenceImage?: string;
  model?: string;
  apiUrl?: string;
  apiKey?: string;
}

export interface GeminiExpandOptions {
  inputImage: string;
  size: string;
  model?: string;
  apiUrl?: string;
  apiKey?: string;
}

export interface SeedreamGenerateOptions {
  prompt: string;
  inputImage?: ImageInput;
  model?: string;
  apiUrl?: string;
  apiKey?: string;
}

export interface SeedreamEditOptions {
  originalImage: string;
  prompt: string;
  maskImage?: string;
  referenceImage?: string;
  referenceMask?: string;
  model?: string;
  mode?: 'inpaint' | 'remix';
  apiUrl?: string;
  apiKey?: string;
}

export interface MultiModelTextInput {
  prompt: string;
  messages?: ChatMessage[];
  models: TextModelRoute[];
  globalSystemPrompt?: string;
  onUpdate?: (responses: TextModelResponse[]) => void;
}

export interface MultiModelImageInput {
  prompt: string;
  models: Array<{ id: string; name?: string; systemPrompt?: string }>;
  inputImage?: ImageInput;
  onUpdate?: (responses: ImageModelResponse[]) => void;
}

export interface TextModelResponse {
  model: string;
  name?: string;
  text: string;
  loading: boolean;
  error?: string;
  actualModel?: string;
  attemptedModels?: string[];
  warnings?: string[];
}

export interface ImageModelResponse {
  model: string;
  name?: string;
  imageUrl?: string;
  loading: boolean;
  error?: string;
}

export interface GeneratedImageResult {
  id: string;
  model: string;
  prompt: string;
  url: string;
}

export interface TextModelRoute {
  id: string;
  name?: string;
  systemPrompt?: string;
  fallbacks?: Array<{ id: string; name?: string }>;
}

type GeminiInlineData = {
  data: string;
  mimeType?: string;
  mime_type?: string;
};

type GeminiPart = {
  text?: string;
  inline_data?: GeminiInlineData;
  inlineData?: GeminiInlineData;
  file_data?: { mime_type?: string; mimeType?: string; file_uri: string };
  fileData?: { mime_type?: string; mimeType?: string; fileUri: string };
  image_url?: string;
  imageUrl?: string;
  url?: string;
};

type GeminiContents =
  | { role: string; parts: GeminiPart[] }
  | Array<{ role: string; parts: GeminiPart[] }>;

interface GeminiImageRequest {
  model: string;
  contents: GeminiContents;
  size?: string;
  generation_config?: {
    response_modalities?: string[];
  };
  stream: boolean;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: unknown };
    delta?: { content?: string; text?: string };
  }>;
  candidates?: Array<{
    content?: unknown;
  }>;
  output_text?: string;
}

interface AnthropicMessageResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful AI assistant. Please provide clear, accurate, and concise responses.';

export const DEFAULT_TEXT_MODELS: ModelOption[] = [
  { id: 'GLM-5', name: 'GLM-5', selected: true },
  { id: 'Doubao-Seed-2.0-pro', name: '豆包 Seed 2.0 Pro' },
  { id: 'Kimi-K2.5', name: 'Kimi K2.5' },
  { id: 'GPT 5.2', name: 'GPT 5.2' },
  { id: 'Gemini-3.1-Pro-Preview', name: 'Gemini 3.1 Pro Preview' },
  { id: 'Claude-Opus-4.6', name: 'Claude Opus 4.6' },
  { id: 'MiniMax-M2.5', name: 'MiniMax M2.5' },
];

export const DEFAULT_IMAGE_MODELS: ModelOption[] = [
  {
    id: 'Gemini 3-Pro-Image-Preview',
    name: 'Gemini 3 Pro',
    selected: true,
    systemPrompt:
      'Generate high-quality, detailed images with professional composition and lighting.',
  },
  {
    id: 'Gemini-2.5-flash-image-preview',
    name: 'Gemini 2.5 Flash',
    systemPrompt:
      'Generate images quickly while maintaining good quality and artistic style.',
  },
  {
    id: 'doubao-seedream-4-0-250828',
    name: '即梦 4.0',
    systemPrompt: 'Generate creative images with Chinese prompt understanding.',
  },
  {
    id: 'doubao-seedream-4-5-251128',
    name: '即梦 4.5',
    systemPrompt:
      'Generate high-quality creative images with advanced Chinese prompt understanding.',
  },
];

const randomId = (): string =>
  `img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const readProcessEnv = (name: string): string | undefined => {
  try {
    const value = process?.env?.[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  } catch {
    // ignore
  }
  return undefined;
};

const pickValue = (...values: Array<string | undefined>): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const getFetch = (config?: ModelClientConfig): typeof fetch => {
  const fetchImpl = config?.fetchImpl || globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('当前环境不存在 fetch，请通过 config.fetchImpl 注入。');
  }
  return fetchImpl.bind(globalThis);
};

const DEFAULT_TEXT_TIMEOUT_MS = 120000;
const DEFAULT_STREAM_TIMEOUT_MS = 120000;

const fetchWithTimeout = async (
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`模型请求超时（>${timeoutMs}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const runWithTimeout = async <T>(
  label: string,
  timeoutMs: number,
  operation: Promise<T>,
): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`${label}超时`);
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label}（>${timeoutMs}ms）`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

const getRemainingTimeout = (startedAt: number, totalTimeoutMs: number): number =>
  Math.max(1, totalTimeoutMs - (Date.now() - startedAt));

const normalizeJdcloudUrl = (url: string, preferProxyPath?: boolean): string => {
  const trimmed = (url || '').trim();
  if (!trimmed) return trimmed;
  if (!preferProxyPath) return trimmed;
  if (trimmed.startsWith('/jdcloud/')) return trimmed;

  if (typeof window !== 'undefined' && /^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (
        parsed.hostname === 'ai-api.jdcloud.com' ||
        parsed.hostname === 'modelservice.jdcloud.com'
      ) {
        return `/jdcloud${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // ignore
    }
  }

  return trimmed;
};

const getTextApiUrl = (config?: ModelClientConfig, override?: string): string =>
  normalizeJdcloudUrl(
    pickValue(
      override,
      config?.textApiUrl,
      readProcessEnv('TEXT_MODEL_API_URL'),
      readProcessEnv('VITE_TEXT_MODEL_API_URL'),
      'https://modelservice.jdcloud.com/v1/chat/completions',
    ) as string,
    config?.preferJdcloudProxyPath,
  );

const getTextApiKey = (config?: ModelClientConfig, override?: string): string =>
  pickValue(
    override,
    config?.textApiKey,
    readProcessEnv('TEXT_MODEL_API_KEY'),
    readProcessEnv('VITE_TEXT_MODEL_API_KEY'),
  ) || '';

const getAnthropicApiUrl = (config?: ModelClientConfig, override?: string): string =>
  normalizeJdcloudUrl(
    pickValue(
      override,
      config?.anthropicApiUrl,
      readProcessEnv('ANTHROPIC_API_URL'),
      readProcessEnv('VITE_ANTHROPIC_API_URL'),
      'https://ai-api.jdcloud.com/anthropic/v1/messages',
    ) as string,
    config?.preferJdcloudProxyPath,
  );

const getAnthropicApiKey = (config?: ModelClientConfig, override?: string): string =>
  pickValue(
    override,
    config?.anthropicApiKey,
    readProcessEnv('ANTHROPIC_API_KEY'),
    readProcessEnv('VITE_ANTHROPIC_API_KEY'),
    getTextApiKey(config),
  ) || '';

const getGeminiImageApiUrl = (config?: ModelClientConfig, override?: string): string =>
  normalizeJdcloudUrl(
    pickValue(
      override,
      config?.geminiImageApiUrl,
      readProcessEnv('GEMINI_IMAGE_API_URL'),
      readProcessEnv('VITE_GEMINI_IMAGE_API_URL'),
      'https://modelservice.jdcloud.com/v1/images/gemini_flash/generations',
    ) as string,
    config?.preferJdcloudProxyPath,
  );

const getGeminiApiKey = (config?: ModelClientConfig, override?: string): string =>
  pickValue(
    override,
    config?.geminiApiKey,
    readProcessEnv('GEMINI_API_KEY'),
    readProcessEnv('VITE_GEMINI_API_KEY'),
  ) || '';

const getJimengApiUrl = (config?: ModelClientConfig, override?: string): string =>
  normalizeJdcloudUrl(
    pickValue(
      override,
      config?.jimengImageApiUrl,
      readProcessEnv('JIMENG_IMAGE_API_URL'),
      readProcessEnv('VITE_JIMENG_IMAGE_API_URL'),
      'https://modelservice.jdcloud.com/v1/imageEdit/generations',
    ) as string,
    config?.preferJdcloudProxyPath,
  );

const getJimengApiKey = (config?: ModelClientConfig, override?: string): string =>
  pickValue(
    override,
    config?.jimengApiKey,
    readProcessEnv('JIMENG_API_KEY'),
    readProcessEnv('VITE_JIMENG_API_KEY'),
    getGeminiApiKey(config),
  ) || '';

const buildHeaders = (apiKey: string): HeadersInit => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  Accept: '*/*',
});

const isAnthropicModel = (model: string): boolean => /^Claude-/i.test((model || '').trim());

const normalizeContent = (content: unknown): string => {
  if (content == null) return '';

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => normalizeContent(part))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (typeof content === 'object') {
    const anyContent = content as Record<string, unknown>;
    if (typeof anyContent.text === 'string') {
      return anyContent.text;
    }
    if (typeof anyContent.value === 'string') {
      return anyContent.value;
    }
    if ('content' in anyContent) {
      return normalizeContent(anyContent.content);
    }
    if ('parts' in anyContent) {
      return normalizeContent(anyContent.parts);
    }
  }

  return '';
};

const stripThinkTags = (value: string): string =>
  value
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '');

const stripWholeCodeFence = (value: string): string => {
  let output = value.trim();

  while (true) {
    const match = output.match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```$/);
    if (!match?.[1]) {
      return output;
    }
    output = match[1].trim();
  }
};

const stripJsonLeadIn = (value: string): string => {
  const trimmed = value.trim();
  const jsonStart = trimmed.search(/[\[{]/);
  if (jsonStart <= 0) return trimmed;

  const prefix = trimmed.slice(0, jsonStart).trim();
  const candidate = trimmed.slice(jsonStart).trim();
  if (!candidate || !/^[\[{]/.test(candidate)) return trimmed;

  if (
    /^(?:以下(?:是)?|输出|结果|json|answer|response|here(?:'s| is))(?:的)?[\s:：-]*$/i.test(prefix)
  ) {
    return candidate;
  }

  return trimmed;
};

export const cleanModelTextOutput = (value: string): string => {
  if (!value) return '';

  const normalized = value.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const withoutThink = stripThinkTags(normalized);
  const withoutFence = stripWholeCodeFence(withoutThink);
  const withoutLeadIn = stripJsonLeadIn(withoutFence);

  return withoutLeadIn.trim();
};

const parseChatText = (data: ChatCompletionResponse): string => {
  if (Array.isArray(data.choices) && data.choices.length > 0) {
    const text = cleanModelTextOutput(normalizeContent(data.choices[0]?.message?.content));
    if (text) return text;
  }

  if (Array.isArray(data.candidates) && data.candidates.length > 0) {
    const text = cleanModelTextOutput(normalizeContent(data.candidates[0]?.content));
    if (text) return text;
  }

  if (typeof data.output_text === 'string') {
    return cleanModelTextOutput(data.output_text);
  }

  return '';
};

const parseAnthropicText = (data: AnthropicMessageResponse): string => {
  if (!Array.isArray(data.content)) return '';
  return cleanModelTextOutput(
    data.content
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text || '')
      .join('\n')
      .trim(),
  );
};

const extractStreamDelta = (data: unknown): { delta?: string; full?: string } => {
  if (!data || typeof data !== 'object') return {};
  const payload = data as ChatCompletionResponse;
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;

  if (choice?.delta?.content) return { delta: choice.delta.content };
  if (choice?.delta?.text) return { delta: choice.delta.text };

  const fullMessage = normalizeContent(choice?.message?.content);
  if (fullMessage) return { full: fullMessage };

  if (typeof payload.output_text === 'string') {
    return { full: payload.output_text };
  }

  const candidate = Array.isArray(payload.candidates) ? payload.candidates[0] : undefined;
  const candidateText = normalizeContent(candidate?.content);
  if (candidateText) return { full: candidateText };

  return {};
};

const appendCumulativeDelta = (current: string, next: string): string => {
  if (!next) return '';
  if (!current) return next;
  if (next.startsWith(current)) return next.slice(current.length);
  return next;
};

const toAnthropicContent = (
  content: string | ChatContentPart[],
): string | Array<
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source:
        | { type: 'url'; url: string }
        | { type: 'base64'; media_type: string; data: string };
    }
> => {
  if (typeof content === 'string') return content;

  return content.map((part) =>
    part.type === 'text'
      ? { type: 'text' as const, text: part.text }
      : (() => {
          const url = part.image_url.url;
          if (url.startsWith('data:')) {
            return {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: extractMimeType(url),
                data: extractBase64Data(url),
              },
            };
          }

          return {
            type: 'image' as const,
            source: {
              type: 'url' as const,
              url,
            },
          };
        })(),
  );
};

const buildAnthropicPayload = (options: {
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  stream: boolean;
}): Record<string, unknown> => ({
  model: options.model,
  max_tokens: 1024,
  ...(options.systemPrompt
    ? {
        system: [
          {
            type: 'text',
            text: options.systemPrompt,
          },
        ],
      }
    : {}),
  messages: options.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role,
      content: toAnthropicContent(message.content),
    })),
  ...(options.stream ? { stream: true } : {}),
});

const assertApiKey = (apiKey: string, label: string) => {
  if (!apiKey.trim()) {
    throw new Error(`${label} 未配置，请在 createModelClients(config) 中传入或设置环境变量。`);
  }
};

const extractBase64Data = (value: string): string => {
  if (value.startsWith('data:')) {
    return value.split(',')[1] || value;
  }
  return value;
};

const extractMimeType = (value: string): string => {
  if (value.startsWith('data:')) {
    const match = value.match(/data:([^;]+);/);
    return match?.[1] || 'image/png';
  }
  return 'image/png';
};

const ensureDataUrl = (value: string, mimeType = 'image/png'): string => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  let detectedMime = mimeType;
  if (trimmed.startsWith('/9j/')) detectedMime = 'image/jpeg';
  else if (trimmed.startsWith('iVBORw0')) detectedMime = 'image/png';
  else if (trimmed.startsWith('R0lGOD')) detectedMime = 'image/gif';
  else if (trimmed.startsWith('UklGR')) detectedMime = 'image/webp';

  return `data:${detectedMime};base64,${trimmed}`;
};

const toImageInputList = (input: ImageInput): string[] => {
  if (!input) return [];
  return Array.isArray(input) ? input.filter(Boolean) : [input];
};

const detectImageMimeFromBase64 = (base64: string): string => {
  const trimmed = (base64 || '').trim();
  if (trimmed.startsWith('/9j/')) return 'jpeg';
  if (trimmed.startsWith('iVBORw0')) return 'png';
  if (trimmed.startsWith('R0lGOD')) return 'gif';
  if (trimmed.startsWith('UklGR')) return 'webp';
  return 'png';
};

const normalizeSeedreamImageValue = (value: string): string => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (/^data:image\//i.test(trimmed)) {
    const match = trimmed.match(/^data:image\/([^;]+);base64,/i);
    if (!match) return trimmed;
    const format = (match[1] || 'png').toLowerCase();
    return trimmed.replace(/^data:image\/[^;]+;base64,/i, `data:image/${format};base64,`);
  }

  const mime = detectImageMimeFromBase64(trimmed);
  return `data:image/${mime};base64,${trimmed}`;
};

const buildGeminiImagePart = (value: string, isJdcloud: boolean): GeminiPart | null => {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return isJdcloud
      ? { file_data: { mime_type: 'image/png', file_uri: trimmed } }
      : { fileData: { mimeType: 'image/png', fileUri: trimmed } };
  }

  const normalized = normalizeSeedreamImageValue(trimmed);
  const base64Data = extractBase64Data(normalized);
  const mimeType = extractMimeType(normalized);
  const inline = isJdcloud
    ? { data: base64Data, mime_type: mimeType }
    : { data: base64Data, mimeType };

  return isJdcloud ? { inline_data: inline } : { inlineData: inline };
};

const pickFirstImageField = (source: unknown, keys: string[]): string | null => {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return ensureDataUrl(value.trim());
    }
  }
  return null;
};

const extractImageFromParts = (parts?: GeminiPart[] | GeminiPart): string | null => {
  if (!parts) return null;
  const list = Array.isArray(parts) ? parts : [parts];

  for (const part of list) {
    if (!part) continue;

    const inline = part.inline_data || part.inlineData;
    if (inline?.data) {
      return ensureDataUrl(inline.data, inline.mime_type || inline.mimeType || 'image/png');
    }

    const fileData = part.file_data || part.fileData;
    const fileUri =
      (fileData as { file_uri?: string; fileUri?: string } | undefined)?.file_uri ||
      (fileData as { file_uri?: string; fileUri?: string } | undefined)?.fileUri;
    if (typeof fileUri === 'string' && fileUri.trim()) {
      return ensureDataUrl(fileUri.trim());
    }

    const direct = part.image_url || part.imageUrl || part.url;
    if (typeof direct === 'string' && direct.trim()) {
      return ensureDataUrl(direct.trim());
    }
  }

  return null;
};

const extractImageFromGeminiResponse = (data: unknown): string | null => {
  if (!data) return null;

  const payload = data as Record<string, any>;

  if (Array.isArray(payload.images) && payload.images.length > 0) {
    const first = payload.images[0];
    if (typeof first === 'string') return ensureDataUrl(first);
    if (first?.b64_json || first?.base64 || first?.data) {
      return ensureDataUrl(first.b64_json || first.base64 || first.data);
    }
  }

  if (Array.isArray(payload.data) && payload.data.length > 0) {
    const fromData = pickFirstImageField(payload.data[0], [
      'b64_json',
      'image',
      'image_base64',
      'base64',
      'b64',
      'data',
      'url',
    ]);
    if (fromData) return fromData;
  }

  if (Array.isArray(payload.candidates)) {
    for (const candidate of payload.candidates) {
      const fromParts = extractImageFromParts(candidate?.content?.parts);
      if (fromParts) return fromParts;

      const direct = pickFirstImageField(candidate, [
        'image',
        'b64_json',
        'image_base64',
        'base64',
      ]);
      if (direct) return direct;
    }
  }

  if (payload.response) {
    const nested = extractImageFromGeminiResponse(payload.response);
    if (nested) return nested;
  }

  if (payload.output) {
    if (typeof payload.output === 'string') return ensureDataUrl(payload.output);
    const fromOutput = pickFirstImageField(payload.output, [
      'image',
      'b64_json',
      'image_base64',
      'base64',
      'url',
    ]);
    if (fromOutput) return fromOutput;
  }

  const fromResult = pickFirstImageField(payload.result, [
    'image',
    'b64_json',
    'image_base64',
  ]);
  if (fromResult) return fromResult;

  const root = pickFirstImageField(payload, ['image', 'image_base64', 'b64_json', 'url']);
  if (root) return root;

  if (Array.isArray(payload.predictions)) {
    for (const prediction of payload.predictions) {
      const direct = pickFirstImageField(prediction, [
        'image',
        'image_base64',
        'b64_json',
        'url',
      ]);
      if (direct) return direct;
      const viaParts = extractImageFromParts(prediction?.content);
      if (viaParts) return viaParts;
    }
  }

  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      const direct = pickFirstImageField(item, ['image', 'image_base64', 'b64_json', 'url']);
      if (direct) return direct;
      const viaParts = extractImageFromParts(item?.content);
      if (viaParts) return viaParts;
    }
  }

  if (typeof data === 'string' && data.trim()) {
    return ensureDataUrl(data.trim());
  }

  return null;
};

const extractImageFromJimengResponse = (data: unknown): string | null => {
  if (!data) return null;
  const payload = data as Record<string, any>;

  if (Array.isArray(payload.data) && payload.data.length > 0) {
    const item = payload.data[0];
    if (item?.url) return ensureDataUrl(item.url, 'image/png');
    if (item?.b64_json) return ensureDataUrl(item.b64_json, 'image/png');

    for (const key of ['image', 'base64', 'b64', 'data']) {
      const value = item?.[key];
      if (typeof value === 'string' && value.trim()) {
        return ensureDataUrl(value.trim(), 'image/png');
      }
    }
  }

  if (typeof data === 'string' && data.trim()) {
    return ensureDataUrl(data.trim(), 'image/png');
  }

  return null;
};

const parseApiError = (errorText: string): string => {
  try {
    const json = JSON.parse(errorText);
    if (json?.error?.message) return json.error.message;
    if (json?.message) return json.message;
  } catch {
    // ignore
  }
  return errorText;
};

export const isSeedreamModel = (model: string): boolean =>
  model === 'doubao-seedream-4-0-250828' || model === 'doubao-seedream-4-5-251128';

export const createModelClients = (config: ModelClientConfig = {}) => {
  const fetchImpl = getFetch(config);
  const textTimeoutMs =
    Number.isFinite(config.textTimeoutMs) && Number(config.textTimeoutMs) > 0
      ? Number(config.textTimeoutMs)
      : DEFAULT_TEXT_TIMEOUT_MS;
  const streamTimeoutMs =
    Number.isFinite(config.streamTimeoutMs) && Number(config.streamTimeoutMs) > 0
      ? Number(config.streamTimeoutMs)
      : DEFAULT_STREAM_TIMEOUT_MS;

  const chatCompletions = async ({
    model,
    messages,
    systemPrompt,
    apiUrl,
    apiKey,
  }: ChatCompletionOptions): Promise<string> => {
    const isAnthropic = isAnthropicModel(model);
    const url = isAnthropic
      ? getAnthropicApiUrl(config, apiUrl)
      : getTextApiUrl(config, apiUrl);
    const key = isAnthropic
      ? getAnthropicApiKey(config, apiKey)
      : getTextApiKey(config, apiKey);
    assertApiKey(key, '文本模型 API Key');

    const finalMessages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt || config.defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT,
      },
      ...messages,
    ];

    const startedAt = Date.now();
    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      {
        method: 'POST',
        headers: buildHeaders(key),
        body: JSON.stringify(
          isAnthropic
            ? buildAnthropicPayload({
                model,
                messages: finalMessages,
                systemPrompt: systemPrompt || config.defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT,
                stream: false,
              })
            : {
                model,
                messages: finalMessages,
                stream: false,
              },
        ),
      },
      getRemainingTimeout(startedAt, textTimeoutMs),
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${await runWithTimeout(
          '模型错误响应读取超时',
          getRemainingTimeout(startedAt, textTimeoutMs),
          response.text(),
        )}`,
      );
    }

    const data = await runWithTimeout(
      '模型响应解析超时',
      getRemainingTimeout(startedAt, textTimeoutMs),
      response.json(),
    );
    const text = isAnthropic
      ? parseAnthropicText(data as AnthropicMessageResponse)
      : parseChatText(data as ChatCompletionResponse);
    if (!text) {
      throw new Error('文本接口响应中未找到可用内容。');
    }
    return text;
  };

  const chatCompletionsStream = async ({
    model,
    messages,
    systemPrompt,
    apiUrl,
    apiKey,
    onText,
  }: ChatCompletionStreamOptions): Promise<string> => {
    const isAnthropic = isAnthropicModel(model);
    const url = isAnthropic
      ? getAnthropicApiUrl(config, apiUrl)
      : getTextApiUrl(config, apiUrl);
    const key = isAnthropic
      ? getAnthropicApiKey(config, apiKey)
      : getTextApiKey(config, apiKey);
    assertApiKey(key, '文本模型 API Key');

    const finalMessages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt || config.defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT,
      },
      ...messages,
    ];

    const startedAt = Date.now();
    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      {
        method: 'POST',
        headers: buildHeaders(key),
        body: JSON.stringify(
          isAnthropic
            ? buildAnthropicPayload({
                model,
                messages: finalMessages,
                systemPrompt: systemPrompt || config.defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT,
                stream: true,
              })
            : {
                model,
                messages: finalMessages,
                stream: true,
              },
        ),
      },
      getRemainingTimeout(startedAt, streamTimeoutMs),
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${await runWithTimeout(
          '模型错误响应读取超时',
          getRemainingTimeout(startedAt, streamTimeoutMs),
          response.text(),
        )}`,
      );
    }

    if (!response.body) {
      const data = await runWithTimeout(
        '流式响应解析超时',
        getRemainingTimeout(startedAt, streamTimeoutMs),
        response.json(),
      );
      const text = isAnthropic
        ? parseAnthropicText(data as AnthropicMessageResponse)
        : parseChatText(data as ChatCompletionResponse);
      if (!text) throw new Error('流式接口响应中未找到可用内容。');
      onText?.(text);
      return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
    let anthropicEvent = '';

    try {
      while (true) {
        const { value, done } = await runWithTimeout(
          '流式读取超时',
          getRemainingTimeout(startedAt, streamTimeoutMs),
          reader.read(),
        );
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const idx = buffer.indexOf('\n');
          if (idx < 0) break;

          const rawLine = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);

          const line = rawLine.trim();
          if (!line) {
            anthropicEvent = '';
            continue;
          }

          if (isAnthropic && line.startsWith('event:')) {
            anthropicEvent = line.slice(6).trim();
            continue;
          }

          const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
          if (!payload) continue;
          if (payload === '[DONE]') return cleanModelTextOutput(fullText);

          let json: unknown;
          try {
            json = JSON.parse(payload);
          } catch {
            continue;
          }

          if (isAnthropic) {
            const anthropicPayload = json as Record<string, any>;
            const deltaText =
              (anthropicEvent === 'content_block_delta' &&
                anthropicPayload?.delta?.type === 'text_delta' &&
                typeof anthropicPayload?.delta?.text === 'string'
                ? anthropicPayload.delta.text
                : undefined) ||
              (anthropicEvent === 'content_block_start' &&
              anthropicPayload?.content_block?.type === 'text' &&
              typeof anthropicPayload?.content_block?.text === 'string'
                ? anthropicPayload.content_block.text
                : undefined);

            if (deltaText) {
              fullText += deltaText;
              onText?.(fullText);
              continue;
            }

            if (anthropicPayload?.type === 'message_stop') {
              return cleanModelTextOutput(fullText);
            }

            const finalText = parseAnthropicText(anthropicPayload as AnthropicMessageResponse);
            if (finalText) {
              const suffix = appendCumulativeDelta(fullText, finalText);
              if (suffix) {
                fullText += suffix;
                onText?.(fullText);
              }
            }
            continue;
          }

          const { delta, full } = extractStreamDelta(json);
          if (typeof delta === 'string' && delta) {
            fullText += delta;
            onText?.(fullText);
            continue;
          }

          if (typeof full === 'string' && full) {
            const suffix = appendCumulativeDelta(fullText, full);
            if (suffix) {
              fullText += suffix;
              onText?.(fullText);
            }
          }
        }
      }
    } catch (error) {
      try {
        await reader.cancel(error instanceof Error ? error.message : 'stream timeout');
      } catch {
        // ignore cancel failures
      }
      throw error;
    }

    const trailing = buffer.trim();
    if (!fullText.trim() && trailing) {
      try {
        const data = JSON.parse(trailing);
        const text = isAnthropic
          ? parseAnthropicText(data as AnthropicMessageResponse)
          : parseChatText(data as ChatCompletionResponse);
        if (text) {
          onText?.(text);
          return text;
        }
      } catch {
        // ignore trailing non-JSON buffer
      }
    }

    if (!fullText.trim()) {
      throw new Error('流式接口结束，但未收到文本内容。');
    }

    return cleanModelTextOutput(fullText);
  };

  const generateImageWithGemini = async ({
    prompt,
    inputImage,
    model = 'Gemini-2.5-flash-image-preview',
    size,
    apiUrl,
    apiKey,
  }: GeminiGenerateOptions): Promise<string> => {
    const url = getGeminiImageApiUrl(config, apiUrl);
    const key = getGeminiApiKey(config, apiKey);
    assertApiKey(key, 'Gemini 图片 API Key');

    const isJdcloud = url.startsWith('/jdcloud') || url.includes('jdcloud.com');
    const parts: GeminiPart[] = [];

    for (const imageValue of toImageInputList(inputImage)) {
      const part = buildGeminiImagePart(imageValue, isJdcloud);
      if (part) parts.push(part);
    }

    if (prompt.trim()) {
      parts.push({ text: prompt });
    }

    const requestBody: GeminiImageRequest = {
      model,
      contents: isJdcloud ? { role: 'USER', parts } : [{ role: 'user', parts }],
      ...(size ? { size } : {}),
      generation_config: { response_modalities: ['TEXT', 'IMAGE'] },
      stream: false,
    };

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: buildHeaders(key),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(parseApiError(await response.text()));
    }

    const data = await response.json();
    const imageUrl = extractImageFromGeminiResponse(data);
    if (!imageUrl) {
      throw new Error('Gemini 图片响应中未找到图像数据。');
    }
    return imageUrl;
  };

  const editImageWithGemini = async ({
    originalImage,
    maskImage,
    prompt,
    referenceImage,
    model = 'Gemini-2.5-flash-image-preview',
    apiUrl,
    apiKey,
  }: GeminiEditOptions): Promise<string> => {
    const url = getGeminiImageApiUrl(config, apiUrl);
    const key = getGeminiApiKey(config, apiKey);
    assertApiKey(key, 'Gemini 图片 API Key');

    const isJdcloud = url.startsWith('/jdcloud') || url.includes('jdcloud.com');
    const parts: GeminiPart[] = [];

    for (const value of [originalImage, maskImage, referenceImage]) {
      if (!value) continue;
      const part = buildGeminiImagePart(value, isJdcloud);
      if (part) parts.push(part);
    }

    if (prompt.trim()) {
      parts.push({ text: prompt });
    }

    const requestBody: GeminiImageRequest = {
      model,
      contents: isJdcloud ? { role: 'USER', parts } : [{ role: 'user', parts }],
      generation_config: { response_modalities: ['IMAGE'] },
      stream: false,
    };

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: buildHeaders(key),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const imageUrl = extractImageFromGeminiResponse(data);
    if (!imageUrl) {
      throw new Error('Gemini 编辑响应中未找到图像数据。');
    }
    return imageUrl;
  };

  const expandImageWithGeminiPro = async ({
    inputImage,
    size,
    model = 'Gemini 3-Pro-Image-Preview',
    apiUrl,
    apiKey,
  }: GeminiExpandOptions): Promise<string> => {
    const safeSize = size.trim();
    if (!safeSize) {
      throw new Error('size 不能为空。');
    }

    const prompt = `严格保持图片的主体不变，将背景按照需要的 ${safeSize} 尺寸进行扩展`;

    return generateImageWithGemini({
      prompt,
      inputImage,
      model,
      size: safeSize,
      apiUrl,
      apiKey,
    });
  };

  const requestSeedream = async (
    requestBody: Record<string, unknown>,
    apiUrl?: string,
    apiKey?: string,
  ): Promise<string> => {
    const url = getJimengApiUrl(config, apiUrl);
    const key = getJimengApiKey(config, apiKey);
    assertApiKey(key, '即梦图片 API Key');

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: buildHeaders(key),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(parseApiError(await response.text()));
    }

    const data = await response.json();
    const imageUrl = extractImageFromJimengResponse(data);
    if (!imageUrl) {
      throw new Error('即梦响应中未找到图像数据。');
    }
    return imageUrl;
  };

  const generateImageWithSeedream = async ({
    prompt,
    inputImage,
    model = 'doubao-seedream-4-5-251128',
    apiUrl,
    apiKey,
  }: SeedreamGenerateOptions): Promise<string> => {
    const inputs = toImageInputList(inputImage)
      .map(normalizeSeedreamImageValue)
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      model,
      prompt,
      ...(inputs.length
        ? { image: inputs.length === 1 ? inputs[0] : inputs }
        : {}),
      size: '2K',
      sequential_image_generation: 'disabled',
      response_format: 'b64_json',
      watermark: true,
    };

    return requestSeedream(payload, apiUrl, apiKey);
  };

  const editImageWithSeedream = async ({
    originalImage,
    prompt,
    maskImage,
    referenceImage,
    referenceMask,
    model = 'doubao-seedream-4-0-250828',
    mode,
    apiUrl,
    apiKey,
  }: SeedreamEditOptions): Promise<string> => {
    const payload: Record<string, unknown> = {
      model,
      prompt,
      image: normalizeSeedreamImageValue(originalImage),
      size: '2K',
      sequential_image_generation: 'disabled',
      response_format: 'b64_json',
      watermark: true,
    };

    if (maskImage) {
      const normalizedMask = normalizeSeedreamImageValue(maskImage);
      payload.mask = normalizedMask;
      payload.mask_image = normalizedMask;
      payload.maskImage = normalizedMask;
    }

    if (referenceImage) {
      payload.reference_image = normalizeSeedreamImageValue(referenceImage);
    }

    if (referenceMask) {
      const normalizedRefMask = normalizeSeedreamImageValue(referenceMask);
      payload.reference_mask = normalizedRefMask;
      payload.referenceMask = normalizedRefMask;
    }

    if (mode) {
      payload.mode = mode;
      payload.operation = mode;
    }

    return requestSeedream(payload, apiUrl, apiKey);
  };

  const generateTextMultiModel = async ({
    prompt,
    messages,
    models,
    globalSystemPrompt,
    onUpdate,
  }: MultiModelTextInput): Promise<TextModelResponse[]> => {
    const responses: TextModelResponse[] = models.map((model) => ({
      model: model.id,
      name: model.name,
      text: '',
      loading: true,
    }));

    onUpdate?.([...responses]);

    await Promise.all(
      models.map(async (model, index) => {
        const attemptChain = [
          { id: model.id, name: model.name },
          ...(model.fallbacks || []),
        ].filter(
          (candidate, candidateIndex, list) =>
            candidate.id &&
            list.findIndex((item) => item.id === candidate.id) === candidateIndex,
        );
        const attemptErrors: string[] = [];

        try {
          let text = '';
          let actualModel = model.id;

          for (const candidate of attemptChain) {
            try {
              text = await chatCompletionsStream({
                model: candidate.id,
                messages: messages || [{ role: 'user', content: prompt }],
                systemPrompt: model.systemPrompt || globalSystemPrompt,
                onText: (fullText) => {
                  responses[index] = {
                    ...responses[index],
                    text: fullText,
                    loading: true,
                    attemptedModels: attemptChain.map((item) => item.id),
                    actualModel: candidate.id,
                  };
                  onUpdate?.([...responses]);
                },
              });
              actualModel = candidate.id;
              break;
            } catch (error) {
              attemptErrors.push(
                `${candidate.id}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          if (!text) {
            throw new Error(attemptErrors.join('；') || '未获得模型返回内容');
          }

          const warnings =
            actualModel !== model.id
              ? [`主模型 ${model.id} 不可用，已自动降级到 ${actualModel}。`]
              : [];

          responses[index] = {
            ...responses[index],
            text,
            loading: false,
            actualModel,
            attemptedModels: attemptChain.map((item) => item.id),
            warnings,
          };
        } catch (error) {
          responses[index] = {
            ...responses[index],
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            attemptedModels: attemptChain.map((item) => item.id),
          };
        }

        onUpdate?.([...responses]);
      }),
    );

    return responses;
  };

  const generateImageMultiModel = async ({
    prompt,
    models,
    inputImage,
    onUpdate,
  }: MultiModelImageInput): Promise<ImageModelResponse[]> => {
    const responses: ImageModelResponse[] = models.map((model) => ({
      model: model.id,
      name: model.name,
      loading: true,
    }));

    onUpdate?.([...responses]);

    for (let index = 0; index < models.length; index += 1) {
      const model = models[index];
      try {
        const imageUrl = isSeedreamModel(model.id)
          ? await generateImageWithSeedream({
              prompt,
              inputImage,
              model: model.id,
            })
          : await generateImageWithGemini({
              prompt,
              inputImage,
              model: model.id,
            });

        responses[index] = {
          ...responses[index],
          loading: false,
          imageUrl,
        };
      } catch (error) {
        responses[index] = {
          ...responses[index],
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      onUpdate?.([...responses]);
    }

    return responses;
  };

  const generateImagesFromWorkflow = async (
    prompt: string,
    models: Array<{ id: string; systemPrompt?: string }>,
    inputImage?: ImageInput,
  ): Promise<GeneratedImageResult[]> => {
    const results: GeneratedImageResult[] = [];

    for (const model of models) {
      try {
        const url = isSeedreamModel(model.id)
          ? await generateImageWithSeedream({
              prompt,
              inputImage,
              model: model.id,
            })
          : await generateImageWithGemini({
              prompt: model.systemPrompt
                ? `${model.systemPrompt}\n\n${prompt}`
                : prompt,
              inputImage,
              model: model.id,
            });

        results.push({
          id: randomId(),
          model: model.id,
          prompt,
          url,
        });
      } catch {
        // 单模型失败不阻断其他模型
      }
    }

    return results;
  };

  return {
    chatCompletions,
    chatCompletionsStream,
    generateImageWithGemini,
    editImageWithGemini,
    expandImageWithGeminiPro,
    generateImageWithSeedream,
    editImageWithSeedream,
    generateTextMultiModel,
    generateImageMultiModel,
    generateImagesFromWorkflow,
  };
};

export type ModelClients = ReturnType<typeof createModelClients>;
