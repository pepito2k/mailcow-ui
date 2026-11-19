import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Domain } from "../lib/api";
import { useDomains, useMailcowMutation } from "../lib/queries";
import { bytes, isActive, pct } from "../lib/format";
import { Button, Card, ConfirmDialog, Empty, ErrorState, Loading, PageHeader, SearchInput, StatusBadge, UsageBar } from "../components/ui";
import { DomainForm } from "../components/DomainForm";

export function DomainsPage() {
  const domains = useDomains();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Domain | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Domain | null>(null);

  const del = useMailcowMutation((d: Domain) => ({ path: "delete/domain", body: [d.domain_name] }), {
    invalidate: [["domains"]],
    success: (d) => `Deleted ${d.domain_name}`,
  });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (domains.data ?? []).filter((d) => !s || d.domain_name.includes(s) || (d.description ?? "").toLowerCase().includes(s));
  }, [domains.data, q]);

  return (
    <>
      <PageHeader
        title="Domains"
        subtitle={domains.data ? `${domains.data.length} domains` : undefined}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus size={16} /> Add domain
          </Button>
        }
      />
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search domains" />
        </div>
        {domains.isLoading ? (
          <Loading />
        ) : domains.error ? (
          <ErrorState error={domains.error} retry={() => domains.refetch()} />
        ) : !rows.length ? (
          <Empty title={q ? "No matching domains" : "No domains yet"}>{!q && "Add your first domain to start creating mailboxes."}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Mailboxes</th>
                  <th>Aliases</th>
                  <th>Storage used</th>
                  <th>Status</th>
                  <th className="col-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.domain_name}>
                    <td>
                      <Link to={`/domains/${encodeURIComponent(d.domain_name)}`} className="strong link-plain">
                        {d.domain_name}
                      </Link>
                      {d.description && <div className="muted small">{d.description}</div>}
                    </td>
                    <td>
                      {d.mboxes_in_domain} <span className="muted">/ {d.max_num_mboxes_for_domain}</span>
                    </td>
                    <td>
                      {d.aliases_in_domain} <span className="muted">/ {d.max_num_aliases_for_domain}</span>
                    </td>
                    <td className="col-usage">
                      <UsageBar value={pct(d.bytes_total, d.max_quota_for_domain)} label={`${bytes(d.bytes_total)} of ${bytes(d.max_quota_for_domain)}`} />
                    </td>
                    <td>
                      <StatusBadge active={isActive(d.active)} />
                    </td>
                    <td className="col-actions">
                      <button
                        className="icon-btn"
                        aria-label={`Edit ${d.domain_name}`}
                        onClick={() => {
                          setEditing(d);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button className="icon-btn icon-danger" aria-label={`Delete ${d.domain_name}`} onClick={() => setDeleting(d)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DomainForm open={formOpen} onClose={() => setFormOpen(false)} domain={editing} />
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.domain_name}?`}
        body={
          deleting && Number(deleting.mboxes_in_domain) > 0 ? (
            <p>
              This domain still has {deleting.mboxes_in_domain} mailboxes. mailcow only deletes empty domains, so remove its mailboxes first.
            </p>
          ) : (
            <p>The domain and its aliases will be removed. This can't be undone.</p>
          )
        }
        loading={del.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}
