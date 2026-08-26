/**
 * The Recommended sort, as an explicit model output.
 *
 * WHY THIS FILE EXISTS AT ALL. The default listing order was already a model
 * output - popularity reweighted by the intent posterior - but it lived as a
 * six-line comparator inside ProductListingPage.tsx and was labelled
 * "Featured". Both of those were wrong in the same way. "Featured" is the word
 * retailers use for a merchandiser's hand-ordered shelf, so the one place in
 * the demo where a model decides what a shopper sees first was named after a
 * human decision. And a scoring function that only exists inside a component
 * cannot be tested, cannot be explained to the panel, and cannot be pointed at
 * in a review.
 *
 * So the comparator moved here, unchanged, and the label became "Recommended".
 *
 * THE ARITHMETIC IS BYTE-IDENTICAL TO WHAT SHIPPED. Same weights, same base,
 * same tie-breaking, same off-switch behaviour. This is a relocation with an
 * explanation attached, not a re-tune - the ordering a client saw last week is
 * the ordering they see now, which is the only way "we made it explainable"
 * stays a true sentence.
 *
 *     score = (popularity / 100) x (1 + 2.0 x P(team) + 1.2 x P(department))
 *
 * WHAT THE TWO WEIGHTS MEAN, stated because a panel that shows a number
 * without its unit is showing decoration. Both are multipliers on a popularity
 * base in [0,1]. A product whose team the model is certain about (P = 1) gets
 * three times its shelf weight; one whose department is certain gets 2.2x. Team
 * outranks department deliberately: in licensed sports the club is the identity
 * and the garment is the expression of it, and a shopper who wants an Eagles
 * hat is far better served by an Eagles jersey than by a Cowboys hat.
 *
 * WITH PERSONALIZATION OFF this collapses to popularity, which is exactly what
 * an un-personalized featured shelf is. That is not a degraded mode bolted on
 * for the demo - it is the honest baseline the whole comparison rests on.
 *
 * THE GATE. `rankRecommended` does not read the confidence gate itself; the
 * caller passes `personalizationOn`, which already folds in the store switch.
 * The gate belongs to the surface, not to the scorer - see ml/engine.ts.
 *
 * DOM-free by contract, like everything else in src/ml.
 */

import { Product } from '../types';
import { VisitorProfile } from './profile';

/** One named term in a product's multiplier, with the number it contributed. */
export interface RankDriver {
  label: string;
  /** The constant this term is multiplied by. */
  weight: number;
  /** The posterior (or trait) the weight was applied to, in [0,1]. */
  value: number;
  /** weight x value - what this term added to the multiplier. */
  contribution: number;
}

export interface RankedProduct {
  product: Product;
  /** 1-based position in the personalized order. */
  rank: number;
  /** 1-based position the same set would have had on popularity alone. */
  defaultRank: number;
  score: number;
  /** popularity / 100, before any personalization. */
  base: number;
  /** 1 + the sum of every driver's contribution. */
  multiplier: number;
  drivers: RankDriver[];
}

/** A product the personalized order moved, and by how far. */
export interface RankMovement {
  productId: string;
  name: string;
  from: number;
  to: number;
  /** Positive when the model promoted it. */
  delta: number;
}

export interface RankingExplanation {
  surface: string;
  /** False when personalization is off - the order is then plain popularity. */
  active: boolean;
  formula: string;
  /** The full ranked pool, in order. */
  ordered: Product[];
  /** Decomposition for the head of the list only; the tail is not rendered. */
  items: RankedProduct[];
  considered: number;
  /** Promotions and demotions inside the explained head, largest move first. */
  moved: RankMovement[];
  weights: { label: string; weight: number; note: string }[];
}

/**
 * The two weights, exported so the panel quotes the same constants the sort
 * used rather than a copy that can drift out of step with it.
 */
export const RECOMMENDED_WEIGHTS = {
  team: 2.0,
  department: 1.2,
} as const;

export const RECOMMENDED_FORMULA =
  'score = (popularity / 100) x (1 + 2.0 x P(team) + 1.2 x P(department))';

/** How many head items get a full driver decomposition. */
const EXPLAIN_TOP = 6;

export interface RecommendedInput {
  /** P(team) by team id, from the live intent posterior. */
  teamProb: Map<string, number>;
  /** P(department) by department id, from the live intent posterior. */
  deptProb: Map<string, number>;
  /** The store switch. Off means popularity, and the explanation says so. */
  personalizationOn: boolean;
  /** Label for the panel. Defaults to the listing grid. */
  surface?: string;
  explainTop?: number;
}

