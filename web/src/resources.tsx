/**
 * Screen definitions for the simpler mailcow objects, rendered by ResourcePage.
 * Field and endpoint names follow mailcow's /api/v1.
 */
import { ArrowRight } from "lucide-react";
import type { ResourceDef, Row, Values } from "./components/ResourcePage";
import { Badge } from "./components/ui";
import { ago, isActive } from "./lib/format";

const b = (v: unknown) => (v ? 1 : 0);
const s = (v: unknown) => (v == null ? "" : String(v));

/** Adds password/password2 to an attr object only when a new password was typed. */
function withPassword(attr: Values, v: Values, field = "password", confirmField = "password2"): Values {
  const pw = s(v[field]);
  return pw ? { ...attr, [field]: pw, [confirmField]: pw } : attr;
}

function Arrow({ from, to }: { from: React.ReactNode; to: React.ReactNode }) {
  return (
    <span className="arrow-pair">
      <span className="strong">{from}</span>
      <ArrowRight size={14} className="muted" />
      <span>{to}</span>
    </span>
  );
}

export const aliasDomains: ResourceDef = {
  title: "Alias domains",
  subtitle: "Make another domain deliver to an existing one. Mail to anything@alias.com goes to anything@target.com.",
  noun: "alias domain",
  queryKey: "alias-domains",
  list: "alias-domain/all",
  rowKey: (r) => s(r.alias_domain),
  label: (r) => s(r.alias_domain),
  search: (r) => `${r.alias_domain} ${r.target_domain}`,
  columns: [{ label: "Alias domain", render: (r) => <Arrow from={s(r.alias_domain)} to={s(r.target_domain)} /> }],
  fields: [
    { name: "alias_domain", label: "Alias domain", required: true, placeholder: "example.net" },
    { name: "target_domain", label: "Delivers to domain", type: "domain", required: true, editable: true },
    { name: "active", label: "Active", type: "toggle", default: true, editable: true },
  ],
  add: { path: "add/alias-domain", body: (v) => ({ alias_domain: s(v.alias_domain).trim().toLowerCase(), target_domain: v.target_domain, active: b(v.active) }) },
  edit: {
    path: "edit/alias-domain",
    fromRow: (r) => ({ target_domain: r.target_domain, active: isActive(r.active) }),
    attr: (v) => ({ target_domain: v.target_domain, active: b(v.active) }),
  },
  remove: { path: "delete/alias-domain", warning: (r) => `Mail sent to @${r.alias_domain} will stop being delivered.` },
  toggleActive: true,
  empty: "Use alias domains when you own several domain names for the same mailboxes.",
};

export const domainAdmins: ResourceDef = {
  title: "Domain admins",
  subtitle: "People who can sign in to mailcow and manage only the domains you give them.",
  noun: "domain admin",
  queryKey: "domain-admins",
  list: "domain-admin/all",
  rowKey: (r) => s(r.username),
  label: (r) => s(r.username),
  search: (r) => `${r.username} ${(r.selected_domains as string[] | undefined)?.join(" ")}`,
  columns: [
    { label: "Username", render: (r) => <span className="strong">{s(r.username)}</span> },
    {
      label: "Domains",
      render: (r) => (
        <div className="chips">
          {((r.selected_domains as string[]) ?? []).map((d) => (
            <span key={d} className="chip">
              {d}
            </span>
          ))}
        </div>
      ),
    },
    { label: "2FA", render: (r) => (isActive(r.tfa_active) ? <Badge tone="good">On</Badge> : <Badge>Off</Badge>) },
  ],
  fields: [
    { name: "username", label: "Username", required: true, placeholder: "jane" },
    { name: "password", label: "Password", type: "password", required: true, generate: true, editable: true, default: "" },
    { name: "domains", label: "Can manage", type: "domains", editable: true },
    { name: "active", label: "Active", type: "toggle", default: true, editable: true },
  ],
  add: {
    path: "add/domain-admin",
    body: (v) => ({ username: s(v.username).trim(), domains: v.domains, password: v.password, password2: v.password, active: b(v.active) }),
  },
  edit: {
    path: "edit/domain-admin",
    fromRow: (r) => ({ domains: r.selected_domains ?? [], active: isActive(r.active), password: "" }),
    attr: (v) => withPassword({ domains: v.domains, active: b(v.active) }, v),
  },
  remove: { path: "delete/domain-admin" },
  toggleActive: true,
};

