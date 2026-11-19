export function bytes(n: number | string | undefined | null): string {
  const v = Number(n ?? 0);
  if (!isFinite(v) || v <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(v) / Math.log(1024)), units.length - 1);
  const val = v / 1024 ** i;
  return `${val >= 100 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

export const toMiB = (b: number | string) => Math.round(Number(b) / (1024 * 1024));

export function pct(used: number | string, total: number | string): number {
  const t = Number(total);
  if (!t) return 0;
  return Math.min(100, Math.round((Number(used) / t) * 100));
}

export function isActive(v: unknown): boolean {
  return String(v) === "1" || v === true;
}

export function ago(ts: number | string | undefined | null): string {
  const t = Number(ts);
  if (!t) return "Never";
  const secs = Math.floor(Date.now() / 1000 - t);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(t * 1000).toLocaleDateString();
}

export function dateTime(ts: number | string | undefined | null): string {
  const t = Number(ts);
  if (!t) return "";
  return new Date(t * 1000).toLocaleString();
}

export function plural(n: number, word: string, pluralWord = word + "s") {
  return `${n.toLocaleString()} ${n === 1 ? word : pluralWord}`;
}
