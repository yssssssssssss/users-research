import { randomUUID } from 'node:crypto';
﻿import type {
  AnalysisPlan,
  CandidateOutput,
  EvidenceItem,
  ExternalSearchResult,
  PersonaFinding,
  PersonaReviewResult,
  PersonaSimulationResult,
  ResearchTaskState,
  RqLevel,
  SubQuestion,
  SynthesisResult,
  VisualReviewResult,
  VisionFinding,
} from '@users-research/shared';
import type { ChatMessage } from '@users-research/model-clients';
import { modelGateway } from '../services/modelGateway.js';
import { appConfig } from '../config/env.js';
import {
  analyzeExperienceModels,
  getExperienceModelReportLines,
} from '../services/experienceModelService.js';
import { fetchSearchArticle, webSearch } from '../services/searchClient.js';
import {
  PERSONA_LIBRARY,
  VISUAL_REVIEWERS,
  buildExternalSearchSummaryPrompt,
  buildInputParserPrompt,
  buildPersonaGenerationPrompt,
  buildPersonaReviewPrompt,
  buildSynthesisPrompt,
  buildVisualReviewPrompt,
  normalizeArtifactType,
} from '../prompts/index.js';
import {
  buildMockCandidateOutputs,
  buildMockEvidence,
  buildMockVisionFindings,
} from './index.js';

const uid = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '')}`;

const computeLatencyMs = (startedAt?: string, finishedAt?: string): number | undefined => {
  if (!startedAt || !finishedAt) return undefined;

  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return undefined;
  }

  return end - start;
};

const extractJsonBlock = (raw: string): string => {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) return objectMatch[0];
  return raw.trim();
};

const safeParseJson = <T>(raw: string): T | null => {
  try {
    return JSON.parse(extractJsonBlock(raw)) as T;
  } catch {
    return null;
  }
};

const clipText = (value: string | undefined, maxLength: number): string => {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};

const compactBulletLines = (
  items: Array<string | undefined>,
  options: {
    maxItems: number;
    maxItemLength: number;
    emptyText?: string;
  },
): string => {
  const lines = items
    .map((item) => clipText(item, options.maxItemLength))
    .filter(Boolean)
    .slice(0, options.maxItems);

  if (!lines.length) {
    return options.emptyText || '- 无';
  }

  return lines.map((item) => `- ${item}`).join('\n');
};

const buildWeakVisionFallback = (state: ResearchTaskState): VisionFinding[] => {
  const querySummary = clipText(state.originalQuery, 72) || '当前方案';
  const firstSubQuestion = clipText(state.subQuestions[0]?.text, 48);

  return [
    {
      id: uid('vf'),
      findingType: 'visual_hierarchy',
      riskLevel: 'medium',
      content: `弱视觉推断：若“${querySummary}”需要同时承载导购与转化目标，首屏信息层级容易分散。`,
      regionRef: {
        inferenceMode: 'text_only',
        basedOn: firstSubQuestion || querySummary,
      },
      isConflict: true,
    },
    {
      id: uid('vf'),
      findingType: 'cognitive_load',
      riskLevel: 'medium',
      content:
        '弱视觉推断：在缺少真实界面截图时，应优先控制首屏模块数量与文案密度，避免用户先理解内容、后理解行动路径。',
      regionRef: {
        inferenceMode: 'text_only',
      },
      isConflict: true,
    },
    {
      id: uid('vf'),
      findingType: 'cta_visibility',
      riskLevel: 'low',
      content:
        '弱视觉推断：建议保证主 CTA 在内容模块附近仍具备清晰对比和稳定位置，否则内容消费可能稀释主操作意图。',
      regionRef: {
        inferenceMode: 'text_only',
      },
      isConflict: true,
    },
  ];
};

const riskScore: Record<'low' | 'medium' | 'high', number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const NODE_TIMEOUT_MS = 60000;
const PROBLEM_DECOMPOSER_TIMEOUT_MS = 180000;
const JUDGMENT_SYNTHESIZER_TIMEOUT_MS = 180000;
const JUDGMENT_REVIEW_TIMEOUT_MS = 120000;
const VISION_NODE_TIMEOUT_MS = appConfig.models.visionTimeoutMs;

const withNodeTimeout = async <T>(
  label: string,
  operation: Promise<T>,
  timeoutMs = NODE_TIMEOUT_MS,
): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} 超时（>${timeoutMs}ms）`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

interface InputParserPayload {
  coreGoal?: string;
  artifactType?: string;
  evaluationFocus?: string[];
  targetAudience?: string;
  businessContext?: string;
  experienceModelPlan?: {
    task?: string;
    focusDimensions?: string[];
    preferredModelIds?: string[];
    evaluationQuestions?: string[];
  };
  externalSearchPlan?: {
    task?: string;
    searchQueries?: string[];
    searchIntent?: string;
    expectedInsights?: string[];
  };
  visualReviewPlan?: {
    task?: string;
    reviewDimensions?: string[];
    businessGoal?: string;
    keyConcerns?: string[];
  };
  personaSimulationPlan?: {
    task?: string;
    personaTypes?: string[];
    simulationScenarios?: string[];
    ratingDimensions?: string[];
  };
  subQuestions?: Array<{
    text: string;
    audience?: string;
    scenario?: string;
    journeyPath?: string;
    decisionPoint?: string;
  }>;
}

interface JudgmentPayload {
  rqLevel: RqLevel;
  judgments: Array<{
    title: string;
    content: string;
    confidence: 'high' | 'medium' | 'low';
    risk: string;
  }>;
  nextActions: string[];
}

interface JudgmentBoundaryContext {
  acceptedRealEvidenceCount: number;
  fetchedExternalEvidenceCount: number;
  searchLeadEvidenceCount: number;
  frameworkEvidenceCount: number;
  personaSignalCount: number;
  visionSignalCount: number;
  hasWeakEvidenceOnly: boolean;
}

interface JudgmentReviewPayload {
  verdict?: 'pass' | 'caution' | 'fail';
  supportedPoints?: string[];
  challengePoints?: string[];
  boundaryRisks?: string[];
  recommendedFixes?: string[];
}

interface VisionReviewPayload {
  findings: Array<{
    findingType: VisionFinding['findingType'];
    riskLevel: VisionFinding['riskLevel'];
    content: string;
  }>;
}

interface VisualRoleReviewPayload {
  role?: 'structural' | 'emotional' | 'behavioral';
  roleLabel?: string;
  dimensions?: Array<{
    name?: string;
    score?: number;
    evidence?: string;
    suggestion?: string;
  }>;
  issues?: Array<{
    severity?: 'low' | 'medium' | 'high';
    issue?: string;
    suggestion?: string;
  }>;
  overallScore?: number;
  topSuggestion?: string;
}

interface PersonaGeneratedPayload {
  profileId?: string;
  personaName?: string;
  age?: string;
  occupation?: string;
  city?: string;
  description?: string;
  usageScenario?: string;
  concerns?: string[];
  motivations?: string[];
}

interface PersonaReviewPayload {
  personaName: string;
  stance: NonNullable<PersonaFinding['stance']>;
  theme: string;
  content: string;
}

interface ExternalSearchPayload {
  items: Array<{
    sourceType: 'web_article' | 'industry_report' | 'historical_case';
    sourceName: string;
    searchQuery: string;
    tentativeClaim: string;
    citationText?: string;
  }>;
}

interface ExternalSearchSelectionPayload {
  items: Array<{
    url: string;
    title: string;
    snippet: string;
    sourceType?: 'web_article' | 'industry_report' | 'historical_case';
    publishedDate?: string;
    relevanceScore?: number;
    reason?: string;
    searchQuery?: string;
    engine?: 'tavily' | 'google_pse' | 'exa';
  }>;
}


const inferArtifactType = (state: ResearchTaskState): AnalysisPlan['artifactType'] => {
  if (state.taskMode === 'design_review' || state.inputType !== 'text' || state.uploadedDesigns.length > 0) {
    return 'ui_design';
  }
  if (/文案|文稿|slogan|标题|卖点/.test(state.originalQuery)) return 'copy';
  if (/方案|策略|roadmap|规划/.test(state.originalQuery)) return 'product_plan';
  return 'prototype';
};

const buildFallbackAnalysisPlan = (state: ResearchTaskState): AnalysisPlan => ({
  coreGoal: clipText(state.originalQuery, 120) || '完成当前稿件分析',
  artifactType: inferArtifactType(state),
  evaluationFocus:
    state.taskMode === 'design_review'
      ? ['可用性', '视觉层次', '转化效率']
      : state.taskMode === 'hypothesis_test'
        ? ['假设验证', '决策动机', '转化意愿']
        : ['体验质量', '信息有效性', '决策支持'],
  targetAudience: '核心目标用户',
  businessContext: `任务模式=${state.taskMode}`,
  experienceModelPlan: {
    task: '使用体验模型库中的框架对当前稿件做结构化评估。',
    focusDimensions: ['可用性', '认知负担', '决策支持'],
    preferredModelIds: state.taskMode === 'design_review' ? ['cognitive_load', 'attrakdiff', 'heart_gsm'] : ['heart_gsm', 'jtbd'],
    evaluationQuestions: [
      '当前稿件最核心的体验优劣势是什么？',
      '哪些维度最可能影响用户的后续决策？',
    ],
  },
  externalSearchPlan: {
    task: '检索与当前稿件目标相关的行业参照、竞品实践和失败案例。',
    searchQueries: [
      clipText(state.originalQuery, 48),
      `${clipText(state.originalQuery, 28)} 行业案例`,
      `${clipText(state.originalQuery, 28)} 用户研究`,
    ].filter(Boolean) as string[],
    searchIntent: '竞品案例 / 行业数据 / 最佳实践',
    expectedInsights: ['行业参照', '常见风险', '有效模式'],
  },
  visualReviewPlan: {
    task: '从结构、情感和行为三个视角对当前稿件做视觉评审。',
    reviewDimensions: ['视觉层次', '吸引力', 'CTA 可见性'],
    businessGoal: state.taskMode === 'design_review' ? '提升设计有效性与可用性' : '支撑用户决策与转化',
    keyConcerns: ['认知负担', '信息优先级', '行动路径是否清晰'],
  },
  personaSimulationPlan: {
    task: '模拟不同类型目标用户对当前稿件的第一印象、评分与评论。',
    personaTypes: ['价格敏感型用户', '高内容消费型用户', '低熟悉度新用户'],
    simulationScenarios: ['首次浏览', '带着明确任务进入', '犹豫是否继续下一步'],
    ratingDimensions: ['易用性', '吸引力', '信任感', '转化意愿', '情感共鸣'],
  },
  subQuestions: [
    {
      text: `围绕“${clipText(state.originalQuery, 48)}”识别核心使用场景与决策路径。`,
      audience: '核心目标用户',
      scenario: '关键决策场景',
      journeyPath: '入口 -> 浏览 -> 决策',
      decisionPoint: '是否进入下一步操作',
    },
    {
      text: '评估当前方案是否会增加认知负担或路径摩擦。',
      audience: '新用户 / 低熟悉度用户',
      scenario: '首次接触或低频使用场景',
      journeyPath: '信息识别 -> 理解 -> 点击',
      decisionPoint: '是否继续停留或离开',
    },
  ],
});

