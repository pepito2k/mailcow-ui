/**
 * A tiny fake mailcow API for local development and demos.
 * Implements the subset of /api/v1 the UI uses, with in-memory data.
 * Run: npm run mock   (listens on :8081, API key "mock-key")
 */
import express from "express";
import { randomUUID } from "node:crypto";
import { registerExtra } from "./extra";

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const now = () => Math.floor(Date.now() / 1000);

type Row = Record<string, unknown>;

const domains: Row[] = [
  mkDomain("example.com", "Main company domain", 25, 400, 3 * 1024, 10 * 1024, 50 * 1024),
  mkDomain("example.org", "Non-profit side project", 10, 100, 1024, 5 * 1024, 20 * 1024),
  mkDomain("family.net", "Family mail", 8, 50, 2048, 8 * 1024, 30 * 1024),
];

function mkDomain(name: string, description: string, mboxes: number, aliases: number, def: number, max: number, total: number): Row {
  return {
    domain_name: name,
    description,
    max_num_mboxes_for_domain: mboxes,
    max_num_aliases_for_domain: aliases,
    def_quota_for_mbox: def * MiB,
    max_quota_for_mbox: max * MiB,
    max_quota_for_domain: total * MiB,
    active: 1,
    backupmx: 0,
    relay_all_recipients: 0,
    rl: false,
    created: "2024-03-02 10:11:12",
    modified: "2025-08-14 09:00:00",
  };
}

const people: [string, string, string, number, number][] = [
  ["alice", "example.com", "Alice Moreno", 5 * 1024, 3.9],
  ["bob", "example.com", "Bob Fischer", 3 * 1024, 0.6],
  ["carla", "example.com", "Carla Díaz", 3 * 1024, 2.8],
  ["info", "example.com", "Info", 2 * 1024, 0.2],
  ["billing", "example.com", "Billing", 2 * 1024, 1.1],
  ["dev", "example.org", "Dev Team", 1024, 0.3],
  ["hello", "example.org", "Hello", 1024, 0.05],
  ["gonzalo", "family.net", "Gonzalo", 8 * 1024, 5.4],
  ["mama", "family.net", "Mamá", 4 * 1024, 1.7],
  ["kids", "family.net", "Kids", 2 * 1024, 0.4],
];

const mailboxes: Row[] = people.map(([lp, dom, name, quotaMiB, usedGiB], i) => ({
  username: `${lp}@${dom}`,
  local_part: lp,
  domain: dom,
  name,
  quota: quotaMiB * MiB,
  quota_used: Math.round(usedGiB * GiB),
  percent_in_use: Math.round(((usedGiB * GiB) / (quotaMiB * MiB)) * 100),
  messages: Math.round(usedGiB * 9000) + 12,
  active: i === 6 ? 0 : 1,
  last_imap_login: i === 6 ? 0 : now() - i * 3600 * 7,
  last_smtp_login: i === 6 ? 0 : now() - i * 3600 * 11,
  last_pop3_login: 0,
  created: "2024-03-02 10:11:12",
  modified: "2025-10-01 12:00:00",
  attributes: { force_pw_update: "0", tls_enforce_in: "0", tls_enforce_out: "0", sogo_access: "1", imap_access: "1", pop3_access: "0", smtp_access: "1" },
}));

let aliasSeq = 1;
const aliases: Row[] = [
  ["postmaster@example.com", "alice@example.com"],
  ["abuse@example.com", "alice@example.com"],
  ["sales@example.com", "bob@example.com,carla@example.com"],
  ["@example.org", "dev@example.org"],
  ["family@family.net", "gonzalo@family.net,mama@family.net,kids@family.net"],
].map(([address, goto]) => mkAlias(address, goto));

function mkAlias(address: string, goto: string, active = 1): Row {
  const domain = address.split("@")[1];
  return {
    id: aliasSeq++,
    address,
    goto,
    domain,
    active,
    is_catch_all: address.startsWith("@") ? 1 : 0,
    public_comment: "",
    private_comment: "",
    created: "2024-05-01 08:00:00",
    modified: "2025-01-01 08:00:00",
  };
}

