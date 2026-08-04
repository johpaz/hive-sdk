/**
 * Scheduler — cron con Croner sobre HiveDB.
 *
 * Soporta jobs recurrentes y de una sola vez. La persistencia pasó de SQLite a
 * las colecciones `cronJobs` / `taskRuns` de HiveDB en 0.1.5.
 */

export { CronScheduler } from "./CronScheduler.ts";
// `executeScheduledTask` dejó de ser público: la ejecución entra por
// `createTaskHandler()`, que es lo que el scheduler engancha.
export { createTaskHandler, notifyTaskCompletion, setSchedulerForCleanup } from "./integration.ts";
export type {
  CronJob,
  TaskRun,
  CreateCronJobInput,
  UpdateCronJobInput,
  CronJobStatus,
  CronJobExecutionHandler,
  CronJobExecutionResult,
  TaskType,
  TaskStatus,
  TaskRunStatus,
  CronerOptions,
} from "./types.ts";
