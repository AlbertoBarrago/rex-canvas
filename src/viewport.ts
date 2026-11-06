/**
 * Pan and zoom math. The image is uploaded once; what the user sees is a crop
 * of it scaled into a block of cells. All functions here are pure.
 *
 * The view is stored as a zoom factor relative to "fit" plus a center point
 * normalized to 0..1, so it survives both a pane resize and a new image with
 * different dimensions.
 */

import type { Crop } from './kitty.js';

export interface Size {
  width: number;
  height: number;
}

/** The drawable area in cells, and the pixel size of one cell. */
export interface Grid {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
}

export interface View {
  /** 1 = whole image fits the area; larger values zoom in. */
  zoom: number;
  /** Center of the visible region, normalized to the image (0..1). */
  cx: number;
  cy: number;
}

export interface Placement {
  /** Zero-based cell where the image starts, centered in the area. */
  col: number;
  row: number;
  cols: number;
  rows: number;
  crop: Crop;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 16;
export const ZOOM_STEP = 1.25;
/** Share of the visible region moved by one pan step. */
export const PAN_STEP = 0.15;

export const FIT_VIEW: View = { zoom: 1, cx: 0.5, cy: 0.5 };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Scale (screen px per image px) at which the whole image fits. Capped at 1
 * so a small diagram stays crisp instead of being blown up to fill the pane.
 */
export function fitScale(image: Size, grid: Grid): number {
  return Math.min(
    (grid.cols * grid.cellWidth) / image.width,
    (grid.rows * grid.cellHeight) / image.height,
    1,
  );
}

/** Size, in image pixels, of the region visible at the given zoom. */
function visibleSize(image: Size, grid: Grid, zoom: number): Size {
  const scale = fitScale(image, grid) * zoom;
  return {
    width: Math.min(image.width, (grid.cols * grid.cellWidth) / scale),
    height: Math.min(image.height, (grid.rows * grid.cellHeight) / scale),
  };
}

/** Keeps the center far enough from the edges that the crop stays inside the image. */
function clampView(view: View, image: Size, grid: Grid): View {
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM);
  const visible = visibleSize(image, grid, zoom);
  const halfW = visible.width / image.width / 2;
  const halfH = visible.height / image.height / 2;
  return {
    zoom,
    cx: clamp(view.cx, halfW, 1 - halfW),
    cy: clamp(view.cy, halfH, 1 - halfH),
  };
}

export function layout(view: View, image: Size, grid: Grid): Placement {
  const v = clampView(view, image, grid);
  const scale = fitScale(image, grid) * v.zoom;
  const visible = visibleSize(image, grid, v.zoom);

  const width = Math.max(1, Math.round(visible.width));
  const height = Math.max(1, Math.round(visible.height));
  const x = clamp(Math.round(v.cx * image.width - visible.width / 2), 0, image.width - width);
  const y = clamp(Math.round(v.cy * image.height - visible.height / 2), 0, image.height - height);

  const cols = clamp(Math.round((visible.width * scale) / grid.cellWidth), 1, grid.cols);
  const rows = clamp(Math.round((visible.height * scale) / grid.cellHeight), 1, grid.rows);
  return {
    col: Math.floor((grid.cols - cols) / 2),
    row: Math.floor((grid.rows - rows) / 2),
    cols,
    rows,
    crop: { x, y, width, height },
  };
}

/** Moves the view by `dx`/`dy` pan steps (negative = left/up). */
export function pan(view: View, image: Size, grid: Grid, dx: number, dy: number): View {
  const visible = visibleSize(image, grid, view.zoom);
  return clampView(
    {
      zoom: view.zoom,
      cx: view.cx + (dx * PAN_STEP * visible.width) / image.width,
      cy: view.cy + (dy * PAN_STEP * visible.height) / image.height,
    },
    image,
    grid,
  );
}

/** Zooms around the current center; `steps` > 0 zooms in. */
export function zoom(view: View, image: Size, grid: Grid, steps: number): View {
  return clampView({ ...view, zoom: view.zoom * ZOOM_STEP ** steps }, image, grid);
}
