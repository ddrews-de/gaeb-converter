/**
 * Legacy view-model shape consumed by {@link GAEBViewer} and
 * {@link ExcelExporter}.
 *
 * Historically this file also contained a ~500-line heuristic parser
 * (`GAEBParser.parse`). That parser has been replaced by the dedicated
 * generation-specific parsers under `app/lib/gaeb/parsers/` and the
 * `GaebDocument` domain model. Everything on this path goes through
 * `app/lib/gaeb/legacy/toViewModel.ts`, which produces the shape below.
 *
 * Only the types remain so the existing viewer / exporter components
 * keep compiling without changes.
 */

export interface GAEBHeader {
  version?: string;
  project?: string;
  description?: string;
  date?: string;
  format?: string;
}

export interface GAEBPosition {
  id: string;
  positionNumber?: string;
  title: string;
  description?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  level: number;
  parent?: string;
  children?: string[];
  type: 'title' | 'position' | 'text' | 'calculation';
}

export interface GAEBData {
  header: GAEBHeader;
  positions: GAEBPosition[];
  rawContent: string;
  fileName: string;
  processedAt: string;
  totalPositions: number;
}
