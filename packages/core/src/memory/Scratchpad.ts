import type { Database } from "bun:sqlite";

export class Scratchpad {
  constructor(private db: Database) {}

  write(threadId: string, key: string, value: string): void {
    this.db.run(
      `INSERT OR REPLACE INTO scratchpad (thread_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))`,
      [threadId, key, value]
    );
  }

  read(threadId: string, key: string): string | null {
    const row = this.db
      .query(`SELECT value FROM scratchpad WHERE thread_id = ? AND key = ?`)
      .get(threadId, key) as any;
    return row?.value ?? null;
  }

  list(threadId: string): Record<string, string> {
    const rows = this.db
      .query(`SELECT key, value FROM scratchpad WHERE thread_id = ?`)
      .all(threadId) as any[];
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  delete(threadId: string, key: string): void {
    this.db.run(
      `DELETE FROM scratchpad WHERE thread_id = ? AND key = ?`,
      [threadId, key]
    );
  }

  clear(threadId: string): void {
    this.db.run(`DELETE FROM scratchpad WHERE thread_id = ?`, [threadId]);
  }
}
