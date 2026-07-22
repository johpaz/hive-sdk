import { getHiveDB } from "./HiveDBStorage.ts";
import { randomUUID } from "crypto";
import { logger } from "../utils/logger.ts";

const log = logger.child("usage");

const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-opus-4-6":           { inputPer1M: 5,    outputPer1M: 25   },
  "claude-sonnet-4-6":         { inputPer1M: 3,    outputPer1M: 15   },
  "claude-haiku-4-5-20251001": { inputPer1M: 1,    outputPer1M: 5    },
  "anthropic/claude-opus-4-6":   { inputPer1M: 5,  outputPer1M: 25   },
  "anthropic/claude-sonnet-4-6": { inputPer1M: 3,  outputPer1M: 15   },
  "gpt-4o":         { inputPer1M: 2.5,  outputPer1M: 10    },
  "gpt-4o-mini":    { inputPer1M: 0.15, outputPer1M: 0.6   },
  "gpt-5.4":        { inputPer1M: 2.5,  outputPer1M: 15    },
  "gpt-5.4-pro":    { inputPer1M: 30,   outputPer1M: 180   },
  "gpt-5.3":        { inputPer1M: 1.75, outputPer1M: 14    },
  "gpt-5.2":        { inputPer1M: 1.75, outputPer1M: 14    },
  "o4-mini":        { inputPer1M: 1.1,  outputPer1M: 4.4   },
  "openai/gpt-5.4":     { inputPer1M: 2.5,  outputPer1M: 15  },
  "openai/gpt-5.4-pro": { inputPer1M: 30,   outputPer1M: 180 },
  "openai/gpt-5.2":     { inputPer1M: 1.75, outputPer1M: 14  },
  "openai/gpt-oss-120b": { inputPer1M: 0.15, outputPer1M: 0.6  },
  "openai/gpt-oss-20b":  { inputPer1M: 0.075, outputPer1M: 0.3 },
  "gemini-3.1-pro-preview":        { inputPer1M: 2,    outputPer1M: 12   },
  "gemini-3.1-flash-lite-preview":  { inputPer1M: 0.25, outputPer1M: 1.5  },
  "gemini-3-flash-preview":         { inputPer1M: 0.5,  outputPer1M: 3    },
  "gemini-2.5-pro":                 { inputPer1M: 1.25, outputPer1M: 10   },
  "gemini-2.5-flash":               { inputPer1M: 0.15, outputPer1M: 0.6  },
  "gemini-2.0-flash":               { inputPer1M: 0.1,  outputPer1M: 0.4  },
  "gemini-2.0-flash-lite":          { inputPer1M: 0.075, outputPer1M: 0.3 },
  "google/gemini-3.1-pro-preview":        { inputPer1M: 2,    outputPer1M: 12  },
  "google/gemini-3.1-flash-lite-preview": { inputPer1M: 0.25, outputPer1M: 1.5 },
  "google/gemini-3-flash-preview":        { inputPer1M: 0.5,  outputPer1M: 3   },
  "google/gemini-2.5-flash":              { inputPer1M: 0.15, outputPer1M: 0.6 },
  "mistral-large-2512":             { inputPer1M: 0.5,  outputPer1M: 1.5  },
  "devstral-2512":                  { inputPer1M: 0.4,  outputPer1M: 2    },
  "ministral-14b-2512":             { inputPer1M: 0.2,  outputPer1M: 0.2  },
  "ministral-8b-2512":              { inputPer1M: 0.15, outputPer1M: 0.15 },
  "codestral-2508":                 { inputPer1M: 0.2,  outputPer1M: 0.6  },
  "mistral-small-3.2-24b-instruct": { inputPer1M: 0.1,  outputPer1M: 0.3  },
  "mistral-large-latest":           { inputPer1M: 0.5,  outputPer1M: 1.5  },
  "codestral-latest":               { inputPer1M: 0.2,  outputPer1M: 0.6  },
  "deepseek-chat":     { inputPer1M: 0.28, outputPer1M: 0.42 },
  "deepseek-reasoner": { inputPer1M: 0.28, outputPer1M: 0.42 },
  "deepseek/deepseek-v3.2":   { inputPer1M: 0.25, outputPer1M: 0.4  },
  "deepseek/deepseek-r1:free": { inputPer1M: 0,    outputPer1M: 0    },
  "kimi-k2.5":          { inputPer1M: 0.45, outputPer1M: 2.2  },
  "kimi-k2":            { inputPer1M: 0.45, outputPer1M: 2.2  },
  "moonshot-v1-8k":     { inputPer1M: 1.67, outputPer1M: 1.67 },
  "moonshot-v1-32k":    { inputPer1M: 3.33, outputPer1M: 3.33 },
  "moonshot-v1-128k":   { inputPer1M: 8.33, outputPer1M: 8.33 },
  "moonshotai/kimi-k2.5":            { inputPer1M: 0.45, outputPer1M: 2.2 },
  "moonshotai/kimi-k2-instruct-0905": { inputPer1M: 0.45, outputPer1M: 2.2 },
  "meta-llama/llama-3.3-70b-instruct": { inputPer1M: 0.88, outputPer1M: 0.88 },
  "meta-llama/llama-4-maverick":       { inputPer1M: 0.2,  outputPer1M: 0.8  },
  "qwen/qwen3.5-plus-02-15":  { inputPer1M: 0.26, outputPer1M: 1.56 },
  "qwen/qwen3.5-flash-02-23": { inputPer1M: 0.1,  outputPer1M: 0.4  },
  "qwen/qwen3-32b":           { inputPer1M: 0,    outputPer1M: 0    },
  "llama-3.3-70b-versatile": { inputPer1M: 0.59, outputPer1M: 0.79 },
  "llama-3.1-8b-instant":    { inputPer1M: 0.05, outputPer1M: 0.08 },
  "groq/compound":            { inputPer1M: 0,    outputPer1M: 0    },
  "groq/compound-mini":       { inputPer1M: 0,    outputPer1M: 0    },
  "qwen3:4b":    { inputPer1M: 0, outputPer1M: 0 },
  "qwen3:8b":    { inputPer1M: 0, outputPer1M: 0 },
  "qwen3:14b":   { inputPer1M: 0, outputPer1M: 0 },
  "llama3.2:3b": { inputPer1M: 0, outputPer1M: 0 },
  "gemma3:9b":   { inputPer1M: 0, outputPer1M: 0 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || { inputPer1M: 0, outputPer1M: 0 };
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputCost + outputCost;
}

