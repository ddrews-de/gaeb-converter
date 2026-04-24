# GAEB Converter

Verarbeitet GAEB-Leistungsverzeichnisse lokal im Browser. Mittelfristiges Ziel ist ein
**GAEB2GAEB-Konverter**, der Dateien der Generationen GAEB 90 (`.d8x`) und GAEB 2000
(`.p8x`) in modernes **GAEB DA XML 3.3** (`.x8x`) umwandelt. Alle Verarbeitung läuft
clientseitig – es werden keine LV-Daten an einen Server übertragen.

## Status

Diese Version ist eine frühe Vorstufe:

- ✅ Upload (Drag & Drop) und Anzeige geparster Positionen
- ✅ XML-GAEB-Parsing (X83) über `DOMParser`
- ✅ Excel-/CSV-Export im Produktionslisten-Format
- ✅ Docker-Setup (Multi-Stage Build, Standalone Output)
- ⚠️ Heuristischer Text-Fallback für Nicht-XML-Dateien (unvollständig, ersetzt durch
  echte Parser in der nächsten Iteration)
- ⛔ **Keine** echte Konvertierung nach GAEB DA XML 3.3 (in Entwicklung,
  siehe [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md))
- ⛔ **Kein** korrekter Parser für GAEB 90 (`.d8x`) oder GAEB 2000 (`.p8x`)
- ⛔ **Kein** Encoding-Handling für Windows-1252/CP437 (Umlaute gehen derzeit verloren)

## Unterstützte Formate (Zielbild nach Umsetzung des Plans)

| DA | Zweck | GAEB 90 (in) | GAEB 2000 (in) | GAEB DA XML 3.3 (in/out) |
|----|-------|:---:|:---:|:---:|
| 81 | Kostenanschlag      | `.d81` | `.p81` | `.x81` |
| 82 | Kostenberechnung    | `.d82` | `.p82` | `.x82` |
| 83 | LV-Ausschreibung    | `.d83` | `.p83` | `.x83` |
| 84 | Angebotsabgabe      | `.d84` | `.p84` | `.x84` |
| 85 | Nebenangebot        | `.d85` | `.p85` | `.x85` |
| 86 | Auftragserteilung   | `.d86` | `.p86` | `.x86` |

Die DA-Nummer bleibt beim Konvertieren erhalten (`projekt.d83` → `projekt.x83`).

## Tech-Stack

- Next.js 16 (App Router, Standalone Output)
- React 19, TypeScript 5
- Tailwind CSS 4
- xlsx 0.18 (Excel-Export)

## Schnellstart

```bash
npm install
npm run dev
```

Anschließend http://localhost:3000 öffnen.

Weitere Scripts:

```bash
npm run build   # Production-Build
npm run start   # Production-Server
npm run lint    # ESLint
```

## Docker

Das Projekt ist als Docker-Image gepackt (Multi-Stage, `node:22-alpine`, Non-Root-User,
Standalone-Output, ~150 MB). Details in [`DOCKER.md`](DOCKER.md).

```bash
docker-compose up -d --build
```

## Architektur (Zielbild)

```
Upload (FileUpload)
    │  ArrayBuffer
    ▼
encoding.ts ── TextDecoder(windows-1252 / cp437 / utf-8)
    │
    ▼
detect.ts ── Endung + Magic-Sniff ──► { generation, da }
    │
    ├─► parsers/gaeb90.ts      (Satzkennungen 00/01/11/20/21/25/26/27/99)
    ├─► parsers/gaeb2000.ts    (K/G/T/P/Z/E)
    └─► parsers/gaebXml.ts     (DA XML 3.x via DOMParser)
             │
             ▼
      GaebDocument (gemeinsames Domain-Modell, types.ts)
             │
             ├─► serializer/gaebXml33.ts ──► GAEB DA XML 3.3 (Blob-Download)
             └─► legacy/toViewModel.ts   ──► Viewer + Excel-Export
```

Alle Module werden unter `app/lib/gaeb/` angesiedelt. Der aktuelle
`app/lib/gaeb-parser.ts` wird schrittweise zurückgebaut und dient am Ende nur noch als
rückwärtskompatibler Shim für die bestehenden UI-Komponenten.

## Grenzen der Konvertierung

- **Langtext-Formatierung** (Fett/Kursiv via Steuercodes `~B~`, `~K~`, `~U~` oder
  `\B`, `\K`) wird best-effort übernommen; Abweichungen werden als
  `ConversionWarning` protokolliert.
- **REB-Binärformate** (`.d11`, `.d12` – Aufmaß) werden nicht unterstützt.
- **XSD-Validierung** gegen das offizielle GAEB-3.3-Schema ist nicht integriert
  (Schema nicht frei redistributierbar); Strukturprüfung erfolgt per Goldfile-Diff.
- **Bieterangaben (DA 84/85)** werden als LV durchgereicht; echte Roundtrip-Preise im
  Bieterblock sind Folgearbeit.

## Roadmap

- [ ] Echte Parser für GAEB 90 (`.d8x`) und GAEB 2000 (`.p8x`)
- [ ] Encoding-Handling (Windows-1252 / CP437) für Legacy-Formate
- [ ] Serializer nach GAEB DA XML 3.3 mit Download-Button
- [ ] Vitest + Fixture-basierte Unit- und Roundtrip-Tests
- [ ] WebWorker für LVs > 50 MB
- [ ] Optionale Server-Route (`app/api/convert`) für Batch-Konvertierung
- [ ] XSD-Validierung (lokales Schema)
- [ ] ÖNORM B2063 Import

## Dokumentation

- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) – Detaillierter
  Implementierungsplan für den GAEB2GAEB-Converter (Modul-Layout, Satzkennungen,
  Test-Strategie).
- [`DOCKER.md`](DOCKER.md) – Docker-Deployment, Compose, Scaling, Troubleshooting.

## Lizenz

Noch nicht festgelegt.
