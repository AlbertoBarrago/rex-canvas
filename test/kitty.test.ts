import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHUNK_SIZE, deleteImage, placeImage, transmitPng } from '../src/kitty.js';

const commands = (s: string): string[] => s.split('\x1b\\').filter(Boolean).map((c) => c.replace(/^\x1b_G/, ''));

test('small images go in one chunk', () => {
  const [only, ...rest] = commands(transmitPng(7, Buffer.from('abc')));
  assert.equal(only, `a=t,f=100,t=d,i=7,q=2,m=0;${Buffer.from('abc').toString('base64')}`);
  assert.equal(rest.length, 0);
});

test('large images are chunked and reassemble to the same base64', () => {
  const png = Buffer.alloc(10_000, 7);
  const parts = commands(transmitPng(9, png));
  assert.equal(parts.length, Math.ceil(png.toString('base64').length / CHUNK_SIZE));
  assert.match(parts[0]!, /^a=t,f=100,t=d,i=9,q=2,m=1;/);
  parts.slice(1, -1).forEach((p) => assert.match(p, /^m=1;/));
  assert.match(parts.at(-1)!, /^m=0;/);
  const data = parts.map((p) => p.slice(p.indexOf(';') + 1));
  data.slice(0, -1).forEach((d) => assert.equal(d.length, CHUNK_SIZE));
  assert.equal(data.join(''), png.toString('base64'));
});

test('placement and delete commands', () => {
  assert.equal(
    placeImage({ id: 3, placementId: 1, cols: 20, rows: 10, crop: { x: 1, y: 2, width: 30, height: 40 } }),
    '\x1b_Ga=p,i=3,p=1,c=20,r=10,x=1,y=2,w=30,h=40,C=1,q=2\x1b\\',
  );
  assert.equal(deleteImage(3), '\x1b_Ga=d,d=I,i=3,q=2\x1b\\');
});
