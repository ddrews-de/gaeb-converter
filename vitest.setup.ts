/**
 * Vitest global setup.
 *
 * Browsers provide `DOMParser` on the window; Node does not. We install the
 * @xmldom/xmldom implementation on the global scope so that production code
 * can call `new DOMParser()` in both environments without branching.
 */

import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

if (typeof globalThis.DOMParser === 'undefined') {
  // xmldom's DOMParser is structurally compatible with the browser DOMParser
  // for the subset we rely on (parseFromString + standard Node traversal).
  (globalThis as unknown as { DOMParser: typeof XmlDomParser }).DOMParser =
    XmlDomParser;
}
