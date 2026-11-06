/**
 * The viewer that runs inside the pane: watches one PNG file and shows it
 * with the kitty graphics protocol.
 *
 * Flow:
 * 1. Probe the terminal on stdin (graphics support, cell size in pixels),
 *    ending with a Device Attributes query every terminal answers, so the
 *    probe never waits for a timeout on a capable terminal.
 * 2. Poll the file's mtime+size. A complete new PNG is uploaded once under a
 *    fresh image id, placed, and only then is the previous image deleted, so
 *    updates don't flicker.
 * 3. Pan and zoom only re-issue the placement (same placement id) with a new
 *    crop: a few bytes per key press, no re-upload.
 * 4. On resize the screen is cleared and the image re-uploaded, since some
 *    terminals drop images on a full clear.
 */

import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { waitingGuide } from './guide.js';
import { saveCanvas } from './save.js';
import { deleteImage, placeImage, supportQuery, transmitPng } from './kitty.js';
import { tokenize, type InputEvent } from './input.js';
import { inspectPng, type PngInfo } from './png.js';
import { FIT_VIEW, layout, pan, zoom, type Grid, type View } from './viewport.js';

export interface ViewerOptions {
  file: string;
  pollMs?: number;
}

interface Shown {
  id: number;
  png: Uint8Array;
  info: PngInfo;
}

/** Image ids in a range unlikely to collide with other programs ("RC" prefix). */
const IMAGE_BASE = 0x52430000;
const QUERY_ID = IMAGE_BASE;
const PLACEMENT_ID = 1;
const PROBE_TIMEOUT_MS = 1500;
/** Used only when the terminal reports no pixel sizes at all. */
const FALLBACK_CELL = { width: 10, height: 20 };

const KEY_HINT = 'q quit  hjkl pan  +/- zoom  0 fit  s save  o open';
/** How long a one-off message (such as "saved") stays in the status line. */
const FLASH_MS = 4000;

/** Opens a file in the desktop's default app, detached from the pane. */
function openExternally(file: string, onError: (err: Error) => void): void {
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(opener, [file], { detached: true, stdio: 'ignore' });
  child.on('error', onError);
  child.unref();
}

