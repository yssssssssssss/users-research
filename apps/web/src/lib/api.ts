import type {
  CreateTaskRequest,
  EvidenceListResponse,
  ExperienceModelCatalogItem,
  OverrideExperienceModelsRequest,
  OverrideExperienceModelsResponse,
  OutputsResponse,
  PersonaResponse,
  PreviewPlanResponse,
  ReportResponse,
  ReviewEvidenceRequest,
  ReviewEvidenceResponse,
  ReviewReportRequest,
  ReviewReportResponse,
  SubQuestionsResponse,
  TaskSnapshotResponse,
  TaskListResponse,
  TaskSummaryResponse,
  VisionResponse,
} from '@users-research/shared';

const request = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers || {});
  const hasJsonBody =
    init?.body !== undefined && init?.body !== null && !(init.body instanceof FormData);

  if (hasJsonBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, {
    headers,
    ...init,
  });

  if (!response.ok) {
    let message = `请求失败：${response.status}`;
    try {
      const payload = await response.json();
      if (payload && typeof payload.message === 'string') {
        message = payload.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
};

export const api = {
  createTask: (payload: CreateTaskRequest) =>
    request<{ taskId: string; status: string; createdAt: string }>('/api/research/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listTasks: (limit = 20) =>
    request<TaskListResponse>(`/api/research/tasks?limit=${encodeURIComponent(String(limit))}`),
  previewPlan: (taskId: string) =>
    request<PreviewPlanResponse>(`/api/research/tasks/${taskId}/preview-plan`, {
      method: 'POST',
    }),
  runTask: (taskId: string) =>
    request<{ taskId: string; status: string }>(`/api/research/tasks/${taskId}/run`, {
      method: 'POST',
      body: JSON.stringify({ runMode: 'async' }),
    }),
  getTask: (taskId: string) => request<TaskSummaryResponse>(`/api/research/tasks/${taskId}`),
  getTaskState: (taskId: string) =>
    request<TaskSnapshotResponse>(`/api/research/tasks/${taskId}/state`),
  getExperienceModelCatalog: () =>
    request<ExperienceModelCatalogItem[]>(`/api/system/experience-models`),
  getSubQuestions: (taskId: string) =>
    request<SubQuestionsResponse>(`/api/research/tasks/${taskId}/sub-questions`),
  getEvidence: (taskId: string) =>
    request<EvidenceListResponse>(`/api/research/tasks/${taskId}/evidence`),
  reviewEvidence: (evidenceId: string, payload: ReviewEvidenceRequest) =>
    request<ReviewEvidenceResponse>(`/api/research/evidence/${evidenceId}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  overrideExperienceModels: (taskId: string, payload: OverrideExperienceModelsRequest) =>
    request<OverrideExperienceModelsResponse>(`/api/research/tasks/${taskId}/experience-models/override`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getVision: (taskId: string) => request<VisionResponse>(`/api/research/tasks/${taskId}/vision`),
  getPersona: (taskId: string) =>
    request<PersonaResponse>(`/api/research/tasks/${taskId}/persona`),
  getOutputs: (taskId: string) =>
    request<OutputsResponse>(`/api/research/tasks/${taskId}/outputs`),
  generateReport: (taskId: string, candidateOutputId?: string) =>
    request<ReportResponse>(`/api/research/tasks/${taskId}/reports/generate`, {
      method: 'POST',
      body: JSON.stringify({ candidateOutputId }),
    }),
  getReport: (reportId: string) => request<ReportResponse>(`/api/research/reports/${reportId}`),
  reviewReport: (reportId: string, payload: ReviewReportRequest) =>
    request<ReviewReportResponse>(`/api/research/reports/${reportId}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
