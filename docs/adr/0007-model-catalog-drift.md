# Model catalog drift — Pins müssen weich sein

Der Modellkatalog ändert sich ständig: Free-Modelle verschwinden (`step-5-preview-free`
tauchte auf und wurde unbrauchbar), Provider drehen IDs um (`azure-openai-responses`
→ `azure`), Relays tauschen Backends (`opencode@` vs. `kilo@stepfun/…` für dasselbe
Modell). aiui hat an **vier** Stellen harte Modell-Pins — jede ist ein Stillstand,
wenn der Katalog wandert.

## Context

**Das Schmerz-Problem ist real und frisch.** Der Firmenindex-e2e-Case
(`quick-lookup-brantner`) erwartet `modelContains: "qwen"` und lief mit
`unii@kilo@stepfun/step-3.7-flash:free` — ein Free-Modell, das in einem Lauf
11 Tool-Calls machte (Grenze: 8), im nächsten 6. Der Case ist nicht kaputt,
das Modell ist gewandert.

**Vier Pin-Stellen, vier verschiedene Drift-Folgen:**

| Stelle | Pin | Drift-Folge |
|---|---|---|
| `server/default-user-settings.json` | `defaultProvider: "zen.fg"`, `defaultModel: "hy3-free"` | **Provider existiert nicht mehr** (live: nur `dgxp`, `tu`, `unii`, `zai`) → jeder neue User startet mit einem Pin, den es nicht gibt |
| `workspace/.agent/<user>/settings.json` | seeded copy pro User | Bestands-User tragen den toten Pin weiter; die Datei ist das, was der Agent liest |
| `scripts/e2e-cases/firmenindex.json` | `modelContains: "qwen"` | Suite wird rot, obwohl die Agent-Arbeit korrekt ist |
| `agent.md`-Frontmatter (`model:`) | optional pro Agent | Agent startet nicht, wenn sein Modell weg ist |

**Was aiui heute schon hat** (nicht neu bauen):
- `server/model-filter.js` — include/notInclude-Globs über den Katalog
  (`unii@tu@qwen*`, `unii@kilo@*free*`). Das ist exakt die Sprache, die Pins brauchen.
- SDK-Fallback: "a BYOK User whose own catalog lacks this model gets the SDK
  fallback (first available)" — ein toter Pin endet also nicht im Crash, aber
  in einem **ungeplanten** Modell (unvorhersagbar, ungetestet, ungewollt).
- `default-user-settings.json` hat genau diesen Kommentar schon — das Konzept
  ist angelegt, aber nirgends durchgesetzt.

**Grenzbedingungen:**
- `model-filter.js` ist deployment-weit und per-User; ein Pin ist eine
  *Absicht* ("dieser Agent soll auf Qwen laufen"), ein Filter ist eine
  *Policy*. Die dürfen nicht vermischt werden.
- Der Katalog kommt aus `ModelRuntime` (SDK), nicht aus aiui. aiui kann ihn
  nur lesen, nicht besitzen.
- Credentials bleiben file-basiert (ADR-0002-Haltung).

## Decision

### Decision 1: Pins werden Glob-Patterns, nicht IDs

Jede der vier Stellen akzeptiert künftig ein **Pattern** statt einer ID.
Pattern-Sprache = die von `model-filter.js` (keine neue Sprache erfinden):

| Form | Bedeutung | Beispiel |
|---|---|---|
| `unii@tu@qwen-3.6-35b` | exakte ID (heute) | bleibt gültig |
| `unii@tu@qwen*` | Glob auf der ID | fängt `qwen-3.6-35b`, `qwen-3.6-35b-vllm` |
| `unii@kilo@*free*` | Glob über Provider-Pfad | fängt jede Free-Variante |
| `qwen*` | bare ID (Fallback wie im Filter) | provider-agnostisch |

**Auflösung zur Laufzeit** (eine Funktion, `resolveModelPin(pattern, catalog)`):
1. Exakte ID im Katalog → nehmen.
2. Sonst Glob gegen den Katalog matchen.
3. Mehrere Treffer → **deterministisch** wählen: erstes Match in stabiler
   Katalogreihenfolge (nicht `Array.find` auf eine ungeordnete Map — SDK-
   Reihenfolte ist stabil genug, aber aiui sortiert nach ID für Reproduzierbarkeit).
4. Kein Treffer → **nicht** stillschweigend auf "first available" fallen
   (das ist der ungeplante Fallback), sondern: in der Session sichtbar markieren
   (welcher Pin war, was wurde genommen) und ein `pin_unresolved`-Event.

### Decision 2: Ein Resolver, vier Aufrufer

`server/model-pin.js` — ein Modul, eine Verantwortung:

```
resolveModelPin(pattern, catalog) → { resolved: "unii@tu@qwen-3.6-35b", matchedBy: "exact"|"glob", candidates: [...] }
```

Aufrufer:
- **Seeding** (`default-user-settings.json` → `migrate-per-user-agentdir.js`):
  Pattern wird *beim Seeding* aufgelöst und die **aufgelöste ID** in die
  User-`settings.json` geschrieben. Bestands-User behalten ihre ID (stabil),
  neue User bekommen die aktuell existierende. Kein Migration-Schritt nötig,
  der alte Dateien umschreibt.
- **Agent-Frontmatter** (`server/agents.js`): Pattern wird beim Agent-Laden
  gegen den **laufenden** Katalog aufgelöst. Agent-Pins sind Absichten
  ("qwen", "etwas kostenloses"), die über Katalog-Generationen tragen.
