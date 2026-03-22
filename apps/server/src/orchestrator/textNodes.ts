import { randomUUID } from 'node:crypto';
﻿import type {
  CandidateOutput,
  EvidenceItem,
  PersonaFinding,
  ResearchTaskState,
  RqLevel,
  SubQuestion,
  VisionFinding,
} from '@users-research/shared';
import type { ChatMessage } from '@users-research/model-clients';
import { modelGateway } from '../services/modelGateway.js';
import { appConfig } from '../config/env.js';
import {
  analyzeExperienceModels,
  getExperienceModelReportLines,
} from '../services/experienceModelService.js';
import { webSearch } from '../services/searchClient.js';
import {
  buildMockCandidateOutputs,
  buildMockEvidence,
  buildMockPersonaFindings,
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

interface ProblemDecomposePayload {
  subQuestions: Array<{
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

interface VisionReviewPayload {
  findings: Array<{
    findingType: VisionFinding['findingType'];
    riskLevel: VisionFinding['riskLevel'];
    content: string;
  }>;
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

const withBranchContent = (options: {
  state: ResearchTaskState;
  baseOutputs: CandidateOutput[];
  judgments?: JudgmentPayload;
  visionFindings: VisionFinding[];
  personaFindings: PersonaFinding[];
}): CandidateOutput[] =>
  options.baseOutputs.map((output) => {
    if (output.outputType === 'judgment_card' && options.judgments) {
      return {
        ...output,
        contentJson: {
          kind: 'judgment_card',
          judgments: options.judgments.judgments,
          nextActions: options.judgments.nextActions,
        },
        summary: options.judgments.judgments.map((item) => item.title).join('；'),
      };
    }

    if (output.outputType === 'evidence_report' && options.judgments) {
      return {
        ...output,
        contentJson: {
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
        },
        summary: '证据型报告候选：需要满足 RQ3 与充分 T1 证据后方可正式通过。',
      };
    }

    if (output.outputType === 'design_review_report') {
      return {
        ...output,
        contentJson: {
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
        },
        summary:
          options.visionFindings.find((item) => item.isConsensus)?.content || output.summary,
      };
    }

    if (output.outputType === 'hypothesis_pack') {
      return {
        ...output,
        contentJson: {
          kind: 'hypothesis_pack',
          findings: options.personaFindings.map((item) => ({
            personaName: item.personaName,
            stance: item.stance,
            theme: item.theme,
            content: item.content,
            isSimulated: item.isSimulated,
          })),
        },
      };
    }

    return output;
  });

const buildFallbackOutputs = (
  state: ResearchTaskState,
  judgments?: JudgmentPayload,
  visionFindings: VisionFinding[] = [],
  personaFindings: PersonaFinding[] = [],
): CandidateOutput[] => {
  const outputs = buildMockCandidateOutputs(state.enabledModules);
  return withBranchContent({
    state,
    baseOutputs: outputs,
    judgments,
    visionFindings,
    personaFindings,
  });
};

export const executeExperienceModelAnalysis = async (
  state: ResearchTaskState,
): Promise<{ evidenceItems: EvidenceItem[]; warnings: string[] }> =>
  analyzeExperienceModels({
    title: state.title,
    originalQuery: state.originalQuery,
    taskMode: state.taskMode,
    inputType: state.inputType,
    uploadedDesigns: state.uploadedDesigns,
  });

export const executeProblemDecomposer = async (
  state: ResearchTaskState,
): Promise<{ subQuestions: SubQuestion[]; warnings: string[] }> => {
  if (!modelGateway.isTextModelEnabled()) {
    return {
      subQuestions: buildFallbackSubQuestions(state.originalQuery),
      warnings: ['文本模型未配置，Problem Decomposer 已回退到本地 mock 逻辑。'],
    };
  }

  const systemPrompt = [
    '你是一个严谨的 AI 用研问题拆解专家。',
    '你只能输出 JSON，不要输出任何额外解释。',
    '请将用户问题拆成 2 到 4 个可研究的子问题。',
    '每个子问题必须包含 text、audience、scenario、journeyPath、decisionPoint 字段。',
    '优先保留研究价值最高的问题，避免复述原问题。',
  ].join('\n');

  const prompt = [
    `用户问题：${clipText(state.originalQuery, 420)}`,
    `任务模式：${state.taskMode}`,
    '请输出 JSON：{"subQuestions":[{"text":"","audience":"","scenario":"","journeyPath":"","decisionPoint":""}]}',
  ].join('\n');

  try {
    const raw = await withNodeTimeout(
      'Problem Decomposer',
      modelGateway.runProblemDecomposer({ systemPrompt, prompt }),
    );
    const parsed = safeParseJson<ProblemDecomposePayload>(raw);

    if (!parsed?.subQuestions?.length) {
      return {
        subQuestions: buildFallbackSubQuestions(state.originalQuery),
        warnings: ['Problem Decomposer 返回结果无法解析，已回退到本地 mock 逻辑。'],
      };
    }

    return {
      subQuestions: parsed.subQuestions.slice(0, 4).map((item, index) => ({
        id: uid('sq'),
        seq: index + 1,
        text: item.text,
        audience: item.audience,
        scenario: item.scenario,
        journeyPath: item.journeyPath,
        decisionPoint: item.decisionPoint,
        status: 'completed',
      })),
      warnings: [],
    };
  } catch (error) {
    return {
      subQuestions: buildFallbackSubQuestions(state.originalQuery),
      warnings: [
        `Problem Decomposer 调用失败，已回退到本地 mock：${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
};

export const executeVisionMoE = async (
  state: ResearchTaskState,
): Promise<{ visionFindings: VisionFinding[]; warnings: string[] }> => {
  if (!state.enabledModules.visionMoE) {
    return { visionFindings: [], warnings: [] };
  }

  if (!modelGateway.isTextModelEnabled()) {
    return {
      visionFindings: buildMockVisionFindings(),
      warnings: ['文本模型未配置，Vision MoE 已回退到本地 mock 逻辑。'],
    };
  }

  const designAssets = [...state.uploadedDesigns, ...state.uploadedFiles].filter(
    (item) => item.fileType === 'design' || item.fileType === 'image',
  );
  const designRefs = designAssets.map(
    (item) => `${item.fileName}${item.sourceUrl ? `（${item.sourceUrl}）` : item.ossKey ? `（${item.ossKey}）` : ''}`,
  );
  const imageUrls = designAssets
    .map((item) => item.sourceUrl || item.ossKey)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, 3);
  const subQuestionSummary = state.subQuestions.length
    ? compactBulletLines(
        state.subQuestions.map((item) => item.text),
        { maxItems: 3, maxItemLength: 88 },
      )
    : '- 暂无子问题';
  const warnings: string[] = [];

  if (!designRefs.length) {
    warnings.push('未提供设计图或截图输入，Vision MoE 当前仅能基于问题描述做弱视觉推断。');
  } else if (!imageUrls.length) {
    warnings.push('已提供设计输入条目，但缺少可直接发送给模型的 sourceUrl / ossKey，当前仍使用文本引用推断。');
  }

  if (!imageUrls.length) {
    return {
      visionFindings: buildWeakVisionFallback(state),
      warnings: [
        ...warnings,
        'Vision MoE 已跳过高成本多模型分析，改为文本启发式弱视觉推断；结果仅用于提示风险，不代表真实界面审查结论。',
      ],
    };
  }

  const systemPrompt = [
    '你是 AI 用研系统中的 Vision MoE 评审节点。',
    '请从视觉层级、CTA 可见性、路径摩擦、认知负担、一致性、注意力风险角度给出评审。',
    '如果没有真实设计图，只能输出保守、低风险或中风险的弱推断，不能伪造具体坐标。',
    '仅输出 JSON，不要输出解释。',
    '输出格式：{"findings":[{"findingType":"cta_visibility","riskLevel":"medium","content":"..."}]}.',
  ].join('\n');

  const prompt = [
    `原始问题：${clipText(state.originalQuery, 420)}`,
    `任务模式：${state.taskMode}`,
    `子问题：\n${subQuestionSummary}`,
    `设计输入：\n${
      designRefs.length
        ? compactBulletLines(designRefs, { maxItems: 3, maxItemLength: 120 })
        : '- 未提供设计图，仅可做弱视觉判断'
    }`,
  ].join('\n\n');

  try {
    const visionMessages: ChatMessage[] | undefined = imageUrls.length
      ? [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...imageUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
            ],
          },
        ]
      : undefined;

    if (imageUrls.length) {
      warnings.push(`Vision MoE 已接收 ${imageUrls.length} 个真实图像引用并尝试走多模态分析。`);
    }

    const visionRoutes = modelGateway.getVisionTextRoutes();
    const reviews = await withNodeTimeout(
      'Vision MoE',
      modelGateway.runTextMultiModel({
        prompt,
        messages: visionMessages,
        globalSystemPrompt: systemPrompt,
        models: visionRoutes,
      }),
      45000,
    );

    type ParsedVisionItem = {
      model: string;
      requestedModel: string;
      actualModel: string;
      attemptedModels: string[];
      warnings: string[];
      findingType: VisionFinding['findingType'];
      riskLevel: VisionFinding['riskLevel'];
      content: string;
    };

    const parsedItems = reviews.flatMap<ParsedVisionItem>((review) => {
      if (review.warnings?.length) {
        warnings.push(...review.warnings.map((item) => `${review.name || review.model}：${item}`));
      }

      if (review.error) {
        warnings.push(`${review.name || review.model} 视觉评审失败：${review.error}`);
        return [] as ParsedVisionItem[];
      }

      const parsed = safeParseJson<VisionReviewPayload>(review.text);
      if (!parsed?.findings?.length) {
        warnings.push(`${review.name || review.model} 视觉评审结果无法解析，已忽略。`);
        return [] as ParsedVisionItem[];
      }

      return parsed.findings.slice(0, 3).map((item) => ({
        model:
          review.actualModel && review.actualModel !== review.model
            ? `${review.name || review.model}→${review.actualModel}`
            : review.name || review.model,
        requestedModel: review.model,
        actualModel: review.actualModel || review.model,
        attemptedModels: review.attemptedModels || [review.model],
        warnings: review.warnings || [],
        findingType: item.findingType,
        riskLevel: item.riskLevel,
        content: item.content,
      }));
    });

    if (!parsedItems.length) {
      return {
        visionFindings: buildMockVisionFindings(),
        warnings: [...warnings, 'Vision MoE 返回为空，已回退到本地 mock 结果。'],
      };
    }

    const grouped = parsedItems.reduce<Record<string, typeof parsedItems>>((acc, item) => {
      const key = normalizeFindingKey(item.findingType);
      acc[key] = acc[key] || [];
      acc[key].push(item);
      return acc;
    }, {});

    const consensusFindings: VisionFinding[] = [];
    const conflictFindings: VisionFinding[] = [];

    Object.entries(grouped).forEach(([key, items]) => {
      const representativeType = key as VisionFinding['findingType'];
      const distinctActualModels = new Set(items.map((item) => item.actualModel)).size;

      if (distinctActualModels >= 2) {
        const maxRisk = items.reduce(
          (current, item) => pickHigherRisk(current, item.riskLevel),
          items[0].riskLevel,
        );
        consensusFindings.push({
          id: uid('vf'),
          findingType: representativeType,
          riskLevel: maxRisk,
          content: `多模型共识：${items[0].content}`,
          regionRef: {
            reviewerModels: uniqueStrings(items.map((item) => item.model)),
            requestedModels: uniqueStrings(items.map((item) => item.requestedModel)),
            actualModels: uniqueStrings(items.map((item) => item.actualModel)),
            attemptedModels: uniqueStrings(items.flatMap((item) => item.attemptedModels || [])),
            warnings: uniqueStrings(items.flatMap((item) => item.warnings || [])),
          },
          isConsensus: true,
        });
      }

      const shouldMarkConflict = items.length !== visionRoutes.length || distinctActualModels < items.length;
      const distinctContents = new Set(items.map((item) => item.content.trim())).size;
      if (shouldMarkConflict || distinctContents > 1) {
        items.forEach((item) => {
          conflictFindings.push({
            id: uid('vf'),
            findingType: item.findingType,
            riskLevel: item.riskLevel,
            content: `${item.model}：${item.content}`,
            regionRef: {
              reviewerLabel: item.model,
              requestedModel: item.requestedModel,
              actualModel: item.actualModel,
              attemptedModels: item.attemptedModels,
              warnings: item.warnings,
            },
            isConflict: true,
          });
        });
      }
    });

    const visionFindings = [...consensusFindings, ...conflictFindings];
    return {
      visionFindings: visionFindings.length ? visionFindings : buildMockVisionFindings(),
      warnings,
    };
  } catch (error) {
    return {
      visionFindings: buildMockVisionFindings(),
      warnings: [
        ...warnings,
        `Vision MoE 调用失败，已回退到本地 mock：${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
};

export const executeExternalSearch = async (
  state: ResearchTaskState,
): Promise<{ evidenceItems: EvidenceItem[]; warnings: string[] }> => {
  if (!state.enabledModules.externalSearch) {
    return { evidenceItems: [], warnings: [] };
  }

  if (!modelGateway.isTextModelEnabled()) {
    return {
      evidenceItems: buildFallbackExternalEvidence(state),
      warnings: ['文本模型未配置，externalSearch 已回退为外部检索候选线索。'],
    };
  }

  const subQuestionSummary = compactBulletLines(
    state.subQuestions.map((item) => item.text),
    { maxItems: 3, maxItemLength: 84 },
  );
  const systemPrompt = [
    '你是 AI 用研系统中的 externalSearch 证据补全节点。',
    '你的任务不是伪造已验证事实，而是生成“待核查的外部检索线索”。',
    '只能输出 JSON，不要输出解释。',
    '每条线索必须包含 sourceType、sourceName、searchQuery、tentativeClaim、citationText。',
    '所有输出都应被视为 T3 待核查线索，不能伪造具体 URL、页码或真实研究结论。',
    '输出格式：{"items":[{"sourceType":"web_article","sourceName":"","searchQuery":"","tentativeClaim":"","citationText":""}]}',
    '尽量压缩表述，只保留最关键的 2 到 3 条检索线索。',
  ].join('\n');

  const prompt = [
    `原始问题：${clipText(state.originalQuery, 360)}`,
    `任务模式：${state.taskMode}`,
    `子问题：\n${subQuestionSummary}`,
    '请生成 2 到 3 条外部检索线索，用于后续人工或系统补检。',
  ].join('\n\n');

  try {
    const raw = await withNodeTimeout(
      'External Search',
      modelGateway.runPatternAnalyzer({ systemPrompt, prompt }),
    );
    const parsed = safeParseJson<ExternalSearchPayload>(raw);

    if (!parsed?.items?.length) {
      return {
        evidenceItems: buildFallbackExternalEvidence(state),
        warnings: ['externalSearch 结果无法解析，已回退为外部检索候选线索。'],
      };
    }

    const queryResults = await Promise.all(
      parsed.items.slice(0, 3).map(async (item) => ({
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
      return {
        evidenceItems: buildFallbackExternalEvidence(state),
        warnings: ['externalSearch 未从真实搜索引擎获得结果，已回退为待核查外部线索。'],
      };
    }

    const selectionPrompt = [
      `原始问题：${clipText(state.originalQuery, 320)}`,
      `子问题：\n${subQuestionSummary}`,
      '以下是真实搜索返回结果，请挑选最相关的 2 到 3 条，并输出 JSON：',
      JSON.stringify(
        flattenedResults.slice(0, 10).map((item) => ({
          title: item.title,
          url: item.url,
          snippet: clipText(item.snippet, 280),
          publishedDate: item.publishedDate,
          relevanceScore: item.relevanceScore,
          sourceType: item.sourceType,
          searchQuery: item.searchQuery,
          tentativeClaim: item.tentativeClaim,
          engine: item.engine,
        })),
      ),
      '输出格式：{"items":[{"url":"","title":"","snippet":"","sourceType":"web_article","publishedDate":"","relevanceScore":0.8,"reason":"","searchQuery":"","engine":"tavily"}]}',
    ].join('\n\n');

    let selectedItems: ExternalSearchSelectionPayload['items'] =
      flattenedResults.slice(0, 3).map((item) => ({
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
          prompt: selectionPrompt,
        }),
      );
      const selected = safeParseJson<ExternalSearchSelectionPayload>(selectionRaw);
      if (selected?.items?.length) {
        selectedItems = selected.items
          .filter((item) => item.url && item.title && item.snippet)
          .slice(0, 3);
      }
    } catch {
      // 筛选失败时保留默认 top results。
    }

    return {
      evidenceItems: selectedItems.map((item, index) => ({
        id: uid('ev'),
        sourceType: item.sourceType || 'web_article',
        sourceLevel: 'external',
        tier: 'T3',
        confidenceScore:
          typeof item.relevanceScore === 'number'
            ? Math.max(0.2, Math.min(0.75, item.relevanceScore))
            : 0.48,
        sourceName: item.title,
        sourceUrl: item.url,
        sourceDate: item.publishedDate,
        content: `待核查外部发现：${clipText(item.reason || item.snippet, 180)}`,
        citationText: clipText(item.snippet, 220) || `建议检索：${item.searchQuery || `query_${index + 1}`}`,
        traceLocation: {
          searchQuery: item.searchQuery,
          generatedBy: 'external_search',
          origin: 'real_web_search',
          engine: item.engine,
          reason: item.reason,
        },
        isUsedInReport: false,
        reviewStatus: 'unreviewed',
      })),
      warnings: ['externalSearch 已接入真实搜索结果；当前仅按 T3 待核查外部证据入池，未抓取原文前不得升为更高等级。'],
    };
  } catch (error) {
    return {
      evidenceItems: buildFallbackExternalEvidence(state),
      warnings: [
        `externalSearch 调用失败，已回退为候选线索：${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
};

export const executePersonaSandbox = async (
  state: ResearchTaskState,
): Promise<{ personaFindings: PersonaFinding[]; warnings: string[] }> => {
  if (!state.enabledModules.personaSandbox) {
    return { personaFindings: [], warnings: [] };
  }

  if (!modelGateway.isTextModelEnabled()) {
    return {
      personaFindings: buildMockPersonaFindings(),
      warnings: ['文本模型未配置，Persona Sandbox 已回退到本地 mock 逻辑。'],
    };
  }

  const personaAgents = [
    {
      personaName: '价格敏感型用户',
      rolePrompt:
        '你是价格敏感型用户，优先关注效率、优惠信息和路径长度，谨慎表达支持或反对。',
    },
    {
      personaName: '高内容消费型用户',
      rolePrompt:
        '你是高内容消费型用户，关注内容是否帮助决策、理解价值和降低试错成本。',
    },
    {
      personaName: '低熟悉度新用户',
      rolePrompt:
        '你是低熟悉度新用户，关注认知负担、理解成本、是否容易迷失和是否愿意继续。',
    },
  ] as const;

  const models = modelGateway.getPersonaTextModels();
  const subQuestionSummary = compactBulletLines(
    state.subQuestions.map((item) => item.text),
    { maxItems: 3, maxItemLength: 80 },
  );
  const visionSummary = compactBulletLines(
    state.visionFindings.map((item) => `[${item.findingType}/${item.riskLevel}] ${item.content}`),
    { maxItems: 3, maxItemLength: 96 },
  );
  const warnings: string[] = [];
  const findings: PersonaFinding[] = [];

  for (let index = 0; index < personaAgents.length; index += 1) {
    const agent = personaAgents[index];
    const model = models[index % models.length];
    const systemPrompt = [
      '你是 AI 用研系统中的 Persona Sandbox 节点。',
      '你的输出是模拟假设，不代表真实用户证据，不能虚构真实调研结论。',
      agent.rolePrompt,
      '只输出 JSON，不要输出解释。',
      '输出格式：{"personaName":"","stance":"support","theme":"","content":""}',
    ].join('\n');

    const prompt = [
      `原始问题：${clipText(state.originalQuery, 280)}`,
      `任务模式：${state.taskMode}`,
      `子问题：\n${subQuestionSummary}`,
      `Vision 观察：\n${visionSummary}`,
      '请站在当前 persona 视角，给出一条最有代表性的模拟反馈。',
    ].join('\n\n');

    try {
      const raw = await withNodeTimeout(
        `Persona Sandbox ${agent.personaName}`,
        modelGateway.runTextModel({
          model: model.id,
          systemPrompt,
          prompt,
        }),
      );
      const parsed = safeParseJson<PersonaReviewPayload>(raw);

      if (!parsed?.content || !parsed?.theme || !parsed?.personaName) {
        warnings.push(`${agent.personaName} 结果无法解析，已使用 mock 回退。`);
        findings.push(
          buildMockPersonaFindings().find((item) => item.personaName === agent.personaName) || {
            id: uid('pf'),
            personaName: agent.personaName,
            stance: 'mixed',
            theme: '待补充',
            content: '当前 persona 输出无法解析，需人工补充验证。',
            isSimulated: true,
          },
        );
        continue;
      }

      findings.push({
        id: uid('pf'),
        personaName: parsed.personaName,
        stance: parsed.stance,
        theme: parsed.theme,
        content: parsed.content,
        isSimulated: true,
      });
    } catch (error) {
      warnings.push(
        `${agent.personaName} 调用失败，已回退到 mock：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      findings.push(
        buildMockPersonaFindings().find((item) => item.personaName === agent.personaName) || {
          id: uid('pf'),
          personaName: agent.personaName,
          stance: 'mixed',
          theme: '待补充',
          content: '当前 persona 节点执行失败，需人工补充验证。',
          isSimulated: true,
        },
      );
    }
  }

  return {
    personaFindings: findings.length ? findings : buildMockPersonaFindings(),
    warnings,
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
}> => {
  const evidenceSummary = state.evidencePool
    .slice(0, 6)
    .map(
      (item, index) =>
        `${index + 1}. [${item.tier}/${item.sourceLevel}] ${clipText(item.content, 120)}`,
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
  const reviewNotes: string[] = [];

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

    return {
      rqLevel: fallbackJudgments.rqLevel,
      candidateOutputs: buildFallbackOutputs(
        state,
        fallbackJudgments,
        state.visionFindings,
        state.personaFindings,
      ),
      warnings: ['文本模型未配置，Judgment Synthesizer 已回退到本地 mock 逻辑。'],
      rawJudgments: fallbackJudgments,
    };
  }

  const systemPrompt = [
    '你是一个严格的 AI 用研综合判断专家。',
    '你只能输出 JSON，不要输出解释。',
    '必须区分事实、推断和风险，不能伪造真实用户态度。',
    '请返回字段：rqLevel、judgments、nextActions。',
  ].join('\n');

  const prompt = [
    `原始问题：${clipText(state.originalQuery, 360)}`,
    `子问题：\n${subQuestionSummary}`,
    `证据摘要：\n${evidenceSummary}`,
    `体验模型视角：\n${frameworkSummary || '- 无'}`,
    `Vision 观察：\n${visionSummary || '- 无'}`,
    `Persona Sandbox：\n${personaSummary || '- 无'}`,
    '请输出 JSON：{"rqLevel":"RQ2","judgments":[{"title":"","content":"","confidence":"medium","risk":""}],"nextActions":[""]}',
  ].join('\n\n');

  const reviewPromise = state.enabledModules.multiModelReview
    ? withNodeTimeout(
        'Judgment Review',
        modelGateway.runTextMultiModel({
          prompt,
          globalSystemPrompt: systemPrompt,
        }),
        25000,
      )
        .then((review) => ({ review }))
        .catch((error) => ({
          error: error instanceof Error ? error.message : String(error),
        }))
    : undefined;

  try {
    const raw = await withNodeTimeout(
      'Judgment Synthesizer',
      modelGateway.runJudgmentModel({ systemPrompt, prompt }),
    );
    const parsed = safeParseJson<JudgmentPayload>(raw);

    if (!parsed?.judgments?.length) {
      throw new Error('Judgment Synthesizer 返回结构不完整');
    }

    if (reviewPromise) {
      try {
        const reviewResult = await reviewPromise;
        if ('error' in reviewResult) {
          reviewNotes.push(`多模型复核失败：${reviewResult.error}`);
        } else {
          const reviewSummary = reviewResult.review
            .map((item) =>
              item.error ? `${item.model} 失败：${item.error}` : `${item.model} 已返回复核结论`,
            )
            .join('；');
          reviewNotes.push(reviewSummary);
        }
      } catch (error) {
        reviewNotes.push(`多模型复核失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      rqLevel: parsed.rqLevel || 'RQ2',
      candidateOutputs: buildFallbackOutputs(
        state,
        parsed,
        state.visionFindings,
        state.personaFindings,
      ),
      warnings: [],
      reviewNotes,
      rawJudgments: parsed,
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

    return {
      rqLevel: fallbackJudgments.rqLevel,
      candidateOutputs: buildFallbackOutputs(
        state,
        fallbackJudgments,
        state.visionFindings,
        state.personaFindings,
      ),
      warnings: [
        `Judgment Synthesizer 调用失败，已回退到本地 mock：${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
      reviewNotes,
      rawJudgments: fallbackJudgments,
    };
  }
};

export const enrichTaskForRun = async (
  task: ResearchTaskState,
  options?: {
    onCheckpoint?: (state: ResearchTaskState) => Promise<void> | void;
  },
): Promise<ResearchTaskState> => {
  const problemResult = await executeProblemDecomposer(task);
  const experienceModelState: ResearchTaskState = {
    ...task,
    currentNode: 'experience_model_router',
    subQuestions: problemResult.subQuestions,
    evidencePool: [],
    evidenceConflicts: [],
    runStats: {
      ...task.runStats,
      warnings: [...task.runStats.warnings, ...problemResult.warnings],
    },
  };
  await options?.onCheckpoint?.(experienceModelState);
  const experienceModelResult = await executeExperienceModelAnalysis(experienceModelState);
  const baseEvidencePool = [...buildSeedEvidencePool(), ...experienceModelResult.evidenceItems];
  const externalState: ResearchTaskState = {
    ...task,
    currentNode: task.enabledModules.externalSearch ? 'external_search' : 'experience_model_router',
    subQuestions: problemResult.subQuestions,
    evidencePool: baseEvidencePool,
    evidenceConflicts: [],
    runStats: {
      ...task.runStats,
      warnings: [
        ...task.runStats.warnings,
        ...problemResult.warnings,
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
