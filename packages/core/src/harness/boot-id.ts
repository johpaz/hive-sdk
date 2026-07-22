/**
 * boot-id — a unique id generated on every process start so that durable
 * leases (harness runs / jobs) can detect which rows belong to a dead
 * process after a crash/restart.
 */

import { randomBytes } from "node:crypto";

let currentBootId: string | null = null;

export function getBootId(): string {
  if (!currentBootId) {
    currentBootId = randomBytes(8).toString("hex");
  }
  return currentBootId;
}

export function resetBootId(): void {
  currentBootId = null;
}
