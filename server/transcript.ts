import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CacheRead } from "../shared/cache";

const TTL = { "5m": 5 * 60_000, "1h": 60 * 60_000 };
const FIRST_WINDOW = 256 << 10;
const MAX_WINDOW = 64 << 20;

type Usage = {
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
};
type Entry = {
  type?: string;
  subtype?: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  isSidechain?: boolean;
  isCompactSummary?: boolean;
  requestId?: string;
  message?: { model?: string; usage?: Usage };
};

const isRequest = (e: Entry) =>
  e.type === "assistant" && !!e.requestId && !!e.message?.usage && e.message.model !== "<synthetic>";

// The TTL a request wrote with. Mixed writes count as the shorter one, since
// the newest part of the prompt then expires first. No writes: undefined.
function writeTtl(e: Entry): number | undefined {
  const c = e.message?.usage?.cache_creation;
  if (c?.ephemeral_5m_input_tokens) return TTL["5m"];
  if (c?.ephemeral_1h_input_tokens) return TTL["1h"];
  return undefined;
}

const parse = (line: string): Entry | undefined => {
  try { return JSON.parse(line); } catch { return undefined; } // torn line mid-write
};

// Walks the transcript tail backwards along the parentUuid chain, the same
// chain Claude Code resumes from, so forked or resumed sessions that
// interleave lines in the file do not mix. Off-chain lines are skipped by a
// substring check and never parsed.
//
// The last request R was sent after its nearest ancestor that is either a
// user message or an earlier request; attachment and compact-summary
// timestamps can trail the send and are skipped. That ancestor's timestamp
// is a lower bound on the send, so touchedAt + ttlMs never runs past the
// real expiry. A compaction after R means the next request starts cold.
// Returns undefined when the window is too short to decide.
export function cacheStateOf(lines: string[], atStart: boolean): CacheRead | undefined {
  let last: Entry | undefined;
  let ttl: number | undefined;
  let touchedAt: string | undefined;
  let want: string | null | undefined;
  for (let k = lines.length - 1; k >= 0; k--) {
    if (last && !lines[k].includes(want!)) continue;
    const e = parse(lines[k]);
    if (!e) continue;
    if (!last) {
      if (e.subtype === "compact_boundary" && !e.isSidechain) return "compacted";
      if (!isRequest(e) || e.isSidechain) continue;
      last = e;
      ttl = writeTtl(e);
      want = e.parentUuid;
    } else {
      if (e.uuid !== want) continue;
      want = e.parentUuid;
      if (e.requestId === last.requestId) continue;
      const isPrior = e.type === "assistant" && !!e.requestId;
      if (isPrior || (e.type === "user" && !e.isCompactSummary)) touchedAt ??= e.timestamp;
      // A read-only request refreshes entries at the TTL they were written with.
      if (ttl === undefined && isRequest(e)) ttl = writeTtl(e);
    }
    if (touchedAt && ttl !== undefined) return { touchedAt, ttlMs: ttl, model: last.message!.model! };
    if (!want) return null;
  }
  return atStart ? null : undefined;
}

async function readTail(path: string, size: number, start: number): Promise<string[]> {
  const file = await open(path, "r");
  try {
    const buf = Buffer.alloc(size - start);
    await file.read(buf, 0, buf.length, start);
    const lines = buf.toString("utf8").split("\n");
    if (start > 0) lines.shift(); // partial first line
    return lines;
  } finally {
    await file.close();
  }
}

const paths = new Map<string, string>();
const memo = new Map<string, { key: string; state: CacheRead }>();

async function findTranscript(sessionId: string): Promise<string | null> {
  const known = paths.get(sessionId);
  if (known) return known;
  const roots = new Set([process.env.CLAUDE_CONFIG_DIR, join(homedir(), ".claude")].filter((r): r is string => !!r));
  for (const root of roots) {
    const projects = join(root, "projects");
    const dirs = await readdir(projects).catch(() => [] as string[]);
    for (const dir of dirs) {
      const path = join(projects, dir, `${sessionId}.jsonl`);
      if (await stat(path).then(() => true, () => false)) {
        paths.set(sessionId, path);
        return path;
      }
    }
  }
  return null;
}

export async function readCacheState(sessionId: string): Promise<CacheRead> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const path = await findTranscript(sessionId);
  if (!path) return null;
  const { size, mtimeMs } = await stat(path);
  const key = `${size}:${mtimeMs}`;
  const hit = memo.get(sessionId);
  if (hit?.key === key) return hit.state;
  let state: CacheRead = null;
  for (let bytes = FIRST_WINDOW; ; bytes *= 2) {
    const start = Math.max(0, size - bytes);
    const found = cacheStateOf(await readTail(path, size, start), start === 0);
    if (found !== undefined) { state = found; break; }
    if (start === 0 || bytes >= MAX_WINDOW) break;
  }
  memo.set(sessionId, { key, state });
  return state;
}
