import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const CacheStateSchema = z.object({
  touchedAt: z.string(),
  ttlMs: z.number(),
  model: z.string(),
});
export type CacheState = z.infer<typeof CacheStateSchema>;

// A cache state, "compacted" when the conversation was compacted after the
// last request, or null when the transcript does not settle it.
export const CacheReadSchema = z.union([CacheStateSchema, z.literal("compacted")]).nullable();
export type CacheRead = z.infer<typeof CacheReadSchema>;

export const readCacheRpc = defineRpc({
  name: "cache-warmth.read",
  input: z.object({ sessionId: z.string() }),
  output: CacheReadSchema,
});
