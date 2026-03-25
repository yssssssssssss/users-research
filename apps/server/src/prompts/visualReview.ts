import type { AnalysisPlan, VisualReviewerRole } from '@users-research/shared';
import { VISUAL_REVIEWERS } from './roles/visualReviewers.js';

export const buildVisualReviewPrompt = (input: {
  plan: AnalysisPlan;
  artifactSummary: string;
  role: VisualReviewerRole;
}) => {
  const reviewer = VISUAL_REVIEWERS.find((item) => item.role === input.role) || VISUAL_REVIEWERS[0];
  return {
    id: `visual-review-${reviewer.role}`,
    version: 'v1',
    systemPrompt: [
      reviewer.systemPrompt,
      `当前评审角色：${reviewer.label}。`,
      reviewer.description,
      '你只能输出 JSON，不要输出解释。',
      '所有观察必须基于图像或稿件摘要中的具体元素；如果依据不足，必须保守表达。',
    ].join('\n'),
    prompt: [
      `核心目标：${input.plan.coreGoal}`,
      `业务目标：${input.plan.visualReviewPlan.businessGoal}`,
      `目标用户：${input.plan.targetAudience}`,
      `角色任务：${input.plan.visualReviewPlan.task}`,
      `稿件摘要：${input.artifactSummary}`,
      `评审维度：${reviewer.dimensions.join('、')}`,
      `重点关注：${input.plan.visualReviewPlan.keyConcerns.join('、')}`,
      '输出 JSON：',
      JSON.stringify({
        role: reviewer.role,
        roleLabel: reviewer.label,
        dimensions: [
          {
            name: '',
            score: 7,
            evidence: '',
            suggestion: '',
          },
        ],
        issues: [
          {
            severity: 'medium',
            issue: '',
            suggestion: '',
          },
        ],
        overallScore: 7,
        topSuggestion: '',
      }),
    ].join('\n\n'),
  };
};
