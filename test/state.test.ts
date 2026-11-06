import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { findBlockId } from '../src/rex.js';
import { canvasPath, readPanes, setPane, stateDir } from '../src/state.js';

test('canvas path precedence: --file, env, block, default', () => {
  const env = { XDG_STATE_HOME: '/s', REX_BLOCK: 'block:abc-1' };
  assert.equal(canvasPath({ file: '/x/a.png' }, env), '/x/a.png');
  assert.equal(canvasPath({}, { ...env, REX_CANVAS_FILE: '/y/b.png' }), '/y/b.png');
  assert.equal(canvasPath({ block: 'block:zz' }, env), '/s/rex-canvas/zz.png');
  assert.equal(canvasPath({}, env), '/s/rex-canvas/abc-1.png');
  assert.equal(canvasPath({}, { XDG_STATE_HOME: '/s' }), '/s/rex-canvas/default.png');
  assert.equal(stateDir({ HOME: '/h' }), '/h/.local/state/rex-canvas');
});

test('panes.json round trip', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rex-canvas-'));
  const env = { XDG_STATE_HOME: dir };
  try {
    assert.deepEqual(await readPanes(env), {});
    await setPane('/a.png', 'block:1', env);
    await setPane('/b.png', 'block:2', env);
    await setPane('/a.png', undefined, env);
    assert.deepEqual(await readPanes(env), { '/b.png': 'block:2' });
    await writeFile(join(dir, 'rex-canvas', 'panes.json'), '[]');
    await assert.rejects(readPanes(env), /not a JSON object/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('findBlockId digs the new block out of a rex reply', () => {
  assert.equal(findBlockId({ session_id: 'session:1', block: { block_id: 'block:9' } }), 'block:9');
  assert.equal(findBlockId({ window_id: 'window:1', blocks: ['block:3'] }), 'block:3');
  assert.equal(findBlockId({ ok: true }), undefined);
  // Real `rex split --json` reply: the anchor comes first and must be skipped.
  assert.equal(
    findBlockId({ anchor_id: 'block:anchor', block_ids: ['block:new'], split_ids: ['split:1'], revision: 17 }),
    'block:new',
  );
  assert.equal(findBlockId({ anchor_id: 'block:anchor' }), undefined);
});
