/**
 * Serializes Kurztext / Langtext into the GAEB DA XML 3.3
 * `<Description><CompleteText>…</CompleteText></Description>` subtree.
 *
 * The shape mirrors what real 3.3 exports emit. Important: the schema
 * enforces DetailTxt **before** OutlineText, and OutlineText wraps the
 * paragraph content in <OutlTxt><TextOutlTxt> (two levels):
 *
 *   <Description>
 *     <CompleteText>
 *       <DetailTxt>
 *         <Text>
 *           <p><span>paragraph 1</span></p>
 *           <p><span>paragraph 2</span></p>
 *         </Text>
 *       </DetailTxt>
 *       <OutlineText>
 *         <OutlTxt>
 *           <TextOutlTxt>
 *             <p><span>Kurztext</span></p>
 *           </TextOutlTxt>
 *         </OutlTxt>
 *       </OutlineText>
 *     </CompleteText>
 *   </Description>
 *
 * TextRun formatting (bold / italic / underline) is preserved via inline
 * `style` attributes on the `<span>` elements, the same way parsers read
 * them back.
 */

import type { LongTextBlock, TextRun } from '../types';
import { xmlEscape } from './xmlTemplates';

export interface DescriptionInput {
  shortText: string;
  longText?: LongTextBlock[];
}

export function renderDescription(
  desc: DescriptionInput,
  indent: string,
): string {
  const hasShort = !!desc.shortText;
  const hasLong = desc.longText && desc.longText.length > 0;
  if (!hasShort && !hasLong) return '';

  const inner: string[] = [];
  // The 3.3 XSD enforces DetailTxt (or its short-text-shape variants
  // ComplTSA/ComplTSB) before OutlineText. Emit DetailTxt first.
  if (hasLong) {
    inner.push(renderDetailTxt(desc.longText!, indent + '   '));
  }
  if (hasShort) {
    inner.push(renderOutlineText(desc.shortText, indent + '   '));
  }

  return [
    `${indent}<Description>`,
    `${indent} <CompleteText>`,
    inner.join('\n'),
    `${indent} </CompleteText>`,
    `${indent}</Description>`,
  ].join('\n');
}

function renderOutlineText(shortText: string, indent: string): string {
  return [
    `${indent}<OutlineText>`,
    `${indent} <OutlTxt>`,
    `${indent}  <TextOutlTxt>`,
    `${indent}   <p>`,
    `${indent}    <span>${xmlEscape(shortText)}</span>`,
    `${indent}   </p>`,
    `${indent}  </TextOutlTxt>`,
    `${indent} </OutlTxt>`,
    `${indent}</OutlineText>`,
  ].join('\n');
}

function renderDetailTxt(blocks: LongTextBlock[], indent: string): string {
  const paragraphs = blocks.map(b => renderParagraph(b, indent + '  ')).join('\n');
  return [
    `${indent}<DetailTxt>`,
    `${indent} <Text>`,
    paragraphs,
    `${indent} </Text>`,
    `${indent}</DetailTxt>`,
  ].join('\n');
}

function renderParagraph(block: LongTextBlock, indent: string): string {
  const runs = block.runs.length > 0 ? block.runs : [{ text: '' }];
  const inner = runs.map(r => renderRun(r, indent + ' ')).join('\n');
  return [
    `${indent}<p>`,
    inner,
    `${indent}</p>`,
  ].join('\n');
}

function renderRun(run: TextRun, indent: string): string {
  const styles: string[] = [];
  if (run.bold) styles.push('font-weight:bold');
  if (run.italic) styles.push('font-style:italic');
  if (run.underline) styles.push('text-decoration:underline');
  const attr = styles.length > 0 ? ` style="${xmlEscape(styles.join(';'))}"` : '';
  return `${indent}<span${attr}>${xmlEscape(run.text)}</span>`;
}
