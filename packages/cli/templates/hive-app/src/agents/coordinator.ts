import { createAgent } from "@johpaz/hive-sdk";

/**
 * El coordinador de la app.
 *
 * `provider` y `model` tienen que existir en el catálogo sembrado (ver
 * `SEED_DATA.models`): `createAgent` los valida y los persiste en la fila del
 * agente, que es de donde el loop resuelve a qué modelo llamar.
 */
export const coordinatorAgent = await createAgent({
  name: "coordinator",
  provider: "openai",
  model: "gpt-5.6-luna",
  systemPrompt:
    "You are the coordinator agent. You orchestrate tasks, answer questions, and delegate to specialized agents when needed.",
});
