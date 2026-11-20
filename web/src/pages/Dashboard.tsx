import { Link } from "react-router";
import { Globe, Inbox, Forward, HardDrive, Send, ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAliases, useContainers, useDomains, useMailboxes, useQuarantine, useQueue, useVersion, useVmail } from "../lib/queries";
import { bytes, isActive, pct, plural } from "../lib/format";
import { Badge, Card, ErrorState, Loading, PageHeader, Stat, UsageBar } from "../components/ui";
import { UpdateBanner } from "../components/UpdateBanner";
import { HostCharts } from "../components/HostCharts";

export function DashboardPage() {
  const domains = useDomains();
  const mailboxes = useMailboxes();
  const aliases = useAliases();
  const queue = useQueue();
  const quarantine = useQuarantine();
  const containers = useContainers();
  const version = useVersion();
  const vmail = useVmail();

  const boxes = mailboxes.data ?? [];
  const used = boxes.reduce((s, m) => s + Number(m.quota_used || 0), 0);
  const topBoxes = [...boxes].sort((a, b) => pct(b.quota_used, b.quota) - pct(a.quota_used, a.quota)).slice(0, 6);
  const unhealthy = (containers.data ?? []).filter((c) => c.state !== "running");
  const disabled = boxes.filter((m) => !isActive(m.active)).length;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={version.data?.version ? `mailcow ${version.data.version}` : "Overview of your mail server"} />

      <UpdateBanner />

      {domains.error && <ErrorState error={domains.error} retry={() => domains.refetch()} />}

      <div className="stats">
        <Link to="/domains" className="stat-link">
          <Stat label="Domains" icon={<Globe size={18} />} value={domains.data?.length ?? "–"} sub={domains.data && `${domains.data.filter((d) => isActive(d.active)).length} active`} />
        </Link>
        <Link to="/mailboxes" className="stat-link">
          <Stat label="Mailboxes" icon={<Inbox size={18} />} value={mailboxes.data?.length ?? "–"} sub={mailboxes.data && (disabled ? `${disabled} disabled` : "All active")} />
        </Link>
        <Link to="/aliases" className="stat-link">
          <Stat label="Aliases" icon={<Forward size={18} />} value={aliases.data?.length ?? "–"} />
        </Link>
        <Stat label="Mail stored" icon={<HardDrive size={18} />} value={mailboxes.data ? bytes(used) : "–"} sub={vmail.data && `Disk ${vmail.data.used} of ${vmail.data.total} (${vmail.data.used_percent})`} />
        <Link to="/queue" className="stat-link">
          <Stat label="In queue" icon={<Send size={18} />} value={queue.data?.length ?? "–"} sub={queue.data && (queue.data.length ? "Waiting to be delivered" : "Nothing waiting")} />
        </Link>
        <Link to="/quarantine" className="stat-link">
          <Stat label="Quarantined" icon={<ShieldAlert size={18} />} value={quarantine.data?.length ?? "–"} />
        </Link>
      </div>

      <HostCharts />

      <div className="grid-2">
        <Card title="Fullest mailboxes" actions={<Link to="/mailboxes" className="link">All mailboxes</Link>}>
          {mailboxes.isLoading ? (
            <Loading />
          ) : (
            <ul className="list">
              {topBoxes.map((m) => {
                const p = pct(m.quota_used, m.quota);
                return (
                  <li key={m.username} className="list-row">
                    <div className="list-main">
                      <div className="strong">{m.username}</div>
                      <div className="muted small">{m.name}</div>
                    </div>
                    <div className="list-side">
                      <UsageBar value={p} label={`${bytes(m.quota_used)} / ${bytes(m.quota)}`} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Services"
          actions={
            containers.data &&
            (unhealthy.length ? (
              <Badge tone="bad">{plural(unhealthy.length, "problem")}</Badge>
            ) : (
              <Badge tone="good">All running</Badge>
            ))
          }
        >
          {containers.isLoading ? (
            <Loading />
          ) : containers.error ? (
            <ErrorState error={containers.error} />
          ) : (
            <div className="chips">
              {containers.data!.map((c) => (
                <span key={c.container} className={`chip ${c.state === "running" ? "" : "chip-bad"}`} title={`${c.image} · ${c.state}`}>
                  {c.state === "running" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  {c.container}
                </span>
              ))}
            </div>
          )}
          <div className="card-link-row">
            <Link to="/system" className="link">
              Service details
            </Link>
          </div>
        </Card>
      </div>

      <Card title="Domains" actions={<Link to="/domains" className="link">Manage</Link>} pad={false}>
        {domains.isLoading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Mailboxes</th>
                  <th>Storage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {domains.data?.map((d) => (
                  <tr key={d.domain_name}>
                    <td>
                      <Link to={`/domains/${encodeURIComponent(d.domain_name)}`} className="strong link-plain">
                        {d.domain_name}
                      </Link>
                    </td>
                    <td>
                      {d.mboxes_in_domain} / {d.max_num_mboxes_for_domain}
                    </td>
                    <td className="col-usage">
                      <UsageBar value={pct(d.bytes_total, d.max_quota_for_domain)} label={`${bytes(d.bytes_total)} of ${bytes(d.max_quota_for_domain)}`} />
                    </td>
                    <td>
                      <Badge tone={isActive(d.active) ? "good" : "neutral"}>{isActive(d.active) ? "Active" : "Disabled"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
