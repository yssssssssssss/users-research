import {
  createModelClients,
  DEFAULT_TEXT_MODELS,
  type ChatMessage,
  type ModelClients,
  type ModelOption,
  type TextModelRoute,
} from '@users-research/model-clients';
import { appConfig } from '../config/env.js';

let clientsSingleton: ModelClients | null = null;

const getClients = (): ModelClients => {
  if (clientsSingleton) return clientsSingleton;

  clientsSingleton = createModelClients({
    textApiUrl: appConfig.models.textApiUrl,
    textApiKey: appConfig.models.textApiKey,
    anthropicApiUrl: appConfig.models.anthropicApiUrl,
    anthropicApiKey: appConfig.models.anthropicApiKey,
    geminiImageApiUrl: appConfig.models.geminiImageApiUrl,
    geminiApiKey: appConfig.models.geminiApiKey,
    jimengImageApiUrl: appConfig.models.jimengImageApiUrl,
    jimengApiKey: appConfig.models.jimengApiKey,
    textTimeoutMs: appConfig.models.requestTimeoutMs,
    streamTimeoutMs: appConfig.models.streamTimeoutMs,
    fetchImpl: fetch,
  });

  return clientsSingleton;
};

const getModelOption = (id: string, fallbackName: string): ModelOption =>
  DEFAULT_TEXT_MODELS.find((item) => item.id === id) || { id, name: fallbackName };

const createTextRoute = (
  id: string,
  fallbackName: string,
  fallbackIds: string[] = [],
): TextModelRoute => ({
  id,
  name: getModelOption(id, fallbackName).name,
  fallbacks: fallbackIds.map((fallbackId) => {
    const fallback = getModelOption(fallbackId, fallbackId);
    return { id: fallback.id, name: fallback.name };
  }),
});

const NODE_MODEL_ROUTES = {
  inputParser: [
    createTextRoute('GPT 5.4', 'GPT 5.4', ['GPT 5.2', 'GLM-5']),
    createTextRoute('GPT 5.2', 'GPT 5.2', ['GLM-5']),
    createTextRoute('GLM-5', 'GLM-5', ['Doubao-Seed-2.0-pro']),
    createTextRoute('Doubao-Seed-2.0-pro', '豆包 Seed 2.0 Pro', ['GLM-5']),
  ],
  problemDecomposer: [
    createTextRoute('GLM-5', 'GLM-5', ['Doubao-Seed-2.0-pro']),
    createTextRoute('Doubao-Seed-2.0-pro', '豆包 Seed 2.0 Pro', ['GLM-5']),
  ],
  experienceEvaluator: [
    createTextRoute('GPT 5.4', 'GPT 5.4', ['GPT 5.2', 'GLM-5']),
    createTextRoute('GPT 5.2', 'GPT 5.2', ['GLM-5']),
    createTextRoute('GLM-5', 'GLM-5', ['Doubao-Seed-2.0-pro']),
  ],
  patternAnalyzer: [
    createTextRoute('GLM-5', 'GLM-5', ['Doubao-Seed-2.0-pro', 'Kimi-K2.5']),
    createTextRoute('Doubao-Seed-2.0-pro', '璞嗗寘 Seed 2.0 Pro', ['GLM-5', 'Kimi-K2.5']),
  ],
  judgmentSynthesizer: [
    createTextRoute('GLM-5', 'GLM-5', ['Doubao-Seed-2.0-pro', 'Kimi-K2.5']),
  ],
  judgmentReview: [
    createTextRoute('GLM-5', 'GLM-5', ['Doubao-Seed-2.0-pro']),
    createTextRoute('Kimi-K2.5', 'Kimi K2.5', ['GLM-5']),
    createTextRoute('Doubao-Seed-2.0-pro', '豆包 Seed 2.0 Pro', ['GLM-5']),
  ],
  vision: [
    createTextRoute('GPT 5.2', 'GPT 5.2'),
  ],
  visionStructural: [
    createTextRoute('GPT 5.2', 'GPT 5.2'),
  ],
  visionEmotional: [
    createTextRoute('GPT 5.2', 'GPT 5.2'),
  ],
  visionBehavioral: [
    createTextRoute('GPT 5.2', 'GPT 5.2'),
  ],
  persona: [
    createTextRoute('Kimi-K2.5', 'Kimi K2.5', ['GLM-5', 'MiniMax-M2.5']),
    createTextRoute('MiniMax-M2.5', 'MiniMax M2.5', ['Kimi-K2.5', 'GLM-5']),
    createTextRoute('GLM-5', 'GLM-5', ['Doubao-Seed-2.0-pro', 'Kimi-K2.5']),
    createTextRoute('Doubao-Seed-2.0-pro', '豆包 Seed 2.0 Pro', ['GLM-5', 'Kimi-K2.5']),
  ],
} as const;