const dkim: Record<string, Row> = {
  "example.com": mkDkim("dkim", 2048),
  "family.net": mkDkim("dkim", 2048),
};

function mkDkim(selector: string, length: number): Row {
  const pub = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA" + randomUUID().replace(/-/g, "").repeat(6) + "IDAQAB";
  return { pubkey: pub, length: String(length), dkim_txt: `v=DKIM1;k=rsa;t=s;s=email;p=${pub}`, dkim_selector: selector, privkey: "" };
}

const mailq: Row[] = [
  {
    queue_name: "deferred",
    queue_id: "4XyZ1A2B3C",
    arrival_time: now() - 5400,
    message_size: 48213,
    sender: "billing@example.com",
    recipients: [{ address: "accounts@slow-provider.test", delay_reason: "connect to mx.slow-provider.test[203.0.113.9]:25: Connection timed out" }],
  },
  {
    queue_name: "deferred",
    queue_id: "4XyZ9K8L7M",
    arrival_time: now() - 900,
    message_size: 10422,
    sender: "carla@example.com",
    recipients: [{ address: "someone@greylist.test", delay_reason: "450 4.7.1 Greylisted, please try again later" }],
  },
];

let qSeq = 100;
const quarantine: Row[] = [
  { id: qSeq++, qid: "6A1B2C3D", subject: "You have won a prize!!!", sender: "promo@spammy.test", rcpt: "bob@example.com", score: 14.2, action: "reject", created: now() - 3600, notified: 0, virus_flag: 0 },
  { id: qSeq++, qid: "6A1B2C3E", subject: "Invoice 2026-11 attached", sender: "accounts@partner.test", rcpt: "billing@example.com", score: 8.1, action: "add header", created: now() - 7200, notified: 1, virus_flag: 0 },
  { id: qSeq++, qid: "6A1B2C3F", subject: "Re: shipment", sender: "noreply@phish.test", rcpt: "alice@example.com", score: 22.5, action: "reject", created: now() - 86400, notified: 1, virus_flag: 1 },
];

const containers = [
  "postfix", "dovecot", "rspamd", "sogo", "nginx", "mysql", "redis", "clamd", "unbound", "watchdog", "acme", "netfilter", "php-fpm", "memcached", "olefy", "dockerapi", "ofelia", "postfix-tlspol",
].reduce<Record<string, Row>>((acc, name) => {
  acc[`${name}-mailcow`] = {
    type: "info",
    container: name,
    state: name === "clamd" ? "restarting" : "running",
    started_at: new Date(Date.now() - 86400 * 1000 * 6).toISOString(),
    image: `ghcr.io/mailcow/${name}:1.${Math.floor(Math.random() * 30)}`,
  };
  return acc;
}, {});

function logs(type: string, count: number): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < count; i++) {
    const t = now() - i * 47;
    if (type === "api") out.push({ time: t, uri: "/api/v1/get/mailbox/all", method: "GET", remote: "172.22.1.1", data: "" });
    else if (type === "rspamd-history")
      out.push({
        unix_time: t,
        "message-id": `${randomUUID()}@example.com`,
        sender_smtp: "news@shop.test",
        rcpt_smtp: ["bob@example.com"],
        subject: ["Weekly deals", "Your order shipped", "Password reset"][i % 3],
        action: i % 7 === 0 ? "add header" : "no action",
        score: i % 7 === 0 ? 7.3 : 0.4,
        required_score: 15,
        ip: "198.51.100.23",
        size: 23456,
      });
    else {
      const msgs: Record<string, string[]> = {
        postfix: [
          "4XyZ1A2B3C: to=<accounts@slow-provider.test>, relay=none, delay=5400, status=deferred (connect timed out)",
          "connect from mail-ed1.example.net[192.0.2.14]",
          "4XyZ7Q: from=<news@shop.test>, size=23456, nrcpt=1 (queue active)",
          "NOQUEUE: reject: RCPT from unknown[203.0.113.66]: 554 5.7.1 Service unavailable; Client host blocked using zen.spamhaus.org",
        ],
        dovecot: ["imap-login: Login: user=<alice@example.com>, method=PLAIN, rip=192.0.2.50, TLS", "imap(bob@example.com): Disconnected: Logged out in=120 out=4521"],
        sogo: ['"GET /SOGo/so/alice@example.com/Mail/view HTTP/1.1" 200 4123/0 0.041'],
        netfilter: ["Banning 203.0.113.66 for 30 minutes (too many failed logins)"],
        acme: ["Certificate validation done, certificate is valid for 61 more days"],
        watchdog: ["Clamd health level: 80% (8/10), health trend: -1"],
        autodiscover: ['{"ua":"Microsoft Office/16.0","user":"alice@example.com","service":"activesync"}'],
        ratelimited: ['{"rcpt":"bob@example.com","from":"bulk@sender.test","message_id":"x","rl_info":"domain 100/1h"}'],
      };
      const pool = msgs[type] ?? ["(no entries)"];
      out.push({ time: t, priority: i % 9 === 0 ? "warn" : "info", program: type, message: pool[i % pool.length] });
    }
  }
  return out;
}

