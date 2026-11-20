/**
 * Fake endpoints for the second batch of screens (alias domains, domain admins,
 * resources, sync jobs, routing maps, app passwords, rate limits, fail2ban).
 */
import type { Express } from "express";

type Row = Record<string, unknown>;
const ok = (msg: unknown) => [{ type: "success", log: [], msg }];
const fail = (msg: unknown) => [{ type: "danger", log: [], msg }];

let seq = 1000;

/** Registers get/<name>/all, add/<name>, edit/<name>, delete/<name> over an in-memory array. */
function collection(app: Express, name: string, key: string, rows: Row[], opts: { getPath?: string; make?: (b: Row) => Row; patch?: (r: Row, a: Row) => void } = {}) {
  const ints = typeof rows[0]?.[key] === "number" || key === "id";
  app.get(`/api/v1/get/${opts.getPath ?? `${name}/all`}`, (_req, res) => res.json(rows));
  app.post(`/api/v1/add/${name}`, (req, res) => {
    const row = opts.make ? opts.make(req.body) : { ...req.body };
    if (ints && row[key] === undefined) row[key] = seq++;
    if (rows.some((r) => String(r[key]) === String(row[key]))) return res.json(fail(["object_exists", row[key]]));
    rows.push(row);
    res.json(ok([`${name}_added`, row[key]]));
  });
  app.post(`/api/v1/edit/${name}`, (req, res) => {
    const { items, attr } = req.body as { items: unknown[]; attr: Row };
    const set = new Set(items.map(String));
    for (const r of rows) if (set.has(String(r[key]))) (opts.patch ?? ((x, a) => Object.assign(x, a)))(r, attr);
    res.json(ok([`${name}_modified`, items.join(", ")]));
  });
  app.post(`/api/v1/delete/${name}`, (req, res) => {
    const items = (req.body as unknown[]).map(String);
    for (let i = rows.length - 1; i >= 0; i--) if (items.includes(String(rows[i][key]))) rows.splice(i, 1);
    res.json(ok([`${name}_removed`, items.join(", ")]));
  });
}