const toSubQuestions = (plan: AnalysisPlan): SubQuestion[] =>
  plan.subQuestions.slice(0, 4).map((item, index) => ({
    id: uid('sq'),
    seq: index + 1,
    text: item.text,
    audience: item.audience,
    scenario: item.scenario,
    journeyPath: item.journeyPath,
    decisionPoint: item.decisionPoint,
    status: 'completed',
  }));

const buildArtifactSummary = (state: ResearchTaskState): string => {
  const fileRefs = [...state.uploadedDesigns, ...state.uploadedFiles]
    .map((item) => item.fileName)
    .filter(Boolean)
    .slice(0, 4);
  return [
    state.title ? `标题：${state.title}` : undefined,
    `原始问题：${clipText(state.originalQuery, 200)}`,
    `输入类型：${state.inputType}`,
    fileRefs.length ? `附件：${fileRefs.join('、')}` : undefined,
  ]
    .filter(Boolean)
    .join('；');
};

const getImageAssetUrls = (state: ResearchTaskState): string[] =>
  [...state.uploadedDesigns, ...state.uploadedFiles]
    .filter((item) => item.fileType === 'design' || item.fileType === 'image')
    .map((item) => item.dataUrl || item.sourceUrl || item.ossKey)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, 3);

const buildPersonaVisualGrounding = (state: ResearchTaskState): string =>
  compactBulletLines(
    (state.moduleResults?.visualReview?.reviewers || []).flatMap((reviewer) => [
      ...reviewer.dimensions.map(
        (item) => `${reviewer.roleLabel}/${item.name}：${item.evidence}${item.suggestion ? `；建议：${item.suggestion}` : ''}`,
      ),
      ...reviewer.issues.map(
        (item) => `${reviewer.roleLabel}/问题(${item.severity})：${item.issue}${item.suggestion ? `；建议：${item.suggestion}` : ''}`,
      ),
      reviewer.topSuggestion ? `${reviewer.roleLabel}/优先建议：${reviewer.topSuggestion}` : undefined,
    ]),
    { maxItems: 10, maxItemLength: 140, emptyText: '- 无可用视觉观察' },
  );

const averageScore = (values: Array<number | undefined>): number | undefined => {
  const valid = values.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  if (!valid.length) return undefined;
  return Number((valid.reduce((sum, item) => sum + item, 0) / valid.length).toFixed(1));
};

