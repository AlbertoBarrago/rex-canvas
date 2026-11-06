/**
 * Splits raw stdin bytes into key presses and terminal replies. The viewer
 * queries the terminal (cell size, graphics support) on the same stream the
 * user types on, so both must be told apart. Pure, so it can be tested.
 */

export type InputEvent =
  | { type: 'key'; key: string }
  | { type: 'cellSize'; width: number; height: number }
  | { type: 'textArea'; width: number; height: number }
  | { type: 'graphics'; id: number; ok: boolean; message: string }
  | { type: 'deviceAttributes' };

export interface Tokenized {
  events: InputEvent[];
  /** Bytes of an escape sequence that has not fully arrived yet. */
  rest: string;
}

const ARROWS: Record<string, string> = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end' };

/** CSI: ESC [ params final. Params are digits, `;` and `?`. */
const CSI = /^\x1b\[([?\d;]*)([\x40-\x7e])/;
/** APC graphics reply: ESC _ G keys ; message ESC \ */
const GFX = /^\x1b_G([^;\x1b]*);([^\x1b]*)\x1b\\/;

function csiEvent(params: string, final: string): InputEvent | null {
  if (final === 'c' && params.startsWith('?')) return { type: 'deviceAttributes' };
  if (final === 't') {
    const [kind, h, w] = params.split(';').map(Number);
    if (h === undefined || w === undefined || !Number.isFinite(h) || !Number.isFinite(w)) return null;
    if (kind === 6) return { type: 'cellSize', width: w, height: h };
    if (kind === 4) return { type: 'textArea', width: w, height: h };
    return null;
  }
  const arrow = ARROWS[final];
  if (arrow && (params === '' || params === '1')) return { type: 'key', key: arrow };
  if (final === '~') {
    if (params === '5') return { type: 'key', key: 'pageup' };
    if (params === '6') return { type: 'key', key: 'pagedown' };
  }
  return null;
}

function graphicsEvent(keys: string, message: string): InputEvent {
  const idMatch = /(?:^|,)i=(\d+)/.exec(keys);
  return { type: 'graphics', id: idMatch ? Number(idMatch[1]) : 0, ok: message === 'OK', message };
}

/**
 * Tokenizes `input`. An escape sequence cut off at the end of the chunk is
 * returned in `rest` to be prepended to the next chunk; a lone ESC at the end
 * is reported as the `escape` key, since a real sequence arrives in one read.
 */
export function tokenize(input: string): Tokenized {
  const events: InputEvent[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch !== '\x1b') {
      events.push({ type: 'key', key: ch === '\x03' ? 'ctrl+c' : ch === '\r' ? 'enter' : ch });
      i += 1;
      continue;
    }
    const tail = input.slice(i);
    if (tail.length === 1) {
      events.push({ type: 'key', key: 'escape' });
      i += 1;
      continue;
    }
    const gfx = GFX.exec(tail);
    if (gfx) {
      events.push(graphicsEvent(gfx[1]!, gfx[2]!));
      i += gfx[0].length;
      continue;
    }
    const csi = CSI.exec(tail);
    if (csi) {
      const event = csiEvent(csi[1]!, csi[2]!);
      if (event) events.push(event);
      i += csi[0].length;
      continue;
    }
    // SS3 arrows (application cursor mode): ESC O A..D
    const ss3 = /^\x1bO([A-DHF])/.exec(tail);
    if (ss3) {
      events.push({ type: 'key', key: ARROWS[ss3[1]!]! });
      i += 3;
      continue;
    }
    const incomplete =
      (tail.startsWith('\x1b_') && !tail.includes('\x1b\\')) ||
      /^\x1b(\[[?\d;]*|O)?$/.test(tail);
    if (incomplete) return { events, rest: tail };
    // Unknown escape: drop the ESC and keep going.
    events.push({ type: 'key', key: 'escape' });
    i += 1;
  }
  return { events, rest: '' };
}
