/** Builds a PNG-shaped buffer: signature, IHDR, optional extra chunks, IEND. CRCs are zero (not checked). */
export function fakePng(width: number, height: number, extra: Array<[string, number]> = []): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...extra.map(([type, size]) => chunk(type, Buffer.alloc(size))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
