import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectPng } from '../src/png.js';
import { fakePng } from './helpers.js';

test('reads size from a complete PNG', () => {
  assert.deepEqual(inspectPng(fakePng(640, 480, [['IDAT', 100]])), { ok: true, info: { width: 640, height: 480 } });
});

test('reports a file cut mid-write as truncated, at every length', () => {
  const png = fakePng(10, 10, [['IDAT', 50]]);
  for (let len = 8; len < png.length; len++) {
    assert.deepEqual(inspectPng(png.subarray(0, len)), { ok: false, reason: 'truncated' }, `length ${len}`);
  }
});

test('rejects non-PNG data', () => {
  assert.deepEqual(inspectPng(Buffer.from('<svg></svg>')), { ok: false, reason: 'signature' });
  assert.deepEqual(inspectPng(Buffer.alloc(0)), { ok: false, reason: 'signature' });
});

test('rejects a zero-sized image', () => {
  assert.deepEqual(inspectPng(fakePng(0, 10)), { ok: false, reason: 'ihdr' });
});
