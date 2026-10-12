import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const CacheStateSchema = z.object({
  touchedAt: z.string(),
  ttlMs: z.number(),
  model: z.string(),
});
export type CacheState = z.infer<typeof CacheStateSchema>;

export const readCacheRpc = defineRpc({
  name: "cache-warmth.read",
  input: z.object({ sessionId: z.string() }),
  output: CacheStateSchema.nullable(),
});
