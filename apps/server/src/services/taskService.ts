import type {
  CandidateOutput,
  CreateTaskRequest,
  EvidenceItem,
  EvidenceListResponse,
  OutputsResponse,
  PersonaResponse,
  PreviewPlanResponse,
  ReportResponse,
  ReviewEvidenceRequest,
  ReviewEvidenceResponse,
  ResearchTaskState,
  ReviewReportRequest,
  ReviewReportResponse,
  TaskSummaryResponse,
  VisionResponse,
} from '@users-research/shared';
import type {
  CandidateOutput as PrismaCandidateOutput,
  EvidenceConflict as PrismaEvidenceConflict,
  EvidenceItem as PrismaEvidenceItem,
  PersonaFinding as PrismaPersonaFinding,
  Report as PrismaReport,
  ResearchTask as PrismaResearchTask,
  SubQuestion as PrismaSubQuestion,
  VisionFinding as PrismaVisionFinding,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { appConfig } from '../config/env';
import { getPrismaClient } from '../lib/prisma';
import { enrichTaskForRun, executeJudgmentSynthesizer } from '../orchestrator/textNodes';
import { analyzeExperienceModels } from './experienceModelService';
import { reportStore, taskStore } from './mockStore';

type PersistedTask = PrismaResearchTask & {
  subQuestions: PrismaSubQuestion[];
  evidenceItems: PrismaEvidenceItem[];
  evidenceConflicts: PrismaEvidenceConflict[];
  visionFindings: PrismaVisionFinding[];
  personaFindings: PrismaPersonaFinding[];
  candidateOutputs: PrismaCandidateOutput[];
  reports: PrismaReport[];
};

const recomputeJobs = new Map<string, Promise<void>>();
const taskRunJobs = new Map<string, Promise<ResearchTaskState>>();

const taskInclude = {
  subQuestions: true,
  evidenceItems: true,
  evidenceConflicts: true,
  visionFindings: true,
  personaFindings: true,
  candidateOutputs: true,
  reports: true,
} as const;

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value && typeof value === 'object') return value as T;
  return fallback;
};

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const toStateFromDb = (task: PersistedTask): ResearchTaskState => ({
  taskId: task.id,
  title: task.title ?? undefined,
  originalQuery: task.query,
  inputType: task.inputType as ResearchTaskState['inputType'],
  taskMode: task.taskMode as ResearchTaskState['taskMode'],
  uploadedFiles: parseJson((task as any).inputFiles, []),
  uploadedDesigns: parseJson((task as any).designFiles, []),
  enabledModules: parseJson(task.enabledModules, {
    evidence: true,
    visionMoE: false,
    personaSandbox: false,
    externalSearch: false,
    multiModelReview: false,
  }),
  status: task.status as ResearchTaskState['status'],
  reviewStatus: task.reviewStatus as ResearchTaskState['reviewStatus'],
  currentNode: task.currentNode ?? undefined,
  rqLevel: (task.rqLevel as ResearchTaskState['rqLevel']) ?? undefined,
  subQuestions: task.subQuestions.map((item) => ({
    id: item.id,
    seq: item.seq,
    text: item.text,
    audience: item.audience ?? undefined,
    scenario: item.scenario ?? undefined,
    journeyPath: item.journeyPath ?? undefined,
    decisionPoint: item.decisionPoint ?? undefined,
    status: item.status as ResearchTaskState['subQuestions'][number]['status'],
  })),
  evidencePool: task.evidenceItems.map((item) => ({
    id: item.id,
    subQuestionId: item.subQuestionId ?? undefined,
    sourceType: item.sourceType as ResearchTaskState['evidencePool'][number]['sourceType'],
    sourceLevel: item.sourceLevel as ResearchTaskState['evidencePool'][number]['sourceLevel'],
    tier: item.tier as ResearchTaskState['evidencePool'][number]['tier'],
    confidenceScore: item.confidenceScore ?? undefined,
    sourceName: item.sourceName ?? undefined,
    sourceUrl: item.sourceUrl ?? undefined,
    sourceDate: item.sourceDate?.toISOString(),
    content: item.content,
    citationText: item.citationText ?? undefined,
    traceLocation: parseJson(item.traceLocation, undefined),
    isUsedInReport: item.isUsedInReport,
    reviewStatus: item.reviewStatus as ResearchTaskState['evidencePool'][number]['reviewStatus'],
  })),
  evidenceConflicts: task.evidenceConflicts.map((item) => ({
    id: item.id,
    topic: item.topic,
    evidenceAId: item.evidenceAId,
    evidenceBId: item.evidenceBId,
    conflictReason: item.conflictReason,
    status: item.status as ResearchTaskState['evidenceConflicts'][number]['status'],
  })),
  visionFindings: task.visionFindings.map((item) => ({
    id: item.id,
    findingType: item.findingType as ResearchTaskState['visionFindings'][number]['findingType'],
    riskLevel: item.riskLevel as ResearchTaskState['visionFindings'][number]['riskLevel'],
    content: item.content,
    regionRef: parseJson(item.regionRef, undefined),
    isConsensus: item.isConsensus,
    isConflict: item.isConflict,
  })),
  personaFindings: task.personaFindings.map((item) => ({
    id: item.id,
    personaName: item.personaName,
    stance: item.stance as ResearchTaskState['personaFindings'][number]['stance'],
    theme: item.theme ?? undefined,
    content: item.content,
    isSimulated: true,
  })),
  candidateOutputs: task.candidateOutputs.map((item) => ({
    id: item.id,
    outputType: item.outputType as CandidateOutput['outputType'],
    sourceNode: item.sourceNode,
    gateLevel: (item.gateLevel as CandidateOutput['gateLevel']) ?? undefined,
    gateNotes: asStringArray(asRecord(item.contentJson)?.gateNotes),
    summary: item.summary ?? undefined,
    contentJson: parseJson(item.contentJson, {}),
    status: item.status as CandidateOutput['status'],
  })),
  finalReports: [...task.reports]
    .sort((left, right) => right.version - left.version)
    .map((item) => ({
      id: item.id,
      version: item.version,
      reportType: item.reportType as ResearchTaskState['finalReports'][number]['reportType'],
      status: item.status as ResearchTaskState['finalReports'][number]['status'],
      sections: parseJson(item.contentJson, { sections: [] }).sections || [],
    })),
  runStats: {
    startedAt: task.createdAt.toISOString(),
    finishedAt: task.finishedAt?.toISOString(),
    warnings: [],
  },
});

