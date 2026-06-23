// ---------------------------------------------------------------------------
// Seeded PRNG — so bootstrap intervals and permutation p-values are
// reproducible for a given scan (they must not flicker every render, and a
// cited number has to be stable). Never use Math.random here.
// ---------------------------------------------------------------------------

// mulberry32: tiny, fast, good-enough 32-bit PRNG. Returns a function → [0,1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Derive a deterministic 32-bit seed from one or more numeric/boolean arrays.
// Same scan data → same seed → same interval / p-value.
export function seedFrom(...arrays) {
  let h = 0x811c9dc5 >>> 0;
  for (const arr of arrays) {
    h = Math.imul(h ^ arr.length, 0x01000193) >>> 0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i] === true ? 1 : arr[i] === false ? 0 : arr[i] | 0;
      h = Math.imul(h ^ (v + i * 2654435761), 0x01000193) >>> 0;
    }
  }
  return h >>> 0;
}
