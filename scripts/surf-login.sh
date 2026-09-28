#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# surf-login — öffnet eine aiui-Instanz im Chrome und loggt den Test-User
# automatisch ein, falls das Login-Modal steht. Für Agent-/Browser-Tests.
#
# Aufruf:  scripts/surf-login.sh [url]        (Default: Credentials-URL)
# Credentials: ~/.aiui/agenttest-creds.json  { user, pass, url }
#              (chmod 600, NIE ins Repo — dieses Skript ist secret-frei)
# Exit 0 = eingeloggt (Modal weg, App sichtbar).
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

CREDS="${HOME}/.aiui/agenttest-creds.json"
URL="${1:-}"

if [ ! -f "$CREDS" ]; then
  echo "surf-login: $CREDS fehlt — { user, pass, url } anlegen (chmod 600)." >&2
  exit 1
fi

USER_NAME=$(python3 -c "import json;print(json.load(open('$CREDS'))['user'])")
PASS=$(python3 -c "import json;print(json.load(open('$CREDS'))['pass'])")
[ -z "$URL" ] && URL=$(python3 -c "import json;print(json.load(open('$CREDS'))['url'])")

surf open "$URL" 2>/dev/null || surf open "$URL"
sleep 3

# Schon eingeloggt? → fertig.
if surf eval '!!document.querySelector(".sidebar")' 2>/dev/null | grep -q true; then
  echo "surf-login: bereits eingeloggt"
  exit 0
fi

# Login-Modal füllen (native surf fill — kein eval-Quoting).
surf fill '.login-input:not([type=password])' "$USER_NAME" >/dev/null 2>&1 || true
surf fill '.login-input[type=password]' "$PASS" >/dev/null 2>&1 || true

sleep 1
surf eval 'document.getElementById("aiui-login-submit")?.click()' 2>/dev/null || true
sleep 3

if surf eval '!!document.querySelector(".sidebar")' 2>/dev/null | grep -q true; then
  echo "surf-login: bereits eingeloggt"
  exit 0
fi

# Login-Modal füllen (LoginModal: username + passphrase inputs, submit).
surf eval "(() => {
  const u = document.querySelector('.login-input:not([type=password])')
  const p = document.querySelector('.login-input[type=password]')
  if (!u || !p) return 'KEIN MODAL'
  const set = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  set(u, '$USER_NAME'); set(p, '$PASS')
  return 'gefüllt'
})" 2>/dev/null

sleep 0.5
surf eval 'document.getElementById("aiui-login-submit")?.click(); "submitted"' 2>/dev/null
sleep 3

if surf eval '!!document.querySelector(".sidebar")' 2>/dev/null | grep -q true; then
  echo "surf-login: OK als $USER_NAME"
  exit 0
fi
echo "surf-login: FEHLGESCHLAGEN (Modal/Sidebar-Check)" >&2
exit 1
