# Research: Personalaufwand → Kopfzahl-Schätzung (Firmenindex-Feature)

**Frage:** Ist die Rückrechnung von Mitarbeiterzahl aus dem Personalaufwand
(UGC-GuV) üblich — und wie genau wäre sie? Recherche 2026-09-29 gegen
Primärquellen (Statistik Austria AKOE 2024, UGB-Anhang-Praxis,
Controlling-Kennzahlenliteratur).

## TL;DR

1. **Ja, üblich.** „Personalaufwand je Mitarbeiter" ist eine etablierte
   Controlling-Kennzahl (Controlling-Portal, Haufe); die Rückrechnung
   (Köpfe ≈ Personalaufwand / Ø-Arbeitskosten) ist dieselbe Formel
   invertiert. Der Gesetzgeber paart die Größen selbst: die UGB-Anhangangabe
   ist ausdrücklich **als Vollzeitäquivalent** zu machen, „um eine Verbindung
   mit dem Personalaufwand je Arbeitnehmer herstellen zu können" (trend.at
   zur UGB-Anhangpraxis).
2. **Der offizielle Divisor existiert öffentlich:** Statistik Austria
   publiziert je ÖNACE-Branche die Arbeitskosten **je Arbeitnehmer:in (Kopf)
   und je Vollzeitäquivalent**, jährlich bzw. alle 4 Jahre (AKE).
3. **Aber:** Bei Kapitalgesellschaften steht die Mitarbeiterzahl meist
   **direkt im Anhang** (Offenlegungspflicht ab kleiner Kapitalgesellschaft,
   § 221 ff UGB-Größenklassen). Die Schätzung ist der *Fallback und
   Plausibilisierer*, nie der erste Griff.

## Primärquellen

### Statistik Austria — Arbeitskostenerhebung (AKE) 2024

