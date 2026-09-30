# Deployment — skale.dev/aiui (Eingang amd2 → lubu :8001 → aiui :8082)

How πui reaches the public internet: `https://skale.dev/aiui` — **same-origin
reverse proxy** on the amd2 nginx → lubu's `:8001` ssl vhost → the systemd Node
service on `127.0.0.1:8082`. No more cross-site redirect: cookies are
first-party on `skale.dev`.

## Topology

```
  browser
     │
     │  https://skale.dev/aiui          (307 → /aiui/, internal)
     ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  amd2  (Oracle VPS, serves skale.dev)                             │
  │  /etc/nginx/sites-enabled/skale.dev                               │
  │    location = /aiui → 307 /aiui/                                  │
  │    location /aiui/                                                │
  │      resolver 1.1.1.1 8.8.8.8 valid=300s   ← re-resolves DDNS     │
  │      set $aiui_upstream https://pind.mooo.com:8001                │
  │      proxy_pass $aiui_upstream             (URI stays /aiui/…)    │
  │      proxy_set_header Host lubu.skale.dev  ← picks the :8001 vhost│
  │      proxy_buffering off; read/send timeout 86400s  (SSE)         │
  │      client_max_body_size 64m              (uploads)              │
  │  (same pattern as /throway/ in the same file)                     │
  └──────────────────────────────────────────────────────────────────┘
     │  TLS+SNI pind.mooo.com (cert not verified — fine, internal hop)
     ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  lubu  (home box, Ubuntu; DDNS: pind.mooo.com =                   │
  │  neusiedl.duckdns.org, follows home-IP changes)                   │
  │                                                                   │
  │  nginx :8001 ssl — two vhosts, BOTH include /etc/nginx/aiui.conf: │
  │    · sites-enabled/lubu.skale.dev  (cert lubu.skale.dev.crt)      │
  │    · sites-enabled/neusiedl        (cert neusiedl.crt)            │
  │  aiui.conf:                                                       │
  │    location /aiui/ → proxy_pass http://127.0.0.1:8082/            │
  │      proxy_buffering off; proxy_read_timeout 86400s  (SSE)        │
  │      X-Forwarded-Proto $scheme                                    │
  │    location = /aiui → 301 /aiui/                                  │
  └──────────────────────────────────────────────────────────────────┘
     │
     ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  systemd --user aiui.service                                      │
  │  node server/index.js   PORT=8082 HOST=127.0.0.1                  │
  │  NODE_ENV=production  VITE_BASE=/aiui/                            │
  │  node: ~/.nvm/.../v24.13.0/bin/node                               │
  └──────────────────────────────────────────────────────────────────┘
```

The `/aiui/` path prefix (`VITE_BASE=/aiui/`) is stripped by lubu nginx's
`proxy_pass … :8082/` (trailing slash) — the app sees `/`, `/api/...`, etc.

## Access URLs

| URL | Notes |
|---|---|
| `https://skale.dev/aiui` | **Canonical.** Internal 307 → `/aiui/`, same-origin (cookies first-party on skale.dev). |
| `https://skale.dev/aiui/…` | Deep links stay on skale.dev (no cross-site hop). |
| `https://neusiedl.duckdns.org:8001/aiui/` | Direct. Valid CA cert (Cloudflare DNS-01); bypasses amd2. |
| `https://lubu.skale.dev/aiui/` | **Currently dead** — see DNS gotcha below. |
| `http://lubuntu.local/aiui/` | LAN (mDNS). |

## DNS gotcha — `lubu.skale.dev` is stale (as of 2026-09-30)

The `lubu` A-record in the skale.dev zone (kasserver/domainfactory,
ns5/ns6.kasserver.com — **no API access from any repo**) still points to
`138.2.179.13`, a former relay that answers nothing. lubu's real IP is only
tracked by DDNS (`pind.mooo.com` / `neusiedl.duckdns.org`). That's exactly why
the amd2 proxy resolves `pind.mooo.com` **at request time** (resolver
`valid=300s`) instead of pinning an IP.

Heal (needs kasserver panel, human task): `lubu.skale.dev CNAME
neusiedl.duckdns.org` (TTL 300) — then `https://lubu.skale.dev:8001/aiui/`
works too. True 443 on lubu additionally needs a router port-forward (open,
Home-SPOF — deliberately not done). Incident write-up:
`skale.dev/throway/d/aiui-erreichbarkeit-memo/memo-aiui-erreichbarkeit.md`;
fix applied in configs repo `fa420da` (mirror: `~/configs/nginx/amd2/skale.dev`).

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
old code serving. Deploys go over `ssh lubu` (pind.mooo.com:2225) and are
**independent of the public entry** — an entry outage never blocks deploys.

