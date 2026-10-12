import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { readCacheRpc, type CacheState } from "../shared/cache";
import { isClaude, isLive, sessionIdOf, warmthIcon, warmthLabel, warmthOf, type PaseoAgent } from "./warmth";

// This plugin typechecks without the DOM library. Declare only what this module uses.
declare function setInterval(handler: () => void, ms: number): number;
declare function clearInterval(id: number): void;
declare const console: { error(...args: unknown[]): void };

type Pill = { agent: PaseoAgent; state?: CacheState | null; handle: PluginButtonRegistration; label: string };

// One composer pill per Claude agent, driven by the agent list subscription.
// The cache only changes while a turn runs, so its state is read from the
// daemon when a pill appears and each time a turn ends. A one-second tick
// redraws the countdown locally.
export function contributePills(client: PluginClientContext): () => void {
  const pills = new Map<string, Pill>();
  const lifetime = new AbortController();

  const draw = (pill: Pill) => {
    const w = warmthOf(pill.agent, pill.state);
    const label = warmthLabel(w);
    if (label === pill.label) return;
    pill.label = label;
    pill.handle.update({ label, icon: warmthIcon(w) });
  };

  const read = (pill: Pill) => {
    const sessionId = sessionIdOf(pill.agent);
    if (!sessionId) return;
    client.rpc(readCacheRpc, { sessionId }).then(
      (state) => { if (pills.get(pill.agent.id) === pill) { pill.state = state; draw(pill); } },
      (error) => console.error("cache-warmth: read failed", error),
    );
  };

  const remove = (id: string) => {
    pills.get(id)?.handle.remove();
    pills.delete(id);
  };

  const register = (agent: PaseoAgent) => {
    if (lifetime.signal.aborted) return;
    if (pills.get(agent.id)?.agent.workspaceId !== agent.workspaceId) remove(agent.id);
    if (!isClaude(agent) || !agent.workspaceId) return remove(agent.id);
    const existing = pills.get(agent.id);
    if (existing) {
      const turnEnded = isLive(existing.agent) && !isLive(agent);
      const resumed = sessionIdOf(existing.agent) !== sessionIdOf(agent);
      existing.agent = agent;
      if (turnEnded || resumed) read(existing);
      return draw(existing);
    }
    const w = warmthOf(agent, undefined);
    const created: Pill = {
      agent,
      label: warmthLabel(w),
      handle: client.addComposerPill({
        id: "cache-warmth",
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        button: {
          title: "Prompt cache: time left before it expires",
          label: warmthLabel(w),
          icon: warmthIcon(w),
          behavior: { kind: "action", onPress: () => {} },
        },
      }),
    };
    pills.set(agent.id, created);
    read(created);
  };

  const removeAll = () => {
    for (const id of [...pills.keys()]) remove(id);
  };

  // Delivers existing agents, then updates, and a fresh snapshot after a reconnect.
  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          removeAll();
          for (const { agent } of entries) register(agent);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "upsert") return register(update.agent);
          remove(update.agentId);
        },
      });
    })
    .catch((error) => {
      if (!lifetime.signal.aborted) console.error("cache-warmth: agent subscription failed", error);
    });

  const tick = setInterval(() => pills.forEach(draw), 1_000);
  return () => {
    lifetime.abort();
    clearInterval(tick);
    removeAll();
  };
}