- **e2e-Cases** (`scripts/agent-e2e.js`): `modelContains` bleibt Substring-
  Check, aber die Case-Definition darf ein Pattern sein; der Fold matcht
  gegen das aufgelöste Modell. Zusätzlich: `modelPin` (Absicht) getrennt von
  `modelContains` (Befund) — sonst verwechselt ein grüner Substring-Treffer
  wieder Absicht mit Zufall.
- **Model-Filter** (`server/model-filter.js`): unverändert. Filter ist Policy,
  Pin ist Absicht. Ein Pin, der gegen den Filter verstößt, wird nicht
  aufgelöst (default-deny bleibt).

### Decision 3: Drift sichtbar machen statt ignorieren

Drei Stellen, an denen Drift heute unsichtbar ist:

1. **`/api/models`** liefert pro Modell `resolvedFrom`, wenn es via Glob gematcht
   wurde — die UI kann "Qwen 3.6 (via `qwen*`)" zeigen statt zu tun, als wäre
   die ID stabil.
2. **Session-Status** (`session_status`-Event) trägt `pin` + `resolved` —
   genau da, wo der e2e-Fold es schon liest.
3. **Startup-Warnung** statt Startup-Schweigen: wenn der Deployment-Pin
   (`default-user-settings.json`) nicht auflösbar ist, logged der Server es
   einmal. Das ist der Fall, der jetzt live ist (`zen.fg` existiert nicht) und
   den niemand merkt, weil der SDK-Fallback ihn versteckt.

### Decision 4: Free-Modelle sind keine Pins wert

Ein Free-Modell ist per Definition instabil (Rate-Limits, Backend-Tausch,
Abschaltung). Was aiui aus dem Free-Modell-Vorfall gelernt hat
(`opencode@step-5-preview-free`: ignorierte Tool-Results, halluzinierte
Result-Inhalte):

- Agent-Pins zeigen auf **stabile** Modelle. Free-Modelle dürfen im
  **Filter** stehen (User darf sie wählen), aber nicht in einem Agent-Pin.
- Wenn ein Agent kostenlos laufen *muss*, pinnt er ein Pattern über die
  Free-Familie (`unii@kilo@*free*`) — und akzeptiert, dass die Familie
  wandert. Das ist ehrlich als "irgendein kostenloses" statt "dieses
  bestimmte kostenlose".

## Rejected alternatives

**Katalog einfrieren / vendoren.** aiui könnte `models.json` mitliefern und
nur das nutzen. Abgelehnt: veraltet sofort, und aiui will die SDK-Kataloge
(BYOK, neue Provider) nutzen. Der Katalog ist ein *Input*, kein Asset.

**Stiller Fallback auf "first available" (Status quo).** Abgelehnt: das ist
genau der ungeplante Pfad — ein Agent, der für Qwen gebaut ist, läuft
plötzlich auf einem Modell, das keine Tool-Results verarbeitet. Unsichtbar,
bis der e2e rot wird.

**Pin-Validierung beim Start (hart scheitern).** Abgelehnt: ein Deployment,
das wegen eines verschwundenen Free-Modells nicht startet, ist schlimmer als
eines, das auf ein Glob-Match läuft und es sagt. Warnen + auflösen, nicht
verweigern.

**Patterns nur im Frontmatter, IDs in settings.json.** Abgelehnt: genau die
Stelle, die am häufigsten driftet (`default-user-settings.json` zeigt auf
einen toten Provider), wäre die einzige ohne Auflösung.

## Consequences

**Gut:**
- Ein Free-Modell-Abschied kostet einen Glob-Edit statt eine Debug-Session.
- Der e2e-Case driftet nicht mehr rot, wenn das Modell wandert — er matcht
  die Absicht.
- Der tote `zen.fg`-Pin wird endlich sichtbar (Decision 3.3).
- Bestands-User sind nicht betroffen (Auflösung beim Seeding, keine Migration).

**Kosten:**
- Ein neues Modul (`server/model-pin.js`) plus Auflösung an vier Aufrufern.
- `resolveModelPin` braucht Tests: exakt, Glob, multi-match-Determinismus,
  no-match, Filter-Konflikt. ~10 Fälle, node-testbar, kein Netz.
- Die UI muss `resolvedFrom` anzeigen können (eine Zeile, keine neue Komponente).

**Risiko:**
- Glob-Matches können *mehrere** Kandidaten treffen und der "deterministische
  erste" ist nicht automatisch der *richtige*. Deswegen: Kandidaten im
  Session-Status mitloggen, damit ein Fehlgriff nachvollziehbar ist.
- Ein Agent-Pin wie `unii@kilo@*free*` löst heute auf ein Modell auf, das
  morgen unbrauchbar ist. Das verschiebt das Problem von "ID existiert nicht"
  zu "Modell ist schlecht" — ehrlicher, aber nicht gelöst. Decision 4 nimmt
  das in Kauf, weil die Alternative (harter Pin auf ein stabiles Modell) die
  Free-Absicht begräbt.

## Umsetzung (Reihenfolge)

1. `server/model-pin.js` + Tests (Kern, kein Netz, kein UI)
2. `default-user-settings.json`: Pin auf ein existierendes stabiles Modell
   (`unii@tu@qwen-3.6-35b`) — der tote `zen.fg`-Pin ist der konkrete Schmerz
3. Seeding/Agent-Laden auf den Resolver umstellen
4. e2e: `modelPin` (Absicht) vs. `modelContains` (Befund) trennen
5. Startup-Warnung + `resolvedFrom` in `/api/models`

Schritt 2 ist der Fastsmartfail-Sofortfix: eine Zeile, behebt den live
kaputten Pin, bevor das Konzept steht.
