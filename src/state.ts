/**
 * Where canvases live and which viewer pane shows which canvas.
 *
 * Each agent pane gets its own canvas file, keyed by its Rex block id, so two
 * agents drawing at once don't overwrite each other. `panes.json` maps a
 * canvas path to the block id of the viewer showing it, which is what makes
 * `rex-canvas show` idempotent.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export type Env = Record<string, string | undefined>;

export function stateDir(env: Env = process.env): string {
  const base = env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state');
  return join(base, 'rex-canvas');
}

/** Turns a Rex id such as `block:01a1...` into a safe file name. */
export function fileKey(id: string): string {
  return id.replace(/^block:/, '').replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * The canvas file to use: `--file`, then `$REX_CANVAS_FILE`, then one per
 * block (`--block` or `$REX_BLOCK`), then a shared `default.png`.
 */
export function canvasPath(opts: { file?: string; block?: string }, env: Env = process.env): string {
  if (opts.file) return resolve(opts.file);
  if (env.REX_CANVAS_FILE) return resolve(env.REX_CANVAS_FILE);
  const block = opts.block || env.REX_BLOCK;
  return join(stateDir(env), block ? `${fileKey(block)}.png` : 'default.png');
}

export type Panes = Record<string, string>;

function panesFile(env: Env): string {
  return join(stateDir(env), 'panes.json');
}

export async function readPanes(env: Env = process.env): Promise<Panes> {
  let raw: string;
  try {
    raw = await readFile(panesFile(env), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${panesFile(env)} is not a JSON object`);
  }
  const panes: Panes = {};
  for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') panes[k] = v;
  return panes;
}

/** Writes through a temp file and a rename, so readers never see half a file. */
export async function writeFileAtomic(path: string, data: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, data, 'utf8');
  await rename(tmp, path);
}

/** Read-modify-write of `panes.json`; `block` undefined removes the entry. */
export async function setPane(canvas: string, block: string | undefined, env: Env = process.env): Promise<void> {
  const panes = await readPanes(env);
  if (block === undefined) delete panes[canvas];
  else panes[canvas] = block;
  await writeFileAtomic(panesFile(env), `${JSON.stringify(panes, null, 2)}\n`);
}
