# Plan: Aktuelle README + GAEB2GAEB-Converter (GAEB 90/2000 → GAEB DA XML 3.3)

## Context

Das Repo `gaeb-converter` ist ein Next.js-16 / React-19 / TypeScript-5 / Tailwind-4-Projekt mit Docker-Setup. Aktuell existiert nur ein **heuristischer** Parser (`app/lib/gaeb-parser.ts`, ~520 Zeilen), der XML-GAEB-Dateien mit `DOMParser` liest und ansonsten regex-basiert rät — **es gibt keinen echten Parser für GAEB 90 (.d8x) oder GAEB 2000 (.p8x)**, und keine Serialisierung nach modernem GAEB DA XML 3.3. Zusätzlich liest `FileReader.readAsText(..., 'utf-8')` die typisch Windows-1252/CP437-kodierten Legacy-Dateien falsch, wodurch Umlaute zerstört werden.

Ziel: Ein echter **GAEB2GAEB-Converter**, der Leistungsverzeichnisse der DA-Typen 81–86 aus GAEB 90 und GAEB 2000 einliest und als **GAEB DA XML 3.3** herunterladbar macht, vollständig clientseitig. Zusätzlich eine neue, projektspezifische `README.md`, die den Standard-Next.js-Boilerplate-Text ersetzt.

## Supported Formats (Zielmatrix)

| DA | Zweck | In: GAEB 90 | In: GAEB 2000 | In/Out: XML |
|----|-------|-------------|---------------|-------------|
| 81 | Kostenanschlag | .d81 | .p81 | .x81 |
| 82 | Kostenberechnung | .d82 | .p82 | .x82 |
| 83 | LV-Ausschreibung | .d83 | .p83 | .x83 |
| 84 | Angebotsabgabe | .d84 | .p84 | .x84 |
| 85 | Nebenangebot | .d85 | .p85 | .x85 |
| 86 | Auftragserteilung | .d86 | .p86 | .x86 |

Die DA-Nummer bleibt beim Konvertieren erhalten (`tiny.d83` → `tiny.x83`).

## Architektur

Neue Modul-Struktur unter `app/lib/gaeb/`:

```
app/lib/gaeb/
├── index.ts                 Fassade: parse(), serialize(), convert()
├── types.ts                 Domain-Modell (GaebDocument, BoqNode, LongTextBlock, ...)
├── detect.ts                Format-Detection (Endung + Magic-Sniff)
├── encoding.ts              ArrayBuffer → Text via TextDecoder (win1252/cp437/utf-8)
├── parsers/
│   ├── shared.ts            OZ-Maske, Hierarchie-Stack, de-DE Zahlparser
│   ├── gaeb90.ts            Satzkennungen 00/01/02/11/15/20/21/25/26/27/99
│   ├── gaeb2000.ts          K/G/L/T/TE/P/Z/B/E
│   └── gaebXml.ts           Extrahiert aus bestehendem parseXMLGAEB
├── serializer/
│   ├── gaebXml33.ts         GaebDocument → GAEB DA XML 3.3 (Template-Strings)
│   ├── xmlTemplates.ts      Namespace + Skeleton pro DA-Typ
│   └── longtext.ts          TextRuns → <CompleteText>/<OutlineText>/<DetailTxt>
├── legacy/
│   └── toViewModel.ts       GaebDocument → GAEBData (alter Viewer/Excel-Shape)
├── __fixtures__/            tiny.d83, tiny.p83, tiny.x83, tiny.d83.expected.x83
└── __tests__/               encoding, detect, gaeb90, gaeb2000, gaebXml, roundtrip
```

Datenfluss: Upload → `encoding.readGaebFile()` → `detect.detectFormat()` → Parser (90/2000/XML) → `GaebDocument` → `serialize()` → XML-Blob-Download; parallel `toViewModel()` für bestehenden Viewer/Excel-Export.

**Entscheidung: alles clientseitig** (Privacy, schlankes Docker-Image, `TextDecoder`/`DOMParser` nativ verfügbar). Eine `app/api/convert/route.ts` bleibt optionales Roadmap-Item für sehr große LVs.

## Domain-Modell (Kernausschnitt, `app/lib/gaeb/types.ts`)

