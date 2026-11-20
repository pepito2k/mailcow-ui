/** Run with: npx tsx server/dnscheck.test.ts */
import assert from "node:assert/strict";
import { checkDomain, type Lookup } from "./dnscheck.js";
import { bucketize, classify } from "./mailstats.js";

const KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx";
const dkim = { selector: "dkim", txt: `v=DKIM1;k=rsa;t=s;s=email;p=${KEY}` };

function fake(zone: Record<string, { mx?: [number, string][]; txt?: string[]; ips?: string[] }>): Lookup {
  return {
    mx: async (n) => (zone[n]?.mx ?? []).map(([priority, exchange]) => ({ priority, exchange })),
    txt: async (n) => zone[n]?.txt ?? [],
    ips: async (n) => zone[n]?.ips ?? [],
  };
}
const status = async (z: Parameters<typeof fake>[0], d = dkim) =>
  Object.fromEntries((await checkDomain("example.com", "mail.host.test", d, fake(z))).map((c) => [c.id, c.status]));

const good = {
  "example.com": { mx: [[10, "mail.host.test."]] as [number, string][], txt: ["v=spf1 mx a -all", "google-site-verification=x"] },
  "_dmarc.example.com": { txt: ["v=DMARC1; p=quarantine; rua=mailto:a@example.com"] },
  "dkim._domainkey.example.com": { txt: [`v=DKIM1; k=rsa; p=${KEY}`] },
  "mail.host.test": { ips: ["192.0.2.1"] },
};

(async () => {
  assert.deepEqual(await status(good), { mx: "ok", spf: "ok", dkim: "ok", dmarc: "ok" });

  // Nothing published
  assert.deepEqual(await status({ "mail.host.test": { ips: ["192.0.2.1"] } }), { mx: "fail", spf: "fail", dkim: "fail", dmarc: "fail" });

  // MX elsewhere; MX alias with the same IP is fine
  assert.equal((await status({ ...good, "example.com": { ...good["example.com"], mx: [[10, "mx.google.com"]] } })).mx, "fail");
  assert.equal(
    (await status({ ...good, "example.com": { ...good["example.com"], mx: [[10, "mx.example.com"]] }, "mx.example.com": { ips: ["192.0.2.1"] } })).mx,
    "ok",
  );
  assert.equal((await status({ ...good, "example.com": { ...good["example.com"], mx: [[5, "backup.test"], [10, "mail.host.test"]] } })).mx, "warn");

  // SPF variants
  const spf = async (...txt: string[]) => (await status({ ...good, "example.com": { ...good["example.com"], txt } })).spf;
  assert.equal(await spf("v=spf1 mx ~all"), "ok");
  assert.equal(await spf("v=spf1 ip4:192.0.2.1 -all"), "ok");
  assert.equal(await spf("v=spf1 include:_spf.google.com -all"), "warn");
  assert.equal(await spf("v=spf1 ip4:203.0.113.9 -all"), "fail");
  assert.equal(await spf("v=spf1 mx +all"), "fail");
  assert.equal(await spf("v=spf1 mx"), "warn");
  assert.equal(await spf("v=spf1 mx -all", "v=spf1 a -all"), "fail");

  // DKIM mismatch / no key in mailcow
  assert.equal((await status({ ...good, "dkim._domainkey.example.com": { txt: ["v=DKIM1; p=OTHER"] } })).dkim, "fail");
  assert.equal((await status(good, null as never)).dkim, "fail");

  // DMARC
  assert.equal((await status({ ...good, "_dmarc.example.com": { txt: ["v=DMARC1; p=none"] } })).dmarc, "warn");
  assert.equal((await status({ ...good, "_dmarc.example.com": { txt: ["v=DMARC1; p=reject"] } })).dmarc, "ok");

  // Mail stats
  assert.equal(classify({ action: "no action" }), "received");
  assert.equal(classify({ action: "no action", user: "a@b.c" }), "sent");
  assert.equal(classify({ action: "add header" }), "spam");
  assert.equal(classify({ action: "reject" }), "rejected");
  assert.equal(classify({ action: "greylist" }), "greylisted");
  const now = Date.UTC(2026, 0, 2, 12, 30);
  const s = bucketize(
    [
      { unix_time: now / 1000 - 60, action: "no action" },
      { unix_time: now / 1000 - 120, action: "reject" },
      { unix_time: now / 1000 - 7200, action: "no action", user: "x@y.z" },
      { unix_time: now / 1000 - 10, action: "greylist" },
    ],
    now,
  );
  assert.equal(s.bucketMs, 3600_000);
  assert.equal(s.buckets.length, 24);
  assert.deepEqual(s.totals, { received: 1, spam: 0, rejected: 1, sent: 1, greylisted: 1 });
  const last = s.buckets[s.buckets.length - 1];
  assert.equal(last.received + last.rejected, 2);
  assert.equal(bucketize([{ unix_time: now / 1000 - 5 * 86400, action: "no action" }], now).bucketMs, 6 * 3600_000);

  console.log("all dns and mail-stats checks passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