const ok = (msg: unknown, log: unknown[] = []) => [{ type: "success", log, msg }];
const fail = (msg: unknown) => [{ type: "danger", log: [], msg }];

const app = express();
app.use(express.json({ limit: "2mb" }));

// Fake GitHub "latest release" for the update check (npm run demo points UPDATE_CHECK_URL here).
app.get("/github/releases/latest", (_req, res) =>
  res.json({ tag_name: "2025-11", name: "2025-11 (Nov 2025)", html_url: "https://github.com/mailcow/mailcow-dockerized/releases/tag/2025-11", published_at: "2025-11-12T10:00:00Z" }),
);
app.use((req, res, next) => {
  if (req.get("X-API-Key") !== "mock-key") return res.status(401).json({ type: "error", msg: "authentication failed" });
  // A little latency so loading states are visible
  setTimeout(next, 120);
});

// ---- GET ----
app.get("/api/v1/get/domain/all", (_req, res) => res.json(domains.map(withDomainUsage)));
app.get("/api/v1/get/domain/:d", (req, res) => {
  const d = domains.find((x) => x.domain_name === req.params.d);
  res.json(d ? withDomainUsage(d) : {});
});
function withDomainUsage(d: Row): Row {
  const boxes = mailboxes.filter((m) => m.domain === d.domain_name);
  const used = boxes.reduce((s, m) => s + Number(m.quota_used), 0);
  const allocated = boxes.reduce((s, m) => s + Number(m.quota), 0);
  return {
    ...d,
    mboxes_in_domain: boxes.length,
    mboxes_left: Number(d.max_num_mboxes_for_domain) - boxes.length,
    aliases_in_domain: aliases.filter((a) => a.domain === d.domain_name).length,
    aliases_left: Number(d.max_num_aliases_for_domain) - aliases.filter((a) => a.domain === d.domain_name).length,
    quota_used_in_domain: String(allocated),
    bytes_total: String(used),
    msgs_total: String(boxes.reduce((s, m) => s + Number(m.messages), 0)),
  };
}
app.get("/api/v1/get/mailbox/all/:domain", (req, res) => res.json(mailboxes.filter((m) => m.domain === req.params.domain)));
app.get("/api/v1/get/mailbox/all", (_req, res) => res.json(mailboxes));
app.get("/api/v1/get/mailbox/:id", (req, res) => res.json(mailboxes.find((m) => m.username === req.params.id) ?? {}));
app.get("/api/v1/get/alias/all", (_req, res) => res.json(aliases));
app.get("/api/v1/get/dkim/:domain", (req, res) => res.json(dkim[req.params.domain] ?? {}));
app.get("/api/v1/get/mailq/all", (_req, res) => res.json(mailq));
app.get("/api/v1/get/quarantine/all", (_req, res) => res.json(quarantine));
app.get("/api/v1/get/status/containers", (_req, res) => res.json(containers));
app.get("/api/v1/get/status/version", (_req, res) => res.json({ version: "2025-10a" }));
app.get("/api/v1/get/status/vmail", (_req, res) =>
  res.json({ type: "info", disk: "/dev/sda1", used: "41G", total: "120G", used_percent: "34%" }),
);
app.get("/api/v1/get/logs/:type/:count", (req, res) => res.json(logs(req.params.type, Math.min(Number(req.params.count) || 50, 500))));

