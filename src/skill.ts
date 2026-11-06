/**
 * The agent skill ships inside the package (`skills/rex-canvas/SKILL.md`) and
 * is installed from there, so it always matches the installed CLI.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from './state.js';

/** Resolves the same way from `src/` (dev) and `dist/` (installed). */
const SKILL_SOURCE = fileURLToPath(new URL('../skills/rex-canvas/SKILL.md', import.meta.url));

export function readSkill(): Promise<string> {
  return readFile(SKILL_SOURCE, 'utf8');
}

/** Writes `<dir>/rex-canvas/SKILL.md` (default `~/.claude/skills`) and returns its path. */
export async function installSkill(dir?: string): Promise<string> {
  const target = join(dir ?? join(homedir(), '.claude', 'skills'), 'rex-canvas', 'SKILL.md');
  await writeFileAtomic(target, await readSkill());
  return target;
}
