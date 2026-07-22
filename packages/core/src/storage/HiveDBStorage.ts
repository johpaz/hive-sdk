import { HiveDB, type Collection, type EventInput, type Event } from "@johpaz/hive-db";
import * as path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { getHiveDir } from "../config/loader.ts";
import { logger } from "../utils/logger.ts";

const log = logger.child("hivedb-storage");

let _db: HiveDB | null = null;
let _opening: Promise<HiveDB> | null = null;

export function getHiveDbPath(): string {
  return path.join(getHiveDir(), "data", "hive");
}

export function openHiveDB(): Promise<HiveDB> {
  if (_db) return Promise.resolve(_db);
  if (_opening) return _opening;

  const hiveDir = getHiveDir();
  const dir = path.join(hiveDir, "data");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const dbPath = getHiveDbPath();
  log.info(`[hivedb] Opening HiveDB at ${dbPath}`);
  _opening = HiveDB.open(dbPath, { vector: { dimension: 384, spaceId: "hive-sdk-v1" } }).then((db) => {
    _db = db;
    _opening = null;
    return db;
  });
  return _opening;
}

export async function getHiveDB(): Promise<HiveDB> {
  if (_db) return _db;
  if (_opening) return _opening;
  return openHiveDB();
}

export async function closeHiveDB(): Promise<void> {
  if (_db) {
    _db.close();
    _db = null;
  }
  _opening = null;
}

export async function hiveCollection<T = unknown>(name: string): Promise<Collection<T>> {
  return (await getHiveDB()).collection<T>(name);
}

export async function hiveAppend(input: EventInput): Promise<number> {
  return (await getHiveDB()).append(input);
}

export async function hiveRead(seq: number): Promise<Event> {
  return (await getHiveDB()).read(seq);
}

export function isHiveDBInitialized(): boolean {
  return _db !== null;
}
