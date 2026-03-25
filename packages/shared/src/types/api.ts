import type {
  CandidateOutput,
  EnabledModules,
  EvidenceItem,
  FinalReport,
  InputType,
  PersonaFinding,
  ResearchTaskState,
  ReviewStatus,
  RqLevel,
  SubQuestion,
  TaskMode,
  TaskStatus,
  TierLevel,
  VisionFinding,
} from './research.js';

export interface CreateTaskFileInput {
  fileId: string;
  fileName?: string;
  fileType?: 'document' | 'image' | 'design' | 'spreadsheet';
  ossKey?: string;
  sourceUrl?: string;
  mimeType?: string;
  dataUrl?: string;
  localPath?: string;
  sizeBytes?: number;
  sha256?: string;
}

export interface UploadAssetRequest {
  fileName: string;
  fileType: 'document' | 'image' | 'design' | 'spreadsheet';
  mimeType?: string;
  dataUrl: string;
}

export interface UploadAssetResponse {
  file: CreateTaskFileInput;
}

export interface CreateTaskRequest {
  title?: string;
  query: string;
  inputType: InputType;
  taskMode: TaskMode;
  enabledModules: EnabledModules;
  attachments?: CreateTaskFileInput[];
  designFiles?: CreateTaskFileInput[];
}

export interface PreviewPlanResponse {
  taskId: string;
  predictedPlan: {
    subQuestionCount: number;
    branches: string[];
    estimatedLatencySeconds: number;
    estimatedCostLevel: 'low' | 'medium' | 'high';
    reviewRequired: boolean;
  };
}

export interface ExperienceModelCatalogItem {
  id: string;
  name: string;
  summary: string;
  dimensions: string[];
  useCase: string;
}

export interface TaskSummaryResponse {
  taskId: string;
  title?: string;
  query: string;
  inputType: InputType;
  taskMode: TaskMode;
  status: TaskStatus;
  reviewStatus: ReviewStatus;
  rqLevel?: RqLevel;
  currentNode?: string;
  enabledModules: EnabledModules;
  stats: {
    elapsedSeconds?: number;
    costEstimate?: number;
    warnings: string[];
  };
}

export interface TaskListResponse {
  items: TaskSummaryResponse[];
}

export interface EvidenceListResponse {
  items: EvidenceItem[];
  summary: {
    total: number;
    tier1: number;
    tier2: number;
    tier3: number;
    conflictCount: number;
  };
}

export interface VisionConflictItem {
  model: string;
  content: string;
  requestedModel?: string;
  actualModel?: string;
  attemptedModels?: string[];
  warnings?: string[];
}

export interface VisionResponse {
  summary: {
    models: string[];
    consensusCount: number;
    conflictCount: number;
  };
  consensus: VisionFinding[];
  conflicts: Array<{
    topic: string;
    items: VisionConflictItem[];
  }>;
}

export interface PersonaResponse {
  summary: {
    personaCount: number;
    clusterCount: number;
    simulated: true;
  };
  clusters: Array<{
    id: string;
    theme: string;
    items: PersonaFinding[];
  }>;
  notice: string;
}

export interface OutputsResponse {
  rqLevel?: RqLevel;
  candidateOutputs: CandidateOutput[];
}

export interface ReportResponse extends FinalReport {
  gateResult: {
    rqLevel?: RqLevel;
    tierCoverage: { T1: number; T2: number; T3: number };
    blockedSources: string[];
    blockedReasons?: string[];
  };
  reviewMeta?: {
    action: 'approve' | 'request_rework';
    reviewedAt: string;
    reviewer?: string;
    comment?: string;
  };
}

export interface ReviewReportRequest {
  action: 'approve' | 'request_rework';
  reviewer?: string;
  comment?: string;
}

export interface ReviewReportResponse {
  report: ReportResponse;
  task: {
    taskId: string;
    status: TaskStatus;
    reviewStatus: ReviewStatus;
  };
}

export interface ReviewEvidenceRequest {
  reviewStatus: EvidenceItem['reviewStatus'];
  tier?: TierLevel;
  isUsedInReport?: boolean;
  reviewer?: string;
  comment?: string;
}

export interface ReviewEvidenceResponse {
  taskId: string;
  evidence: EvidenceItem;
  updatedAt: string;
  recomputeStatus: 'queued' | 'completed';
  taskStatus: TaskStatus;
  currentNode?: string;
}

export interface OverrideExperienceModelsRequest {
  mode?: 'auto' | 'manual';
  modelIds?: string[];
}

export interface OverrideExperienceModelsResponse {
  taskId: string;
  mode: 'auto' | 'manual';
  selectedModelIds: string[];
  task: TaskSummaryResponse;
  state: TaskSnapshotResponse;
}

export type TaskSnapshotResponse = ResearchTaskState;
export type SubQuestionsResponse = { items: SubQuestion[] };
