/**
 * A generic list / add / edit / delete screen for mailcow objects.
 * Each screen is described by a ResourceDef (see ../resources.tsx).
 */
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Dices } from "lucide-react";
import { asArray, mcGet } from "../lib/api";
import { isActive } from "../lib/format";
import { useDomains, useMailboxes, useMailcowMutation } from "../lib/queries";
import { Button, Card, ConfirmDialog, Empty, ErrorState, Field, Loading, Modal, PageHeader, SearchInput, StatusBadge, TextInput, Toggle } from "./ui";
import { generatePassword } from "./MailboxForm";

export type Row = Record<string, unknown>;
export type Values = Record<string, unknown>;

export interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "password" | "number" | "select" | "toggle" | "textarea" | "domain" | "domains" | "mailbox";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  default?: unknown;
  /** Show this field when editing an existing item. */
  editable?: boolean;
  /** For password fields: offer a generate button. */
  generate?: boolean;
  wide?: boolean;
}

export interface ResourceDef {
  title: string;
  subtitle?: ReactNode;
  noun: string;
  queryKey: string;
  list: string;
  rowKey: (r: Row) => string | number;
  label: (r: Row) => string;
  columns: { label: string; render: (r: Row) => ReactNode; className?: string }[];
  search?: (r: Row) => string;
  fields: FieldDef[];
  add?: { path: string; body: (v: Values) => unknown };
  edit?: { path: string; attr: (v: Values) => Values; fromRow: (r: Row) => Values };
  remove?: { path: string; warning?: (r: Row) => ReactNode };
  /** Supports the generic {active: 0|1} edit for a quick toggle in the table. */
  toggleActive?: boolean;
  empty?: ReactNode;
}