```ts
export type DANumber = 81 | 82 | 83 | 84 | 85 | 86;
export type Generation = 'gaeb90' | 'gaeb2000' | 'gaebXml';

export interface GaebDocument {
  da: DANumber;
  generation: Generation;
  sourceEncoding?: 'utf-8' | 'windows-1252' | 'cp437';
  prjInfo: ProjectInfo;      // name, label (Vergabenr.), clientRef, creationDate, currency
  award: { oZMask?: string; boq: BoqNode[] };
  warnings: ConversionWarning[];
}
export type BoqNode = BoqCtgy | BoqItem;
export interface BoqItem {
  kind: 'item'; rNoPart: string; rNoFull: string;
  shortText: string; longText?: LongTextBlock[];
  qty?: number; qu?: string; unitPrice?: number; totalPrice?: number;
  priceComponents?: { labor?: number; material?: number; equipment?: number; other?: number };
  itemType: 'normal' | 'alternative' | 'optional' | 'lumpSum' | 'hourly';
  isBedarfsposition?: boolean; subItems?: BoqItem[];
}
export interface LongTextBlock { kind: 'paragraph'|'outline'|'list'; runs: TextRun[] }
export interface TextRun { text: string; bold?: boolean; italic?: boolean; underline?: boolean }
```

Das bestehende `GAEBData`/`GAEBPosition`-Shape wird via `legacy/toViewModel.ts` (Flattening mit `level`) weiterhin bedient; `GAEBViewer.tsx` und `excel-exporter.ts` bleiben **unverändert**.

## GAEB 90 Parser — Satzkennungen (Spaltenfeste Felder)

| Kennung | Feld-Auszug | Mapping |
|---|---|---|
| 00 | Datenart (3-5), Version (6-8), Datum (9-16), Erzeuger | `doc.da`, `prjInfo.creationDate` |
| 01 | Projektname (3-32), Kurztext (33-72) | `prjInfo.name`, `prjInfo.label` |
| 02 | Vergabenummer (3-22) | `prjInfo.clientRef` |
| 11 | OZ (3-11), Titel (12-71) | `BoqCtgy` |
| 20 | Währung (3-6), OZ-Maske (7-15) | `award.oZMask`, `prjInfo.currency` |
| 21 | OZ, Menge, Einheit, EP, GP, Bedarfs-Kz, Art | `BoqItem` Basis |
| 25 | Kurztext (≤60 Zeichen) | `BoqItem.shortText` |
| 26 | Langtext-Zeile, Steuercodes `~B~`/`~K~`/`~U~` | `BoqItem.longText` (strukturiert) |
| 27 | Unterbeschreibung pro Sub-Item | `BoqItem.subItems[].longText` |
| 99 | Ende | Abschluss |

OZ-Maske (z. B. `11PP NNNN`) aus Satz 20 steuert die Hierarchie-Rekonstruktion via Stack in `parsers/shared.ts`. Unbekannte Satzkennungen → `warnings` mit `code:'UNKNOWN_RECORD'`.

## GAEB 2000 Parser

Zeilenorientiert mit 1-Zeichen-Kennung + `;`-Trennung. Relevant: `K` (Kopf/DA/OZ-Maske), `G`/`L` (Gliederung/Los), `T`…`TE` (Textblock, mehrere Zeilen), `P` (Position), `Z` (Preisanteile Lohn/Stoff/Gerät/Sonstige), `B` (Bieterangaben bei DA 84/85), `E` (Ende). Formatierungs-Tags `<B>…</B>` im Textblock fließen in `TextRun`.

## Encoding-Handling (`app/lib/gaeb/encoding.ts`)

- `useGAEBProcessor.ts` stellt von `readAsText(file,'utf-8')` auf `readAsArrayBuffer` um.
- Reihenfolge: `.x8x` oder `<?xml`-Prefix → UTF-8; `.d8x`/`.p8x`/`.gaeb` → Windows-1252 Default.
- Fallback-Scoring: Mismatches (`Ã¤`, `Ã¶` → Double-Encode-UTF-8; Hochbytes > 0xF5 gehäuft → CP437).
- `TextDecoder('windows-1252')` / `'ibm437'` sind browser- und Node-20-nativ → **keine neue Dependency**. CRLF → LF nach Dekodierung.

## XML-Serializer (`app/lib/gaeb/serializer/gaebXml33.ts`)

**Reine Template-Strings + Escape-Helfer**, keine Library: kleineres Bundle, deterministische Attributreihenfolge (GAEB-Validatoren sind empfindlich), volle Kontrolle über `xml:space="preserve"` in Langtexten.