export function registerExtra(app: Express) {
  collection(app, "alias-domain", "alias_domain", [{ alias_domain: "example.net", target_domain: "example.com", active: 1 }]);

  collection(
    app,
    "domain-admin",
    "username",
    [{ username: "carla-admin", selected_domains: ["example.com"], tfa_active: 0, active: 1 }],
    {
      make: (b) => ({ username: b.username, selected_domains: b.domains ?? [], tfa_active: 0, active: b.active }),
      patch: (r, a) => {
        if (a.domains) r.selected_domains = a.domains;
        if (a.active !== undefined) r.active = a.active;
      },
    },
  );

  collection(app, "resource", "name", [{ name: "room1@example.com", description: "Meeting room 1", kind: "location", domain: "example.com", active: 1, multiple_bookings: 0 }], {
    make: (b) => ({ name: `${String(b.description).toLowerCase().replace(/\W+/g, "")}@${b.domain}`, description: b.description, kind: b.kind, domain: b.domain, active: b.active }),
  });

  collection(
    app,
    "syncjob",
    "id",
    [
      {
        id: 1,
        user2: "gonzalo@family.net",
        host1: "imap.gmail.com",
        port1: 993,
        enc1: "SSL",
        user1: "gonzalo.old@gmail.com",
        mins_interval: 20,
        subfolder2: "Gmail",
        delete2duplicates: 1,
        delete1: 0,
        automap: 1,
        active: 1,
        is_running: 0,
        last_run: new Date(Date.now() - 900_000).toISOString(),
        success: 1,
        exit_status: "EX_OK",
      },
    ],
    { getPath: "syncjobs/all/no_log", make: (b) => ({ ...b, id: seq++, user2: b.username, is_running: 0, last_run: null, success: null }) },
  );

  collection(app, "transport", "id", [{ id: 1, destination: "partner.test", nexthop: "[smtp.partner.test]:587", username: "relayuser", active: 1, is_mx_based: 0 }]);
  collection(app, "relayhost", "id", [{ id: 1, hostname: "[smtp.sendgrid.net]:587", username: "apikey", used_by_domains: "example.org", used_by_mailboxes: "", active: 1 }]);
  collection(app, "tls-policy-map", "id", [{ id: 1, dest: "bank.test", policy: "secure", parameters: "", active: 1 }]);
  collection(app, "bcc", "id", [{ id: 1, local_dest: "billing@example.com", bcc_dest: "archive@example.com", type: "rcpt", active: 1, domain: "example.com" }]);
  collection(app, "recipient_map", "id", [{ id: 1, recipient_map_old: "old-info@example.com", recipient_map_new: "info@example.com", active: 1 }]);
  collection(app, "fwdhost", "host", [{ host: "198.51.100.10", source: "mail.oldprovider.test", keep_spam: "no" }], {
    make: (b) => ({ host: b.hostname, source: b.hostname, keep_spam: b.filter_spam ? "no" : "yes" }),
  });

  // App passwords (per mailbox)
  const appPw: Row[] = [{ id: 1, name: "iPhone Mail", mailbox: "gonzalo@family.net", active: 1, created: "2025-06-01 10:00:00", imap_access: 1, smtp_access: 1, dav_access: 1, eas_access: 0, pop3_access: 0, sieve_access: 0 }];
  app.get("/api/v1/get/app-passwd/all/:mailbox", (req, res) => res.json(appPw.filter((a) => a.mailbox === req.params.mailbox)));
  app.post("/api/v1/add/app-passwd", (req, res) => {
    const b = req.body;
    if (!b.app_name || b.app_passwd !== b.app_passwd2) return res.json(fail("password_mismatch"));
    const p = new Set<string>(b.protocols ?? []);
    appPw.push({
      id: seq++,
      name: b.app_name,
      mailbox: b.username,
      active: 1,
      created: new Date().toISOString().slice(0, 19).replace("T", " "),
      ...Object.fromEntries(["imap_access", "smtp_access", "dav_access", "eas_access", "pop3_access", "sieve_access"].map((k) => [k, p.has(k) ? 1 : 0])),
    });
    res.json(ok("app_passwd_added"));
  });
  app.post("/api/v1/delete/app-passwd", (req, res) => {
    const ids = (req.body as unknown[]).map(String);
    for (let i = appPw.length - 1; i >= 0; i--) if (ids.includes(String(appPw[i].id))) appPw.splice(i, 1);
    res.json(ok("app_passwd_removed"));
  });

  // Rate limits
  const rl: Record<string, Row> = { "domain:example.com": { value: "500", frame: "h" } };
  for (const kind of ["domain", "mbox"]) {
    app.get(`/api/v1/get/rl-${kind}/:id`, (req, res) => res.json(rl[`${kind}:${req.params.id}`] ?? []));
    app.post(`/api/v1/edit/rl-${kind}`, (req, res) => {
      for (const id of req.body.items) rl[`${kind}:${id}`] = req.body.attr.rl_value ? { value: req.body.attr.rl_value, frame: req.body.attr.rl_frame } : {};
      res.json(ok(["rl_saved", req.body.items.join(", ")]));
    });
  }

  // Fail2ban
  const f2b: Row = {
    ban_time: 1800,
    max_ban_time: 86400,
    ban_time_increment: 1,
    max_attempts: 10,
    retry_window: 600,
    netban_ipv4: 32,
    netban_ipv6: 128,
    whitelist: "192.0.2.0/24",
    blacklist: "",
    active_bans: [
      { network: "203.0.113.66/32", banned_until: "28m 12s", queued_for_unban: 0, ip: "203.0.113.66" },
      { network: "198.51.100.200/32", banned_until: "4m 3s", queued_for_unban: 0, ip: "198.51.100.200" },
    ],
    perm_bans: [],
  };
  app.get("/api/v1/get/fail2ban", (_req, res) => res.json(f2b));
  app.post("/api/v1/edit/fail2ban", (req, res) => {
    const { items, attr } = req.body as { items: string[]; attr: Row };
    if (attr.action === "unban") {
      f2b.active_bans = (f2b.active_bans as Row[]).filter((b) => !items.includes(String(b.network)));
      return res.json(ok(["object_modified", items.join(", ")]));
    }
    Object.assign(f2b, attr);
    res.json(ok("f2b_modified"));
  });

  // Spam filter: allow/block lists and spam levels
  const policies: Row[] = [
    { prefid: 1, kind: "domain", object: "example.com", list: "wl", value: "*@partner.test" },
    { prefid: 2, kind: "domain", object: "example.com", list: "bl", value: "*@spammy.test" },
    { prefid: 3, kind: "mailbox", object: "gonzalo@family.net", list: "bl", value: "promo@shop.test" },
  ];
  for (const kind of ["domain", "mailbox"]) {
    for (const list of ["wl", "bl"])
      app.get(`/api/v1/get/policy_${list}_${kind}/:id`, (req, res) =>
        res.json(policies.filter((p) => p.kind === kind && p.list === list && p.object === req.params.id).map(({ prefid, object, value }) => ({ prefid, object, value }))),
      );
    app.post(`/api/v1/add/${kind}-policy`, (req, res) => {
      const b = req.body as Row;
      const object = String(kind === "domain" ? b.domain : b.username);
      if (policies.some((p) => p.kind === kind && p.object === object && p.value === b.object_from)) return res.json(fail("policy_list_from_exists"));
      policies.push({ prefid: seq++, kind, object, list: b.object_list, value: b.object_from });
      res.json(ok([`${kind}_modified`, object]));
    });
    app.post(`/api/v1/delete/${kind}-policy`, (req, res) => {
      const ids = (req.body as unknown[]).map(String);
      for (let i = policies.length - 1; i >= 0; i--) if (ids.includes(String(policies[i].prefid))) policies.splice(i, 1);
      res.json(ok(["item_deleted", ids.join(", ")]));
    });
  }
  const scores: Record<string, string> = { "gonzalo@family.net": "6,12" };
  app.get("/api/v1/get/spam-score{/:mailbox}", (req, res) => res.json({ score: scores[req.params.mailbox ?? ""] ?? "8,15" }));
  app.post("/api/v1/edit/spam-score", (req, res) => {
    for (const m of req.body.items) scores[m] = String(req.body.attr.spam_score).replace(/\s+/g, "");
    res.json(ok(["mailbox_modified", req.body.items.join(", ")]));
  });
}