export const resources: ResourceDef = {
  title: "Resources",
  subtitle: "Rooms and equipment people can book in calendar invites (SOGo).",
  noun: "resource",
  queryKey: "resources",
  list: "resource/all",
  rowKey: (r) => s(r.name),
  label: (r) => s(r.description || r.name),
  search: (r) => `${r.name} ${r.description} ${r.kind}`,
  columns: [
    {
      label: "Resource",
      render: (r) => (
        <>
          <div className="strong">{s(r.description)}</div>
          <div className="muted small">{s(r.name)}</div>
        </>
      ),
    },
    { label: "Kind", render: (r) => <Badge tone="info">{s(r.kind)}</Badge> },
  ],
  fields: [
    { name: "description", label: "Name", required: true, placeholder: "Meeting room 1", editable: true },
    { name: "domain", label: "Domain", type: "domain", required: true },
    {
      name: "kind",
      label: "Kind",
      type: "select",
      default: "location",
      editable: true,
      options: [
        { value: "location", label: "Location (room)" },
        { value: "group", label: "Group" },
        { value: "thing", label: "Thing (equipment)" },
      ],
    },
    { name: "active", label: "Active", type: "toggle", default: true, editable: true },
  ],
  add: {
    path: "add/resource",
    body: (v) => ({ description: v.description, domain: v.domain, kind: v.kind, active: b(v.active), multiple_bookings_select: "0", multiple_bookings_custom: "" }),
  },
  edit: {
    path: "edit/resource",
    fromRow: (r) => ({ description: r.description, kind: r.kind, active: isActive(r.active) }),
    attr: (v) => ({ description: v.description, kind: v.kind, active: b(v.active) }),
  },
  remove: { path: "delete/resource" },
  toggleActive: true,
};

