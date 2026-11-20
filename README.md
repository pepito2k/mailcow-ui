# Mail Admin for mailcow

A cleaner admin UI for a self-hosted [mailcow](https://mailcow.email) server. It talks to mailcow's REST API (`/api/v1`) and doesn't change mailcow itself, so you can run it next to the built-in UI and remove it any time.

**Screens:** dashboard (CPU and memory charts for the last hour, and an alert when a newer mailcow release is out), domains (with per-domain mailboxes, aliases, DKIM, DNS records and rate limits), mailboxes (search, filters, bulk actions, rate limits), aliases, alias domains, resources, mail queue, quarantine, sync jobs, transports, relay hosts, TLS policies, BCC maps, recipient maps, forwarding hosts, domain admins, app passwords, Fail2ban, logs and service status. Light and dark themes, works on a phone.

## How it works

```
browser ──> mailcow-ui (Node, port 3000) ──X-API-Key──> mailcow /api/v1
```

The browser never sees the API key. The small Node server keeps it, adds its own admin login (signed, HttpOnly cookie), and forwards only `get/`, `add/`, `edit/` and `delete/` API calls.

## Try it without a mail server

```bash
npm install
npm run demo
```

Open http://localhost:5173 and sign in with `admin` / `admin`. This runs against a fake mailcow API with sample data (`mock/server.ts`).

## Connect it to your mailcow

1. In mailcow, go to **System → Configuration → Access → API**, enable a **read-write** key, and add the IP this app will connect from to its allowed list.
2. Copy `.env.example` to `.env` and fill it in:
   - `MAILCOW_URL` and `MAILCOW_API_KEY`
   - `ADMIN_PASSWORD_HASH`: run `npm run hash-password`
   - `SESSION_SECRET`: run `openssl rand -hex 32`
3. Run it:
   - Locally: `npm run dev` and open http://localhost:5173 (set `COOKIE_SECURE=0` when testing over plain http).
   - With Docker (recommended for the server): `docker compose up -d --build`, then point your reverse proxy at `127.0.0.1:3000` with HTTPS.

### Deploying with Coolify

1. New resource from this GitHub repo, build pack **Dockerfile** (not Nixpacks, not Docker Compose). Ports exposes: `3000`.
2. Give it **its own domain**, for example `https://mailadmin.example.com`. Don't reuse your mailcow hostname (the one in your MX record): that name must keep pointing at mailcow or mail, webmail and certificates break.
3. Add these environment variables: `MAILCOW_URL` (your mailcow address, e.g. `https://mail.example.com`), `MAILCOW_API_KEY`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` and `COOKIE_SECURE=1`.
4. In mailcow's API settings, allow the public IP of the Coolify server for the API key.
5. Deploy. The logs should end with `mailcow API OK`. If something is missing or wrong, the logs and the sign-in page list what to fix.

If mailcow and Coolify run on the same machine, they both want ports 80 and 443. mailcow's docs cover running it behind another reverse proxy (`HTTP_PORT`/`HTTPS_PORT` in `mailcow.conf`).

### Running it on the mailcow host

If you put it on the same machine as mailcow, use `MAILCOW_URL=https://<your mail hostname>` and add the server's public IP (or the Docker gateway IP) to the API key's allowed IPs. An easy reverse-proxy option is a separate subdomain such as `admin.example.com` in front of port 3000.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API server + Vite dev server with hot reload (reads `.env`) |
| `npm run demo` | Same, against the fake mailcow API |
| `npm run build` | Builds the frontend and server into `dist/` |
| `npm start` | Runs the built app (`dist/server/index.js`) |
| `npm run typecheck` | TypeScript checks for frontend and server |
| `npm run hash-password` | Prints an `ADMIN_PASSWORD_HASH` line |

## Project layout

```
server/   Express server: login, session cookie, API proxy, serves the built UI
web/      React + TypeScript frontend (Vite, TanStack Query, React Router)
mock/     Fake mailcow API for development
```

## Still only in mailcow's own UI

rspamd settings and spam filter maps, OAuth2 clients, per-mailbox spam score and allow/block lists, quota notifications, and the mailcow system configuration pages. Screens that use API calls I couldn't verify against a real server: quarantine release, emptying the whole queue, Fail2ban unban and resource booking options.
