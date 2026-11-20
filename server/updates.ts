/**
 * Checks for the newest mailcow release on GitHub, cached in memory.
 * mailcow tags releases like "2025-09", "2025-09a", "2025-10".
 */
import { fetch as undiciFetch } from "undici";

const RELEASES_URL = process.env.UPDATE_CHECK_URL || "https://api.github.com/repos/mailcow/mailcow-dockerized/releases/latest";
const ENABLED = process.env.UPDATE_CHECK !== "0";
const TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;

export interface Release {
  version: string;
  name: string;
  url: string;
  publishedAt: string;
}

let cache: { at: number; release: Release | null; error?: string } | null = null;
let inflight: Promise<void> | null = null;

/** Turns "2025-09a" (or "mailcow 2025-09a") into a sortable key, or null if it isn't a release version. */
export function versionKey(v: string | undefined | null): string | null {
  const m = /(\d{4})-(\d{2})([a-z]?)/i.exec(String(v ?? ""));
  return m ? `${m[1]}-${m[2]}${(m[3] || "").toLowerCase() || " "}` : null;
}

export function isNewer(latest: string, current: string): boolean | null {
  const a = versionKey(latest);
  const b = versionKey(current);
  if (!a || !b) return null;
  return a > b;
}

async function refresh() {
  try {
    const r = await undiciFetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "mailcow-ui" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const j = (await r.json()) as { tag_name?: string; name?: string; html_url?: string; published_at?: string };
    if (!j.tag_name) throw new Error("No tag in the latest release");
    cache = { at: Date.now(), release: { version: j.tag_name, name: j.name || j.tag_name, url: j.html_url || "", publishedAt: j.published_at || "" } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Keep serving the last good answer, and try again sooner.
    cache = { at: Date.now() - TTL_MS + RETRY_MS, release: cache?.release ?? null, error: msg };
    console.warn(`Update check failed: ${msg}`);
  }
}

export async function latestRelease(): Promise<{ enabled: boolean; release: Release | null; error?: string }> {
  if (!ENABLED) return { enabled: false, release: null };
  if (!cache || Date.now() - cache.at > TTL_MS) {
    inflight ??= refresh().finally(() => (inflight = null));
    await inflight;
  }
  return { enabled: true, release: cache?.release ?? null, error: cache?.error };
}
