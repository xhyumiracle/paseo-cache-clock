import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { CacheRead } from "../shared/cache";

export type PaseoAgent = Exclude<Parameters<PluginClientContext["paseo"]["agents"]["ref"]>[0], string>;

// Mirrors Claude Code's own prompt cache clock: minutes left while warm, a
// bare red clock when cold, nothing when unknown.
export type Clock =
  | { kind: "hidden" }
  | { kind: "warm"; minutesLeft: number }
  | { kind: "cold"; reason: "expired"; idleMs: number }
  | { kind: "cold"; reason: "compacted" | "model" };

export const isClaude = (agent: PaseoAgent) =>
  agent.provider.split("/")[0] === "claude" && agent.status !== "closed" && !agent.archivedAt;

export const isLive = (agent: PaseoAgent) => agent.status === "running" || agent.status === "initializing";

export const sessionIdOf = (agent: PaseoAgent) =>
  agent.runtimeInfo?.sessionId ?? agent.persistence?.sessionId ?? null;

export function clockOf(agent: PaseoAgent, read: CacheRead | undefined, now = Date.now()): Clock {
  if (!read) return { kind: "hidden" };
  // A running turn rewrites the cache on every request.
  if (isLive(agent)) return read === "compacted" ? { kind: "hidden" } : { kind: "warm", minutesLeft: read.ttlMs / 60_000 };
  if (read === "compacted") return { kind: "cold", reason: "compacted" };
  // Caches are per model: after a model switch the next request starts cold.
  const model = agent.runtimeInfo?.model ?? agent.model;
  if (model && model !== read.model) return { kind: "cold", reason: "model" };
  const touched = Date.parse(read.touchedAt);
  const msLeft = touched + read.ttlMs - now;
  if (msLeft > 0) return { kind: "warm", minutesLeft: Math.ceil(msLeft / 60_000) };
  return { kind: "cold", reason: "expired", idleMs: now - touched };
}

export const clockLabel = (c: Clock) => (c.kind === "warm" ? `${c.minutesLeft}m` : "");

// Hover text, worded as in Claude Code.
export function clockTitle(c: Clock): string {
  if (c.kind === "warm") return `Prompt cache warm, about ${c.minutesLeft} min left.`;
  if (c.kind === "hidden") return "";
  switch (c.reason) {
    case "compacted": return "Prompt cache does not cover the compacted conversation.";
    case "model": return "Prompt cache does not cover the current model.";
    case "expired": return `Prompt cache likely expired (idle ${idle(c.idleMs)}).`;
  }
}

function idle(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}
