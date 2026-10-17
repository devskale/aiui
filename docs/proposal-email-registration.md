# Proposal — Email-based Registration (aiui, blueprint for other services)

**Status:** proposal, 2026-10-15 · **Infra:** all-inkl mailbox (OCI fallback: `~/code/non-sense/coreservices/oci/EMAIL-SETUP.md`, Pfad A) · **From:** `aiui@skale.dev` via hub `mail@skale.dev`
**Goal:** self-service registration with email verification for aiui — built so the
mail + token + user-store core drops into any other service (klark, kontext, …).

---

## 0. Decisions (recommended, need sign-off)

| Question | Recommendation | Why |
|---|---|---|
| Login after signup | **Email + passphrase**, verify-link only at registration & reset | logins cost no email budget (OCI caps: 100/day, 10/min); passwordless magic-link would make every login depend on mail |
| Registration mode | **`invite`** (code required) as default; `open` / `closed` via config | aiui grants shell + quota + possibly BYOK — self-service open signup on an agent service is an abuse magnet. Invite codes can be printed in the auth file |
| From address | **one approved sender per service**: `aiui@skale.dev` | one DKIM/SPF setup for the domain, per-service local part = clear for recipients, filterable, no shared identity |
| User store | **JSON file with atomic writes** (`~/.aiui-users.json`), same mtime-reload pattern as `auth.js` | matches existing zero-dep ethos; SQLite swap-in documented in the blueprint for when a service outgrows it |
| Blueprint shape | **shared module** (`mailer.js` + `email-auth.js`), vendored per service — *not* a central mail daemon | fewer moving parts; SMTP creds per host via env. A central maild on ampere-1 is a later option if creds management hurts |

## 1. Infra reality (verified 2026-10-15 via `~/configs` + live DNS)

**PUBLIC_URL is resolved — aiui is already public:** `https://skale.dev/aiui` is the
canonical entry (amd2 nginx `/aiui/` → lubu `:8001` → `127.0.0.1:8082`, mirrored in
`~/configs/nginx/amd2/skale.dev`). Verify links become
`https://skale.dev/aiui/verify?token=…` — same-origin deep links, cookies stay
first-party. aiui runs on **lubu** (home, double NAT — but only *inbound* is
constrained; outbound SMTP :587 is unrestricted).

**skale.dev DNS+mail lives at all-inkl (kasserver):** MX `w01973ad.kasserver.com`,
SPF `v=spf1 a mx include:spf.kasserver.com ~all` already set, no DMARC yet.
DNS edits = **manual KAS panel** (no KAS API on this tariff — see
`~/configs/docs/dns01-cloudflare-delegation.md`).

### Sending path — two options that work

| | **B: all-inkl mailbox** (fast) | **A: OCI Email Delivery** (documented runbook) |
|---|---|---|
| Setup | create hub mailbox `mail@skale.dev` in KAS panel, SMTP creds in lubu env — **~30 min, live today** | email domain + DKIM CNAMEs + SPF merge + approved sender + IAM SMTP cred (EMAIL-SETUP.md Pfad A) |
| DNS edits | none (SPF already valid); optional DKIM toggle + DMARC in panel | merge SPF (`include:spf.oracleemail.net`) + OCI DKIM CNAMEs — manual panel edits |
| Deliverability | aligned SPF via kasserver, real mailbox | own DKIM, Oracle infra |
| Receives bounces/replies | **yes — real mailbox** (abuse/bounce capture, good for a reg flow) | no — approved senders are send-only |
| Quota | all-inkl tariff fair-use (check KAS limit; registration volumes = single digits/user) | 3.000/month free, 100/day tenant-wide |
| Blueprint for other services | per-domain mailbox (only works for all-inkl-hosted zones) | per-service approved sender, one IAM user each (2 SMTP creds max — non-issue) |

**Recommendation:** start with **B** (fastest to a green smoke; bounce capture), keep **A**
as the documented scale path in the blueprint — the `mailer.js` interface is identical
(`SMTP_HOST/USER/PASS/FROM`), so switching later is an env change, not code.

### Env on lubu (systemd unit or `EnvironmentFile`)

```
# Path B (verified live 2026-10-17 — smoke green, incl. auto-DKIM)
SMTP_HOST=w01973ad.kasserver.com   # account host; smtp.kasserver.com does NOT exist
SMTP_PORT=587
SMTP_USER=mail@skale.dev          # operator hub (alias-send: From stays aiui@ — verified working)
SMTP_PASS=<hub mailbox password>
MAIL_FROM=mail@skale.dev           # derweil: hub as From too — per-service aliases later, env-only switch
PUBLIC_URL=https://skale.dev/aiui
REGISTRATION_MODE=invite          # invite | open | closed
```

