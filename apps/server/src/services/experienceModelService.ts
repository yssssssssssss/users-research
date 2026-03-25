import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AnalysisPlan, EvidenceItem, ExperienceModelEvaluation, ExperienceModelResult, ResearchTaskState } from '@users-research/shared';
import { modelGateway } from './modelGateway.js';
import { buildExperienceModelPrompt } from '../prompts/experienceModel.js';


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

const buildArtifactSummary = (
  task: Pick<ResearchTaskState, 'title' | 'originalQuery' | 'inputType' | 'uploadedDesigns'>,
): string => {
  const designNames = task.uploadedDesigns.map((item) => item.fileName).filter(Boolean).slice(0, 3);
  return [
    task.title ? `任务标题：${task.title}` : undefined,
    `用户问题：${task.originalQuery}`,
    `输入类型：${task.inputType}`,
    designNames.length ? `设计文件：${designNames.join('、')}` : undefined,
  ]
    .filter(Boolean)
    .join('；');
};

interface ExperienceModelEvaluationPayload {
  modelId?: string;
  modelName?: string;
  suitability?: string;
  limitations?: string[];
  dimensions?: Array<{
    name?: string;
    score?: number;
    observation?: string;
    rationale?: string;
    suggestion?: string;
  }>;
  overallScore?: number;
  strengths?: string[];
  risks?: string[];
  topPriorityFix?: string;
  followupQuestions?: string[];
  evidenceBoundary?: string;
}

interface ExperienceModelProfile {
  id: string;
  name: string;
  filename: string;
  summary: string;
  core: string;
  useCase: string;
  dimensions: string[];
  questionPrompts: string[];
  metricPrompts: string[];
  keywords: string[];
}

interface RoutedModel extends ExperienceModelProfile {
  score: number;
  reasons: string[];
}

const EXPERIENCE_MODEL_DIR = resolve(process.cwd(), '体验评估模型');
const EXPERIENCE_MODEL_CACHE_DIR = resolve(
  process.cwd(),
  'tmp',
  'pdf_extracts',
  'experience_models',
);
const EXPERIENCE_MODEL_INDEX_FILE = '整体总结-体验模型.pdf';

