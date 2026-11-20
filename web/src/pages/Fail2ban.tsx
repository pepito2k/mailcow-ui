import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { mcGet } from "../lib/api";
import { useMailcowMutation } from "../lib/queries";
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorState, Field, Loading, PageHeader, TextInput } from "../components/ui";

interface Ban {
  network?: string;
  ip?: string;
  banned_until?: string | number;
  queued_for_unban?: number | string;
}

interface F2B {
  ban_time?: number | string;
  max_ban_time?: number | string;
  ban_time_increment?: number | string;
  max_attempts?: number | string;
  retry_window?: number | string;
  netban_ipv4?: number | string;
  netban_ipv6?: number | string;
  whitelist?: string;
  blacklist?: string;
  active_bans?: Ban[];
  perm_bans?: (Ban | string)[];
}

const NUMBER_FIELDS: { key: keyof F2B; label: string; hint?: string }[] = [
  { key: "max_attempts", label: "Failed logins before a ban" },
  { key: "retry_window", label: "Counted over (seconds)" },
  { key: "ban_time", label: "Ban for (seconds)" },
  { key: "max_ban_time", label: "Longest ban (seconds)", hint: "Repeat offenders get longer bans up to this" },
  { key: "netban_ipv4", label: "IPv4 subnet to ban (/32 = one IP)" },
  { key: "netban_ipv6", label: "IPv6 subnet to ban (/128 = one IP)" },
];

export function Fail2banPage() {
  const q = useQuery({ queryKey: ["fail2ban"], queryFn: () => mcGet<F2B>("fail2ban"), refetchInterval: 60_000 });
  const [v, setV] = useState<Record<string, string>>({});
  const [unban, setUnban] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    const next: Record<string, string> = {};
    for (const f of NUMBER_FIELDS) if (q.data[f.key] !== undefined) next[f.key] = String(q.data[f.key]);
    next.whitelist = String(q.data.whitelist ?? "");
    next.blacklist = String(q.data.blacklist ?? "");
    setV(next);
  }, [q.data]);

  const save = useMailcowMutation(
    () => ({
      path: "edit/fail2ban",
      body: { items: ["none"], attr: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, NUMBER_FIELDS.some((f) => f.key === k) ? Number(x) : x])) },
    }),
    { invalidate: [["fail2ban"]], success: "Fail2ban settings saved" },
  );
  const doUnban = useMailcowMutation(
    (network: string) => ({ path: "edit/fail2ban", body: { items: [network], attr: { action: "unban", network: [network] } } }),
    { invalidate: [["fail2ban"]], success: (n) => `Unbanned ${n}` },
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(undefined);
  };

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const bans = q.data?.active_bans ?? [];

  return (
    <>
      <PageHeader title="Fail2ban" subtitle="Blocks IP addresses after too many failed logins." />
      <Card title={`Banned right now (${bans.length})`} pad={false}>
        {!bans.length ? (
          <Empty title="Nobody is banned" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Network</th>
                  <th>Banned until</th>
                  <th className="col-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {bans.map((b) => {
                  const net = String(b.network ?? b.ip);
                  return (
                    <tr key={net}>
                      <td className="mono">{net}</td>
                      <td>
                        {String(b.banned_until ?? "")} {String(b.queued_for_unban) === "1" && <Badge tone="info">Unban queued</Badge>}
                      </td>
                      <td className="col-actions">
                        <Button size="sm" variant="ghost" onClick={() => setUnban(net)}>
                          Unban
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Settings">
        <form onSubmit={submit}>
          <div className="form-grid">
            {NUMBER_FIELDS.filter((f) => v[f.key] !== undefined).map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <TextInput type="number" min={0} value={v[f.key]} onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))} />
              </Field>
            ))}
            <Field label="Never ban (allow list)" hint="One IP, network or hostname per line" wide>
              <textarea className="input mono" rows={4} value={v.whitelist ?? ""} onChange={(e) => setV((s) => ({ ...s, whitelist: e.target.value }))} />
            </Field>
            <Field label="Always ban (block list)" hint="One IP or network per line" wide>
              <textarea className="input mono" rows={4} value={v.blacklist ?? ""} onChange={(e) => setV((s) => ({ ...s, blacklist: e.target.value }))} />
            </Field>
          </div>
          <div className="form-actions">
            <Button variant="primary" type="submit" loading={save.isPending}>
              Save settings
            </Button>
          </div>
        </form>
      </Card>

      <ConfirmDialog
        open={!!unban}
        title={`Unban ${unban}?`}
        body={<p>It can try to sign in again right away.</p>}
        confirmLabel="Unban"
        loading={doUnban.isPending}
        onClose={() => setUnban(null)}
        onConfirm={() => unban && doUnban.mutate(unban, { onSuccess: () => setUnban(null) })}
      />
    </>
  );
}
