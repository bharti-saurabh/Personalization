/**
 * Out-of-stock substitution, as its own ranking decision.
 *
 * THIS IS NOT THE SIMILARITY ENGINE WITH A FILTER ON IT, and the difference is
 * the whole reason the module exists. The two rankers optimise for different
 * things and they disagree, often, on the same pool:
 *
 *   SIMILARITY    "what else is like this?" - a question about the catalog.
 *                 Its best answer is the nearest neighbour in embedding space,
 *                 and it is perfectly happy for that neighbour to be a
 *                 pre-order the shopper cannot have for six weeks.
 *   SUBSTITUTION  "what still satisfies the request you already made?" - a
 *                 question about the shopper. The request had a size in it, and
 *                 a date. An item that cannot be had, in that size, now, scores
 *                 zero however close it sits in embedding space.
 *
 * A store that answers the second question with the first ranker produces the
 * failure every shopper has met: you click a sold-out jersey, and the row
 * underneath is four more sold-out jerseys. `divergence` on the result is the
 * demo artefact that makes the distinction visible - it lists the products the
 * two rankers place differently, with both ranks, so the difference can be read
 * off the screen instead of asserted.
 *
 * AVAILABILITY IS A GATE, NOT A FEATURE. Scoring it as one more weighted term
 * means a sufficiently similar unavailable product outranks a slightly less
 * similar available one, which is exactly the bug. It is applied first and the
 * rejects are kept, with their reasons, on the same principle as the
 * suppression gate: a refusal nobody can see is indistinguishable from an empty
 * catalog.
 *
 * No React, no DOM.
 */

import type { Product } from '../types';
import { ladderFor, sizeAvailability } from './fit';

export type UnavailabilityReason = 'size_out_of_stock' | 'product_preorder' | 'product_unavailable';

export type RejectReason = 'not_available' | 'not_in_size' | 'is_the_anchor' | 'wrong_body';

export interface SubstituteScore {
  product: Product;
  score: number;
  breakdown: {
    player: number;
    team: number;
    department: number;
    subdepartment: number;
    style: number;
    price: number;
  };
  /** What survives from the original request. Rendered as a list of chips. */
  keeps: string[];
  /** What the shopper gives up by taking it. Rendered beside `keeps`. */
  concedes: string[];
  /** The size this substitute would be bought in. */
  size: string | null;
  explanation: string;
}

export interface SubstitutionResult {
  anchor: Product;
  /** The size that could not be had, when the failure was a size and not a product. */
  requestedSize: string | null;
  reason: UnavailabilityReason;
  /** What the ranker was told to maximise, in words, for the panel. */
  objective: string;
  ranked: SubstituteScore[];
  chosen: SubstituteScore | null;
  /** Everything the availability gate removed, with its reason. */
  rejected: { product: Product; reason: RejectReason; detail: string }[];
  /**
   * The same surviving pool, ordered by raw catalog similarity instead.
   *
   * Held so the screen can show the two orderings side by side. Computed from
   * the same inputs in the same call - the pairing discipline the effort ledger
   * asks for, applied to a ranking rather than to a saving.
   */
  similarityOrder: string[];
  /** Products the two rankings place differently, worst disagreement first. */
  divergence: { productId: string; name: string; substitutionRank: number; similarityRank: number }[];
  /** How many candidates were considered before the gate. */
  poolSize: number;
}

/**
 * Weights, stated.
 *
 * They are a continuity ladder, not a similarity metric: each one is a piece of
 * the original request that the substitute either preserves or loses. Player
 * leads because a shopper who clicked a Hurts jersey wanted Hurts, and a
 * different player in the same club is a different purchase - not a near miss.
 */
export const CONTINUITY_WEIGHTS = {
  player: 0.3,
  team: 0.24,
  department: 0.18,
  subdepartment: 0.08,
  style: 0.1,
  price: 0.1,
} as const;

/** Beyond this, the price gap stops being a substitution and starts being an upsell. */
export const PRICE_TOLERANCE = 0.25;

function priceScore(anchor: Product, p: Product): number {
  const a = anchor.salePrice ?? anchor.price;
  const b = p.salePrice ?? p.price;
  const gap = Math.abs(b - a) / Math.max(1, a);
  return gap >= PRICE_TOLERANCE ? 0 : 1 - gap / PRICE_TOLERANCE;
}

/** The size a substitute would be bought in: the requested one, else its best available. */
function sizeFor(p: Product, requested: string | null): string | null {
  const ladder = ladderFor(p);
  const avail = sizeAvailability(p);
  if (requested && ladder.includes(requested)) return avail[requested] ? requested : null;
  const first = ladder.find((s) => avail[s]);
  return first ?? null;
}

export interface SubstitutionOptions {
  /** How many to return. */
  limit?: number;
  /**
   * Raw similarity score per candidate id, for the divergence table.
   *
   * Passed in rather than computed here so this module never imports the
   * embedding index - substitution has to be runnable in a test, in the
   * harness, and on a page that has not built the models.
   */
  similarityScores?: Record<string, number>;
}

/**
 * Rank what the shopper can actually have instead.
 */
