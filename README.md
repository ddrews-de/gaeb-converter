# GAEB Converter

Konvertiert GAEB-Leistungsverzeichnisse der Generationen **GAEB 90** (`.d8x`) und
**GAEB 2000** (`.p8x`) lokal im Browser in modernes **GAEB DA XML 3.3** (`.x8x`).
Alle Verarbeitung läuft clientseitig – es werden keine LV-Daten an einen Server
übertragen.

## Features

- ✅ Upload (Drag & Drop) von GAEB 90, GAEB 2000 und GAEB DA XML (Versionen
  3.1, 3.2, 3.3) — DA 81 – 86
- ✅ Encoding-Auto-Detection: UTF-8, Windows-1252 und **CP437** (alte DOS-Exporte).
  Umlaute überleben den Round-Trip.
- ✅ Strukturierter Parser pro Generation, keine Heuristik mehr
- ✅ Download als **GAEB DA XML 3.3** mit erhaltener DA-Nummer
  (`LV_Los01.d83` → `LV_Los01.x83`)
- ✅ Viewer mit Kurz-/Langtext, Menge/Einheit/Preis und hierarchischer Gliederung
- ✅ Excel-/CSV-Export im Produktionslisten-Format
- ✅ 136 Vitest-Cases inkl. Round-Trip-Tests gegen echte LVs
- ✅ Docker-Setup (Multi-Stage, `node:22-alpine`, Standalone Output, ~150 MB)

## Unterstützte Formate

| DA | Zweck | GAEB 90 (in) | GAEB 2000 (in) | GAEB DA XML (in/out) |
|----|-------|:---:|:---:|:---:|
| 81 | Kostenanschlag      | `.d81` | `.p81` | `.x81` |
| 82 | Kostenberechnung    | `.d82` | `.p82` | `.x82` |
| 83 | LV-Ausschreibung    | `.d83` | `.p83` | `.x83` |
| 84 | Angebotsabgabe      | `.d84` | `.p84` | `.x84` |
| 85 | Nebenangebot        | `.d85` | `.p85` | `.x85` |
| 86 | Auftragserteilung   | `.d86` | `.p86` | `.x86` |

Zusätzlich wird die generische Endung `.gaeb` akzeptiert; Generation und
DA-Nummer werden per Magic-Byte-Sniffing erkannt.

Eingabeseitig werden auch **GAEB DA XML 3.1** und **3.2** verstanden. Der
Export ist immer 3.3, die DA-Nummer bleibt erhalten.

## Schnellstart

```bash
npm install
npm run dev
```

Anschließend http://localhost:3000 öffnen.

Weitere Scripts:

```bash
npm run build        # Production-Build
npm run start        # Production-Server
npm run lint         # ESLint
npm test             # Vitest einmalig
npm run test:watch   # Vitest im Watch-Modus
```

## Tech-Stack

- Next.js 16 (App Router, Standalone Output)
- React 19, TypeScript 5
- Tailwind CSS 4
- Vitest 4 für Unit- und Round-Trip-Tests, `@xmldom/xmldom` als DOMParser im
  Node-Testlauf
- `xlsx` 0.18 für den Excel-Export

## HTTP API

Neben der Browser-UI bietet das Projekt einen `POST /api/convert`-Endpoint für
Batch- und CLI-Einsatz. Zwei Eingabeformen werden akzeptiert:

**Raw-Body + `x-filename`-Header** (scriptbar):

```bash
curl -X POST \
  --data-binary @TestData/LV_Los01.D83 \
  -H "x-filename: LV_Los01.D83" \
  http://localhost:3000/api/convert \
  -o LV_Los01.X83
```

**multipart/form-data** (`curl -F`):

```bash
curl -X POST \
  -F "file=@TestData/LV_Los01.P83" \
  http://localhost:3000/api/convert \
  -o LV_Los01.X83
```

Ausgabe ist `application/xml` mit passendem `Content-Disposition`-Header (die
DA-Nummer bleibt erhalten, `.d83`/`.p83` → `.x83` usw.). Fehler kommen als
JSON: `{ "error": "...", "code": "INVALID_INPUT"|"UNRECOGNIZED_FORMAT"|"INTERNAL_ERROR" }`.

