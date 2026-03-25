import type { AnalysisPlan } from '@users-research/shared';

interface ExperienceModelPromptInput {
  plan: AnalysisPlan;
  artifactSummary: string;
  modelName: string;
  modelDocumentSummary: string;
  dimensions: string[];
}

export const buildExperienceModelPrompt = (input: ExperienceModelPromptInput) => ({
  id: 'experience-model-evaluator',
  version: 'v1',
  systemPrompt: [
    '你是一位专精于用户体验研究的分析师。',
    '你必须严格基于给定框架、用户目标和稿件摘要进行评估。',
    '你只能输出 JSON，不要输出解释。',
    '所有评分必须给出依据；如果依据不足，要明确写出不确定性。',
  ].join('\n'),
  prompt: [
    `核心目标：${input.plan.coreGoal}`,
    `目标用户：${input.plan.targetAudience}`,
    `业务背景：${input.plan.businessContext}`,
    `体验模型任务：${input.plan.experienceModelPlan.task}`,
    `稿件摘要：${input.artifactSummary}`,
    `${input.modelName} 框架摘要：${input.modelDocumentSummary}`,
    `重点维度：${input.dimensions.join('、')}`,
    '输出 JSON：',
    JSON.stringify({
      modelId: '',
      modelName: '',
      suitability: '',
      limitations: [''],
      dimensions: [
        {
          name: '',
          score: 7,
          observation: '',
          rationale: '',
          suggestion: '',
        },
      ],
      overallScore: 7,
      strengths: [''],
      risks: [''],
      topPriorityFix: '',
      followupQuestions: [''],
      evidenceBoundary: 'T3_framework_inference',
    }),
  ].join('\n\n'),
});
