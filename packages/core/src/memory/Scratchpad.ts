import { getHiveDB } from "../storage/HiveDBStorage.ts";

interface ScratchpadDoc {
  threadId: string;
  key: string;
  value: string;
  updatedAt: number;
}

export class Scratchpad {
  async write(threadId: string, key: string, value: string): Promise<void> {
    const db = await getHiveDB();
    const col = db.collection<ScratchpadDoc>("scratchpad");
    await col.put(this.docId(threadId, key), { threadId, key, value, updatedAt: Date.now() });
  }

  async read(threadId: string, key: string): Promise<string | undefined> {
    const db = await getHiveDB();
    const col = db.collection<ScratchpadDoc>("scratchpad");
    const entry = await col.get(this.docId(threadId, key));
    return entry?.doc.value;
  }

  async list(threadId: string): Promise<Record<string, string>> {
    const db = await getHiveDB();
    const col = db.collection<ScratchpadDoc>("scratchpad");
    const entries = await col.scan();
    const result: Record<string, string> = {};
    for (const e of entries) {
      if (e.doc.threadId === threadId) {
        result[e.doc.key] = e.doc.value;
      }
    }
    return result;
  }

  async delete(threadId: string, key: string): Promise<void> {
    const db = await getHiveDB();
    const col = db.collection<ScratchpadDoc>("scratchpad");
    await col.delete(this.docId(threadId, key));
  }

  async clear(threadId: string): Promise<void> {
    const db = await getHiveDB();
    const col = db.collection<ScratchpadDoc>("scratchpad");
    const entries = await col.scan();
    const ids = entries.filter(e => e.doc.threadId === threadId).map(e => e.id);
    await db.batch(ids.map(id => ({ op: "delete" as const, collection: "scratchpad", id })));
  }

  private docId(threadId: string, key: string): string {
    return `${threadId}:${key}`;
  }
}
