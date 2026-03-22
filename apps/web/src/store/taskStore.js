import { create } from 'zustand';
const CURRENT_TASK_STORAGE_KEY = 'users-research.currentTaskId';
const readStoredTaskId = () => {
    if (typeof window === 'undefined')
        return undefined;
    const value = window.localStorage.getItem(CURRENT_TASK_STORAGE_KEY)?.trim();
    return value || undefined;
};
const persistTaskId = (taskId) => {
    if (typeof window === 'undefined')
        return;
    if (taskId) {
        window.localStorage.setItem(CURRENT_TASK_STORAGE_KEY, taskId);
        return;
    }
    window.localStorage.removeItem(CURRENT_TASK_STORAGE_KEY);
};
export const useTaskStore = create((set) => ({
    currentTaskId: readStoredTaskId(),
    setCurrentTaskId: (currentTaskId) => set((state) => {
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