const extractLeadingLines = (value: string | undefined, maxItems = 3, maxLength = 120): string[] =>
  (value || '')
    .split(/\r?\n|；|;/)
    .map((item) => clipText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
const buildFallbackSubQuestions = (query: string): SubQuestion[] => [
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

const buildFallbackExternalEvidence = (state: ResearchTaskState): EvidenceItem[] => [
  {
    id: uid('ev'),
    sourceType: 'industry_report',
    sourceLevel: 'external',
    tier: 'T3',
    confidenceScore: 0.38,
    sourceName: '外部检索候选：行业趋势资料',
    content: `待核查外部线索：围绕“${state.originalQuery}”补充行业公开案例，重点验证内容入口是否提升决策效率。`,
    citationText: '待人工检索并核实原始出处。',
    isUsedInReport: false,
    reviewStatus: 'downgraded',
    traceLocation: {
      searchQuery: state.originalQuery,
      generatedBy: 'external_search',
      authenticity: 'search_result',
      fetchStatus: 'fallback_only',
    },
  },
];

const buildSeedEvidencePool = (): EvidenceItem[] => {
  if (!appConfig.research.useMockEvidence) {
    return [];
  }

  return buildMockEvidence().map((item) => ({
    ...item,
    traceLocation: {
      ...(item.traceLocation || {}),
      generatedBy: 'mock_seed_evidence',
      fallbackMode: 'demo_only',
    },
  }));
};

const pickHigherRisk = (
  left: VisionFinding['riskLevel'],
  right: VisionFinding['riskLevel'],
): VisionFinding['riskLevel'] => (riskScore[left] >= riskScore[right] ? left : right);

const normalizeFindingKey = (findingType: VisionFinding['findingType']) => findingType;

const uniqueStrings = (items: Array<string | undefined>): string[] =>
  Array.from(new Set(items.filter((item): item is string => Boolean(item && item.trim()))));

const getEvidenceAuthenticity = (item: EvidenceItem): string | undefined => {
  const trace = item.traceLocation;
  if (!trace || typeof trace !== 'object' || Array.isArray(trace)) return undefined;
  return typeof trace.authenticity === 'string' ? trace.authenticity : undefined;
};

const isAcceptedRealEvidence = (item: EvidenceItem): boolean =>
  item.reviewStatus === 'accepted'
  && item.sourceLevel !== 'simulated'
  && item.sourceLevel !== 'framework'
  && item.sourceType !== 'experience_model';

const buildJudgmentBoundaryContext = (state: ResearchTaskState): JudgmentBoundaryContext => {
  const acceptedRealEvidenceCount = state.evidencePool.filter(isAcceptedRealEvidence).length;
  const fetchedExternalEvidenceCount = state.evidencePool.filter((item) => {
    const authenticity = getEvidenceAuthenticity(item);
    return authenticity === 'fetched_article' || authenticity === 'fetched_document';
  }).length;
  const searchLeadEvidenceCount = state.evidencePool.filter(
    (item) => getEvidenceAuthenticity(item) === 'search_result',
  ).length;
  const frameworkEvidenceCount = state.evidencePool.filter(
    (item) => item.sourceType === 'experience_model',
  ).length;

  return {
    acceptedRealEvidenceCount,
    fetchedExternalEvidenceCount,
    searchLeadEvidenceCount,
    frameworkEvidenceCount,
    personaSignalCount: state.personaFindings.length,
    visionSignalCount: state.visionFindings.length,
    hasWeakEvidenceOnly:
      acceptedRealEvidenceCount === 0
      && (
        fetchedExternalEvidenceCount > 0
        || searchLeadEvidenceCount > 0
        || frameworkEvidenceCount > 0
        || state.personaFindings.length > 0
        || state.visionFindings.length > 0
      ),
  };
};

const buildBoundarySummary = (context: JudgmentBoundaryContext): string =>
  [
    `已接受真实证据=${context.acceptedRealEvidenceCount}`,
    `已抓原文外部证据=${context.fetchedExternalEvidenceCount}`,
    `待核查搜索线索=${context.searchLeadEvidenceCount}`,
    `体验模型证据=${context.frameworkEvidenceCount}`,
    `Vision辅助信号=${context.visionSignalCount}`,
    `Persona模拟信号=${context.personaSignalCount}`,
    context.hasWeakEvidenceOnly
      ? '当前缺少已接受真实证据，结论必须使用“风险/假设/待核查”口径'
      : '允许输出初步判断，但不得把辅助信号写成既成事实',
  ].join('；');

const downgradeClaimLanguage = (value: string): string =>
  value
    .replace(/极可能/g, '存在较高风险')
    .replace(/很可能/g, '可能')
    .replace(/必然/g, '可能')
    .replace(/一定/g, '可能')
    .replace(/已存在/g, '可能存在')
    .replace(/存在结构性短板/g, '存在待核查的结构性风险')
    .replace(/结构性短板/g, '结构性风险')
    .replace(/核心CTA缺失/g, '核心 CTA 视觉层级不突出或待核查')
    .replace(/用户不知所措/g, '用户可能出现路径理解困难');

const withBoundaryPrefix = (content: string, context: JudgmentBoundaryContext): string => {
  const normalized = content.trim();
  if (!normalized) return normalized;
  if (/^基于当前|^现阶段|^初步判断/.test(normalized)) {
    return normalized;
  }

  if (context.hasWeakEvidenceOnly) {
    return `基于当前架构图、外部资料与辅助分析信号，现阶段只能初步判断：${normalized}`;
  }

  if (
    context.searchLeadEvidenceCount > 0
    || context.personaSignalCount > 0
    || context.visionSignalCount > 0
    || context.frameworkEvidenceCount > 0
  ) {
    return `基于当前证据，初步判断：${normalized}`;
  }

  return normalized;
};

const enforceJudgmentEvidenceBoundaries = (
  state: ResearchTaskState,
  payload: JudgmentPayload,
): { payload: JudgmentPayload; warnings: string[] } => {
  const context = buildJudgmentBoundaryContext(state);
  const warnings: string[] = [];
  let mutated = false;

  const judgments = payload.judgments.map((item) => {
    const nextContent = withBoundaryPrefix(
      downgradeClaimLanguage(item.content),
      context,
    );
    const nextRisk = context.hasWeakEvidenceOnly
      ? uniqueStrings([
          downgradeClaimLanguage(item.risk),
          '当前缺少已接受真实证据，需结合真实日志、样本或人工核验确认。',
        ]).join('；')
      : (
          context.searchLeadEvidenceCount > 0
          || context.personaSignalCount > 0
          || context.visionSignalCount > 0
          || context.frameworkEvidenceCount > 0
        )
        ? uniqueStrings([
            downgradeClaimLanguage(item.risk),
            '辅助分析信号不能直接当作既成事实。',
          ]).join('；')
        : downgradeClaimLanguage(item.risk);

    const nextConfidence: JudgmentPayload['judgments'][number]['confidence'] = context.hasWeakEvidenceOnly
      ? 'low'
      : item.confidence === 'high'
        && (
          context.searchLeadEvidenceCount > 0
          || context.personaSignalCount > 0
          || context.visionSignalCount > 0
          || context.frameworkEvidenceCount > 0
        )
        ? 'medium'
        : item.confidence;

    if (
      nextContent !== item.content
      || nextRisk !== item.risk
      || nextConfidence !== item.confidence
    ) {
      mutated = true;
    }

    return {
      ...item,
      content: nextContent,
      risk: nextRisk,
      confidence: nextConfidence,
    };
  });

  const nextActions = uniqueStrings([
    ...payload.nextActions,
    context.hasWeakEvidenceOnly ? '补充真实运行日志、样本任务或人工核验记录。' : undefined,
    context.searchLeadEvidenceCount > 0 ? '将待核查搜索线索抓取原文后，再决定是否升级为正式证据。' : undefined,
    context.personaSignalCount > 0 ? '将 Persona 模拟反馈与真实证据分栏展示，避免混用。' : undefined,
  ]);

  if (mutated) {
    warnings.push(`已对综合判断应用真实性降级：${buildBoundarySummary(context)}`);
  }

  return {
    payload: {
      ...payload,
      judgments,
      nextActions,
    },
    warnings,
  };
};

const withBranchContent = (options: {
  state: ResearchTaskState;
  baseOutputs: CandidateOutput[];
  judgments?: JudgmentPayload;
  visionFindings: VisionFinding[];
  personaFindings: PersonaFinding[];
  reviewNotes?: string[];
}): CandidateOutput[] =>
  options.baseOutputs.map((output) => {
    const contentWithReviewNotes = (contentJson: Record<string, unknown>) => ({
      ...contentJson,
      ...(options.reviewNotes?.length ? { reviewNotes: options.reviewNotes } : {}),
    });

    if (output.outputType === 'judgment_card' && options.judgments) {
      return {
        ...output,
        contentJson: contentWithReviewNotes({
          kind: 'judgment_card',
          judgments: options.judgments.judgments,
          nextActions: options.judgments.nextActions,
        }),
        summary: options.judgments.judgments.map((item) => item.title).join('；'),
      };
    }

    if (output.outputType === 'evidence_report' && options.judgments) {
      return {
        ...output,
        contentJson: contentWithReviewNotes({
          kind: 'evidence_report',
          judgments: options.judgments.judgments,
          nextActions: options.judgments.nextActions,
          evidenceDigest: options.state.evidencePool
            .slice(0, 5)
            .map((item) => ({
              tier: item.tier,
              sourceLevel: item.sourceLevel,
              sourceType: item.sourceType,
              content: item.content,
            })),
        }),
        summary: '证据型报告候选：需要满足 RQ3 与充分 T1 证据后方可正式通过。',
      };
    }

    if (output.outputType === 'design_review_report') {
      return {
        ...output,
        contentJson: contentWithReviewNotes({
          kind: 'design_review_report',
          findings: options.visionFindings.map((item) => ({
            findingType: item.findingType,
            riskLevel: item.riskLevel,
            content: item.content,
            isConsensus: item.isConsensus,
            isConflict: item.isConflict,
          })),
          consensusCount: options.visionFindings.filter((item) => item.isConsensus).length,
          conflictCount: options.visionFindings.filter((item) => item.isConflict).length,
        }),
        summary:
          options.visionFindings.find((item) => item.isConsensus)?.content || output.summary,
      };
    }

    if (output.outputType === 'hypothesis_pack') {
      return {
        ...output,
        contentJson: contentWithReviewNotes({
          kind: 'hypothesis_pack',
          findings: options.personaFindings.map((item) => ({
            personaName: item.personaName,
            stance: item.stance,
            theme: item.theme,
            content: item.content,
            isSimulated: item.isSimulated,
          })),
        }),
      };
    }

    return {
      ...output,
      contentJson: contentWithReviewNotes(
        (output.contentJson && typeof output.contentJson === 'object'
          ? output.contentJson
          : {}) as Record<string, unknown>,
      ),
    };
  });

const buildFallbackOutputs = (
  state: ResearchTaskState,
  judgments?: JudgmentPayload,
  visionFindings: VisionFinding[] = [],
  personaFindings: PersonaFinding[] = [],
  reviewNotes?: string[],
): CandidateOutput[] => {
  const outputs = buildMockCandidateOutputs(state.enabledModules);
  return withBranchContent({
    state,
    baseOutputs: outputs,
    judgments,
    visionFindings,
    personaFindings,
    reviewNotes,
  });
};

export const executeExperienceModelAnalysis = async (
  state: ResearchTaskState,
): Promise<{ evidenceItems: EvidenceItem[]; warnings: string[]; result: NonNullable<ResearchTaskState['moduleResults']>['experienceModel'] }> =>
  analyzeExperienceModels(
    {
      title: state.title,
      originalQuery: state.originalQuery,
      taskMode: state.taskMode,
      inputType: state.inputType,
      uploadedDesigns: state.uploadedDesigns,
    },
    state.analysisPlan?.experienceModelPlan.preferredModelIds,
    state.analysisPlan,
  );

export const executeInputParser = async (
  state: ResearchTaskState,
): Promise<{ analysisPlan: AnalysisPlan; subQuestions: SubQuestion[]; warnings: string[] }> => {
  const fallbackPlan = buildFallbackAnalysisPlan(state);

  if (!modelGateway.isTextModelEnabled()) {
    return {
      analysisPlan: fallbackPlan,
      subQuestions: toSubQuestions(fallbackPlan),
      warnings: ['文本模型未配置，输入解析层已回退到本地规则逻辑。'],
    };
  }

  const promptSpec = buildInputParserPrompt({
    userInput: clipText(state.originalQuery, 420),
    inputType: state.inputType,
    taskMode: state.taskMode,
    fileInfo: [...state.uploadedDesigns, ...state.uploadedFiles].map(
      (item) => item.fileName || item.sourceUrl || item.ossKey || item.localPath || item.id,
    ),
  });

  try {
    const raw = await withNodeTimeout(
      'Input Parser',
      modelGateway.runInputParser({ systemPrompt: promptSpec.systemPrompt, prompt: promptSpec.prompt }),
      PROBLEM_DECOMPOSER_TIMEOUT_MS,
    );
    const parsed = safeParseJson<InputParserPayload>(raw);

    if (!parsed?.coreGoal || !parsed.subQuestions?.length) {
      return {
        analysisPlan: fallbackPlan,
        subQuestions: toSubQuestions(fallbackPlan),
        warnings: ['输入解析层返回结果无法解析，已回退到本地规则逻辑。'],
      };
    }

    const analysisPlan: AnalysisPlan = {
      coreGoal: parsed.coreGoal || fallbackPlan.coreGoal,
      artifactType: normalizeArtifactType(parsed.artifactType) || fallbackPlan.artifactType,
      evaluationFocus:
        Array.isArray(parsed.evaluationFocus) && parsed.evaluationFocus.length
          ? parsed.evaluationFocus.filter((item): item is string => typeof item === 'string')
          : fallbackPlan.evaluationFocus,
      targetAudience: parsed.targetAudience || fallbackPlan.targetAudience,
      businessContext: parsed.businessContext || fallbackPlan.businessContext,
      experienceModelPlan: {
        task: parsed.experienceModelPlan?.task || fallbackPlan.experienceModelPlan.task,
        focusDimensions:
          Array.isArray(parsed.experienceModelPlan?.focusDimensions) && parsed.experienceModelPlan.focusDimensions.length
            ? parsed.experienceModelPlan.focusDimensions.filter((item): item is string => typeof item === 'string')
            : fallbackPlan.experienceModelPlan.focusDimensions,
        preferredModelIds:
          Array.isArray(parsed.experienceModelPlan?.preferredModelIds) && parsed.experienceModelPlan.preferredModelIds.length
            ? parsed.experienceModelPlan.preferredModelIds.filter((item): item is string => typeof item === 'string')
            : fallbackPlan.experienceModelPlan.preferredModelIds,
        evaluationQuestions:
          Array.isArray(parsed.experienceModelPlan?.evaluationQuestions) && parsed.experienceModelPlan.evaluationQuestions.length
            ? parsed.experienceModelPlan.evaluationQuestions.filter((item): item is string => typeof item === 'string')
            : fallbackPlan.experienceModelPlan.evaluationQuestions,
      },
      externalSearchPlan: {
        task: parsed.externalSearchPlan?.task || fallbackPlan.externalSearchPlan.task,
        searchQueries:
          Array.isArray(parsed.externalSearchPlan?.searchQueries) && parsed.externalSearchPlan.searchQueries.length
            ? parsed.externalSearchPlan.searchQueries.filter((item): item is string => typeof item === 'string').slice(0, 5)
            : fallbackPlan.externalSearchPlan.searchQueries,
        searchIntent: parsed.externalSearchPlan?.searchIntent || fallbackPlan.externalSearchPlan.searchIntent,
        expectedInsights:
          Array.isArray(parsed.externalSearchPlan?.expectedInsights) && parsed.externalSearchPlan.expectedInsights.length
            ? parsed.externalSearchPlan.expectedInsights.filter((item): item is string => typeof item === 'string')
            : fallbackPlan.externalSearchPlan.expectedInsights,
      },
      visualReviewPlan: {
        task: parsed.visualReviewPlan?.task || fallbackPlan.visualReviewPlan.task,
        reviewDimensions:
          Array.isArray(parsed.visualReviewPlan?.reviewDimensions) && parsed.visualReviewPlan.reviewDimensions.length
            ? parsed.visualReviewPlan.reviewDimensions.filter((item): item is string => typeof item === 'string')
            : fallbackPlan.visualReviewPlan.reviewDimensions,
        businessGoal: parsed.visualReviewPlan?.businessGoal || fallbackPlan.visualReviewPlan.businessGoal,
        keyConcerns:
          Array.isArray(parsed.visualReviewPlan?.keyConcerns) && parsed.visualReviewPlan.keyConcerns.length
            ? parsed.visualReviewPlan.keyConcerns.filter((item): item is string => typeof item === 'string')
            : fallbackPlan.visualReviewPlan.keyConcerns,
      },
      personaSimulationPlan: {
        task: parsed.personaSimulationPlan?.task || fallbackPlan.personaSimulationPlan.task,
        personaTypes:
          Array.isArray(parsed.personaSimulationPlan?.personaTypes) && parsed.personaSimulationPlan.personaTypes.length
            ? parsed.personaSimulationPlan.personaTypes.filter((item): item is string => typeof item === 'string')
            : fallbackPlan.personaSimulationPlan.personaTypes,
        simulationScenarios:
          Array.isArray(parsed.personaSimulationPlan?.simulationScenarios) && parsed.personaSimulationPlan.simulationScenarios.length
            ? parsed.personaSimulationPlan.simulationScenarios.filter((item): item is string => typeof item === 'string')
            : fallbackPlan.personaSimulationPlan.simulationScenarios,
        ratingDimensions:
          Array.isArray(parsed.personaSimulationPlan?.ratingDimensions) && parsed.personaSimulationPlan.ratingDimensions.length
            ? parsed.personaSimulationPlan.ratingDimensions.filter((item): item is string => typeof item === 'string')
            : fallbackPlan.personaSimulationPlan.ratingDimensions,
      },
      subQuestions: parsed.subQuestions.slice(0, 4).map((item) => ({
        text: item.text,
        audience: item.audience,
        scenario: item.scenario,
        journeyPath: item.journeyPath,
        decisionPoint: item.decisionPoint,
      })),
    };

    return {
      analysisPlan,
      subQuestions: toSubQuestions(analysisPlan),
      warnings: [],
    };
  } catch (error) {
    return {
      analysisPlan: fallbackPlan,
      subQuestions: toSubQuestions(fallbackPlan),
      warnings: [
        `输入解析层调用失败，已回退到本地规则：${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
};

export const executeProblemDecomposer = executeInputParser;

export const executeVisionMoE = async (
  state: ResearchTaskState,
): Promise<{ visionFindings: VisionFinding[]; warnings: string[]; result: VisualReviewResult }> => {
  const emptyResult: VisualReviewResult = {
    task: state.analysisPlan?.visualReviewPlan.task || '视觉评审',
    reviewDimensions: state.analysisPlan?.visualReviewPlan.reviewDimensions || [],
    reviewers: [],
    consensus: [],
    conflicts: [],
    prioritizedActions: [],
    confidenceNotes: ['视觉评审属于专家推演，不能直接等同于真实用户证据。'],
    warnings: [],
  };

  if (!state.enabledModules.visionMoE) {
    return { visionFindings: [], warnings: [], result: emptyResult };
  }

  if (!modelGateway.isTextModelEnabled()) {
    const warnings = ['文本模型未配置，Vision 模块未执行真实评审。'];
    return {
      visionFindings: [],
      warnings,
      result: { ...emptyResult, warnings },
    };
  }

  const designAssets = [...state.uploadedDesigns, ...state.uploadedFiles].filter(
    (item) => item.fileType === 'design' || item.fileType === 'image',
  );
  const imageUrls = designAssets
    .map((item) => item.dataUrl || item.sourceUrl || item.ossKey)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, 3);
  const warnings: string[] = [];

  if (!imageUrls.length) {
    warnings.push('未检测到可直接发送给视觉模型的真实图片，已降级为弱视觉推断。');
    return {
      visionFindings: buildWeakVisionFallback(state),
      warnings,
      result: {
        ...emptyResult,
        confidenceNotes: [
          ...emptyResult.confidenceNotes,
          '当前未提供可直接分析的图片输入，因此结果只反映弱视觉推断。',
        ],
        warnings,
      },
    };
  }

  const artifactSummary = buildArtifactSummary(state);
  const reviewers: VisualReviewResult['reviewers'] = [];

  for (const reviewer of VISUAL_REVIEWERS) {
    const promptSpec = buildVisualReviewPrompt({
      plan: state.analysisPlan || buildFallbackAnalysisPlan(state),
      artifactSummary,
      role: reviewer.role,
    });

    try {
      const routes = modelGateway.getVisionRoleRoutes(reviewer.role);
      const review = await withNodeTimeout(
        `Vision Reviewer ${reviewer.label}`,
        modelGateway.runTextMultiModel({
          prompt: promptSpec.prompt,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptSpec.prompt },
                ...imageUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
              ],
            },
          ],
          globalSystemPrompt: promptSpec.systemPrompt,
          models: routes.length ? [routes[0]] : undefined,
        }),
        VISION_NODE_TIMEOUT_MS,
      );

      const first = review[0];
      if (!first || first.error) {
        warnings.push(`${reviewer.label} 失败：${first?.error || '未返回结果'}`);
        continue;
      }

      const parsed = safeParseJson<VisualRoleReviewPayload>(first.text);
      if (!parsed) {
        warnings.push(`${reviewer.label} 结果无法解析。`);
        continue;
      }

      reviewers.push({
        role: parsed.role || reviewer.role,
        roleLabel: parsed.roleLabel || reviewer.label,
        requestedModel: first.model,
        actualModel: first.actualModel || first.model,
        attemptedModels: first.attemptedModels || [first.model],
        dimensions: Array.isArray(parsed.dimensions)
          ? parsed.dimensions.map((item) => ({
              name: item.name || '未命名维度',
              score: typeof item.score === 'number' ? item.score : undefined,
              evidence: item.evidence || '未给出明确依据',
              suggestion: item.suggestion,
            }))
          : [],
        issues: Array.isArray(parsed.issues)
          ? parsed.issues
              .filter((item) => item.issue)
              .map((item) => ({
                severity: item.severity || 'medium',
                issue: item.issue || '未命名问题',
                suggestion: item.suggestion,
              }))
          : [],
        overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : undefined,
        topSuggestion: parsed.topSuggestion,
      });
    } catch (error) {
      warnings.push(`${reviewer.label} 调用失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!reviewers.length) {
    return {
      visionFindings: [],
      warnings: [...warnings, 'Vision 角色化评审全部失败，未生成可采信结论。'],
      result: {
        ...emptyResult,
        confidenceNotes: [...emptyResult.confidenceNotes, '当前没有任何角色成功返回结果，因此本模块结论缺失。'],
        warnings: [...warnings, 'Vision 角色化评审全部失败，未生成可采信结论。'],
      },
    };
  }

  const lowScoreCount = reviewers.filter((item) => typeof item.overallScore === 'number' && item.overallScore <= 6).length;
  const scoreSpread = (() => {
    const scores = reviewers.map((item) => item.overallScore).filter((item): item is number => typeof item === 'number');
    if (scores.length < 2) return 0;
    return Math.max(...scores) - Math.min(...scores);
  })();

  const consensus: string[] = [];
  if (lowScoreCount >= 2) consensus.push('多角色均认为当前稿件仍有明显优化空间。');
  const sharedActionCandidates = reviewers.map((item) => item.topSuggestion).filter(Boolean) as string[];
  if (sharedActionCandidates.length >= 2) {
    consensus.push(`多角色建议优先处理：${sharedActionCandidates.slice(0, 2).join('；')}`);
  }

  const conflicts = scoreSpread >= 2
    ? ['不同视觉角色对当前稿件质量评分存在明显分歧，说明该设计在不同目标下表现不一致。']
    : [];

  const roleFindingTypeMap = {
    structural: 'visual_hierarchy',
    emotional: 'consistency',
    behavioral: 'cta_visibility',
  } as const;

  const visionFindings: VisionFinding[] = reviewers.flatMap((reviewer) => {
    const primaryIssue = reviewer.issues[0];
    const base: VisionFinding[] = [];
    if (primaryIssue) {
      base.push({
        id: uid('vf'),
        findingType: roleFindingTypeMap[reviewer.role],
        riskLevel: primaryIssue.severity === 'high' ? 'high' : primaryIssue.severity === 'low' ? 'low' : 'medium',
        content: `${reviewer.roleLabel}：${primaryIssue.issue}`,
        regionRef: {
          reviewerRole: reviewer.role,
          reviewerLabel: reviewer.roleLabel,
          requestedModel: reviewer.requestedModel,
          actualModel: reviewer.actualModel,
        },
        isConflict: conflicts.length > 0,
      });
    }
    if (reviewer.topSuggestion) {
      base.push({
        id: uid('vf'),
        findingType: roleFindingTypeMap[reviewer.role],
        riskLevel: 'medium',
        content: `${reviewer.roleLabel}建议：${reviewer.topSuggestion}`,
        regionRef: {
          reviewerRole: reviewer.role,
          reviewerLabel: reviewer.roleLabel,
        },
        isConsensus: consensus.length > 0,
      });
    }
    return base;
  });

  const avgScore = averageScore(reviewers.map((item) => item.overallScore));

  return {
    visionFindings: visionFindings.length ? visionFindings : buildWeakVisionFallback(state),
    warnings,
    result: {
      task: state.analysisPlan?.visualReviewPlan.task || '视觉评审',
      reviewDimensions: state.analysisPlan?.visualReviewPlan.reviewDimensions || [],
      reviewers,
      consensus,
      conflicts,
      prioritizedActions: reviewers.map((item) => item.topSuggestion).filter((item): item is string => Boolean(item)).slice(0, 5),
      confidenceNotes: [
        avgScore !== undefined ? `三角色平均评分约为 ${avgScore}/10。` : '当前未形成稳定平均评分。',
        '视觉评审属于专家推演，建议结合真实用户测试或眼动验证。',
      ],
      warnings,
    },
  };
};

export const executeExternalSearch = async (
  state: ResearchTaskState,
): Promise<{ evidenceItems: EvidenceItem[]; warnings: string[]; result: ExternalSearchResult }> => {
  const emptyResult: ExternalSearchResult = {
    task: state.analysisPlan?.externalSearchPlan.task || '外部检索',
    queries: state.analysisPlan?.externalSearchPlan.searchQueries || [],
    benchmarkFindings: [],
    trendFindings: [],
    riskFindings: [],
    keyInsights: [],
    evidenceBoundary: ['未执行外部检索。'],
    warnings: [],
  };

  if (!state.enabledModules.externalSearch) {
    return { evidenceItems: [], warnings: [], result: emptyResult };
  }

  if (!modelGateway.isTextModelEnabled()) {
    const warnings = ['[externalSearch][fallback] 文本模型未配置，已回退为外部检索候选线索。'];
    return {
      evidenceItems: buildFallbackExternalEvidence(state),
      warnings,
      result: { ...emptyResult, warnings, evidenceBoundary: ['当前仅有 fallback 外部线索，未完成真实搜索。'] },
    };
  }

  const subQuestionSummary = compactBulletLines(
    state.subQuestions.map((item) => item.text),
    { maxItems: 3, maxItemLength: 84 },
  );
  const plannedQueries = state.analysisPlan?.externalSearchPlan.searchQueries?.filter(Boolean) || [];
  const warnings: string[] = [];

  let queryBlueprints: ExternalSearchPayload['items'] = plannedQueries.slice(0, 5).map((query) => ({
    sourceType: 'web_article',
    sourceName: 'AnalysisPlan',
    searchQuery: query,
    tentativeClaim: `围绕“${query}”补充外部参照与风险线索。`,
    citationText: '',
  }));

  if (!queryBlueprints.length) {
    const systemPrompt = [
      '你是 AI 用研系统中的 externalSearch 查询规划节点。',
      '你的任务不是伪造已验证事实，而是生成待核查的外部检索线索。',
      '只能输出 JSON，不要输出解释。',
      '每条线索必须包含 sourceType、sourceName、searchQuery、tentativeClaim、citationText。',
    ].join('\n');
    const prompt = [
      `原始问题：${clipText(state.originalQuery, 360)}`,
      `任务模式：${state.taskMode}`,
      `子问题：\n${subQuestionSummary}`,
      '请生成 2 到 3 条外部检索线索，用于后续人工或系统补检。',
    ].join('\n\n');

    try {
      const raw = await withNodeTimeout(
        'External Search Planner',
        modelGateway.runPatternAnalyzer({ systemPrompt, prompt }),
      );
      const parsed = safeParseJson<ExternalSearchPayload>(raw);
      if (parsed?.items?.length) queryBlueprints = parsed.items.slice(0, 3);
    } catch (error) {
      warnings.push(`[externalSearch][planner_fallback] 查询规划失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!queryBlueprints.length) {
    const fallbackWarnings = ['[externalSearch][fallback] 结果无法解析，已回退为外部检索候选线索。'];
    return {
      evidenceItems: buildFallbackExternalEvidence(state),
      warnings: fallbackWarnings,
      result: { ...emptyResult, warnings: fallbackWarnings, evidenceBoundary: ['当前仅有 fallback 外部线索。'] },
    };
  }

  try {
    const queryResults = await Promise.all(
      queryBlueprints.slice(0, 5).map(async (item) => ({
        query: item.searchQuery,
        sourceType: item.sourceType,
        tentativeClaim: item.tentativeClaim,
        sourceName: item.sourceName,
        citationText: item.citationText,
        results: await webSearch(item.searchQuery, { maxResults: 4 }),
      })),
    );

    const flattenedResults = queryResults.flatMap((entry) =>
      entry.results.map((result) => ({
        ...result,
        sourceType: entry.sourceType,
        searchQuery: entry.query,
        tentativeClaim: entry.tentativeClaim,
        querySourceName: entry.sourceName,
        queryCitationText: entry.citationText,
      })),
    );

    if (!flattenedResults.length) {
      const fallbackWarnings = ['[externalSearch][fallback] 未从真实搜索引擎获得结果，已回退为待核查外部线索。'];
      return {
        evidenceItems: buildFallbackExternalEvidence(state),
        warnings: fallbackWarnings,
        result: { ...emptyResult, queries: queryBlueprints.map((item) => item.searchQuery), warnings: fallbackWarnings, evidenceBoundary: ['当前未从真实搜索引擎获得结果。'] },
      };
    }

    let selectedItems: ExternalSearchSelectionPayload['items'] = flattenedResults.slice(0, 3).map((item) => ({
      url: item.url,
      title: item.title,
      snippet: item.snippet,
      sourceType: item.sourceType,
      publishedDate: item.publishedDate,
      relevanceScore: item.relevanceScore,
      reason: item.tentativeClaim,
      searchQuery: item.searchQuery,
      engine: item.engine,
    }));

    try {
      const selectionRaw = await withNodeTimeout(
        'External Search Selector',
        modelGateway.runPatternAnalyzer({
          systemPrompt: [
            '你是 AI 用研系统中的外部证据筛选节点。',
            '你拿到的是真实搜索返回结果，但仍然只能输出待核查外部证据，不得夸大为已验证事实。',
            '请优先保留最相关、最可追溯的 2 到 3 条结果。',
            '只能输出 JSON，不要输出解释。',
          ].join('\n'),
          prompt: [
            `原始问题：${clipText(state.originalQuery, 320)}`,
            `子问题：\n${subQuestionSummary}`,
            '以下是真实搜索返回结果，请挑选最相关的 2 到 3 条，并输出 JSON：',
            JSON.stringify(flattenedResults.slice(0, 10).map((item) => ({
              title: item.title,
              url: item.url,
              snippet: clipText(item.snippet, 280),
              publishedDate: item.publishedDate,
              relevanceScore: item.relevanceScore,
              sourceType: item.sourceType,
              searchQuery: item.searchQuery,
              tentativeClaim: item.tentativeClaim,
              engine: item.engine,
            }))),
            '输出格式：{"items":[{"url":"","title":"","snippet":"","sourceType":"web_article","publishedDate":"","relevanceScore":0.8,"reason":"","searchQuery":"","engine":"tavily"}]}',
          ].join('\n\n'),
        }),
      );
      const selected = safeParseJson<ExternalSearchSelectionPayload>(selectionRaw);
      if (selected?.items?.length) {
        selectedItems = selected.items.filter((item) => item.url && item.title && item.snippet).slice(0, 3);
      }
    } catch {
      // ignore selector failure, keep top results
    }

    const fetchedArticleResults = await Promise.all(
      selectedItems.map(async (item) => {
        try {
          const article = await fetchSearchArticle(item.url);
          return { item, article };
        } catch (error) {
          return { item, fetchError: error instanceof Error ? error.message : String(error) };
        }
      }),
    );

    const fetchedCount = fetchedArticleResults.filter((entry) => 'article' in entry).length;
    const fetchWarnings = fetchedArticleResults
      .filter((entry) => 'fetchError' in entry)
      .map((entry) => `${entry.item.title} 抓取失败：${entry.fetchError}`);

    const evidenceItems = fetchedArticleResults.map((entry, index) => {
      const item = entry.item;
      const article = 'article' in entry ? entry.article : undefined;
      const authenticity = article
        ? article.extractionMode === 'pdf_text' || article.extractionMode === 'pdf_metadata'
          ? 'fetched_document'
          : 'fetched_article'
        : 'search_result';
      const excerpt = article?.excerpt || clipText(item.snippet, 220) || `建议检索：${item.searchQuery || `query_${index + 1}`}`;

      return {
        id: uid('ev'),
        sourceType: item.sourceType || 'web_article',
        sourceLevel: 'external',
        tier: 'T3',
        confidenceScore:
          typeof item.relevanceScore === 'number'
            ? article
              ? Math.max(0.35, Math.min(0.82, item.relevanceScore))
              : Math.max(0.2, Math.min(0.75, item.relevanceScore))
            : article
              ? 0.58
              : 0.48,
        sourceName: article?.title || item.title,
        sourceUrl: article?.finalUrl || item.url,
        sourceDate: article?.publishedDate || item.publishedDate,
        content: article
          ? `已抓取原文的外部证据候选：${clipText(item.reason || article.excerpt || item.snippet, 180)}`
          : `待核查外部发现：${clipText(item.reason || item.snippet, 180)}`,
        citationText: excerpt,
        traceLocation: {
          searchQuery: item.searchQuery,
          generatedBy: 'external_search',
          origin: 'real_web_search',
          engine: item.engine,
          reason: item.reason,
          authenticity,
          sourceDomain: article?.sourceDomain,
          fetchedAt: article?.fetchedAt,
          contentType: article?.contentType,
          extractionMode: article?.extractionMode,
          fetchStatus: article ? 'success' : 'search_only',
          fetchError: 'fetchError' in entry ? entry.fetchError : undefined,
        },
        isUsedInReport: false,
        reviewStatus: 'unreviewed',
      } satisfies EvidenceItem;
    });

    const summaryWarnings = [
      fetchedCount > 0
        ? `[externalSearch][fetched_article] 已抓取 ${fetchedCount} 条外部来源内容（含网页/文档）并作为候选证据入池；未人工复核前不得升为 T1。`
        : '[externalSearch][search_result] 已接入真实搜索结果；当前仅按 T3 待核查外部证据入池，未抓取原文前不得升为更高等级。',
      ...(fetchWarnings.length ? [`[externalSearch][partial_fallback] 原文抓取部分失败：${fetchWarnings.slice(0, 2).join('；')}`] : []),
    ];

    let result: ExternalSearchResult = {
      task: state.analysisPlan?.externalSearchPlan.task || '外部检索',
      queries: queryBlueprints.map((item) => item.searchQuery),
      benchmarkFindings: selectedItems.slice(0, 2).map((item) => `${item.title}｜${item.searchQuery || '未标注查询'}`),
      trendFindings: evidenceItems.filter((item) => (item.traceLocation as Record<string, unknown> | undefined)?.authenticity === 'fetched_article').map((item) => clipText(item.content, 120)).slice(0, 3),
      riskFindings: fetchWarnings.slice(0, 3),
      keyInsights: evidenceItems.slice(0, 3).map((item) => ({
        insight: clipText(item.content, 140),
        source: item.sourceName || '未命名来源',
        confidence: item.confidenceScore && item.confidenceScore >= 0.7 ? 'high' : item.confidenceScore && item.confidenceScore >= 0.5 ? 'medium' : 'low',
        tier: item.tier,
      })),
      evidenceBoundary: [
        '外部检索结果在人工复核前仍以待核查证据为主。',
        fetchedCount > 0 ? '已抓取部分原文，可作为更强的候选依据。' : '当前主要仍是搜索线索，不应直接作为定论事实。',
      ],
      warnings: [...warnings, ...summaryWarnings],
    };

    try {
      const promptSpec = buildExternalSearchSummaryPrompt({
        plan: state.analysisPlan || buildFallbackAnalysisPlan(state),
        searchContext: [
          `检索查询：${queryBlueprints.map((item) => item.searchQuery).join('；')}`,
          `候选结果：${selectedItems.map((item) => `${item.title}｜${item.snippet}`).join('；')}`,
        ].join('\n'),
      });
      const raw = await withNodeTimeout(
        'External Search Summary',
        modelGateway.runPatternAnalyzer({ systemPrompt: promptSpec.systemPrompt, prompt: promptSpec.prompt }),
      );
      const parsed = safeParseJson<ExternalSearchResult>(raw);
      if (parsed) {
        result = {
          task: parsed.task || result.task,
          queries: result.queries,
          benchmarkFindings: parsed.benchmarkFindings || result.benchmarkFindings,
          trendFindings: parsed.trendFindings || result.trendFindings,
          riskFindings: parsed.riskFindings || result.riskFindings,
          keyInsights: Array.isArray(parsed.keyInsights) && parsed.keyInsights.length ? parsed.keyInsights : result.keyInsights,
          evidenceBoundary: parsed.evidenceBoundary || result.evidenceBoundary,
          warnings: result.warnings,
        };
      }
    } catch (error) {
      warnings.push(`[externalSearch][summary_fallback] 摘要生成失败：${error instanceof Error ? error.message : String(error)}`);
      result = { ...result, warnings: [...warnings, ...summaryWarnings] };
    }

    return { evidenceItems, warnings: [...warnings, ...summaryWarnings], result };
  } catch (error) {
    const fallbackWarnings = [`[externalSearch][fallback] 调用失败，已回退为候选线索：${error instanceof Error ? error.message : String(error)}`];
    return {
      evidenceItems: buildFallbackExternalEvidence(state),
      warnings: fallbackWarnings,
      result: {
        ...emptyResult,
        queries: queryBlueprints.map((item) => item.searchQuery),
        warnings: fallbackWarnings,
        evidenceBoundary: ['当前外部检索执行失败，仅保留 fallback 线索。'],
      },
    };
  }
};

export const executePersonaSandbox = async (
  state: ResearchTaskState,
): Promise<{ personaFindings: PersonaFinding[]; warnings: string[]; result: PersonaSimulationResult }> => {
  const emptyResult: PersonaSimulationResult = {
    task: state.analysisPlan?.personaSimulationPlan.task || '模拟用户评审',
    personaTypes: state.analysisPlan?.personaSimulationPlan.personaTypes || [],
    digitalPersonas: [],
    reviews: [],
    aggregate: {
      scoreSummary: {},
      sharedPainPoints: [],
      sharedHighlights: [],
      divergences: [],
      churnRisks: [],
    },
    warnings: [],
  };

  if (!state.enabledModules.personaSandbox) {
    return { personaFindings: [], warnings: [], result: emptyResult };
  }

  if (!modelGateway.isTextModelEnabled()) {
    const warnings = ['文本模型未配置，Persona Sandbox 未执行真实模拟。'];
    return {
      personaFindings: [],
      warnings,
      result: { ...emptyResult, warnings },
    };
  }

  const artifactSummary = buildArtifactSummary(state);
  const imageUrls = getImageAssetUrls(state);
  const visualGrounding = buildPersonaVisualGrounding(state);
  const warnings: string[] = [];
  const requestedPersonaTypes = state.analysisPlan?.personaSimulationPlan.personaTypes || [];
  const selectedProfiles = PERSONA_LIBRARY.filter((item) =>
    requestedPersonaTypes.length ? requestedPersonaTypes.includes(item.type) : true,
  ).slice(0, 4);
  const profiles = selectedProfiles.length ? selectedProfiles : PERSONA_LIBRARY.slice(0, 3);

  if (!imageUrls.length) {
    const noImageWarnings = ['未检测到可供 Persona 使用的上传图片，模拟用户模块未执行。'];
    return {
      personaFindings: [],
      warnings: noImageWarnings,
      result: { ...emptyResult, warnings: noImageWarnings },
    };
  }

  const digitalPersonas: PersonaSimulationResult['digitalPersonas'] = [];
  const reviews: PersonaReviewResult[] = [];
  const personaRoutes = modelGateway.getPersonaTextRoutes();

  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index];
    const modelRoute = personaRoutes[index % personaRoutes.length];
    const modelId = modelRoute?.id || modelGateway.getPersonaTextModels()[0]?.id;

    let personaName = profile.type;
    let personaDescription = profile.summary;
    let usageScenario = state.analysisPlan?.personaSimulationPlan.simulationScenarios[0];
    let concerns = profile.concerns;
    let motivations = profile.motivations;

    try {
      const generationPrompt = buildPersonaGenerationPrompt({
        plan: state.analysisPlan || buildFallbackAnalysisPlan(state),
        persona: profile,
      });
      const rawPersona = await withNodeTimeout(
        `Persona Generation ${profile.type}`,
        modelGateway.runTextModel({
          model: modelId,
          systemPrompt: generationPrompt.systemPrompt,
          prompt: generationPrompt.prompt,
        }),
      );
      const parsedPersona = safeParseJson<PersonaGeneratedPayload>(rawPersona);
      if (parsedPersona?.personaName) {
        personaName = parsedPersona.personaName;
        personaDescription = parsedPersona.description || profile.summary;
        usageScenario = parsedPersona.usageScenario || usageScenario;
        concerns = Array.isArray(parsedPersona.concerns) ? parsedPersona.concerns.filter((item): item is string => typeof item === 'string') : concerns;
        motivations = Array.isArray(parsedPersona.motivations) ? parsedPersona.motivations.filter((item): item is string => typeof item === 'string') : motivations;
        digitalPersonas.push({
          profileId: profile.id,
          personaName,
          age: parsedPersona.age,
          occupation: parsedPersona.occupation,
          city: parsedPersona.city,
          description: personaDescription,
          usageScenario,
          concerns,
          motivations,
        });
      }
    } catch (error) {
      warnings.push(`${profile.type} 数字人生成失败，已使用画像摘要回退：${error instanceof Error ? error.message : String(error)}`);
      digitalPersonas.push({
        profileId: profile.id,
        personaName,
        description: personaDescription,
        usageScenario,
        concerns,
        motivations,
      });
    }

    try {
      const reviewPrompt = buildPersonaReviewPrompt({
        plan: state.analysisPlan || buildFallbackAnalysisPlan(state),
        artifactSummary,
        personaName,
        personaDescription,
        visualGrounding,
      });
      const reviewResponses = await withNodeTimeout(
        `Persona Review ${personaName}`,
        modelGateway.runTextMultiModel({
          prompt: reviewPrompt.prompt,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: reviewPrompt.prompt },
                ...imageUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
              ],
            },
          ],
          globalSystemPrompt: reviewPrompt.systemPrompt,
          models: modelRoute ? [modelRoute] : undefined,
        }),
      );
      const first = reviewResponses[0];
      if (!first || first.error) {
        throw new Error(first?.error || '未返回结果');
      }
      if (first.warnings?.length) {
        warnings.push(...first.warnings.map((item) => `${personaName}：${item}`));
      }

      const parsedReview = safeParseJson<Record<string, unknown>>(first.text);
      const scores = (parsedReview?.scores && typeof parsedReview.scores === 'object' ? parsedReview.scores : {}) as Record<string, unknown>;
      const review: PersonaReviewResult = {
        profileId: profile.id,
        personaName,
        description: personaDescription,
        requestedModel: first.model,
        actualModel: first.actualModel || first.model,
        attemptedModels: first.attemptedModels || [first.model],
        firstImpression: typeof parsedReview?.firstImpression === 'string' ? parsedReview.firstImpression : '暂无第一印象。',
        detailedExperience: typeof parsedReview?.detailedExperience === 'string' ? parsedReview.detailedExperience : '暂无详细体验描述。',
        scores: {
          usability: typeof scores.usability === 'number' ? scores.usability : undefined,
          attractiveness: typeof scores.attractiveness === 'number' ? scores.attractiveness : undefined,
          trust: typeof scores.trust === 'number' ? scores.trust : undefined,
          conversionIntent: typeof scores.conversionIntent === 'number' ? scores.conversionIntent : undefined,
          emotionalResonance: typeof scores.emotionalResonance === 'number' ? scores.emotionalResonance : undefined,
        },
        overallScore: typeof parsedReview?.overallScore === 'number' ? parsedReview.overallScore : undefined,
        quoteToFriend: typeof parsedReview?.quoteToFriend === 'string' ? parsedReview.quoteToFriend : undefined,
        topChangeRequest: typeof parsedReview?.topChangeRequest === 'string' ? parsedReview.topChangeRequest : undefined,
        theme: typeof parsedReview?.theme === 'string' ? parsedReview.theme : undefined,
        stance: typeof parsedReview?.stance === 'string' ? parsedReview.stance as PersonaReviewResult['stance'] : 'mixed',
        isSimulated: true,
      };
      reviews.push(review);
    } catch (error) {
      warnings.push(`${personaName} 评论生成失败：${error instanceof Error ? error.message : String(error)}`);
      reviews.push({
        profileId: profile.id,
        personaName,
        description: personaDescription,
        requestedModel: modelId,
        actualModel: undefined,
        attemptedModels: modelId ? [modelId] : [],
        firstImpression: '模拟评论生成失败。',
        detailedExperience: '当前需要人工补充验证。',
        scores: {},
        overallScore: undefined,
        topChangeRequest: concerns[0],
        theme: '待补充',
        stance: 'mixed',
        isSimulated: true,
      });
    }
  }

  const personaFindings: PersonaFinding[] = reviews.map((review) => ({
    id: uid('pf'),
    personaName: review.personaName,
    stance: review.stance,
    theme: review.theme,
    content: review.topChangeRequest || review.firstImpression,
    isSimulated: true,
  }));

  const aggregate: PersonaSimulationResult['aggregate'] = {
    scoreSummary: {
      usability: averageScore(reviews.map((item) => item.scores.usability)),
      attractiveness: averageScore(reviews.map((item) => item.scores.attractiveness)),
      trust: averageScore(reviews.map((item) => item.scores.trust)),
      conversionIntent: averageScore(reviews.map((item) => item.scores.conversionIntent)),
      emotionalResonance: averageScore(reviews.map((item) => item.scores.emotionalResonance)),
    },
    sharedPainPoints: reviews.map((item) => item.topChangeRequest).filter((item): item is string => Boolean(item)).slice(0, 3),
    sharedHighlights: reviews.map((item) => item.quoteToFriend).filter((item): item is string => Boolean(item)).slice(0, 3),
    divergences: reviews.length >= 2 ? ['不同 persona 对吸引力与效率取舍的反应存在差异。'] : [],
    churnRisks: reviews.map((item) => extractLeadingLines(item.detailedExperience, 1, 96)[0]).filter((item): item is string => Boolean(item)).slice(0, 3),
  };

  if (!reviews.length) {
    return {
      personaFindings: [],
      warnings: [...warnings, 'Persona Sandbox 全部失败，未生成可采信评论。'],
      result: {
        ...emptyResult,
        personaTypes: profiles.map((item) => item.type),
        digitalPersonas,
        warnings: [...warnings, 'Persona Sandbox 全部失败，未生成可采信评论。'],
      },
    };
  }

  return {
    personaFindings,
    warnings,
    result: {
      task: state.analysisPlan?.personaSimulationPlan.task || '模拟用户评审',
      personaTypes: profiles.map((item) => item.type),
      digitalPersonas,
      reviews,
      aggregate,
      warnings,
    },
  };
};

export const executeJudgmentSynthesizer = async (
  state: ResearchTaskState,
): Promise<{
  rqLevel: RqLevel;
  candidateOutputs: CandidateOutput[];
  warnings: string[];
  reviewNotes?: string[];
  rawJudgments?: JudgmentPayload;
  result: SynthesisResult;
}> => {
  const boundaryContext = buildJudgmentBoundaryContext(state);
  const evidenceSummary = state.evidencePool
    .slice(0, 6)
    .map(
      (item, index) =>
        `${index + 1}. [${item.tier}/${item.sourceLevel}/${getEvidenceAuthenticity(item) || 'n/a'}] ${clipText(item.content, 120)}`,
    )
    .join('\n');
  const subQuestionSummary = compactBulletLines(
    state.subQuestions.map((item) => item.text),
    { maxItems: 4, maxItemLength: 96 },
  );
  const visionSummary = compactBulletLines(
    state.visionFindings
      .slice(0, 4)
      .map((item) => `[${item.findingType}/${item.riskLevel}] ${item.content}`),
    { maxItems: 4, maxItemLength: 110 },
  );
  const personaSummary = state.personaFindings
    .slice(0, 4)
    .map((item) => `- [${item.personaName}/${item.stance || 'mixed'}] ${clipText(item.content, 110)}`)
    .join('\n');
  const frameworkSummary = getExperienceModelReportLines(state.evidencePool)
    .slice(0, 3)
    .map((item) => `- ${clipText(item.replace(/\n/g, ' / '), 150)}`)
    .join('\n');
  const boundarySummary = buildBoundarySummary(boundaryContext);
  const reviewNotes: string[] = [];

  const buildFallbackSynthesis = (payload: JudgmentPayload, warnings: string[]): SynthesisResult => ({
    consensus: [
      ...(state.moduleResults?.visualReview?.consensus || []),
      ...(state.moduleResults?.personaSimulation?.aggregate.sharedPainPoints || []).slice(0, 1),
    ].filter(Boolean),
    conflicts: [
      ...(state.moduleResults?.visualReview?.conflicts || []),
      ...(state.moduleResults?.personaSimulation?.aggregate.divergences || []),
    ].filter(Boolean),
    conclusions: payload.judgments.map((item) => ({
      title: item.title,
      content: item.content,
      supportingSources: ['experience_model', 'external_search', 'visual_review', 'persona_simulation'],
      confidence: item.confidence,
      action: payload.nextActions[0],
    })),
    topRecommendations: payload.nextActions.slice(0, 3),
    hypothesesToValidate: [
      '当前综合判断仍需结合真实用户研究进一步验证。',
      ...(state.moduleResults?.externalSearch?.evidenceBoundary || []).slice(0, 1),
    ],
    nextResearchActions: payload.nextActions.slice(0, 5),
    evidenceBoundary: [boundarySummary, ...(reviewNotes.length ? reviewNotes : [])],
    warnings,
  });

  if (!modelGateway.isTextModelEnabled()) {
    const fallbackJudgments: JudgmentPayload = {
      rqLevel: 'RQ2',
      judgments: [
        {
          title: '建议先小范围验证',
          content: '当前更适合将内容入口作为交易链路辅助模块，而不是首页强前置。',
          confidence: 'medium',
          risk: '若内容区前置过强，可能干扰主交易链路。',
        },
      ],
      nextActions: ['补充真实用户研究', '对关键入口进行 A/B 验证'],
    };
    const warnings = ['文本模型未配置，Judgment Synthesizer 已回退到本地 mock 逻辑。'];

    return {
      rqLevel: fallbackJudgments.rqLevel,
      candidateOutputs: buildFallbackOutputs(
        state,
        fallbackJudgments,
        state.visionFindings,
        state.personaFindings,
        reviewNotes,
      ),
      warnings,
      rawJudgments: fallbackJudgments,
      result: buildFallbackSynthesis(fallbackJudgments, warnings),
    };
  }

  const systemPrompt = [
    '你是一个严格的 AI 用研综合判断专家。',
    '你只能输出 JSON，不要输出解释。',
    '必须区分事实、推断和风险，不能伪造真实用户态度。',
    '如果缺少已接受真实证据，只能输出“风险/假设/待核查”口径，不能写成既成事实。',
    'Persona Sandbox、Vision、体验模型、待核查搜索线索都属于辅助信号，不能直接当作真实证据。',
    '请返回字段：rqLevel、judgments、nextActions。',
  ].join('\n');

  const prompt = [
    `原始问题：${clipText(state.originalQuery, 360)}`,
    `子问题：\n${subQuestionSummary}`,
    `证据摘要：\n${evidenceSummary}`,
    `证据边界：\n${boundarySummary}`,
    `体验模型视角：\n${frameworkSummary || '- 无'}`,
    `Vision 观察：\n${visionSummary || '- 无'}`,
    `Persona Sandbox：\n${personaSummary || '- 无'}`,
    '请输出 JSON：{"rqLevel":"RQ2","judgments":[{"title":"","content":"","confidence":"medium","risk":""}],"nextActions":[""]}',
  ].join('\n\n');

  try {
    const raw = await withNodeTimeout(
      'Judgment Synthesizer',
      modelGateway.runJudgmentModel({ systemPrompt, prompt }),
      JUDGMENT_SYNTHESIZER_TIMEOUT_MS,
    );
    const parsed = safeParseJson<JudgmentPayload>(raw);

    if (!parsed?.judgments?.length) {
      throw new Error('Judgment Synthesizer 返回结构不完整');
    }
    const guardedJudgment = enforceJudgmentEvidenceBoundaries(state, parsed);

    if (state.enabledModules.multiModelReview) {
      const reviewSystemPrompt = [
        '你是 AI 用研系统中的最终结论复核节点，不负责重写结论，只负责挑错和校边界。',
        '你只能输出 JSON，不要输出解释。',
        '必须重点检查：事实与推断是否混淆、是否把模拟结果说成真实证据、是否给出超出证据边界的确定性结论。',
        '请返回字段：verdict、supportedPoints、challengePoints、boundaryRisks、recommendedFixes。',
      ].join('\n');

      const reviewPrompt = [
        `原始问题：${clipText(state.originalQuery, 360)}`,
        `证据摘要：\n${evidenceSummary}`,
        `Vision 观察：\n${visionSummary || '- 无'}`,
        `Persona Sandbox：\n${personaSummary || '- 无'}`,
        `待复核结论：\n${JSON.stringify(guardedJudgment.payload)}`,
        '请审查上述结论是否过度推断、证据不足、边界表达不清，并输出 JSON：',
        '{"verdict":"caution","supportedPoints":[""],"challengePoints":[""],"boundaryRisks":[""],"recommendedFixes":[""]}',
      ].join('\n\n');

      try {
        const reviewResult = await withNodeTimeout(
          'Judgment Review',
          modelGateway.runTextMultiModel({
            prompt: reviewPrompt,
            globalSystemPrompt: reviewSystemPrompt,
          }),
          JUDGMENT_REVIEW_TIMEOUT_MS,
        );
        const reviewSummary = reviewResult
          .map((item) => {
            if (item.error) {
              return `${item.model} 失败：${item.error}`;
            }
            const parsedReview = safeParseJson<JudgmentReviewPayload>(item.text);
            if (!parsedReview) {
              return `${item.model} 已返回复核意见，但结构无法解析`;
            }

            const notes = [
              parsedReview.verdict ? `结论=${parsedReview.verdict}` : undefined,
              parsedReview.challengePoints?.[0]
                ? `质疑=${clipText(parsedReview.challengePoints[0], 60)}`
                : undefined,
              parsedReview.boundaryRisks?.[0]
                ? `边界=${clipText(parsedReview.boundaryRisks[0], 60)}`
                : undefined,
              parsedReview.recommendedFixes?.[0]
                ? `修正=${clipText(parsedReview.recommendedFixes[0], 60)}`
                : undefined,
            ].filter(Boolean);

            return `${item.model}：${notes.join(' / ') || '已返回复核结论'}`;
          })
          .join('；');
        reviewNotes.push(reviewSummary);
      } catch (error) {
        reviewNotes.push(`多模型复核失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    let synthesisResult = buildFallbackSynthesis(guardedJudgment.payload, guardedJudgment.warnings);

    try {
      const promptSpec = buildSynthesisPrompt({
        plan: state.analysisPlan || buildFallbackAnalysisPlan(state),
        moduleContext: [
          `体验模型：${JSON.stringify(state.moduleResults?.experienceModel || {})}`,
          `外部检索：${JSON.stringify(state.moduleResults?.externalSearch || {})}`,
          `视觉评审：${JSON.stringify(state.moduleResults?.visualReview || {})}`,
          `模拟用户：${JSON.stringify(state.moduleResults?.personaSimulation || {})}`,
        ].join('\n\n'),
      });
      const rawSynthesis = await withNodeTimeout(
        'Synthesis Layer',
        modelGateway.runJudgmentModel({ systemPrompt: promptSpec.systemPrompt, prompt: promptSpec.prompt }),
        JUDGMENT_SYNTHESIZER_TIMEOUT_MS,
      );
      const parsedSynthesis = safeParseJson<Partial<SynthesisResult>>(rawSynthesis);
      if (parsedSynthesis) {
        synthesisResult = {
          consensus: parsedSynthesis.consensus || synthesisResult.consensus,
          conflicts: parsedSynthesis.conflicts || synthesisResult.conflicts,
          conclusions: parsedSynthesis.conclusions || synthesisResult.conclusions,
          topRecommendations: parsedSynthesis.topRecommendations || synthesisResult.topRecommendations,
          hypothesesToValidate: parsedSynthesis.hypothesesToValidate || synthesisResult.hypothesesToValidate,
          nextResearchActions: parsedSynthesis.nextResearchActions || synthesisResult.nextResearchActions,
          evidenceBoundary: parsedSynthesis.evidenceBoundary || synthesisResult.evidenceBoundary,
          warnings: guardedJudgment.warnings,
        };
      }
    } catch (error) {
      reviewNotes.push(`总结层回退：${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      rqLevel: guardedJudgment.payload.rqLevel || 'RQ2',
      candidateOutputs: buildFallbackOutputs(
        state,
        guardedJudgment.payload,
        state.visionFindings,
        state.personaFindings,
        reviewNotes,
      ),
      warnings: guardedJudgment.warnings,
      reviewNotes,
      rawJudgments: guardedJudgment.payload,
      result: synthesisResult,
    };
  } catch (error) {
    const fallbackJudgments: JudgmentPayload = {
      rqLevel: 'RQ2',
      judgments: [
        {
          title: '建议先小范围验证',
          content: '当前更适合将内容入口作为交易链路辅助模块，而不是首页强前置。',
          confidence: 'medium',
          risk: '若内容区前置过强，可能干扰主交易链路。',
        },
      ],
      nextActions: ['补充真实用户研究', '对关键入口进行 A/B 验证'],
    };
    const warnings = [
      `Judgment Synthesizer 调用失败，已回退到本地 mock：${error instanceof Error ? error.message : String(error)}`,
    ];

    return {
      rqLevel: fallbackJudgments.rqLevel,
      candidateOutputs: buildFallbackOutputs(
        state,
        fallbackJudgments,
        state.visionFindings,
        state.personaFindings,
        reviewNotes,
      ),
      warnings,
      reviewNotes,
      rawJudgments: fallbackJudgments,
      result: buildFallbackSynthesis(fallbackJudgments, warnings),
    };
  }
};

export const enrichTaskForRun = async (
  task: ResearchTaskState,
  options?: {
    onCheckpoint?: (state: ResearchTaskState) => Promise<void> | void;
  },
): Promise<ResearchTaskState> => {
  const inputResult = await executeInputParser(task);
  const experienceModelState: ResearchTaskState = {
    ...task,
    currentNode: 'experience_model_router',
    analysisPlan: inputResult.analysisPlan,
    subQuestions: inputResult.subQuestions,
    evidencePool: [],
    evidenceConflicts: [],
    moduleResults: {},
    runStats: {
      ...task.runStats,
      warnings: [...task.runStats.warnings, ...inputResult.warnings],
    },
  };
  await options?.onCheckpoint?.(experienceModelState);

  const experienceModelResult = await executeExperienceModelAnalysis(experienceModelState);
  const baseEvidencePool = [...buildSeedEvidencePool(), ...experienceModelResult.evidenceItems];
  const externalState: ResearchTaskState = {
    ...experienceModelState,
    currentNode: task.enabledModules.externalSearch ? 'external_search' : 'experience_model_router',
    evidencePool: baseEvidencePool,
    evidenceConflicts: [],
    moduleResults: {
      ...experienceModelState.moduleResults,
      experienceModel: experienceModelResult.result,
    },
    runStats: {
      ...experienceModelState.runStats,
      warnings: [
        ...experienceModelState.runStats.warnings,
        ...experienceModelResult.warnings,
        ...(appConfig.research.useMockEvidence
          ? ['当前启用了 USE_MOCK_EVIDENCE，主证据池包含演示用 mock 证据。']
          : []),
      ],
    },
  };
  await options?.onCheckpoint?.(externalState);

  const externalSearchResult = await executeExternalSearch(externalState);
  const evidencePool = [...baseEvidencePool, ...externalSearchResult.evidenceItems];
  const evidenceConflicts =
    evidencePool.length >= 2
      ? [
          {
            id: uid('cf'),
            topic: '内容入口的前置程度是否会干扰交易链路',
            evidenceAId: evidencePool[0].id,
            evidenceBId: evidencePool[1].id,
            conflictReason: '内部趋势与行业通用模式在入口优先级上存在张力。',
            status: 'open' as const,
          },
        ]
      : [];

  const visionState: ResearchTaskState = {
    ...externalState,
    currentNode: task.enabledModules.visionMoE ? 'vision_moe' : 'judgment_synthesizer',
    evidencePool,
    evidenceConflicts,
    moduleResults: {
      ...externalState.moduleResults,
      externalSearch: externalSearchResult.result,
    },
    runStats: {
      ...externalState.runStats,
      warnings: [...externalState.runStats.warnings, ...externalSearchResult.warnings],
    },
  };
  await options?.onCheckpoint?.(visionState);

  const visionResult = await executeVisionMoE(visionState);
  const personaState: ResearchTaskState = {
    ...visionState,
    currentNode: task.enabledModules.personaSandbox ? 'persona_sandbox' : 'judgment_synthesizer',
    visionFindings: visionResult.visionFindings,
    moduleResults: {
      ...visionState.moduleResults,
      visualReview: visionResult.result,
    },
    runStats: {
      ...visionState.runStats,
      warnings: [...visionState.runStats.warnings, ...visionResult.warnings],
    },
  };
  await options?.onCheckpoint?.(personaState);

  const personaResult = await executePersonaSandbox(personaState);
  const synthesisState: ResearchTaskState = {
    ...personaState,
    currentNode: 'judgment_synthesizer',
    personaFindings: personaResult.personaFindings,
    moduleResults: {
      ...personaState.moduleResults,
      personaSimulation: personaResult.result,
    },
    runStats: {
      ...personaState.runStats,
      warnings: [...personaState.runStats.warnings, ...personaResult.warnings],
    },
  };
  await options?.onCheckpoint?.(synthesisState);

  const judgmentResult = await executeJudgmentSynthesizer(synthesisState);
  const finishedAt = new Date().toISOString();
  const computedLatencyMs = computeLatencyMs(task.runStats.startedAt, finishedAt);

  return {
    ...synthesisState,
    status: 'awaiting_review',
    reviewStatus: 'pending',
    currentNode: 'output_router',
    rqLevel: judgmentResult.rqLevel,
    candidateOutputs: judgmentResult.candidateOutputs,
    synthesisResult: judgmentResult.result,
    runStats: {
      startedAt: task.runStats.startedAt,
      finishedAt,
      costEstimate: task.runStats.costEstimate ?? 5.83,
      latencyMs: computedLatencyMs ?? task.runStats.latencyMs ?? 4200,
      warnings: [
        ...synthesisState.runStats.warnings,
        ...judgmentResult.warnings,
        ...(judgmentResult.reviewNotes?.length
          ? [`多模型复核：${judgmentResult.reviewNotes.join('；')}`]
          : []),
        ...(task.enabledModules.personaSandbox
          ? ['Persona Sandbox 输出为模拟结果，不代表真实用户证据。']
          : []),
      ],
    },
  };
};
