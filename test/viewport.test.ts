import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIT_VIEW, MAX_ZOOM, fitScale, layout, pan, zoom, type Grid } from '../src/viewport.js';

const grid: Grid = { cols: 100, rows: 50, cellWidth: 10, cellHeight: 20 }; // 1000x1000 px

test('fit shows the whole image, centered, keeping aspect ratio', () => {
  const p = layout(FIT_VIEW, { width: 2000, height: 1000 }, grid);
  assert.deepEqual(p.crop, { x: 0, y: 0, width: 2000, height: 1000 });
  assert.equal(p.cols, 100);
  assert.equal(p.rows, 25);
  assert.equal(p.row, 12);
  assert.equal(p.col, 0);
});

test('small images are not upscaled on fit', () => {
  const img = { width: 200, height: 100 };
  assert.equal(fitScale(img, grid), 1);
  const p = layout(FIT_VIEW, img, grid);
  assert.equal(p.cols, 20);
  assert.equal(p.rows, 5);
  assert.equal(p.col, 40);
});

test('zoom crops around the center and fills more cells', () => {
  const img = { width: 2000, height: 2000 };
  const v = zoom(zoom(FIT_VIEW, img, grid, 1), img, grid, 1); // 1.5625x
  const p = layout(v, img, grid);
  assert.equal(p.crop.width, 1280);
  assert.equal(p.crop.x, 360);
  assert.equal(p.cols, 100);
});

test('zoom is clamped', () => {
  const img = { width: 2000, height: 2000 };
  assert.equal(zoom(FIT_VIEW, img, grid, -3).zoom, 1);
  assert.equal(zoom(FIT_VIEW, img, grid, 100).zoom, MAX_ZOOM);
});

test('pan never leaves the image', () => {
  const img = { width: 2000, height: 2000 };
  let v = zoom(FIT_VIEW, img, grid, 4);
  for (let i = 0; i < 100; i++) v = pan(v, img, grid, -1, -1);
  const p = layout(v, img, grid);
  assert.equal(p.crop.x, 0);
  assert.equal(p.crop.y, 0);
  for (let i = 0; i < 100; i++) v = pan(v, img, grid, 1, 1);
  const q = layout(v, img, grid);
  assert.equal(q.crop.x + q.crop.width, 2000);
  assert.equal(q.crop.y + q.crop.height, 2000);
});

test('panning at fit does nothing', () => {
  const img = { width: 2000, height: 1000 };
  assert.deepEqual(layout(pan(FIT_VIEW, img, grid, 3, 3), img, grid), layout(FIT_VIEW, img, grid));
});
