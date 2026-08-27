/**
 * Merchandising badges, with the population statistic behind them.
 *
 * A badge is a claim about a product made in two words. "Best Seller" asserts a
 * ranking without naming the population it ranks over, the window it was
 * measured in, or how many other products carry the same flag - and a store
 * where a third of the grid says Best Seller has not made a claim, it has made
 * a decoration. The tell is always the cohort size: nobody ever prints it.
 *
 * So every badge in this build carries four things, and the tile shows them on
 * hover:
 *
 *   RULE     the threshold that assigned it, stated as arithmetic. Not "our
 *            merchandising team selects" - the actual comparison, from
 *            src/sim/catalog.ts, quoted.
 *   STAT     where this product sits in the catalog distribution the rule is
 *            applied to.
 *   COHORT   how many other products carry the same badge, and what share of
 *            the catalog that is. This is the number that makes a badge either
 *            informative or noise, and it is the number a shopper is never
 *            given.
 *   BASIS    measured or simulated. Popularity here is a synthetic field, so
 *            everything derived from it says so once, at the bottom, rather
 *            than hedging every line.
 *
 * The index is built once per catalog generation and read on hover. Computing a
 * percentile inside a tooltip handler would be a sort per mouse move.
 *
 * No React, no DOM.
 */

import type { Product } from '../types';

export interface BadgeStat {
  /** The badge as printed on the tile. */
  badge: string;
  /** One line of merchandising language - what the badge is asserting. */
  claim: string;
  /** The rule that assigned it, quoted from the catalog generator. */
  rule: string;
  /** Where this product sits in the distribution the rule reads. */
  stat: string;
  /** How many products in the catalog carry this badge. */
  cohort: number;
  /** That count as a share of the catalog, 0..1. */
  cohortShare: number;
  /** This product's percentile in the underlying field, 0..1. Null when the rule is not a threshold. */
  percentile: number | null;
  /** True when the number behind the claim is a simulated field rather than a count of events. */
  simulated: boolean;
}

export interface BadgeIndex {
  catalogSize: number;
  /** Ascending popularity, for percentile lookups. */
  popularity: number[];
  /** Ascending release recency. */
  recency: number[];
  /** Discount percentages on the discounted subset only, ascending. */
  discounts: number[];
  counts: {
    bestSeller: number;
    popular: number;
    justDropped: number;
    sale: number;
    lowStock: number;
    preOrder: number;
    marketFlag: number;
    moved: number;
  };
  medianDiscount: number;
}

/** Share of `sorted` at or below `v`. Binary search; the arrays are catalog-sized. */
function percentileOf(sorted: number[], v: number): number {
  if (sorted.length === 0) return 0;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
}

function discountOf(p: Product): number | null {
  if (!p.salePrice) return null;
  return ((p.price - p.salePrice) / p.price) * 100;
}