export const syncJobs: ResourceDef = {
  title: "Sync jobs",
  subtitle: "Copy mail from another IMAP server into a mailbox here, on a schedule (imapsync).",
  noun: "sync job",
  queryKey: "syncjobs",
  list: "syncjobs/all/no_log",
  rowKey: (r) => Number(r.id),
  label: (r) => `${s(r.user1)} → ${s(r.user2)}`,
  search: (r) => `${r.user1} ${r.host1} ${r.user2}`,
  columns: [
    { label: "From", render: (r) => <Arrow from={`${s(r.user1)} @ ${s(r.host1)}`} to={s(r.user2)} /> },
    { label: "Every", render: (r) => `${s(r.mins_interval)} min` },
    { label: "Last run", render: (r) => (isActive(r.is_running) ? <Badge tone="info">Running</Badge> : r.last_run ? ago(Date.parse(s(r.last_run)) / 1000) : "Never") },
    {
      label: "Result",
      render: (r) =>
        r.success == null || r.success === "" ? <span className="muted">–</span> : isActive(r.success) ? <Badge tone="good">OK</Badge> : <Badge tone="bad">{s(r.exit_status) || "Failed"}</Badge>,
    },
  ],
  fields: [
    { name: "username", label: "Into mailbox", type: "mailbox", required: true },
    { name: "host1", label: "Remote IMAP server", required: true, placeholder: "imap.gmail.com", editable: true },
    { name: "port1", label: "Port", type: "number", default: "993", editable: true },
    {
      name: "enc1",
      label: "Encryption",
      type: "select",
      default: "SSL",
      editable: true,
      options: [
        { value: "SSL", label: "SSL/TLS" },
        { value: "TLS", label: "STARTTLS" },
        { value: "PLAIN", label: "None" },
      ],
    },
    { name: "user1", label: "Remote username", required: true, editable: true },
    { name: "password1", label: "Remote password", type: "password", required: true, editable: true },
    { name: "mins_interval", label: "Run every (minutes)", type: "number", default: "20", editable: true },
    { name: "subfolder2", label: "Put mail in folder", default: "External", hint: "Leave empty to sync into the same folders", editable: true },
    { name: "delete2duplicates", label: "Remove duplicates", type: "toggle", default: true, editable: true },
    { name: "delete1", label: "Delete from remote after copying", type: "toggle", editable: true },
    { name: "automap", label: "Map common folder names", type: "toggle", default: true, editable: true },
    { name: "active", label: "Active", type: "toggle", default: true, editable: true },
  ],
  add: {
    path: "add/syncjob",
    body: (v) => ({
      username: v.username,
      host1: v.host1,
      port1: Number(v.port1),
      enc1: v.enc1,
      user1: v.user1,
      password1: v.password1,
      mins_interval: Number(v.mins_interval),
      subfolder2: v.subfolder2,
      delete2duplicates: b(v.delete2duplicates),
      delete1: b(v.delete1),
      automap: b(v.automap),
      skipcrossduplicates: 0,
      subscribeall: 1,
      maxage: 0,
      maxbytespersecond: 0,
      timeout1: 600,
      timeout2: 600,
      exclude: "(?i)spam|(?i)junk",
      custom_params: "",
      delete2: 0,
      active: b(v.active),
    }),
  },
  edit: {
    path: "edit/syncjob",
    fromRow: (r: Row) => ({
      host1: r.host1,
      port1: r.port1,
      enc1: r.enc1,
      user1: r.user1,
      password1: "",
      mins_interval: r.mins_interval,
      subfolder2: r.subfolder2,
      delete2duplicates: isActive(r.delete2duplicates),
      delete1: isActive(r.delete1),
      automap: isActive(r.automap),
      active: isActive(r.active),
    }),
    attr: (v) => {
      const attr: Values = {
        host1: v.host1,
        port1: Number(v.port1),
        enc1: v.enc1,
        user1: v.user1,
        mins_interval: Number(v.mins_interval),
        subfolder2: v.subfolder2,
        delete2duplicates: b(v.delete2duplicates),
        delete1: b(v.delete1),
        automap: b(v.automap),
        active: b(v.active),
      };
      if (s(v.password1)) attr.password1 = v.password1;
      return attr;
    },
  },
  remove: { path: "delete/syncjob" },
  toggleActive: true,
};

export const transports: ResourceDef = {
  title: "Transports",
  subtitle: "Send mail for certain destinations through a specific server instead of looking up their MX.",
  noun: "transport",
  queryKey: "transports",
  list: "transport/all",
  rowKey: (r) => Number(r.id),
  label: (r) => s(r.destination),
  search: (r) => `${r.destination} ${r.nexthop} ${r.username}`,
  columns: [
    { label: "Destination", render: (r) => <Arrow from={s(r.destination)} to={<span className="mono small">{s(r.nexthop)}</span>} /> },
    { label: "Login", render: (r) => s(r.username) || <span className="muted">none</span> },
  ],
  fields: [
    { name: "destination", label: "Destination", required: true, placeholder: "example.org or .example.org", editable: true },
    { name: "nexthop", label: "Next hop", required: true, placeholder: "[smtp.relay.com]:587", editable: true },
    { name: "username", label: "Username", editable: true },
    { name: "password", label: "Password", type: "password", editable: true },
    { name: "active", label: "Active", type: "toggle", default: true, editable: true },
  ],
  add: { path: "add/transport", body: (v) => ({ destination: v.destination, nexthop: v.nexthop, username: v.username, password: v.password, active: b(v.active) }) },
  edit: {
    path: "edit/transport",
    fromRow: (r) => ({ destination: r.destination, nexthop: r.nexthop, username: r.username, password: "", active: isActive(r.active) }),
    attr: (v) => {
      const a: Values = { destination: v.destination, nexthop: v.nexthop, username: v.username, active: b(v.active) };
      if (s(v.password)) a.password = v.password;
      return a;
    },
  },
  remove: { path: "delete/transport" },
  toggleActive: true,
};

