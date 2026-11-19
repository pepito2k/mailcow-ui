import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as undiciFetch } from "undici";
import { config } from "./config.js";
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

function setSessionCookie(res: Response, value: string, maxAgeSec: number) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSec}`,
  ];
  if (config.cookieSecure) parts.push("Secure");
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
  limiter.clear(ip);
  const maxAge = Math.round(config.sessionHours * 3600);
  const token = signSession({ user: config.adminUser, exp: Date.now() + maxAge * 1000 }, config.sessionSecret);
  setSessionCookie(res, token, maxAge);
  res.json({ user: config.adminUser });
});

app.post("/api/auth/logout", (_req, res) => {
  setSessionCookie(res, "", 0);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Not signed in" });
  res.json({ user, mailcowUrl: config.mailcowUrl });
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

app.listen(config.port, () => {
  console.log(`mailcow-ui listening on http://localhost:${config.port} -> ${config.mailcowUrl}`);
});
