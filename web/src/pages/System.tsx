import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useContainers, useUpdates, useVersion, useVmail } from "../lib/queries";
import { UPDATE_DOCS_URL } from "../components/UpdateBanner";
import { ago } from "../lib/format";
import { Badge, Card, ErrorState, Loading, PageHeader, Stat, UsageBar } from "../components/ui";

export function SystemPage() {
  const containers = useContainers();
  const version = useVersion();
  const vmail = useVmail();
  const updates = useUpdates();
  const u = updates.data;
  const versionSub = !u?.enabled ? undefined : u.updateAvailable ? (
    <span>
      <Badge tone="warn">{u.latest} available</Badge>{" "}
      <a className="link" href={UPDATE_DOCS_URL} target="_blank" rel="noreferrer">
        How to update
      </a>
    </span>
  ) : u.latest ? (
    <span>Up to date (latest is {u.latest})</span>
  ) : u.error ? (
    <span>Couldn't check for updates</span>
  ) : undefined;
  const list = containers.data ?? [];
  const bad = list.filter((c) => c.state !== "running");

  return (
    <>
      <PageHeader title="Status" subtitle="Health of the mailcow services." />
      <div className="stats stats-3">
        <Stat label="mailcow version" value={version.data?.version ?? "–"} sub={versionSub} />
        <Stat label="Services running" value={containers.data ? `${list.length - bad.length} / ${list.length}` : "–"} sub={bad.length ? <span className="danger-text">{bad.map((b) => b.container).join(", ")} not running</span> : undefined} />
        <Stat
          label="Mail storage disk"
          value={vmail.data ? `${vmail.data.used} of ${vmail.data.total}` : "–"}
          sub={vmail.data && <UsageBar value={parseInt(vmail.data.used_percent) || 0} label={`${vmail.data.used_percent} used on ${vmail.data.disk}`} />}
        />
      </div>
      <Card title="Services" pad={false}>
        {containers.isLoading ? (
          <Loading />
        ) : containers.error ? (
          <ErrorState error={containers.error} retry={() => containers.refetch()} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>State</th>
                  <th>Up since</th>
                  <th>Image</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.container}>
                    <td className="strong">
                      <span className={c.state === "running" ? "ok-icon" : "bad-icon"}>{c.state === "running" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span> {c.container}
                    </td>
                    <td>
                      <Badge tone={c.state === "running" ? "good" : "bad"}>{c.state}</Badge>
                    </td>
                    <td className="muted">{c.started_at ? ago(Math.floor(new Date(c.started_at).getTime() / 1000)) : ""}</td>
                    <td className="mono small muted">{c.image}</td>
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