export const relayHosts: ResourceDef = {
  title: "Relay hosts",
  subtitle: "Outgoing SMTP relays that domains or mailboxes can be set to send through.",
  noun: "relay host",
  queryKey: "relayhosts",
  list: "relayhost/all",
  rowKey: (r) => Number(r.id),
  label: (r) => s(r.hostname),
  search: (r) => `${r.hostname} ${r.username}`,
  columns: [
    { label: "Host", render: (r) => <span className="mono">{s(r.hostname)}</span> },
    { label: "Login", render: (r) => s(r.username) || <span className="muted">none</span> },
    {
      label: "Used by",
      render: (r) => {
        const used = [s(r.used_by_domains), s(r.used_by_mailboxes)].filter(Boolean).join(", ");
        return used || <span className="muted">nothing</span>;
      },
    },
  ],
  fields: [
    { name: "hostname", label: "Host and port", required: true, placeholder: "[smtp.sendgrid.net]:587", editable: true },
    { name: "username", label: "Username", editable: true },
    { name: "password", label: "Password", type: "password", editable: true },
    { name: "active", label: "Active", type: "toggle", default: true, editable: true },
  ],
  add: { path: "add/relayhost", body: (v) => ({ hostname: v.hostname, username: v.username, password: v.password, active: b(v.active) }) },
  edit: {
    path: "edit/relayhost",
    fromRow: (r) => ({ hostname: r.hostname, username: r.username, password: "", active: isActive(r.active) }),
    attr: (v) => {
      const a: Values = { hostname: v.hostname, username: v.username, active: b(v.active) };
      if (s(v.password)) a.password = v.password;
      return a;
    },
  },
  remove: { path: "delete/relayhost" },
  toggleActive: true,
};

const TLS_POLICIES = ["none", "may", "encrypt", "dane", "dane-only", "fingerprint", "verify", "secure"];

export const tlsPolicies: ResourceDef = {
  title: "TLS policies",
  subtitle: "Require (or relax) encryption when sending to specific domains.",
  noun: "TLS policy",
  queryKey: "tls-policy-maps",
  list: "tls-policy-map/all",
  rowKey: (r) => Number(r.id),
  label: (r) => s(r.dest),
  search: (r) => `${r.dest} ${r.policy}`,
  columns: [
    { label: "Destination", render: (r) => <span className="strong">{s(r.dest)}</span> },
    { label: "Policy", render: (r) => <Badge tone="info">{s(r.policy)}</Badge> },
    { label: "Parameters", render: (r) => <span className="mono small">{s(r.parameters)}</span> },
  ],
  fields: [
    { name: "dest", label: "Destination domain", required: true, placeholder: "example.org", editable: true },
    { name: "policy", label: "Policy", type: "select", default: "encrypt", editable: true, options: TLS_POLICIES.map((p) => ({ value: p, label: p })) },
    { name: "parameters", label: "Parameters", placeholder: "Optional, e.g. protocols=>=TLSv1.2", editable: true },
    { name: "active", label: "Active", type: "toggle", default: true, editable: true },
  ],
  add: { path: "add/tls-policy-map", body: (v) => ({ dest: v.dest, policy: v.policy, parameters: v.parameters, active: b(v.active) }) },
  edit: {
    path: "edit/tls-policy-map",
    fromRow: (r) => ({ dest: r.dest, policy: r.policy, parameters: r.parameters, active: isActive(r.active) }),
    attr: (v) => ({ dest: v.dest, policy: v.policy, parameters: v.parameters, active: b(v.active) }),
  },
  remove: { path: "delete/tls-policy-map" },
  toggleActive: true,
};

