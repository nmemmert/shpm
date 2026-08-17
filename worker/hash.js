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

export function hammingDistance(a, b) {
  let xor = BigInt('0x' + a) ^ BigInt('0x' + b);
  let dist = 0;
  while (xor > 0n) {
    dist += Number(xor & 1n);
    xor >>= 1n;
  }
  return dist;
}
