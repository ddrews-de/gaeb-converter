/**
 * Make `DOMParser` available on the global scope in Node.
 *
 * The browser provides it natively; Node does not. The library code in
 * `app/lib/gaeb` (parsers/gaebXml.ts, validate.ts) calls `new DOMParser()`
 * directly, so anything that runs the same code outside a browser — the
 * Vitest suite, the API route, this CLI — needs to install a polyfill
 * once before the first call.
 *
 * `@xmldom/xmldom`'s DOMParser is structurally compatible with the WHATWG
 * one for the subset we use (parseFromString + standard Node traversal).
 */

import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

if (typeof globalThis.DOMParser === 'undefined') {
  (globalThis as unknown as { DOMParser: typeof XmlDomParser }).DOMParser =
    XmlDomParser;
}
