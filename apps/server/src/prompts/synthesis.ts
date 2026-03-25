import type { AnalysisPlan } from '@users-research/shared';

export const buildSynthesisPrompt = (input: {
  plan: AnalysisPlan;
  moduleContext: string;
}) => ({
  id: 'synthesis',
  version: 'v1',
  systemPrompt: [
    '你是一位资深用研负责人，需要对四个模块结果进行综合判断。',
    '必须区分真实证据、专家推演、模拟反馈和待核查线索。',
    '你只能输出 JSON，不要输出解释。',
  ].join('\n'),
  prompt: [
    `核心目标：${input.plan.coreGoal}`,
    `稿件类型：${input.plan.artifactType}`,
    `目标用户：${input.plan.targetAudience}`,
    input.moduleContext,
    '输出 JSON：',
    JSON.stringify({
      consensus: [''],
      conflicts: [''],
      conclusions: [
        {
          title: '',
          content: '',
          supportingSources: [''],
          confidence: 'medium',
          action: '',
        },
      ],
      topRecommendations: [''],
      hypothesesToValidate: [''],
      nextResearchActions: [''],
      evidenceBoundary: [''],
    }),
  ].join('\n\n'),
});
