import { useMemo, useState } from "react";
import { Bug, Trash2, Undo2 } from "lucide-react";
import type { QuarantineItem } from "../lib/api";
import { useMailcowMutation, useQuarantine } from "../lib/queries";
import { ago, dateTime } from "../lib/format";
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorState, Loading, PageHeader, SearchInput } from "../components/ui";

export function QuarantinePage() {
  const quarantine = useQuarantine();
  const [q, setQ] = useState("");
  const [confirmDel, setConfirmDel] = useState<QuarantineItem[] | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<QuarantineItem | null>(null);

  const del = useMailcowMutation((items: QuarantineItem[]) => ({ path: "delete/qitem", body: items.map((i) => i.id) }), {
    invalidate: [["quarantine"]],
    success: (items) => `Deleted ${items.length} message${items.length === 1 ? "" : "s"}`,
  });
  const release = useMailcowMutation((item: QuarantineItem) => ({ path: "edit/qitem", body: { items: [item.id], attr: { action: "release" } } }), {
    invalidate: [["quarantine"]],
    success: (item) => `Released to ${item.rcpt}`,
  });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (quarantine.data ?? [])
      .filter((m) => !s || [m.subject, m.sender, m.rcpt].some((x) => (x ?? "").toLowerCase().includes(s)))
      .sort((a, b) => Number(b.created) - Number(a.created));
  }, [quarantine.data, q]);

  return (
    <>
      <PageHeader title="Quarantine" subtitle="Messages held back by the spam and virus filters." />
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search subject, sender or recipient" />
          <div className="toolbar-spacer" />
          {rows.length > 0 && (
            <Button variant="ghost" onClick={() => setConfirmDel(rows)}>
              <Trash2 size={16} /> Delete {q ? "matching" : "all"}
            </Button>
          )}
        </div>
        {quarantine.isLoading ? (
          <Loading />
        ) : quarantine.error ? (
          <ErrorState error={quarantine.error} retry={() => quarantine.refetch()} />
        ) : !rows.length ? (
          <Empty title={q ? "Nothing matches" : "Quarantine is empty"} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Message</th>
                  <th>To</th>
                  <th>Score</th>
                  <th>Received</th>
                  <th className="col-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="strong">
                        {Number(m.virus_flag) === 1 && (
                          <span className="virus" title="Virus detected">
                            <Bug size={14} />
                          </span>
                        )}
                        {m.subject || "(no subject)"}
                      </div>
                      <div className="muted small">{m.sender}</div>
                    </td>
                    <td>{m.rcpt}</td>
                    <td>
                      <Badge tone={Number(m.score) >= 15 ? "bad" : "warn"}>{Number(m.score).toFixed(1)}</Badge>
                    </td>
                    <td title={dateTime(m.created)}>{ago(m.created)}</td>
                    <td className="col-actions">
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRelease(m)}>
                        <Undo2 size={14} /> Release
                      </Button>
                      <button className="icon-btn icon-danger" aria-label="Delete" onClick={() => setConfirmDel([m])}>
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
      <ConfirmDialog
        open={!!confirmDel}
        title={confirmDel?.length === 1 ? "Delete this message?" : `Delete ${confirmDel?.length} messages?`}
        body={<p>They will be removed from quarantine for good.</p>}
        loading={del.isPending}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && del.mutate(confirmDel, { onSuccess: () => setConfirmDel(null) })}
      />
      <ConfirmDialog
        open={!!confirmRelease}
        title="Release this message?"
        body={
          <>
            <p>
              "{confirmRelease?.subject}" will be delivered to <strong>{confirmRelease?.rcpt}</strong>.
            </p>
            {Number(confirmRelease?.virus_flag) === 1 && <p className="danger-text">A virus was detected in this message. Only release it if you're sure it's safe.</p>}
          </>
        }
        confirmLabel="Release"
        loading={release.isPending}
        onClose={() => setConfirmRelease(null)}
        onConfirm={() => confirmRelease && release.mutate(confirmRelease, { onSuccess: () => setConfirmRelease(null) })}
      />
    </>
  );
}