/**
 * Orders a result set and explains the order.
 *
 * The returned `ordered` array is what the grid renders. Everything else on
 * the object exists so the panel can say why, and none of it is read back into
 * the sort - an explanation that can change an outcome is not an explanation.
 */
export function rankRecommended(pool: Product[], input: RecommendedInput): RankingExplanation {
  const { teamProb, deptProb, personalizationOn } = input;
  const surface = input.surface ?? 'Result grid';
  const explainTop = input.explainTop ?? EXPLAIN_TOP;

  // The un-personalized order, always computed. It costs one sort of the same
  // array and it is the only way `moved` can be a measurement rather than a
  // claim: paired against the default at the moment the order was made, the
  // same discipline ml/effort.ts uses.
  const byPopularity = pool.slice().sort((a, b) => b.popularity - a.popularity);
  const defaultRank = new Map(byPopularity.map((p, i) => [p.id, i + 1]));

  const driversFor = (p: Product): RankDriver[] => {
    const tp = teamProb.get(p.team) ?? 0;
    const dp = deptProb.get(p.department) ?? 0;
    return [
      {
        label: `P(${p.team})`,
        weight: RECOMMENDED_WEIGHTS.team,
        value: tp,
        contribution: RECOMMENDED_WEIGHTS.team * tp,
      },
      {
        label: `P(${p.department})`,
        weight: RECOMMENDED_WEIGHTS.department,
        value: dp,
        contribution: RECOMMENDED_WEIGHTS.department * dp,
      },
    ];
  };

  const scoreOf = (p: Product) =>
    (p.popularity / 100) *
    (1 + RECOMMENDED_WEIGHTS.team * (teamProb.get(p.team) ?? 0) + RECOMMENDED_WEIGHTS.department * (deptProb.get(p.department) ?? 0));

  const ordered = personalizationOn ? pool.slice().sort((a, b) => scoreOf(b) - scoreOf(a)) : byPopularity;

  const items: RankedProduct[] = ordered.slice(0, explainTop).map((p, i) => {
    const drivers = personalizationOn ? driversFor(p) : [];
    const multiplier = 1 + drivers.reduce((a, d) => a + d.contribution, 0);
    return {
      product: p,
      rank: i + 1,
      defaultRank: defaultRank.get(p.id) ?? i + 1,
      score: personalizationOn ? scoreOf(p) : p.popularity / 100,
      base: p.popularity / 100,
      multiplier,
      drivers,
    };
  });

  const moved: RankMovement[] = personalizationOn
    ? items
        .filter((it) => it.defaultRank !== it.rank)
        .map((it) => ({
          productId: it.product.id,
          name: it.product.name,
          from: it.defaultRank,
          to: it.rank,
          delta: it.defaultRank - it.rank,
        }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    : [];

  return {
    surface,
    active: personalizationOn,
    formula: personalizationOn ? RECOMMENDED_FORMULA : 'score = popularity / 100',
    ordered,
    items,
    considered: pool.length,
    moved,
    weights: [
      {
        label: 'Team affinity',
        weight: RECOMMENDED_WEIGHTS.team,
        note: 'the club is the identity; the garment expresses it',
      },
      {
        label: 'Department affinity',
        weight: RECOMMENDED_WEIGHTS.department,
        note: 'what kind of thing, given the club',
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Profile posteriors as plain maps                                     */
/* ------------------------------------------------------------------ */

/**
 * The profile's four affinity posteriors, flattened to maps.
 *
 * Search ranks on these rather than on the in-session intent posterior, for one
 * reason: intent has no player axis and no gift trait, and both of those are
 * exactly what a typed query needs. The profile is still a pure fold over
 * observed events, so this reads no ground truth - the leakage guard holds.
 */
export interface ProfileAffinities {
  team: Map<string, number>;
  department: Map<string, number>;
  player: Map<string, number>;
  league: Map<string, number>;
  /** ScalarTrait value in [0,1]. Zero when there is no profile. */
  giftIntent: number;
}

const asMap = (rec: Record<string, number>): Map<string, number> => new Map(Object.entries(rec));

export function profileAffinities(profile: VisitorProfile | null): ProfileAffinities {
  if (!profile) {
    return {
      team: new Map(),
      department: new Map(),
      player: new Map(),
      league: new Map(),
      giftIntent: 0,
    };
  }
  return {
    team: asMap(profile.affinities.team.posterior),
    department: asMap(profile.affinities.department.posterior),
    player: asMap(profile.affinities.player.posterior),
    league: asMap(profile.affinities.league.posterior),
    giftIntent: profile.traits.giftIntent.value,
  };
}