export async function runViewer(opts: ViewerOptions): Promise<void> {
  const out = process.stdout;
  const inp = process.stdin;
  if (!out.isTTY || !inp.isTTY) throw new Error('view needs an interactive terminal');

  const pollMs = opts.pollMs ?? 200;
  let nextId = 1;
  let shown: Shown | undefined;
  let view: View = FIT_VIEW;
  let follow = true;
  let cell: { width: number; height: number } | undefined;
  let textArea: { width: number; height: number } | undefined;
  let graphics: { ok: boolean; message: string } | undefined;
  let notice: string | undefined;
  let flash: string | undefined;
  let flashTimer: NodeJS.Timeout | undefined;
  let updatedAt: Date | undefined;
  let lastKey = '';
  let pending = '';
  let closed = false;
  let probeDone: (() => void) | undefined;
  let quit: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    quit = resolve;
  });

  // When the pane is closed under us, writes fail with EIO/EPIPE. That is the
  // normal way this process ends, so it marks the viewer closed and quits.
  out.on('error', () => {
    closed = true;
    quit();
  });
  const write = (s: string): void => {
    if (!closed) out.write(s);
  };

  const grid = (): Grid => ({
    cols: Math.max(1, out.columns),
    rows: Math.max(1, out.rows - 1),
    cellWidth: cell?.width ?? FALLBACK_CELL.width,
    cellHeight: cell?.height ?? FALLBACK_CELL.height,
  });

  const fitText = (s: string, width: number): string => (s.length > width ? `${s.slice(0, Math.max(0, width - 1))}…` : s);

  const renderStatus = (): void => {
    const cols = out.columns;
    let left: string;
    if (flash) left = flash;
    else if (notice) left = notice;
    else if (shown) {
      const time = updatedAt?.toLocaleTimeString() ?? '';
      left = `${basename(opts.file)}  ${shown.info.width}x${shown.info.height}  ${Math.round(view.zoom * 100)}%${follow ? '  follow' : ''}  ${time}`;
    } else left = `waiting for ${basename(opts.file)}`;
    if (graphics && !graphics.ok) left = `no kitty graphics: ${graphics.message}  ${left}`;
    const gap = cols - left.length - KEY_HINT.length;
    const line = gap >= 2 ? `${left}${' '.repeat(gap)}${KEY_HINT}` : fitText(left, cols);
    write(`\x1b[${out.rows};1H\x1b[2K\x1b[2m${line}\x1b[0m`);
  };

  /** Empty state: the guide as a left-aligned block centered in the image area. */
  const renderWaiting = (): void => {
    const lines = waitingGuide({ file: opts.file, width: out.columns, home: process.env.HOME, notice });
    const blockWidth = Math.max(...lines.map((l) => l.length));
    const area = Math.max(1, out.rows - 1);
    const top = Math.max(1, Math.floor((area - lines.length) / 2) + 1);
    const col = Math.max(1, Math.floor((out.columns - blockWidth) / 2) + 1);
    let screen = '\x1b[2J';
    lines.forEach((line, i) => {
      if (top + i > area) return;
      // The first line (state or notice) at normal intensity, the help dimmed.
      screen += `\x1b[${top + i};${col}H${i === 0 ? '' : '\x1b[2m'}${line}\x1b[0m`;
    });
    write(screen);
    renderStatus();
  };

  const place = (): void => {
    if (!shown) return;
    const p = layout(view, shown.info, grid());
    write(
      `\x1b[${p.row + 1};${p.col + 1}H` +
        placeImage({ id: shown.id, placementId: PLACEMENT_ID, cols: p.cols, rows: p.rows, crop: p.crop }),
    );
  };

  const redraw = (): void => {
    write('\x1b[2J');
    if (!shown) return renderWaiting();
    write(transmitPng(shown.id, shown.png));
    place();
    renderStatus();
  };

  const showPng = (png: Uint8Array, info: PngInfo): void => {
    const previous = shown;
    shown = { id: IMAGE_BASE + (nextId++ % 0xffff) + 1, png, info };
    if (follow) view = FIT_VIEW;
    if (!previous) write('\x1b[2J');
    write(transmitPng(shown.id, png));
    place();
    if (previous) write(deleteImage(previous.id));
    updatedAt = new Date();
    notice = undefined;
    renderStatus();
  };

  const poll = async (): Promise<void> => {
    let key: string;
    try {
      const s = await stat(opts.file);
      key = `${s.mtimeMs}:${s.size}`;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      if (lastKey !== 'missing') {
        lastKey = 'missing';
        notice = shown ? `${basename(opts.file)} was removed, showing the last image` : undefined;
        shown ? renderStatus() : renderWaiting();
      }
      return;
    }
    if (key === lastKey) return;
    const png = await readFile(opts.file);
    const check = inspectPng(png);
    if (!check.ok) {
      // A truncated file is still being written: leave lastKey alone so the
      // next tick reads it again once the writer is done.
      if (check.reason === 'truncated') return;
      lastKey = key;
      notice = `${basename(opts.file)} is not a valid PNG (${check.reason})`;
      shown ? renderStatus() : renderWaiting();
      return;
    }
    lastKey = key;
    showPng(png, check.info);
  };

  const showFlash = (message: string): void => {
    flash = message;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash = undefined;
      renderStatus();
    }, FLASH_MS);
    renderStatus();
  };

  const short = (path: string): string => {
    const home = process.env.HOME;
    return home && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
  };

  /** Saves what is on screen; failures are shown, never thrown into the key loop. */
  const save = (): void => {
    if (!shown) return showFlash('nothing to save yet');
    saveCanvas({ canvasFile: opts.file, png: shown.png }).then(
      (paths) => {
        const extra = paths.slice(1).map((p) => p.slice(p.lastIndexOf('.') + 1));
        showFlash(`saved ${short(paths[0]!)}${extra.length ? ` (+${extra.join(', ')})` : ''}`);
      },
      (err: unknown) => showFlash(`save failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  };

  const userMoved = (next: View): void => {
    follow = false;
    view = next;
    place();
    renderStatus();
  };

  const onKey = (key: string): void => {
    if (key === 'q' || key === 'ctrl+c') return quit();
    if (key === '0' || key === 'f') {
      follow = key === '0' ? true : !follow;
      if (follow) view = FIT_VIEW;
      place();
      return renderStatus();
    }
    if (key === 's') return save();
    if (!shown) return;
    if (key === 'o') {
      openExternally(opts.file, (err) => showFlash(`open failed: ${err.message}`));
      return showFlash(`opened ${basename(opts.file)}`);
    }
    const img = shown.info;
    const g = grid();
    const moves: Record<string, () => View> = {
      h: () => pan(view, img, g, -1, 0),
      left: () => pan(view, img, g, -1, 0),
      l: () => pan(view, img, g, 1, 0),
      right: () => pan(view, img, g, 1, 0),
      k: () => pan(view, img, g, 0, -1),
      up: () => pan(view, img, g, 0, -1),
      j: () => pan(view, img, g, 0, 1),
      down: () => pan(view, img, g, 0, 1),
      pageup: () => pan(view, img, g, 0, -5),
      pagedown: () => pan(view, img, g, 0, 5),
      '+': () => zoom(view, img, g, 1),
      '=': () => zoom(view, img, g, 1),
      '-': () => zoom(view, img, g, -1),
      _: () => zoom(view, img, g, -1),
    };
    const move = moves[key];
    if (move) userMoved(move());
  };

  const onEvent = (event: InputEvent): void => {
    switch (event.type) {
      case 'key':
        return onKey(event.key);
      case 'cellSize':
        if (event.width > 0 && event.height > 0) cell = { width: event.width, height: event.height };
        return;
      case 'textArea':
        if (event.width > 0 && event.height > 0) textArea = { width: event.width, height: event.height };
        return;
      case 'graphics':
        if (event.id === QUERY_ID) graphics = { ok: event.ok, message: event.message };
        return;
      case 'deviceAttributes':
        probeDone?.();
        return;
    }
  };

  const onData = (chunk: string): void => {
    const { events, rest } = tokenize(pending + chunk);
    pending = rest;
    for (const event of events) onEvent(event);
  };

  let resizeTimer: NodeJS.Timeout | undefined;
  const onResize = (): void => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redraw, 50);
  };
  const onSignal = (): void => quit();

  inp.setRawMode(true);
  inp.setEncoding('utf8');
  inp.on('data', onData);
  inp.resume();
  out.on('resize', onResize);
  process.on('SIGTERM', onSignal);
  process.on('SIGHUP', onSignal);

  let pollTimer: NodeJS.Timeout | undefined;
  try {
    write('\x1b[?1049h\x1b[?25l\x1b[2J');

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, PROBE_TIMEOUT_MS);
      probeDone = () => {
        clearTimeout(timer);
        resolve();
      };
      write(`${supportQuery(QUERY_ID)}\x1b[16t\x1b[14t\x1b[c`);
    });
    probeDone = undefined;
    if (!cell && textArea) {
      cell = { width: textArea.width / Math.max(1, out.columns), height: textArea.height / Math.max(1, out.rows) };
    }
    if (!graphics) graphics = { ok: false, message: 'terminal did not answer the graphics query' };

    renderWaiting();
    let failure: unknown;
    const tick = (): void => {
      poll()
        .catch((err: unknown) => {
          failure = err;
          quit();
        })
        .finally(() => {
          if (!closed && failure === undefined) pollTimer = setTimeout(tick, pollMs);
        });
    };
    tick();
    await finished;
    if (failure !== undefined) throw failure;
  } finally {
    clearTimeout(pollTimer);
    clearTimeout(resizeTimer);
    clearTimeout(flashTimer);
    if (shown) write(deleteImage(shown.id));
    write('\x1b[?25h\x1b[?1049l');
    inp.off('data', onData);
    out.off('resize', onResize);
    process.off('SIGTERM', onSignal);
    process.off('SIGHUP', onSignal);
    if (inp.isTTY) inp.setRawMode(false);
    inp.pause();
  }
}
