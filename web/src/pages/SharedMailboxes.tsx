import { useState } from "react";
import { Link } from "react-router";
import { Plus, Send, Users, FolderOpen, X } from "lucide-react";
import { useMailboxes, useMailcowMutation } from "../lib/queries";
import { Button, Card, CopyButton, Empty, ErrorState, Field, Loading, PageHeader } from "../components/ui";

/**
 * mailcow's API can say who may send as a mailbox (sender_acl), but has no endpoint for
 * IMAP folder sharing. So this page sets send-as rights and explains how folder access is granted.
 */
export function SharedMailboxesPage({ mailcowUrl }: { mailcowUrl: string }) {
  const mailboxes = useMailboxes();
  const [shared, setShared] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [pick, setPick] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const save = useMailcowMutation(
    (v: { mailbox: string; people: string[] }) => ({ path: "edit/mailbox", body: { items: [v.mailbox], attr: { sender_acl: v.people.length ? v.people : ["default"] } } }),
    { invalidate: [["mailboxes"]], success: (v) => `Saved who can send as ${v.mailbox}` },
  );

  if (mailboxes.isLoading) return <Loading />;
  if (mailboxes.error) return <ErrorState error={mailboxes.error} />;
  const all = (mailboxes.data ?? []).map((m) => m.username).sort();
  if (!all.length) return <Empty title="No mailboxes yet">Create the mailbox you want to share first.</Empty>;
  const target = shared || all[0];
  const others = all.filter((u) => u !== target && !people.includes(u));
  const sogo = `${mailcowUrl.replace(/\/$/, "")}/SOGo/`;
  const doveadm = `docker compose exec dovecot-mailcow doveadm acl set -u ${target} INBOX user=${people[0] ?? "colleague@example.com"} lookup read write write-seen insert expunge`;

  return (
    <>
      <PageHeader title="Shared mailboxes" subtitle="Let a team use one address, like info@ or support@" />

      <div className="steps-intro muted">
        A shared mailbox is a normal mailbox (create it under{" "}
        <Link to="/mailboxes" className="link">
          Mailboxes
        </Link>
        ). Then two separate things make it shared: letting people <strong>send as</strong> the address, and letting them <strong>open its folders</strong>.
      </div>

      <div className="grid-2 grid-top">
        <Card
          title={
            <span className="chart-title">
              <Send size={16} /> 1. Who can send as it
            </span>
          }
        >
          <div className="form-grid one-col">
            <Field label="Shared mailbox">
              <select
                className="input"
                value={target}
                onChange={(e) => {
                  setShared(e.target.value);
                  setPeople([]);
                  setSaved(null);
                }}
              >
                {all.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
            <Field label="People who can send as this address" hint="They pick it as the From address in SOGo or their mail app.">
              <div className="inline-add">
                <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add a person">
                  <option value="">Choose a mailbox…</option>
                  {others.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  disabled={!pick}
                  onClick={() => {
                    setPeople((p) => [...p, pick]);
                    setPick("");
                  }}
                >
                  <Plus size={16} /> Add
                </Button>
              </div>
            </Field>
          </div>
          {people.length > 0 && (
            <div className="chips chips-gap">
              {people.map((p) => (
                <span key={p} className="chip">
                  {p}
                  <button className="chip-x" aria-label={`Remove ${p}`} onClick={() => setPeople((x) => x.filter((y) => y !== p))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="muted small">
            mailcow's API doesn't report the current list, so saving <strong>replaces</strong> whatever was set before for {target}. Include everyone who should keep access.
          </p>
          <div className="row-gap">
            <Button
              variant="primary"
              disabled={!people.length}
              loading={save.isPending}
              onClick={() => save.mutate({ mailbox: target, people }, { onSuccess: () => setSaved(target) })}
            >
              Save send-as list
            </Button>
            {saved === target && <span className="muted small">Saved.</span>}
          </div>
        </Card>

        <Card
          title={
            <span className="chart-title">
              <FolderOpen size={16} /> 2. Who can open its folders
            </span>
          }
        >
          <p>mailcow doesn't offer folder sharing through its API, so this part can't be done from here. It takes a minute in SOGo:</p>
          <ol className="steps">
            <li>
              Sign in to{" "}
              <a className="link" href={sogo} target="_blank" rel="noreferrer">
                SOGo
              </a>{" "}
              as <strong>{target}</strong>.
            </li>
            <li>In Mail, open the menu next to Inbox (or any folder) and choose Sharing.</li>
            <li>Add each person and tick what they may do (read, mark as read, delete, and so on).</li>
            <li>Each person then finds the folders under "Other users" in SOGo, or "Shared" in their mail app, and subscribes to them.</li>
          </ol>
          <details className="details">
            <summary>Or from the server's command line</summary>
            <p className="muted small">Run in your mailcow-dockerized folder. Repeat for each folder and each person.</p>
            <div className="code-row">
              <code className="dns-value">{doveadm}</code>
              <CopyButton text={doveadm} />
            </div>
          </details>
          <p className="muted small">
            <Users size={13} className="inline-icon" /> If several people should simply share one login instead, give each their own{" "}
            <Link className="link" to={`/app-passwords?mailbox=${encodeURIComponent(target)}`}>
              app password
            </Link>{" "}
            for {target}, so you can revoke one person without changing the others.
          </p>
        </Card>
      </div>
    </>
  );
}
