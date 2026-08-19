import sharp from 'sharp';

// dHash (difference hash): 9×8 → 64-bit comparison → 16-char hex string.
// Two images with Hamming distance ≤ 10 are near-duplicates.
export async function computeDHash(filepath) {
  const { data } = await sharp(filepath)
    .resize(9, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left  = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      hash = (hash << 1n) | (left < right ? 1n : 0n);
    }
  }
  return hash.toString(16).padStart(16, '0');
}

function popcount32(n) {
  n = n >>> 0;
  n -= (n >> 1) & 0x55555555;
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  n = (n + (n >> 4)) & 0x0f0f0f0f;
  return Math.imul(n, 0x01010101) >>> 24;
}

export function hammingDistance(a, b) {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 64;
  const xorHi = (parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) >>> 0;
  const xorLo = (parseInt(a.slice(8),    16) ^ parseInt(b.slice(8),    16)) >>> 0;
  return popcount32(xorHi) + popcount32(xorLo);
}
