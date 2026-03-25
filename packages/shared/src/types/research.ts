export type InputType = 'text' | 'design' | 'mixed';
export type TaskMode =
  | 'quick_judgment'
  | 'deep_research'
  | 'design_review'
  | 'hypothesis_test';
export type TaskStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'partial_failed'
  | 'awaiting_review'
  | 'completed'
  | 'cancelled'
  | 'failed';
export type ReviewStatus =
  | 'not_required'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'rework_required';
export type RqLevel = 'RQ0' | 'RQ1' | 'RQ2' | 'RQ3';
export type TierLevel = 'T1' | 'T2' | 'T3';
export type OutputType =
  | 'judgment_card'
  | 'light_report'
  | 'evidence_report'
  | 'design_review_report'
  | 'hypothesis_pack';


export type ArtifactType =
  | 'ui_design'
  | 'copy'
  | 'product_plan'
  | 'marketing_asset'
  | 'prototype';

export type VisualReviewerRole = 'structural' | 'emotional' | 'behavioral';

export interface AnalysisSubQuestionPlan {
  text: string;
  audience?: string;
  scenario?: string;
  journeyPath?: string;
  decisionPoint?: string;
}

export interface ExperienceModelPlan {
  task: string;
  focusDimensions: string[];
  preferredModelIds: string[];
  evaluationQuestions: string[];
}

export interface ExternalSearchPlan {
  task: string;
  searchQueries: string[];
  searchIntent: string;
  expectedInsights: string[];
}

export interface VisualReviewPlan {
  task: string;
  reviewDimensions: string[];
  businessGoal: string;
  keyConcerns: string[];
}

export interface PersonaSimulationPlan {
  task: string;
  personaTypes: string[];
  simulationScenarios: string[];
  ratingDimensions: string[];
}

export interface AnalysisPlan {
  coreGoal: string;
  artifactType: ArtifactType;
  evaluationFocus: string[];
  targetAudience: string;
  businessContext: string;
  experienceModelPlan: ExperienceModelPlan;
  externalSearchPlan: ExternalSearchPlan;
  visualReviewPlan: VisualReviewPlan;
  personaSimulationPlan: PersonaSimulationPlan;
  subQuestions: AnalysisSubQuestionPlan[];
}

export interface ExperienceModelDimensionEvaluation {
  name: string;
  score?: number;
  observation: string;
  rationale?: string;
  suggestion?: string;
}

export interface ExperienceModelEvaluation {
  modelId: string;
  modelName: string;
  suitability: string;
  limitations: string[];
  dimensions: ExperienceModelDimensionEvaluation[];
  overallScore?: number;
  strengths: string[];
  risks: string[];
  topPriorityFix?: string;
  followupQuestions: string[];
  evidenceBoundary: string;
}

export interface ExperienceModelResult {
  task: string;
  selectedModelIds: string[];
  selectedModelNames: string[];
  focusDimensions: string[];
  evaluations: ExperienceModelEvaluation[];
  summary?: string;
  warnings: string[];
}

export interface ExternalSearchInsight {
  insight: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  tier: TierLevel;
}

export interface ExternalSearchResult {
  task: string;
  queries: string[];
  benchmarkFindings: string[];
  trendFindings: string[];
  riskFindings: string[];
  keyInsights: ExternalSearchInsight[];
  evidenceBoundary: string[];
  warnings: string[];
}

export interface VisualReviewDimension {
  name: string;
  score?: number;
  evidence: string;
  suggestion?: string;
}

export interface VisualReviewIssue {
  severity: 'low' | 'medium' | 'high';
  issue: string;
  suggestion?: string;
}

export interface VisualReviewerResult {
  role: VisualReviewerRole;
  roleLabel: string;
  requestedModel?: string;
  actualModel?: string;
  attemptedModels?: string[];
  dimensions: VisualReviewDimension[];
  issues: VisualReviewIssue[];
  overallScore?: number;
  topSuggestion?: string;
}

export interface VisualReviewResult {
  task: string;
  reviewDimensions: string[];
  reviewers: VisualReviewerResult[];
  consensus: string[];
  conflicts: string[];
  prioritizedActions: string[];
  confidenceNotes: string[];
  warnings: string[];
}

export interface PersonaProfileTemplate {
  id: string;
  type: string;
  summary: string;
  behaviorTraits: string[];
  concerns: string[];
  motivations: string[];
}

export interface DigitalPersona {
  profileId: string;
  personaName: string;
  age?: string;
  occupation?: string;
  city?: string;
  description: string;
  usageScenario?: string;
  concerns: string[];
  motivations: string[];
}

export interface PersonaScorecard {
  usability?: number;
  attractiveness?: number;
  trust?: number;
  conversionIntent?: number;
  emotionalResonance?: number;
}

export interface PersonaReviewResult {
  profileId: string;
  personaName: string;
  description: string;
  requestedModel?: string;
  actualModel?: string;
  attemptedModels?: string[];
  firstImpression: string;
  detailedExperience: string;
  scores: PersonaScorecard;
  overallScore?: number;
  quoteToFriend?: string;
  topChangeRequest?: string;
  theme?: string;
  stance?: 'support' | 'oppose' | 'hesitate' | 'confused' | 'mixed';
  isSimulated: true;
}

