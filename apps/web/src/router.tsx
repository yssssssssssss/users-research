import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { CreateTaskPage } from './pages/CreateTaskPage';
import { WorkbenchPage } from './pages/WorkbenchPage';
import { EvidenceBoardPage } from './pages/EvidenceBoardPage';
import { VisionLabPage } from './pages/VisionLabPage';
import { PersonaLabPage } from './pages/PersonaLabPage';
import { ReportPage } from './pages/ReportPage';
import { ResultPage } from './pages/ResultPage';
import { ReviewOpsPage } from './pages/ReviewOpsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <CreateTaskPage /> },
      { path: 'workbench', element: <WorkbenchPage /> },
      { path: 'evidence', element: <EvidenceBoardPage /> },
      { path: 'vision', element: <VisionLabPage /> },
      { path: 'persona', element: <PersonaLabPage /> },
      { path: 'report', element: <ReportPage /> },
      { path: 'result', element: <ResultPage /> },
      { path: 'ops', element: <ReviewOpsPage /> },
    ],
  },
]);
