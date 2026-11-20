import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Mailbox } from "../lib/api";
import { useDomains, useMailboxes, useMailcowMutation } from "../lib/queries";
import { ago, bytes, isActive, pct } from "../lib/format";
import { Button, ConfirmDialog, Empty, ErrorState, Loading, SearchInput, StatusBadge, UsageBar } from "./ui";
import { MailboxForm } from "./MailboxForm";

type Sort = "address" | "usage" | "login";

export function MailboxesView({ domain, showDomainFilter = true }: { domain?: string; showDomainFilter?: boolean }) {
  const mailboxes = useMailboxes();
  const domains = useDomains();
  const [params] = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [domainFilter, setDomainFilter] = useState(domain ?? "");
  const [status, setStatus] = useState<"" | "active" | "disabled">("");
  const [sort, setSort] = useState<Sort>("address");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Mailbox | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<string[] | null>(null);

  const del = useMailcowMutation((items: string[]) => ({ path: "delete/mailbox", body: items }), {
    invalidate: [["mailboxes"], ["domains"]],
    success: (items) => (items.length === 1 ? `Deleted ${items[0]}` : `Deleted ${items.length} mailboxes`),
  });
  const setActive = useMailcowMutation((v: { items: string[]; active: boolean }) => ({ path: "edit/mailbox", body: { items: v.items, attr: { active: v.active ? 1 : 0 } } }), {
    invalidate: [["mailboxes"]],
    success: (v) => `${v.active ? "Enabled" : "Disabled"} ${v.items.length === 1 ? v.items[0] : `${v.items.length} mailboxes`}`,
  });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const d = domain ?? domainFilter;
    const list = (mailboxes.data ?? []).filter(
      (m) =>
        (!d || m.domain === d) &&
        (!status || (status === "active") === isActive(m.active)) &&
        (!s || m.username.toLowerCase().includes(s) || (m.name ?? "").toLowerCase().includes(s)),
    );
    const cmp: Record<Sort, (a: Mailbox, b: Mailbox) => number> = {
      address: (a, b) => a.username.localeCompare(b.username),
      usage: (a, b) => pct(b.quota_used, b.quota) - pct(a.quota_used, a.quota),
      login: (a, b) => Number(b.last_imap_login || 0) - Number(a.last_imap_login || 0),
    };
    return list.sort(cmp[sort]);
  }, [mailboxes.data, q, domain, domainFilter, status, sort]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.username));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.username)));
  const toggle = (u: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(u)) n.delete(u);
      else n.add(u);
      return n;
    });
  const sel = rows.filter((r) => selected.has(r.username)).map((r) => r.username);

  return (
    <>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search by address or name" />
        {showDomainFilter && !domain && (
          <select className="input select-sm" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} aria-label="Filter by domain">
            <option value="">All domains</option>
            {domains.data?.map((d) => (
              <option key={d.domain_name}>{d.domain_name}</option>
            ))}
          </select>
        )}
        <select className="input select-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <select className="input select-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="address">Sort: address</option>
          <option value="usage">Sort: fullest first</option>
          <option value="login">Sort: recent login</option>
        </select>
        <div className="toolbar-spacer" />
        <Button
          variant="primary"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
          disabled={!domains.data?.length}
        >
          <Plus size={16} /> Add mailbox
        </Button>
      </div>

      {sel.length > 0 && (
        <div className="bulkbar">
          <span>{sel.length} selected</span>
          <Button size="sm" onClick={() => setActive.mutate({ items: sel, active: true }, { onSuccess: () => setSelected(new Set()) })}>
            Enable
          </Button>
          <Button size="sm" onClick={() => setActive.mutate({ items: sel, active: false }, { onSuccess: () => setSelected(new Set()) })}>
            Disable
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDeleting(sel)}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {mailboxes.isLoading ? (
        <Loading />
      ) : mailboxes.error ? (
        <ErrorState error={mailboxes.error} retry={() => mailboxes.refetch()} />
      ) : !rows.length ? (
        <Empty title={q || status || domainFilter ? "No matching mailboxes" : "No mailboxes yet"} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="col-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
                <th>Mailbox</th>
                <th>Storage</th>
                <th>Messages</th>
                <th>Last login</th>
                <th>Status</th>
                <th className="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.username} className={selected.has(m.username) ? "row-selected" : ""}>
                  <td className="col-check">
                    <input type="checkbox" checked={selected.has(m.username)} onChange={() => toggle(m.username)} aria-label={`Select ${m.username}`} />
                  </td>
                  <td>
                    <button
                      className="link-plain strong as-link"
                      onClick={() => {
                        setEditing(m);
                        setFormOpen(true);
                      }}
                    >
                      {m.username}
                    </button>
                    {m.name && <div className="muted small">{m.name}</div>}
                  </td>
                  <td className="col-usage">
                    <UsageBar value={pct(m.quota_used, m.quota)} label={`${bytes(m.quota_used)} of ${bytes(m.quota)}`} />
                  </td>
                  <td>{Number(m.messages || 0).toLocaleString()}</td>
                  <td className="muted">{ago(m.last_imap_login)}</td>
                  <td>
                    <StatusBadge active={isActive(m.active)} />
                  </td>
                  <td className="col-actions">
                    <button
                      className="icon-btn"
                      aria-label={`Edit ${m.username}`}
                      onClick={() => {
                        setEditing(m);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button className="icon-btn icon-danger" aria-label={`Delete ${m.username}`} onClick={() => setDeleting([m.username])}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MailboxForm open={formOpen} onClose={() => setFormOpen(false)} mailbox={editing} defaultDomain={domain ?? (domainFilter || undefined)} />
      <ConfirmDialog
        open={!!deleting}
        title={deleting?.length === 1 ? `Delete ${deleting[0]}?` : `Delete ${deleting?.length} mailboxes?`}
        body={
          <>
            <p>All mail stored in {deleting?.length === 1 ? "this mailbox" : "these mailboxes"} will be permanently deleted. This can't be undone.</p>
            {deleting && deleting.length > 1 && (
              <ul className="confirm-list">
                {deleting.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </>
        }
        confirmLabel="Delete permanently"
        loading={del.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting, {
            onSuccess: () => {
              setDeleting(null);
              setSelected(new Set());
            },
          })
        }
      />
    </>
  );
}