const EXPERIENCE_MODEL_PROFILES: ExperienceModelProfile[] = [
  {
    id: 'heart_gsm',
    name: 'HEART + GSM',
    filename: 'HEART+GSM模型.pdf',
    summary: '适合把抽象体验目标拆成结构化维度、信号和指标。',
    core: '从满意度、参与度、采纳、留存、任务成功切入，并补充可度量指标。',
    useCase: '适合数字产品、网站、任务成功与体验指标并重的评估。',
    dimensions: ['满意度', '参与度', '采纳度', '留存率', '任务成功率'],
    questionPrompts: [
      '内容种草区会提升哪些体验目标，压低哪些体验目标？',
      '哪些现象可以作为体验变化的先行信号？',
    ],
    metricPrompts: ['CTR', '停留时长', '任务完成率', '转化率', '留存表现'],
    keywords: ['体验', '指标', '留存', '任务成功', '参与', '满意', '转化', '首页'],
  },
  {
    id: 'jtbd',
    name: 'JTBD',
    filename: 'Jobs_to_be_Done_Framework模型.pdf',
    summary: '关注用户究竟想完成什么任务，以及产品是否帮助他更高效完成。',
    core: '从功能性、情感性、社会性任务理解用户采用与放弃原因。',
    useCase: '适合需求分析、场景定位、任务路径拆解。',
    dimensions: ['核心任务', '任务动机', '场景约束', '替代方案'],
    questionPrompts: [
      '用户来首页想优先完成的任务是什么？',
      '内容种草区是在帮助完成任务，还是制造额外步骤？',
    ],
    metricPrompts: ['首屏点击路径', '到达核心商品的步数', '任务完成率'],
    keywords: ['任务', '场景', '决策', '为什么', '首页', '路径', '目标'],
  },
  {
    id: 'cognitive_load',
    name: '认知负荷理论',
    filename: 'Cognitive_Load_Theory模型.pdf',
    summary: '适合识别信息量、复杂度和界面组织是否给用户带来额外负担。',
    core: '区分内在负荷、外在负荷与相关负荷，尽量降低无效负担。',
    useCase: '适合设计评审、复杂流程、信息密度较高的页面。',
    dimensions: ['信息密度', '理解成本', '路径摩擦', '无效干扰'],
    questionPrompts: [
      '首页是否因为新增内容模块而增加理解成本？',
      '哪些信息是帮助决策的，哪些信息只是噪音？',
    ],
    metricPrompts: ['页面停顿时长', '误点率', '跳失率', '首屏滚动比例'],
    keywords: ['认知', '负担', '复杂', '理解', '信息', '首屏', '视觉', '设计'],
  },
  {
    id: 'attrakdiff',
    name: 'AttrakDiff',
    filename: 'AttrakDiff模型.pdf',
    summary: '适合同时考察实用性、享乐性与整体吸引力的平衡。',
    core: '平衡 Pragmatic Quality 与 Hedonic Quality，避免只有好看但不好用。',
    useCase: '适合界面体验、设计吸引力和品牌感并重的方案。',
    dimensions: ['实用性', '享乐性', '整体吸引力'],
    questionPrompts: [
      '内容种草区带来的吸引力，是否以牺牲实用效率为代价？',
      '当前方案更偏功能导向还是情感导向？',
    ],
    metricPrompts: ['主链路完成率', '模块点击率', '好感度反馈'],
    keywords: ['设计', '吸引力', '美学', '体验', '视觉', '品牌'],
  },
  {
    id: 'fogg',
    name: 'Fogg Behavior Model',
    filename: 'Fogg_Behavior_Model模型.pdf',
    summary: '适合分析用户是否具备足够动机、能力与触发去完成某个动作。',
    core: '行为发生取决于动机、能力、触发的同时满足。',
    useCase: '适合转化、引导、行动触发类问题。',
    dimensions: ['动机', '能力', '触发'],
    questionPrompts: [
      '内容模块是在增强触发，还是在稀释原有行动触发？',
      '用户是否能快速理解下一步行动？',
    ],
    metricPrompts: ['CTA 点击率', '入口触发率', '点击后转化率'],
    keywords: ['转化', '点击', '触发', '行为', '行动', '引导'],
  },
  {
    id: 'ues',
    name: 'UES',
    filename: 'UES模型.pdf',
    summary: '适合评估用户参与度、沉浸感与情感投入。',
    core: '关注专注、感知控制、美学吸引力与奖励感。',
    useCase: '适合内容消费、互动体验、沉浸感评估。',
    dimensions: ['专注', '控制感', '美学吸引力', '奖励感'],
    questionPrompts: [
      '内容种草区是否真正提升用户参与，而不只是增加停留噪音？',
      '用户在浏览内容时是否感到可控而非迷失？',
    ],
    metricPrompts: ['停留时长', '互动深度', '回访率'],
    keywords: ['内容', '参与', '沉浸', '互动', '停留', '浏览'],
  },
  {
    id: 'sus',
    name: 'SUS',
    filename: 'SUS模型.pdf',
    summary: '适合快速量化系统可用性。',
    core: '用简洁问卷判断系统是否易学、易用、易理解。',
    useCase: '适合版本对比、可用性基线、交互易用性验证。',
    dimensions: ['易学性', '易用性', '一致性', '信心感'],
    questionPrompts: [
      '新增内容区是否会损害首页的整体易用性？',
      '用户是否还能快速理解页面结构？',
    ],
    metricPrompts: ['SUS 分数', '任务成功率', '错误率'],
    keywords: ['可用性', '易用', '界面', '操作', '学习'],
  },
  {
    id: 'kano',
    name: 'Kano',
    filename: 'Kano_模型.pdf',
    summary: '适合判断某功能属于基本需求、性能需求还是兴奋需求。',
    core: '帮助判断功能优先级与满意度杠杆。',
    useCase: '适合功能优先级、需求取舍、路线图判断。',
    dimensions: ['基本需求', '性能需求', '兴奋需求'],
    questionPrompts: [
      '内容种草区是用户必须要有的，还是锦上添花的兴奋项？',
      '不做这个模块会不会明显伤害用户满意度？',
    ],
    metricPrompts: ['功能偏好分布', '满意度变化', '需求强度'],
    keywords: ['需求', '优先级', '功能', '满意', '路线图'],
  },
  {
    id: 'tam',
    name: 'TAM',
    filename: 'TAM模型.pdf',
    summary: '适合评估用户是否会接受新的技术或交互机制。',
    core: '重点看感知有用性与感知易用性。',
    useCase: '适合新功能采纳、产品改版接受度、技术引入。',
    dimensions: ['感知有用性', '感知易用性'],
    questionPrompts: [
      '用户会觉得内容种草区有用吗？',
      '用户会不会因为理解成本而拒绝使用该模块？',
    ],
    metricPrompts: ['功能采纳率', '首次使用率', '放弃率'],
    keywords: ['采纳', '接受', '新功能', '有用', '易用'],
  },
];

