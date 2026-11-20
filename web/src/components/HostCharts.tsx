import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cpu, MemoryStick } from "lucide-react";
import { bytes } from "../lib/format";
import { Card, ErrorState, Loading } from "./ui";

interface Sample {
  t: number;
  cpu: number | null;
  mem: number | null;
  memUsed: number | null;
  memTotal: number | null;
}
interface HostStats {
  intervalMs: number;
  info: { cores: number | null; memTotal: number | null; uptime: number | null; architecture: string | null } | null;
  samples: Sample[];
  error: string | null;
}

const WINDOW_MS = 60 * 60 * 1000;

export function useHostStats() {
  return useQuery({
    queryKey: ["host-stats"],
    queryFn: async () => {
      const r = await fetch("/api/host-stats", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`Couldn't load CPU and memory stats (${r.status})`);
      return (await r.json()) as HostStats;
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}

function uptimeText(s: number | null | undefined) {
  if (!s) return null;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d ? `${d} d ${h} h` : `${h} h ${Math.floor((s % 3600) / 60)} min`;
}

/** CPU and memory cards, each with the last hour as a line chart. */
export function HostCharts() {
  const q = useHostStats();
  const d = q.data;
  const last = d?.samples[d.samples.length - 1];

  if (q.isLoading) return <Loading label="Loading CPU and memory" />;
  if (q.error) return <ErrorState error={q.error} />;
  if (d && !d.samples.length)
    return (
      <Card title="CPU and memory">
        <p className="muted">{d.error ? `mailcow didn't return host stats: ${d.error}` : "Collecting the first sample…"}</p>
      </Card>
    );

  const memSub =
    last?.memUsed != null && last?.memTotal ? `${bytes(last.memUsed)} of ${bytes(last.memTotal)}` : d?.info?.memTotal ? `${bytes(d.info.memTotal)} total` : undefined;
  const cpuSub = [d?.info?.cores ? `${d.info.cores} cores` : null, uptimeText(d?.info?.uptime) ? `up ${uptimeText(d?.info?.uptime)}` : null].filter(Boolean).join(" · ");

  return (
    <div className="grid-2">
      <ChartCard title="CPU" icon={<Cpu size={16} />} value={last?.cpu} sub={cpuSub} samples={d!.samples} pick={(s) => s.cpu} />
      <ChartCard title="Memory" icon={<MemoryStick size={16} />} value={last?.mem} sub={memSub} samples={d!.samples} pick={(s) => s.mem} />
    </div>
  );
}

function ChartCard({
  title,
  icon,
  value,
  sub,
  samples,
  pick,
}: {
  title: string;
  icon: React.ReactNode;
  value: number | null | undefined;
  sub?: string;
  samples: Sample[];
  pick: (s: Sample) => number | null;
}) {
  return (
    <Card
      title={
        <span className="chart-title">
          {icon} {title}
        </span>
      }
      actions={<span className="muted small">Last hour</span>}
    >
      <div className="chart-head">
        <span className="chart-value">{value == null ? "–" : `${Math.round(value)}%`}</span>
        {sub && <span className="muted small">{sub}</span>}
      </div>
      <LineChart samples={samples} pick={pick} label={title} />
    </Card>
  );
}

const W = 600;
const H = 150;
const PAD = { l: 34, r: 8, t: 8, b: 20 };

function LineChart({ samples, pick, label }: { samples: Sample[]; pick: (s: Sample) => number | null; label: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const now = samples.length ? samples[samples.length - 1].t : Date.now();
  const t0 = now - WINDOW_MS;
  const x = (t: number) => PAD.l + ((t - t0) / WINDOW_MS) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);

  const pts = useMemo(() => samples.filter((s) => s.t >= t0 && pick(s) != null), [samples, t0, pick]);

  // Break the line where samples are missing (gap > 3 intervals), so idle periods don't draw fake slopes.
  const paths = useMemo(() => {
    const segs: Sample[][] = [];
    let cur: Sample[] = [];
    for (let i = 0; i < pts.length; i++) {
      if (i && pts[i].t - pts[i - 1].t > 60_000) {
        segs.push(cur);
        cur = [];
      }
      cur.push(pts[i]);
    }
    if (cur.length) segs.push(cur);
    return segs.map((seg) => {
      const line = seg.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)},${y(pick(s)!).toFixed(1)}`).join("");
      const area = `${line}L${x(seg[seg.length - 1].t).toFixed(1)},${y(0)}L${x(seg[0].t).toFixed(1)},${y(0)}Z`;
      return { line, area, single: seg.length === 1 ? seg[0] : null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, t0]);

  const onMove = (e: React.PointerEvent) => {
    const svg = ref.current;
    if (!svg || !pts.length) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(x(pts[i].t) - px) < Math.abs(x(pts[best].t) - px)) best = i;
    setHover(best);
  };

  const h = hover != null ? pts[hover] : null;
  const ticks = [0, 50, 100];
  const timeTicks = [60, 45, 30, 15, 0];

  return (
    <div className="chart-wrap">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label={`${label} usage over the last hour`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={PAD.l - 6} y={y(v)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {v}%
            </text>
          </g>
        ))}
        {timeTicks.map((m) => (
          <text key={m} x={x(now - m * 60_000)} y={H - 4} className="chart-axis" textAnchor={m === 60 ? "start" : m === 0 ? "end" : "middle"}>
            {m === 0 ? "now" : `-${m} min`}
          </text>
        ))}
        {paths.map((p, i) => (
          <g key={i}>
            <path d={p.area} className="chart-area" />
            <path d={p.line} className="chart-line" />
            {p.single && <circle cx={x(p.single.t)} cy={y(pick(p.single)!)} r={3} className="chart-dot" />}
          </g>
        ))}
        {h && (
          <g>
            <line x1={x(h.t)} x2={x(h.t)} y1={PAD.t} y2={y(0)} className="chart-cross" />
            <circle cx={x(h.t)} cy={y(pick(h)!)} r={4} className="chart-dot" />
          </g>
        )}
      </svg>
      {h && (
        <div className="chart-tip" style={{ left: `${Math.min(90, Math.max(10, (x(h.t) / W) * 100))}%` }}>
          <strong>{Math.round(pick(h)!)}%</strong>
          <span className="muted">{new Date(h.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        </div>
      )}
      {pts.length < 3 && <div className="chart-note muted small">Collecting data. The chart fills in over the next hour.</div>}
    </div>
  );
}
