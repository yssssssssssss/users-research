import type { AnalysisPlan, InputType, TaskMode } from '@users-research/shared';

interface InputParserPromptInput {
  userInput: string;
  inputType: InputType;
  taskMode: TaskMode;
  fileInfo: string[];
}

export const buildInputParserPrompt = (input: InputParserPromptInput) => ({
  id: 'input-parser',
  version: 'v1',
  systemPrompt: [
    '你是一位资深用户研究负责人，负责把用户请求拆解为完整的分析计划。',
    '你只能输出 JSON，不要输出解释。',
    '必须输出 coreGoal、artifactType、evaluationFocus、targetAudience、businessContext。',
    '必须输出四个模块的子任务：experienceModelPlan、externalSearchPlan、visualReviewPlan、personaSimulationPlan。',
    '同时输出 2 到 4 个 subQuestions，作为四模块共享的研究问题。',
  ].join('\n'),
  prompt: [
    `用户输入：${input.userInput}`,
    `输入类型：${input.inputType}`,
    `任务模式：${input.taskMode}`,
    `附件信息：${input.fileInfo.length ? input.fileInfo.join('；') : '无'}`,
    '输出 JSON，格式必须包含：',
    JSON.stringify({
      coreGoal: '',
      artifactType: 'ui_design',
      evaluationFocus: [''],
      targetAudience: '',
      businessContext: '',
      experienceModelPlan: {
        task: '',
        focusDimensions: [''],
        preferredModelIds: ['heart_gsm'],
        evaluationQuestions: [''],
      },
      externalSearchPlan: {
        task: '',
        searchQueries: [''],
        searchIntent: '',
        expectedInsights: [''],
      },
      visualReviewPlan: {
        task: '',
        reviewDimensions: [''],
        businessGoal: '',
        keyConcerns: [''],
      },
      personaSimulationPlan: {
        task: '',
        personaTypes: [''],
        simulationScenarios: [''],
        ratingDimensions: ['易用性', '吸引力', '信任感', '转化意愿', '情感共鸣'],
      },
      subQuestions: [
        {
          text: '',
          audience: '',
          scenario: '',
          journeyPath: '',
          decisionPoint: '',
        },
      ],
    } satisfies Record<string, unknown>),
  ].join('\n\n'),
});

export const normalizeArtifactType = (value: string | undefined): AnalysisPlan['artifactType'] => {
  switch ((value || '').toLowerCase()) {
    case 'copy':
    case '文案稿':
      return 'copy';
    case 'product_plan':
    case '产品方案':
      return 'product_plan';
    case 'marketing_asset':
    case '营销物料':
      return 'marketing_asset';
    case 'prototype':
    case '交互原型':
      return 'prototype';
    default:
      return 'ui_design';
  }
};
