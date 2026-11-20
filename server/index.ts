import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as undiciFetch } from "undici";
import { config } from "./config.js";
import { isNewer, latestRelease } from "./updates.js";
import { HostSampler } from "./hoststats.js";
import { checkDomain, systemLookup, type Check } from "./dnscheck.js";
import { mailStats } from "./mailstats.js";
import { LoginLimiter, parseCookies, readSession, safeEqual, signSession, verifyPassword } from "./auth.js";

const COOKIE = "mcui_session";
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", "loopback, linklocal, uniquelocal");

const dispatcher = new Agent({ connect: { rejectUnauthorized: !config.tlsInsecure } });
const limiter = new LoginLimiter();

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

// Liveness check for Docker/Coolify. Always 200 while the process is up.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, configured: config.problems.length === 0 });
});

// Until the required settings are present, every other API call explains what's missing.
app.use("/api", (req, res, next) => {
  if (!config.problems.length || req.path === "/health") return next();
  res.status(503).json({ error: "This app isn't configured yet.", setup: config.problems });
});

function setSessionCookie(req: Request, res: Response, value: string, maxAgeSec: number) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSec}`,
  ];
  if (config.cookieSecure || req.secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function currentUser(req: Request): string | null {
  const session = readSession(parseCookies(req.headers.cookie)[COOKIE], config.sessionSecret);
  return session?.user ?? null;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!currentUser(req)) return res.status(401).json({ error: "Not signed in" });
  // CSRF guard: state-changing calls must come from this app's own JS.
  if (req.method !== "GET" && req.get("X-Requested-With") !== "mailcow-ui") {
    return res.status(403).json({ error: "Missing request header" });
  }
  next();
}

app.post("/api/auth/login", express.json({ limit: "10kb" }), (req, res) => {
  const ip = req.ip || "unknown";
  if (limiter.blocked(ip)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  const userOk = typeof username === "string" && safeEqual(username, config.adminUser);
  const pw = typeof password === "string" ? password : "";
  const passOk = config.passwordHash ? verifyPassword(pw, config.passwordHash) : safeEqual(pw, config.plainPassword);
  if (!userOk || !passOk) {
    limiter.fail(ip);
    return res.status(401).json({ error: "Wrong username or password" });
  }
  if (config.cookieSecure && !req.secure) {
    return res.status(400).json({
      error: "COOKIE_SECURE=1 but this request arrived over plain http, so the browser would drop the login cookie. Open the app over https, or set COOKIE_SECURE=0.",
    });
  }
  limiter.clear(ip);
  const maxAge = Math.round(config.sessionHours * 3600);
  const token = signSession({ user: config.adminUser, exp: Date.now() + maxAge * 1000 }, config.sessionSecret);
  setSessionCookie(req, res, token, maxAge);
  res.json({ user: config.adminUser });
});

app.post("/api/auth/logout", (req, res) => {
  setSessionCookie(req, res, "", 0);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Not signed in" });
  res.json({ user, mailcowUrl: config.mailcowUrl });
});

// CPU and memory history for the charts (sampled server-side, last hour).
const hostSampler = new HostSampler(config.mailcowUrl, config.apiKey, dispatcher);
app.get("/api/host-stats", requireAuth, async (_req, res) => {
  res.json(await hostSampler.read());
});

// Is a newer mailcow release out? Compares the running version with GitHub's latest release.
app.get("/api/updates", requireAuth, async (_req, res) => {
  let current: string | null = null;
  try {
    const r = await undiciFetch(`${config.mailcowUrl}/api/v1/get/status/version`, {
      headers: { "X-API-Key": config.apiKey, Accept: "application/json" },
      dispatcher,
      signal: AbortSignal.timeout(10_000),
    });
    current = ((await r.json()) as { version?: string }).version ?? null;
  } catch {
    current = null;
  }
  const { enabled, release, error } = await latestRelease();
  res.json({
    enabled,
    current,
    latest: release?.version ?? null,
    releaseName: release?.name ?? null,
    releaseUrl: release?.url ?? null,
    publishedAt: release?.publishedAt ?? null,
    updateAvailable: !!(release && current && isNewer(release.version, current)),
    error: error ?? null,
  });
});

/** GET a mailcow API path with the server's key (for server-side features). */
async function mcFetch<T>(sub: string, timeoutMs = 15_000): Promise<T> {
  const r = await undiciFetch(`${config.mailcowUrl}/api/v1/${sub}`, {
    headers: { "X-API-Key": config.apiKey, Accept: "application/json" },
    dispatcher,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`mailcow answered ${r.status} for ${sub.split("/").slice(0, 2).join("/")}`);
  return (await r.json()) as T;
}

// DNS health for one domain: MX, SPF, DKIM and DMARC compared with what mailcow expects.
const dns = systemLookup(process.env.DNS_SERVERS?.split(/[\s,]+/).filter(Boolean));
const dnsCache = new Map<string, { at: number; body: unknown }>();
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
app.get("/api/dns-check/:domain", requireAuth, async (req, res) => {
  const domain = String(req.params.domain).toLowerCase();
  if (!DOMAIN_RE.test(domain)) return res.status(400).json({ error: "Not a domain name" });
  const cached = dnsCache.get(domain);
  if (cached && Date.now() - cached.at < 2 * 60_000 && req.query.fresh !== "1") return res.json(cached.body);
  const mailHost = new URL(config.mailcowUrl).hostname;
  try {
    const d = await mcFetch<{ pubkey?: string; dkim_txt?: string; dkim_selector?: string }>(`get/dkim/${encodeURIComponent(domain)}`).catch(() => ({}) as Record<string, never>);
    const dkim = d && d.dkim_txt ? { selector: d.dkim_selector || "dkim", txt: d.dkim_txt } : null;
    const checks: Check[] = await checkDomain(domain, mailHost, dkim, dns);
    const body = { domain, mailHost, checkedAt: new Date().toISOString(), checks };
    dnsCache.set(domain, { at: Date.now(), body });
    if (dnsCache.size > 500) dnsCache.delete(dnsCache.keys().next().value!);
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: `DNS lookup failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// Sent / received / spam / rejected per hour, built from rspamd's history.
app.get("/api/mail-stats", requireAuth, async (_req, res) => {
  try {
    res.json(await mailStats((n) => mcFetch<unknown>(`get/logs/rspamd-history/${n}`, 30_000)));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Proxy: /api/mailcow/<path> -> MAILCOW_URL/api/v1/<path>, adding the API key server-side.
app.use("/api/mailcow", requireAuth, express.raw({ type: "*/*", limit: "5mb" }), async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const sub = req.url.replace(/^\/+/, "");
  if (!/^(get|add|edit|delete)\//.test(sub) || sub.includes("..")) return res.status(400).json({ error: "Bad path" });
  const target = `${config.mailcowUrl}/api/v1/${sub}`;
  try {
    const upstream = await undiciFetch(target, {
      method: req.method,
      headers: {
        "X-API-Key": config.apiKey,
        Accept: "application/json",
        ...(req.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: req.method === "POST" && Buffer.isBuffer(req.body) && req.body.length ? req.body : undefined,
      dispatcher,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.type(upstream.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`mailcow request failed: ${req.method} ${sub}: ${msg}`);
    res.status(502).json({ error: `Could not reach mailcow at ${config.mailcowUrl}`, detail: msg });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Static frontend (production build lives next to the compiled server)
const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, "../web");
if (existsSync(webDir)) {
  app.use(express.static(webDir, { index: false, maxAge: "1h" }));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(webDir, "index.html")));
}

app.listen(config.port, "0.0.0.0", () => {
  console.log(`mailcow-ui listening on 0.0.0.0:${config.port}`);
  if (config.problems.length) {
    console.error("\nmailcow-ui is NOT configured yet. Fix these environment variables and restart:");
    for (const p of config.problems) console.error(`  - ${p}`);
    console.error("");
  } else {
    console.log(`Talking to mailcow at ${config.mailcowUrl}`);
    checkMailcow();
  }
});

/** One request at startup so connection or API-key problems show up in the logs right away. */
async function checkMailcow() {
  try {
    const r = await undiciFetch(`${config.mailcowUrl}/api/v1/get/status/version`, {
      headers: { "X-API-Key": config.apiKey, Accept: "application/json" },
      dispatcher,
      signal: AbortSignal.timeout(10_000),
    });
    const body = await r.text();
    if (r.ok && !body.includes('"error"')) console.log(`mailcow API OK: ${body.slice(0, 120)}`);
    else console.error(`mailcow API answered ${r.status}: ${body.slice(0, 200)}. Check MAILCOW_API_KEY and that this server's IP is allowed for the key.`);
  } catch (err) {
    console.error(`Can't reach mailcow at ${config.mailcowUrl}: ${err instanceof Error ? (err.cause ?? err.message) : err}`);
  }
}
