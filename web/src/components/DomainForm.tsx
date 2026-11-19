import { useState, type FormEvent } from "react";
import type { Domain } from "../lib/api";
import { mcPost } from "../lib/api";
import { isActive, toMiB } from "../lib/format";
import { useMailcowMutation } from "../lib/queries";
import { Button, Field, Modal, TextInput, Toggle } from "./ui";

interface Values {
  domain: string;
  description: string;
  mailboxes: number;
  aliases: number;
  defquota: number;
  maxquota: number;
  quota: number;
  active: boolean;
  backupmx: boolean;
  relay_all_recipients: boolean;
  dkim: boolean;
}

function initial(d?: Domain): Values {
  if (!d)
    return { domain: "", description: "", mailboxes: 10, aliases: 400, defquota: 3072, maxquota: 10240, quota: 10240, active: true, backupmx: false, relay_all_recipients: false, dkim: true };
  return {
    domain: d.domain_name,
    description: d.description ?? "",
    mailboxes: Number(d.max_num_mboxes_for_domain),
    aliases: Number(d.max_num_aliases_for_domain),
    defquota: toMiB(d.def_quota_for_mbox),
    maxquota: toMiB(d.max_quota_for_mbox),
    quota: toMiB(d.max_quota_for_domain),
    active: isActive(d.active),
    backupmx: isActive(d.backupmx),
    relay_all_recipients: isActive(d.relay_all_recipients),
    dkim: false,
  };
}

export function DomainForm({ open, onClose, domain }: { open: boolean; onClose: () => void; domain?: Domain }) {
  return (
    <Modal open={open} onClose={onClose} title={domain ? `Edit ${domain.domain_name}` : "Add domain"} wide>
      {open && <DomainFormBody key={domain?.domain_name ?? "new"} onClose={onClose} domain={domain} />}
    </Modal>
  );
}

function DomainFormBody({ onClose, domain }: { onClose: () => void; domain?: Domain }) {
  const [v, setV] = useState<Values>(() => initial(domain));
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((s) => ({ ...s, [k]: val }));
  const editing = !!domain;

  const save = useMailcowMutation(
    (vals: Values) => {
      const attr = {
        description: vals.description,
        mailboxes: vals.mailboxes,
        aliases: vals.aliases,
        defquota: vals.defquota,
        maxquota: vals.maxquota,
        quota: vals.quota,
        active: vals.active ? 1 : 0,
        backupmx: vals.backupmx ? 1 : 0,
        relay_all_recipients: vals.relay_all_recipients ? 1 : 0,
      };
      return editing
        ? { path: "edit/domain", body: { items: [vals.domain], attr } }
        : { path: "add/domain", body: { domain: vals.domain.trim().toLowerCase(), ...attr, restart_sogo: 10 } };
    },
    { invalidate: [["domains"]], success: (vals) => (editing ? `Saved ${vals.domain}` : `Added ${vals.domain}`) },
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await save.mutateAsync(v);
    if (!editing && v.dkim) {
      // Best effort: mailcow may already create one automatically.
      await mcPost("add/dkim", { domains: v.domain.trim().toLowerCase(), dkim_selector: "dkim", key_size: 2048 }).catch(() => undefined);
    }
    onClose();
  };

  const quotaError = v.maxquota > v.quota ? "Can't be more than the domain total" : undefined;

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Domain name">
          <TextInput value={v.domain} onChange={(e) => set("domain", e.target.value)} disabled={editing} required placeholder="example.com" pattern="^[^\s@]+\.[^\s@]+$" />
        </Field>
        <Field label="Description">
          <TextInput value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Max mailboxes">
          <TextInput type="number" min={0} value={v.mailboxes} onChange={(e) => set("mailboxes", Number(e.target.value))} />
        </Field>
        <Field label="Max aliases">
          <TextInput type="number" min={0} value={v.aliases} onChange={(e) => set("aliases", Number(e.target.value))} />
        </Field>
        <Field label="Total storage for domain (MiB)" hint={`${(v.quota / 1024).toFixed(1)} GiB`}>
          <TextInput type="number" min={0} value={v.quota} onChange={(e) => set("quota", Number(e.target.value))} />
        </Field>
        <Field label="Max per mailbox (MiB)" hint={`${(v.maxquota / 1024).toFixed(1)} GiB`} error={quotaError}>
          <TextInput type="number" min={0} value={v.maxquota} onChange={(e) => set("maxquota", Number(e.target.value))} />
        </Field>
        <Field label="Default for new mailboxes (MiB)" hint={`${(v.defquota / 1024).toFixed(1)} GiB`} error={v.defquota > v.maxquota ? "Can't be more than the per-mailbox max" : undefined}>
          <TextInput type="number" min={0} value={v.defquota} onChange={(e) => set("defquota", Number(e.target.value))} />
        </Field>
      </div>
      <div className="toggles">
        <Toggle checked={v.active} onChange={(x) => set("active", x)} label="Active" />
        <Toggle checked={v.backupmx} onChange={(x) => set("backupmx", x)} label="Backup MX (relay for this domain)" />
        <Toggle checked={v.relay_all_recipients} onChange={(x) => set("relay_all_recipients", x)} label="Relay all recipients" />
        {!editing && <Toggle checked={v.dkim} onChange={(x) => set("dkim", x)} label="Create a DKIM key (2048-bit)" />}
      </div>
      <div className="modal-foot modal-foot-inline">
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={save.isPending} disabled={!!quotaError || v.defquota > v.maxquota}>
          {editing ? "Save changes" : "Add domain"}
        </Button>
      </div>
    </form>
  );
}