> Live findings (2026-10-17): submission via `w01973ad.kasserver.com:587` STARTTLS + auth works from lubu; **From: alias accepted** (sent as `aiui@` via hub login); **all-inkl DKIM-signs automatically** (`d=skale.dev`, selector `kas2026…`) — aligned DKIM without any panel action. SPF aligned by construction (relay = kasserver, already in SPF). Drop-in live on lubu: `~/.config/systemd/user/aiui.service.d/mail.conf` (600).

## 2. Sender defaults (blueprint)

- **Hub mailbox `mail@skale.dev`** (neutral operator inbox): the ONE real mailbox — SMTP login for the whole fleet + where every alias delivers. Service identities are aliases (`aiui@`, `klark@`, …) that send via the hub's SMTP login (`MAIL_FROM=<service>@…`). Never name the hub after a service: postmaster/abuse/DMARC are *domain* roles, and a service rename/death must not take the fleet's mail identity with it. (`admin@` avoided — spam magnet; RFC only mandates `postmaster@`.)
- **KAS aliases on the hub**: `postmaster@` + `abuse@` (RFC 2142, where strangers write) + `registration@`/`verify@` (cosmetic inbound) → all deliver into `mail@`.
- **DMARC**: `_dmarc TXT "v=DMARC1; p=none; rua=mailto:mail@skale.dev"` — monitor first, tighten to `p=quarantine` after DKIM verified.

## 3. Email catalog (SOTA set)

**P0 — registration MVP (3):**
1. **Verify** — link+button to same URL, TTL stated in-mail (30 min), single-use, resend rotates token, "didn't request → ignore" (no cancel link — enumeration safety).
2. **Welcome** — one CTA ("Open aiui"), 3 bullets: quota, settings/BYOK, agent's scope on the machine.
3. **Reset** — enumeration-safe phrasing, TTL, "didn't request → passphrase unchanged".

**P1 — safety & ops (agent-service extras):** email-change confirm (new addr) + notice (old), new-device/new-IP login notice, quota warning @80%, security-change notices (passphrase/sessions/BYOK key — one parameterized template), invitation mail (invite mode: says who invited + what aiui is).

**P2 — opt-in only (budget-aware):** activity digest (needs RFC 8058 one-click unsubscribe once anything bulk-ish exists), BYOK spend alerts, inactivity→deletion notice (GDPR retention), admin notices (approval mode).

**Cross-cutting:** one purpose + one CTA per mail; plain-text part mandatory; no tracking pixels / redirect links; replyable sender + monitored bounce inbox (hard bounce → deactivate); enumeration-safe wording incl. uniform timing; subject = service + action ("aiui: verify your email").

**Web-verified additions (2026-10-15, OWASP Email Cheat Sheet + 2026 deliverability guides):**