export function buildBadgeIndex(products: Product[]): BadgeIndex {
  const popularity = products.map((p) => p.popularity).sort((a, b) => a - b);
  const recency = products.map((p) => p.releaseRecency ?? 1).sort((a, b) => a - b);
  const discounts = products
    .map(discountOf)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);

  const counts = {
    bestSeller: products.filter((p) => p.badge === 'Best Seller').length,
    popular: products.filter((p) => p.badge === 'Popular').length,
    justDropped: products.filter((p) => p.badge === 'Just Dropped').length,
    sale: products.filter((p) => p.salePrice).length,
    lowStock: products.filter((p) => p.inventoryStatus === 'Low Stock').length,
    preOrder: products.filter((p) => p.inventoryStatus === 'Pre-Order').length,
    marketFlag: products.filter((p) => p.marketFlag).length,
    moved: products.filter((p) => p.movedFrom).length,
  };

  return {
    catalogSize: products.length,
    popularity,
    recency,
    discounts,
    counts,
    medianDiscount: discounts.length ? discounts[Math.floor(discounts.length / 2)] : 0,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function share(n: number, total: number): string {
  return `${n} of ${total} products (${pct(total ? n / total : 0)})`;
}

/**
 * Every badge on this product, each with the statistic behind it.
 *
 * Returned as a list rather than a single value because a product can carry
 * three at once - a traded Best Seller that is also low on stock - and each is
 * a separate claim that deserves its own number.
 */
export function badgeStatsFor(product: Product, index: BadgeIndex): BadgeStat[] {
  const out: BadgeStat[] = [];
  const n = index.catalogSize;

  if (product.marketFlag) {
    const f = product.marketFlag;
    out.push({
      badge: product.movedFrom ? `From ${product.movedFrom.team}` : f.lift < 1 ? 'Demand cut' : 'Hot market',
      claim: f.headline,
      rule: `stamped by the market-event pass when event ${f.eventId} touched this product`,
      stat:
        `popularity multiplier ${f.lift.toFixed(2)}x, ${f.monthsSince} month${f.monthsSince === 1 ? '' : 's'} after the event. ` +
        `${share(index.counts.marketFlag, n)} carry a flag from any fired event` +
        (index.counts.moved > 0 ? `; ${index.counts.moved} changed club.` : '.'),
      cohort: index.counts.marketFlag,
      cohortShare: n ? index.counts.marketFlag / n : 0,
      percentile: null,
      simulated: true,
    });
  }

  const disc = discountOf(product);
  if (disc !== null) {
    out.push({
      badge: `${Math.round(disc)}% OFF`,
      claim: 'Marked down from list',
      rule: 'salePrice set by the catalog generator on a sampled subset',
      stat:
        `${Math.round(disc)}% off, against a median markdown of ${Math.round(index.medianDiscount)}% across the ` +
        `${index.discounts.length} discounted products. ${share(index.counts.sale, n)} are on sale at all.`,
      cohort: index.counts.sale,
      cohortShare: n ? index.counts.sale / n : 0,
      percentile: percentileOf(index.discounts, disc),
      simulated: true,
    });
  }

  if (product.badge === 'Best Seller') {
    const p = percentileOf(index.popularity, product.popularity);
    out.push({
      badge: 'Best Seller',
      claim: 'Among the strongest sellers in the catalog',
      rule: 'popularity > 88 of 100',
      stat:
        `popularity ${product.popularity.toFixed(0)} - higher than ${pct(p)} of the catalog. ` +
        `${share(index.counts.bestSeller, n)} clear the same bar.`,
      cohort: index.counts.bestSeller,
      cohortShare: n ? index.counts.bestSeller / n : 0,
      percentile: p,
      simulated: true,
    });
  } else if (product.badge === 'Popular') {
    const p = percentileOf(index.popularity, product.popularity);
    out.push({
      badge: 'Popular',
      claim: 'Sells above the catalog average',
      rule: 'popularity > 74 of 100, and no stronger badge applied',
      stat:
        `popularity ${product.popularity.toFixed(0)} - higher than ${pct(p)} of the catalog. ` +
        `${share(index.counts.popular, n)} carry this badge; the ${index.counts.bestSeller} above 88 carry Best Seller instead.`,
      cohort: index.counts.popular,
      cohortShare: n ? index.counts.popular / n : 0,
      percentile: p,
      simulated: true,
    });
  } else if (product.badge === 'Just Dropped') {
    const r = product.releaseRecency ?? 1;
    const p = percentileOf(index.recency, r);
    out.push({
      badge: 'Just Dropped',
      claim: 'New to the catalog',
      rule: 'releaseRecency < 0.12, where 0 is a brand-new release and 1 is a long-standing line',
      stat:
        `recency ${r.toFixed(3)} - newer than ${pct(1 - p)} of the catalog. ` +
        `${share(index.counts.justDropped, n)} are this new.`,
      cohort: index.counts.justDropped,
      cohortShare: n ? index.counts.justDropped / n : 0,
      percentile: 1 - p,
      simulated: true,
    });
  }

  if (product.inventoryStatus === 'Low Stock') {
    out.push({
      badge: 'Almost gone',
      claim: 'Limited stock remaining',
      rule: 'inventoryStatus is Low Stock on the catalog feed',
      stat:
        `${share(index.counts.lowStock, n)} are low on stock. Per-size availability on this product is derived ` +
        `from its id, so it is the same in every arm of every comparison - see ml/fit.ts.`,
      cohort: index.counts.lowStock,
      cohortShare: n ? index.counts.lowStock / n : 0,
      percentile: null,
      simulated: true,
    });
  }

  if (product.inventoryStatus === 'Pre-Order') {
    out.push({
      badge: 'Pre-Order',
      claim: 'Not shippable today',
      rule: 'inventoryStatus is Pre-Order on the catalog feed',
      stat:
        `${share(index.counts.preOrder, n)} are pre-order. These are excluded from the substitution ranker as ` +
        `candidates, because a substitute that cannot be had is not a substitute.`,
      cohort: index.counts.preOrder,
      cohortShare: n ? index.counts.preOrder / n : 0,
      percentile: null,
      simulated: true,
    });
  }

  return out;
}

/**
 * The one-line disclosure that goes under any tooltip built from this module.
 *
 * Held here so it cannot drift between the four surfaces that render a badge.
 */
export const BADGE_BASIS_NOTE =
  'Popularity, recency and markdown are fields of the synthetic catalog. The percentiles and counts above are real ' +
  'computations over that catalog; the catalog itself is simulated.';
