/**
 * Thin wrapper over the `rex` CLI. rex-canvas talks to Rex only through the
 * CLI (never the socket), and always with `--autostart=false` so it can never
 * start a server as a side effect.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function rexBin(): string {
  return process.env.REX_BIN || 'rex';
}

async function rex(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(rexBin(), ['--autostart=false', ...args]);
    return stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === 'ENOENT') throw new Error(`'${rexBin()}' not found on PATH (set REX_BIN)`);
    const detail = e.stderr?.trim() || e.message;
    throw new Error(`rex ${args[0] ?? ''} failed: ${detail}`);
  }
}

/**
 * Finds the id of the block a creation reply made. `rex split --json` answers
 * `{ anchor_id, block_ids: [new], split_ids, revision }`, so `anchor_id` must
 * be skipped: it is the pane we split, not the new one.
 */
export function findBlockId(value: unknown): string | undefined {
  if (typeof value === 'string') return value.startsWith('block:') ? value : undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBlockId(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const direct = findBlockId(record.block_ids) ?? findBlockId(record.block_id);
    if (direct) return direct;
    for (const [key, item] of Object.entries(record)) {
      if (key === 'anchor_id') continue;
      const found = findBlockId(item);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Opens a terminal block running `command` beside `anchor` without taking
 * focus, and returns the new block's id (undefined if Rex's reply has none).
 */
export async function splitBeside(opts: {
  anchor: string;
  ratio: number;
  below: boolean;
  label: string;
  command: string[];
}): Promise<string | undefined> {
  const stdout = await rex([
    'split',
    '-b', opts.anchor,
    `--split=${opts.below ? 'below' : 'right'}`,
    `--ratio=${opts.ratio}`,
    '--focus=false',
    '--shell=none',
    '--label', opts.label,
    '--json',
    '--',
    ...opts.command,
  ]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`rex split returned non-JSON output: ${stdout.slice(0, 200)}`);
  }
  return findBlockId(parsed);
}

export async function blockExists(id: string): Promise<boolean> {
  const stdout = await rex(['block', 'ls', '-A', '-q', '--short=false']);
  return stdout.split('\n').some((line) => line.trim() === id);
}

export async function closeBlock(id: string): Promise<void> {
  await rex(['block', 'close', id]);
}
