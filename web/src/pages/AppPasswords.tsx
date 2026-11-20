import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { asArray, mcGet } from "../lib/api";
import { isActive } from "../lib/format";
import { useMailboxes, useMailcowMutation } from "../lib/queries";
import { Button, Card, ConfirmDialog, CopyButton, Empty, ErrorState, Field, Loading, Modal, PageHeader, StatusBadge, TextInput, Toggle } from "../components/ui";
import { generatePassword } from "../components/MailboxForm";

interface AppPassword {
  id: number;
  name: string;
  mailbox: string;
  active: number | string;
  created?: string;
  imap_access?: number | string;
  smtp_access?: number | string;
  dav_access?: number | string;
  eas_access?: number | string;
  pop3_access?: number | string;
  sieve_access?: number | string;
}

const PROTOCOLS = [
  { key: "imap_access", label: "IMAP" },
  { key: "smtp_access", label: "SMTP" },
  { key: "pop3_access", label: "POP3" },
  { key: "dav_access", label: "CalDAV/CardDAV" },
  { key: "eas_access", label: "ActiveSync" },
  { key: "sieve_access", label: "Sieve" },
] as const;

export function AppPasswordsPage() {
  const mailboxes = useMailboxes();
  const [params, setParams] = useSearchParams();
  const mailbox = params.get("mailbox") ?? "";
  const list = useQuery({
    queryKey: ["app-passwd", mailbox],
    queryFn: async () => asArray<AppPassword>(await mcGet(`app-passwd/all/${encodeURIComponent(mailbox)}`)),
    enabled: !!mailbox,
  });
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AppPassword | null>(null);
  const del = useMailcowMutation((a: AppPassword) => ({ path: "delete/app-passwd", body: [a.id] }), {
    invalidate: [["app-passwd", mailbox]],
    success: (a) => `Deleted "${a.name}"`,
  });

  return (
    <>
      <PageHeader title="App passwords" subtitle="Separate passwords for mail apps and phones, so the main password never has to be stored in them." />
      <Card pad={false}>
        <div className="toolbar">
          <select className="input select-sm" value={mailbox} onChange={(e) => setParams(e.target.value ? { mailbox: e.target.value } : {})} aria-label="Mailbox">
            <option value="">Choose a mailbox</option>
            {mailboxes.data?.map((m) => (
              <option key={m.username}>{m.username}</option>
            ))}
          </select>
          <div className="toolbar-spacer" />
          <Button variant="primary" disabled={!mailbox} onClick={() => setAdding(true)}>
            <Plus size={16} /> Add app password
          </Button>
        </div>
        {!mailbox ? (
          <Empty title="Choose a mailbox">App passwords belong to one mailbox.</Empty>
        ) : list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => list.refetch()} />
        ) : !list.data?.length ? (
          <Empty title="No app passwords for this mailbox" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Works for</th>
                  <th>Status</th>
                  <th className="col-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.data.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="strong">{a.name}</div>
                      {a.created && <div className="muted small">Created {a.created}</div>}
                    </td>
                    <td>
                      <div className="chips">
                        {PROTOCOLS.filter((p) => a[p.key] === undefined || isActive(a[p.key])).map((p) => (
                          <span key={p.key} className="chip">
                            {p.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <StatusBadge active={isActive(a.active)} />
                    </td>
                    <td className="col-actions">
                      <button className="icon-btn icon-danger" aria-label={`Delete ${a.name}`} onClick={() => setDeleting(a)}>
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
      <Modal open={adding} onClose={() => setAdding(false)} title={`New app password for ${mailbox}`}>
        {adding && <AddForm mailbox={mailbox} onClose={() => setAdding(false)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        title={`Delete "${deleting?.name}"?`}
        body={<p>Apps using this password will stop being able to sign in.</p>}
        loading={del.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}

function AddForm({ mailbox, onClose }: { mailbox: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [pw] = useState(() => generatePassword(24));
  const [protocols, setProtocols] = useState<Record<string, boolean>>({ imap_access: true, smtp_access: true, pop3_access: false, dav_access: true, eas_access: true, sieve_access: false });
  const [done, setDone] = useState(false);
  const add = useMailcowMutation(
    () => ({
      path: "add/app-passwd",
      body: {
        username: mailbox,
        app_name: name,
        app_passwd: pw,
        app_passwd2: pw,
        active: 1,
        protocols: Object.entries(protocols)
          .filter(([, v]) => v)
          .map(([k]) => k),
      },
    }),
    { invalidate: [["app-passwd", mailbox]], success: `Created "${name}"` },
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await add.mutateAsync(undefined);
    setDone(true);
  };

  if (done)
    return (
      <div>
        <p>Enter this password in the app, together with the username <strong>{mailbox}</strong>. It won't be shown again.</p>
        <div className="secret-box">
          <span className="mono">{pw}</span>
          <CopyButton text={pw} />
        </div>
        <div className="modal-foot modal-foot-inline">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );

  return (
    <form onSubmit={submit}>
      <Field label="Name" hint="So you remember where it's used">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="iPhone Mail" required autoFocus />
      </Field>
      <div className="field">
        <span className="field-label">Works for</span>
        <div className="toggles">
          {PROTOCOLS.map((p) => (
            <Toggle key={p.key} checked={!!protocols[p.key]} onChange={(x) => setProtocols((s) => ({ ...s, [p.key]: x }))} label={p.label} />
          ))}
        </div>
      </div>
      <div className="modal-foot modal-foot-inline">
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={add.isPending}>
          Create password
        </Button>
      </div>
    </form>
  );
}