export interface UsageRecord {
  id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number | null;
  toon_saved_tokens: number;
  toon_saved_cost: number;
  toon_json_bytes: number;
  toon_toon_bytes: number;
  toon_saved_bytes: number;
  toon_saved_percent: number;
  toon_json_tokens: number;
  toon_toon_tokens: number;
  toon_saved_tokens_pct: number;
  created_at: number;
}

export interface UsageSummary {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  toonSavedTokens: number;
  toonSavedCost: number;
  toonSavedBytes: number;
  toonSavedBytesPercent: number;
  toonJsonTokens: number;
  toonToonTokens: number;
  toonSavingsPercent: number;
  byProvider: Record<string, { tokens: number; costUsd: number; inputTokens: number; outputTokens: number }>;
  byModel: Record<string, { tokens: number; costUsd: number; provider: string; inputTokens: number; outputTokens: number }>;
  recentRecords: UsageRecord[];
}

export async function recordUsage(options: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number;
}): Promise<void> {
  try {
    const db = await getHiveDB();
    const col = db.collection<UsageRecord>("usage_records");
    const costUsd = calculateCost(options.model, options.inputTokens, options.outputTokens);

    await col.put(randomUUID(), {
      id: randomUUID(),
      provider: options.provider,
      model: options.model,
      input_tokens: options.inputTokens,
      output_tokens: options.outputTokens,
      cost_usd: costUsd,
      latency_ms: options.latencyMs ?? null,
      toon_saved_tokens: 0,
      toon_saved_cost: 0,
      toon_json_bytes: 0,
      toon_toon_bytes: 0,
      toon_saved_bytes: 0,
      toon_saved_percent: 0,
      toon_json_tokens: 0,
      toon_toon_tokens: 0,
      toon_saved_tokens_pct: 0,
      created_at: Math.floor(Date.now() / 1000),
    });

    log.info(`[USAGE RECORDED] provider=${options.provider} model=${options.model} input=${options.inputTokens} output=${options.outputTokens} cost=$${costUsd.toFixed(4)}`);
  } catch (error) {
    console.error("Failed to record usage:", error);
  }
}