const getProfilesByIds = (modelIds: string[]): ExperienceModelProfile[] => {
  const wanted = new Set(modelIds);
  return EXPERIENCE_MODEL_PROFILES.filter((profile) => wanted.has(profile.id));
};

const selectProfiles = (
  task: Pick<
    ResearchTaskState,
    'title' | 'originalQuery' | 'taskMode' | 'inputType' | 'uploadedDesigns'
  >,
  preferredModelIds?: string[],
): RoutedModel[] => {
  if (preferredModelIds?.length) {
    return getProfilesByIds(preferredModelIds).map((profile) => ({
      ...profile,
      score: 999,
      reasons: ['用户手动指定该体验模型'],
    }));
  }

  const selectedModels = EXPERIENCE_MODEL_PROFILES.map((profile) => scoreModel(profile, task))
    .filter((profile) => profile.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  if (selectedModels.length) return selectedModels;

  return EXPERIENCE_MODEL_PROFILES.filter((profile) => ['heart_gsm', 'jtbd'].includes(profile.id)).map(
    (profile) => ({ ...profile, score: 1, reasons: ['默认通用体验框架'] }),
  );
};

const normalizeText = (text: string): string =>
  text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const trimSnippet = (text: string, max = 120): string => {
  const normalized = normalizeText(text).replace(/\n/g, ' ');
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trim()}…`;
};

const buildTaskFingerprint = (task: Pick<ResearchTaskState, 'title' | 'originalQuery'>): string => {
  const raw = `${task.title || ''}::${task.originalQuery}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

const getCachePath = (filename: string): string =>
  resolve(
    EXPERIENCE_MODEL_CACHE_DIR,
    filename.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_') + '.txt',
  );

const extractPdfTextViaPython = (pdfPath: string): string | undefined => {
  const script = `
from pypdf import PdfReader
import sys
reader = PdfReader(sys.argv[1])
parts = []
for page in reader.pages:
    try:
        parts.append(page.extract_text() or '')
    except Exception:
        parts.append('')
print("\\n\\n".join(parts))
`.trim();

  const candidates: Array<{ command: string; args: string[] }> = [
    { command: 'python', args: ['-c', script, pdfPath] },
    { command: 'python3', args: ['-c', script, pdfPath] },
    { command: 'py', args: ['-3', '-c', script, pdfPath] },
  ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, {
      encoding: 'utf-8',
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
    });

    if (result.status === 0 && typeof result.stdout === 'string' && result.stdout.trim()) {
      return normalizeText(result.stdout);
    }
  }

  return undefined;
};

const readPdfText = (filename: string): { text: string; fromPdf: boolean } => {
  const cachePath = getCachePath(filename);
  if (existsSync(cachePath)) {
    return {
      text: normalizeText(readFileSync(cachePath, 'utf-8')),
      fromPdf: true,
    };
  }

  const pdfPath = resolve(EXPERIENCE_MODEL_DIR, filename);
  if (!existsSync(pdfPath)) {
    return { text: '', fromPdf: false };
  }

  const extracted = extractPdfTextViaPython(pdfPath);
  if (!extracted) {
    return { text: '', fromPdf: false };
  }

  mkdirSync(EXPERIENCE_MODEL_CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, extracted, 'utf-8');
  return { text: extracted, fromPdf: true };
};

const extractSection = (text: string, label: string): string | undefined => {
  const markers = [`${label}：`, `${label}:`];
  const normalized = normalizeText(text);
  for (const marker of markers) {
    const start = normalized.indexOf(marker);
    if (start < 0) continue;
    const after = normalized.slice(start + marker.length);
    const nextMarkerIndex = ['总结：', '总结:', '核心：', '核心:', '使用场景：', '使用场景:', '适用场景：', '适用场景:']
      .map((item) => after.indexOf(item))
      .filter((index) => index > 0)
      .sort((left, right) => left - right)[0];
    return trimSnippet(nextMarkerIndex ? after.slice(0, nextMarkerIndex) : after, 160);
  }
  return undefined;
};

