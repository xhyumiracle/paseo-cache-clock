import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readCacheRpc } from "./shared/cache";
import { readCacheState } from "./server/transcript";

export default function contribute(server: PluginServerContext) {
  server.handle(readCacheRpc, ({ sessionId }) => readCacheState(sessionId).catch(() => null));
  return () => {};
}
