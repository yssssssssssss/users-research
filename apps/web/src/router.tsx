import { lazy, Suspense } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { RouteLoading } from './components/RouteLoading';
import {
  TASK_DETAIL_SECTION_EXPERIENCE,
  TASK_DETAIL_SECTION_EVIDENCE,
  TASK_DETAIL_SECTION_OPS,
  TASK_DETAIL_SECTION_OVERVIEW,
  TASK_DETAIL_SECTION_PERSONA,
  TASK_DETAIL_SECTION_REPORT,
  TASK_DETAIL_SECTION_RESULT,
  TASK_DETAIL_SECTION_VISION,
  TASK_HISTORY_PATH,
  TASK_NEW_PATH,
} from './lib/navigation';
import { LegacyCurrentTaskRedirect } from './routes/LegacyCurrentTaskRedirect';

const TaskDetailLayout = lazy(() =>
  import('./layouts/TaskDetailLayout').then((module) => ({ default: module.TaskDetailLayout })),
);
const CreateTaskPage = lazy(() =>
  import('./pages/CreateTaskPage').then((module) => ({ default: module.CreateTaskPage })),
);
const WorkbenchPage = lazy(() =>
  import('./pages/WorkbenchPage').then((module) => ({ default: module.WorkbenchPage })),
);
const EvidenceBoardPage = lazy(() =>
  import('./pages/EvidenceBoardPage').then((module) => ({ default: module.EvidenceBoardPage })),
);
const ExperienceModelPage = lazy(() =>
  import('./pages/ExperienceModelPage').then((module) => ({ default: module.ExperienceModelPage })),
);
const VisionLabPage = lazy(() =>
  import('./pages/VisionLabPage').then((module) => ({ default: module.VisionLabPage })),
);
const PersonaLabPage = lazy(() =>
  import('./pages/PersonaLabPage').then((module) => ({ default: module.PersonaLabPage })),
);
const ReportPage = lazy(() =>
  import('./pages/ReportPage').then((module) => ({ default: module.ReportPage })),
);
const ResultPage = lazy(() =>
  import('./pages/ResultPage').then((module) => ({ default: module.ResultPage })),
);
const ReviewOpsPage = lazy(() =>
  import('./pages/ReviewOpsPage').then((module) => ({ default: module.ReviewOpsPage })),
);
const TaskHistoryPage = lazy(() =>
  import('./pages/TaskHistoryPage').then((module) => ({ default: module.TaskHistoryPage })),
);

const renderLazy = (Component: React.ComponentType) => (
  <Suspense fallback={<RouteLoading />}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to={TASK_HISTORY_PATH} replace /> },
      { path: 'tasks', element: renderLazy(TaskHistoryPage) },
      { path: 'tasks/new', element: renderLazy(CreateTaskPage) },
      {
        path: 'tasks/:taskId',
        element: renderLazy(TaskDetailLayout),
        children: [
          { index: true, element: <Navigate to={TASK_DETAIL_SECTION_OVERVIEW} replace /> },
          { path: 'overview', element: renderLazy(WorkbenchPage) },
          { path: 'experience', element: renderLazy(ExperienceModelPage) },
          { path: 'evidence', element: renderLazy(EvidenceBoardPage) },
          { path: 'vision', element: renderLazy(VisionLabPage) },
          { path: 'persona', element: renderLazy(PersonaLabPage) },
          { path: 'report', element: renderLazy(ReportPage) },
          { path: 'result', element: renderLazy(ResultPage) },
          { path: 'ops', element: renderLazy(ReviewOpsPage) },
        ],
      },
      { path: 'current', element: <Navigate to={TASK_HISTORY_PATH} replace /> },
      { path: 'current/:taskId', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_OVERVIEW} useRouteTaskId /> },
      { path: 'current/:taskId/overview', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_OVERVIEW} useRouteTaskId /> },
      { path: 'current/:taskId/experience', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_EXPERIENCE} useRouteTaskId /> },
      { path: 'current/:taskId/evidence', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_EVIDENCE} useRouteTaskId /> },
      { path: 'current/:taskId/vision', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_VISION} useRouteTaskId /> },
      { path: 'current/:taskId/persona', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_PERSONA} useRouteTaskId /> },
      { path: 'current/:taskId/result', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_RESULT} useRouteTaskId /> },
      { path: 'current/:taskId/report', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_REPORT} useRouteTaskId /> },
      { path: 'current/:taskId/ops', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_OPS} useRouteTaskId /> },
      { path: 'workbench', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_OVERVIEW} /> },
      { path: 'experience', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_EXPERIENCE} /> },
      { path: 'evidence', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_EVIDENCE} /> },
      { path: 'vision', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_VISION} /> },
      { path: 'persona', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_PERSONA} /> },
      { path: 'report', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_REPORT} /> },
      { path: 'result', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_RESULT} /> },
      { path: 'ops', element: <LegacyCurrentTaskRedirect section={TASK_DETAIL_SECTION_OPS} /> },
      { path: 'new', element: <Navigate to={TASK_NEW_PATH} replace /> },
    ],
  },
]);
