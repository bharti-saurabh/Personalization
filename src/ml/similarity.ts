/**
 * Similarity retrieval - "You May Also Like".
 *
 * Substitutes. Given an anchor product, return items a shopper would consider
 * *instead of* it. The mechanism is exact cosine nearest-neighbour search over
 * the hybrid embedding matrix built in embeddings.ts.
 *
 * A production system at catalog scale would use an approximate index (HNSW,
 * IVF-PQ). At 798 products exact search costs ~54k multiply-adds per query and
 * runs in well under a millisecond, so the prototype does the exact thing and
 * is honest about the difference.
 */

import { Product, SimilarityMatch } from '../types';
import { EmbeddingIndex } from './embeddings';

export interface SimilarityOptions {
  limit?: number;
  /** Restrict results to the anchor's team. Off by default; the serving layer decides. */
  sameTeamOnly?: boolean;
  /** Exclude out-of-stock items. */
  inStockOnly?: boolean;
  /** Cap results per (department, style family) pair to keep the carousel varied. */
  maxPerStyle?: number;
  /** Minimum cosine required to be returned at all. */
  minScore?: number;
}

/** Maps embedding block names onto the breakdown fields the UI already renders. */
function breakdownFromBlocks(contributions: { block: string; contribution: number }[]) {
  const by = new Map(contributions.map((c) => [c.block, c.contribution]));
  const pct = (v: number | undefined) => Math.round(Math.max(0, v ?? 0) * 100);
  return {
    teamMatch: pct(by.get('team')),
    playerMatch: pct(by.get('player')),
    deptMatch: pct(by.get('department')),
    styleMatch: pct(by.get('brand_style')),
    priceProximity: pct(by.get('price')),
    coViewStrength: pct(by.get('behaviour_coview')),
  };
}

const BLOCK_LABELS: Record<string, (a: Product, c: Product) => string> = {
  team: (_a, c) => `same team (${c.team})`,
  department: (_a, c) => `same department (${c.department})`,
  player: (_a, c) => (c.player ? `same player (${c.player})` : 'player attribution'),
  brand_style: (_a, c) => `style line (${c.styleFamily})`,
  price: (_a, c) => `comparable price band (${c.priceBand})`,
  behaviour_coview: () => 'frequently viewed in the same session',
  title_text: () => 'closely matching product title',
  image_color: () => 'matching colourway',
  league: (_a, c) => `same league (${c.league})`,
  gender_age: (_a, c) => `same fit (${c.gender})`,
};

function buildExplanation(
  anchor: Product,
  candidate: Product,
  contributions: { block: string; contribution: number }[]
): string {
  const top = contributions
    .filter((c) => c.contribution > 0.01)
    .slice(0, 3)
    .map((c) => BLOCK_LABELS[c.block]?.(anchor, candidate))
    .filter(Boolean);

  if (top.length === 0) {
    return `Retrieved as a nearest neighbour of ${anchor.name} in the product embedding space, though no single signal dominates the match.`;
  }
  return `Recommended because it shares ${top.join(', ')} with ${anchor.name}.`;
}

export interface SimilarityResult extends SimilarityMatch {
  /** Raw cosine in [-1, 1] before any display scaling. */
  cosine: number;
  blockContributions: { block: string; contribution: number }[];
}

export function retrieveSimilar(
  anchor: Product,
  products: Product[],
  index: EmbeddingIndex,
  options: SimilarityOptions = {}
): SimilarityResult[] {
  const { limit = 4, sameTeamOnly = false, inStockOnly = true, maxPerStyle = 2, minScore = 0.05 } = options;

  const anchorIdx = anchor.index;
  if (anchorIdx === undefined) return [];

  // Score every candidate by cosine. Exact search - see module header.
  //
  // `products` may be a filtered subset (the Recommendation Lab passes one), so
  // embedding lookups key off each product's catalog-wide `index`, never its
  // position in this array.
  const scored: { product: Product; catalogIdx: number; cosine: number }[] = [];
  for (const candidate of products) {
    const catalogIdx = candidate.index;
    if (catalogIdx === undefined || catalogIdx === anchorIdx) continue;
    if (sameTeamOnly && candidate.team !== anchor.team) continue;
    if (inStockOnly && candidate.inventoryStatus === 'Pre-Order') continue;

    const cos = index.cosine(anchorIdx, catalogIdx);
    if (cos < minScore) continue;
    scored.push({ product: candidate, catalogIdx, cosine: cos });
  }

  scored.sort((a, b) => b.cosine - a.cosine);

  // Style diversity: avoid returning four near-identical colourways of one item.
  const perStyle = new Map<string, number>();
  const results: SimilarityResult[] = [];

  for (const { product: candidate, catalogIdx, cosine } of scored) {
    if (results.length >= limit) break;

    const styleKey = `${candidate.department}|${candidate.styleFamily}`;
    const used = perStyle.get(styleKey) ?? 0;
    if (used >= maxPerStyle) continue;
    perStyle.set(styleKey, used + 1);

    const contributions = index.explain(anchorIdx, catalogIdx);
    results.push({
      product: candidate,
      totalScore: Number(cosine.toFixed(3)),
      cosine,
      blockContributions: contributions,
      breakdown: breakdownFromBlocks(contributions),
      explanation: buildExplanation(anchor, candidate, contributions),
    });
  }

  return results;
}
