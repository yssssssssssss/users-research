import { create } from 'zustand';
import type { CandidateOutput, ResearchTaskState, ReportResponse, TaskSummaryResponse } from '@users-research/shared';

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
  setCurrentTaskId: (currentTaskId) => set({ currentTaskId, taskSummary: undefined, taskState: undefined, selectedOutput: undefined, currentReport: undefined }),
  setTaskSummary: (taskSummary) => set({ taskSummary }),
  setTaskState: (taskState) => set({ taskState }),
  setSelectedOutput: (selectedOutput) => set({ selectedOutput }),
  setCurrentReport: (currentReport) => set({ currentReport }),
}));
