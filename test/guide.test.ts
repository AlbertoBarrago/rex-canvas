import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitEnd, fitStart, tildify, waitingGuide } from '../src/guide.js';

const file = '/Users/me/.local/state/rex-canvas/01a1b007-7c85-7785.png';

test('tildify and fitting', () => {
  assert.equal(tildify(file, '/Users/me'), '~/.local/state/rex-canvas/01a1b007-7c85-7785.png');
  assert.equal(tildify('/Users/meow/x', '/Users/me'), '/Users/meow/x');
  assert.equal(tildify(file, undefined), file);
  assert.equal(fitStart('abcdef', 4), '…def');
  assert.equal(fitEnd('abcdef', 4), 'abc…');
  assert.equal(fitEnd('abc', 4), 'abc');
  assert.equal(fitEnd('abc', 0), '');
});

test('wide pane: full guide with the watched path, how to fill it and the keys', () => {
  const lines = waitingGuide({ file, width: 100, home: '/Users/me' });
  assert.equal(lines[0], 'Nothing to show yet. Watching:');
  assert.ok(lines.some((l) => l.includes('~/.local/state/rex-canvas/01a1b007-7c85-7785.png')));
  assert.ok(lines.some((l) => l.startsWith('  cp image.png ')));
  assert.ok(lines.some((l) => l.includes('Markasso')));
  assert.ok(lines.at(-1)!.startsWith('Keys: '));
  lines.forEach((l) => assert.ok(l.length <= 100));
});

test('every line fits the pane, and the file name survives truncation', () => {
  for (const width of [1, 10, 39, 40, 45, 60, 80]) {
    const lines = waitingGuide({ file, width, home: '/Users/me' });
    lines.forEach((l) => assert.ok(l.length <= width, `width ${width}: ${JSON.stringify(l)}`));
    if (width >= 20) assert.ok(lines.some((l) => l.endsWith('7785.png')), `width ${width}`);
  }
});

test('a long path is shortened without losing the cp command', () => {
  const lines = waitingGuide({ file: `/very/long/${'x'.repeat(120)}/canvas.png`, width: 60 });
  const cp = lines.find((l) => l.startsWith('  cp image.png '));
  assert.ok(cp, 'cp line kept');
  assert.ok(cp!.endsWith('/canvas.png') && cp!.length <= 60);
  assert.ok(lines[1]!.startsWith('  …'));
});

test('narrow pane: short guide', () => {
  const lines = waitingGuide({ file, width: 30, home: '/Users/me' });
  assert.equal(lines.length, 5);
  assert.equal(lines[3], 'Export a PNG there.');
});

test('a notice replaces the opening line', () => {
  const [first] = waitingGuide({ file, width: 100, notice: 'x.png is not a valid PNG (signature)' });
  assert.equal(first, 'x.png is not a valid PNG (signature)');
});