const inferTaskFocus = (task: Pick<ResearchTaskState, 'taskMode' | 'inputType' | 'uploadedDesigns' | 'originalQuery'>): string[] => {
  const focus: string[] = [];

  if (task.taskMode === 'design_review' || task.uploadedDesigns.length > 0 || task.inputType !== 'text') {
    focus.push('设计评审');
  }
  if (/转化|点击|下单|购买|触达|激活|留存|增长/.test(task.originalQuery)) {
    focus.push('行为转化');
  }
  if (/首页|首屏|信息|复杂|认知|理解|选择/.test(task.originalQuery)) {
    focus.push('信息负担');
  }
  if (/内容|参与|沉浸|浏览|互动/.test(task.originalQuery)) {
    focus.push('参与体验');
  }
  if (task.taskMode === 'hypothesis_test') {
    focus.push('假设验证');
  }
  if (!focus.length) {
    focus.push('综合体验评估');
  }

  return focus;
};

const scoreModel = (
  profile: ExperienceModelProfile,
  task: Pick<ResearchTaskState, 'title' | 'originalQuery' | 'taskMode' | 'inputType' | 'uploadedDesigns'>,
): RoutedModel => {
  const haystack = [task.title, task.originalQuery, task.taskMode, task.inputType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  for (const keyword of profile.keywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      score += 3;
      reasons.push(`命中关键词“${keyword}”`);
    }
  }

  if (task.taskMode === 'deep_research' && ['heart_gsm', 'jtbd', 'cognitive_load'].includes(profile.id)) {
    score += 4;
    reasons.push('适合深度研究任务');
  }

  if (task.taskMode === 'design_review' && ['attrakdiff', 'cognitive_load', 'sus'].includes(profile.id)) {
    score += 5;
    reasons.push('适合设计评审模式');
  }

  if (task.taskMode === 'hypothesis_test' && ['jtbd', 'kano', 'tam', 'fogg'].includes(profile.id)) {
    score += 4;
    reasons.push('适合假设验证模式');
  }

  if (task.inputType !== 'text' || task.uploadedDesigns.length > 0) {
    if (['attrakdiff', 'cognitive_load', 'heart_gsm'].includes(profile.id)) {
      score += 3;
      reasons.push('存在设计输入，适合做体验/视觉框架分析');
    }
  }

  if (!reasons.length && ['heart_gsm', 'jtbd'].includes(profile.id)) {
    score += 1;
    reasons.push('作为通用体验框架保底纳入');
  }

  return {
    ...profile,
    score,
    reasons,
  };
};

const buildFrameworkContent = (options: {
  task: Pick<ResearchTaskState, 'originalQuery' | 'taskMode' | 'inputType' | 'uploadedDesigns'>;
  profile: RoutedModel;
  indexText: string;
  modelText: string;
  selectionMode: 'auto' | 'manual';
}): {
  content: string;
  citationText: string;
  traceLocation: Record<string, unknown>;
} => {
  const focus = inferTaskFocus(options.task);
  const indexSummary =
    extractSection(options.indexText, options.profile.name) ||
    trimSnippet(options.indexText, 140) ||
    options.profile.summary;
  const modelSummary =
    extractSection(options.modelText, '总结') ||
    extractSection(options.modelText, '核心') ||
    options.profile.summary;
  const modelCore = extractSection(options.modelText, '核心') || options.profile.core;
  const modelUseCase =
    extractSection(options.modelText, '使用场景') ||
    extractSection(options.modelText, '适用场景') ||
    options.profile.useCase;

  return {
    content: [
      `${options.profile.name} 适合作为当前任务的体验分析框架。`,
      `针对“${options.task.originalQuery}”，建议重点检查 ${options.profile.dimensions.join('、')}。`,
      `结合当前任务，更适合把它用于 ${focus.join('、')} 判断，而不是直接作为事实证据。`,
    ].join(' '),
    citationText: [
      `索引摘要：${indexSummary}`,
      `模型摘要：${modelSummary}`,
      `核心关注：${modelCore}`,
      `适用场景：${modelUseCase}`,
    ].join('；'),
    traceLocation: {
      analysisType: 'experience_model',
      selectionMode: options.selectionMode,
      modelId: options.profile.id,
      indexFile: EXPERIENCE_MODEL_INDEX_FILE,
      modelFile: options.profile.filename,
      selectionReasons: options.profile.reasons,
      focus,
      dimensions: options.profile.dimensions,
      evaluationQuestions: options.profile.questionPrompts,
      metricPrompts: options.profile.metricPrompts,
      indexSummary,
      modelSummary,
      modelCore,
      modelUseCase,
    },
  };
};

