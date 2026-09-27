---
name: firmenindex
description: "Recherchiert österreichische Firmen und Personen über die skale.dev/firmenindex-API: Suche, Firmenprofile, Personen/Organe, Beteiligungsnetzwerke, GISA-Gewerbe, Insolvenzen, Bilanzzahlen, Firmenbuchauszüge, Urkunden (PDF/XML). Nutze dies bei JEDER Firmen-/Personen-Recherche zu Österreich — nicht die Website scrapen, immer die API."
---

# Firmenindex — API-Recherche Österreich

Durchsuchbarer Index österreichischer Firmen: **300k+ Firmenbuch-Einträge**
(evi.gv.at + HVD) plus nicht-eingetragene Gewerbe (GISA/WKO), ÖNACE-klassifiziert.
Alles maschinenlesbar, kein Login, keine Cookies.

## Das eine Muster

```bash
curl -s "https://skale.dev/firmenindex/api?e=<ENDPOINT>&<PARAMS>"
```

- `e` = URL-encodeter Endpoint-Pfad (`search/rich` → `search%2Frich`)
- Pfad-Parameter kommen direkt in `e` (`auszug%2F475207i`), Query-Parameter daneben (`&fn=…`)
- **Exakte Parameter immer aus der Live-Referenz holen, nie aus dem Gedächtnis:**
  `curl -s "https://skale.dev/firmenindex/api?e=openapi.json"` (OpenAPI 3, aus dem
  laufenden Code generiert — kann nicht veralten)

## Die drei Kernflüsse

### ① Firmen & Personen finden

```bash
curl -s "https://skale.dev/firmenindex/api?e=search%2Frich&query=brantner"
curl -s "https://skale.dev/firmenindex/api?e=search%2Feu&query=friseur&ort=Neusiedl%20am%20See"
```
Query-Sprache, Wildcards, Umlaut-Faltung, Branche/Ort-Chips, Personensuche:
https://skale.dev/firmenindex/agents-suche.html

### ② Firmenprofil (alles Aufbereitete)

```bash
curl -s "https://skale.dev/firmenindex/api?e=lookup%2Fmerged&fn=475207i"
curl -s "https://skale.dev/firmenindex/firma/brantner-oesterreich-gmbh-475207i.md"  # token-arm als Markdown
```
Ein Call → Stammdaten, Personen/Organe, Gesellschafter, Beteiligungen, letzte
Vollzüge, Publikationen. Die `.md`-Fassung ist fürs Lesen optimiert (weniger
Tokens) und trägt die firma-spezifischen Calls in ihrer „Weiteres"-Sektion.

### ③ Dokumente & Bilanzdaten

```bash
curl -s "https://skale.dev/firmenindex/api?e=hvd%2Fsuche-urkunde&fnr=475207i"  # Liste: key · Art · Datum · PDF/XML
curl -s "https://skale.dev/firmenindex/api?e=hvd%2Furkunde-get&key=<KEY>" -o urkunde.pdf  # rohes PDF/Bilanz-XML
curl -s "https://skale.dev/firmenindex/api?e=bilanz&fn=475207i"                # Bilanz-Zahlen fertig ausgezählt
curl -s "https://skale.dev/firmenindex/api?e=auszug%2F475207i&fmt=md"          # Firmenbuchauszug als Markdown
```
XML-Semantik (FinanzOnline-Strukturdaten vs. eingebettete base64-PDFs),
Stichtags-Auszüge, Höflichkeit bei MB-großen Urkunden:
https://skale.dev/firmenindex/agents-dokumente.html

## Weiter aufbereitet — je eine Zeile

- **GISA-Gewerbe:** `gisa/{fn}` · Lizenz-Detail: `gisa/detail/{gisazahl}`
- **Insolvenzen/Edikte:** `insolvenz/{fn}`
- **Vollzugs-Historie:** `hvd/historie?fnr=…&von=…&bis=…`
- **Konzern-/Eigentümer-Graph (GLEIF):** `gleif/{fn}`
- **Verflechtungs-Netzwerk** (2 Ebenen): `firmen/{fn}/netzwerk?max_items=12` → `{gesellschafter, beteiligungen}` mit `fn/person/role/since/status` je Knoten; Personen ohne FN nie verlinken; `anteil` ist ehrlich `null`
- **ÖNACE:** Firmen je Branche `oenace/companies?code=5621` (edv-Code, ohne Punkte) · Baum `oenace/tree`
- **Personen:** `person/search?q=…` · Werdegang `person/karriere?q=…&fn=…`
- **Standorte:** `standorte?fn=…` · **UID-Check (VIES):** `uid-check?uid=…`
- **Quellen-Status/Abdeckung:** `status` (Feld `abdeckung`) — Soll-Lücken sind ehrlich offen, nie geraten

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
   wiederverwenden. Upstream-Rate-Limit **~30 req/min** — höflich batchen,
   kein paralleles Sturmtrommeln.
2. **Fehler sind JSON:** `{"detail":{"error":{type,message}}}` mit passendem
   HTTP-Status — lesen, nicht ignorieren.
3. **`"degradiert": true`** im Payload → Live-Quelle ausgefallen: im Report
   kennzeichnen. Es werden nie gefälschte Daten geliefert — du auch nicht.
4. **`.md`-Fassungen bevorzugen** (`firma/<slug>-<fn>.md`, `auszug/<fn>&fmt=md`) —
   token-arm, kein HTML-Parsing.
5. Urkunden-PDFs im Workspace speichern und mit `read_pdf` lesen (nicht `read` —
   das liefert bei PDFs Binärdaten).