## Operations

```bash
# service status / logs (on lubu)
systemctl --user status aiui
journalctl --user -u aiui -f

# auth config (~/.aiui-auth.json on lubu)
node scripts/hash-passphrase.js '<passphrase>'   # → salt:hash, paste into passphrases[]
# { "users":["hans@skale.dev"], "passphrases":["salt:hash"], "limits":{"guest":10} }

# nginx on lubu
sudo nginx -t && sudo systemctl reload nginx
cat /etc/nginx/aiui.conf                  # the /aiui/ location block (shared by both vhosts)

# nginx on amd2 (the public entry)
ssh amd2 sudo cat /etc/nginx/sites-enabled/skale.dev
# mirror of amd2 nginx lives in the configs repo: nginx/amd2/skale.dev
```

## Auth & cookies

- Auth on iff `~/.aiui-auth.json` exists on lubu. scrypt passphrase; in-memory
  session token; 7-day `aiui_session` cookie.
- Cookie is `SameSite=Lax; Secure; HttpOnly; Path=/` — **first-party on
  skale.dev** since the amd2 same-origin proxy (2026-09-30). Before that the
  307 landed cross-site on `neusiedl.duckdns.org`; the iframe embed had failed
  entirely (see Gotchas).
- `X-Forwarded-Proto https` is set by both hops so the app knows it's HTTPS
  (needed for the Secure cookie to be set/sent).
- **Demo account**: `demo` / `demo`, quota 10 prompts/day. Configured in
  `~/.aiui-auth.json` (`limits: { demo: 10 }`). Generate a hash:
  `node scripts/hash-passphrase.js '<pw>'`.
- **Multi-cookie robustness**: `currentSession(req)` tries *every* `aiui_session`
  cookie until one validates, and login expires stale-path variants. Needed
  because old deploys left same-named cookies at other paths (see Gotchas #5).

## Gotchas

1. **Both slash forms work.** `skale.dev/aiui` → internal 307 → `skale.dev/aiui/`
   (both handled by amd2 nginx; nothing external involved). No Vercel rule
   anymore — skale.dev is served by amd2 nginx, not Vercel.
2. **Two `Host` realities.** The browser speaks `skale.dev`; amd2 forwards
   `Host: lubu.skale.dev` to lubu so the right `:8001` vhost answers. The
   upstream cert (`pind.mooo.com` SNI) is intentionally not verified
   (`proxy_ssl_verify` off default) — same as `/throway/`.
3. **Iframe embed was abandoned** (skalego git `fb1b8f4`). An earlier attempt
   served aiui inside a skale.dev iframe so the URL stayed `skale.dev/aiui`.
   Reverted: Chrome blocks cross-site iframe cookies (SameSite) even with CHIPS
   partitioned storage, so the embedded app couldn't maintain a session. The
   same-origin proxy achieves the same URL goal without that trap.
4. **No request logging.** The server doesn't log HTTP requests. To debug a
   failing endpoint, curl through the public entry:
   `curl -s https://skale.dev/aiui/api/me` (401 `not authenticated` = healthy).
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
| Public entry `/aiui/` proxy | amd2: `/etc/nginx/sites-enabled/skale.dev` · mirror: configs repo `nginx/amd2/skale.dev` |
| nginx `/aiui/` block (→ :8082) | lubu: `/etc/nginx/aiui.conf` (included by BOTH `:8001` vhosts) |
| nginx `:8001` ssl sites | lubu: `sites-enabled/lubu.skale.dev` + `sites-enabled/neusiedl` |
| certs (Cloudflare DNS-01) | lubu: `/etc/ssl/certs/lubu.skale.dev.crt`, `/etc/ssl/certs/neusiedl.crt` |
| systemd service | lubu: `~/.config/systemd/user/aiui.service` |
| auth config | lubu: `~/.aiui-auth.json` |
| shared keys/models | lubu: `~/.pi/agent/{auth,models}.json` (non-BYOK ModelRuntime) |
| app code | lubu: `/home/woodmastr/code/webuis/aiui/` |
