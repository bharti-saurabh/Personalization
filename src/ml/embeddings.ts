/**
 * Hybrid product embeddings.
 *
 * Each product is projected into a single dense vector that fuses four
 * different kinds of signal, in the same arrangement a production two-tower
 * retrieval model would use:
 *
 *   - structured metadata (team, league, department, gender, age, price)
 *   - text            - feature hashing over the product title
 *   - image           - a colourway histogram standing in for a vision encoder
 *   - behaviour       - a sparse random projection of the product's PPMI-weighted
 *                       co-view neighbourhood
 *
 * NOTHING HERE IS TRAINED. The block weights are chosen by hand, not learned by
 * gradient descent. What *is* real is the linear algebra: these are genuine
 * vectors, compared with genuine cosine similarity, and the behavioural block is
 * a genuine dimensionality reduction of the co-view graph. That is the honest
 * claim to make about this prototype - the retrieval mechanism is real, the
 * parameters are designed rather than fitted.
 *
 * Feature hashing (the "hashing trick") and sparse random projection are both
 * standard, citable techniques; they are what make an untrained text and
 * behaviour encoder defensible rather than arbitrary.
 */

import { Product } from '../types';
import { CoMatrix, CoGraphs } from '../sim/behavior';
import { hashString } from '../sim/rng';
import { DEPARTMENT_IDS, LEAGUES, TEAM_IDS } from '../sim/taxonomy';

/**
 * Block layout. Each block occupies a contiguous slice of the vector, is L2
 * normalised on its own, then scaled by its weight. Cosine similarity between
 * two products therefore decomposes exactly into a weighted sum of per-block
 * agreements - which is what lets the UI show an honest score breakdown instead
 * of an invented one.
 */
interface Block {
  name: string;
  size: number;
  weight: number;
}

export const BLOCKS: Block[] = [
  { name: 'team', size: TEAM_IDS.length, weight: 1.0 },
  { name: 'league', size: LEAGUES.length, weight: 0.3 },
  { name: 'department', size: DEPARTMENT_IDS.length, weight: 0.9 },
  { name: 'player', size: 6, weight: 0.8 },
  { name: 'gender_age', size: 7, weight: 0.25 },
  { name: 'price', size: 3, weight: 0.35 },
  { name: 'brand_style', size: 8, weight: 0.35 },
  { name: 'title_text', size: 16, weight: 0.5 },
  { name: 'image_color', size: 6, weight: 0.3 },
  { name: 'behaviour_coview', size: 10, weight: 0.6 },
];

export const BLOCK_OFFSETS: Record<string, { offset: number; size: number; weight: number }> = (() => {
  const map: Record<string, { offset: number; size: number; weight: number }> = {};
  let offset = 0;
  for (const b of BLOCKS) {
    map[b.name] = { offset, size: b.size, weight: b.weight };
    offset += b.size;
  }
  return map;
})();

export const EMBEDDING_DIM = BLOCKS.reduce((a, b) => a + b.size, 0);

const GENDERS: Product['gender'][] = ['Men', 'Women', 'Unisex', 'Kids'];
const AGE_GROUPS: Product['ageGroup'][] = ['Adult', 'Kids', 'Toddler'];

/** Signed feature hashing: maps a token into one of `size` slots with a +/- sign. */
function hashInto(target: Float32Array, offset: number, size: number, token: string, value = 1): void {
  const h = hashString(token);
  const slot = h % size;
  const sign = (h >>> 31) & 1 ? -1 : 1;
  target[offset + slot] += sign * value;
}

/** L2-normalise a slice in place, then scale it by the block weight. */
function normaliseBlock(vec: Float32Array, offset: number, size: number, weight: number): void {
  let norm = 0;
  for (let i = offset; i < offset + size; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm < 1e-9) return;
  const scale = weight / norm;
  for (let i = offset; i < offset + size; i++) vec[i] *= scale;
}

/** Parse "#RRGGBB" into normalised rgb components. */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  if (Number.isNaN(n)) return [0.5, 0.5, 0.5];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Positive Pointwise Mutual Information over a co-occurrence row.
 *
 * PPMI(i,j) = max(0, log( P(i,j) / (P(i) * P(j)) ))
 *
 * This is the step that stops raw popularity from dominating: a pair only
 * scores highly if it co-occurs more than the two products' individual
 * frequencies would predict.
 */
function ppmiRow(matrix: CoMatrix, i: number, rowSums: Float64Array, grandTotal: number): Map<number, number> {
  const out = new Map<number, number>();
  const row = matrix.get(i);
  if (!row || grandTotal <= 0 || rowSums[i] <= 0) return out;

  for (const [j, count] of row) {
    if (rowSums[j] <= 0) continue;
    const pmi = Math.log((count * grandTotal) / (rowSums[i] * rowSums[j]));
    if (pmi > 0) out.set(j, pmi);
  }
  return out;
}

/** Deterministic +/-1 projection vector for a product index (sparse random projection). */
function projectionVector(index: number, size: number): Float32Array {
  const v = new Float32Array(size);
  for (let d = 0; d < size; d++) {
    const h = hashString(`proj:${index}:${d}`);
    v[d] = (h & 1) === 0 ? 1 : -1;
  }
  return v;
}