export const analyzeExperienceModels = async (
  task: Pick<
    ResearchTaskState,
    'title' | 'originalQuery' | 'taskMode' | 'inputType' | 'uploadedDesigns'
  >,
  preferredModelIds?: string[],
  analysisPlan?: AnalysisPlan,
): Promise<{ evidenceItems: EvidenceItem[]; warnings: string[]; result: ExperienceModelResult }> => {
  const warnings: string[] = [];
  const taskFingerprint = buildTaskFingerprint(task);
  const indexDocument = readPdfText(EXPERIENCE_MODEL_INDEX_FILE);
  if (!indexDocument.text) {
    warnings.push('体验模型总索引 PDF 暂无法提取文本，已退回到内置模型元数据。');
  }

  const modelsToUse = selectProfiles(task, preferredModelIds);

  const evidenceItems = modelsToUse.map((profile, index) => {
    const modelDocument = readPdfText(profile.filename);
    if (!modelDocument.text) {
      warnings.push(`${profile.name} PDF 暂无法提取文本，当前使用内置摘要与适用场景。`);
    }

    const framework = buildFrameworkContent({
      task,
      profile,
      indexText: indexDocument.text,
      modelText: modelDocument.text,
      selectionMode: preferredModelIds?.length ? 'manual' : 'auto',
    });

    return {
      id: `framework_${taskFingerprint}_${profile.id}_${index + 1}`,
      sourceType: 'experience_model' as const,
      sourceLevel: 'framework' as const,
      tier: 'T3' as const,
      confidenceScore: 0.62,
      sourceName: `${profile.name} 体验模型`,
      content: framework.content,
      citationText: framework.citationText,
      traceLocation: framework.traceLocation,
      isUsedInReport: true,
      reviewStatus: 'unreviewed' as const,
    };
  });

  const artifactSummary = buildArtifactSummary(task);
  const evaluations: ExperienceModelEvaluation[] = [];

  for (const profile of modelsToUse) {
    const modelDocument = readPdfText(profile.filename);
    const promptSpec = buildExperienceModelPrompt({
      plan: analysisPlan || {
        coreGoal: task.originalQuery,
        artifactType: task.inputType === 'text' ? 'copy' : 'ui_design',
        evaluationFocus: inferTaskFocus(task),
        targetAudience: '核心目标用户',
        businessContext: task.taskMode,
        experienceModelPlan: {
          task: `使用 ${profile.name} 评估当前稿件`,
          focusDimensions: profile.dimensions,
          preferredModelIds: [profile.id],
          evaluationQuestions: profile.questionPrompts,
        },
        externalSearchPlan: { task: '', searchQueries: [], searchIntent: '', expectedInsights: [] },
        visualReviewPlan: { task: '', reviewDimensions: [], businessGoal: '', keyConcerns: [] },
        personaSimulationPlan: { task: '', personaTypes: [], simulationScenarios: [], ratingDimensions: [] },
        subQuestions: [],
      },
      artifactSummary,
      modelName: profile.name,
      modelDocumentSummary: modelDocument.text || profile.summary,
      dimensions: profile.dimensions,
    });

    if (!modelGateway.isTextModelEnabled()) {
      evaluations.push({
        modelId: profile.id,
        modelName: profile.name,
        suitability: profile.summary,
        limitations: ['当前未启用文本模型，已退回到框架摘要模式。'],
        dimensions: profile.dimensions.map((name) => ({
          name,
          observation: `当前仅基于 ${profile.name} 框架摘要给出方法论视角。`,
          rationale: profile.core,
          suggestion: profile.questionPrompts[0],
        })),
        overallScore: undefined,
        strengths: [profile.summary],
        risks: ['缺少针对当前稿件的逐维度 LLM 评估。'],
        topPriorityFix: profile.questionPrompts[0],
        followupQuestions: profile.questionPrompts,
        evidenceBoundary: 'T3_framework_inference',
      });
      continue;
    }

    try {
      const raw = await modelGateway.runExperienceEvaluator({
        systemPrompt: promptSpec.systemPrompt,
        prompt: promptSpec.prompt,
      });
      const parsed = safeParseJson<ExperienceModelEvaluationPayload>(raw);
      if (!parsed) throw new Error('experience evaluator 返回无法解析');
      evaluations.push({
        modelId: parsed.modelId || profile.id,
        modelName: parsed.modelName || profile.name,
        suitability: parsed.suitability || profile.summary,
        limitations: Array.isArray(parsed.limitations) ? parsed.limitations.filter((v): v is string => typeof v === 'string') : [],
        dimensions: Array.isArray(parsed.dimensions)
          ? parsed.dimensions.map((item) => ({
              name: item.name || '未命名维度',
              score: typeof item.score === 'number' ? item.score : undefined,
              observation: item.observation || '未提供观察',
              rationale: item.rationale,
              suggestion: item.suggestion,
            }))
          : profile.dimensions.map((name) => ({ name, observation: '未提供观察' })),
        overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : undefined,
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((v): v is string => typeof v === 'string') : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks.filter((v): v is string => typeof v === 'string') : [],
        topPriorityFix: parsed.topPriorityFix,
        followupQuestions: Array.isArray(parsed.followupQuestions) ? parsed.followupQuestions.filter((v): v is string => typeof v === 'string') : profile.questionPrompts,
        evidenceBoundary: parsed.evidenceBoundary || 'T3_framework_inference',
      });
    } catch (error) {
      warnings.push(`${profile.name} 逐维度评估失败，已退回到框架摘要：${error instanceof Error ? error.message : String(error)}`);
      evaluations.push({
        modelId: profile.id,
        modelName: profile.name,
        suitability: profile.summary,
        limitations: ['模型评估失败，当前结果退回为框架摘要。'],
        dimensions: profile.dimensions.map((name) => ({
          name,
          observation: `当前仅基于 ${profile.name} 框架摘要给出方法论视角。`,
          rationale: profile.core,
          suggestion: profile.questionPrompts[0],
        })),
        overallScore: undefined,
        strengths: [profile.summary],
        risks: ['缺少针对当前稿件的逐维度 LLM 评估。'],
        topPriorityFix: profile.questionPrompts[0],
        followupQuestions: profile.questionPrompts,
        evidenceBoundary: 'T3_framework_inference',
      });
    }
  }

  warnings.push('体验模型分析用于补充方法论视角，不应直接视为 T1 事实证据。');

  return {
    evidenceItems,
    warnings,
    result: {
      task: analysisPlan?.experienceModelPlan.task || '体验模型评估',
      selectedModelIds: modelsToUse.map((item) => item.id),
      selectedModelNames: modelsToUse.map((item) => item.name),
      focusDimensions: analysisPlan?.experienceModelPlan.focusDimensions || modelsToUse.flatMap((item) => item.dimensions).slice(0, 6),
      evaluations,
      summary: evaluations[0]?.suitability,
      warnings,
    },
  };
};

