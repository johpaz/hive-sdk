export interface IStorage {
  query(sql: string, ...params: any[]): any;
  run(sql: string, ...params: any[]): void;
  transaction<T>(fn: () => T): T;
  close(): void;
}