- **Email canonicalization**: store **original + normalized** address (domain lowercased; NO provider-specific munging like Gmail dot-removal) — prevents equivalent/lookalike-address account takeover. Compare on normalized, mail to original.
- **Email change = identity change**: re-auth required + notify old address + confirm new address (both-confirm for high-risk) — mandatory, not optional.
- **Disposable domains**: risk-based controls over strict blocking; `invite`-mode default is already the primary control — additionally monitor creation patterns.
- **Design**: single-column mobile layout (~41% of opens on phones), dark-mode-safe contrast, subject names the event.
- **Bulk-sender context** (Gmail/Yahoo 2024, Microsoft since 2025-05, threshold 5k/day — we're ~3 orders below): RFC 8058 one-click unsub becomes mandatory the moment anything bulk-ish (digests) ships; SPF+DKIM+DMARC aligned + monitored from-domain are the baseline regardless. BIMI (logo in inbox) requires DMARC `p=quarantine`+ and a paid VMC — explicitly out of scope until then.

Sources: OWASP Cheat Sheet (Email Validation & Verification), Moosend Transactional Guide 2026-01, Mailflow Authority Deliverability 2026, Brevo/Omnisend on noreply.

Budget: P0+P1 ≈ 3–5 mails per user lifecycle — all-inkl fair-use fine; only P2 threatens the OCI 100/day cap.

---

## 8. Fleet rollout (derweil: throway · aiui · klark · kontext)

DNS reality: **skale.dev** = all-inkl, real mailboxes, SPF valid → the only domain that can *send*. **klark.one / kontext.one** = porkbun forwarding-MX (receive-only). → all services send from **one** sending domain, per-service local part:

| Service | App | Runs on | Sender | Registration |
|---|---|---|---|---|
| aiui | skale.dev/aiui | lubu :8082 | aiui@skale.dev | ✅ primary case |
| throway | skale.dev/throway | lubu (:8001 vhost) | throway@skale.dev | ❌ anonymous by design; later: expiry/abuse notices only |
| klark | klark.one | pi5 :3001 (→amd :23001) | klark@skale.dev | optional |
| kontext | kontext.one | ubugrill (→amd :22001) | kontext@skale.dev | optional |

**One KAS-panel sitting covers all four:** 1 real hub mailbox `mail@skale.dev` (neutral operator inbox — SMTP login, never named after a service) + aliases `aiui@`/`throway@`/`klark@`/`kontext@`/`postmaster@`/`abuse@` → all deliver into the hub + DMARC TXT (`p=none`, rua→mail@).

Trade-off accepted for now: one operator SMTP cred shared across hosts (a leak anywhere = can send as any service alias). Splitting later = give a service its own mailbox, repoint its alias, swap its env cred — zero code. Per-own-domain From later (only if branding demands): OCI Email Domain at porkbun — **automatable via porkbun API**, unlike KAS.

## 4. Flow

### Register (verify)
1. LoginModal gains a **Register** tab: email + passphrase (+ invite code in `invite` mode).
2. `POST /api/auth/register {email, passphrase, inviteCode}`
   - rate-limit per IP and per email (60s cooldown), enumeration-safe,
   - creates `pending` user + **verify token**: `crypto.randomBytes(32)`, stored **SHA-256-hashed**, single-use, TTL 30 min,
   - sends mail: `Verifying link: ${PUBLIC_URL}/verify?token=…` ("valid 30 minutes, didn't request → ignore").
3. Click → client `POST /api/auth/verify {token}` (hash-compare, constant-time) → user `active` → **auto-login** (existing session cookie).
4. Resend = mint new token, invalidate old. Default quota for self-registered users stays **low** (e.g. 5/day) until an admin raises it.

### Login (unchanged mechanics)
Email instead of username — `verifyCredentials` learns a second credential source
(registered users) beside the static auth file. Widget keys untouched.

### Reset
`POST /api/auth/reset-request {email}` → always same answer → mail with reset token
(TTL 30 min) → `POST /api/auth/reset {token, newPassphrase}`.

### Admin
`/api/admin/users` (admin = first user / flag in auth file): list pending/active,
raise quota, deactivate. In `invite` mode also: see usage per invite code.

## 5. Anti-abuse checklist

- Sliding-window limiter on register/verify/resend/reset (per IP), per-email resend cooldown — extends existing `noteLoginAttempt`.
- Tokens: 32B random, hashed at rest, single-use, TTL, cleanup batch on access.
- Uniform responses everywhere ("if this address exists, a mail is on its way").
- Passphrase hashing reuses `scripts/hash-passphrase.js` format (salt:hash).
- Quota defaults low for self-registered; BYOK stays opt-in per user.
- Later/optional: Cloudflare Turnstile on the register tab.

## 6. Files (aiui)

```
server/mailer.js        NEW  nodemailer transport (OCI SMTP), templates: verify / reset / (welcome)
server/email-auth.js    NEW  token store + register/verify/reset handlers + users.json read/write
~/.aiui-users.json      NEW  { users:[{email,hash,status,created,quota,invite}], tokens:[{hash,purpose,email,expires,used}] }
server/auth.js          +    second credential source, REGISTRATION_MODE, invite codes (in ~/.aiui-auth.json)
server/index.js         +    public routes /api/auth/register|verify|reset*  (before requireAuth)
src/components/LoginModal.jsx  +  Register + Forgot-password tabs
package.json            +    nodemailer
```

Blueprint extraction (phase 3): `mailer.js` + token/user logic → `coreservices/email/`
as a tiny reusable package + runbook README; **the second consumer proves the
abstraction** — don't generalize before that.

## 7. Build order (smoke-first)

| Phase | Deliverable | Smoke |
|---|---|---|
| 0 | Sending path: KAS hub mailbox `mail@skale.dev` + aliases + env on lubu | swaks mail from lubu arrives (inbox, not spam) |
| 1 | `mailer.js` + env + `sendTest` | verify-style mail to own address renders |
| 2 | register/verify + users store + LoginModal tab | register own email → click → auto-login → one agent prompt |
| 3 | reset flow + admin list + invite codes | reset own passphrase, login again |
| 4 | extract blueprint into `coreservices/email/` | wire into a second service |

OCI budget check: 3000/month, 100/day free — a registration flow uses single digits
per user; the cap only matters if we later send notifications/digests too
(→ then notifications move to a separate sender or service).
