/**
 * Domain model for the GAEB2GAEB converter.
 *
 * A single `GaebDocument` represents a bill of quantities regardless of the
 * source generation (GAEB 90 `.d8x`, GAEB 2000 `.p8x` or GAEB DA XML `.x8x`).
 * Parsers produce this shape; the XML 3.3 serializer consumes it.
 */

export type DANumber = 81 | 82 | 83 | 84 | 85 | 86;

export type Generation = 'gaeb90' | 'gaeb2000' | 'gaebXml';

export type SourceEncoding = 'utf-8' | 'windows-1252' | 'cp437';

export type Currency = 'EUR' | 'DM';

export interface GaebDocument {
  da: DANumber;
  generation: Generation;
  sourceEncoding?: SourceEncoding;
  prjInfo: ProjectInfo;
  award: Award;
  warnings: ConversionWarning[];
}

export interface ProjectInfo {
  name?: string;
  label?: string;
  clientRef?: string;
  creationDate?: string;
  currency?: Currency;
}

export interface Award {
  oZMask?: string;
  boq: BoqNode[];
}

export type BoqNode = BoqCtgy | BoqItem;

export interface BoqCtgy {
  kind: 'ctgy';
  rNoPart: string;
  label: string;
  children: BoqNode[];
}

export type ItemType =
  | 'normal'
  | 'alternative'
  | 'optional'
  | 'lumpSum'
  | 'hourly';

export interface PriceComponents {
  labor?: number;
  material?: number;
  equipment?: number;
  other?: number;
}

export interface BoqItem {
  kind: 'item';
  rNoPart: string;
  rNoFull: string;
  shortText: string;
  longText?: LongTextBlock[];
  qty?: number;
  qu?: string;
  unitPrice?: number;
  totalPrice?: number;
  priceComponents?: PriceComponents;
  itemType: ItemType;
  isBedarfsposition?: boolean;
  subItems?: BoqItem[];
}

export type LongTextBlockKind = 'paragraph' | 'outline' | 'list';

export interface LongTextBlock {
  kind: LongTextBlockKind;
  runs: TextRun[];
}

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export type WarningSeverity = 'info' | 'warn' | 'error';

export interface ConversionWarning {
  severity: WarningSeverity;
  code: string;
  message: string;
  line?: number;
}
