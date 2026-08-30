/**
 * Services — la superficie que maneja una interfaz, no el modelo.
 *
 * El SDK nació para que lo condujera un LLM: casi todo el CRUD vivía dentro de
 * las tools (`cronCreateTool`, `memoryWriteTool`, `agentCreateTool`…), con
 * argumentos con forma de LLM y respuestas escritas para un prompt. Montar una
 * UI encima obligaba a llamar `tool.execute({...})` y parsear prosa, o a
 * escribir consultas crudas contra HiveDB conociendo un esquema privado.
 *
 * Acá vive la implementación y las tools pasan a envolverla: una sola
 * implementación con dos consumidores, el modelo y la aplicación.
 *
 * Es deliberadamente **agnóstico del framework** — funciones, no rutas HTTP.
 * Una app móvil o de escritorio que embeba el runtime no quiere un servidor; y
 * quien haga una UI web monta sus rutas encima en unas pocas líneas, que es
 * exactamente lo que hace hive (ver `gateway/routes/conversations.ts`, delgada
 * porque toda su lógica está en `agent/thread-store.ts`).
 *
 * Convención: estas funciones **lanzan** ante un error en vez de devolver
 * `{ok:false}`. Quien construye una UI quiere `try/catch`, no inspeccionar un
 * campo. La traducción al formato del modelo la hace el envoltorio de la tool.
 */

export * as memory from "./memory.ts";
export * as agents from "./agents.ts";
export * as skills from "./skills.ts";
export * as cron from "./cron.ts";
export * as tools from "./tools.ts";
export * as ethics from "./ethics.ts";
export * as providers from "./providers.ts";
export * as models from "./models.ts";
export * as mcp from "./mcp.ts";
export * as swarms from "./swarms.ts";
export * as endpoints from "./endpoints.ts";
export * as setup from "./setup.ts";
export * as images from "./images.ts";

// También sueltas, para quien prefiera importar la función directa.
export {
  writeMemory, readMemory, listMemories, searchMemories, deleteMemory,
  type MemoryEntry, type MemorySearchHit,
} from "./memory.ts";

export {
  createAgent, getAgent, listAgents, updateAgent, deleteAgent,
  assignTools, assignSkills, assignMcpServers, enableAgent, disableAgent,
  type AgentSummary, type CreateAgentInput, type UpdateAgentInput, type ListAgentsOptions,
} from "./agents.ts";

export {
  createSkill, getSkill, listSkills, updateSkill, deleteSkill, toggleSkill,
  importSkillFromDisk,
  type SkillSummary, type CreateSkillInput, type UpdateSkillInput,
} from "./skills.ts";

export {
  createCronJob, getCronJob, listCronJobs, updateCronJob, deleteCronJob,
  pauseCronJob, resumeCronJob, triggerCronJob, getCronHistory, hasScheduler,
  type CronJobSummary, type CreateCronInput, type UpdateCronInput,
} from "./cron.ts";

export {
  listTools, getTool, toggleTool, updateToolMetadata,
  type ToolSummary,
} from "./tools.ts";

export {
  listEthics, getEthics, createEthics, updateEthics, toggleEthics, deleteEthics,
  type EthicsSummary,
} from "./ethics.ts";

export {
  listProviders, getProvider, createProvider, updateProvider, toggleProvider, deleteProvider,
  type ProviderSummary,
} from "./providers.ts";

export {
  listModels, getModel, createModel, toggleModel, deleteModel, renameModel, agentsUsingModel,
  type ModelSummary,
} from "./models.ts";

export {
  listMcpServers, getMcpServer, createMcpServer, updateMcpServer,
  testMcpServer, toggleMcpServer, deleteMcpServer,
  type McpServerSummary, type CreateMcpInput,
} from "./mcp.ts";

export {
  createSwarm, getSwarm, listSwarms, updateSwarm, deleteSwarm, toggleSwarm, runSwarm,
  type SwarmSummary, type SwarmMember, type CreateSwarmInput, type UpdateSwarmInput,
  type RunSwarmOptions,
} from "./swarms.ts";

export {
  createEndpoint, getEndpoint, listEndpoints, updateEndpoint, deleteEndpoint,
  toggleEndpoint, testEndpoint, registerEndpointTools, buildEndpointTool, toolNameFor,
  type EndpointSummary, type CreateEndpointInput,
} from "./endpoints.ts";

export {
  planSeedFor, applySeedPlan, enableCatalogAgent, enableCatalogAgents,
  disableCatalogAgent, listEnabledCatalogAgents, listCatalogPersonas,
  planActivationFor, CATALOG_AGENT_IDS,
  type SeedPlan, type ActivationGap,
} from "./setup.ts";

export {
  uploadImage, transformStoredImage, getImageBytes, listImages,
  setImageRetention, deleteImage, applyPreset, IMAGE_PRESETS,
  type StoredImage, type TransformResult, type TransformSource,
  type UploadOptions, type ServiceTransformOptions, type ImagePreset,
} from "./images.ts";