Die Daten werden nur im Speicher verarbeitet — es wird nichts auf Platte
gespeichert. Für Privacy-sensible Setups dockerisiert laufen lassen und die
Route per Reverse-Proxy abschirmen.

## Docker

```bash
docker-compose up -d --build
```

Multi-Stage-Build, Non-Root-User (`nextjs:nodejs`), EXPOSE 3000. Details und
Troubleshooting in [`DOCKER.md`](DOCKER.md).

## Architektur

```
Upload (FileUpload)
    │  ArrayBuffer
    ▼
encoding.ts ── TextDecoder(windows-1252 / cp437 / utf-8, auto-detect)
    │
    ▼
detect.ts ── Endung + Magic-Sniff ──► { generation, da }
    │
    ├─► parsers/gaeb90.ts     (Satzkennungen 00/01/02/03/08/11/12/20/21/25/26/27/31/99)
    ├─► parsers/gaeb2000.ts   (#begin[Section]/[Key]value[end] Schlüssel-Wert-Format)
    └─► parsers/gaebXml.ts    (GAEB DA XML 3.1/3.2/3.3 via DOMParser)
             │
             ▼
      GaebDocument (gemeinsames Domain-Modell, types.ts)
             │
             ├─► serializer/gaebXml33.ts ──► GAEB DA XML 3.3 (Blob-Download)
             └─► legacy/toViewModel.ts   ──► Viewer + Excel-Export
```

Alle Module leben unter `app/lib/gaeb/`. Öffentlicher Einstiegspunkt ist
`app/lib/gaeb/index.ts` mit `parse(bytes, fileName)`, `serialize(doc)` und
`convert(bytes, fileName)`.

## Tests

```bash
npm test
```

- Synthetische Fixtures pro Modul
- Round-Trip-Tests gegen die echten LVs im Ordner `TestData/`
- Cross-Version-Parity zwischen GAEB XML 3.1, 3.2 und 3.3 desselben LVs
- End-to-end: `.d83`/`.p83` → `GaebDocument` → `GAEB DA XML 3.3` → wieder parsen,
  Item-Zähler stimmen überein; Umlaute aus CP437-Quellen landen intakt im XML

## Grenzen der Konvertierung

- **Langtext-Formatierung** (Fett/Kursiv) wird best-effort übernommen. Inline
  `<span style="font-weight:bold">` im XML-Zweig funktioniert durchgehend;
  Steuercodes in GAEB-90-Langtexten (`~B~`, `~K~`, `~U~`) werden derzeit nicht
  interpretiert.
- Das Dialekt-Fixture **Flechtingen GS AA.d83** nutzt `T0`/`T1`-Text-Baseline-
  Records statt Satz 00 und wird daher nur mit Warnings geparst; das Standard-
  GAEB-90-Layout der beiden `LV_Los0x.D83`-Fixtures funktioniert vollständig.
- **REB-Binärformate** (`.d11`, `.d12` – Aufmaß) werden nicht unterstützt.
- **XSD-Validierung** gegen das offizielle GAEB-3.3-Schema ist nicht integriert
  (Schema nicht frei redistributierbar); Strukturprüfung erfolgt per
  Round-Trip-Test.
- **Bieterangaben (DA 84/85)** werden als LV durchgereicht. Preise und Preis-
  anteile im Bieter-Block sind noch nicht vollständig modelliert.

## Roadmap

- [ ] Interpretation von GAEB-90-Steuercodes (`~B~`/`~K~`/`~U~`) für
  Fett/Kursiv/Unterstrichen im Langtext
- [ ] Preisanteile Lohn/Stoff/Gerät/Sonstige (`<UPComp>` im XML)
- [ ] WebWorker für LVs > 50 MB
- [ ] Optionale Server-Route (`app/api/convert`) für Batch-Konvertierung
- [ ] XSD-Validierung (lokales Schema)
- [ ] ÖNORM B2063 Import
- [ ] Unterstützung des `T0`/`T1`-GAEB-90-Text-Baseline-Dialekts

## Dokumentation

- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) – ursprünglicher
  Implementierungsplan. Die meisten Schritte sind umgesetzt; verbleibende
  Punkte sind in der Roadmap oben gespiegelt.
- [`DOCKER.md`](DOCKER.md) – Docker-Deployment, Compose, Scaling,
  Troubleshooting.

## Lizenz

Noch nicht festgelegt.
