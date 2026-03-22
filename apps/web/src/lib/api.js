const request = async (input, init) => {
    const headers = new Headers(init?.headers || {});
    const hasJsonBody = init?.body !== undefined && init?.body !== null && !(init.body instanceof FormData);
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
        }
        catch {
            // ignore
        }
        throw new Error(message);
    }
    return response.json();
};
export const api = {
    createTask: (payload) => request('/api/research/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
    listTasks: (limit = 20) => request(`/api/research/tasks?limit=${encodeURIComponent(String(limit))}`),
    previewPlan: (taskId) => request(`/api/research/tasks/${taskId}/preview-plan`, {
        method: 'POST',
    }),
    runTask: (taskId) => request(`/api/research/tasks/${taskId}/run`, {
        method: 'POST',
        body: JSON.stringify({ runMode: 'async' }),
    }),
    getTask: (taskId) => request(`/api/research/tasks/${taskId}`),
    getTaskState: (taskId) => request(`/api/research/tasks/${taskId}/state`),
    getExperienceModelCatalog: () => request(`/api/system/experience-models`),
    getSubQuestions: (taskId) => request(`/api/research/tasks/${taskId}/sub-questions`),
    getEvidence: (taskId) => request(`/api/research/tasks/${taskId}/evidence`),
    reviewEvidence: (evidenceId, payload) => request(`/api/research/evidence/${evidenceId}/review`, {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
    overrideExperienceModels: (taskId, payload) => request(`/api/research/tasks/${taskId}/experience-models/override`, {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
    getVision: (taskId) => request(`/api/research/tasks/${taskId}/vision`),
    getPersona: (taskId) => request(`/api/research/tasks/${taskId}/persona`),
    getOutputs: (taskId) => request(`/api/research/tasks/${taskId}/outputs`),
    generateReport: (taskId, candidateOutputId) => request(`/api/research/tasks/${taskId}/reports/generate`, {
        method: 'POST',
        body: JSON.stringify({ candidateOutputId }),
    }),
    getReport: (reportId) => request(`/api/research/reports/${reportId}`),
    reviewReport: (reportId, payload) => request(`/api/research/reports/${reportId}/review`, {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
};
