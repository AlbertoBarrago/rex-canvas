/**
 * Escape sequences for the kitty graphics protocol
 * (https://sw.kovidgoyal.net/kitty/graphics-protocol/). Pure string builders,
 * so they can be tested without a terminal.
 *
 * Every command carries `q=2` so the terminal never answers: replies would
 * otherwise land on stdin and mix with key presses.
 */

const APC = '\x1b_G';
const ST = '\x1b\\';

/** Base64 payload per chunk; the protocol caps it at 4096 and wants a multiple of 4. */
export const CHUNK_SIZE = 4096;

export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Uploads a PNG under `id` without displaying it (`a=t`), split into chunks.
 * Placing is a separate step so pan and zoom never resend the image.
 */
export function transmitPng(id: number, png: Uint8Array): string {
  const data = Buffer.from(png).toString('base64');
  const parts: string[] = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    const more = i + CHUNK_SIZE < data.length ? 1 : 0;
    const keys = i === 0 ? `a=t,f=100,t=d,i=${id},q=2,m=${more}` : `m=${more}`;
    parts.push(`${APC}${keys};${chunk}${ST}`);
  }
  return parts.join('');
}

/**
 * Shows the `crop` region of image `id` scaled into `cols` x `rows` cells at
 * the cursor. Reusing the same placement id replaces the previous placement,
 * which is how pan and zoom update the view. `C=1` keeps the cursor still.
 */
export function placeImage(opts: {
  id: number;
  placementId: number;
  cols: number;
  rows: number;
  crop: Crop;
}): string {
  const { id, placementId, cols, rows, crop } = opts;
  return (
    `${APC}a=p,i=${id},p=${placementId},c=${cols},r=${rows},` +
    `x=${crop.x},y=${crop.y},w=${crop.width},h=${crop.height},C=1,q=2${ST}`
  );
}

/** Deletes image `id` and frees its data (`d=I`, uppercase). */
export function deleteImage(id: number): string {
  return `${APC}a=d,d=I,i=${id},q=2${ST}`;
}

/**
 * Asks whether the terminal speaks the protocol: a 1x1 RGB query that is
 * answered with `OK` (or an error) under image id `id`, and never stored.
 */
export function supportQuery(id: number): string {
  return `${APC}i=${id},s=1,v=1,a=q,t=d,f=24;AAAA${ST}`;
}
