import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Badge, Button, Card, CopyButton, ErrorState, Loading } from "./ui";

export interface DnsCheck {
  id: "mx" | "spf" | "dkim" | "dmarc";
  label: string;
  status: "ok" | "warn" | "fail";
  summary: string;
  found: string[];
  expected?: string;
}
export interface DnsResult {
  domain: string;
  mailHost: string;
  checkedAt: string;
  checks: DnsCheck[];
}

async function fetchCheck(domain: string, fresh = false): Promise<DnsResult> {
  const r = await fetch(`/api/dns-check/${encodeURIComponent(domain)}${fresh ? "?fresh=1" : ""}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error || `DNS check failed (${r.status})`);
  return body as DnsResult;
}

export const useDnsCheck = (domain: string) =>
  useQuery({ queryKey: ["dns-check", domain], queryFn: () => fetchCheck(domain), staleTime: 2 * 60_000, retry: 1 });

export function worst(checks: DnsCheck[] | undefined) {
  if (!checks?.length) return null;
  return checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "ok";
}

const icon = (s: DnsCheck["status"]) =>
  s === "ok" ? <CheckCircle2 size={18} className="tone-good" /> : s === "warn" ? <AlertTriangle size={18} className="tone-warn" /> : <AlertOctagon size={18} className="tone-bad" />;
const word = { ok: "OK", warn: "Check", fail: "Problem" } as const;

/** Compact badge for the domains table. */
export function DnsBadge({ domain }: { domain: string }) {
  const q = useDnsCheck(domain);
  if (q.isLoading) return <span className="muted small">Checking…</span>;
  if (q.error) return <span className="muted small" title={String(q.error)}>Unknown</span>;
  const w = worst(q.data?.checks);
  const bad = q.data!.checks.filter((c) => c.status !== "ok").map((c) => c.label);
  return (
    <span title={bad.length ? `Needs attention: ${bad.join(", ")}` : "MX, SPF, DKIM and DMARC look right"}>
      <Badge tone={w === "ok" ? "good" : w === "warn" ? "warn" : "bad"}>{w === "ok" ? "All good" : bad.join(", ")}</Badge>
    </span>
  );
}

/** Full report for a domain's DNS tab. */
export function DnsHealth({ domain }: { domain: string }) {
  const q = useDnsCheck(domain);
  const qc = useQueryClient();
  const recheck = async () => {
    const fresh = await fetchCheck(domain, true).catch(() => null);
    if (fresh) qc.setQueryData(["dns-check", domain], fresh);
    else q.refetch();
  };
  const w = worst(q.data?.checks);

  return (
    <Card
      title="DNS health"
      actions={
        <div className="row-gap">
          {w && <Badge tone={w === "ok" ? "good" : w === "warn" ? "warn" : "bad"}>{w === "ok" ? "All good" : w === "warn" ? "Needs a look" : "Problems found"}</Badge>}
          <Button size="sm" variant="ghost" onClick={recheck} loading={q.isFetching} aria-label="Check DNS again">
            <RefreshCw size={14} /> Check again
          </Button>
        </div>
      }
    >
      {q.isLoading ? (
        <Loading label="Looking up DNS records" />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <ul className="dns-checks">
            {q.data!.checks.map((c) => (
              <li key={c.id} className={`dns-check dns-${c.status}`}>
                <div className="dns-check-icon">{icon(c.status)}</div>
                <div className="dns-check-body">
                  <div className="dns-check-head">
                    <strong>{c.label}</strong>
                    <span className="muted small">{word[c.status]}</span>
                  </div>
                  <div>{c.summary}</div>
                  {c.found.length > 0 && (
                    <div className="dns-found">
                      <span className="muted small">Published:</span>
                      {c.found.map((f, i) => (
                        <code key={i} className="dns-value">
                          {f}
                        </code>
                      ))}
                    </div>
                  )}
                  {c.status !== "ok" && c.expected && (
                    <div className="dns-found">
                      <span className="muted small">Suggested:</span>
                      <code className="dns-value">{c.expected}</code>
                      <CopyButton text={c.expected.replace(/^\S+\s+TXT\s+/, "")} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="muted small">
            Checked {new Date(q.data!.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} against {q.data!.mailHost}. DNS changes can take up to an hour
            to show up.
          </div>
        </>
      )}
    </Card>
  );
}
