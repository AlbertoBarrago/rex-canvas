import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tokenize } from '../src/input.js';

test('keys and arrows', () => {
  assert.deepEqual(tokenize('hj\x1b[A\x1bOD\x03').events, [
    { type: 'key', key: 'h' },
    { type: 'key', key: 'j' },
    { type: 'key', key: 'up' },
    { type: 'key', key: 'left' },
    { type: 'key', key: 'ctrl+c' },
  ]);
});

test('terminal replies are not keys', () => {
  const { events, rest } = tokenize('\x1b_Gi=1380122624;OK\x1b\\\x1b[6;20;10t\x1b[4;800;1200t\x1b[?62;22c');
  assert.equal(rest, '');
  assert.deepEqual(events, [
    { type: 'graphics', id: 1380122624, ok: true, message: 'OK' },
    { type: 'cellSize', width: 10, height: 20 },
    { type: 'textArea', width: 1200, height: 800 },
    { type: 'deviceAttributes' },
  ]);
});

test('graphics errors are reported', () => {
  const [event] = tokenize('\x1b_Gi=5;ENOTSUPPORTED:nope\x1b\\').events;
  assert.deepEqual(event, { type: 'graphics', id: 5, ok: false, message: 'ENOTSUPPORTED:nope' });
});

test('a reply split across reads is kept for the next chunk', () => {
  const first = tokenize('q\x1b[6;20');
  assert.deepEqual(first.events, [{ type: 'key', key: 'q' }]);
  assert.equal(first.rest, '\x1b[6;20');
  assert.deepEqual(tokenize(`${first.rest};10t`).events, [{ type: 'cellSize', width: 10, height: 20 }]);
  assert.equal(tokenize('\x1b_Gi=1;O').rest, '\x1b_Gi=1;O');
});

test('a lone ESC is the escape key', () => {
  assert.deepEqual(tokenize('\x1b').events, [{ type: 'key', key: 'escape' }]);
});
