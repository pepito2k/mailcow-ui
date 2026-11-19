import { useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import type { Alias } from "../lib/api";
import { useAliases, useDomains, useMailcowMutation } from "../lib/queries";
import { isActive } from "../lib/format";
import { Badge, Button, ConfirmDialog, Empty, ErrorState, Field, Loading, Modal, SearchInput, StatusBadge, TextInput, Toggle } from "./ui";

const SPECIAL: Record<string, string> = {
  "null@localhost": "Discard silently",
  "spam@localhost": "Learn as spam",
  "ham@localhost": "Learn as not spam",
};

function targets(goto: string) {
  return goto
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function AliasesView({ domain }: { domain?: string }) {
  const aliases = useAliases();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Alias | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Alias | null>(null);

  const del = useMailcowMutation((a: Alias) => ({ path: "delete/alias", body: [a.id] }), {
    invalidate: [["aliases"], ["domains"]],
    success: (a) => `Deleted ${a.address}`,
  });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (aliases.data ?? [])
      .filter((a) => (!domain || a.domain === domain) && (!s || a.address.toLowerCase().includes(s) || a.goto.toLowerCase().includes(s)))
      .sort((a, b) => a.address.localeCompare(b.address));
  }, [aliases.data, q, domain]);

  return (
    <>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search alias or destination" />
        <div className="toolbar-spacer" />
        <Button
          variant="primary"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus size={16} /> Add alias
        </Button>
      </div>
      {aliases.isLoading ? (
        <Loading />
      ) : aliases.error ? (
        <ErrorState error={aliases.error} retry={() => aliases.refetch()} />
      ) : !rows.length ? (
        <Empty title={q ? "No matching aliases" : "No aliases yet"}>{!q && "Aliases forward mail from one address to one or more others."}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Alias</th>
                <th aria-label="forwards to" />
                <th>Delivers to</th>
                <th>Status</th>
                <th className="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="strong">{a.address.startsWith("@") ? `*${a.address}` : a.address}</span>
                    {a.address.startsWith("@") && (
                      <>
                        {" "}
                        <Badge tone="info">Catch-all</Badge>
                      </>
                    )}
                    {a.private_comment && <div className="muted small">{a.private_comment}</div>}
                  </td>
                  <td className="muted">
                    <ArrowRight size={16} />
                  </td>
                  <td>
                    <div className="chips">
                      {targets(a.goto).map((t) => (
                        <span key={t} className="chip">
                          {SPECIAL[t] ?? t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <StatusBadge active={isActive(a.active)} />
                  </td>
                  <td className="col-actions">
                    <button
                      className="icon-btn"
                      aria-label={`Edit ${a.address}`}
                      onClick={() => {
                        setEditing(a);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button className="icon-btn icon-danger" aria-label={`Delete ${a.address}`} onClick={() => setDeleting(a)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${editing.address}` : "Add alias"}>
        {formOpen && <AliasForm key={editing?.id ?? "new"} alias={editing} defaultDomain={domain} onClose={() => setFormOpen(false)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.address}?`}
        body={<p>Mail sent to this address will stop being forwarded.</p>}
        loading={del.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}

function AliasForm({ alias, defaultDomain, onClose }: { alias?: Alias; defaultDomain?: string; onClose: () => void }) {
  const domains = useDomains();
  const [local, setLocal] = useState(alias ? alias.address.split("@")[0] : "");
  const [dom, setDom] = useState(alias?.domain ?? defaultDomain ?? domains.data?.[0]?.domain_name ?? "");
  const [goto, setGoto] = useState(alias ? targets(alias.goto).join("\n") : "");
  const [comment, setComment] = useState(alias?.private_comment ?? "");
  const [active, setActive] = useState(alias ? isActive(alias.active) : true);
  const editing = !!alias;

  const save = useMailcowMutation(
    () => {
      const gotoStr = targets(goto).join(",");
      if (editing) return { path: "edit/alias", body: { items: [alias!.id], attr: { goto: gotoStr, active: active ? 1 : 0, private_comment: comment } } };
      return { path: "add/alias", body: { address: `${local.trim().toLowerCase()}@${dom}`, goto: gotoStr, active: active ? 1 : 0, private_comment: comment } };
    },
    { invalidate: [["aliases"], ["domains"]], success: () => (editing ? `Saved ${alias!.address}` : `Added ${local ? local : "catch-all "}@${dom}`) },
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await save.mutateAsync(undefined);
    onClose();
  };

  return (
    <form onSubmit={submit}>
      <Field label="Alias address" hint={!editing ? "Leave the name empty to catch all mail for the domain" : undefined}>
        {editing ? (
          <TextInput value={alias!.address} disabled />
        ) : (
          <div className="input-group">
            <TextInput value={local} onChange={(e) => setLocal(e.target.value)} placeholder="sales" autoFocus pattern="^[^\s@]*$" />
            <span className="input-addon">@</span>
            <select className="input" value={dom} onChange={(e) => setDom(e.target.value)}>
              {domains.data?.map((d) => (
                <option key={d.domain_name}>{d.domain_name}</option>
              ))}
            </select>
          </div>
        )}
      </Field>
      <Field label="Deliver to" hint="One address per line. Use null@localhost to discard.">
        <textarea className="input mono" rows={4} value={goto} onChange={(e) => setGoto(e.target.value)} required placeholder={"alice@example.com\nbob@example.com"} />
      </Field>
      <Field label="Note (only visible to admins)">
        <TextInput value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <div className="toggles">
        <Toggle checked={active} onChange={setActive} label="Active" />
      </div>
      <div className="modal-foot modal-foot-inline">
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={save.isPending}>
          {editing ? "Save changes" : "Add alias"}
        </Button>
      </div>
    </form>
  );
}
