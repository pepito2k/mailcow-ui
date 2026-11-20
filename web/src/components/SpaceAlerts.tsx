import { Link } from "react-router";
import { AlertOctagon, AlertTriangle, HardDrive } from "lucide-react";
import { useDomains, useMailboxes, useVmail } from "../lib/queries";
import { bytes, pct } from "../lib/format";

/** Percent at which something counts as nearly full (warn) and full (critical). */
export const SPACE_WARN = 80;
export const SPACE_BAD = 90;

interface Alert {
  key: string;
  level: "warn" | "bad";
  title: React.ReactNode;
  detail: string;
  to: string;
  value: number;
}

/** Collects mailboxes, domains and the mail disk that are close to full. */
export function useSpaceAlerts() {
  const mailboxes = useMailboxes();
  const domains = useDomains();
  const vmail = useVmail();
  const alerts: Alert[] = [];
  const level = (p: number) => (p >= SPACE_BAD ? "bad" : "warn") as Alert["level"];

  const disk = parseFloat(String(vmail.data?.used_percent ?? ""));
  if (Number.isFinite(disk) && disk >= SPACE_WARN)
    alerts.push({
      key: "disk",
      level: level(disk),
      title: <>Server disk is {Math.round(disk)}% full</>,
      detail: `${vmail.data!.used} of ${vmail.data!.total} used on ${vmail.data!.disk || "the mail volume"}. When it fills up, mail can't be delivered.`,
      to: "/system",
      value: disk,
    });

  for (const d of domains.data ?? []) {
    const p = Number(d.max_quota_for_domain) ? pct(d.bytes_total, d.max_quota_for_domain) : 0;
    if (p >= SPACE_WARN)
      alerts.push({
        key: `d:${d.domain_name}`,
        level: level(p),
        title: (
          <>
            Domain <strong>{d.domain_name}</strong> is {p}% full
          </>
        ),
        detail: `${bytes(d.bytes_total)} of ${bytes(d.max_quota_for_domain)} domain storage used.`,
        to: `/domains/${encodeURIComponent(d.domain_name)}`,
        value: p,
      });
  }

  for (const m of mailboxes.data ?? []) {
    if (!Number(m.quota)) continue; // 0 = unlimited
    const p = pct(m.quota_used, m.quota);
    if (p >= SPACE_WARN)
      alerts.push({
        key: `m:${m.username}`,
        level: level(p),
        title: (
          <>
            Mailbox <strong>{m.username}</strong> is {p}% full
          </>
        ),
        detail: `${bytes(m.quota_used)} of ${bytes(m.quota)}. ${p >= 100 ? "New mail is being refused." : "New mail will be refused once it's full."}`,
        to: `/mailboxes?q=${encodeURIComponent(m.username)}`,
        value: p,
      });
  }

  alerts.sort((a, b) => (a.level === b.level ? b.value - a.value : a.level === "bad" ? -1 : 1));
  return { alerts, loading: mailboxes.isLoading || domains.isLoading || vmail.isLoading };
}

/** "Running out of space" panel for the dashboard. Renders nothing when all is fine. */
export function SpaceAlerts() {
  const { alerts } = useSpaceAlerts();
  if (!alerts.length) return null;
  const shown = alerts.slice(0, 6);
  const bad = alerts.some((a) => a.level === "bad");
  return (
    <section className={`space-alerts ${bad ? "space-alerts-bad" : ""}`} aria-label="Storage warnings">
      <div className="space-alerts-head">
        <HardDrive size={18} />
        <strong>{alerts.length === 1 ? "1 thing is running out of space" : `${alerts.length} things are running out of space`}</strong>
      </div>
      <ul className="space-alerts-list">
        {shown.map((a) => (
          <li key={a.key}>
            <Link to={a.to} className="space-alert">
              {a.level === "bad" ? <AlertOctagon size={16} className="tone-bad" /> : <AlertTriangle size={16} className="tone-warn" />}
              <span className="sr-only">{a.level === "bad" ? "Critical:" : "Warning:"}</span>
              <span>
                <span className="space-alert-title">{a.title}</span>
                <span className="muted small space-alert-detail">{a.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {alerts.length > shown.length && <div className="muted small">And {alerts.length - shown.length} more.</div>}
    </section>
  );
}
