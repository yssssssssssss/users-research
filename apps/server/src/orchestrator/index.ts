import type {
  CandidateOutput,
  EnabledModules,
  EvidenceConflict,
  EvidenceItem,
  PersonaFinding,
  ResearchTaskState,
  SubQuestion,
  VisionFinding,
} from '@users-research/shared';

const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export const buildMockSubQuestions = (query: string): SubQuestion[] => [
  {
    id: uid('sq'),
    seq: 1,
    text: `围绕“${query}”识别核心使用场景与决策路径。`,
    audience: '核心目标用户',
    scenario: '关键决策场景',
    journeyPath: '入口 -> 浏览 -> 决策',
    decisionPoint: '是否进入下一步操作',
    status: 'completed',
  },
  {
    id: uid('sq'),
    seq: 2,
    text: '评估当前方案是否会增加认知负担或路径摩擦。',
    audience: '新用户 / 低熟悉度用户',
    scenario: '首次接触或低频使用场景',
    journeyPath: '信息识别 -> 理解 -> 点击',
    decisionPoint: '是否继续停留或离开',
    status: 'completed',
  },
];

export const buildMockEvidence = (): EvidenceItem[] => [
  {
    id: uid('ev'),
    sourceType: 'internal_metric',
    sourceLevel: 'internal',
    tier: 'T1',
    confidenceScore: 0.92,
    sourceName: '业务指标快照',
    content: '当前关键入口 CTR 在最近 30 天呈下降趋势，说明首页注意力竞争加剧。',
    citationText: '关键入口 CTR 最近 30 天下降。',
    traceLocation: { report: 'dashboard-home', section: 'ctr' },
    isUsedInReport: true,
    reviewStatus: 'accepted',
  },
  {
    id: uid('ev'),
    sourceType: 'industry_report',
    sourceLevel: 'external',
    tier: 'T2',
    confidenceScore: 0.71,
    sourceName: '行业公开资料',
    content: '内容入口常用于辅助转化，但若位置前置过强会干扰交易链路。',
    isUsedInReport: true,
    reviewStatus: 'unreviewed',
  },
  {
    id: uid('ev'),
    sourceType: 'persona_generated',
    sourceLevel: 'simulated',
    tier: 'T2',
    confidenceScore: 0.4,
    sourceName: 'Persona Sandbox',
    content: '价格敏感型用户可能认为内容区会拖慢找到优惠信息的速度。',
    isUsedInReport: false,
    reviewStatus: 'unreviewed',
  },
];

export const buildMockConflicts = (evidence: EvidenceItem[]): EvidenceConflict[] =>
  evidence.length >= 2
    ? [
        {
          id: uid('cf'),
          topic: '内容入口的前置程度是否会干扰交易链路',
          evidenceAId: evidence[0].id,
          evidenceBId: evidence[1].id,
          conflictReason: '内部趋势与行业通用模式在入口优先级上存在张力。',
          status: 'open',
        },
      ]
    : [];

export const buildMockVisionFindings = (): VisionFinding[] => [
  {
    id: uid('vf'),
    findingType: 'cta_visibility',
    riskLevel: 'high',
    content: '核心 CTA 在视觉层级中不突出，可能影响主链路转化。',
    regionRef: { x: 320, y: 180, w: 220, h: 80 },
    isConsensus: true,
  },
  {
    id: uid('vf'),
    findingType: 'cognitive_load',
    riskLevel: 'medium',
    content: '信息模块数量偏多，视觉焦点存在分散风险。',
    isConflict: true,
  },
];

export const buildMockPersonaFindings = (): PersonaFinding[] => [
  {
    id: uid('pf'),
    personaName: '价格敏感型用户',
    stance: 'hesitate',
    theme: '效率担忧',
    content: '我担心内容入口会拖慢找到优惠信息的速度。',
    isSimulated: true,
  },
  {
    id: uid('pf'),
    personaName: '高内容消费型用户',
    stance: 'support',
    theme: '决策辅助',
    content: '如果内容推荐足够精准，我愿意通过它快速理解商品价值。',
    isSimulated: true,
  },
];

export const buildMockCandidateOutputs = (
  enabledModules: EnabledModules,
): CandidateOutput[] => {
  const outputs: CandidateOutput[] = [
    {
      id: uid('out'),
      outputType: 'judgment_card',
      sourceNode: 'judgment_synthesizer',
      gateLevel: 'allowed',
      summary: '输出方向性判断、风险与待验证假设。',
      contentJson: { kind: 'judgment_card' },
      status: 'selected',
    },
    {
      id: uid('out'),
      outputType: 'light_report',
      sourceNode: 'judgment_synthesizer',
      gateLevel: 'review_required',
      summary: '输出轻量分析报告。',
      contentJson: { kind: 'light_report' },
      status: 'generated',
    },
    {
      id: uid('out'),
      outputType: 'evidence_report',
      sourceNode: 'judgment_synthesizer',
      gateLevel: 'review_required',
      summary: '输出证据型报告，要求 RQ3 且具备充分 T1 证据。',
      contentJson: { kind: 'evidence_report' },
      status: 'generated',
    },
  ];

  if (enabledModules.visionMoE) {
    outputs.push({
      id: uid('out'),
      outputType: 'design_review_report',
      sourceNode: 'vision_moe',
      gateLevel: 'review_required',
      summary: '输出设计预评估报告。',
      contentJson: { kind: 'design_review_report' },
      status: 'generated',
    });
  }

  if (enabledModules.personaSandbox) {
    outputs.push({
      id: uid('out'),
      outputType: 'hypothesis_pack',
      sourceNode: 'persona_sandbox',
      gateLevel: 'allowed',
      summary: '输出待验证假设包。',
      contentJson: { kind: 'hypothesis_pack' },
      status: 'generated',
    });
  }

  return outputs;
};

export const enrichTaskForRunMock = (task: ResearchTaskState): ResearchTaskState => {
  const subQuestions = buildMockSubQuestions(task.originalQuery);
  const evidencePool = buildMockEvidence();
  const evidenceConflicts = buildMockConflicts(evidencePool);
  const visionFindings = task.enabledModules.visionMoE ? buildMockVisionFindings() : [];
  const personaFindings = task.enabledModules.personaSandbox ? buildMockPersonaFindings() : [];
  const candidateOutputs = buildMockCandidateOutputs(task.enabledModules);

  return {
    ...task,
    status: 'awaiting_review',
    reviewStatus: 'pending',
    currentNode: 'output_router',
    rqLevel: 'RQ2',
    subQuestions,
    evidencePool,
    evidenceConflicts,
    visionFindings,
    personaFindings,
    candidateOutputs,
    runStats: {
      startedAt: task.runStats.startedAt,
      finishedAt: new Date().toISOString(),
      costEstimate: 5.83,
      latencyMs: 4200,
      warnings: task.enabledModules.personaSandbox
        ? ['Persona Sandbox 输出为模拟结果，不代表真实用户证据。']
        : [],
    },
  };
};
