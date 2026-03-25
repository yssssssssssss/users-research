import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import Database from 'better-sqlite3';
import type { ReportResponse, ResearchTaskState } from '@users-research/shared';
import { appConfig } from '../config/env.js';

type SqliteDatabase = InstanceType<typeof Database>;

declare global {
  // eslint-disable-next-line no-var
  var __usersResearchSqlite__: SqliteDatabase | undefined;
}

const asSqlitePath = (databaseUrl: string): string => {
  if (!databaseUrl.startsWith('file:')) {
    throw new Error('当前 DATABASE_URL 不是 SQLite file URL。');
  }

  const filepath = databaseUrl.slice('file:'.length).split('?')[0];
  if (!filepath) {
    throw new Error('SQLite DATABASE_URL 缺少文件路径。');
  }

  return isAbsolute(filepath) ? filepath : resolve(appConfig.paths.envDir, filepath);
};

const createSchema = (db: SqliteDatabase) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_snapshots (
      task_id TEXT PRIMARY KEY,
      title TEXT,
      query TEXT NOT NULL,
      input_type TEXT NOT NULL,
      task_mode TEXT NOT NULL,
      status TEXT NOT NULL,
      review_status TEXT NOT NULL,
      rq_level TEXT,
      current_node TEXT,
      enabled_modules_json TEXT NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_task_snapshots_updated_at
      ON task_snapshots(updated_at DESC);

    CREATE TABLE IF NOT EXISTS reports (
      report_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      report_type TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      report_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reports_task_id
      ON reports(task_id, version DESC);
  `);
};

const getSqliteDb = (): SqliteDatabase => {
  if (appConfig.persistence.mode !== 'sqlite' || !appConfig.persistence.databaseUrl) {
    throw new Error('当前未启用 SQLite 持久化。');
  }

  if (globalThis.__usersResearchSqlite__) {
    return globalThis.__usersResearchSqlite__;
  }

  const filepath = asSqlitePath(appConfig.persistence.databaseUrl);
  mkdirSync(dirname(filepath), { recursive: true });

  const db = new Database(filepath);
  db.pragma('journal_mode = WAL');
  createSchema(db);

  globalThis.__usersResearchSqlite__ = db;
  return db;
};

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const saveTaskToSqlite = (task: ResearchTaskState): ResearchTaskState => {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT created_at FROM task_snapshots WHERE task_id = ?')
    .get(task.taskId) as { created_at: string } | undefined;

  db.prepare(`
    INSERT INTO task_snapshots (
      task_id, title, query, input_type, task_mode, status, review_status,
      rq_level, current_node, enabled_modules_json, state_json, created_at, updated_at, finished_at
    ) VALUES (
      @task_id, @title, @query, @input_type, @task_mode, @status, @review_status,
      @rq_level, @current_node, @enabled_modules_json, @state_json, @created_at, @updated_at, @finished_at
    )
    ON CONFLICT(task_id) DO UPDATE SET
      title = excluded.title,
      query = excluded.query,
      input_type = excluded.input_type,
      task_mode = excluded.task_mode,
      status = excluded.status,
      review_status = excluded.review_status,
      rq_level = excluded.rq_level,
      current_node = excluded.current_node,
      enabled_modules_json = excluded.enabled_modules_json,
      state_json = excluded.state_json,
      updated_at = excluded.updated_at,
      finished_at = excluded.finished_at
  `).run({
    task_id: task.taskId,
    title: task.title ?? null,
    query: task.originalQuery,
    input_type: task.inputType,
    task_mode: task.taskMode,
    status: task.status,
    review_status: task.reviewStatus,
    rq_level: task.rqLevel ?? null,
    current_node: task.currentNode ?? null,
    enabled_modules_json: JSON.stringify(task.enabledModules),
    state_json: JSON.stringify(task),
    created_at: existing?.created_at || now,
    updated_at: now,
    finished_at: task.runStats.finishedAt ?? null,
  });

  return task;
};

export const getTaskFromSqlite = (taskId: string): ResearchTaskState => {
  const db = getSqliteDb();
  const row = db
    .prepare('SELECT state_json FROM task_snapshots WHERE task_id = ?')
    .get(taskId) as { state_json: string } | undefined;

  if (!row) throw new Error('任务不存在');
  return parseJson<ResearchTaskState>(row.state_json, {} as ResearchTaskState);
};

export const listTasksFromSqlite = (limit = 20): ResearchTaskState[] => {
  const db = getSqliteDb();
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 20));
  const rows = db
    .prepare('SELECT state_json FROM task_snapshots ORDER BY updated_at DESC LIMIT ?')
    .all(safeLimit) as Array<{ state_json: string }>;

  return rows
    .map((row) => parseJson<ResearchTaskState | undefined>(row.state_json, undefined))
    .filter((item): item is ResearchTaskState => Boolean(item));
};

export const findTaskByEvidenceIdFromSqlite = (
  evidenceId: string,
): { task: ResearchTaskState; evidenceIndex: number } | undefined => {
  const db = getSqliteDb();
  const row = db
    .prepare(`
      SELECT state_json
      FROM task_snapshots
      WHERE state_json LIKE ?
      ORDER BY updated_at DESC
      LIMIT 1
    `)
    .get(`%${JSON.stringify(evidenceId).slice(1, -1)}%`) as { state_json: string } | undefined;

  if (!row) return undefined;

  const task = parseJson<ResearchTaskState | undefined>(row.state_json, undefined);
  if (!task) return undefined;

  const evidenceIndex = task.evidencePool.findIndex((item) => item.id === evidenceId);
  if (evidenceIndex < 0) return undefined;

  return { task, evidenceIndex };
};

export const saveReportToSqlite = (taskId: string, report: ReportResponse): ReportResponse => {
  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO reports (report_id, task_id, report_type, version, status, report_json, updated_at)
    VALUES (@report_id, @task_id, @report_type, @version, @status, @report_json, @updated_at)
    ON CONFLICT(report_id) DO UPDATE SET
      task_id = excluded.task_id,
      report_type = excluded.report_type,
      version = excluded.version,
      status = excluded.status,
      report_json = excluded.report_json,
      updated_at = excluded.updated_at
  `).run({
    report_id: report.id,
    task_id: taskId,
    report_type: report.reportType,
    version: report.version,
    status: report.status,
    report_json: JSON.stringify(report),
    updated_at: new Date().toISOString(),
  });

  return report;
};

export const getReportFromSqlite = (reportId: string): ReportResponse => {
  const db = getSqliteDb();
  const row = db
    .prepare('SELECT report_json FROM reports WHERE report_id = ?')
    .get(reportId) as { report_json: string } | undefined;

  if (!row) throw new Error('报告不存在');
  return parseJson<ReportResponse>(row.report_json, {} as ReportResponse);
};

export const getTaskIdByReportIdFromSqlite = (reportId: string): string | undefined => {
  const db = getSqliteDb();
  const row = db
    .prepare('SELECT task_id FROM reports WHERE report_id = ?')
    .get(reportId) as { task_id: string } | undefined;

  return row?.task_id;
};
