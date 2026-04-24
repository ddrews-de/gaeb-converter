/**
 * Constants and trivial helpers shared by the GAEB DA XML 3.3 serializer.
 */

import type { DANumber } from '../types';

export const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8"?>';
export const GAEB_XML_33_VERSION = '3.3';

export function gaebXml33Namespace(da: DANumber): string {
  return `http://www.gaeb.de/GAEB_DA_XML/DA${da}/${GAEB_XML_33_VERSION}`;
}

/**
 * Escapes a text node or attribute value for XML output. Only the five
 * predefined XML entities are emitted — GAEB DA XML 3.3 consumers accept
 * UTF-8 so we never need numeric character references for umlauts.
 */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats a numeric value for XML output: dot as decimal separator,
 * trailing zeros trimmed, but preserve at least one decimal digit if the
 * original value had any decimals at all (matches the 1.000 / 1.5 style
 * that production exporters use).
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return `${n}.000`;
  // Max 3 decimals matches the GAEB 90 implied-precision field.
  return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