export const getExperienceModelBranchName = (): string => 'experience_model_router';

export const listExperienceModelCatalog = (): Array<{
  id: string;
  name: string;
  summary: string;
  dimensions: string[];
  useCase: string;
}> =>
  EXPERIENCE_MODEL_PROFILES.map((profile) => ({
    id: profile.id,
    name: profile.name,
    summary: profile.summary,
    dimensions: profile.dimensions,
    useCase: profile.useCase,
  }));

export const getExperienceModelReportLines = (
  evidencePool: ResearchTaskState['evidencePool'],
): string[] =>
  evidencePool
    .filter((item) => item.sourceType === 'experience_model')
    .map((item) => {
      const trace = (item.traceLocation || {}) as Record<string, unknown>;
      const questions = Array.isArray(trace.evaluationQuestions)
        ? trace.evaluationQuestions.filter((value): value is string => typeof value === 'string')
        : [];

      const reasons = Array.isArray(trace.selectionReasons)
        ? trace.selectionReasons.filter((value): value is string => typeof value === 'string')
        : [];

      return [
        `${item.sourceName}：${item.content}`,
        reasons.length ? `选择原因：${reasons.join('、')}` : undefined,
        questions.length ? `建议追问：${questions.join('；')}` : undefined,
      ]
        .filter(Boolean)
        .join('\n');
    });
