import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, ShieldCheck, ShieldX } from "lucide-react";
import { asArray, mcGet } from "../lib/api";
import { useDomains, useMailboxes, useMailcowMutation } from "../lib/queries";
import { Button, Card, Empty, ErrorState, Field, Loading, Modal, PageHeader, SearchInput, TextInput } from "../components/ui";

interface Policy {
  prefid: string | number;
  value: string;
  object: string;
}

type Scope = { kind: "domain" | "mailbox"; id: string };

/** mailcow answers {score:"8,15"} (and older docs say {spam_score:"8,15"}); some versions answer the bare string. */
export function parseScore(d: unknown): { low: number; high: number } | null {
  const raw = typeof d === "string" ? d : d && typeof d === "object" ? ((d as Record<string, unknown>).score ?? (d as Record<string, unknown>).spam_score) : null;
  if (typeof raw !== "string") return null;
  const [low, high] = raw.split(",").map((s) => parseFloat(s));
  return Number.isFinite(low) && Number.isFinite(high) ? { low, high } : null;
}

export function SpamFilterPage() {
  const [tab, setTab] = useState<"lists" | "levels">("lists");
  return (
    <>
      <PageHeader title="Spam filter" subtitle="Always allow or always block senders, and set how strict filtering is for each mailbox" />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "lists"} className={`tab ${tab === "lists" ? "tab-active" : ""}`} onClick={() => setTab("lists")}>
          Allow and block lists
        </button>
        <button role="tab" aria-selected={tab === "levels"} className={`tab ${tab === "levels" ? "tab-active" : ""}`} onClick={() => setTab("levels")}>
          Spam levels
        </button>
      </div>
      {tab === "lists" ? <Lists /> : <Levels />}
    </>
  );
}

/* ---------------- allow / block lists ---------------- */

