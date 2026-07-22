/**
 * Fixed-worker epoch (harness-engineering concept): the exact
 * provider/model/app-version/tool-catalog combination a run executed under.
 * A model or tool-catalog change is a requalification signal — proof
 * packets from different epochs shouldn't be compared as if the "worker"
 * were unchanged.
 */

export interface RunEpoch {
  provider: string;
  model: string;
  /** Caller-supplied version identifier (e.g. the host app's package version) — the harness doesn't assume its own version is what matters. */
  app_version: string;
  tool_catalog_hash: string;
}

/** Stable non-cryptographic hash (djb2) over sorted tool names — a cheap fingerprint of the active tool catalog. */
function hashToolNames(names: string[]): string {
  const sorted = [...names].sort().join(",");
  let hash = 5381;
  for (let i = 0; i < sorted.length; i++) hash = ((hash * 33) ^ sorted.charCodeAt(i)) >>> 0;
  return hash.toString(16);
}

export function buildRunEpoch(opts: { provider: string; model: string; appVersion: string; toolNames: string[] }): RunEpoch {
  return {
    provider: opts.provider,
    model: opts.model,
    app_version: opts.appVersion,
    tool_catalog_hash: hashToolNames(opts.toolNames),
  };
}
