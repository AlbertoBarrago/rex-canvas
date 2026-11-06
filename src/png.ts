/**
 * Minimal PNG inspection: enough to know an image's size and whether the
 * file on disk is complete. Producers such as the Markasso MCP write the PNG
 * with a plain `writeFile`, so the viewer can catch a file mid-write; walking
 * the chunk list up to `IEND` tells a finished file from a truncated one
 * without decoding any pixels.
 */

export interface PngInfo {
  width: number;
  height: number;
}

export type PngCheck =
  | { ok: true; info: PngInfo }
  | { ok: false; reason: 'signature' | 'ihdr' | 'truncated' };

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Chunk header (length + type) plus trailing CRC. */
const CHUNK_OVERHEAD = 12;

function chunkType(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(buf[offset]!, buf[offset + 1]!, buf[offset + 2]!, buf[offset + 3]!);
}

function readUint32(buf: Uint8Array, offset: number): number {
  return ((buf[offset]! << 24) | (buf[offset + 1]! << 16) | (buf[offset + 2]! << 8) | buf[offset + 3]!) >>> 0;
}

/**
 * Checks the signature, reads IHDR, and follows the chunks up to IEND.
 * CRCs are not verified: truncation is the failure this guards against.
 */
export function inspectPng(buf: Uint8Array): PngCheck {
  if (buf.length < SIGNATURE.length || SIGNATURE.some((b, i) => buf[i] !== b)) {
    return { ok: false, reason: 'signature' };
  }
  let offset = SIGNATURE.length;
  if (buf.length < offset + CHUNK_OVERHEAD + 13) return { ok: false, reason: 'truncated' };
  if (readUint32(buf, offset) !== 13 || chunkType(buf, offset + 4) !== 'IHDR') {
    return { ok: false, reason: 'ihdr' };
  }
  const width = readUint32(buf, offset + 8);
  const height = readUint32(buf, offset + 12);
  if (width === 0 || height === 0) return { ok: false, reason: 'ihdr' };

  while (offset + 8 <= buf.length) {
    const length = readUint32(buf, offset);
    const type = chunkType(buf, offset + 4);
    const end = offset + CHUNK_OVERHEAD + length;
    if (end > buf.length) return { ok: false, reason: 'truncated' };
    if (type === 'IEND') return { ok: true, info: { width, height } };
    offset = end;
  }
  return { ok: false, reason: 'truncated' };
}