export function runSubstitution(
  anchor: Product,
  pool: Product[],
  requestedSize: string | null,
  opts: SubstitutionOptions = {}
): SubstitutionResult {
  const limit = opts.limit ?? 4;
  const anchorAvail = sizeAvailability(anchor);

  const reason: UnavailabilityReason =
    anchor.inventoryStatus === 'Pre-Order'
      ? 'product_preorder'
      : requestedSize && anchorAvail[requestedSize] === false
        ? 'size_out_of_stock'
        : 'product_unavailable';

  const rejected: SubstitutionResult['rejected'] = [];
  const survivors: { product: Product; size: string }[] = [];

  for (const p of pool) {
    if (p.id === anchor.id) {
      rejected.push({ product: p, reason: 'is_the_anchor', detail: 'the product that is not available' });
      continue;
    }
    // A substitute has to be for the same person. A youth jersey does not
    // replace an adult one however close the vectors are.
    if (p.ageGroup !== anchor.ageGroup) {
      rejected.push({ product: p, reason: 'wrong_body', detail: `${p.ageGroup} sizing, the anchor is ${anchor.ageGroup}` });
      continue;
    }
    if (p.inventoryStatus === 'Pre-Order') {
      rejected.push({ product: p, reason: 'not_available', detail: 'pre-order: cannot be had now either' });
      continue;
    }
    const size = sizeFor(p, requestedSize);
    if (!size) {
      rejected.push({
        product: p,
        reason: 'not_in_size',
        detail: requestedSize ? `no ${requestedSize} left` : 'no size left on the ladder',
      });
      continue;
    }
    survivors.push({ product: p, size });
  }

  const scored: SubstituteScore[] = survivors.map(({ product: p, size }) => {
    const breakdown = {
      player: anchor.player && p.player === anchor.player ? CONTINUITY_WEIGHTS.player : 0,
      team: p.team === anchor.team ? CONTINUITY_WEIGHTS.team : 0,
      department: p.department === anchor.department ? CONTINUITY_WEIGHTS.department : 0,
      subdepartment: p.subdepartment === anchor.subdepartment ? CONTINUITY_WEIGHTS.subdepartment : 0,
      style: p.styleFamily === anchor.styleFamily ? CONTINUITY_WEIGHTS.style : 0,
      price: Number((priceScore(anchor, p) * CONTINUITY_WEIGHTS.price).toFixed(4)),
    };
    const score = Number(Object.values(breakdown).reduce((a, b) => a + b, 0).toFixed(4));

    const keeps: string[] = [];
    const concedes: string[] = [];
    (breakdown.player > 0 ? keeps : anchor.player ? concedes : keeps).push(
      breakdown.player > 0 ? anchor.player! : anchor.player ? `not ${anchor.player}` : 'no player on the anchor'
    );
    (breakdown.team > 0 ? keeps : concedes).push(breakdown.team > 0 ? p.team : `${p.team}, not ${anchor.team}`);
    (breakdown.department > 0 ? keeps : concedes).push(
      breakdown.department > 0 ? p.department : `${p.department}, not ${anchor.department}`
    );
    if (breakdown.style > 0) keeps.push(p.styleFamily);
    const a = anchor.salePrice ?? anchor.price;
    const b = p.salePrice ?? p.price;
    if (Math.abs(b - a) / Math.max(1, a) > 0.1) {
      concedes.push(`$${b.toFixed(0)} against $${a.toFixed(0)}`);
    }

    return {
      product: p,
      score,
      breakdown,
      keeps,
      concedes,
      size,
      explanation:
        `Available in ${size}. Keeps ${keeps.length} of the things you asked for` +
        (concedes.length ? `, changes ${concedes.length}.` : '.'),
    };
  });

  scored.sort((x, y) => y.score - x.score || x.product.name.localeCompare(y.product.name));
  const ranked = scored.slice(0, limit);

  // The same survivors, ordered the way the similarity engine would have. When
  // no scores were handed in, fall back to popularity - which is what a store
  // with no similarity model does, and is still a different ordering to this one.
  const sim = opts.similarityScores;
  const similarityRanked = [...scored].sort((x, y) => {
    const sx = sim ? (sim[x.product.id] ?? 0) : x.product.popularity / 100;
    const sy = sim ? (sim[y.product.id] ?? 0) : y.product.popularity / 100;
    return sy - sx || x.product.name.localeCompare(y.product.name);
  });
  const similarityOrder = similarityRanked.map((s) => s.product.id);

  const subRankOf = new Map(scored.map((s, i) => [s.product.id, i + 1]));
  const simRankOf = new Map(similarityRanked.map((s, i) => [s.product.id, i + 1]));
  const divergence = scored
    .map((s) => ({
      productId: s.product.id,
      name: s.product.name,
      substitutionRank: subRankOf.get(s.product.id)!,
      similarityRank: simRankOf.get(s.product.id)!,
    }))
    .filter((d) => d.substitutionRank !== d.similarityRank)
    .sort(
      (x, y) =>
        Math.abs(y.substitutionRank - y.similarityRank) - Math.abs(x.substitutionRank - x.similarityRank) ||
        x.substitutionRank - y.substitutionRank
    )
    .slice(0, 6);

  return {
    anchor,
    requestedSize,
    reason,
    objective:
      requestedSize
        ? `Available in ${requestedSize} today, then continuity of the request - player, club, department, cut - then price within ${(PRICE_TOLERANCE * 100).toFixed(0)}%.`
        : `Available today, then continuity of the request - player, club, department, cut - then price within ${(PRICE_TOLERANCE * 100).toFixed(0)}%.`,
    ranked,
    chosen: ranked[0] ?? null,
    rejected,
    similarityOrder,
    divergence,
    poolSize: pool.length,
  };
}

/**
 * Whether this product, in this size, needs the substitution ranker at all.
 *
 * Kept beside the ranker so the two can never disagree about what "unavailable"
 * means. A surface that has to decide whether to show the panel asks this, and
 * a surface that shows it calls `runSubstitution`.
 */
export function needsSubstitute(product: Product, size: string | null): boolean {
  if (product.inventoryStatus === 'Pre-Order') return true;
  if (!size) return false;
  return sizeAvailability(product)[size] === false;
}