// ---- ADD ----
app.post("/api/v1/add/domain", (req, res) => {
  const b = req.body;
  if (!b.domain) return res.json(fail("domain_invalid"));
  if (domains.some((d) => d.domain_name === b.domain)) return res.json(fail(["domain_exists", b.domain]));
  domains.push(mkDomain(b.domain, b.description ?? "", Number(b.mailboxes ?? 10), Number(b.aliases ?? 400), Number(b.defquota ?? 3072), Number(b.maxquota ?? 10240), Number(b.quota ?? 10240)));
  domains[domains.length - 1].active = Number(b.active ?? 1);
  res.json(ok(["domain_added", b.domain]));
});
app.post("/api/v1/add/mailbox", (req, res) => {
  const b = req.body;
  const username = `${b.local_part}@${b.domain}`;
  if (!domains.some((d) => d.domain_name === b.domain)) return res.json(fail(["domain_not_found", b.domain]));
  if (mailboxes.some((m) => m.username === username)) return res.json(fail(["object_exists", username]));
  if (!b.password || b.password !== b.password2) return res.json(fail("password_mismatch"));
  mailboxes.push({
    username, local_part: b.local_part, domain: b.domain, name: b.name ?? "", quota: Number(b.quota ?? 1024) * MiB, quota_used: 0, percent_in_use: 0, messages: 0,
    active: Number(b.active ?? 1), last_imap_login: 0, last_smtp_login: 0, last_pop3_login: 0, created: new Date().toISOString(), modified: null,
    attributes: { force_pw_update: String(b.force_pw_update ?? "0"), tls_enforce_in: "0", tls_enforce_out: "0", sogo_access: "1", imap_access: "1", pop3_access: "1", smtp_access: "1" },
  });
  res.json(ok(["mailbox_added", username]));
});
app.post("/api/v1/add/alias", (req, res) => {
  const b = req.body;
  if (!b.address || !b.goto) return res.json(fail("alias_empty"));
  if (aliases.some((a) => a.address === b.address)) return res.json(fail(["is_alias_or_mailbox", b.address]));
  aliases.push(mkAlias(b.address, b.goto, Number(b.active ?? 1)));
  res.json(ok(["alias_added", b.address]));
});
app.post("/api/v1/add/dkim", (req, res) => {
  const b = req.body;
  for (const d of String(b.domains).split(",")) dkim[d.trim()] = mkDkim(b.dkim_selector || "dkim", Number(b.key_size || 2048));
  res.json(ok(["dkim_added", b.domains]));
});

