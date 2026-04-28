# GAEB Converter

Konvertiert GAEB-Leistungsverzeichnisse der Generationen **GAEB 90** (`.d8x`) und
**GAEB 2000** (`.p8x`) lokal im Browser oder via HTTP-Endpoint in modernes
**GAEB DA XML 3.3** (`.x8x`). Eingangsseitig werden zusätzlich GAEB DA XML 3.1
und 3.2 verstanden. Alle Verarbeitung läuft standardmäßig clientseitig — es
werden keine LV-Daten an einen fremden Server übertragen.

## Features

### Eingabe

- Upload (Drag & Drop) von GAEB 90, GAEB 2000 und GAEB DA XML (Versionen 3.1 /
  3.2 / 3.3), DA-Nummern 81–86
- Generische Endung `.gaeb`: Generation und DA-Nummer werden per Magic-Byte-
  Sniffing erkannt
- Encoding-Auto-Detection UTF-8 / Windows-1252 / **CP437** (alte DOS-Exporte —
  Umlaute überleben den Round-Trip)
- Strukturierter Parser pro Generation, keine Heuristik
- GAEB-90-**Langtext-Steuercodes** (`~B~`/`~K~`/`~U~`/`~N~`) als Fett/Kursiv/
  Unterstrichen geparst
- `T0`/`T1`/`T9`-**Preamble-Blöcke** vor dem eigentlichen GAEB-90-LV werden
  übersprungen (Flechtingen-Dialekt)
- **Preisanteile** Lohn / Stoff / Gerät / Sonstige in allen drei Parsern (GAEB-90
  Satz 22, GAEB-2000 `[EPLohn]`/`[EPStoff]`/`[EPGeraet]`/`[EPSonst]` bzw.
  `[EPAnteil1..4]`, XML `<UPComp Label="…">`)

### Ausgabe

- Download als **GAEB DA XML 3.3** mit erhaltener DA-Nummer
  (`LV_Los01.d83` → `LV_Los01.X83`)
- **Konvertierungsprotokoll** `<base>.audit.txt` mit Header-Metadaten,
  BoQ-Baum und nach Severity gruppierten Warnungen
- **Positionsliste als CSV** mit eigenen Spalten für EP, GP und die vier
  Preisanteile (Lohn / Stoff / Gerät / Sonstige); öffnet sich nativ in
  Excel, LibreOffice und Numbers

### UI

- Viewer mit Kurz-/Langtext, Menge/Einheit/Preis und hierarchischer Gliederung
- Per-File-Cards mit Severity-Badges (Fehler / Warnungen / Hinweise) und
  prominenten Inline-Warnungen, default-geöffnet bei Fehlern
- WebWorker für die Parse+Convert-Pipeline — UI bleibt bei großen LVs
  interaktiv; synchroner Fallback in Umgebungen ohne `Worker`

### Validierung

- Schemaloser Struktur-Validator `validateGaebXml33()` immer verfügbar
- Optionale strikte XSD-Validierung über `validateGaebXml33WithXsd()` mit
  `libxmljs2` + lokal abgelegten GAEB-3.3-XSDs (beides opt-in)

### HTTP-API

- `POST /api/convert` akzeptiert Raw-Body+`x-filename`-Header oder
  `multipart/form-data`, antwortet mit `application/xml` + passendem
  `Content-Disposition`-Filename
- Fehler als JSON `{ error, code }` (`INVALID_INPUT` / `UNRECOGNIZED_FORMAT` /
  `INTERNAL_ERROR`)
- Daten nur im Speicher, kein Disk-Schreibvorgang

### Infrastruktur

- Docker-Setup (Multi-Stage, `node:22-alpine`, Standalone Output, ~150 MB,
  Non-Root-User)
- 187 Vitest-Unit- und Round-Trip-Tests (+ 2 optionale XSD-Tests, skipped ohne
  Schemas) und 4 Playwright-E2E-Tests für den Browser-Flow

## Unterstützte Formate

| DA | Zweck               | GAEB 90 (in) | GAEB 2000 (in) | GAEB DA XML (in/out) |
|----|---------------------|:---:|:---:|:---:|
| 81 | Kostenanschlag      | `.d81` | `.p81` | `.x81` |
| 82 | Kostenberechnung    | `.d82` | `.p82` | `.x82` |
| 83 | LV-Ausschreibung    | `.d83` | `.p83` | `.x83` |
| 84 | Angebotsabgabe      | `.d84` | `.p84` | `.x84` |
| 85 | Nebenangebot        | `.d85` | `.p85` | `.x85` |
| 86 | Auftragserteilung   | `.d86` | `.p86` | `.x86` |

Plus `.gaeb` mit Magic-Sniffing. Eingangsseitig außerdem GAEB DA XML 3.1 und
3.2. Der Export ist immer 3.3; die DA-Nummer bleibt erhalten.

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
npm run test:e2e     # Playwright End-to-End
                     #   (einmalig: `npx playwright install chromium`)