export const bccMaps: ResourceDef = {
  title: "BCC maps",
  subtitle: "Silently send a copy of mail from or to an address or domain somewhere else.",
  noun: "BCC map",
  queryKey: "bcc",
  list: "bcc/all",
  rowKey: (r) => Number(r.id),
  label: (r) => s(r.local_dest),
  search: (r) => `${r.local_dest} ${r.bcc_dest}`,
  columns: [
    { label: "Copy", render: (r) => <Arrow from={s(r.local_dest)} to={s(r.bcc_dest)} /> },
    { label: "When", render: (r) => (r.type === "sender" ? "Sent by" : "Received by") },
  ],
  fields: [
    { name: "local_dest", label: "Address or domain here", required: true, placeholder: "alice@example.com or example.com" },
    { name: "bcc_dest", label: "Send a copy to", required: true, placeholder: "archive@example.com", editable: true },
    {
      name: "type",
      label: "Copy mail",
      type: "select",
      default: "rcpt",
      editable: true,
      options: [
        { value: "rcpt", label: "Received by it" },
        { value: "sender", label: "Sent by it" },
      ],
    },
    { name: "active", label: "Active", type: "toggle", default: true, editable: true },
  ],
  add: { path: "add/bcc", body: (v) => ({ local_dest: v.local_dest, bcc_dest: v.bcc_dest, type: v.type, active: b(v.active) }) },
  edit: {
    path: "edit/bcc",
    fromRow: (r) => ({ bcc_dest: r.bcc_dest, type: r.type, active: isActive(r.active) }),
    attr: (v) => ({ bcc_dest: v.bcc_dest, type: v.type, active: b(v.active) }),
  },
  remove: { path: "delete/bcc" },
  toggleActive: true,
};

export const recipientMaps: ResourceDef = {
  title: "Recipient maps",
  subtitle: "Rewrite a recipient address before delivery, for example to retire an old address.",
  noun: "recipient map",
  queryKey: "recipient-maps",
  list: "recipient_map/all",
  rowKey: (r) => Number(r.id),
  label: (r) => s(r.recipient_map_old),
  search: (r) => `${r.recipient_map_old} ${r.recipient_map_new}`,
  columns: [{ label: "Rewrite", render: (r) => <Arrow from={s(r.recipient_map_old)} to={s(r.recipient_map_new)} /> }],
  fields: [
    { name: "recipient_map_old", label: "Original recipient", required: true, placeholder: "old@example.com or example.com", editable: true },
    { name: "recipient_map_new", label: "Rewrite to", required: true, placeholder: "new@example.com", editable: true },
    { name: "active", label: "Active", type: "toggle", default: true, editable: true },
  ],
  add: { path: "add/recipient_map", body: (v) => ({ recipient_map_old: v.recipient_map_old, recipient_map_new: v.recipient_map_new, active: b(v.active) }) },
  edit: {
    path: "edit/recipient_map",
    fromRow: (r) => ({ recipient_map_old: r.recipient_map_old, recipient_map_new: r.recipient_map_new, active: isActive(r.active) }),
    attr: (v) => ({ recipient_map_old: v.recipient_map_old, recipient_map_new: v.recipient_map_new, active: b(v.active) }),
  },
  remove: { path: "delete/recipient_map" },
  toggleActive: true,
};

export const forwardingHosts: ResourceDef = {
  title: "Forwarding hosts",
  subtitle: "Servers allowed to forward mail to you without being treated as spam senders (e.g. your old provider).",
  noun: "forwarding host",
  queryKey: "fwdhosts",
  list: "fwdhost/all",
  rowKey: (r) => s(r.host),
  label: (r) => s(r.host),
  search: (r) => `${r.host} ${r.source}`,
  columns: [
    { label: "Host", render: (r) => <span className="mono">{s(r.host)}</span> },
    { label: "Added as", render: (r) => s(r.source) },
    { label: "Spam filter", render: (r) => (isActive(r.keep_spam) ? <Badge tone="warn">Off</Badge> : <Badge tone="good">On</Badge>) },
  ],
  fields: [
    { name: "hostname", label: "Host or IP", required: true, placeholder: "mail.oldprovider.com or 203.0.113.0/24" },
    { name: "filter_spam", label: "Still filter spam from this host", type: "toggle", default: true },
  ],
  add: { path: "add/fwdhost", body: (v) => ({ hostname: v.hostname, filter_spam: b(v.filter_spam) }) },
  remove: { path: "delete/fwdhost" },
};
