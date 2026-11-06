/**
 * Saving a canvas out of the pane. The PNG saved is the one on screen (the
 * bytes the viewer already holds, never a file that may be mid-write), plus
 * any sibling the producer wrote next to it, such as the vector `.svg`.
 */

import { constants } from 'node:fs';
import { copyFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import type { Env } from './state.js';
import { stateDir } from './state.js';

/** Sibling formats copied along with the PNG when they exist. */
export const SIBLING_EXTS = ['.svg', '.markasso'] as const;

export function downloadsDir(env: Env = process.env): string {
  return env.REX_CANVAS_DOWNLOADS || join(env.HOME || homedir(), 'Downloads');
}

/** `20261106-103453`, in local time. */
export function timestamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/**
 * Base name for saved copies. Per-pane canvases are named after a Rex block
 * id, which means nothing outside the pane, so they become `canvas`.
 */
export function saveBaseName(canvasFile: string, now: Date, env: Env = process.env): string {
  const own = dirname(canvasFile) === stateDir(env);
  const stem = own ? 'canvas' : basename(canvasFile, extname(canvasFile));
  return `${stem}-${timestamp(now)}`;
}

export function siblingPath(canvasFile: string, ext: string): string {
  return join(dirname(canvasFile), `${basename(canvasFile, extname(canvasFile))}${ext}`);
}

/** Writes or copies without ever replacing an existing file: `name-2.png`, `name-3.png`... */
async function exclusive(dest: string, write: (path: string) => Promise<void>): Promise<string> {
  const ext = extname(dest);
  const stem = dest.slice(0, dest.length - ext.length);
  for (let n = 1; ; n++) {
    const path = n === 1 ? dest : `${stem}-${n}${ext}`;
    try {
      await write(path);
      return path;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}

/**
 * Saves `png` and the canvas's existing siblings into `destDir`. Returns the
 * written paths, PNG first.
 */
export async function saveCanvas(opts: {
  canvasFile: string;
  png: Uint8Array;
  destDir?: string;
  now?: Date;
  env?: Env;
}): Promise<string[]> {
  const env = opts.env ?? process.env;
  const dir = opts.destDir ?? downloadsDir(env);
  const base = join(dir, saveBaseName(opts.canvasFile, opts.now ?? new Date(), env));
  const written = [await exclusive(`${base}.png`, (p) => writeFile(p, opts.png, { flag: 'wx' }))];
  for (const ext of SIBLING_EXTS) {
    const source = siblingPath(opts.canvasFile, ext);
    try {
      written.push(await exclusive(`${base}${ext}`, (p) => copyFile(source, p, constants.COPYFILE_EXCL)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  return written;
}
