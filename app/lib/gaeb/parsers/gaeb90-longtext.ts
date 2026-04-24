/**
 * Tokenizes a GAEB 90 long-text line (record 26 / 27) into `TextRun[]`
 * respecting inline formatting control codes:
 *
 *   ~B~   bold on
 *   ~K~   italic on      (K = Kursiv)
 *   ~U~   underline on
 *   ~N~   all back to normal
 *   ~O~   outline style — treated as "normal" for our flag-based model
 *
 * Multiple flags can stack; ~N~ resets everything. Unknown ~X~ tokens are
 * passed through as literal text so we never silently lose characters.
 *
 * If no control codes appear, the entire line comes out as a single run
 * with all flags undefined — byte-for-byte identical to the previous
 * plain-text behaviour.
 */

import type { TextRun } from '../types';

const CONTROL_RE = /~([BKUNO])~/g;

interface FlagState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

const INITIAL: FlagState = {
  bold: false,
  italic: false,
  underline: false,
};

export function parseLongTextLine(text: string): TextRun[] {
  if (!text) return [];
  if (text.indexOf('~') < 0) {
    return [{ text }];
  }

  const runs: TextRun[] = [];
  let state: FlagState = { ...INITIAL };
  let cursor = 0;

  CONTROL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CONTROL_RE.exec(text)) !== null) {
    if (match.index > cursor) {
      pushRun(runs, text.slice(cursor, match.index), state);
    }
    state = applyControlCode(state, match[1]);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    pushRun(runs, text.slice(cursor), state);
  }

  return runs;
}

function applyControlCode(state: FlagState, code: string): FlagState {
  switch (code) {
    case 'B': return { ...state, bold: true };
    case 'K': return { ...state, italic: true };
    case 'U': return { ...state, underline: true };
    case 'O': return state;
    case 'N': return { ...INITIAL };
    default: return state;
  }
}

function pushRun(out: TextRun[], text: string, state: FlagState): void {
  if (!text) return;
  const run: TextRun = { text };
  if (state.bold) run.bold = true;
  if (state.italic) run.italic = true;
  if (state.underline) run.underline = true;
  out.push(run);
}
