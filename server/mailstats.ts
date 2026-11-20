/**
 * Mail volume over time, built from rspamd's scan history (GET /api/v1/get/logs/rspamd-history/<n>).
 * rspamd only keeps a limited number of recent messages, so the covered period depends on
 * how busy the server is; the response says which period it covers.
 */

export interface Bucket {
  t: number; // bucket start, ms epoch
  received: number; // inbound, delivered normally
  spam: number; // inbound, delivered but marked as spam
  rejected: number; // refused by rspamd
  sent: number; // outbound from a signed-in user
}

export interface MailStats {
  bucketMs: number;
  buckets: Bucket[];
  totals: Omit<Bucket, "t"> & { greylisted: number };
  from: number | null; // oldest message seen
  to: number;
  messages: number;
}

const FETCH = 5000;
const MAX_SPAN_MS = 7 * 24 * 3600_000;
const HOUR = 3600_000;

type Row = Record<string, unknown>;

export function classify(r: Row): keyof Omit<Bucket, "t"> | "greylisted" | null {
  const action = String(r.action ?? "").toLowerCase();
  const user = typeof r.user === "string" ? r.user.trim() : "";
  const outbound = !!user && user !== "unknown";
  if (action === "reject") return "rejected";
  if (action === "greylist" || action === "soft reject") return "greylisted";
  if (outbound) return "sent";
  if (action === "add header" || action === "rewrite subject") return "spam";
  if (action === "no action" || action === "") return "received";
  return "received";
}

export function bucketize(rows: Row[], now = Date.now()): MailStats {
  const times = rows
    .map((r) => ({ r, t: Number(r.unix_time ?? r.time) * 1000 }))
    .filter((x) => Number.isFinite(x.t) && x.t > 0 && x.t <= now + 60_000 && x.t >= now - MAX_SPAN_MS);
  const from = times.length ? Math.min(...times.map((x) => x.t)) : null;
  const span = from === null ? 24 * HOUR : Math.max(24 * HOUR, now - from);
  const bucketMs = span <= 48 * HOUR ? HOUR : 6 * HOUR;
  const end = Math.ceil(now / bucketMs) * bucketMs;
  const n = Math.ceil(span / bucketMs);
  const start = end - n * bucketMs;
  const buckets: Bucket[] = Array.from({ length: n }, (_, i) => ({ t: start + i * bucketMs, received: 0, spam: 0, rejected: 0, sent: 0 }));
  const totals = { received: 0, spam: 0, rejected: 0, sent: 0, greylisted: 0 };
  for (const { r, t } of times) {
    const k = classify(r);
    if (!k) continue;
    totals[k]++;
    if (k === "greylisted") continue;
    const i = Math.floor((t - start) / bucketMs);
    if (i >= 0 && i < n) buckets[i][k]++;
  }
  return { bucketMs, buckets, totals, from, to: now, messages: times.length };
}

let cache: { at: number; body: MailStats } | null = null;

export async function mailStats(fetchHistory: (n: number) => Promise<unknown>): Promise<MailStats> {
  if (cache && Date.now() - cache.at < 60_000) return cache.body;
  const data = await fetchHistory(FETCH);
  const rows = Array.isArray(data) ? (data as Row[]) : [];
  const body = bucketize(rows);
  cache = { at: Date.now(), body };
  return body;
}