npm run convert -- … # CLI-Konverter (siehe Abschnitt unten)
```

## Tech-Stack

- Next.js 16 (App Router, Standalone Output)
- React 19, TypeScript 5
- Tailwind CSS 4
- Vitest 4 für Unit- und Round-Trip-Tests, `@xmldom/xmldom` als `DOMParser`-
  Polyfill im Node-Testlauf
- Playwright 1.59 für browserbasierte End-to-End-Tests

## CLI

Für skriptbare Konvertierung ohne Browser oder HTTP-Stack gibt es ein
schlankes Kommandozeilen-Tool, das die gleiche `convert()`-Façade nutzt:

```bash
# Direkt ausführen
npx tsx scripts/cli.ts LV_Los01.D83 out.X83

# Per npm-Script
npm run convert -- LV_Los01.D83 out.X83

# Stdin → Stdout
cat LV_Los01.D83 | npm run convert -- -i LV_Los01.D83 - - > out.X83
```

**Flags:**

| Flag | Bedeutung |
|------|-----------|
| `--audit` | Schreibt zusätzlich `<base>.audit.txt` mit Header, BoQ-Baum und Warnungen |
| `--validate` | Validiert das XML strukturlos und beendet mit Exit 1 bei Fehlern |
| `--quiet` | Unterdrückt Info-Meldungen auf stderr (nur Fehler bleiben sichtbar) |
| `-i`, `--input-name` | Dateiname für die Format-Detection (nötig bei stdin) |
| `-h`, `--help` | Zeigt die Hilfe |

**Exit-Codes:** `0` Erfolg, `1` Anwenderfehler (falsche Args, Format nicht
erkannt, Validation fehlgeschlagen), `2` interner Parser-/Serializer-Fehler.

Output-Default: `<base>.x<DA>` neben der Eingabe; `-` als Output-Pfad
streamt nach stdout.

## HTTP API

`POST /api/convert` — gleicher Conversion-Flow wie die Browser-UI, nur
skriptbar. Zwei Eingabeformen:

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

Antwort: `application/xml` mit `Content-Disposition: attachment; filename=…`,
DA-Nummer bleibt erhalten. Fehler als JSON:

```json
{ "error": "...", "code": "INVALID_INPUT" | "UNRECOGNIZED_FORMAT" | "INTERNAL_ERROR" }
```

Die Daten werden nur im Speicher verarbeitet — nichts landet auf Platte. Für
Privacy-sensible Setups dockerisiert laufen lassen und die Route per
Reverse-Proxy abschirmen.

## Validierung

### Schemalos (immer verfügbar)

`validateGaebXml33(xml)` prüft GAEB-DA-XML-3.3-Output schemalos auf
strukturelle Korrektheit. Nützlich nach `serialize()` oder als Sanity-Check
für fremde XML-Dateien:

```ts
import { validateGaebXml33 } from '@/lib/gaeb';

const result = validateGaebXml33(xml);
if (!result.valid) {
  for (const issue of result.issues) {
    console.error(`[${issue.severity}] ${issue.path}: ${issue.message}`);
  }
}
```

Geprüft werden u. a. Root-Element + Namespace, `<GAEBInfo><Version>`,
`<Award>` mit erkennbarer DA-Nummer (Namespace oder `<DP>`), jede
`<BoQCtgy>` hat `RNoPart` + `<LblTx>`, jedes `<Item>` hat `RNoPart`,
`<Qty>`, `<QU>` und `<Description>`.

### Strikte XSD-Validierung (optional)

`validateGaebXml33WithXsd()` — echter XSD-Check via `libxmljs2`. Weder die
Library noch die GAEB-3.3-XSDs werden mitgeliefert (der GAEB Bundesverband
gewährt keine Redistribution).

```bash
npm install libxmljs2                  # native libxml2-Binding
export GAEB_XSD_DIR=/path/to/schemas   # Master-Datei als GAEB_DA_XML_3.3.xsd
```

```ts
// Wichtig: direkt aus dem Submodul importieren (nicht aus '@/lib/gaeb'),
// weil dieses Modul `node:fs` braucht und sonst im Browser-Bundle landet.
import { validateGaebXml33WithXsd } from '@/lib/gaeb/validate-xsd';

const result = await validateGaebXml33WithXsd(xml, {
  xsdDir: process.env.GAEB_XSD_DIR!,
});
```

Nur in serverseitigen Umgebungen (API-Routen, CLI, Node-Tests) verfügbar.
Fehlt `libxmljs2`, resolved die Funktion trotzdem — mit einem einzelnen
Error, der die nachzurüstenden Schritte nennt. Schemalose Prüfung bleibt der
Default.

## Docker

```bash
docker-compose up -d --build
```

Multi-Stage-Build, Non-Root-User (`nextjs:nodejs`), EXPOSE 3000. Details und
Troubleshooting in [`DOCKER.md`](DOCKER.md).

## Architektur

```
                      ┌─────────────────────────────┐