const hasDedicatedAnthropicConfig = () =>
  Boolean(appConfig.models.anthropicApiUrl && appConfig.models.anthropicApiKey);

const getVisionRoutes = (): TextModelRoute[] =>
  NODE_MODEL_ROUTES.vision.filter((route) => {
    if (route.id === 'Claude-Opus-4.6') {
      return hasDedicatedAnthropicConfig();
    }
    return true;
  }).map((route) => ({
    id: route.id,
    name: route.name,
    systemPrompt: route.systemPrompt,
    fallbacks: route.fallbacks?.map((item) => ({ id: item.id, name: item.name })),
  }));

const FALLBACK_ROUTE_MAP = Object.values(NODE_MODEL_ROUTES)
  .flat()
  .reduce<Record<string, TextModelRoute>>((acc, route) => {
    if (!acc[route.id]) {
      acc[route.id] = route;
    }
    return acc;
  }, {});

const runSingleTextModel = async (options: {
  model: string;
  systemPrompt: string;
  prompt: string;
}): Promise<string> => {
  const clients = getClients();
  return clients.chatCompletions({
    model: options.model,
    systemPrompt: options.systemPrompt,
    messages: [{ role: 'user', content: options.prompt }],
  });
};

const runTextModelWithFallback = async (options: {
  models: Array<Pick<TextModelRoute, 'id' | 'name' | 'fallbacks'>>;
  systemPrompt: string;
  prompt: string;
}): Promise<{
  text: string;
  requestedModel: string;
  actualModel: string;
  attemptedModels: string[];
}> => {
  const errors: string[] = [];

  for (const model of options.models) {
    const attemptChain = [
      { id: model.id, name: model.name },
      ...(model.fallbacks || []),
    ].filter(
      (candidate, index, list) =>
        candidate.id &&
        list.findIndex((item) => item.id === candidate.id) === index,
    );

    const attemptedModels: string[] = [];

    for (const candidate of attemptChain) {
      attemptedModels.push(candidate.id);
      try {
        const text = await runSingleTextModel({
          model: candidate.id,
          systemPrompt: options.systemPrompt,
          prompt: options.prompt,
        });
        return {
          text,
          requestedModel: model.id,
          actualModel: candidate.id,
          attemptedModels,
        };
      } catch (error) {
        errors.push(`${candidate.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  throw new Error(errors.join('；'));
};

const getRouteByModelId = (modelId: string): TextModelRoute =>
  FALLBACK_ROUTE_MAP[modelId] || { id: modelId, fallbacks: [] };

const toModelOptions = (routes: readonly TextModelRoute[]): ModelOption[] =>
  routes.map((route) => getModelOption(route.id, route.name || route.id));

const toTextRoutes = (routes: readonly TextModelRoute[]): TextModelRoute[] =>
  routes.map((route) => ({
    id: route.id,
    name: route.name,
    systemPrompt: route.systemPrompt,
    fallbacks: route.fallbacks?.map((item) => ({ id: item.id, name: item.name })),
  }));

export const modelGateway = {
  isTextModelEnabled: (): boolean =>
    !appConfig.models.disabled && Boolean(appConfig.models.textApiUrl && appConfig.models.textApiKey),

  getInputParserModels: (): ModelOption[] => toModelOptions(NODE_MODEL_ROUTES.inputParser),

  getProblemDecomposerModels: (): ModelOption[] =>
    toModelOptions(NODE_MODEL_ROUTES.problemDecomposer),

  getExperienceEvaluatorModels: (): ModelOption[] =>
    toModelOptions(NODE_MODEL_ROUTES.experienceEvaluator),

  getPatternAnalyzerModels: (): ModelOption[] => toModelOptions(NODE_MODEL_ROUTES.patternAnalyzer),

  getJudgmentPrimaryModels: (): ModelOption[] =>
    toModelOptions(NODE_MODEL_ROUTES.judgmentSynthesizer),

  getReviewTextModels: (): ModelOption[] => toModelOptions(NODE_MODEL_ROUTES.judgmentReview),

  getReviewTextRoutes: (): TextModelRoute[] => toTextRoutes(NODE_MODEL_ROUTES.judgmentReview),

  getVisionTextModels: (): ModelOption[] => toModelOptions(getVisionRoutes()),

  getVisionTextRoutes: (): TextModelRoute[] => getVisionRoutes(),

  getVisionRoleRoutes: (role: 'structural' | 'emotional' | 'behavioral'): TextModelRoute[] => {
    const routeMap = {
      structural: NODE_MODEL_ROUTES.visionStructural,
      emotional: NODE_MODEL_ROUTES.visionEmotional,
      behavioral: NODE_MODEL_ROUTES.visionBehavioral,
    } as const;
    const routes = routeMap[role] || NODE_MODEL_ROUTES.vision;
    return toTextRoutes(routes).filter((route) => {
      if (route.id === 'Claude-Opus-4.6') return hasDedicatedAnthropicConfig();
      return true;
    });
  },

  getPersonaTextModels: (): ModelOption[] => toModelOptions(NODE_MODEL_ROUTES.persona),

  getPersonaTextRoutes: (): TextModelRoute[] => toTextRoutes(NODE_MODEL_ROUTES.persona),

  async runTextModel(options: {
    model?: string;
    systemPrompt: string;
    prompt: string;
  }): Promise<string> {
    const model = options.model || this.getJudgmentPrimaryModels()[0].id;
    const result = await runTextModelWithFallback({
      models: [getRouteByModelId(model)],
      systemPrompt: options.systemPrompt,
      prompt: options.prompt,
    });
    return result.text;
  },

  async runInputParser(options: {
    systemPrompt: string;
    prompt: string;
  }): Promise<string> {
    const result = await runTextModelWithFallback({
      models: toTextRoutes(NODE_MODEL_ROUTES.inputParser),
      systemPrompt: options.systemPrompt,
      prompt: options.prompt,
    });
    return result.text;
  },

  async runProblemDecomposer(options: {
    systemPrompt: string;
    prompt: string;
  }): Promise<string> {
    const result = await runTextModelWithFallback({
      models: toTextRoutes(NODE_MODEL_ROUTES.problemDecomposer),
      systemPrompt: options.systemPrompt,
      prompt: options.prompt,
    });
    return result.text;
  },

  async runExperienceEvaluator(options: {
    systemPrompt: string;
    prompt: string;
  }): Promise<string> {
    const result = await runTextModelWithFallback({
      models: toTextRoutes(NODE_MODEL_ROUTES.experienceEvaluator),
      systemPrompt: options.systemPrompt,
      prompt: options.prompt,
    });
    return result.text;
  },

  async runPatternAnalyzer(options: {
    systemPrompt: string;
    prompt: string;
  }): Promise<string> {
    const result = await runTextModelWithFallback({
      models: toTextRoutes(NODE_MODEL_ROUTES.patternAnalyzer),
      systemPrompt: options.systemPrompt,
      prompt: options.prompt,
    });
    return result.text;
  },

  async runJudgmentModel(options: {
    systemPrompt: string;
    prompt: string;
  }): Promise<string> {
    const result = await runTextModelWithFallback({
      models: toTextRoutes(NODE_MODEL_ROUTES.judgmentSynthesizer),
      systemPrompt: options.systemPrompt,
      prompt: options.prompt,
    });
    return result.text;
  },

  async runTextMultiModel(options: {
    prompt: string;
    messages?: ChatMessage[];
    models?: TextModelRoute[];
    globalSystemPrompt: string;
  }) {
    const clients = getClients();
    return clients.generateTextMultiModel({
      prompt: options.prompt,
      messages: options.messages,
      models: options.models || toTextRoutes(NODE_MODEL_ROUTES.judgmentReview),
      globalSystemPrompt: options.globalSystemPrompt,
    });
  },
};
