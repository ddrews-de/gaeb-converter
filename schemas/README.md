# GAEB DA XML 3.3 Schemas

Dieser Ordner ist der Default-Ablageort für die offiziellen
GAEB-DA-XML-3.3-XSDs. Die Schemas sind **nicht im Repo enthalten** —
der GAEB Bundesverband gewährt keine Redistribution.

## Bezugsquelle

https://www.gaeb.de/de/service/downloads/gaeb-datenaustausch/

Dort werden die Schemas in mehreren Zip-Paketen angeboten, jedes für
einen Themenbereich. Für unseren GAEB2GAEB-Konverter (Zielformat XML 3.3,
DA 81–86) reicht das **Leistungsverzeichnis-Paket** „2021-05_Leistungsverzeichnis".
Wer auch Mengen, Rechnung, Zeitvertrag oder Kosten/Kalkulation validieren
möchte, kann die weiteren Pakete ebenfalls hier ablegen.

## Erwartete Verzeichnisstruktur

Die Zip-Dateien enthalten je einen Unterordner — diese Ordnernamen
verwendet auch der Validator zur Auflösung. Nach dem Entpacken:

```
schemas/
├── 2021-05_Beta/
│   ├── GAEB_DA_XML_61_3.3_2021-05_Beta.xsd
│   ├── GAEB_DA_XML_84P_3.3_2021-05_Beta.xsd
│   ├── GAEB_DA_XML_98_3.3_2021-05_Beta.xsd
│   ├── GAEB_DA_XML_99_3.3_2021-05_Beta.xsd
│   └── GAEB_DA_XML_Lib_3.3_2021-05.xsd
├── 2021-05_Handel/
│   ├── GAEB_DA_XML_93_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_94_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_96_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_97_3.3_2021-05.xsd
│   └── GAEB_DA_XML_Lib_3.3_2021-05.xsd
├── 2021-05_Kosten_und_Kalkulation/
│   ├── GAEB_DA_XML_50_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_50.1_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_50.2_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_51_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_51.1_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_51.2_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_52_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_Lib5x_3.3_2021-05.xsd
│   └── GAEB_DA_XML_Lib_3.3_2021-05.xsd
├── 2021-05_Leistungsverzeichnis/        ← für DA 81–86
│   ├── GAEB_DA_XML_80_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_81_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_82_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_83_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_84_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_85_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_86_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_87_3.3_2021-05.xsd
│   └── GAEB_DA_XML_Lib_3.3_2021-05.xsd
├── 2021-05_Rechnung/
│   ├── GAEB_DA_XML_89_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_89B_3.3_2021-05.xsd
│   └── GAEB_DA_XML_Lib_3.3_2021-05.xsd
├── 2021-05_Zeitvertrag/
│   ├── GAEB_DA_XML_83Z_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_84Z_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_86ZE_3.3_2021-05.xsd
│   ├── GAEB_DA_XML_86ZR_3.3_2021-05.xsd
│   └── GAEB_DA_XML_Lib_3.3_2021-05.xsd
└── 2023-01_Mengenermittlung/
    ├── GAEB_DA_XML_31_3.3_2023-01.xsd
    └── GAEB_DA_XML_Lib_3.3_2021-05.xsd
```

## Auflösung im Validator

`validateGaebXml33WithXsd()` nimmt die DA-Nummer aus dem `GaebDocument`
(oder aus den Optionen) und sucht das passende XSD nach folgender Logik:

| DA | XSD-Pfad |
|----|----------|
| 81–86, 80, 87 | `2021-05_Leistungsverzeichnis/GAEB_DA_XML_<DA>_3.3_2021-05.xsd` |
| 89, 89B | `2021-05_Rechnung/…` |
| 93–97 | `2021-05_Handel/…` |
| 50–52 | `2021-05_Kosten_und_Kalkulation/…` |
| sonst | per `masterFileName`-Option oder Fallback `GAEB_DA_XML_Lib_3.3_2021-05.xsd` |

Standardpfad ist dieser Ordner (`./schemas`); überschreibbar per
`GAEB_XSD_DIR`-ENV oder `xsdDir`-Option.

## Setup-Schritte (lokal)

1. Pakete von gaeb.de herunterladen
2. Inhalt der Zips direkt in `schemas/` entpacken (die Unterordnernamen
   müssen den oben aufgeführten entsprechen)
3. `validateGaebXml33WithXsd()` oder die CLI mit `--validate --xsd` nutzen

## Setup-Schritte (Docker)

`docker-compose.yml` mountet diesen Ordner per Default nach `/schemas`
im Container. Lege die XSDs auf dem Host wie oben ab und sie sind dem
Container automatisch verfügbar.
