/**
 * Looks up a domain's mail DNS records and checks them against what mailcow expects:
 * MX points at the mailcow host, SPF allows it, the DKIM key matches mailcow's, DMARC exists.
 */
import { Resolver } from "node:dns/promises";

export type Status = "ok" | "warn" | "fail";
export interface Check {
  id: "mx" | "spf" | "dkim" | "dmarc";
  label: string;
  status: Status;
  summary: string;
  found: string[];
  expected?: string;
}

export interface Lookup {
  mx(name: string): Promise<{ exchange: string; priority: number }[]>;
  txt(name: string): Promise<string[]>;
  ips(name: string): Promise<string[]>;
}

const notFound = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "ENOTFOUND" || code === "ENODATA" || code === "ENONAME" || code === "NXDOMAIN";
};
/** Missing records come back as [], real failures (timeouts, SERVFAIL) still throw. */
const orEmpty = async <T>(p: Promise<T[]>): Promise<T[]> => {
  try {
    return await p;
  } catch (e) {
    if (notFound(e)) return [];
    throw e;
  }
};

export function systemLookup(servers?: string[]): Lookup {
  const r = new Resolver({ timeout: 4000, tries: 2 });
  if (servers?.length) r.setServers(servers);
  return {
    mx: (n) => orEmpty(r.resolveMx(n)),
    txt: async (n) => (await orEmpty(r.resolveTxt(n))).map((chunks) => chunks.join("")),
    ips: async (n) => [...(await orEmpty(r.resolve4(n))), ...(await orEmpty(r.resolve6(n)))],
  };
}

const host = (s: string) => s.trim().toLowerCase().replace(/\.$/, "");
const tagValue = (rec: string, tag: string) => {
  const m = rec.match(new RegExp(`(?:^|;)\\s*${tag}\\s*=\\s*([^;]*)`, "i"));
  return m ? m[1].trim() : null;
};
const dkimKey = (s: string | null | undefined) => (s ? (tagValue(s, "p") ?? s).replace(/\s+/g, "") : "");

