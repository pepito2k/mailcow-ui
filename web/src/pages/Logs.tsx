import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLogs } from "../lib/queries";
import { dateTime } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader, SearchInput } from "../components/ui";

const TYPES = [
  { id: "postfix", label: "Postfix (SMTP)" },
  { id: "dovecot", label: "Dovecot (IMAP/POP3)" },
  { id: "rspamd-history", label: "Spam filter" },
  { id: "sogo", label: "Webmail (SOGo)" },
  { id: "netfilter", label: "Netfilter (bans)" },
  { id: "ratelimited", label: "Rate limited" },
  { id: "autodiscover", label: "Autodiscover" },
  { id: "acme", label: "Certificates (ACME)" },
  { id: "watchdog", label: "Watchdog" },
  { id: "api", label: "API" },
];

type Row = Record<string, unknown>;

function toText(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(toText).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function rowTime(r: Row) {
  return Number(r.time ?? r.unix_time ?? 0);
}

function columnsFor(type: string, rows: Row[]): { key: string; label: string }[] {
  if (type === "rspamd-history")
    return [
      { key: "sender_smtp", label: "From" },
      { key: "rcpt_smtp", label: "To" },
      { key: "subject", label: "Subject" },
      { key: "score", label: "Score" },
      { key: "action", label: "Action" },
    ];
  if (type === "api")
    return [
      { key: "method", label: "Method" },
      { key: "uri", label: "Path" },
      { key: "remote", label: "From IP" },
    ];
  const first = rows[0] ?? {};
  if ("message" in first)
    return [
      ...("priority" in first ? [{ key: "priority", label: "Level" }] : []),
      ...("program" in first ? [{ key: "program", label: "Program" }] : []),
      { key: "message", label: "Message" },
    ];
  return Object.keys(first)
    .filter((k) => k !== "time" && k !== "unix_time")
    .slice(0, 6)
    .map((k) => ({ key: k, label: k }));
}

export function LogsPage() {
  const [type, setType] = useState("postfix");
  const [count, setCount] = useState(200);
  const [q, setQ] = useState("");
  const logs = useLogs(type, count);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (logs.data ?? []).filter((r) => !s || JSON.stringify(r).toLowerCase().includes(s));
  }, [logs.data, q]);
  const cols = columnsFor(type, logs.data ?? []);

  return (
    <>
      <PageHeader
        title="Logs"
        actions={
          <Button onClick={() => logs.refetch()} loading={logs.isFetching}>
            <RefreshCw size={16} /> Refresh
          </Button>
        }
      />
      <div className="tabs tabs-scroll" role="tablist">
        {TYPES.map((t) => (
          <button key={t.id} role="tab" aria-selected={type === t.id} className={`tab ${type === t.id ? "tab-active" : ""}`} onClick={() => setType(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Filter lines" />
          <select className="input select-sm" value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Number of lines">
            {[50, 200, 500, 1000].map((n) => (
              <option key={n} value={n}>
                Last {n}
              </option>
            ))}
          </select>
          <div className="toolbar-spacer" />
          {logs.data && <span className="muted small">{rows.length} lines</span>}
        </div>
        {logs.isLoading ? (
          <Loading />
        ) : logs.error ? (
          <ErrorState error={logs.error} retry={() => logs.refetch()} />
        ) : !rows.length ? (
          <Empty title="No log lines" />
        ) : (
          <div className="table-wrap">
            <table className="table table-logs">
              <thead>
                <tr>
                  <th>Time</th>
                  {cols.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="nowrap muted small">{dateTime(rowTime(r))}</td>
                    {cols.map((c) => (
                      <td key={c.key} className={c.key === "message" || c.key === "uri" ? "mono small wrap" : "small"}>
                        {c.key === "priority" ? (
                          <Badge tone={/err|crit|alert|emerg/.test(String(r[c.key])) ? "bad" : /warn/.test(String(r[c.key])) ? "warn" : "neutral"}>{toText(r[c.key])}</Badge>
                        ) : (
                          toText(r[c.key])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
