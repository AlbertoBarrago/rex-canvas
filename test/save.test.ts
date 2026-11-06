import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { saveBaseName, saveCanvas, siblingPath, timestamp } from '../src/save.js';

const now = new Date(2026, 10, 6, 9, 5, 7);

test('timestamp and base names', () => {
  assert.equal(timestamp(now), '20261106-090507');
  const env = { XDG_STATE_HOME: '/s' };
  assert.equal(saveBaseName('/s/rex-canvas/01a1b007-7c85.png', now, env), 'canvas-20261106-090507');
  assert.equal(saveBaseName('/work/arch.png', now, env), 'arch-20261106-090507');
  assert.equal(siblingPath('/work/arch.png', '.svg'), '/work/arch.svg');
});

test('saves the PNG and existing siblings, never overwriting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rex-canvas-save-'));
  try {
    const canvas = join(dir, 'arch.png');
    await writeFile(join(dir, 'arch.svg'), '<svg/>');
    const dest = join(dir, 'out');
    await import('node:fs/promises').then((fs) => fs.mkdir(dest));
    const first = await saveCanvas({ canvasFile: canvas, png: Buffer.from('png1'), destDir: dest, now, env: {} });
    assert.deepEqual(first, [join(dest, 'arch-20261106-090507.png'), join(dest, 'arch-20261106-090507.svg')]);
    assert.equal(await readFile(first[0]!, 'utf8'), 'png1');
    const second = await saveCanvas({ canvasFile: canvas, png: Buffer.from('png2'), destDir: dest, now, env: {} });
    assert.deepEqual(second, [join(dest, 'arch-20261106-090507-2.png'), join(dest, 'arch-20261106-090507-2.svg')]);
    assert.equal((await readdir(dest)).length, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