export interface EmbeddingIndex {
  /** Row-major matrix, `products.length` x EMBEDDING_DIM, each row unit-length. */
  matrix: Float32Array;
  dim: number;
  /** Per-block contribution of a single pair, for explainability. */
  explain(i: number, j: number): { block: string; contribution: number }[];
  cosine(i: number, j: number): number;
}

export function buildEmbeddingIndex(products: Product[], graphs: CoGraphs): EmbeddingIndex {
  const n = products.length;
  const dim = EMBEDDING_DIM;
  const matrix = new Float32Array(n * dim);

  // Row sums and grand total for the PPMI computation over the co-view graph.
  const rowSums = new Float64Array(n);
  let grandTotal = 0;
  for (const [i, row] of graphs.coView) {
    let s = 0;
    for (const v of row.values()) s += v;
    rowSums[i] = s;
    grandTotal += s;
  }

  const teamIdx = new Map(TEAM_IDS.map((t, i) => [t, i]));
  const leagueIdx = new Map(LEAGUES.map((l, i) => [l, i]));
  const deptIdx = new Map(DEPARTMENT_IDS.map((d, i) => [d, i]));

  const B = BLOCK_OFFSETS;

  for (let p = 0; p < n; p++) {
    const product = products[p];
    const base = p * dim;
    const vec = matrix.subarray(base, base + dim);

    // --- structured metadata -------------------------------------------------
    vec[B.team.offset + (teamIdx.get(product.team) ?? 0)] = 1;
    vec[B.league.offset + (leagueIdx.get(product.league) ?? 0)] = 1;
    vec[B.department.offset + (deptIdx.get(product.department) ?? 0)] = 1;

    if (product.player) hashInto(vec, B.player.offset, B.player.size, `player:${product.player}`);

    const gi = GENDERS.indexOf(product.gender);
    if (gi >= 0) vec[B.gender_age.offset + gi] = 1;
    const ai = AGE_GROUPS.indexOf(product.ageGroup);
    if (ai >= 0) vec[B.gender_age.offset + GENDERS.length + ai] = 1;

    // Price on a log scale, plus a coarse band indicator. Log scale so that the
    // gap between $20 and $40 counts the same as $100 to $200.
    const effectivePrice = product.salePrice ?? product.price;
    const logPrice = Math.log(Math.max(1, effectivePrice));
    vec[B.price.offset] = logPrice / Math.log(400);
    vec[B.price.offset + 1] = product.salePrice ? 1 : 0;
    vec[B.price.offset + 2] = product.priceBand.length / 4;

    hashInto(vec, B.brand_style.offset, B.brand_style.size, `brand:${product.brand}`);
    hashInto(vec, B.brand_style.offset, B.brand_style.size, `style:${product.styleFamily}`, 0.9);
    hashInto(vec, B.brand_style.offset, B.brand_style.size, `sub:${product.subdepartment}`, 0.7);

    // --- text encoder proxy: feature hashing over title tokens ---------------
    const tokens = product.name.toLowerCase().split(/[^a-z0-9']+/).filter((t) => t.length > 1);
    for (const token of tokens) {
      hashInto(vec, B.title_text.offset, B.title_text.size, `tok:${token}`, 1 / Math.sqrt(tokens.length));
    }

    // --- image encoder proxy: colourway histogram ----------------------------
    const [r1, g1, b1] = hexToRgb(product.primaryColor);
    const [r2, g2, b2] = hexToRgb(product.secondaryColor);
    vec[B.image_color.offset] = r1;
    vec[B.image_color.offset + 1] = g1;
    vec[B.image_color.offset + 2] = b1;
    vec[B.image_color.offset + 3] = r2;
    vec[B.image_color.offset + 4] = g2;
    vec[B.image_color.offset + 5] = b2;

    // --- behavioural block: sparse random projection of the PPMI co-view row --
    const ppmi = ppmiRow(graphs.coView, p, rowSums, grandTotal);
    for (const [j, weight] of ppmi) {
      const proj = projectionVector(j, B.behaviour_coview.size);
      for (let d = 0; d < B.behaviour_coview.size; d++) {
        vec[B.behaviour_coview.offset + d] += proj[d] * weight;
      }
    }

    // Normalise every block, then the whole vector, so cosine is bounded and
    // block contributions are directly comparable.
    for (const block of BLOCKS) {
      normaliseBlock(vec, B[block.name].offset, B[block.name].size, B[block.name].weight);
    }
    let norm = 0;
    for (let d = 0; d < dim; d++) norm += vec[d] * vec[d];
    norm = Math.sqrt(norm);
    if (norm > 1e-9) {
      for (let d = 0; d < dim; d++) vec[d] /= norm;
    }
  }

  const cosine = (i: number, j: number): number => {
    const a = i * dim;
    const b = j * dim;
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += matrix[a + d] * matrix[b + d];
    return dot;
  };

  const explain = (i: number, j: number) => {
    const a = i * dim;
    const b = j * dim;
    return BLOCKS.map((block) => {
      const { offset, size } = B[block.name];
      let contribution = 0;
      for (let d = offset; d < offset + size; d++) contribution += matrix[a + d] * matrix[b + d];
      return { block: block.name, contribution };
    }).sort((x, y) => y.contribution - x.contribution);
  };

  return { matrix, dim, cosine, explain };
}
