---
name: throway
description: "Teilt Recherche-Reports und Datei-Bündel als kurzlebiges, benanntes Verzeichnis auf skale.dev/throway und liefert den Share-Link. Nutze dies, wenn der Nutzer ein Bündel/Report teilen will („teil das“, „auf throway“, „als Link verschicken“)."
---

# throway — Bündel teilen

throway (skale.dev/throway) ist ein no-auth Dateispeicher: Upload → kurzlebigere
URL. Für Report-Bündel nutze den **DIR-Modus**: benannt, create-or-get, sliding
TTL, einzelne Files updatebar.

## Der DIR-Flow

**1. Anlegen** (⚠️ POST, nicht GET — GET auf den Root liefert nur die Info-Seite):

```bash
curl -s -X POST "https://skale.dev/throway/?dir=1&name=<NAME>&listed=1&tag=firmenindex&ttl=14d"
```

- Naming: 5–32 Zeichen, `[a-z0-9-]`, ≥1 Buchstabe. **Konvention für Reports:**
  `fi-<slug>-<fn>-<4hex>` (z. B. `fi-brantner-475207i-k3f9`) — das Suffix
  (`openssl rand -hex 2`) verhindert Kollisionen, wenn mehrere Agenten dieselbe
  Firma recherchieren (DIRs sind global, create-or-get würde sonst in ein
  fremdes Verzeichnis mischen).
- `ttl` sliding (jedes Nachlegen schiebt `expires_at` nach vorn), geclamped auf
  max 14 Tage, gesamt max 30 Tage ab Erstellung. Default 7d.
- Flags (`listed`, `tag`, `ttl`) greifen nur bei Erst-Erstellung (create-or-get).

**2. Dateien rein** (einzeln oder als multipart-Charge):

```bash
curl -s -X POST "https://skale.dev/throway/d/<key>" -F "f=@report.md" -F "f=@rohdaten/lookup.json"
```

**3. Im Chat liefern:** den Link (`https://skale.dev/throway/d/<key>`), eine
3-Zeilen-Zusammenfassung des Reports und das Ablaufdatum.

## Bündelstruktur (Report-Share)

```
report.md            ← die Analyse (der Einstieg)
index.html           ← optional, via visualize-Skill
rohdaten/*.json      ← die API-Antworten 1:1
dokumente/*          ← Urkunden / Bilanz-XML
```

## Limits & Ehrlichkeit

- **5 MB pro Datei.** MB-große Urkunden-PDFs passen teils nicht → dann im
  Report nur den Dokumenten-Index + Quelle referenzieren statt Upload.
- **Nicht privat:** Jeder mit der URL kann lesen, bearbeiten, löschen. Bei
  erkennbar sensiblen Kontexten vorher beim Nutzer nachfragen.
- **Nicht permanent:** DIRs sterben (sliding TTL). Im Chat immer das
  `expires_at` nennen — wer Dauerspeicher braucht, ist hier falsch.
- Text-Files (`report.md`) sind nachträglich patchbar:
  `PUT`/`PATCH https://skale.dev/throway/d/<key>/<file>` (ersetzen/anhängen).
- ZIP für Alles-Download: `GET /d/<key>?zip=1`. Edit-Historie: `GET /d/<key>/history`.
