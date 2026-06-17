import { createAgent } from "@johpaz/hive-sdk";

export const coordinatorAgent = await createAgent({
  name: "coordinator",
  provider: "openai",
  model: "gpt-4o-mini",
  systemPrompt:
    "You are the coordinator agent. You orchestrate tasks, answer questions, and delegate to specialized agents when needed.",
});
