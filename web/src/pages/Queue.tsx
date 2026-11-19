import { useState } from "react";
import { RefreshCw, Send, Trash2 } from "lucide-react";
import { useMailcowMutation, useQueue } from "../lib/queries";
import { ago, bytes, dateTime } from "../lib/format";
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorState, Loading, PageHeader } from "../components/ui";

export function QueuePage() {
  const queue = useQueue();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<"selected" | "all" | null>(null);

  const flush = useMailcowMutation(() => ({ path: "edit/mailq", body: { action: "flush" } }), {
    invalidate: [["mailq"]],
    success: "Asked Postfix to retry delivery of everything in the queue",
  });
  const delSel = useMailcowMutation((items: string[]) => ({ path: "delete/mailq", body: { items } }), {
    invalidate: [["mailq"]],
    success: (items) => `Deleted ${items.length} queued message${items.length === 1 ? "" : "s"}`,
  });
  const delAll = useMailcowMutation(() => ({ path: "edit/mailq", body: { action: "super_delete" } }), {
    invalidate: [["mailq"]],
    success: "Queue emptied",
  });

  const rows = queue.data ?? [];
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader
        title="Mail queue"
        subtitle="Outgoing messages Postfix hasn't been able to deliver yet. It retries on its own."
        actions={
          <>
            <Button onClick={() => queue.refetch()} loading={queue.isFetching}>
              <RefreshCw size={16} /> Refresh
            </Button>
            <Button variant="primary" onClick={() => flush.mutate(undefined)} loading={flush.isPending} disabled={!rows.length}>
              <Send size={16} /> Retry all now
            </Button>
          </>
        }
      />
      <Card pad={false}>
        {selected.size > 0 && (
          <div className="bulkbar">
            <span>{selected.size} selected</span>
            <Button size="sm" variant="danger" onClick={() => setConfirm("selected")}>
              <Trash2 size={14} /> Delete selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}
        {queue.isLoading ? (
          <Loading />
        ) : queue.error ? (
          <ErrorState error={queue.error} retry={() => queue.refetch()} />
        ) : !rows.length ? (
          <Empty title="The queue is empty">Everything has been delivered.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="col-check" />
                  <th>From</th>
                  <th>To</th>
                  <th>Queued</th>
                  <th>Size</th>
                  <th>Queue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.queue_id} className={selected.has(m.queue_id) ? "row-selected" : ""}>
                    <td className="col-check">
                      <input type="checkbox" checked={selected.has(m.queue_id)} onChange={() => toggle(m.queue_id)} aria-label={`Select ${m.queue_id}`} />
                    </td>
                    <td>
                      <div className="strong">{m.sender || "(empty sender)"}</div>
                      <div className="muted small mono">{m.queue_id}</div>
                    </td>
                    <td>
                      {m.recipients.map((r, i) => {
                        const rec = typeof r === "string" ? { address: r } : r;
                        return (
                          <div key={i}>
                            <div>{rec.address}</div>
                            {rec.delay_reason && <div className="muted small wrap">{rec.delay_reason}</div>}
                          </div>
                        );
                      })}
                    </td>
                    <td title={dateTime(m.arrival_time)}>{ago(m.arrival_time)}</td>
                    <td>{bytes(m.message_size)}</td>
                    <td>
                      <Badge tone={m.queue_name === "deferred" ? "warn" : m.queue_name === "hold" ? "bad" : "neutral"}>{m.queue_name}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <div className="card-foot">
            <Button size="sm" variant="ghost" onClick={() => setConfirm("all")}>
              <Trash2 size={14} /> Delete everything in the queue
            </Button>
          </div>
        )}
      </Card>
      <ConfirmDialog
        open={!!confirm}
        title={confirm === "all" ? "Delete the whole queue?" : `Delete ${selected.size} queued message${selected.size === 1 ? "" : "s"}?`}
        body={<p>These messages will never be delivered and the senders won't be told. This can't be undone.</p>}
        loading={delSel.isPending || delAll.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const done = {
            onSuccess: () => {
              setConfirm(null);
              setSelected(new Set());
            },
          };
          if (confirm === "all") delAll.mutate(undefined, done);
          else delSel.mutate([...selected], done);
        }}
      />
    </>
  );
}
