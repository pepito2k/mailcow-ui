import { useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft, Pencil, KeyRound, Trash2 } from "lucide-react";
import { useDkim, useDomains, useMailcowMutation } from "../lib/queries";
import { bytes, isActive, pct } from "../lib/format";
import { Badge, Button, Card, ConfirmDialog, CopyButton, Empty, ErrorState, Field, Loading, Modal, PageHeader, Stat, StatusBadge, TextInput, UsageBar } from "../components/ui";
import { MailboxesView } from "../components/MailboxesView";
import { AliasesView } from "../components/AliasesView";
import { DomainForm } from "../components/DomainForm";

type Tab = "mailboxes" | "aliases" | "dns";

export function DomainDetailPage({ mailcowUrl }: { mailcowUrl: string }) {
  const { domain = "" } = useParams();
  const domains = useDomains();
  const [tab, setTab] = useState<Tab>("mailboxes");
  const [editOpen, setEditOpen] = useState(false);
  const d = domains.data?.find((x) => x.domain_name === domain);

  if (domains.isLoading) return <Loading />;
  if (domains.error) return <ErrorState error={domains.error} retry={() => domains.refetch()} />;
  if (!d)
    return (
      <Empty title="Domain not found">
        <Link to="/domains" className="link">
          Back to domains
        </Link>
      </Empty>
    );

  return (
    <>
      <Link to="/domains" className="back-link">
        <ChevronLeft size={16} /> Domains
      </Link>
      <PageHeader
        title={d.domain_name}
        subtitle={
          <>
            <StatusBadge active={isActive(d.active)} /> {d.description}
          </>
        }
        actions={
          <Button onClick={() => setEditOpen(true)}>
            <Pencil size={16} /> Edit domain
          </Button>
        }
      />
      <div className="stats stats-3">
        <Stat label="Mailboxes" value={`${d.mboxes_in_domain} / ${d.max_num_mboxes_for_domain}`} />
        <Stat label="Aliases" value={`${d.aliases_in_domain} / ${d.max_num_aliases_for_domain}`} />
        <Stat
          label="Storage"
          value={bytes(d.bytes_total)}
          sub={<UsageBar value={pct(d.bytes_total, d.max_quota_for_domain)} label={`of ${bytes(d.max_quota_for_domain)} · ${bytes(d.quota_used_in_domain)} allocated`} />}
        />
      </div>

      <div className="tabs" role="tablist">
        {(["mailboxes", "aliases", "dns"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? "tab-active" : ""}`} onClick={() => setTab(t)}>
            {t === "dns" ? "DNS & DKIM" : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "mailboxes" && (
        <Card pad={false}>
          <MailboxesView domain={d.domain_name} />
        </Card>
      )}
      {tab === "aliases" && (
        <Card pad={false}>
          <AliasesView domain={d.domain_name} />
        </Card>
      )}
      {tab === "dns" && <DnsPanel domain={d.domain_name} mailHost={new URL(mailcowUrl).hostname} />}

      <DomainForm open={editOpen} onClose={() => setEditOpen(false)} domain={d} />
    </>
  );
}

function DnsPanel({ domain, mailHost }: { domain: string; mailHost: string }) {
  const dkim = useDkim(domain);
  const [genOpen, setGenOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [selector, setSelector] = useState("dkim");
  const [size, setSize] = useState(2048);

  const gen = useMailcowMutation(() => ({ path: "add/dkim", body: { domains: domain, dkim_selector: selector, key_size: size } }), {
    invalidate: [["dkim", domain]],
    success: "DKIM key created",
  });
  const del = useMailcowMutation(() => ({ path: "delete/dkim", body: [domain] }), { invalidate: [["dkim", domain]], success: "DKIM key deleted" });

  const sel = dkim.data?.dkim_selector || "dkim";
  const records: { type: string; name: string; value: string; note?: string }[] = [
    { type: "MX", name: domain, value: `10 ${mailHost}.` },
    { type: "TXT", name: domain, value: "v=spf1 mx a -all", note: "Add other senders (like a newsletter service) before -all" },
    { type: "TXT", name: `_dmarc.${domain}`, value: `v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}` },
    ...(dkim.data?.dkim_txt ? [{ type: "TXT", name: `${sel}._domainkey.${domain}`, value: dkim.data.dkim_txt }] : []),
    { type: "CNAME", name: `autodiscover.${domain}`, value: `${mailHost}.` },
    { type: "CNAME", name: `autoconfig.${domain}`, value: `${mailHost}.` },
    { type: "SRV", name: `_autodiscover._tcp.${domain}`, value: `0 1 443 ${mailHost}.` },
  ];

  return (
    <>
      <Card
        title="DKIM signing key"
        actions={
          dkim.data ? (
            <Button size="sm" variant="ghost" onClick={() => setDelOpen(true)}>
              <Trash2 size={14} /> Delete key
            </Button>
          ) : null
        }
      >
        {dkim.isLoading ? (
          <Loading />
        ) : dkim.error ? (
          <ErrorState error={dkim.error} />
        ) : dkim.data ? (
          <div className="kv">
            <div>
              <span className="muted">Selector</span>
              <span className="mono">{dkim.data.dkim_selector}</span>
            </div>
            <div>
              <span className="muted">Key length</span>
              <span>{dkim.data.length} bits</span>
            </div>
          </div>
        ) : (
          <div className="inline-empty">
            <div>
              <strong>No DKIM key for this domain.</strong>
              <div className="muted">Without one, other servers are more likely to mark your mail as spam.</div>
            </div>
            <Button variant="primary" onClick={() => setGenOpen(true)}>
              <KeyRound size={16} /> Create DKIM key
            </Button>
          </div>
        )}
      </Card>

      <Card title="Recommended DNS records" pad={false}>
        <p className="card-note muted">
          Based on your mail server at <span className="mono">{mailHost}</span>. Compare these with your DNS provider.
        </p>
        <div className="table-wrap">
          <table className="table table-dns">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Value</th>
                <th className="col-actions" aria-label="Copy" />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.type + r.name}>
                  <td>
                    <Badge>{r.type}</Badge>
                  </td>
                  <td className="mono small">{r.name}</td>
                  <td className="mono small wrap">
                    {r.value}
                    {r.note && <div className="muted small sans">{r.note}</div>}
                  </td>
                  <td className="col-actions">
                    <CopyButton text={r.value} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Create DKIM key"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGenOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={gen.isPending} onClick={() => gen.mutate(undefined, { onSuccess: () => setGenOpen(false) })}>
              Create key
            </Button>
          </>
        }
      >
        <Field label="Selector">
          <TextInput value={selector} onChange={(e) => setSelector(e.target.value)} />
        </Field>
        <Field label="Key size">
          <select className="input" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            <option value={1024}>1024 bits</option>
            <option value={2048}>2048 bits (recommended)</option>
            <option value={3072}>3072 bits</option>
            <option value={4096}>4096 bits</option>
          </select>
        </Field>
      </Modal>
      <ConfirmDialog
        open={delOpen}
        title="Delete DKIM key?"
        body={<p>Mail from {domain} will stop being signed. Remove the DKIM DNS record too, or create a new key and update it.</p>}
        loading={del.isPending}
        onClose={() => setDelOpen(false)}
        onConfirm={() => del.mutate(undefined, { onSuccess: () => setDelOpen(false) })}
      />
    </>
  );
}
