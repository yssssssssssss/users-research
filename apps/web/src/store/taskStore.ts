import { create } from 'zustand';
import type { CandidateOutput, ResearchTaskState, ReportResponse, TaskSummaryResponse } from '@users-research/shared';

const CURRENT_TASK_STORAGE_KEY = 'users-research.currentTaskId';

const readStoredTaskId = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const value = window.localStorage.getItem(CURRENT_TASK_STORAGE_KEY)?.trim();
  return value || undefined;
};

const persistTaskId = (taskId?: string) => {
  if (typeof window === 'undefined') return;
  if (taskId) {
    window.localStorage.setItem(CURRENT_TASK_STORAGE_KEY, taskId);
    return;
  }
  window.localStorage.removeItem(CURRENT_TASK_STORAGE_KEY);
};

interface TaskStoreState {
  currentTaskId?: string;
  taskSummary?: TaskSummaryResponse;
  taskState?: ResearchTaskState;
  selectedOutput?: CandidateOutput;
  currentReport?: ReportResponse;
  setCurrentTaskId: (taskId?: string) => void;
  setTaskSummary: (task?: TaskSummaryResponse) => void;
  setTaskState: (task?: ResearchTaskState) => void;
  setSelectedOutput: (output?: CandidateOutput) => void;
  setCurrentReport: (report?: ReportResponse) => void;
}

export const useTaskStore = create<TaskStoreState>((set) => ({
  currentTaskId: readStoredTaskId(),
  setCurrentTaskId: (currentTaskId) =>
    set((state) => {
      if (state.currentTaskId === currentTaskId) {
        return state;
      }

      persistTaskId(currentTaskId);
      return {
        currentTaskId,
        taskSummary: undefined,
        taskState: undefined,
        selectedOutput: undefined,
        currentReport: undefined,
      };
    }),
  setTaskSummary: (taskSummary) => set({ taskSummary }),
  setTaskState: (taskState) => set({ taskState }),
  setSelectedOutput: (selectedOutput) => set({ selectedOutput }),
  setCurrentReport: (currentReport) => set({ currentReport }),
}));