Skeleton:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA_XML_33/Version_3.3">
  <GAEBInfo><Version>3.3</Version><Date>…</Date><ProgSystem>gaeb-converter</ProgSystem></GAEBInfo>
  <PrjInfo>…</PrjInfo>
  <Award><Cur>EUR</Cur><BoQ><BoQBody><BoQCtgy RNoPart="01">…</BoQCtgy></BoQBody></BoQ></Award>
</GAEB>
```

DA-Mapping: 81→Estimate, 83→Tendering, 84→Offer (mit Bieterpreisen), 86→Contract — Konstanten-Tabelle in `xmlTemplates.ts`. Langtext → `<CompleteText><OutlineText>`/`<DetailTxt>` mit `<p><span bold="true">`. Dezimaltrenner Punkt (XML-Konvention).

## UI-Änderungen

- **`app/components/FileUpload.tsx`**: `validExtensions` auf alle 19 Endungen (.gaeb, .d81–.d86, .p81–.p86, .x81–.x86); `accept`-Attribut analog; Hilfetext aktualisieren.
- **`app/hooks/useGAEBProcessor.ts`**: nutzt `readGaebFile` + `convert()`; State hält `{ doc, xml, legacyViewModel }`.
- **Neu `app/components/ConvertDownload.tsx`**: Button „Als GAEB XML 3.3 herunterladen" (`Blob`+`URL.createObjectURL`+`targetFileName`), Badge „Quellformat D83 → Zielformat X83", Warnings-Liste.
- **`app/page.tsx`**: `ConvertDownload` neben `ExportComponent` einbinden.
- **`GAEBViewer.tsx` + `excel-exporter.ts`**: unverändert (lesen legacy ViewModel).

## Tests (Vitest)

- Neue Files: `vitest.config.ts`, `package.json`-Scripts `test`, `test:watch`; Dev-Deps: `vitest`, `@vitest/ui`, `happy-dom` (DOMParser in Node).
- Testdateien gespiegelt zur Source-Struktur unter `app/lib/gaeb/__tests__/`.
- Fixtures unter `app/lib/gaeb/__fixtures__/`: handgeschriebene Mini-LVs (<2 kB je Datei) mit je 1 Kategorie + 2 Items, bewusst mit Umlauten zum Encoding-Test; Goldfile `tiny.d83.expected.x83` für Roundtrip-Diff (DOM-Vergleich, whitespace-tolerant).
- Path-Alias `@/*` via `vite-tsconfig-paths` auflösen.

## Neue README.md (ersetzt Next.js-Boilerplate)

Abschnitte in dieser Reihenfolge: (1) Pitch „GAEB 90/2000 → GAEB DA XML 3.3, lokal im Browser"; (2) Features (DA 81–86, Windows-1252-fähig, offline, keine Uploads); (3) **Unterstützte Formate** (Tabelle aus diesem Plan); (4) Schnellstart `npm install && npm run dev` (Port 3000); (5) Docker (Verweis auf `DOCKER.md` + `docker-compose up -d --build`); (6) Tests (`npm test`); (7) Architektur (ASCII-Diagramm: Upload → detect → parse → Domain → serialize → Download, Verweis auf `app/lib/gaeb/`); (8) **Grenzen der Konvertierung** (Langtext-Formatierung best-effort, REB-Binärformate nicht unterstützt, Steuercode-Dialekte); (9) Roadmap (WebWorker, Server-API, XSD-Validierung, ÖNORM-Import); (10) Lizenz/Credits.

## Critical Files

- `app/lib/gaeb/index.ts` (neu) — Fassade
- `app/lib/gaeb/types.ts` (neu) — Domain-Modell
- `app/lib/gaeb/encoding.ts` (neu) — ArrayBuffer + TextDecoder
- `app/lib/gaeb/detect.ts` (neu) — Endung + Magic-Sniff
- `app/lib/gaeb/parsers/gaeb90.ts` (neu) — Satzkennungen 00/01/11/20/21/25/26/27/99
- `app/lib/gaeb/parsers/gaeb2000.ts` (neu) — K/G/T/P/Z/E
- `app/lib/gaeb/parsers/gaebXml.ts` (migriert aus `app/lib/gaeb-parser.ts::parseXMLGAEB`)
- `app/lib/gaeb/serializer/gaebXml33.ts` (neu) — XML-Output
- `app/lib/gaeb/serializer/longtext.ts` (neu) — Runs → `<span bold="true">`
- `app/lib/gaeb/legacy/toViewModel.ts` (neu) — Adapter fürs alte ViewModel
- `app/lib/gaeb-parser.ts` (reduziert zu Thin-Shim, re-exportiert Legacy-Typen)
- `app/hooks/useGAEBProcessor.ts` (umgebaut: ArrayBuffer + convert())
- `app/components/FileUpload.tsx` (akzeptierte Endungen + accept-Attribut)
- `app/components/ConvertDownload.tsx` (neu)
- `app/page.tsx` (ConvertDownload einbinden)
- `README.md` (vollständig neu geschrieben)
- `vitest.config.ts` + `package.json` (Test-Setup)
- `app/lib/gaeb/__fixtures__/tiny.d83`, `tiny.p83`, `tiny.x83`, `tiny.d83.expected.x83`

## Implementierungsschritte (jeder = ein Commit)

1. Ordnergerüst + `types.ts` + `index.ts` (Stubs).
2. `encoding.ts` + Test; `useGAEBProcessor.ts` auf ArrayBuffer umstellen (noch über Legacy-Parser, funktional äquivalent).
3. `detect.ts` + Test.
4. `parsers/gaebXml.ts` aus Altcode extrahieren + Test gegen `tiny.x83`; Legacy-Shim delegiert an neue Fassade.
5. `legacy/toViewModel.ts` — Viewer + Excel laufen jetzt über neues Domain-Modell.
6. `parsers/gaeb90.ts` + Fixture `tiny.d83` + Test.
7. `parsers/gaeb2000.ts` + Fixture `tiny.p83` + Test.
8. `serializer/gaebXml33.ts` + `longtext.ts` + `xmlTemplates.ts` + Roundtrip-Test gegen Goldfile.
9. `FileUpload.tsx` akzeptiert alle 19 Endungen.
10. `ConvertDownload.tsx` + Einbindung in `page.tsx`.
11. Heuristischen Textparser in `app/lib/gaeb-parser.ts` entfernen (nur noch Shim).
12. `README.md` komplett neu schreiben.
13. Vitest-Setup + CI-Script in `package.json`.

Schritte 1–5 sind rückwärtskompatibel (UI verhält sich unverändert); ab 6 beginnt die neue Funktionalität.

## Verifikation

- **Unit/Integration**: `npm test` muss grün sein (Encoding, Detect, drei Parser, Roundtrip Goldfile).
- **Manuell lokal**: `npm run dev` → http://localhost:3000 → je ein `tiny.d83`, `tiny.p83`, `tiny.x83` hochladen → Viewer zeigt je 1 Kategorie + 2 Items, „Als GAEB XML 3.3 herunterladen" liefert `tiny.x83` mit korrekten Umlauten; Warnings-Liste leer oder nur `info`.
- **Manuell Docker**: `docker-compose up -d --build` → Port 3000 → gleicher Smoke-Test.
- **Lint/Build**: `npm run lint && npm run build` ohne Fehler; Standalone-Output läuft in Docker.

## Risiken & offene Fragen (vor Start klären)

- **Langtext-Formatierung**: Steuerzeichen-Dialekte (`~B~` vs. `\B` etc.) variieren je Erzeuger-Software → Default „best-effort, Text erhalten, Abweichungen als Warning", oder harte Anforderung auf exakte Fett/Kursiv-Wiedergabe?
- **OZ-Masken-Fallback** wenn Satz 20/K-Satz fehlen: Vorschlag Default `11PP NNNN` (drei Ebenen + Position).
- **DA 84/85 Bieterangaben** (Preise + Preisanteile): Nur LV durchreichen oder komplett mit Bieterblock? Für echten Roundtrip nötig, mehr Parser-Arbeit.
- **xlsx-Export-Rolle**: Bleibt als Sekundär-Feature (Werkstatt-Produktionsliste) sichtbar, der neue XML-Download wird primäre CTA.
- **REB-Binärformate** (.d11/.d12): ausdrücklich nicht im Scope — in README-„Grenzen" dokumentieren.
- **XSD-Validierung**: offizielles GAEB-3.3-Schema nicht frei redistributierbar → Phase 1 schema-los (Goldfile-Diff), optional später `libxmljs2` mit lokalem Schema.
- **Große LVs (>50 MB)** blockieren Main-Thread → WebWorker-Migration als Roadmap-Item.
- **Next.js 16 + Vitest**: Pfad-Alias `@/*` via `vite-tsconfig-paths` sicherstellen; Alternative `node --test` verworfen wegen schlechter DX.
