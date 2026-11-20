import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { Card, ErrorState, Loading } from "./ui";
import { useWidth } from "../lib/useWidth";

interface Bucket {
  t: number;
  received: number;
  spam: number;
  rejected: number;
  sent: number;
}
interface MailStatsData {
  bucketMs: number;
  buckets: Bucket[];
  totals: { received: number; spam: number; rejected: number; sent: number; greylisted: number };
  from: number | null;
  to: number;
  messages: number;
}

// Stack order bottom -> top. Colors are categorical slots 1-4 (validated light and dark).
const SERIES = [
  { key: "received", label: "Received", cls: "s1", hint: "Delivered to your mailboxes" },
  { key: "sent", label: "Sent", cls: "s2", hint: "Sent by your users" },
  { key: "spam", label: "Spam", cls: "s3", hint: "Delivered, marked as spam" },
  { key: "rejected", label: "Rejected", cls: "s4", hint: "Refused by the spam filter" },
] as const;
type Key = (typeof SERIES)[number]["key"];

export function useMailStats() {
  return useQuery({
    queryKey: ["mail-stats"],
    queryFn: async () => {
      const r = await fetch("/api/mail-stats", { credentials: "same-origin", headers: { Accept: "application/json" } });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((body as { error?: string }).error || `Couldn't load mail stats (${r.status})`);
      return body as MailStatsData;
    },
    refetchInterval: 5 * 60_000,
  });
}

const fmtN = (n: number) => n.toLocaleString();

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function rangeText(d: MailStatsData) {
  if (!d.from) return "No messages yet";
  const hours = (d.to - d.from) / 3600_000;
  return hours < 1.5 ? "Last hour" : hours < 48 ? `Last ${Math.round(hours)} hours` : `Last ${Math.round(hours / 24)} days`;
}

export function MailStats() {
  const q = useMailStats();
  const d = q.data;
  return (
    <Card
      title={
        <span className="chart-title">
          <Mail size={16} /> Mail traffic
        </span>
      }
      actions={d && <span className="muted small">{rangeText(d)}</span>}
    >
      {q.isLoading ? (
        <Loading label="Loading mail stats" />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <>
          <ul className="mstats-legend" aria-label="Totals">
            {SERIES.map((s) => (
              <li key={s.key} title={s.hint}>
                <span className={`mstats-swatch ${s.cls}`} aria-hidden />
                <span className="muted small">{s.label}</span>
                <strong className="mstats-total">{fmtN(d!.totals[s.key])}</strong>
              </li>
            ))}
          </ul>
          <BarChart data={d!} />
          <p className="muted small mstats-note">
            From rspamd's scan history ({fmtN(d!.messages)} most recent messages{d!.totals.greylisted ? `, plus ${fmtN(d!.totals.greylisted)} greylisted and retried later` : ""}). Busy
            servers cover a shorter period.
          </p>
        </>
      )}
    </Card>
  );
}

const H = 200;
const PAD = { l: 40, r: 8, t: 8, b: 22 };

function BarChart({ data }: { data: MailStatsData }) {
  const ref = useRef<SVGSVGElement>(null);
  const [wrap, W] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const b = data.buckets;
  const n = b.length || 1;
  const total = (x: Bucket) => x.received + x.sent + x.spam + x.rejected;
  const max = niceMax(Math.max(0, ...b.map(total)));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / n;
  const bw = Math.max(1, Math.min(18, slot * 0.72));
  const x = (i: number) => PAD.l + i * slot + (slot - bw) / 2;
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const hourly = data.bucketMs <= 3600_000;

  const label = (t: number) => {
    const dt = new Date(t);
    return hourly ? dt.toLocaleTimeString([], { hour: "numeric" }) : dt.toLocaleDateString([], { weekday: "short", day: "numeric" });
  };
  const tickEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 80))));

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.floor((px - PAD.l) / slot);
    setHover(i >= 0 && i < n ? i : null);
  };

  const h = hover != null ? b[hover] : null;
  const end = (t: number) => new Date(t + data.bucketMs);

  return (
    <div className="chart-wrap" ref={wrap}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        height={H}
        className="chart"
        role="img"
        aria-label={`Messages per ${hourly ? "hour" : "6 hours"}: received, sent, spam and rejected`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={PAD.l - 6} y={y(v)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {fmtN(v)}
            </text>
          </g>
        ))}
        {b.map((bk, i) =>
          i % tickEvery === 0 ? (
            <text key={`t${i}`} x={x(i) + bw / 2} y={H - 5} className="chart-axis" textAnchor="middle">
              {label(bk.t)}
            </text>
          ) : null,
        )}
        {hover != null && <rect x={PAD.l + hover * slot} y={PAD.t} width={slot} height={ih} className="mstats-hover" />}
        {b.map((bk, i) => {
          let acc = 0;
          const segs = SERIES.filter((s) => bk[s.key as Key] > 0);
          return (
            <g key={bk.t}>
              {segs.map((s, j) => {
                const v = bk[s.key as Key];
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                const top = j === segs.length - 1;
                // 2px surface gap between stacked segments; the top segment gets rounded ends.
                const hgt = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0));
                const r = top ? Math.min(4, bw / 2, hgt) : 0;
                const x0 = x(i);
                const yy = y1;
                const path = r
                  ? `M${x0},${yy + hgt}V${yy + r}Q${x0},${yy} ${x0 + r},${yy}H${x0 + bw - r}Q${x0 + bw},${yy} ${x0 + bw},${yy + r}V${yy + hgt}Z`
                  : `M${x0},${yy + hgt}V${yy}H${x0 + bw}V${yy + hgt}Z`;
                return hgt > 0 ? <path key={s.key} d={path} className={`mstats-bar ${s.cls}`} /> : null;
              })}
            </g>
          );
        })}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="chart-baseline" />
      </svg>
      {h && (
        <div className="chart-tip mstats-tip" style={{ left: `${Math.min(85, Math.max(15, ((x(hover!) + bw / 2) / W) * 100))}%` }}>
          <div className="muted">
            {hourly
              ? `${new Date(h.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${end(h.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, ${new Date(h.t).toLocaleDateString([], { day: "numeric", month: "short" })}`
              : `${new Date(h.t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} – ${end(h.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </div>
          {[...SERIES].reverse().map((s) => (
            <div key={s.key} className="mstats-tip-row">
              <span className={`mstats-swatch ${s.cls}`} aria-hidden />
              <span>{s.label}</span>
              <strong>{fmtN(h[s.key as Key])}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