Browser-UI            │  app/api/convert/route.ts   │  HTTP API
 (app/page.tsx)       └──────────────┬──────────────┘
  │                                  │
  ▼                                  │
FileUpload ─► useGAEBProcessor ─► runConvert (worker/run.ts)
                                     │
                                     ▼
                       worker/convert.worker.ts
                                     │
                                     ▼
               ┌─────────────────────┴───────────────────────┐
               │  app/lib/gaeb/index.ts  (parse / serialize / convert)  │
               └─────────────────────┬───────────────────────┘
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
            encoding.ts (win1252 /     detect.ts (Endung +
              cp437 / utf-8)              Magic-Sniff)
                                     │
     ┌───────────────────────────────┼──────────────────────────────┐
     ▼                               ▼                              ▼
parsers/gaeb90.ts               parsers/gaeb2000.ts           parsers/gaebXml.ts
(Sätze 00/01/02/03/08/11/12/    (#begin[Section] /            (GAEB DA XML 3.1
 20/21/22/25/26/27/31/99,       [Key]value[end])               / 3.2 / 3.3 via
 Preamble-Skip + Steuercodes)                                   DOMParser)
     └───────────────────────────────┼──────────────────────────────┘
                                     ▼
                    GaebDocument  (types.ts — gemeinsames Modell)
                                     │
      ┌──────────────┬───────────────┼───────────────┬──────────────┐
      ▼              ▼               ▼               ▼              ▼
serializer/       audit.ts        excel.ts       validate.ts    legacy/
gaebXml33.ts    (.audit.txt)    (Positionsliste  (schemaloser   toViewModel.ts
(3.3-XML)                        CSV)             Struktur-     (GAEBViewer)
                                                  Check)
                                                 │
                                                 └─► validate-xsd.ts
                                                     (optional via libxmljs2,
                                                      server-only)
```

Alle Module leben unter `app/lib/gaeb/`. Öffentlicher Einstiegspunkt ist
`app/lib/gaeb/index.ts` mit `parse(bytes, fileName)`, `serialize(doc)` und
`convert(bytes, fileName)` sowie den Hilfsfunktionen `buildAuditLog`,
`buildPositionListWorkbook`, `validateGaebXml33` und
`validateGaebXml33WithXsd`.

## Tests

```bash
npm test              # Unit + Round-Trip (Vitest)
npm run test:e2e      # Browser-Tests (Playwright, Chromium)
```

**Vitest (13 Suites / 187 passed / 2 skipped):**
- Synthetische Fixtures pro Modul
- Round-Trip-Tests gegen die echten LVs im Ordner `TestData/`
- Cross-Version-Parity zwischen GAEB XML 3.1, 3.2 und 3.3 desselben LVs
- End-to-end: `.d83`/`.p83` → `GaebDocument` → `GAEB DA XML 3.3` → wieder
  parsen, Item-Zähler stimmen überein; Umlaute aus CP437-Quellen landen
  intakt im XML
- Die 2 skipped Tests sind die strikten XSD-Validator-Cases; sie laufen
  automatisch, sobald `GAEB_XSD_DIR` gesetzt und `libxmljs2` installiert ist

**Playwright (`e2e/`, 4 Specs):** Upload per `<input type="file">`,
XML-Download, Audit-Log-Download, Positionsliste-Export — jeweils mit
echtem Browser-Download-Event. Einmalig: `npx playwright install chromium`.
`npm run test:e2e` fährt automatisch `npm run dev` hoch.

## Grenzen der Konvertierung

- **Preisanteile** werden in allen drei Generationen gelesen und wieder
  serialisiert. Weitergehende DA-84-spezifische Bieterinformationen
  (Zuschlagsfaktoren, Angebots-Metadaten) sind aktuell nicht modelliert.
- **REB-Binärformate** (`.d11`, `.d12` – Aufmaß) werden nicht unterstützt.
- **ÖNORM B2063** (österreichisches LV-Format) wird bewusst nicht importiert
  — ist eigene Format-Familie, bei echtem Bedarf separat anzugehen.
- **Strikte XSD-Konformität** ist nur mit lokal nachgerüsteten GAEB-Schemas
  prüfbar; die schemalose Strukturvalidierung deckt die häufigsten Fehler
  ab, ersetzt aber keinen offiziellen Validator.

## Roadmap

Die im Next-Steps-Plan definierten Epics 1–6 sind umgesetzt. Offen:

- [ ] **ÖNORM B2063 Import** (eigene Format-Familie, bei echtem Bedarf)
- [ ] DA-84-Bieter-Metadaten (Zuschlagsfaktoren etc.) vollständig modellieren
- [ ] GAEB-90-REB (`.d11`/`.d12`) Aufmaß-Formate

## Dokumentation

- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) – der ursprüngliche
  Implementierungsplan und der Next-Steps-Plan für die offenen Roadmap-Epics.
- [`DOCKER.md`](DOCKER.md) – Docker-Deployment, Compose, Scaling,
  Troubleshooting.

## Lizenz

Noch nicht festgelegt.
