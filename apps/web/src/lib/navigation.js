export const PRIMARY_NAV_NEW_TASK = '/tasks/new';
export const PRIMARY_NAV_TASK_HISTORY = '/tasks';
export const TASK_HISTORY_PATH = '/tasks';
export const TASK_NEW_PATH = '/tasks/new';
export const TASK_DETAIL_ROOT_PATH = '/tasks';
export const TASK_DETAIL_SECTION_OVERVIEW = 'overview';
export const TASK_DETAIL_SECTION_EXPERIENCE = 'experience';
export const TASK_DETAIL_SECTION_EVIDENCE = 'evidence';
export const TASK_DETAIL_SECTION_VISION = 'vision';
export const TASK_DETAIL_SECTION_PERSONA = 'persona';
export const TASK_DETAIL_SECTION_RESULT = 'result';
export const TASK_DETAIL_SECTION_REPORT = 'report';
export const TASK_DETAIL_SECTION_OPS = 'ops';
export const buildTaskDetailPath = (taskId, section = TASK_DETAIL_SECTION_OVERVIEW) => `${TASK_DETAIL_ROOT_PATH}/${encodeURIComponent(taskId)}/${section}`;
export const TASK_DETAIL_OVERVIEW_PATH = (taskId) => buildTaskDetailPath(taskId, TASK_DETAIL_SECTION_OVERVIEW);
export const TASK_DETAIL_EXPERIENCE_PATH = (taskId) => buildTaskDetailPath(taskId, TASK_DETAIL_SECTION_EXPERIENCE);
export const TASK_DETAIL_EVIDENCE_PATH = (taskId) => buildTaskDetailPath(taskId, TASK_DETAIL_SECTION_EVIDENCE);
export const TASK_DETAIL_VISION_PATH = (taskId) => buildTaskDetailPath(taskId, TASK_DETAIL_SECTION_VISION);
export const TASK_DETAIL_PERSONA_PATH = (taskId) => buildTaskDetailPath(taskId, TASK_DETAIL_SECTION_PERSONA);
export const TASK_DETAIL_RESULT_PATH = (taskId) => buildTaskDetailPath(taskId, TASK_DETAIL_SECTION_RESULT);
export const TASK_DETAIL_REPORT_PATH = (taskId) => buildTaskDetailPath(taskId, TASK_DETAIL_SECTION_REPORT);
export const TASK_DETAIL_OPS_PATH = (taskId) => buildTaskDetailPath(taskId, TASK_DETAIL_SECTION_OPS);
const legacyTaskPaths = new Set([
    '/current',
    '/workbench',
    '/experience',
    '/evidence',
    '/vision',
    '/persona',
    '/result',
    '/report',
    '/ops',
]);
export const getPrimaryNavKey = (pathname) => {
    if (pathname === TASK_NEW_PATH) {
        return PRIMARY_NAV_NEW_TASK;
    }
    if (pathname.startsWith(TASK_DETAIL_ROOT_PATH) || legacyTaskPaths.has(pathname)) {
        return PRIMARY_NAV_TASK_HISTORY;
    }
    return PRIMARY_NAV_TASK_HISTORY;
};
export const isTaskDetailPath = (pathname) => {
    const segments = pathname.split('/').filter(Boolean);
    return segments[0] === 'tasks' && segments.length >= 3;
};
export const getTaskDetailTabKey = (pathname) => {
    const section = pathname.split('/').filter(Boolean).at(-1);
    if (section === TASK_DETAIL_SECTION_EXPERIENCE)
        return TASK_DETAIL_SECTION_EXPERIENCE;
    if (section === TASK_DETAIL_SECTION_EVIDENCE)
        return TASK_DETAIL_SECTION_EVIDENCE;
    if (section === TASK_DETAIL_SECTION_VISION)
        return TASK_DETAIL_SECTION_VISION;
    if (section === TASK_DETAIL_SECTION_PERSONA)
        return TASK_DETAIL_SECTION_PERSONA;
    if (section === TASK_DETAIL_SECTION_RESULT)
        return TASK_DETAIL_SECTION_RESULT;
    if (section === TASK_DETAIL_SECTION_REPORT)
        return TASK_DETAIL_SECTION_REPORT;
    if (section === TASK_DETAIL_SECTION_OPS)
        return TASK_DETAIL_SECTION_OPS;
    return TASK_DETAIL_SECTION_OVERVIEW;
};
