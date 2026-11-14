---
name: firmenindex
description: "Recherchiert österreichische Firmen und Personen über die skale.dev/firmenindex-API: Suche, Firmenprofile, Personen/Organe, Beteiligungsnetzwerke, GISA-Gewerbe, Insolvenzen, Bilanzzahlen, Firmenbuchauszüge, Urkunden (PDF/XML). Nutze dies bei JEDER Firmen-/Personen-Recherche zu Österreich — nicht die Website scrapen, immer die API."
---

# Firmenindex — API-Recherche Österreich

Durchsuchbarer Index österreichischer Firmen: **300k+ Firmenbuch-Einträge**
(evi.gv.at + HVD) plus nicht-eingetragene Gewerbe (GISA/WKO), ÖNACE-klassifiziert.
Alles maschinenlesbar, keine Cookies.

**Auth (Stand 2026-11-14, API v0.7.0):** Daten-Endpoints brauchen seit
2026-10-30 eine Konto-Session oder einen Agent-Token (Bearer). ANON-FREI:
`search`, `suggest`, `openapi.json`, `help`, `index` sowie die
`.md`-Fassungen (`firma/<slug>-<fn>.md`). Mit gültigem Agent-Token hast du
einen **eigenen Drossel-Topf** (aktuell **15 req/min**, zählt deine
Token-Identität statt der IP — anonym wären 5 Detail-Abfragen/Tag/IP).
Der Token liegt als Env-Var `FIRMENINDEX_TOKEN` in der Server-Umgebung
(`.env.local`, gitignored — NIE ins Repo); ist sie leer, liefert jeder
Daten-Call `auth_erforderlich` — dann nichts retrien, sondern den Deployer
bitten, die Env zu setzen.

## Das eine Muster

```bash
curl -s -H "Authorization: Bearer $FIRMENINDEX_TOKEN" \
  "https://skale.dev/firmenindex/api?e=<ENDPOINT>&<PARAMS>"
```

- **JEDER `/api`-Call trägt diesen Header** — die Beispiele unten zeigen
  ihn vollständig; kopiere das Muster.
- `e` = URL-encodeter Endpoint-Pfad (`search/eu` → `search%2Feu`)
- Pfad-Parameter kommen direkt in `e` (`auszug%2F475207i`), Query-Parameter daneben (`&fn=…`)
- **Exakte Parameter immer aus der Live-Referenz holen, nie aus dem Gedächtnis:**
  `curl -s "https://skale.dev/firmenindex/api?e=openapi.json"` (OpenAPI 3, aus dem
  laufenden Code generiert — kann nicht veralten; frei ohne Token)

### Scripte: Datei statt `-c` (Quoting-Falle)

Mehrzeilige Python-/Node-Auswertungen (XML-Bilanzen parsen u. ä.) **als Datei
schreiben und ausführen** — nie `python3 -c "…"` mit mehrzeiligem Code:
innere `"` (z. B. f-Strings) brechen das Shell-Quoting, der Call failed mit
Syntaxfehler. Muster:

```bash
cat << 'PYEOF' > /tmp/parse_bilanz.py
import xml.etree.ElementTree as ET
PYEOF
python3 /tmp/parse_bilanz.py
```

(`node` und `python3` stehen im Sandbox-Bash zur Verfügung.)

## Die drei Kernflüsse

### ① Firmen & Personen finden

```bash
curl -s -H "Authorization: Bearer $FIRMENINDEX_TOKEN" "https://skale.dev/firmenindex/api?e=search&query=brantner"
curl -s -H "Authorization: Bearer $FIRMENINDEX_TOKEN" "https://skale.dev/firmenindex/api?e=search%2Feu&query=friseur&ort=Neusiedl%20am%20See"
```
`search` + `suggest` sind anon-frei; `search/eu` (EU-Suche) und die
Personensuche (`person/search`, `person/karriere`) brauchen den Token —
Personen-Endpoints liefern mit Agent-Token aktuell `Forbidden`
(Stand 2026-11-14; ggf. Konto-Session nötig — live prüfen, nicht raten).
Query-Sprache, Wildcards, Umlaut-Faltung, Branche/Ort-Chips:
https://skale.dev/firmenindex/agents-suche.html

### ② Firmenprofil (alles Aufbereitete)

