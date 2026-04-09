declare module "sql.js" {
  export interface SqlValue {
    toString(): string;
  }

  export interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }

  export interface Statement {
    free(): void;
    run(params?: unknown[]): void;
  }

  export interface Database {
    exec(sql: string, params?: unknown[]): QueryExecResult[];
    export(): Uint8Array;
    prepare(sql: string): Statement;
    run(sql: string, params?: unknown[]): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
