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
  subQuestions: SubQuestion[];
  evidencePool: EvidenceItem[];
  evidenceConflicts: EvidenceConflict[];
  visionFindings: VisionFinding[];
  personaFindings: PersonaFinding[];
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
