function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable ${name}. See .env.example.`);
    process.exit(1);
  }
  return v;
}

const passwordHash = process.env.ADMIN_PASSWORD_HASH || "";
const plainPassword = process.env.ADMIN_PASSWORD || "";
if (!passwordHash && !plainPassword) {
  console.error("Set ADMIN_PASSWORD_HASH (run: npm run hash-password).");
  process.exit(1);
}
if (!passwordHash && plainPassword) {
  console.warn("Warning: ADMIN_PASSWORD is set in plain text. Prefer ADMIN_PASSWORD_HASH.");
}

const sessionSecret = required("SESSION_SECRET");
if (sessionSecret.length < 32) {
  console.error("SESSION_SECRET must be at least 32 characters (openssl rand -hex 32).");
  process.exit(1);
}

export const config = {
  mailcowUrl: required("MAILCOW_URL").replace(/\/+$/, ""),
  apiKey: required("MAILCOW_API_KEY"),
  tlsInsecure: process.env.MAILCOW_TLS_INSECURE === "1",
  adminUser: process.env.ADMIN_USER || "admin",
  passwordHash,
  plainPassword,
  sessionSecret,
  cookieSecure: process.env.COOKIE_SECURE === "1",
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  port: Number(process.env.PORT || 3000),
};