```bash
curl -s -H "Authorization: Bearer $FIRMENINDEX_TOKEN" "https://skale.dev/firmenindex/api?e=lookup%2Fmerged&fn=475207i"
curl -s "https://skale.dev/firmenindex/firma/brantner-oesterreich-gmbh-475207i.md"  # token-arm als Markdown, frei ohne Token
```
Ein Call → Stammdaten, Personen/Organe, Gesellschafter, Beteiligungen, letzte
Vollzüge, Publikationen. Die `.md`-Fassung ist fürs Lesen optimiert (weniger
Tokens) und trägt die firma-spezifischen Calls in ihrer „Weiteres"-Sektion.

### ③ Dokumente & Bilanzdaten

```bash
curl -s -H "Authorization: Bearer $FIRMENINDEX_TOKEN" "https://skale.dev/firmenindex/api?e=agent%2Fv1%2Ffirmen%2F475207i%2Funterlagen"   # Liste: results[] mit urkunde_key · dokumentart_text · stichtag · groesse
curl -s -H "Authorization: Bearer $FIRMENINDEX_TOKEN" "https://skale.dev/firmenindex/api?e=agent%2Fv1%2Funterlagen%2F<KEY>%2Fmanifest"  # Detail je Urkunde
curl -s -H "Authorization: Bearer $FIRMENINDEX_TOKEN" "https://skale.dev/firmenindex/api?e=hvd%2Furkunde-get&key=<KEY>" -o urkunde.pdf  # rohes PDF/Bilanz-XML (Download läuft über hvd/urkunde-get)
curl -s -H "Authorization: Bearer $FIRMENINDEX_TOKEN" "https://skale.dev/firmenindex/api?e=bilanz&fn=475207i"                # Bilanz-Zahlen fertig ausgezählt
curl -s -H "Authorization: Bearer $FIRMENINDEX_TOKEN" "https://skale.dev/firmenindex/api?e=auszug%2F475207i&fmt=md"          # Firmenbuchauszug (ohne fmt: rohes PDF)
```
XML-Semantik (FinanzOnline-Strukturdaten vs. eingebettete base64-PDFs),
Höflichkeit bei MB-großen Urkunden:
https://skale.dev/firmenindex/agents-dokumente.html
(`hvd/historie` liefert mit Agent-Token aktuell `Forbidden` — Stand
2026-11-14; die Urkunden-Liste läuft über `…/unterlagen`.)

## Weiter aufbereitet — je eine Zeile

- **GISA-Gewerbe:** `gisa/{fn}` · e.U.-Gewerbe je GISAZahl: `gewerbe/{gz}`
- **Insolvenzen/Edikte:** `insolvenz/{fn}`
- **Vertretungsbefugte je Stichtag:** `firmen/{fn}/vertretung?stichtag=YYYY-MM-DD`
- **Konzern-/Eigentümer-Graph (GLEIF):** `gleif/{fn}`
- **Verflechtungs-Netzwerk** (2 Ebenen): `firmen/{fn}/netzwerk?max_items=12` → `{gesellschafter, beteiligungen}` mit `fn/person/role/since/status` je Knoten; Personen ohne FN nie verlinken; `anteil` ist ehrlich `null`
- **UBO-Kontrolle:** `firmen/{fn}/kontrolle?max_tiefe=6` → `kontrollpfade[]` nach oben, jede Kante mit `quelle`+`since`; `ende` je Pfad (`person`/`firma_ohne_fn`/`zyklus`/`tiefe_erreicht`) — der Pfad IST die Aussage, Anteile werden nicht aggregiert
- **EU-Vergaben (TED):** `firmen/{fn}/vergaben` → öffentliche Aufträge dieser Firma als Gewinner
- **Eigentümer-/Beteiligungs-Crawl (DB-Bestand):** `crawl/shareholders/{fn}` (wer hält Anteile) · `crawl/beteiligungen/{fn}` (was hält die Firma) · Verwandte: `crawl/related/{fn}`
- **Agenten-API v1:** `agent/v1/firmen/{fn}/finanzdaten` (Kennzahl-Registry), `…/unterlagen` (Urkunden-Liste), `…/bundle`, `agent/v1/unterlagen/{key}/manifest`, Discovery-Index: `agent/v1/index`
- **Branchen-/Länder-Kontext:** `branchen/zahlen` (ÖNACE-Abschnitts-Statistik) · `investoren/laender` (Auslands-Eigentümer)
- **ÖNACE:** Firmen je Branche `oenace/companies?code=5621` (edv-Code, ohne Punkte) · Baum `oenace/tree`
- **Personen:** `person/search?q=…` · Werdegang `person/karriere?q=…&fn=…` (beide mit Agent-Token aktuell `Forbidden` — Stand 2026-11-14; live prüfen)
- **Standorte:** `standorte?fn=…` · **UID-Check (VIES):** `uid-check?uid=…` · `uid/firma?fn=…`
- **Quellen-Status/Abdeckung:** `status` (Feld `abdeckung`) — Soll-Lücken sind ehrlich offen, nie geraten

