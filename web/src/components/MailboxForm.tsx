import { useState, type FormEvent } from "react";
import { Dices, Eye, EyeOff } from "lucide-react";
import type { Domain, Mailbox } from "../lib/api";
import { bytes, isActive, toMiB } from "../lib/format";
import { useDomains, useMailcowMutation } from "../lib/queries";
import { Link } from "react-router";
import { Button, Field, Modal, TextInput, Toggle } from "./ui";
import { RateLimitSection } from "./RateLimit";

export function generatePassword(len = 20) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.!";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

interface Values {
  local_part: string;
  domain: string;
  name: string;
  quota: number;
  password: string;
  active: boolean;
  force_pw_update: boolean;
  imap_access: boolean;
  pop3_access: boolean;
  smtp_access: boolean;
  sogo_access: boolean;
}

function initial(m: Mailbox | undefined, domains: Domain[], defaultDomain?: string): Values {
  if (m) {
    const a = m.attributes ?? {};
    return {
      local_part: m.local_part,
      domain: m.domain,
      name: m.name ?? "",
      quota: toMiB(m.quota),
      password: "",
      active: isActive(m.active),
      force_pw_update: a.force_pw_update === "1",
      imap_access: a.imap_access !== "0",
      pop3_access: a.pop3_access !== "0",
      smtp_access: a.smtp_access !== "0",
      sogo_access: a.sogo_access !== "0",
    };
  }
  const d = domains.find((x) => x.domain_name === defaultDomain) ?? domains[0];
  return {
    local_part: "",
    domain: d?.domain_name ?? "",
    name: "",
    quota: d ? toMiB(d.def_quota_for_mbox) : 1024,
    password: generatePassword(),
    active: true,
    force_pw_update: false,
    imap_access: true,
    pop3_access: true,
    smtp_access: true,
    sogo_access: true,
  };
}

export function MailboxForm({ open, onClose, mailbox, defaultDomain }: { open: boolean; onClose: () => void; mailbox?: Mailbox; defaultDomain?: string }) {
  return (
    <Modal open={open} onClose={onClose} title={mailbox ? `Edit ${mailbox.username}` : "Add mailbox"} wide>
      {open && <Body key={mailbox?.username ?? "new"} onClose={onClose} mailbox={mailbox} defaultDomain={defaultDomain} />}
    </Modal>
  );
}

