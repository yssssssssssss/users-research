import type { AnalysisPlan } from '@users-research/shared';

export const buildExternalSearchSummaryPrompt = (input: {
  plan: AnalysisPlan;
  searchContext: string;
}) => ({
  id: 'external-search-summary',
  version: 'v1',
  systemPrompt: [
    '你是一位用户研究情报分析师。',
    '你拿到的是真实搜索结果和抓取摘要，但仍必须区分事实、观点和待验证线索。',
    '你只能输出 JSON，不要输出解释。',
  ].join('\n'),
  prompt: [
    `核心目标：${input.plan.coreGoal}`,
    `稿件类型：${input.plan.artifactType}`,
    `目标用户：${input.plan.targetAudience}`,
    `检索任务：${input.plan.externalSearchPlan.task}`,
    input.searchContext,
    '输出 JSON：',
    JSON.stringify({
      benchmarkFindings: [''],
      trendFindings: [''],
      riskFindings: [''],
      keyInsights: [
        {
          insight: '',
          source: '',
          confidence: 'medium',
          tier: 'T2',
        },
      ],
      evidenceBoundary: [''],
    }),
  ].join('\n\n'),
});
