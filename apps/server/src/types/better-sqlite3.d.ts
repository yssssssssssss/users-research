declare module 'better-sqlite3' {
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement<BindParameters = unknown[]> {
    run(...params: BindParameters extends unknown[] ? BindParameters : [BindParameters]): RunResult;
    get(...params: BindParameters extends unknown[] ? BindParameters : [BindParameters]): unknown;
    all(...params: BindParameters extends unknown[] ? BindParameters : [BindParameters]): unknown[];
  }

  class Database {
    constructor(filename: string);
    exec(sql: string): this;
    pragma(source: string): unknown;
    prepare(sql: string): Statement<any>;
  }

  export = Database;
}
