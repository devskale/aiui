# Deployment — skale.dev/aiui → neusiedl.duckdns.org

How πui reaches the public internet: a Vercel redirect from `skale.dev/aiui`
to a self-hosted server (`neusiedl.duckdns.org`), through nginx into a systemd
Node service.

## Topology

```
  browser
     │
     │  https://skale.dev/aiui            (no trailing slash — see Gotchas)
     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  skale.dev  (Vercel, Astro site "skalego")                    │
  │  vercel.json → redirects:                                     │
  │    /aiui        → https://neusiedl.duckdns.org:8001/aiui/     │
  │    /aiui/:path* → …/aiui/:path*      (307, permanent:false)   │
  └──────────────────────────────────────────────────────────────┘
     │  308 apex→www, then 307 redirect
     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  neusiedl.duckdns.org  (lubu: Ubuntu, 193.81.25.185)          │
  │  DuckDNS dynamic DNS → home server                            │
  │                                                               │
  │  nginx :8001 ssl  (self-signed cert neusiedl.crt)             │
  │  site: sites-enabled/neusiedl  → includes aiui.conf           │
  │    location /aiui/  → proxy_pass http://127.0.0.1:8082/       │
  │      proxy_buffering off; proxy_read_timeout 86400s  (SSE)    │
  │      X-Forwarded-Proto $scheme                               │
  └──────────────────────────────────────────────────────────────┘
     │
     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  systemd --user aiui.service                                  │
  │  node server/index.js   PORT=8082 HOST=127.0.0.1              │
  │  NODE_ENV=production  VITE_BASE=/aiui/                        │
  │  node: ~/.nvm/.../v24.13.0/bin/node                           │
  └──────────────────────────────────────────────────────────────┘
```

The `/aiui/` path prefix (`VITE_BASE=/aiui/`) is stripped by nginx's
`proxy_pass … :8082/` (trailing slash) — the app sees `/`, `/api/...`, etc.

## Access URLs

| URL | Notes |
|---|---|
| `https://skale.dev/aiui` | **Canonical.** No trailing slash (see Gotchas). Redirects to lubu. |
| `https://neusiedl.duckdns.org:8001/aiui/` | Direct. **Self-signed cert** → browser warning, click through once. |
| `http://lubuntu.local/aiui/` | LAN (mDNS). No cert warning. |

## Deploy

```bash
./deploy.sh    # vite build (VITE_BASE=/aiui/) → rsync → migrate → restart
```

`deploy.sh` does, in order:
1. `VITE_BASE=/aiui/ pnpm build`
2. `rsync` to `lubu:/home/woodmastr/code/webuis/aiui/`
   (excludes `node_modules/ workspace/ uploads/ pi/ .pi/ .git/` — user data survives)
3. `pnpm install --frozen-lockfile`
4. `node scripts/migrate-per-user-agentdir.js` (per-user agentDir seed; idempotent)
5. `systemctl --user restart aiui`

`set -e` means a failed build/migration aborts before the restart, leaving the
old code serving.

## Operations (on lubu)

```bash
# service status / logs
systemctl --user status aiui
journalctl --user -u aiui -f

# auth config (~/.aiui-auth.json)
node scripts/hash-passphrase.js '<passphrase>'   # → salt:hash, paste into passphrases[]
# { "users":["hans@skale.dev"], "passphrases":["salt:hash"], "limits":{"guest":10} }

# nginx
sudo nginx -t && sudo systemctl reload nginx
cat /etc/nginx/aiui.conf                  # the /aiui/ location block
cat /etc/nginx/sites-enabled/neusiedl     # the :8001 ssl server block
```

## Auth & cookies

- Auth on iff `~/.aiui-auth.json` exists on lubu. scrypt passphrase; in-memory
  session token; 7-day `aiui_session` cookie.
- Cookie is `SameSite=Lax; Secure; HttpOnly; Path=/` — **first-party** once the
  Vercel redirect lands on `neusiedl.duckdns.org`. (This is why the redirect
  approach won over the abandoned iframe — see Gotchas.)
- `X-Forwarded-Proto` is forwarded so the app knows it's HTTPS (needed for the
  Secure cookie to be set/sent).
- **Demo account**: `demo` / `demo`, quota 10 prompts/day. Configured in
  `~/.aiui-auth.json` (`limits: { demo: 10 }`). Generate a hash:
  `node scripts/hash-passphrase.js '<pw>'`.
- **Multi-cookie robustness**: `currentSession(req)` tries *every* `aiui_session`
  cookie until one validates, and login expires stale-path variants. Needed
  because old deploys left same-named cookies at other paths (see Gotchas #5).

## Gotchas

1. **`skale.dev/aiui/` (trailing slash) 404s on Vercel.** The redirect rule
   source is `/aiui` (no slash). Use `skale.dev/aiui`. The nav link in skalego
   (`Nav.astro`) points to `/aiui/` — it works because Vercel's apex→www 308 +
   the rule resolve, but the bare-slash form is fragile. If it breaks, add a
   `/aiui/` source to `vercel.json`.
2. **Self-signed cert on :8001.** First visit → browser warning
   (NET::ERR_CERT_AUTHORITY_INVALID). Click "Advanced → Proceed" once; Chrome
   remembers it. (A real cert would need port 443 + DNS control; the :8001 port
   + DuckDNS + self-signed is the tradeoff for not opening 443.)
3. **Iframe embed was abandoned** (skalego git `fb1b8f4`). An earlier attempt
   served aiui inside an skale.dev iframe so the URL stayed `skale.dev/aiui`.
   Reverted: Chrome blocks cross-site iframe cookies (SameSite) even with CHIPS
   partitioned storage, so the embedded app couldn't maintain a session. The
   redirect approach makes access first-party on `neusiedl.duckdns.org`, where
   `SameSite=Lax` works.
4. **No request logging.** The server doesn't log HTTP requests. To debug a
   failing endpoint, curl it directly with `-k` (self-signed):
   `curl -sk https://neusiedl.duckdns.org:8001/aiui/api/me`.
5. **Stale `aiui_session` cookies break login.** Past deploys set the session
   cookie at paths other than `/` (e.g. `/aiui/api/`); the browser keeps them
   all and sends them all, so `readSessionCookie` (first-match) picked a stale,
   post-restart-invalid token → login "succeeds" (200) but `/api/me` returned
   `authed:false`. Fixed: `currentSession` tries each cookie; login expires
   stale-path variants. If login ever silently fails again, check the Cookie
   header for duplicate `aiui_session` values.

## Config files (where things live)

| What | Where |
|---|---|
| skale.dev Vercel redirects | `skalego` repo: `vercel.json` → `redirects` (`/aiui`) |
| nginx `/aiui/` block | lubu: `/etc/nginx/aiui.conf` |
| nginx `:8001` ssl site | lubu: `/etc/nginx/sites-enabled/neusiedl` |
| self-signed cert | lubu: `/etc/ssl/certs/neusiedl.crt` + `/etc/ssl/private/neusiedl.key` |
| systemd service | lubu: `~/.config/systemd/user/aiui.service` |
| auth config | lubu: `~/.aiui-auth.json` |
| shared keys/models | lubu: `~/.pi/agent/{auth,models}.json` (non-BYOK ModelRuntime) |
| app code | lubu: `/home/woodmastr/code/webuis/aiui/` |
