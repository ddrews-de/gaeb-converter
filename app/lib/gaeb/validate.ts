/**
 * Structural sanity-check for GAEB DA XML 3.3 output.
 *
 * Not a full XSD validation — the GAEB Bundesverband does not redistribute
 * the official schemas, so we cannot ship them. Instead this module runs a
 * fast, schema-less set of checks that catches the mistakes we've actually
 * seen in the wild:
 *
 *   - Root element must be <GAEB> with a recognisable DA-XML namespace.
 *   - <GAEBInfo><Version> is present.
 *   - <Award> exists and the DA number is derivable (namespace or <DP>).
 *   - <Award><BoQ><BoQBody> holds at least one category or item.
 *   - Every <Item> has RNoPart, <Qty>, <QU>, and <Description>.
 *   - Every <BoQCtgy> has RNoPart and a non-empty <LblTx>.
 *
 * Issues come in two severities: `error` flips `valid` to false, `warning`
 * does not (missing metadata is noteworthy but doesn't break GAEB readers).
 *
 * When a consuming team clears the XSD-licensing question, this module can
 * be swapped for a real `libxmljs2`-based validator without breaking the
 * public shape (see Next-Steps plan Epic 6).
 */

export interface ValidationIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export function validateGaebXml33(xml: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  let doc;
  try {
    const stripped = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
    doc = new DOMParser().parseFromString(stripped, 'application/xml');
  } catch (err) {
    issues.push({
      severity: 'error',
      path: '/',
      message: `XML is not well-formed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { valid: false, issues };
  }

  const parseError = doc.getElementsByTagName('parsererror')[0];
  if (parseError) {
    issues.push({
      severity: 'error',
      path: '/',
      message: `XML is not well-formed: ${parseError.textContent ?? '(no detail)'}`,
    });
    return { valid: false, issues };
  }

  const root = doc.documentElement;
  if (!root || root.localName !== 'GAEB') {
    issues.push({
      severity: 'error',
      path: '/',
      message: `Root element is <${root?.localName ?? '???'}>, expected <GAEB>.`,
    });
    return { valid: false, issues };
  }

  validateRoot(root, issues);

  return {
    valid: !issues.some(i => i.severity === 'error'),
    issues,
  };
}

function validateRoot(root: Element, issues: ValidationIssue[]): void {
  const ns = root.getAttribute('xmlns') ?? '';
  if (!ns.includes('GAEB_DA_XML')) {
    issues.push({
      severity: 'error',
      path: '/GAEB',
      message: `Namespace is '${ns || '(none)'}', expected to contain 'GAEB_DA_XML'.`,
    });
  }

  const info = firstByLocalName(root, 'GAEBInfo');
  if (!info) {
    issues.push({
      severity: 'error',
      path: '/GAEB/GAEBInfo',
      message: 'Missing <GAEBInfo>.',
    });
  } else if (!firstByLocalName(info, 'Version')) {
    issues.push({
      severity: 'warning',
      path: '/GAEB/GAEBInfo/Version',
      message: 'Missing <Version> under <GAEBInfo>.',
    });
  }

  if (!firstByLocalName(root, 'PrjInfo')) {
    issues.push({
      severity: 'warning',
      path: '/GAEB/PrjInfo',
      message: 'Missing <PrjInfo>.',
    });
  }

  const award = firstByLocalName(root, 'Award');
  if (!award) {
    issues.push({
      severity: 'error',
      path: '/GAEB/Award',
      message: 'Missing <Award>.',
    });
    return;
  }

  const daFromNs = ns.match(/\/DA(8[1-6])\//)?.[1];
  const dpText = textOfFirstChild(award, 'DP');
  if (!daFromNs && !(dpText && /^8[1-6]$/.test(dpText))) {
    issues.push({
      severity: 'error',
      path: '/GAEB/Award',
      message: 'DA number not derivable from namespace URL or <DP> element.',
    });
  }

  const boq = firstByLocalName(award, 'BoQ');
  if (!boq) {
    issues.push({
      severity: 'error',
      path: '/GAEB/Award/BoQ',
      message: 'Missing <BoQ> under <Award>.',
    });
    return;
  }

  const body = firstByLocalName(boq, 'BoQBody');
  if (!body) {
    issues.push({
      severity: 'warning',
      path: '/GAEB/Award/BoQ/BoQBody',
      message: 'Missing <BoQBody> — bill of quantities is empty.',
    });
    return;
  }

  let itemCount = 0;
  let ctgyCount = 0;
  walkBoQBody(body, '/GAEB/Award/BoQ/BoQBody', issues, (kind) => {
    if (kind === 'item') itemCount++;
    if (kind === 'ctgy') ctgyCount++;
  });

  if (itemCount === 0 && ctgyCount === 0) {
    issues.push({
      severity: 'warning',
      path: '/GAEB/Award/BoQ/BoQBody',
      message: '<BoQBody> contains no <BoQCtgy> or <Item> children.',
    });
  }
}

function walkBoQBody(
  body: Element,
  path: string,
  issues: ValidationIssue[],
  visit: (kind: 'ctgy' | 'item') => void,
): void {
  for (const child of elementChildren(body)) {
    switch (child.localName) {
      case 'BoQCtgy': {
        visit('ctgy');
        validateCtgy(child, path, issues);
        const nested = firstByLocalName(child, 'BoQBody');
        if (nested) {
          const rNoPart = child.getAttribute('RNoPart') ?? '?';
          walkBoQBody(nested, `${path}/BoQCtgy[${rNoPart}]/BoQBody`, issues, visit);
        }
        break;
      }
      case 'Itemlist': {
        for (const item of elementChildren(child)) {
          if (item.localName === 'Item') {
            visit('item');
            validateItem(item, `${path}/Itemlist/Item`, issues);
          }
        }
        break;
      }
      case 'Item': {
        visit('item');
        validateItem(child, `${path}/Item`, issues);
        break;
      }
      default:
        break;
    }
  }
}

function validateCtgy(ctgy: Element, path: string, issues: ValidationIssue[]): void {
  const rNoPart = ctgy.getAttribute('RNoPart');
  if (!rNoPart) {
    issues.push({
      severity: 'warning',
      path: `${path}/BoQCtgy`,
      message: '<BoQCtgy> missing RNoPart attribute.',
    });
  }
  const lbl = firstByLocalName(ctgy, 'LblTx');
  const lblText = lbl ? lbl.textContent?.trim() : '';
  if (!lblText) {
    issues.push({
      severity: 'warning',
      path: `${path}/BoQCtgy[${rNoPart ?? '?'}]/LblTx`,
      message: '<BoQCtgy> has empty or missing <LblTx>.',
    });
  }
}

function validateItem(item: Element, path: string, issues: ValidationIssue[]): void {
  const rNoPart = item.getAttribute('RNoPart');
  const labelPath = `${path}[${rNoPart ?? '?'}]`;

  if (!rNoPart) {
    issues.push({
      severity: 'warning',
      path,
      message: '<Item> missing RNoPart attribute.',
    });
  }
  if (!firstByLocalName(item, 'Qty')) {
    issues.push({
      severity: 'error',
      path: `${labelPath}/Qty`,
      message: '<Item> missing <Qty>.',
    });
  }
  if (!firstByLocalName(item, 'QU')) {
    issues.push({
      severity: 'error',
      path: `${labelPath}/QU`,
      message: '<Item> missing <QU>.',
    });
  }
  if (!firstByLocalName(item, 'Description')) {
    issues.push({
      severity: 'warning',
      path: `${labelPath}/Description`,
      message: '<Item> missing <Description>.',
    });
  }
}

// ---------- DOM helpers (self-contained, namespace-agnostic) ----------

function elementChildren(el: Element): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if ((n as { nodeType?: number }).nodeType === 1) out.push(n as Element);
  }
  return out;
}

function firstByLocalName(el: Element, name: string): Element | null {
  for (const child of elementChildren(el)) {
    if (child.localName === name) return child;
  }
  return null;
}

function textOfFirstChild(el: Element, name: string): string | null {
  const child = firstByLocalName(el, name);
  return child ? child.textContent?.trim() ?? '' : null;
}