Arbeitskosten **inkl. Auszubildende**, EUR/Jahr
(Quelle: `2_AKOE2024_1_Arbeitskosten.ods` von
[statistik.at/…/arbeitskosten](https://www.statistik.at/statistiken/arbeitsmarkt/arbeitskosten-und-tariflohnindex/arbeitskosten/arbeitskosten),
Erstellt 25.08.2026):

| ÖNACE | Branche | je Kopf/Jahr | je VZÄ/Jahr |
|---|---|---:|---:|
| **B–N, P–S** | **Insgesamt** | **65.036** | **74.938** |
| B–F | Produzierend | 75.654 | 80.213 |
| G–N, P–S | Dienstleistung | 60.550 | 72.424 |
| B | Bergbau | 79.742 | 82.865 |
| C | Herstellung von Waren | 76.158 | 81.021 |
| D | Energieversorgung | 107.652 | 112.532 |
| E | Wasser/Abfall | 63.514 | 67.921 |
| F | Bau | 71.733 | 75.486 |
| G | Handel | 54.779 | 64.807 |
| H | Verkehr | 64.556 | 70.468 |
| I | Beherbergung/Gastronomie | 38.235 | 46.194 |
| J | Information/Kommunikation | 95.837 | 105.422 |
| K | Finanz/Versicherung | 99.026 | 113.434 |
| L | Grundstücke/Wohnungen | 65.967 | 76.972 |
| M | Freiberufl./techn. DL | 79.126 | 92.880 |
| N | Sonst. wirtsch. DL | 49.173 | 57.140 |
| P | Erziehung | 59.839 | 81.272 |
| Q | Gesundheit/Soziales | 55.797 | 71.880 |
| R | Kunst/Unterhaltung | 49.475 | 66.818 |
| S | Sonst. DL | 53.219 | 66.021 |

Spreizung Kopf↔VZÄ zeigt den **Teilzeit-Effekt**: Handel 54.779 → 64.807
(+18 %), Gastronomie +21 % — wer Köpfe statt VZÄ schätzt, liegt bei
teilzeitlastigen Branchen systematisch daneben.

### UGB-Anhang: Mitarbeiterzahl ist oft schon offengelegt

- Kapitalgesellschaften (kleine, mittelgroße, große; GmbH + AG) müssen im
  Anhang die **durchschnittliche Zahl der Arbeitnehmer** angeben — als
  **Vollzeitäquivalent** (Teilzeit nur im Ausmaß der Beschäftigungsquote),
  inkl. Lehrlinge, geringfügig Beschäftigte, leitende Angestellte;
  **exkl.** GF/Vorstand, Karenzierte, Präsenzdiener, Leiharbeiter
  ([trend.at, 2022](https://www.trend.at/steuer/mitarbeiterzahl-berechnen)).
- Konsequenz für den Firmenindex: **Anhang/Geschäftsbericht zuerst lesen**
  (hvd-Urkunden, Bilanz-XML), Schätzung nur wenn keine Angabe.

### Kennzahl als etablierte Praxis

- „Durchschnittlicher Personalaufwand" (Personalaufwand / Mitarbeiterzahl)
  ist eine Standard-Kennzahl der Bilanzanalyse
  ([Controlling-Portal](https://www.controllingportal.de/Fachinfo/Kennzahlen/durchschnittlicher-Personalaufwand.html)
  — Beispielrechnung am Lenzing-AG-Jahresabschluss).
- Personalaufwandsquote als Branchen-Benchmark verbreitet
  ([welt-der-bwl.de](https://welt-der-bwl.de/Personalaufwandsquote),
  [business-metrics.net](https://www.business-metrics.net/kennzahl/personalaufwandsquote)).
- D-Parallele: HGB § 285 Abs. 1 Nr. 4 verlangt Mitarbeiterzahl + Personalaufwand
  gemeinsam im Anhang (Haufe Bilanz-Kommentar).

## Genauigkeit der Schätzung

**Als Größenordnung brauchbar (±20–40 %), als exakte Zahl ungeeignet.**

Fehlerquellen, geordnet nach Wirkung:

1. **Kopf vs. VZÄ** — Teilzeitquoten variieren 15–50 % je Branche
   (Gastronomie/Handel hoch). Ohne Korrektur: -15…-25 % bei Teilzeitlern.
2. **Branchenmix** — Firmen mit mehreren ÖNACE-Aktivitäten; Holding ohne
   Personal (Personalaufwand ≈ 0 → Schätzung sinnlos, Tochter-Köpfe fehlen).
3. **Gehaltsniveau** — GF-/Vorstandsvergütungen, Tantiemen, Boni blähen den
   Durchschnitt (Konzernspitzen!). Ein Top-Manager = 5–10 „normale" VZÄ.
4. **Abgrenzung Personalaufwand** — Pensionsaufwand/Altersversorgung teils
   eigene GuV-Position; Abfindungen; geringfügig Beschäftigte.
5. **Jahresdurchschnitt vs. Stichtag** — Saisongeschäfte, Fluktuation.

Best Practice: Schätzung als **Bandbreite** (Ø der Branche ±25 %) und
explizit als „geschätzt aus Personalaufwand (AKE 2024, ÖNACE X, je VZÄ)"
labeln — nie als Fakt.

## Empfehlung für den Firmenindex-Agenten

1. **Quelle zuerst** (bestehende Regel „nichts raten"): Anhang/Bericht auf
   Mitarbeiterzahl prüfen → wenn da: **Fakt** mit Zitat.
2. Fallback **Schätzung**: Personalaufwand (GuV) / AKOE-Divisor der eigenen
   ÖNACE (steht im Firmenindex-Profil!) — **VZÄ-Divisor** verwenden, Ergebnis
   als „≈" mit Bandbreite, Annahme benennen.
3. Plausibilitäts-Kreuzcheck gegen Umsatz je Kopf der Branche möglich.

Die AKOE-Tabelle (oben) ist klein genug, um sie direkt ins Skill zu legen
(aktualisierbar alle 4 Jahre / Jahresstatistik).