## Verbindungs-Recherche: Firma A ↔ Firma B

„Wie ist Firma A mit Firma B verbunden?" beantwortet kein einzelner Endpoint —
diese Reihenfolge (jeweils cache-first, DB-first-Endpoints zuerst):

1. **`kontrolle/{A}` + `kontrolle/{B}`** (`firmen/{fn}/kontrolle`) — gemeinsame
   Knoten über den Kontrollpfaden? (z. B. dieselbe Stiftung, dieselbe
   Holding) → stärkste Aussage: „gemeinsamer Kontrolleur"
2. **`netzwerk/{A}` + `netzwerk/{B}`** — direkte Kreuzbeteiligung (B in As
   Gesellschaftern/Beteiligungen oder umgekehrt)?
3. **Personen-Overlap** — `person/search` + `person/karriere` für GF/AR-
   Kandidaten aus beiden Netzen: sitzt dieselbe Person in beiden Organen?
   (Rolle + Firma + FN je Nachweis)
4. **Bei Treffer über Namen statt FN:** nie als Verbindung ausgeben, solange
   kein `resolved_fn` (resolve='exact') vorliegt — Namensgleichheit ist
   eine Hypothese, keine Kante.

Ergebnis: gefundene Verbindungen als Kantenliste (A → X → B mit Quelle je
Kante) + ehrliches „keine Verbindung im Datenbestand feststellbar" falls
alle vier Schritte leer laufen. Visualisierung: Mermaid-Graph (siehe
agent.md — bei Verbindungs-Recherchen Standard).

## Grafiken auf der Detailseite — Datenquelle + Link

Die Detailseite (`https://skale.dev/firmenindex/?fn=<FN>`) rendert client-seitig:

- **Verflechtungs-Graph** — Baum aus Gesellschafter-/Beteiligungs-Kanten, Daten aus `firmen/{fn}/netzwerk`
- **Bilanz-Kennzahlen** (EK-/FK-Quote, Umsatzrendite, letzte GJ) — aus `bilanz?fn=…` (E-Bilanz-XML, HVD; jede Zahl trägt ihren Urkunden-Beleg)
- **Zeitreise** (Vollzüge, Urkunden) — aus `lookup/merged` + `hvd/historie`

Es gibt **keine exportierbaren Bild-Assets** (alles JS-rendered). Für Reports:

1. `report.md` verlinkt die **Interaktive Ansicht**: `https://skale.dev/firmenindex/?fn=<FN>`
2. Eigene Grafiken (report.html via `visualize`) baust du aus denselben
   Endpoints — die Antworten liegen dir in `rohdaten/` vor. Bilanz-Charts aus
   `bilanz.json`, Eigentümer-/Beteiligungs-Graph aus `netzwerk*.json`.

## Arbeitsregeln

1. **Cache-first:** Antwort in den Workspace schreiben (`cache/<fn>.json`) und
   wiederverwenden. Token-Drossel-Topf aktuell **15 req/min** (Fehler-Type
   `zu_schnell` nennt das Limit) — höflich batchen, kein paralleles
   Sturmtrommeln.
1b. **Retry-Budget:** Max **2 Retry-Versuche** pro Call (mit `sleep 20–30`
   dazwischen). Danach: den Teil als **degradiert** kennzeichnen (Upstream-
   Timeout/„Bitte später erneut versuchen“ ist ein ehrliches Nein) und mit dem
   vorhandenen Material weitermachen. Kein Endlos-Retrying — ein fehlender
   Baustein ist besser als ein nie fertiggestellter Report.
2. **Fehler sind JSON:** `{"detail":{"error":{type,message}}}` mit passendem
   HTTP-Status — lesen, nicht ignorieren. `type: "auth_erforderlich"` heißt
   fast immer: der Bearer-Header fehlt (Muster oben inkl. Header kopieren) —
   **kein Retry** ohne Fix, ein Retry ohne Header läuft genauso ins Leere.
3. **`"degradiert": true`** im Payload → Live-Quelle ausgefallen: im Report
   kennzeichnen. Es werden nie gefälschte Daten geliefert — du auch nicht.
4. **`.md`-Fassungen bevorzugen** (`firma/<slug>-<fn>.md`, `auszug/<fn>&fmt=md`) —
   token-arm, kein HTML-Parsing.
5. Urkunden-PDFs im Workspace speichern und mit `read_pdf` lesen (nicht `read` —
   das liefert bei PDFs Binärdaten).