export async function checkDomain(
  domain: string,
  mailHost: string,
  dkim: { selector: string; txt: string } | null,
  dns: Lookup,
): Promise<Check[]> {
  domain = host(domain);
  mailHost = host(mailHost);
  const [mx, txt, dmarcTxt, hostIps, dkimTxt] = await Promise.all([
    dns.mx(domain),
    dns.txt(domain),
    dns.txt(`_dmarc.${domain}`),
    dns.ips(mailHost),
    dkim ? dns.txt(`${dkim.selector}._domainkey.${domain}`) : Promise.resolve([]),
  ]);

  const checks: Check[] = [];

  // ---- MX
  {
    const sorted = [...mx].sort((a, b) => a.priority - b.priority);
    const found = sorted.map((m) => `${m.priority} ${host(m.exchange)}`);
    const expected = `10 ${mailHost}`;
    let matches = sorted.filter((m) => host(m.exchange) === mailHost);
    if (!matches.length && hostIps.length) {
      // An MX with a different name is fine if it resolves to the same server.
      const same = await Promise.all(sorted.map(async (m) => (await dns.ips(host(m.exchange)).catch(() => [])).some((ip) => hostIps.includes(ip))));
      matches = sorted.filter((_, i) => same[i]);
    }
    if (!mx.length) checks.push({ id: "mx", label: "MX", status: "fail", summary: "No MX record, so other servers don't know where to deliver mail for this domain.", found, expected });
    else if (!matches.length)
      checks.push({ id: "mx", label: "MX", status: "fail", summary: `MX points to ${host(sorted[0].exchange)}, not to this mailcow server (${mailHost}). Mail goes somewhere else.`, found, expected });
    else if (host(sorted[0].exchange) !== host(matches[0].exchange))
      checks.push({ id: "mx", label: "MX", status: "warn", summary: `${host(sorted[0].exchange)} has a higher priority than this server, so it receives mail first.`, found, expected });
    else checks.push({ id: "mx", label: "MX", status: "ok", summary: `Mail is delivered to ${host(matches[0].exchange)}.`, found, expected });
  }

  // ---- SPF
  {
    const spf = txt.filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
    const expected = "v=spf1 mx a -all";
    if (!spf.length) checks.push({ id: "spf", label: "SPF", status: "fail", summary: "No SPF record. Other providers are more likely to mark your mail as spam.", found: [], expected });
    else if (spf.length > 1) checks.push({ id: "spf", label: "SPF", status: "fail", summary: "There are several SPF records. Only one is allowed, so receivers treat SPF as broken. Merge them into one.", found: spf, expected });
    else {
      const rec = spf[0].trim();
      const terms = rec.toLowerCase().split(/\s+/).slice(1);
      const allowsMx = terms.some((t) => /^[+]?mx(:|$|\/)/.test(t) && (t === "mx" || t === "+mx" || t.includes(domain)));
      const allowsHost = terms.some((t) => {
        const m = t.match(/^[+]?(a|ip4|ip6):([^/]+)/);
        return !!m && (host(m[2]) === mailHost || hostIps.includes(m[2]));
      });
      const allowsA = terms.includes("a") || terms.includes("+a");
      const mxOk = checks[0].status !== "fail";
      const hasInclude = terms.some((t) => t.startsWith("include:") || t.startsWith("redirect="));
      const all = terms.find((t) => /^[-~?+]?all$/.test(t));
      if (all === "+all" || all === "all")
        checks.push({ id: "spf", label: "SPF", status: "fail", summary: "SPF ends with +all, which lets any server on the internet send as this domain.", found: [rec], expected });
      else if (!(allowsMx && mxOk) && !allowsHost && !(allowsA && hostIps.length === 0))
        checks.push({
          id: "spf",
          label: "SPF",
          status: hasInclude ? "warn" : "fail",
          summary: hasInclude
            ? `SPF doesn't name ${mailHost} directly. It may still be allowed through an include, but adding "mx" is the safe way.`
            : `SPF doesn't allow ${mailHost} to send, so mail from this server can fail SPF. Add "mx".`,
          found: [rec],
          expected,
        });
      else if (!all || all === "?all")
        checks.push({ id: "spf", label: "SPF", status: "warn", summary: "SPF doesn't end with -all or ~all, so it doesn't tell receivers to distrust other senders.", found: [rec], expected });
      else checks.push({ id: "spf", label: "SPF", status: "ok", summary: `This server is allowed to send. Others get ${all === "-all" ? "rejected (-all)" : "flagged (~all)"}.`, found: [rec], expected });
    }
  }

  // ---- DKIM
  {
    if (!dkim) checks.push({ id: "dkim", label: "DKIM", status: "fail", summary: "mailcow has no DKIM key for this domain yet, so outgoing mail isn't signed. Create one below.", found: [] });
    else {
      const name = `${dkim.selector}._domainkey`;
      const expected = `${name}  TXT  ${dkim.txt}`;
      const want = dkimKey(dkim.txt);
      const recs = dkimTxt.filter((t) => /v=DKIM1|p=/i.test(t));
      if (!recs.length) checks.push({ id: "dkim", label: "DKIM", status: "fail", summary: `No TXT record at ${name}.${domain}. Receivers can't verify the signature mailcow adds.`, found: [], expected });
      else if (!recs.some((r) => dkimKey(r) === want))
        checks.push({ id: "dkim", label: "DKIM", status: "fail", summary: `The key published at ${name} doesn't match mailcow's key. Signatures will fail until it's updated.`, found: recs, expected });
      else checks.push({ id: "dkim", label: "DKIM", status: "ok", summary: `The ${dkim.selector} key in DNS matches mailcow.`, found: recs, expected });
    }
  }

  // ---- DMARC
  {
    const recs = dmarcTxt.filter((t) => /^v=DMARC1/i.test(t.trim()));
    const expected = `_dmarc  TXT  v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}`;
    if (!recs.length) checks.push({ id: "dmarc", label: "DMARC", status: "fail", summary: "No DMARC record. Gmail and Yahoo expect one, and without it anyone can spoof this domain more easily.", found: [], expected });
    else if (recs.length > 1) checks.push({ id: "dmarc", label: "DMARC", status: "fail", summary: "There are several DMARC records, so receivers ignore all of them. Keep one.", found: recs, expected });
    else {
      const p = (tagValue(recs[0], "p") ?? "").toLowerCase();
      if (p === "reject" || p === "quarantine")
        checks.push({ id: "dmarc", label: "DMARC", status: "ok", summary: `Policy is ${p}: mail that fails SPF and DKIM gets ${p === "reject" ? "rejected" : "sent to spam"}.`, found: recs, expected });
      else if (p === "none")
        checks.push({ id: "dmarc", label: "DMARC", status: "warn", summary: "Policy is none, which only monitors. Once SPF and DKIM pass, switch to quarantine.", found: recs, expected });
      else checks.push({ id: "dmarc", label: "DMARC", status: "fail", summary: "The DMARC record has no valid p= policy, so receivers ignore it.", found: recs, expected });
    }
  }

  return checks;
}
