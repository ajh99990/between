/** Decode UTF-8 only after reassembling bytes: a network chunk can split any character. */
export async function readUtf8Body(stream, limit) {
  const chunks = [];
  let size = 0;
  for await (const part of stream) {
    const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += bytes.length;
    if (size > limit) throw Object.assign(new Error('附件或请求过大'), { status: 413 });
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size).toString('utf8');
}
