import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { CacheState } from "../shared/cache";

export type PaseoAgent = Exclude<Parameters<PluginClientContext["paseo"]["agents"]["ref"]>[0], string>;

export type Warmth =
  | { kind: "live" | "cold" | "unknown" }
  | { kind: "warm" | "cooling"; msLeft: number };

export const isClaude = (agent: PaseoAgent) =>
  agent.provider.split("/")[0] === "claude" && agent.status !== "closed" && !agent.archivedAt;

export const isLive = (agent: PaseoAgent) => agent.status === "running" || agent.status === "initializing";

export const sessionIdOf = (agent: PaseoAgent) =>
  agent.runtimeInfo?.sessionId ?? agent.persistence?.sessionId ?? null;

export function warmthOf(agent: PaseoAgent, state: CacheState | null | undefined, now = Date.now()): Warmth {
  if (isLive(agent)) return { kind: "live" };
  if (!state) return { kind: "unknown" };
  // Caches are per model: after a model switch the next request starts cold.
  const model = agent.runtimeInfo?.model ?? agent.model;
  if (model && model !== state.model) return { kind: "cold" };
  const msLeft = Date.parse(state.touchedAt) + state.ttlMs - now;
  if (msLeft <= 0) return { kind: "cold" };
  return { kind: msLeft <= Math.min(5 * 60_000, state.ttlMs / 5) ? "cooling" : "warm", msLeft };
}

export function warmthLabel(w: Warmth): string {
  switch (w.kind) {
    case "live": return "cache live";
    case "cold": return "cache cold";
    case "unknown": return "cache ?";
    default: {
      const s = Math.floor(w.msLeft / 1000);
      return `cache ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
  }
}

export function warmthIcon(w: Warmth): string {
  switch (w.kind) {
    case "cold": return "Snowflake";
    case "unknown": return "CircleHelp";
    case "cooling": return "Hourglass";
    default: return "Flame";
  }
}