// ---- EDIT ----
function editRows(rows: Row[], key: string, items: unknown[], attr: Row, map?: (r: Row, attr: Row) => void) {
  const set = new Set(items.map(String));
  for (const r of rows) {
    if (!set.has(String(r[key]))) continue;
    if (map) map(r, attr);
    else Object.assign(r, attr);
  }
}
app.post("/api/v1/edit/domain", (req, res) => {
  const { items, attr } = req.body;
  editRows(domains, "domain_name", items, attr, (r, a) => {
    if (a.description !== undefined) r.description = a.description;
    if (a.active !== undefined) r.active = Number(a.active);
    if (a.mailboxes !== undefined) r.max_num_mboxes_for_domain = Number(a.mailboxes);
    if (a.aliases !== undefined) r.max_num_aliases_for_domain = Number(a.aliases);
    if (a.defquota !== undefined) r.def_quota_for_mbox = Number(a.defquota) * MiB;
    if (a.maxquota !== undefined) r.max_quota_for_mbox = Number(a.maxquota) * MiB;
    if (a.quota !== undefined) r.max_quota_for_domain = Number(a.quota) * MiB;
  });
  res.json(ok(["domain_modified", items.join(", ")]));
});
app.post("/api/v1/edit/mailbox", (req, res) => {
  const { items, attr } = req.body;
  if (attr.password !== undefined && attr.password !== attr.password2) return res.json(fail("password_mismatch"));
  editRows(mailboxes, "username", items, attr, (r, a) => {
    if (a.name !== undefined) r.name = a.name;
    if (a.active !== undefined) r.active = Number(a.active);
    if (a.quota !== undefined) {
      r.quota = Number(a.quota) * MiB;
      r.percent_in_use = Math.round((Number(r.quota_used) / Number(r.quota)) * 100);
    }
    if (a.force_pw_update !== undefined) (r.attributes as Row).force_pw_update = String(a.force_pw_update);
  });
  res.json(ok(["mailbox_modified", items.join(", ")]));
});
app.post("/api/v1/edit/alias", (req, res) => {
  const { items, attr } = req.body;
  editRows(aliases, "id", items, attr, (r, a) => {
    if (a.goto !== undefined) r.goto = a.goto;
    if (a.active !== undefined) r.active = Number(a.active);
    if (a.private_comment !== undefined) r.private_comment = a.private_comment;
    if (a.public_comment !== undefined) r.public_comment = a.public_comment;
  });
  res.json(ok(["alias_modified", items.join(", ")]));
});
app.post("/api/v1/edit/mailq", (req, res) => {
  if (req.body.action === "flush") return res.json(ok("queue_command_success"));
  if (req.body.action === "super_delete") {
    mailq.splice(0);
    return res.json(ok("queue_command_success"));
  }
  res.json(fail("invalid action"));
});
app.post("/api/v1/edit/qitem", (req, res) => {
  const { items } = req.body;
  removeWhere(quarantine, (q) => items.map(String).includes(String(q.id)));
  res.json(ok("item_released"));
});

// ---- DELETE ----
function removeWhere(rows: Row[], pred: (r: Row) => boolean) {
  for (let i = rows.length - 1; i >= 0; i--) if (pred(rows[i])) rows.splice(i, 1);
}
app.post("/api/v1/delete/domain", (req, res) => {
  const items: string[] = req.body;
  const blocked = items.filter((d) => mailboxes.some((m) => m.domain === d));
  if (blocked.length) return res.json(fail(["domain_not_empty", blocked.join(", ")]));
  removeWhere(domains, (d) => items.includes(String(d.domain_name)));
  res.json(ok(["domain_removed", items.join(", ")]));
});
app.post("/api/v1/delete/mailbox", (req, res) => {
  const items: string[] = req.body;
  removeWhere(mailboxes, (m) => items.includes(String(m.username)));
  res.json(ok(["mailbox_removed", items.join(", ")]));
});
app.post("/api/v1/delete/alias", (req, res) => {
  const items: unknown[] = req.body;
  removeWhere(aliases, (a) => items.map(String).includes(String(a.id)));
  res.json(ok(["alias_removed", items.join(", ")]));
});
app.post("/api/v1/delete/dkim", (req, res) => {
  for (const d of req.body as string[]) delete dkim[d];
  res.json(ok(["dkim_removed", (req.body as string[]).join(", ")]));
});
app.post("/api/v1/delete/mailq", (req, res) => {
  const items: string[] = req.body.items ?? [];
  removeWhere(mailq, (q) => items.includes(String(q.queue_id)));
  res.json(ok("queue_command_success"));
});
app.post("/api/v1/delete/qitem", (req, res) => {
  const items: unknown[] = req.body;
  removeWhere(quarantine, (q) => items.map(String).includes(String(q.id)));
  res.json(ok("item_deleted"));
});

registerExtra(app);

app.use((req, res) => res.status(404).json({ type: "error", msg: `mock: route not found ${req.method} ${req.path}` }));

const port = Number(process.env.MOCK_PORT || 8081);
app.listen(port, () => console.log(`mock mailcow API on http://localhost:${port} (key: mock-key)`));