function Body({ onClose, mailbox, defaultDomain }: { onClose: () => void; mailbox?: Mailbox; defaultDomain?: string }) {
  const domains = useDomains();
  const list = domains.data ?? [];
  const [v, setV] = useState<Values>(() => initial(mailbox, list, defaultDomain));
  const [showPw, setShowPw] = useState(!mailbox);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((s) => ({ ...s, [k]: val }));
  const editing = !!mailbox;
  const dom = list.find((d) => d.domain_name === v.domain);
  const maxMiB = dom ? toMiB(dom.max_quota_for_mbox) : undefined;

  const save = useMailcowMutation(
    (vals: Values) => {
      const flags = {
        active: vals.active ? 1 : 0,
        force_pw_update: vals.force_pw_update ? 1 : 0,
      };
      if (editing) {
        const attr: Record<string, unknown> = {
          name: vals.name,
          quota: vals.quota,
          ...flags,
          imap_access: vals.imap_access ? 1 : 0,
          pop3_access: vals.pop3_access ? 1 : 0,
          smtp_access: vals.smtp_access ? 1 : 0,
          sogo_access: vals.sogo_access ? 1 : 0,
        };
        if (vals.password) {
          attr.password = vals.password;
          attr.password2 = vals.password;
        }
        return { path: "edit/mailbox", body: { items: [mailbox!.username], attr } };
      }
      return {
        path: "add/mailbox",
        body: {
          local_part: vals.local_part.trim().toLowerCase(),
          domain: vals.domain,
          name: vals.name,
          quota: vals.quota,
          password: vals.password,
          password2: vals.password,
          ...flags,
        },
      };
    },
    {
      invalidate: [["mailboxes"], ["domains"]],
      success: (vals) => (editing ? `Saved ${mailbox!.username}` : `Created ${vals.local_part}@${vals.domain}`),
    },
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await save.mutateAsync(v);
    onClose();
  };

  const quotaError = maxMiB !== undefined && maxMiB > 0 && v.quota > maxMiB ? `This domain allows up to ${bytes(maxMiB * 1024 * 1024)} per mailbox` : undefined;

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        {editing ? (
          <Field label="Address">
            <TextInput value={mailbox!.username} disabled />
          </Field>
        ) : (
          <Field label="Address" wide>
            <div className="input-group">
              <TextInput value={v.local_part} onChange={(e) => set("local_part", e.target.value)} required placeholder="name" pattern="^[^\s@]+$" autoFocus />
              <span className="input-addon">@</span>
              <select
                className="input"
                value={v.domain}
                onChange={(e) => {
                  const d = list.find((x) => x.domain_name === e.target.value);
                  setV((s) => ({ ...s, domain: e.target.value, quota: d ? toMiB(d.def_quota_for_mbox) : s.quota }));
                }}
              >
                {list.map((d) => (
                  <option key={d.domain_name} value={d.domain_name}>
                    {d.domain_name}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        )}
        <Field label="Full name">
          <TextInput value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Shown as the sender name" />
        </Field>
        <Field label={editing ? "New password" : "Password"} hint={editing ? "Leave empty to keep the current password" : "Copy it now. You won't see it again."}>
          <div className="input-group">
            <TextInput
              type={showPw ? "text" : "password"}
              value={v.password}
              onChange={(e) => set("password", e.target.value)}
              required={!editing}
              minLength={editing && !v.password ? undefined : 8}
              autoComplete="new-password"
              className="input mono"
            />
            <button type="button" className="icon-btn input-addon" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((s) => !s)}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              type="button"
              className="icon-btn input-addon"
              aria-label="Generate password"
              title="Generate password"
              onClick={() => {
                set("password", generatePassword());
                setShowPw(true);
              }}
            >
              <Dices size={16} />
            </button>
          </div>
        </Field>
        <Field label="Storage limit (MiB)" hint={`${(v.quota / 1024).toFixed(1)} GiB${editing ? ` · using ${bytes(mailbox!.quota_used)}` : ""}`} error={quotaError}>
          <TextInput type="number" min={0} value={v.quota} onChange={(e) => set("quota", Number(e.target.value))} />
        </Field>
      </div>
      <div className="toggles">
        <Toggle checked={v.active} onChange={(x) => set("active", x)} label="Active" />
        <Toggle checked={v.force_pw_update} onChange={(x) => set("force_pw_update", x)} label="Ask for a new password at next login" />
        {editing && (
          <>
            <Toggle checked={v.imap_access} onChange={(x) => set("imap_access", x)} label="IMAP" />
            <Toggle checked={v.pop3_access} onChange={(x) => set("pop3_access", x)} label="POP3" />
            <Toggle checked={v.smtp_access} onChange={(x) => set("smtp_access", x)} label="SMTP" />
            <Toggle checked={v.sogo_access} onChange={(x) => set("sogo_access", x)} label="Webmail (SOGo)" />
          </>
        )}
      </div>
      {editing && (
        <>
          <RateLimitSection kind="mbox" id={mailbox!.username} />
          <p className="muted small">
            <Link className="link" to={`/app-passwords?mailbox=${encodeURIComponent(mailbox!.username)}`} onClick={onClose}>
              Manage app passwords for this mailbox
            </Link>
          </p>
        </>
      )}
      <div className="modal-foot modal-foot-inline">
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={save.isPending} disabled={!!quotaError || (!editing && !v.domain)}>
          {editing ? "Save changes" : "Create mailbox"}
        </Button>
      </div>
    </form>
  );
}
