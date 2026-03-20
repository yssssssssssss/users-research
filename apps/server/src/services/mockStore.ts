import type { ReportResponse, ResearchTaskState } from '@users-research/shared';

export const taskStore = new Map<string, ResearchTaskState>();
export const reportStore = new Map<string, ReportResponse>();