export interface PersonaSimulationAggregate {
  scoreSummary: PersonaScorecard;
  sharedPainPoints: string[];
  sharedHighlights: string[];
  divergences: string[];
  churnRisks: string[];
}

export interface PersonaSimulationResult {
  task: string;
  personaTypes: string[];
  digitalPersonas: DigitalPersona[];
  reviews: PersonaReviewResult[];
  aggregate: PersonaSimulationAggregate;
  warnings: string[];
}

export interface SynthesisConclusion {
  title: string;
  content: string;
  supportingSources: string[];
  confidence: 'high' | 'medium' | 'low';
  action?: string;
}

export interface SynthesisResult {
  consensus: string[];
  conflicts: string[];
  conclusions: SynthesisConclusion[];
  topRecommendations: string[];
  hypothesesToValidate: string[];
  nextResearchActions: string[];
  evidenceBoundary: string[];
  warnings: string[];
}

export interface ModuleResults {
  experienceModel?: ExperienceModelResult;
  externalSearch?: ExternalSearchResult;
  visualReview?: VisualReviewResult;
  personaSimulation?: PersonaSimulationResult;
}

export interface EnabledModules {
  evidence: boolean;
  visionMoE: boolean;
  personaSandbox: boolean;
  externalSearch: boolean;
  multiModelReview: boolean;
}

export interface TaskFileRef {
  id: string;
  fileName: string;
  category: 'input' | 'reference' | 'generated';
  fileType: 'document' | 'image' | 'design' | 'spreadsheet';
  ossKey?: string;
  sourceUrl?: string;
  mimeType?: string;
  dataUrl?: string;
  localPath?: string;
  sizeBytes?: number;
  sha256?: string;
}

export interface SubQuestion {
  id: string;
  seq: number;
  text: string;
  audience?: string;
  scenario?: string;
  journeyPath?: string;
  decisionPoint?: string;
  status: 'draft' | 'confirmed' | 'running' | 'completed' | 'failed';
}

export interface EvidenceItem {
  id: string;
  subQuestionId?: string;
  sourceType:
    | 'internal_metric'
    | 'internal_report'
    | 'interview'
    | 'survey'
    | 'prd'
    | 'web_article'
    | 'industry_report'
    | 'historical_case'
    | 'experience_model'
    | 'vision_generated'
    | 'persona_generated';
  sourceLevel: 'internal' | 'external' | 'simulated' | 'framework';
  tier: TierLevel;
  confidenceScore?: number;
  sourceName?: string;
  sourceUrl?: string;
  sourceDate?: string;
  content: string;
  citationText?: string;
  traceLocation?: Record<string, unknown>;
  isUsedInReport: boolean;
  reviewStatus: 'unreviewed' | 'accepted' | 'downgraded' | 'rejected';
}

export interface EvidenceConflict {
  id: string;
  topic: string;
  evidenceAId: string;
  evidenceBId: string;
  conflictReason: string;
  status: 'open' | 'resolved' | 'ignored';
}

export interface VisionFinding {
  id: string;
  findingType:
    | 'visual_hierarchy'
    | 'cta_visibility'
    | 'path_friction'
    | 'cognitive_load'
    | 'consistency'
    | 'attention_risk';
  riskLevel: 'low' | 'medium' | 'high';
  content: string;
  regionRef?: Record<string, unknown>;
  isConsensus?: boolean;
  isConflict?: boolean;
}

export interface PersonaFinding {
  id: string;
  personaName: string;
  stance?: 'support' | 'oppose' | 'hesitate' | 'confused' | 'mixed';
  theme?: string;
  content: string;
  isSimulated: true;
}

export interface CandidateOutput {
  id: string;
  outputType: OutputType;
  sourceNode: string;
  gateLevel?: 'allowed' | 'blocked_by_rq' | 'review_required';
  gateNotes?: string[];
  summary?: string;
  contentJson: Record<string, unknown>;
  status: 'generated' | 'gated_out' | 'selected' | 'discarded';
}

export interface FinalReport {
  id: string;
  version: number;
  reportType: OutputType;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  sections: Array<{ type: string; title: string; content: string }>;
}

export interface ResearchTaskState {
  taskId: string;
  title?: string;
  inputType: InputType;
  taskMode: TaskMode;
  originalQuery: string;
  uploadedFiles: TaskFileRef[];
  uploadedDesigns: TaskFileRef[];
  enabledModules: EnabledModules;
  status: TaskStatus;
  reviewStatus: ReviewStatus;
  currentNode?: string;
  rqLevel?: RqLevel;
  analysisPlan?: AnalysisPlan;
  subQuestions: SubQuestion[];
  evidencePool: EvidenceItem[];
  evidenceConflicts: EvidenceConflict[];
  visionFindings: VisionFinding[];
  personaFindings: PersonaFinding[];
  moduleResults?: ModuleResults;
  synthesisResult?: SynthesisResult;
  candidateOutputs: CandidateOutput[];
  finalReports: FinalReport[];
  runStats: {
    startedAt?: string;
    finishedAt?: string;
    costEstimate?: number;
    latencyMs?: number;
    warnings: string[];
  };
}
