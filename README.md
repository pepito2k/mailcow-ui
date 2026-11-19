# Mail Admin for mailcow

A cleaner admin UI for a self-hosted [mailcow](https://mailcow.email) server. It talks to mailcow's REST API (`/api/v1`) and doesn't change mailcow itself, so you can run it next to the built-in UI and remove it any time.

**Screens:** dashboard, domains (with per-domain mailboxes, aliases, DKIM and recommended DNS records), mailboxes (search, filters, bulk enable/disable/delete), aliases (including catch-all), mail queue, quarantine, logs and service status. Light and dark themes, works on a phone.

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

## Not built yet

Domain admins, app passwords, sync jobs, resources, transports and relay hosts, rate limits, Fail2ban settings, rspamd settings, TLS policy maps and the BCC maps are still only in mailcow's own UI.