export async function getUsageStats(hours: number = 24): Promise<UsageSummary> {
  log.info(`[USAGE STATS] Fetching stats for last ${hours} hours`);
  const db = await getHiveDB();
  const col = db.collection<UsageRecord>("usage_records");
  const since = Math.floor(Date.now() / 1000) - (hours * 3600);

  const entries = await col.scan();
  const records = entries.map(e => e.doc).filter(r => r.created_at >= since);

  const totals = records.reduce((acc, r) => ({
    total_input: acc.total_input + r.input_tokens,
    total_output: acc.total_output + r.output_tokens,
    total_cost: acc.total_cost + r.cost_usd,
    toon_saved_tokens: acc.toon_saved_tokens + r.toon_saved_tokens,
    toon_saved_cost: acc.toon_saved_cost + r.toon_saved_cost,
    toon_saved_bytes: acc.toon_saved_bytes + r.toon_saved_bytes,
    toon_saved_percent: acc.toon_saved_percent + r.toon_saved_percent,
    toon_json_tokens: acc.toon_json_tokens + r.toon_json_tokens,
    toon_toon_tokens: acc.toon_toon_tokens + r.toon_toon_tokens,
  }), {
    total_input: 0,
    total_output: 0,
    total_cost: 0,
    toon_saved_tokens: 0,
    toon_saved_cost: 0,
    toon_saved_bytes: 0,
    toon_saved_percent: 0,
    toon_json_tokens: 0,
    toon_toon_tokens: 0,
  });

  const providerMap: UsageSummary["byProvider"] = {};
  const modelMap: UsageSummary["byModel"] = {};

  for (const r of records) {
    if (r.provider === "toon") continue;
    if (!providerMap[r.provider]) {
      providerMap[r.provider] = { inputTokens: 0, outputTokens: 0, tokens: 0, costUsd: 0 };
    }
    providerMap[r.provider].inputTokens += r.input_tokens;
    providerMap[r.provider].outputTokens += r.output_tokens;
    providerMap[r.provider].tokens += r.input_tokens + r.output_tokens;
    providerMap[r.provider].costUsd += r.cost_usd;

    if (!modelMap[r.model]) {
      modelMap[r.model] = { provider: r.provider, inputTokens: 0, outputTokens: 0, tokens: 0, costUsd: 0 };
    }
    modelMap[r.model].inputTokens += r.input_tokens;
    modelMap[r.model].outputTokens += r.output_tokens;
    modelMap[r.model].tokens += r.input_tokens + r.output_tokens;
    modelMap[r.model].costUsd += r.cost_usd;
  }

  const recentRecords = records
    .filter(r => r.created_at >= since)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 20);

  const totalTokens = totals.total_input + totals.total_output;
  const totalIncludingSaved = totalTokens + totals.toon_saved_tokens;
  const toonSavingsPercent = totalIncludingSaved > 0
    ? (totals.toon_saved_tokens / totalIncludingSaved) * 100
    : 0;

  const toonSavedBytesPercent = totals.toon_toon_tokens > 0
    ? (totals.toon_saved_bytes / totals.toon_toon_tokens) * 100
    : 0;

  return {
    totalTokens,
    totalInputTokens: totals.total_input,
    totalOutputTokens: totals.total_output,
    totalCostUsd: totals.total_cost,
    toonSavedTokens: totals.toon_saved_tokens,
    toonSavedCost: totals.toon_saved_cost,
    toonSavedBytes: totals.toon_saved_bytes,
    toonSavedBytesPercent,
    toonJsonTokens: totals.toon_json_tokens,
    toonToonTokens: totals.toon_toon_tokens,
    toonSavingsPercent,
    byProvider: providerMap,
    byModel: modelMap,
    recentRecords,
  };
}

export function getProviderPricing(provider: string, model: string): { inputPer1M: number; outputPer1M: number } {
  return MODEL_PRICING[model] || { inputPer1M: 0, outputPer1M: 0 };
}

export function estimateCostForTokens(model: string, tokens: number): number {
  const pricing = MODEL_PRICING[model] || { inputPer1M: 0, outputPer1M: 0 };
  return (tokens / 1_000_000) * pricing.inputPer1M;
}

export function getAverageTokenCost(model: string): number {
  let pricing = MODEL_PRICING[model];

  if (!pricing) {
    const slashIdx = model.indexOf('/');
    if (slashIdx !== -1) {
      pricing = MODEL_PRICING[model.slice(slashIdx + 1)];
    }
  }

  if (!pricing) {
    for (const [key, p] of Object.entries(MODEL_PRICING)) {
      if (model.includes(key) || key.includes(model)) {
        pricing = p;
        break;
      }
    }
  }

  if (!pricing) return 0;
  return (pricing.inputPer1M + pricing.outputPer1M) / 2 / 1_000_000;
}

export async function recordToonSavings(
  analysis: {
    jsonBytes: number;
    toonBytes: number;
    savedBytes: number;
    savedPercent: number;
    jsonTokens: number;
    toonTokens: number;
    savedTokens: number;
    savedTokensPercent: number;
  },
  costSaved: number,
  category: string
): Promise<void> {
  try {
    const db = await getHiveDB();
    const col = db.collection<UsageRecord>("usage_records");

    await col.put(`toon_${category}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, {
      id: `toon_${category}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      provider: "toon",
      model: category,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      latency_ms: null,
      toon_saved_tokens: Math.max(0, analysis.savedTokens),
      toon_saved_cost: costSaved,
      toon_json_bytes: analysis.jsonBytes,
      toon_toon_bytes: analysis.toonBytes,
      toon_saved_bytes: analysis.savedBytes,
      toon_saved_percent: Math.max(0, analysis.savedPercent),
      toon_json_tokens: analysis.jsonTokens,
      toon_toon_tokens: analysis.toonTokens,
      toon_saved_tokens_pct: Math.max(0, analysis.savedTokensPercent),
      created_at: Math.floor(Date.now() / 1000),
    });

    log.debug(`[TOON] Recorded ${analysis.savedTokens} tokens ($${costSaved.toFixed(6)}) saved for ${category}`);
  } catch (error) {
    log.warn(`[TOON] Failed to record savings:`, error);
  }
}