function Lists() {
  const domains = useDomains();
  const mailboxes = useMailboxes();
  const [scopeKey, setScopeKey] = useState("");
  const first = domains.data?.[0]?.domain_name;
  const key = scopeKey || (first ? `domain:${first}` : "");
  const scope: Scope | null = key ? { kind: key.startsWith("domain:") ? "domain" : "mailbox", id: key.slice(key.indexOf(":") + 1) } : null;

  if (domains.isLoading || mailboxes.isLoading) return <Loading />;
  if (domains.error) return <ErrorState error={domains.error} />;
  if (!domains.data?.length) return <Empty title="No domains yet">Add a domain first.</Empty>;

  return (
    <>
      <div className="toolbar">
        <label className="inline-field">
          <span className="muted small">Applies to</span>
          <select className="input" value={key} onChange={(e) => setScopeKey(e.target.value)} aria-label="Domain or mailbox">
            <optgroup label="Whole domain">
              {domains.data.map((d) => (
                <option key={d.domain_name} value={`domain:${d.domain_name}`}>
                  {d.domain_name} (everyone)
                </option>
              ))}
            </optgroup>
            <optgroup label="One mailbox">
              {(mailboxes.data ?? []).map((m) => (
                <option key={m.username} value={`mailbox:${m.username}`}>
                  {m.username}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>
      {scope && (
        <div className="grid-2">
          <PolicyList key={`wl:${key}`} scope={scope} list="wl" />
          <PolicyList key={`bl:${key}`} scope={scope} list="bl" />
        </div>
      )}
      <p className="muted small">
        Use an exact address like <code>news@shop.com</code> or a whole domain like <code>*@shop.com</code>. Allowed senders skip the spam filter. Blocked senders are
        always rejected. Mailbox lists apply on top of the domain's lists.
      </p>
    </>
  );
}

function PolicyList({ scope, list }: { scope: Scope; list: "wl" | "bl" }) {
  const getPath = `policy_${list}_${scope.kind}/${encodeURIComponent(scope.id)}`;
  const qk = ["policy", list, scope.kind, scope.id];
  const q = useQuery({ queryKey: qk, queryFn: async () => asArray<Policy>(await mcGet(getPath)).filter((p) => p && p.value) });
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const noun = list === "wl" ? "allowed" : "blocked";

  const add = useMailcowMutation(
    (v: string) => ({
      path: `add/${scope.kind}-policy`,
      body: scope.kind === "domain" ? { domain: scope.id, object_list: list, object_from: v } : { username: scope.id, object_list: list, object_from: v },
    }),
    { invalidate: [qk], success: (v) => `${v} is now ${noun}` },
  );
  const del = useMailcowMutation((p: Policy) => ({ path: `delete/${scope.kind}-policy`, body: [String(p.prefid)] }), {
    invalidate: [qk],
    success: (p) => `Removed ${p.value}`,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!/^(\*|[^@\s]+)@[^@\s]+\.[^@\s]+$/.test(v) && !/^\*?@?[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) {
      setError("Enter an address (name@shop.com) or a domain (*@shop.com).");
      return;
    }
    setError("");
    const normalized = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v) ? `*@${v}` : v.replace(/^@/, "*@");
    add.mutate(normalized, { onSuccess: () => setValue("") });
  };

  return (
    <Card
      title={
        <span className="chart-title">
          {list === "wl" ? <ShieldCheck size={16} className="tone-good" /> : <ShieldX size={16} className="tone-bad" />}
          {list === "wl" ? "Always allow" : "Always block"}
        </span>
      }
      actions={q.data && <span className="muted small">{q.data.length}</span>}
    >
      <form className="inline-add" onSubmit={submit}>
        <TextInput placeholder={list === "wl" ? "*@partner.com" : "spammer@bad.test"} value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Add ${noun} sender`} />
        <Button type="submit" variant="secondary" loading={add.isPending}>
          <Plus size={16} /> Add
        </Button>
      </form>
      {error && <div className="field-error">{error}</div>}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !q.data!.length ? (
        <p className="muted small">No {noun} senders.</p>
      ) : (
        <ul className="list">
          {q.data!.map((p) => (
            <li key={String(p.prefid)} className="list-row">
              <div className="list-main mono">{p.value}</div>
              <button className="icon-btn" aria-label={`Remove ${p.value}`} title="Remove" onClick={() => del.mutate(p)} disabled={del.isPending}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- spam levels ---------------- */

function Levels() {
  const mailboxes = useMailboxes();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const global = useQuery({ queryKey: ["spam-score", ""], queryFn: async () => parseScore(await mcGet("spam-score/")) });
  const boxes = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (mailboxes.data ?? []).filter((m) => !s || m.username.toLowerCase().includes(s)).sort((a, b) => a.username.localeCompare(b.username));
  }, [mailboxes.data, q]);
  const scores = useQueries({
    queries: boxes.map((m) => ({
      queryKey: ["spam-score", m.username],
      queryFn: async () => parseScore(await mcGet(`spam-score/${encodeURIComponent(m.username)}`)),
      staleTime: 60_000,
    })),
  });

  if (mailboxes.isLoading) return <Loading />;
  if (mailboxes.error) return <ErrorState error={mailboxes.error} />;
  const def = global.data;

  return (
    <>
      <Card pad={false}>
        <div className="levels-explain">
          <div>
            <strong>How spam levels work.</strong> rspamd gives every message a score. Above the <em>junk</em> level it goes to the Junk folder. Above the{" "}
            <em>reject</em> level it's refused and never delivered. Lower numbers are stricter.
            {def && (
              <>
                {" "}
                Server default: junk at {def.low}, reject at {def.high}.
              </>
            )}
          </div>
        </div>
        <div className="toolbar toolbar-pad">
          <SearchInput value={q} onChange={setQ} placeholder="Search mailboxes" />
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Mailbox</th>
                <th>Junk at</th>
                <th>Reject at</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {boxes.map((m, i) => {
                const s = scores[i];
                const v = s?.data;
                const custom = v && def && (v.low !== def.low || v.high !== def.high);
                return (
                  <tr key={m.username}>
                    <td>
                      <div className="strong">{m.username}</div>
                      {custom && <div className="muted small">Custom</div>}
                    </td>
                    <td className="mono">{s?.isLoading ? "…" : v ? v.low : "–"}</td>
                    <td className="mono">{s?.isLoading ? "…" : v ? v.high : "–"}</td>
                    <td className="col-actions">
                      <button className="icon-btn" aria-label={`Change spam levels for ${m.username}`} title="Change" onClick={() => setEditing(m.username)}>
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && (
        <LevelForm
          mailbox={editing}
          current={scores[boxes.findIndex((b) => b.username === editing)]?.data ?? def ?? { low: 8, high: 15 }}
          def={def ?? null}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function LevelForm({ mailbox, current, def, onClose }: { mailbox: string; current: { low: number; high: number }; def: { low: number; high: number } | null; onClose: () => void }) {
  const [low, setLow] = useState(String(current.low));
  const [high, setHigh] = useState(String(current.high));
  const save = useMailcowMutation((v: { low: number; high: number }) => ({ path: "edit/spam-score", body: { items: [mailbox], attr: { spam_score: `${v.low},${v.high}` } } }), {
    invalidate: [["spam-score", mailbox]],
    success: `Saved spam levels for ${mailbox}`,
  });
  const l = parseFloat(low);
  const h = parseFloat(high);
  const err = !Number.isFinite(l) || !Number.isFinite(h) ? "Enter two numbers." : l <= 0 ? "Junk level must be above 0." : h <= l ? "Reject level must be higher than the junk level." : "";

  return (
    <Modal
      open
      onClose={onClose}
      title={`Spam levels for ${mailbox}`}
      footer={
        <>
          {def && (
            <Button
              variant="ghost"
              onClick={() => {
                setLow(String(def.low));
                setHigh(String(def.high));
              }}
            >
              Use server default
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!!err} loading={save.isPending} onClick={() => save.mutate({ low: l, high: h }, { onSuccess: onClose })}>
            Save
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Move to Junk at score" hint="Typical: 5 (strict) to 10 (relaxed)">
          <TextInput type="number" step="0.5" min="0" value={low} onChange={(e) => setLow(e.target.value)} />
        </Field>
        <Field label="Reject at score" hint="Typical: 12 to 20" error={err || undefined}>
          <TextInput type="number" step="0.5" min="0" value={high} onChange={(e) => setHigh(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
