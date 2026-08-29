/**
 * Superficie pública de storage.
 *
 * HiveDB es la única fuente de verdad. La capa SQLite síncrona (`SQLiteStorage`,
 * `schema.ts`, `hiveSeed.ts`) desapareció en 0.1.5: convivían dos backends y el
 * seed de HiveDB salía fire-and-forget desde el de SQLite, así que cuál de los
 * dos ganaba dependía del timing.
 */

// ─── Conexión y bootstrap ────────────────────────────────────────────────────
export { getHiveDbPath, getHiveDb, closeHiveDb } from "./hivedb.ts";
export { ensureHiveDb, isBootstrapped } from "./bootstrap.ts";

// ─── Acceso a colecciones ────────────────────────────────────────────────────
export {
  col,
  nextId,
  updateDoc,
  updateManyByIndex,
  findByAny,
  bumpRollup,
  toIndexable,
  fromIndexable,
  NO_PARENT,
  BROADCAST,
} from "./hive.ts";

// ─── Shapes de documento ─────────────────────────────────────────────────────
export type * from "./collections.ts";

// ─── Claves del catálogo de modelos ──────────────────────────────────────────
// El prefijo de revendedor evita que dos providers que sirven el mismo modelo
// se pisen la fila entre sí — ver el JSDoc de model-id.ts.
export { catalogModelKey, wireModelId, isResellerProvider } from "./model-id.ts";

// ─── Seed del catálogo ───────────────────────────────────────────────────────
export type { SeedData } from "./seed.ts";
export {
  SEED_DATA,
  seedAllData,
  seedToolsAndSkills,
  activateElement,
  deactivateElement,
  getAllElements,
  getActiveElements,
} from "./seed.ts";

// ─── Consumo y costos ────────────────────────────────────────────────────────
// El precio vive en la fila del modelo (`input_per_1m` / `output_per_1m`), no en
// un mapa hardcodeado: `MODEL_PRICING` era una segunda lista que se desfasaba
// del catálogo en silencio.
export type { UsageRecord, UsageSummary } from "./usage.ts";
export {
  recordUsage,
  getUsageStats,
  calculateCost,
  invalidateModelPricingCache,
  recordToonSavings,
  hourBucket,
} from "./usage.ts";

// ─── Secretos ────────────────────────────────────────────────────────────────
export {
  ensureSecretsBackend,
  storeSecret,
  loadSecret,
  deleteSecret,
  storeProviderApiKey,
  loadProviderApiKey,
  storeProviderHeaders,
  loadProviderHeaders,
  deleteProviderSecrets,
  storeChannelConfig,
  loadChannelConfig,
  deleteChannelSecrets,
  storeMcpHeaders,
  loadMcpHeaders,
  storeMcpEnv,
  loadMcpEnv,
  deleteMcpSecrets,
  storeAgentHeaders,
  loadAgentHeaders,
  deleteAgentSecrets,
  maskApiKey,
  hashPassword,
  verifyPassword,
} from "./crypto.ts";

// ─── Onboarding e identidad ──────────────────────────────────────────────────
export type { OnboardingSection } from "./onboarding.ts";
export { activateBrowserTools } from "./onboarding.ts";
export {
  resolveUserId,
  resolveAgentId,
  initOnboardingDb,
  saveUserProfile,
  saveProviderConfig,
  saveAgentConfig,
  activateProvider,
  activateModel,
  deactivateProvider,
  deactivateModel,
  getAllProviders,
  getAllModels,
} from "./onboarding.ts";
export { normalizeUserEmail } from "./user-email.ts";

// ─── Durabilidad entre arranques ─────────────────────────────────────────────
export { getBootId, resetBootId } from "./boot-id.ts";
export type { ReconcileResult } from "./reconcile.ts";
export { reconcileOnBoot } from "./reconcile.ts";

// ─── Log causal (G9) ─────────────────────────────────────────────────────────
export type { CausalEvent, CausalEventPattern } from "./causal-events.ts";
export { watchCausalEvents, formatCausalEvent } from "./causal-events.ts";