export function ResourcePage({ def }: { def: ResourceDef }) {
  const q = useQuery({ queryKey: [def.queryKey], queryFn: async () => asArray<Row>(await mcGet(def.list)) });
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const del = useMailcowMutation((r: Row) => ({ path: def.remove!.path, body: [def.rowKey(r)] }), {
    invalidate: [[def.queryKey]],
    success: (r) => `Deleted ${def.label(r)}`,
  });
  const toggle = useMailcowMutation((v: { row: Row; active: boolean }) => ({ path: def.edit!.path, body: { items: [def.rowKey(v.row)], attr: { active: v.active ? 1 : 0 } } }), {
    invalidate: [[def.queryKey]],
    success: (v) => `${v.active ? "Enabled" : "Disabled"} ${def.label(v.row)}`,
  });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const text = def.search ?? ((r: Row) => JSON.stringify(r));
    return (q.data ?? []).filter((r) => !s || text(r).toLowerCase().includes(s));
  }, [q.data, search, def]);

  return (
    <>
      <PageHeader title={def.title} subtitle={def.subtitle} />
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder={`Search ${def.title.toLowerCase()}`} />
          <div className="toolbar-spacer" />
          {def.add && (
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus size={16} /> Add {def.noun}
            </Button>
          )}
        </div>
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : !rows.length ? (
          <Empty title={search ? "Nothing matches" : `No ${def.title.toLowerCase()} yet`}>{!search && def.empty}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {def.columns.map((c) => (
                    <th key={c.label}>{c.label}</th>
                  ))}
                  {"active" in (rows[0] ?? {}) && <th>Status</th>}
                  <th className="col-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(def.rowKey(r))}>
                    {def.columns.map((c) => (
                      <td key={c.label} className={c.className}>
                        {c.render(r)}
                      </td>
                    ))}
                    {"active" in r && (
                      <td>
                        {def.toggleActive && def.edit ? (
                          <button className="as-link" title="Click to toggle" onClick={() => toggle.mutate({ row: r, active: !isActive(r.active) })}>
                            <StatusBadge active={isActive(r.active)} />
                          </button>
                        ) : (
                          <StatusBadge active={isActive(r.active)} />
                        )}
                      </td>
                    )}
                    <td className="col-actions">
                      {def.edit && (
                        <button
                          className="icon-btn"
                          aria-label={`Edit ${def.label(r)}`}
                          onClick={() => {
                            setEditing(r);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      {def.remove && (
                        <button className="icon-btn icon-danger" aria-label={`Delete ${def.label(r)}`} onClick={() => setDeleting(r)}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${def.label(editing)}` : `Add ${def.noun}`} wide={def.fields.length > 3}>
        {formOpen && <ResourceForm key={editing ? String(def.rowKey(editing)) : "new"} def={def} row={editing} onClose={() => setFormOpen(false)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting ? def.label(deleting) : ""}?`}
        body={<p>{(deleting && def.remove?.warning?.(deleting)) ?? "This can't be undone."}</p>}
        loading={del.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}

function ResourceForm({ def, row, onClose }: { def: ResourceDef; row: Row | null; onClose: () => void }) {
  const editing = !!row;
  const fields = def.fields.filter((f) => !editing || f.editable);
  const [v, setV] = useState<Values>(() => {
    const base: Values = {};
    for (const f of def.fields) base[f.name] = typeof f.default === "function" ? (f.default as () => unknown)() : f.default ?? (f.type === "toggle" ? false : f.type === "domains" ? [] : "");
    return editing ? { ...base, ...def.edit!.fromRow(row!) } : base;
  });
  const set = (k: string, val: unknown) => setV((s) => ({ ...s, [k]: val }));

  const save = useMailcowMutation(
    (vals: Values) =>
      editing ? { path: def.edit!.path, body: { items: [def.rowKey(row!)], attr: def.edit!.attr(vals) } } : { path: def.add!.path, body: def.add!.body(vals) },
    { invalidate: [[def.queryKey]], success: () => (editing ? `Saved ${def.label(row!)}` : `Added ${def.noun}`) },
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await save.mutateAsync(v);
    onClose();
  };

  const toggles = fields.filter((f) => f.type === "toggle");
  const others = fields.filter((f) => f.type !== "toggle");

  return (
    <form onSubmit={submit}>
      <div className={others.length > 2 ? "form-grid" : ""}>
        {others.map((f) => (
          <Field key={f.name} label={f.label} hint={f.hint} wide={f.wide || f.type === "textarea" || f.type === "domains"}>
            <FieldInput f={f} value={v[f.name]} onChange={(x) => set(f.name, x)} editing={editing} />
          </Field>
        ))}
      </div>
      {toggles.length > 0 && (
        <div className="toggles">
          {toggles.map((f) => (
            <Toggle key={f.name} checked={!!v[f.name]} onChange={(x) => set(f.name, x)} label={f.label} />
          ))}
        </div>
      )}
      <div className="modal-foot modal-foot-inline">
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={save.isPending}>
          {editing ? "Save changes" : `Add ${def.noun}`}
        </Button>
      </div>
    </form>
  );
}

function FieldInput({ f, value, onChange, editing }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; editing: boolean }) {
  const domains = useDomains();
  const mailboxes = useMailboxes();
  const str = value == null ? "" : String(value);
  const required = f.required && !(editing && f.type === "password");

  switch (f.type) {
    case "select":
      return (
        <select className="input" value={str} onChange={(e) => onChange(e.target.value)} required={required}>
          {f.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "domain":
      return (
        <select className="input" value={str} onChange={(e) => onChange(e.target.value)} required={required}>
          <option value="">Choose a domain</option>
          {domains.data?.map((d) => (
            <option key={d.domain_name}>{d.domain_name}</option>
          ))}
        </select>
      );
    case "mailbox":
      return (
        <select className="input" value={str} onChange={(e) => onChange(e.target.value)} required={required} disabled={editing}>
          <option value="">Choose a mailbox</option>
          {mailboxes.data?.map((m) => (
            <option key={m.username}>{m.username}</option>
          ))}
        </select>
      );
    case "domains": {
      const sel = new Set((value as string[]) ?? []);
      return (
        <div className="check-grid">
          {domains.data?.map((d) => (
            <label key={d.domain_name} className="check">
              <input
                type="checkbox"
                checked={sel.has(d.domain_name)}
                onChange={(e) => {
                  const n = new Set(sel);
                  if (e.target.checked) n.add(d.domain_name);
                  else n.delete(d.domain_name);
                  onChange([...n]);
                }}
              />
              {d.domain_name}
            </label>
          ))}
        </div>
      );
    }
    case "textarea":
      return <textarea className="input mono" rows={4} value={str} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} required={required} />;
    case "password":
      return (
        <div className="input-group">
          <TextInput
            type="text"
            className="input mono"
            value={str}
            onChange={(e) => onChange(e.target.value)}
            placeholder={editing ? "Leave empty to keep the current one" : f.placeholder}
            required={required}
            autoComplete="new-password"
          />
          {f.generate && (
            <button type="button" className="icon-btn input-addon" aria-label="Generate password" title="Generate password" onClick={() => onChange(generatePassword())}>
              <Dices size={16} />
            </button>
          )}
        </div>
      );
    default:
      return <TextInput type={f.type === "number" ? "number" : "text"} value={str} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} required={required} />;
  }
}
