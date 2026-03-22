import { Navigate, useParams } from 'react-router-dom';
import { buildTaskDetailPath, type TaskDetailSection, TASK_HISTORY_PATH } from '../lib/navigation';
import { useTaskStore } from '../store/taskStore';

interface LegacyCurrentTaskRedirectProps {
  section: TaskDetailSection;
  useRouteTaskId?: boolean;
}

export const LegacyCurrentTaskRedirect = ({ section, useRouteTaskId = false }: LegacyCurrentTaskRedirectProps) => {
  const params = useParams<{ taskId?: string }>();
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const resolvedTaskId = useRouteTaskId ? params.taskId : currentTaskId;

  if (!resolvedTaskId) {
    return <Navigate to={TASK_HISTORY_PATH} replace />;
  }

  return <Navigate to={buildTaskDetailPath(resolvedTaskId, section)} replace />;
};
