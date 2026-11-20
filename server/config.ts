/**
 * Reads settings from the environment.
 *
 * Missing or invalid settings don't crash the server: it still starts, logs
 * what's wrong, answers /api/health, and shows the problems on the sign-in
 * page. That way a hosting platform (Coolify, etc.) shows a running container
 * with a clear message instead of a restart loop.
 */
const problems: string[] = [];

function env(name: string): string {
  // Strip whitespace and one pair of surrounding quotes, which are easy to paste into a hosting UI by accident.
  return (process.env[name] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
}

function required(name: string, hint: string): string {
  const v = env(name);
  if (!v) problems.push(`${name} is not set. ${hint}`);
  return v;
}

const mailcowUrl = required("MAILCOW_URL", "Set it to your mailcow address, like https://mail.example.com").replace(/\/+$/, "");
if (mailcowUrl && !/^https?:\/\//.test(mailcowUrl)) problems.push("MAILCOW_URL must start with https:// (or http://).");

const apiKey = required("MAILCOW_API_KEY", "Create a read-write key in mailcow under System > Configuration > Access > API.");

const passwordHash = env("ADMIN_PASSWORD_HASH");
const plainPassword = env("ADMIN_PASSWORD");
if (!passwordHash && !plainPassword) {
  problems.push("ADMIN_PASSWORD_HASH is not set. Generate one with: npm run hash-password");
} else if (passwordHash && !/^scrypt[:$][^:$]+[:$][^:$]+$/.test(passwordHash)) {
  problems.push("ADMIN_PASSWORD_HASH doesn't look right. It should look like scrypt:<salt>:<key>. Copy the whole value without quotes, and run npm run hash-password again if it has $ signs in it.");
} else if (!passwordHash) {
  console.warn("Warning: ADMIN_PASSWORD is set in plain text. Prefer ADMIN_PASSWORD_HASH.");
}

const sessionSecret = required("SESSION_SECRET", "Generate one with: openssl rand -hex 32");
if (sessionSecret && sessionSecret.length < 32) problems.push("SESSION_SECRET must be at least 32 characters (openssl rand -hex 32).");

export const config = {
  mailcowUrl,
  apiKey,
  tlsInsecure: env("MAILCOW_TLS_INSECURE") === "1",
  adminUser: env("ADMIN_USER") || "admin",
  passwordHash,
  plainPassword,
  sessionSecret,
  cookieSecure: env("COOKIE_SECURE") === "1",
  sessionHours: Number(env("SESSION_HOURS") || 12),
  port: Number(env("PORT") || 3000),
  problems,
};