const tierCoverage = (task: ResearchTaskState) => ({
  T1: task.evidencePool.filter((item) => item.tier === 'T1').length,
  T2: task.evidencePool.filter((item) => item.tier === 'T2').length,
  T3: task.evidencePool.filter((item) => item.tier === 'T3').length,
});

const MIN_T1_EVIDENCE_FOR_EVIDENCE_REPORT = 2;

const rqRank: Record<NonNullable<ResearchTaskState['rqLevel']>, number> = {
  RQ0: 0,
  RQ1: 1,
  RQ2: 2,
  RQ3: 3,
};

const badRequest = (message: string): Error & { statusCode: number } => {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  return error;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const getBlockedSources = (task: ResearchTaskState): string[] => {
  const sources = new Set<string>();
  if (task.personaFindings.length > 0) sources.add('persona_generated');
  if (task.visionFindings.length > 0) sources.add('vision_generated');
  return Array.from(sources);
};

const getAcceptedT1EvidenceCount = (task: ResearchTaskState): number =>
  task.evidencePool.filter(
    (item) =>
      item.tier === 'T1' &&
      item.reviewStatus === 'accepted' &&
      item.sourceLevel !== 'simulated' &&
      item.sourceLevel !== 'framework' &&
      item.sourceType !== 'experience_model',
  ).length;

const getAcceptedNonSimulatedEvidenceCount = (
  task: ResearchTaskState,
  tier?: EvidenceItem['tier'],
): number =>
  task.evidencePool.filter(
    (item) =>
      item.reviewStatus === 'accepted' &&
      item.sourceLevel !== 'simulated' &&
      item.sourceLevel !== 'framework' &&
      item.sourceType !== 'experience_model' &&
      (!tier || item.tier === tier),
  ).length;

const deriveRqLevelFromEvidence = (task: ResearchTaskState): NonNullable<ResearchTaskState['rqLevel']> => {
  const acceptedT1 = getAcceptedT1EvidenceCount(task);
  const acceptedT2 = getAcceptedNonSimulatedEvidenceCount(task, 'T2');
  const acceptedAny = getAcceptedNonSimulatedEvidenceCount(task);

  if (acceptedT1 >= MIN_T1_EVIDENCE_FOR_EVIDENCE_REPORT) {
    return 'RQ3';
  }
  if (acceptedT1 >= 1 || acceptedT2 >= 2) {
    return 'RQ2';
  }
  if (acceptedAny >= 1) {
    return 'RQ1';
  }
  return 'RQ0';
};

const evaluateOutputGate = (
  task: ResearchTaskState,
  outputType: CandidateOutput['outputType'],
): { gateLevel: CandidateOutput['gateLevel']; gateNotes: string[] } => {
  const rqLevel = task.rqLevel || 'RQ0';
  const rank = rqRank[rqLevel];
  const acceptedT1Count = getAcceptedT1EvidenceCount(task);
  const gateNotes: string[] = [];

  if (outputType === 'light_report' && rank < rqRank.RQ2) {
    gateNotes.push('轻量报告要求至少达到 RQ2。');
  }

  if (outputType === 'design_review_report' && rank < rqRank.RQ2) {
    gateNotes.push('设计预评估报告要求至少达到 RQ2。');
  }

  if (outputType === 'evidence_report') {
    if (rqLevel !== 'RQ3') {
      gateNotes.push('证据型报告要求达到 RQ3。');
    }
    if (acceptedT1Count < MIN_T1_EVIDENCE_FOR_EVIDENCE_REPORT) {
      gateNotes.push(
        `证据型报告要求至少 ${MIN_T1_EVIDENCE_FOR_EVIDENCE_REPORT} 条已接受的 T1 证据，当前仅 ${acceptedT1Count} 条。`,
      );
    }
  }

  if (outputType === 'hypothesis_pack') {
    gateNotes.push('Persona Sandbox 输出为模拟假设，不得作为 T1 真实证据。');
    return {
      gateLevel: 'review_required',
      gateNotes,
    };
  }

  if (gateNotes.length > 0) {
    return {
      gateLevel: 'blocked_by_rq',
      gateNotes,
    };
  }

  if (outputType === 'design_review_report') {
    return {
      gateLevel: 'review_required',
      gateNotes: ['Vision MoE 结果属于辅助判断，正式发布前仍需人工复核。'],
    };
  }

  if (outputType === 'light_report') {
    return {
      gateLevel: 'review_required',
      gateNotes: ['轻量报告可生成，但正式发布前需要人工审核。'],
    };
  }

  return { gateLevel: 'allowed', gateNotes: [] };
};

const applyOutputGates = (task: ResearchTaskState): ResearchTaskState => ({
  ...task,
  candidateOutputs: task.candidateOutputs.map((item) => {
    const gate = evaluateOutputGate(task, item.outputType);
    return {
      ...item,
      gateLevel: gate.gateLevel,
      gateNotes: gate.gateNotes,
      status:
        gate.gateLevel === 'blocked_by_rq'
          ? 'gated_out'
          : item.status === 'gated_out'
            ? 'generated'
            : item.status,
    };
  }),
});

const getTaskGateWarnings = (task: ResearchTaskState): string[] =>
  task.candidateOutputs
    .filter((item) => item.gateLevel === 'blocked_by_rq')
    .flatMap((item) => item.gateNotes?.map((note) => `${item.outputType}：${note}`) || []);

const getEvidenceReviewWarnings = (task: ResearchTaskState): string[] => {
  const hasReviewedEvidence = task.evidencePool.some((item) => {
    const trace = asRecord(item.traceLocation);
    return Boolean(trace && asRecord(trace.reviewMeta));
  });

  if (!hasReviewedEvidence) return [];
  return [`当前任务已纳入人工复核证据，最新 RQ 为 ${task.rqLevel || 'RQ0'}。`];
};

const getAsyncRecomputeWarnings = (task: ResearchTaskState): string[] => {
  if (task.status === 'running' && task.currentNode === 'judgment_synthesizer') {
    return ['证据复核后的后台重算仍在进行中，请稍候刷新。'];
  }
  return [];
};

const mergeWarnings = (...groups: Array<string[] | undefined>): string[] =>
  Array.from(new Set(groups.flatMap((group) => group || [])));

const getExperienceModelIds = (task: ResearchTaskState): string[] =>
  task.evidencePool
    .filter((item) => item.sourceType === 'experience_model')
    .map((item) => asRecord(item.traceLocation)?.modelId)
    .filter((item): item is string => typeof item === 'string');

const replaceExperienceModelEvidence = (
  task: ResearchTaskState,
  evidenceItems: ResearchTaskState['evidencePool'],
): ResearchTaskState['evidencePool'] => [
  ...task.evidencePool.filter((item) => item.sourceType !== 'experience_model'),
  ...evidenceItems,
];

const computeElapsedSeconds = (
  startedAt?: string,
  finishedAt?: string,
  fallbackLatencyMs?: number,
): number | undefined => {
  if (startedAt) {
    const startTime = new Date(startedAt).getTime();
    const endTime = new Date(finishedAt || new Date().toISOString()).getTime();

    if (Number.isFinite(startTime) && Number.isFinite(endTime) && endTime >= startTime) {
      return Math.max(1, Math.round((endTime - startTime) / 1000));
    }
  }

  if (typeof fallbackLatencyMs === 'number' && Number.isFinite(fallbackLatencyMs)) {
    return Math.max(1, Math.round(fallbackLatencyMs / 1000));
  }

  return undefined;
};

const recomputeTaskJudgment = async (
  task: ResearchTaskState,
  trigger: 'run' | 'evidence_review',
): Promise<ResearchTaskState> => {
  const evidenceRqLevel = deriveRqLevelFromEvidence(task);
  const judgmentResult = await executeJudgmentSynthesizer(task);
  const synthesizedRqLevel =
    rqRank[judgmentResult.rqLevel || 'RQ0'] >= rqRank[evidenceRqLevel]
      ? (judgmentResult.rqLevel || evidenceRqLevel)
      : evidenceRqLevel;

  const nextTask = applyOutputGates({
    ...task,
    currentNode: 'output_router',
    rqLevel: synthesizedRqLevel,
    candidateOutputs: judgmentResult.candidateOutputs,
    runStats: {
      ...task.runStats,
      finishedAt: trigger === 'run' ? task.runStats.finishedAt : new Date().toISOString(),
      warnings: mergeWarnings(
        task.runStats.warnings,
        judgmentResult.warnings,
        judgmentResult.reviewNotes?.length
          ? [`多模型复核：${judgmentResult.reviewNotes.join('；')}`]
          : [],
        trigger === 'evidence_review'
          ? [`证据复核后已重新综合判断，当前 RQ 更新为 ${synthesizedRqLevel}。`]
          : [],
      ),
    },
  });

  return {
    ...nextTask,
    runStats: {
      ...nextTask.runStats,
      warnings: mergeWarnings(nextTask.runStats.warnings, getTaskGateWarnings(nextTask)),
    },
  };
};

const scheduleAsyncTaskRecompute = (task: ResearchTaskState): void => {
  const job = recomputeTaskJudgment(task, 'evidence_review')
    .then(async (nextTask) => {
      if (shouldUseDb()) {
        await persistStateToDb(nextTask);
      } else {
        saveTaskToMemory(nextTask);
      }
    })
    .catch(async (error) => {
      const failedTask: ResearchTaskState = {
        ...task,
        status: 'partial_failed',
        reviewStatus: 'pending',
        currentNode: 'judgment_synthesizer',
        runStats: {
          ...task.runStats,
          finishedAt: new Date().toISOString(),
          warnings: mergeWarnings(
            task.runStats.warnings,
            [`证据复核后的后台重算失败：${error instanceof Error ? error.message : String(error)}`],
          ),
        },
      };

      if (shouldUseDb()) {
        await persistStateToDb(failedTask);
      } else {
        saveTaskToMemory(failedTask);
      }
    })
    .finally(() => {
      recomputeJobs.delete(task.taskId);
    });

  recomputeJobs.set(task.taskId, job);
};

const buildReportSectionsFromOutput = (
  task: ResearchTaskState,
  selected?: CandidateOutput,
): ResearchTaskState['finalReports'][number]['sections'] => {
  const fallbackSections: ResearchTaskState['finalReports'][number]['sections'] = [
    {
      type: 'judgment',
      title: '方向性判断',
      content: '建议先将内容入口定位为交易链路辅助模块，以小范围验证代替首页强前置。',
    },
    {
      type: 'evidence',
      title: '关键证据',
      content: '内部指标显示入口 CTR 下降，行业资料提示内容入口存在链路干扰风险。',
    },
    {
      type: 'gap',
      title: '待验证假设',
      content: '仍需通过真实用户研究确认内容入口是否能提升决策效率。',
    },
  ];

  if (!selected) return fallbackSections;

  const content = asRecord(selected.contentJson);
  const judgments = Array.isArray(content?.judgments)
    ? content.judgments
        .map((item) => asRecord(item))
        .filter(Boolean)
        .map((item, index) => ({
          type: 'judgment',
          title: typeof item?.title === 'string' ? item.title : `判断 ${index + 1}`,
          content:
            typeof item?.content === 'string'
              ? item.content
              : '当前输出未提供详细判断内容。',
        }))
    : [];
  const nextActions = asStringArray(content?.nextActions);
  const evidenceSummary = task.evidencePool
    .slice(0, 3)
    .map((item, index) => `${index + 1}. [${item.tier}/${item.sourceLevel}] ${item.content}`)
    .join('\n');
  const frameworkSummary = task.evidencePool
    .filter((item) => item.sourceType === 'experience_model')
    .map((item, index) => {
      const trace = asRecord(item.traceLocation);
      const questions = asStringArray(trace?.evaluationQuestions);
      return [
        `${index + 1}. ${item.sourceName || '体验模型'}：${item.content}`,
        item.citationText ? `   依据：${item.citationText}` : undefined,
        questions.length ? `   建议追问：${questions.join('；')}` : undefined,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const sections: ResearchTaskState['finalReports'][number]['sections'] = [];

  if (selected.summary) {
    sections.push({
      type: 'summary',
      title: '输出摘要',
      content: selected.summary,
    });
  }

  if (selected.gateNotes?.length) {
    sections.push({
      type: 'gate',
      title: 'Gate 说明',
      content: selected.gateNotes.map((item, index) => `${index + 1}. ${item}`).join('\n'),
    });
  }

  sections.push(...judgments);

  if (evidenceSummary) {
    sections.push({
      type: 'evidence',
      title: '关键证据',
      content: evidenceSummary,
    });
  }

  if (frameworkSummary) {
    sections.push({
      type: 'framework',
      title: '体验模型视角',
      content: frameworkSummary,
    });
  }

  if (nextActions.length > 0) {
    sections.push({
      type: 'action',
      title: '建议动作',
      content: nextActions.map((item, index) => `${index + 1}. ${item}`).join('\n'),
    });
  }

  if (selected.outputType === 'design_review_report' && task.visionFindings.length > 0) {
    sections.push({
      type: 'vision',
      title: '视觉评审重点',
      content: task.visionFindings.map((item) => `- [${item.riskLevel}] ${item.content}`).join('\n'),
    });
  }

  if (selected.outputType === 'hypothesis_pack' && task.personaFindings.length > 0) {
    sections.push({
      type: 'hypothesis',
      title: 'Persona 假设线索',
      content: task.personaFindings.map((item) => `- ${item.personaName}：${item.content}`).join('\n'),
    });
  }

  return sections.length > 0 ? sections : fallbackSections;
};

const buildGateResult = (
  task: ResearchTaskState,
  selected?: CandidateOutput,
): ReportResponse['gateResult'] => ({
  rqLevel: task.rqLevel,
  tierCoverage: tierCoverage(task),
  blockedSources: getBlockedSources(task),
  blockedReasons: selected?.gateNotes || [],
});

const buildReportResponse = (options: {
  id: string;
  version: number;
  reportType: ReportResponse['reportType'];
  status: ReportResponse['status'];
  sections: ReportResponse['sections'];
  gateResult: ReportResponse['gateResult'];
  reviewMeta?: ReportResponse['reviewMeta'];
}): ReportResponse => ({
  id: options.id,
  version: options.version,
  reportType: options.reportType,
  status: options.status,
  sections: options.sections,
  gateResult: options.gateResult,
  reviewMeta: options.reviewMeta,
});

const parseReportResponseFromDb = (
  report: PrismaReport,
  fallbackTask?: ResearchTaskState,
): ReportResponse => {
  const gateResultRaw = parseJson<Record<string, unknown>>(report.gateResult, {});
  const gateResult = {
    rqLevel:
      typeof gateResultRaw.rqLevel === 'string'
        ? (gateResultRaw.rqLevel as ReportResponse['gateResult']['rqLevel'])
        : fallbackTask?.rqLevel,
    tierCoverage:
      asRecord(gateResultRaw.tierCoverage) as ReportResponse['gateResult']['tierCoverage'] | undefined,
    blockedSources: asStringArray(gateResultRaw.blockedSources),
    blockedReasons: asStringArray(gateResultRaw.blockedReasons),
  };

  return buildReportResponse({
    id: report.id,
    version: report.version,
    reportType: report.reportType as ReportResponse['reportType'],
    status: report.status as ReportResponse['status'],
    sections: parseJson(report.contentJson, { sections: [] }).sections || [],
    gateResult: {
      rqLevel: gateResult.rqLevel,
      tierCoverage: gateResult.tierCoverage || { T1: 0, T2: 0, T3: 0 },
      blockedSources: gateResult.blockedSources,
      blockedReasons: gateResult.blockedReasons,
    },
    reviewMeta:
      gateResultRaw.reviewMeta && typeof gateResultRaw.reviewMeta === 'object'
        ? (gateResultRaw.reviewMeta as ReportResponse['reviewMeta'])
        : undefined,
  });
};

const findTaskByReportIdFromMemory = (reportId: string): ResearchTaskState | undefined =>
  Array.from(taskStore.values()).find((task) =>
    task.finalReports.some((report) => report.id === reportId),
  );

const getReportFromMemory = (reportId: string): ReportResponse => {
  const cached = reportStore.get(reportId);
  if (cached) return cached;

  const task = findTaskByReportIdFromMemory(reportId);
  const report = task?.finalReports.find((item) => item.id === reportId);
  if (!task || !report) throw new Error('报告不存在');

  const selectedOutput = task.candidateOutputs.find((item) => item.outputType === report.reportType);
  const response = buildReportResponse({
    id: report.id,
    version: report.version,
    reportType: report.reportType,
    status: report.status,
    sections: report.sections,
    gateResult: buildGateResult(task, selectedOutput),
  });
  reportStore.set(report.id, response);
  return response;
};

const getReportFromDb = async (reportId: string): Promise<ReportResponse> => {
  const prisma = getPrismaClient();
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new Error('报告不存在');
  const task = await getTask(report.taskId);
  const parsed = parseReportResponseFromDb(report, task);
  const selectedOutput = task.candidateOutputs.find((item) => item.outputType === report.reportType);
  return {
    ...parsed,
    gateResult: buildGateResult(task, selectedOutput),
  };
};

const shouldUseDb = (): boolean => appConfig.persistence.enabled;

const getTaskFromMemory = (taskId: string): ResearchTaskState => {
  const task = taskStore.get(taskId);
  if (!task) throw new Error('任务不存在');
  return task;
};

const saveTaskToMemory = (task: ResearchTaskState): ResearchTaskState => {
  taskStore.set(task.taskId, task);
  return task;
};

const loadTaskFromDb = async (taskId: string): Promise<ResearchTaskState> => {
  const prisma = getPrismaClient();
  const task = await prisma.researchTask.findUnique({
    where: { id: taskId },
    include: taskInclude,
  });
  if (!task) throw new Error('任务不存在');
  return toStateFromDb(task as PersistedTask);
};

const persistStateToDb = async (state: ResearchTaskState): Promise<ResearchTaskState> => {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    await tx.researchTask.upsert({
      where: { id: state.taskId },
      update: {
        title: state.title,
        query: state.originalQuery,
        inputType: state.inputType,
        taskMode: state.taskMode,
        status: state.status,
        reviewStatus: state.reviewStatus,
        rqLevel: state.rqLevel ?? null,
        enabledModules: asJson(state.enabledModules),
        currentNode: state.currentNode ?? null,
        finishedAt: state.runStats.finishedAt ? new Date(state.runStats.finishedAt) : null,
        ...(shouldUseDb()
          ? ({
              inputFiles: asJson(state.uploadedFiles),
              designFiles: asJson(state.uploadedDesigns),
            } as any)
          : {}),
      } as any,
      create: {
        id: state.taskId,
        title: state.title,
        query: state.originalQuery,
        inputType: state.inputType,
        taskMode: state.taskMode,
        status: state.status,
        reviewStatus: state.reviewStatus,
        rqLevel: state.rqLevel ?? null,
        enabledModules: asJson(state.enabledModules),
        currentNode: state.currentNode ?? null,
        currentStage: null,
        createdBy: null,
        finishedAt: state.runStats.finishedAt ? new Date(state.runStats.finishedAt) : null,
        ...(shouldUseDb()
          ? ({
              inputFiles: asJson(state.uploadedFiles),
              designFiles: asJson(state.uploadedDesigns),
            } as any)
          : {}),
      } as any,
    });

    await tx.subQuestion.deleteMany({ where: { taskId: state.taskId } });
    if (state.subQuestions.length > 0) {
      await tx.subQuestion.createMany({
        data: state.subQuestions.map((item) => ({
          id: item.id,
          taskId: state.taskId,
          seq: item.seq,
          text: item.text,
          audience: item.audience ?? null,
          scenario: item.scenario ?? null,
          journeyPath: item.journeyPath ?? null,
          decisionPoint: item.decisionPoint ?? null,
          status: item.status,
        })),
      });
    }

    await tx.evidenceItem.deleteMany({ where: { taskId: state.taskId } });
    if (state.evidencePool.length > 0) {
      await tx.evidenceItem.createMany({
        data: state.evidencePool.map((item) => ({
          id: item.id,
          taskId: state.taskId,
          subQuestionId: item.subQuestionId ?? null,
          sourceType: item.sourceType,
          sourceLevel: item.sourceLevel,
          tier: item.tier,
          confidenceScore: item.confidenceScore ?? null,
          sourceName: item.sourceName ?? null,
          sourceUrl: item.sourceUrl ?? null,
          sourceDate: item.sourceDate ? new Date(item.sourceDate) : null,
          traceLocation: item.traceLocation ? asJson(item.traceLocation) : undefined,
          content: item.content,
          citationText: item.citationText ?? null,
          isUsedInReport: item.isUsedInReport,
          reviewStatus: item.reviewStatus,
        })),
      });
    }

    await tx.evidenceConflict.deleteMany({ where: { taskId: state.taskId } });
    if (state.evidenceConflicts.length > 0) {
      await tx.evidenceConflict.createMany({
        data: state.evidenceConflicts.map((item) => ({
          id: item.id,
          taskId: state.taskId,
          topic: item.topic,
          evidenceAId: item.evidenceAId,
          evidenceBId: item.evidenceBId,
          conflictReason: item.conflictReason,
          status: item.status,
        })),
      });
    }

    await tx.visionFinding.deleteMany({ where: { taskId: state.taskId } });
    if (state.visionFindings.length > 0) {
      await tx.visionFinding.createMany({
        data: state.visionFindings.map((item) => ({
          id: item.id,
          taskId: state.taskId,
          findingType: item.findingType,
          riskLevel: item.riskLevel,
          content: item.content,
          regionRef: item.regionRef ? asJson(item.regionRef) : undefined,
          consensusGroupId: null,
          isConsensus: item.isConsensus ?? false,
          isConflict: item.isConflict ?? false,
        })),
      });
    }

    await tx.personaFinding.deleteMany({ where: { taskId: state.taskId } });
    if (state.personaFindings.length > 0) {
      await tx.personaFinding.createMany({
        data: state.personaFindings.map((item) => ({
          id: item.id,
          taskId: state.taskId,
          personaName: item.personaName,
          stance: item.stance ?? null,
          theme: item.theme ?? null,
          content: item.content,
          isSimulated: item.isSimulated,
        })),
      });
    }

    await tx.candidateOutput.deleteMany({ where: { taskId: state.taskId } });
    if (state.candidateOutputs.length > 0) {
      await tx.candidateOutput.createMany({
        data: state.candidateOutputs.map((item) => ({
          id: item.id,
          taskId: state.taskId,
          outputType: item.outputType,
          sourceNode: item.sourceNode,
          gateLevel: item.gateLevel ?? null,
          summary: item.summary ?? null,
          contentJson: asJson({
            ...item.contentJson,
            ...(item.gateNotes?.length ? { gateNotes: item.gateNotes } : {}),
          }),
          status: item.status,
        })),
      });
    }

    if (state.finalReports.length > 0) {
      for (const item of state.finalReports) {
        await tx.report.upsert({
          where: { id: item.id },
          update: {
            reportType: item.reportType,
            version: item.version,
            gateResult: asJson(
              buildGateResult(
                state,
                state.candidateOutputs.find((output) => output.outputType === item.reportType),
              ),
            ),
            contentJson: asJson({ sections: item.sections }),
            status: item.status,
          },
          create: {
            id: item.id,
            taskId: state.taskId,
            reportType: item.reportType,
            version: item.version,
            gateResult: asJson(
              buildGateResult(
                state,
                state.candidateOutputs.find((output) => output.outputType === item.reportType),
              ),
            ),
            contentJson: asJson({ sections: item.sections }),
            markdownContent: null,
            htmlContent: null,
            status: item.status,
            approvedBy: null,
            approvedAt: null,
          },
        });
      }
    }
  });

  return loadTaskFromDb(state.taskId);
};

export const createTask = async (payload: CreateTaskRequest): Promise<ResearchTaskState> => {
  const taskId = `task_${Math.random().toString(36).slice(2, 10)}`;
  const task: ResearchTaskState = {
    taskId,
    title: payload.title,
    originalQuery: payload.query,
    inputType: payload.inputType,
    taskMode: payload.taskMode,
    uploadedFiles: (payload.attachments || []).map((item, index) => ({
      id: item.fileId,
      fileName: item.fileName || `attachment-${index + 1}`,
      category: 'input',
      fileType: item.fileType || 'document',
      ossKey: item.ossKey,
      sourceUrl: item.sourceUrl,
      mimeType: item.mimeType,
    })),
    uploadedDesigns: (payload.designFiles || []).map((item, index) => ({
      id: item.fileId,
      fileName: item.fileName || `design-${index + 1}`,
      category: 'input',
      fileType: item.fileType || 'design',
      ossKey: item.ossKey,
      sourceUrl: item.sourceUrl,
      mimeType: item.mimeType,
    })),
    enabledModules: payload.enabledModules,
    status: 'draft',
    reviewStatus: 'not_required',
    currentNode: 'input_router',
    subQuestions: [],
    evidencePool: [],
    evidenceConflicts: [],
    visionFindings: [],
    personaFindings: [],
    candidateOutputs: [],
    finalReports: [],
    runStats: { warnings: [] },
  };

  return shouldUseDb() ? persistStateToDb(task) : saveTaskToMemory(task);
};

export const getTask = async (taskId: string): Promise<ResearchTaskState> => {
  const task = shouldUseDb() ? await loadTaskFromDb(taskId) : getTaskFromMemory(taskId);
  return applyOutputGates(task);
};

export const previewPlan = async (taskId: string): Promise<PreviewPlanResponse> => {
  const task = await getTask(taskId);
  const branches = [
    'problem_decomposer',
    'experience_model_router',
    'evidence_alignment',
    'judgment_synthesizer',
  ];
  if (task.enabledModules.visionMoE) branches.push('vision_moe');
  if (task.enabledModules.personaSandbox) branches.push('persona_sandbox');
  if (task.enabledModules.externalSearch) branches.push('external_search');

  return {
    taskId,
    predictedPlan: {
      subQuestionCount: 4,
      branches,
      estimatedLatencySeconds: branches.length * 12,
      estimatedCostLevel: task.enabledModules.multiModelReview ? 'high' : 'medium',
      reviewRequired: true,
    },
  };
};

export const runTask = async (taskId: string): Promise<ResearchTaskState> => {
  const task = await getTask(taskId);
  const runningTask: ResearchTaskState = {
    ...task,
    status: 'running',
    reviewStatus: 'pending',
    currentNode: 'problem_decomposer',
    runStats: {
      ...task.runStats,
      startedAt: new Date().toISOString(),
      warnings: [...task.runStats.warnings],
    },
  };

  const taskAfterStart = shouldUseDb() ? await persistStateToDb(runningTask) : saveTaskToMemory(runningTask);
  const completedTask = await enrichTaskForRun(taskAfterStart);
  const gatedCompletedTask = await recomputeTaskJudgment(completedTask, 'run');
  return shouldUseDb() ? persistStateToDb(gatedCompletedTask) : saveTaskToMemory(gatedCompletedTask);
};

export const enqueueTaskRun = (taskId: string): Promise<ResearchTaskState> => {
  const existingJob = taskRunJobs.get(taskId);
  if (existingJob) {
    return existingJob;
  }

  const job = runTask(taskId).finally(() => {
    taskRunJobs.delete(taskId);
  });

  taskRunJobs.set(taskId, job);
  return job;
};

export const getTaskSummary = async (taskId: string): Promise<TaskSummaryResponse> => {
  const task = await getTask(taskId);
  return {
    taskId: task.taskId,
    title: task.title,
    query: task.originalQuery,
    inputType: task.inputType,
    taskMode: task.taskMode,
    status: task.status,
    reviewStatus: task.reviewStatus,
    rqLevel: task.rqLevel,
    currentNode: task.currentNode,
    enabledModules: task.enabledModules,
    stats: {
      elapsedSeconds: computeElapsedSeconds(
        task.runStats.startedAt,
        task.runStats.finishedAt,
        task.runStats.latencyMs,
      ),
      costEstimate: task.runStats.costEstimate,
      warnings: Array.from(
        new Set([
          ...task.runStats.warnings,
          ...getAsyncRecomputeWarnings(task),
          ...getEvidenceReviewWarnings(task),
          ...getTaskGateWarnings(task),
        ]),
      ),
    },
  };
};

export const getEvidence = async (taskId: string): Promise<EvidenceListResponse> => {
  const task = await getTask(taskId);
  return {
    items: task.evidencePool,
    summary: {
      total: task.evidencePool.length,
      tier1: task.evidencePool.filter((item) => item.tier === 'T1').length,
      tier2: task.evidencePool.filter((item) => item.tier === 'T2').length,
      tier3: task.evidencePool.filter((item) => item.tier === 'T3').length,
      conflictCount: task.evidenceConflicts.length,
    },
  };
};

const findTaskByEvidenceIdFromMemory = (
  evidenceId: string,
): { task: ResearchTaskState; evidence: EvidenceItem } | undefined => {
  for (const task of taskStore.values()) {
    const evidence = task.evidencePool.find((item) => item.id === evidenceId);
    if (evidence) {
      return { task, evidence };
    }
  }
  return undefined;
};

const getNextTierForDowngrade = (tier: EvidenceItem['tier']): EvidenceItem['tier'] =>
  tier === 'T1' ? 'T2' : 'T3';

const normalizeReviewedEvidence = (
  evidence: EvidenceItem,
  payload: ReviewEvidenceRequest,
): EvidenceItem => {
  const nextTier =
    payload.tier ??
    (payload.reviewStatus === 'downgraded'
      ? getNextTierForDowngrade(evidence.tier)
      : evidence.tier);

  if (
    nextTier === 'T1' &&
    (evidence.sourceLevel === 'simulated' ||
      evidence.sourceLevel === 'framework' ||
      evidence.sourceType === 'experience_model' ||
      evidence.sourceType === 'persona_generated' ||
      evidence.sourceType === 'vision_generated')
  ) {
    throw badRequest('模拟证据、体验模型框架证据（Vision / Persona / Experience Model）不能提升为 T1。');
  }

  return {
    ...evidence,
    tier: nextTier,
    reviewStatus: payload.reviewStatus,
    isUsedInReport:
      payload.reviewStatus === 'rejected'
        ? false
        : payload.isUsedInReport ?? evidence.isUsedInReport,
    traceLocation: {
      ...(evidence.traceLocation || {}),
      reviewMeta: {
        reviewer: payload.reviewer,
        comment: payload.comment,
        reviewedAt: new Date().toISOString(),
      },
    },
  };
};

const getEvidenceReviewedAt = (evidence: EvidenceItem): string =>
  (((evidence.traceLocation as Record<string, unknown> | undefined)?.reviewMeta as
    | Record<string, unknown>
    | undefined)?.reviewedAt as string) || new Date().toISOString();

export const reviewEvidence = async (
  evidenceId: string,
  payload: ReviewEvidenceRequest,
): Promise<ReviewEvidenceResponse> => {
  if (shouldUseDb()) {
    const prisma = getPrismaClient();
    const persistedEvidence = await prisma.evidenceItem.findUnique({ where: { id: evidenceId } });
    if (!persistedEvidence) throw new Error('证据不存在');

    const task = await getTask(persistedEvidence.taskId);
    const targetEvidence = task.evidencePool.find((item) => item.id === evidenceId);
    if (!targetEvidence) throw new Error('证据不存在');
    if (
      recomputeJobs.has(task.taskId) ||
      (task.status === 'running' && task.currentNode === 'judgment_synthesizer')
    ) {
      throw badRequest('当前已有后台重算进行中，请稍候再提交新的证据复核。');
    }

    const reviewedEvidence = normalizeReviewedEvidence(targetEvidence, payload);
    const reviewedTask: ResearchTaskState = {
      ...task,
      evidencePool: task.evidencePool.map((item) => (item.id === evidenceId ? reviewedEvidence : item)),
      status: 'running',
      reviewStatus: 'pending',
      currentNode: 'judgment_synthesizer',
      runStats: {
        ...task.runStats,
        warnings: mergeWarnings(task.runStats.warnings, ['证据复核已提交，后台正在重算综合判断。']),
      },
    };
    await persistStateToDb(reviewedTask);
    scheduleAsyncTaskRecompute(reviewedTask);

    return {
      taskId: reviewedTask.taskId,
      evidence: reviewedEvidence,
      updatedAt: getEvidenceReviewedAt(reviewedEvidence),
      recomputeStatus: 'queued',
      taskStatus: reviewedTask.status,
      currentNode: reviewedTask.currentNode,
    };
  }

  const matched = findTaskByEvidenceIdFromMemory(evidenceId);
  if (!matched) throw new Error('证据不存在');
  if (
    recomputeJobs.has(matched.task.taskId) ||
    (matched.task.status === 'running' && matched.task.currentNode === 'judgment_synthesizer')
  ) {
    throw badRequest('当前已有后台重算进行中，请稍候再提交新的证据复核。');
  }

  const reviewedEvidence = normalizeReviewedEvidence(matched.evidence, payload);
  const reviewedTask: ResearchTaskState = {
    ...matched.task,
    evidencePool: matched.task.evidencePool.map((item) =>
      item.id === evidenceId ? reviewedEvidence : item,
    ),
    status: 'running',
    reviewStatus: 'pending',
    currentNode: 'judgment_synthesizer',
    runStats: {
      ...matched.task.runStats,
      warnings: mergeWarnings(matched.task.runStats.warnings, ['证据复核已提交，后台正在重算综合判断。']),
    },
  };
  saveTaskToMemory(reviewedTask);
  scheduleAsyncTaskRecompute(reviewedTask);

  return {
    taskId: reviewedTask.taskId,
    evidence: reviewedEvidence,
    updatedAt: getEvidenceReviewedAt(reviewedEvidence),
    recomputeStatus: 'queued',
    taskStatus: reviewedTask.status,
    currentNode: reviewedTask.currentNode,
  };
};

export const getVision = async (taskId: string): Promise<VisionResponse> => {
  const task = await getTask(taskId);
  const parseVisionLine = (
    raw: string,
  ): VisionResponse['conflicts'][number]['items'][number] => {
    const match = raw.match(/^(.+?)[：:]\s*(.+)$/);
    if (!match) return { model: 'Vision Reviewer', content: raw };
    return { model: match[1], content: match[2] };
  };

  const getVisionConflictItem = (
    finding: ResearchTaskState['visionFindings'][number],
  ): VisionResponse['conflicts'][number]['items'][number] => {
    const parsed = parseVisionLine(finding.content);
    const meta = asRecord(finding.regionRef);

    return {
      model:
        (typeof meta?.reviewerLabel === 'string' ? meta.reviewerLabel : undefined) || parsed.model,
      content: parsed.content,
      requestedModel: typeof meta?.requestedModel === 'string' ? meta.requestedModel : undefined,
      actualModel: typeof meta?.actualModel === 'string' ? meta.actualModel : undefined,
      attemptedModels: asStringArray(meta?.attemptedModels),
      warnings: asStringArray(meta?.warnings),
    };
  };

  const conflictGroups = task.visionFindings
    .filter((item) => item.isConflict)
    .reduce<Record<string, VisionResponse['conflicts'][number]['items']>>((acc, item) => {
      const key = item.findingType;
      acc[key] = acc[key] || [];
      acc[key].push(getVisionConflictItem(item));
      return acc;
    }, {});

  const modelNames = Array.from(
    new Set(
      task.visionFindings.flatMap((item) => {
        const meta = asRecord(item.regionRef);
        const actualModels = asStringArray(meta?.actualModels);
        if (actualModels.length > 0) return actualModels;

        const actualModel = typeof meta?.actualModel === 'string' ? meta.actualModel : undefined;
        if (actualModel) return [actualModel];

        const parsed = item.isConflict ? getVisionConflictItem(item) : parseVisionLine(item.content);
        return parsed.model ? [parsed.model] : [];
      }),
    ),
  );

  return {
    summary: {
      models:
        modelNames.length
          ? modelNames
          : ['GPT 5.2', 'Gemini-3.1-Pro-Preview', 'Claude-Opus-4.6'],
      consensusCount: task.visionFindings.filter((item) => item.isConsensus).length,
      conflictCount: task.visionFindings.filter((item) => item.isConflict).length,
    },
    consensus: task.visionFindings.filter((item) => item.isConsensus),
    conflicts: Object.entries(conflictGroups).map(([topic, items]) => ({ topic, items })),
  };
};

export const getPersona = async (taskId: string): Promise<PersonaResponse> => {
  const task = await getTask(taskId);
  const grouped = task.personaFindings.reduce<Record<string, typeof task.personaFindings>>((acc, item) => {
    const key = item.theme || '未分类';
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});

  return {
    summary: {
      personaCount: task.personaFindings.length,
      clusterCount: Object.keys(grouped).length,
      simulated: true,
    },
    clusters: Object.entries(grouped).map(([theme, items], index) => ({
      id: `cluster_${index + 1}`,
      theme,
      items,
    })),
    notice: '以下内容为 Persona Sandbox 模拟生成，仅用于假设发散与风险识别，不代表真实用户证据。',
  };
};

export const getOutputs = async (taskId: string): Promise<OutputsResponse> => {
  const task = await getTask(taskId);
  return {
    rqLevel: task.rqLevel,
    candidateOutputs: task.candidateOutputs,
  };
};

export const overrideExperienceModels = async (options: {
  taskId: string;
  mode?: 'auto' | 'manual';
  modelIds?: string[];
}): Promise<{
  taskId: string;
  mode: 'auto' | 'manual';
  selectedModelIds: string[];
  task: TaskSummaryResponse;
  state: ResearchTaskState;
}> => {
  const task = await getTask(options.taskId);
  const mode = options.mode === 'manual' ? 'manual' : 'auto';
  const nextModelIds = mode === 'manual' ? options.modelIds || [] : undefined;
  const frameworkResult = await analyzeExperienceModels(task, nextModelIds);
  const selectedModelIds = frameworkResult.evidenceItems
    .map((item) => asRecord(item.traceLocation)?.modelId)
    .filter((item): item is string => typeof item === 'string');

  const updatedTask: ResearchTaskState = {
    ...task,
    status: 'running',
    reviewStatus: 'pending',
    currentNode: 'judgment_synthesizer',
    evidencePool: replaceExperienceModelEvidence(task, frameworkResult.evidenceItems),
    runStats: {
      ...task.runStats,
      warnings: mergeWarnings(
        task.runStats.warnings,
        frameworkResult.warnings,
        [
          mode === 'manual'
            ? `已手动覆盖体验模型：${selectedModelIds.join('、') || '未选择模型'}`
            : '已恢复为自动推荐体验模型。',
        ],
      ),
    },
  };

  const recomputedTask = await recomputeTaskJudgment(updatedTask, 'evidence_review');
  const nextState = shouldUseDb()
    ? await persistStateToDb(recomputedTask)
    : saveTaskToMemory(recomputedTask);

  return {
    taskId: nextState.taskId,
    mode,
    selectedModelIds: getExperienceModelIds(nextState),
    task: await getTaskSummary(nextState.taskId),
    state: nextState,
  };
};

export const generateReport = async (
  taskId: string,
  candidateOutputId?: string,
): Promise<ReportResponse> => {
  const task = await getTask(taskId);
  const selected: CandidateOutput | undefined = candidateOutputId
    ? task.candidateOutputs.find((item) => item.id === candidateOutputId)
    : task.candidateOutputs[0];

  if (!selected) {
    throw badRequest('未找到对应的候选输出。');
  }

  const nextVersion =
    task.finalReports.reduce((max, item) => Math.max(max, item.version), 0) + 1;
  const reportType = selected.outputType;
  const report = buildReportResponse({
    id: `report_${Math.random().toString(36).slice(2, 10)}`,
    version: nextVersion,
    reportType,
    status: 'pending_review',
    sections: buildReportSectionsFromOutput(task, selected),
    gateResult: buildGateResult(task, selected),
  });

  const nextState: ResearchTaskState = {
    ...task,
    status: 'awaiting_review',
    reviewStatus: 'pending',
    finalReports: [
      {
        id: report.id,
        version: report.version,
        reportType: report.reportType,
        status: report.status,
        sections: report.sections,
      },
      ...task.finalReports,
    ],
  };

  if (shouldUseDb()) {
    await persistStateToDb(nextState);
  } else {
    saveTaskToMemory(nextState);
    reportStore.set(report.id, report);
  }

  return report;
};

export const getReport = async (reportId: string): Promise<ReportResponse> =>
  shouldUseDb() ? getReportFromDb(reportId) : getReportFromMemory(reportId);

export const reviewReport = async (
  reportId: string,
  payload: ReviewReportRequest,
): Promise<ReviewReportResponse> => {
  const reviewMeta: NonNullable<ReportResponse['reviewMeta']> = {
    action: payload.action,
    reviewedAt: new Date().toISOString(),
    reviewer: payload.reviewer,
    comment: payload.comment,
  };

  if (shouldUseDb()) {
    const prisma = getPrismaClient();
    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new Error('报告不存在');

    const task = await getTask(report.taskId);
    const gateResultRaw = parseJson<Record<string, unknown>>(report.gateResult, {});
    const selectedOutput = task.candidateOutputs.find((item) => item.outputType === report.reportType);
    const nextGateResult = buildGateResult(task, selectedOutput);
    if (payload.action === 'approve' && nextGateResult.blockedReasons?.length) {
      throw badRequest(`当前报告不满足发布门禁：${nextGateResult.blockedReasons.join('；')}`);
    }
    const nextTaskStatus = payload.action === 'approve' ? 'completed' : 'awaiting_review';
    const nextReviewStatus = payload.action === 'approve' ? 'approved' : 'rework_required';
    const nextReportStatus = payload.action === 'approve' ? 'approved' : 'rejected';

    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: nextReportStatus,
        approvedBy: payload.reviewer ?? null,
        approvedAt: new Date(reviewMeta.reviewedAt),
        gateResult: asJson({
          ...gateResultRaw,
          ...nextGateResult,
          reviewMeta,
        }),
      },
    });

    const nextState: ResearchTaskState = {
      ...task,
      status: nextTaskStatus,
      reviewStatus: nextReviewStatus,
      finalReports: task.finalReports.map((item) =>
        item.id === reportId ? { ...item, status: nextReportStatus } : item,
      ),
    };
    await persistStateToDb(nextState);

    return {
      report: await getReportFromDb(reportId),
      task: {
        taskId: nextState.taskId,
        status: nextState.status,
        reviewStatus: nextState.reviewStatus,
      },
    };
  }

  const task = findTaskByReportIdFromMemory(reportId);
  if (!task) throw new Error('报告不存在');

  const cachedReport = getReportFromMemory(reportId);
  if (payload.action === 'approve' && cachedReport.gateResult.blockedReasons?.length) {
    throw badRequest(`当前报告不满足发布门禁：${cachedReport.gateResult.blockedReasons.join('；')}`);
  }
  const nextTaskStatus = payload.action === 'approve' ? 'completed' : 'awaiting_review';
  const nextReviewStatus = payload.action === 'approve' ? 'approved' : 'rework_required';
  const nextReportStatus = payload.action === 'approve' ? 'approved' : 'rejected';
  const nextReport = buildReportResponse({
    ...cachedReport,
    status: nextReportStatus,
    reviewMeta,
  });

  const nextState: ResearchTaskState = {
    ...task,
    status: nextTaskStatus,
    reviewStatus: nextReviewStatus,
    finalReports: task.finalReports.map((item) =>
      item.id === reportId ? { ...item, status: nextReportStatus } : item,
    ),
  };

  saveTaskToMemory(nextState);
  reportStore.set(reportId, nextReport);

  return {
    report: nextReport,
    task: {
      taskId: nextState.taskId,
      status: nextState.status,
      reviewStatus: nextState.reviewStatus,
    },
  };
};
