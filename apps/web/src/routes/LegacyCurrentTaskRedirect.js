import { jsx as _jsx } from "react/jsx-runtime";
import { Navigate, useParams } from 'react-router-dom';
import { buildTaskDetailPath, TASK_HISTORY_PATH } from '../lib/navigation';
import { useTaskStore } from '../store/taskStore';
export const LegacyCurrentTaskRedirect = ({ section, useRouteTaskId = false }) => {
    const params = useParams();
    const currentTaskId = useTaskStore((state) => state.currentTaskId);
    const resolvedTaskId = useRouteTaskId ? params.taskId : currentTaskId;
    if (!resolvedTaskId) {
        return _jsx(Navigate, { to: TASK_HISTORY_PATH, replace: true });
    }
    return _jsx(Navigate, { to: buildTaskDetailPath(resolvedTaskId, section), replace: true });
};
