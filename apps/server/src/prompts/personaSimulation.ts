import type { AnalysisPlan, PersonaProfileTemplate } from '@users-research/shared';

export const buildPersonaGenerationPrompt = (input: {
  plan: AnalysisPlan;
  persona: PersonaProfileTemplate;
}) => ({
  id: 'persona-generation',
  version: 'v1',
  systemPrompt: [
    '你需要基于人群画像生成一个真实感强的数字用户角色。',
    '只能输出 JSON，不要输出解释。',
  ].join('\n'),
  prompt: [
    `核心目标：${input.plan.coreGoal}`,
    `目标用户：${input.plan.targetAudience}`,
    `模拟任务：${input.plan.personaSimulationPlan.task}`,
    `画像类型：${input.persona.type}`,
    `画像摘要：${input.persona.summary}`,
    `行为特征：${input.persona.behaviorTraits.join('、')}`,
    `顾虑：${input.persona.concerns.join('、')}`,
    `动机：${input.persona.motivations.join('、')}`,
    '输出 JSON：',
    JSON.stringify({
      profileId: input.persona.id,
      personaName: '',
      age: '',
      occupation: '',
      city: '',
      description: '',
      usageScenario: '',
      concerns: [''],
      motivations: [''],
    }),
  ].join('\n\n'),
});

export const buildPersonaReviewPrompt = (input: {
  plan: AnalysisPlan;
  artifactSummary: string;
  personaName: string;
  personaDescription: string;
  visualGrounding?: string;
}) => ({
  id: 'persona-review',
  version: 'v1',
  systemPrompt: [
    `你现在是 ${input.personaName}。`,
    '你的反馈必须使用第一人称，但只能基于用户上传图片中可见的内容和提供的结构化观察来表达。',
    '如果图片里看不到、结构化观察里没有、稿件摘要里没提到，就不要编造。',
    '严禁编造价格、品牌、平台、优惠机制、业务背景、具体数值、页面模块或按钮状态。',
    '如果证据不足，明确说明“仅从当前图片无法确认”。',
    '你只能输出 JSON，不要输出解释。',
    '所有内容必须视为“模拟生成，非真实用户反馈”。',
  ].join('\n'),
  prompt: [
    `核心目标：${input.plan.coreGoal}`,
    `场景：${input.plan.personaSimulationPlan.simulationScenarios.join('、')}`,
    `人物描述：${input.personaDescription}`,
    `稿件摘要：${input.artifactSummary}`,
    input.visualGrounding ? `结构化视觉观察：\n${input.visualGrounding}` : '结构化视觉观察：无',
    '输出 JSON：',
    JSON.stringify({
      firstImpression: '',
      detailedExperience: '',
      scores: {
        usability: 7,
        attractiveness: 7,
        trust: 7,
        conversionIntent: 7,
        emotionalResonance: 7,
      },
      overallScore: 7,
      quoteToFriend: '',
      topChangeRequest: '',
      theme: '',
      stance: 'mixed',
    }),
  ].join('\n\n'),
});
