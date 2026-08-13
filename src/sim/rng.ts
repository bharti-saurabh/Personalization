/**
 * Deterministic pseudo-random number generation.
 *
 * Every synthetic artefact in this application - catalog, customer population,
 * session logs, co-occurrence graphs - is produced from a fixed seed. Reloading
 * the page reproduces byte-identical data, which is what makes the demo safe to
 * present live: rankings never shuffle between renders.
 */

/** Mulberry32: small, fast, statistically adequate for simulation work. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash - used to derive stable per-entity seeds from ids. */
export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  private next: () => number;

  constructor(seed: number | string) {
    this.next = mulberry32(typeof seed === 'string' ? hashString(seed) : seed);
  }

  /** Uniform in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Uniform pick from a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * Weighted pick. `weights` need not be normalised; non-positive weights are
   * treated as zero. Falls back to the last item on floating point shortfall.
   */
  pickWeighted<T>(arr: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return arr[arr.length - 1];
    let r = this.next() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }

  /** Standard normal via Box-Muller. */
  gaussian(mean = 0, stdDev = 1): number {
    const u1 = Math.max(1e-9, this.next());
    const u2 = this.next();
    return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Log-normal - the natural shape for prices and engagement counts. */
  logNormal(mu: number, sigma: number): number {
    return Math.exp(this.gaussian(mu, sigma));
  }

  /** Zipf-ish weights over n ranks; models the long tail of product popularity. */
  static zipfWeights(n: number, exponent = 1.1): number[] {
    const w: number[] = [];
    for (let i = 0; i < n; i++) w.push(1 / Math.pow(i + 1, exponent));
    return w;
  }

  /** Fisher-Yates, returning a new array. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Sample k distinct items without replacement (k is clamped to arr.length). */
  sample<T>(arr: readonly T[], k: number): T[] {
    return this.shuffle(arr).slice(0, Math.min(k, arr.length));
  }
}

/** Softmax with temperature. Numerically stabilised by max-subtraction. */
export function softmax(logits: number[], temperature = 1): number[] {
  if (logits.length === 0) return [];
  const t = Math.max(1e-6, temperature);
  const scaled = logits.map((l) => l / t);
  const max = Math.max(...scaled);
  const exps = scaled.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

/**
 * Shannon entropy of a probability distribution, normalised to [0, 1] against
 * the uniform distribution over the same support. 0 = fully certain,
 * 1 = maximally uncertain. This is what drives model confidence downstream.
 */
export function normalisedEntropy(probs: number[]): number {
  const n = probs.length;
  if (n <= 1) return 0;
  let h = 0;
  for (const p of probs) {
    if (p > 1e-12) h -= p * Math.log(p);
  }
  return Math.min(1, Math.max(0, h / Math.log(n)));
}
