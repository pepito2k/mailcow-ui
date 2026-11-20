/**
 * Samples mailcow's host stats (GET /api/v1/get/status/host) every 15 seconds
 * and keeps the last hour in memory, so charts have history as soon as they open.
 * Sampling pauses when nobody has looked at the charts for 10 minutes.
 */
import { fetch as undiciFetch, type Agent } from "undici";

export interface Sample {
  t: number; // ms epoch
  cpu: number | null; // percent
  mem: number | null; // percent
  memUsed: number | null; // bytes
  memTotal: number | null; // bytes
}

export interface HostInfo {
  cores: number | null;
  memTotal: number | null;
  uptime: number | null; // seconds
  architecture: string | null;
}

const INTERVAL_MS = Number(process.env.HOST_STATS_INTERVAL_MS) || 15_000;
const KEEP_MS = 60 * 60 * 1000;
const IDLE_MS = 10 * 60 * 1000;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Accepts the shapes mailcow has used: usage as a percent, or used/total in bytes. */
export function parseHost(d: Record<string, unknown>): { sample: Omit<Sample, "t">; info: HostInfo } {
  const cpu = (d.cpu ?? {}) as Record<string, unknown>;
  const memory = (d.memory ?? {}) as Record<string, unknown>;
  const memTotal = num(memory.total);
  const memUsedBytes = num(memory.used);
  let memPct = num(memory.usage);
  if (memPct === null && memUsedBytes !== null && memTotal) memPct = (memUsedBytes / memTotal) * 100;
  const cpuPct = num(cpu.usage);
  const clamp = (v: number | null) => (v === null ? null : Math.max(0, Math.min(100, v)));
  return {
    sample: {
      cpu: clamp(cpuPct),
      mem: clamp(memPct),
      memUsed: memUsedBytes ?? (memPct !== null && memTotal ? (memPct / 100) * memTotal : null),
      memTotal,
    },
    info: { cores: num(cpu.cores), memTotal, uptime: num(d.uptime), architecture: typeof d.architecture === "string" ? d.architecture : null },
  };
}

export class HostSampler {
  private samples: Sample[] = [];
  private info: HostInfo | null = null;
  private lastError: string | null = null;
  private lastViewed = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private url: string, private apiKey: string, private dispatcher: Agent) {}

  private async sample() {
    try {
      const r = await undiciFetch(`${this.url}/api/v1/get/status/host`, {
        headers: { "X-API-Key": this.apiKey, Accept: "application/json" },
        dispatcher: this.dispatcher,
        signal: AbortSignal.timeout(10_000),
      });
      const d = (await r.json()) as Record<string, unknown>;
      if (!r.ok || d.type === "error") throw new Error(`mailcow answered ${r.status}`);
      const { sample, info } = parseHost(d);
      if (sample.cpu === null && sample.mem === null) throw new Error("mailcow didn't return CPU or memory numbers");
      this.info = info;
      this.lastError = null;
      const now = Date.now();
      this.samples.push({ t: now, ...sample });
      while (this.samples.length && this.samples[0].t < now - KEEP_MS) this.samples.shift();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  private tick = async () => {
    if (Date.now() - this.lastViewed > IDLE_MS) {
      this.timer = null;
      return;
    }
    await this.sample();
    this.timer = setTimeout(this.tick, INTERVAL_MS);
  };

  /** Returns current history and keeps sampling for the next 10 minutes. */
  async read() {
    this.lastViewed = Date.now();
    if (!this.timer) {
      // First view (or after idling): take a sample now so there's something to show.
      if (!this.samples.length || Date.now() - this.samples[this.samples.length - 1].t > INTERVAL_MS) await this.sample();
      this.timer = setTimeout(this.tick, INTERVAL_MS);
    }
    return { intervalMs: INTERVAL_MS, info: this.info, samples: this.samples, error: this.lastError };
  }
}
