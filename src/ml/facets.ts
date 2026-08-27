/**
 * The facet model: which filter the shopper reaches for next, and what they
 * pick inside it.
 *
 * WHY THIS IS ITS OWN MODEL AND NOT A LOOKUP TABLE
 * ------------------------------------------------
 * It used to be a lookup table. `intent.ts` still carries it - a switch on the
 * predicted department returning five filter names in a fixed order, the same
 * five for every shopper who ever landed on Jerseys. That is a merchandising
 * rule wearing a model's clothes, and it has the failure a rule always has:
 * two shoppers with completely different histories get the identical rail
 * because they happen to be looking at the same department.
 *
 * The facet a shopper reaches for is a prediction with evidence behind it. A
 * player-first fan filters by player on every visit and has never once touched
 * Brand. A parent buying for a child filters by Size and Gender before anything
 * else. A deal seeker opens Price first and nothing else at all. All three of
 * those are observable in the event stream, they decay like every other belief
 * in this build, and they are worth more than the department prior the moment
 * there are two of them.
 *
 * TWO QUESTIONS, NOT ONE
 * ----------------------
 * "Which filter" and "which value in it" are different predictions with
 * different evidence, and collapsing them is the mistake that makes facet
 * personalization feel wrong. The filter ranking is a behavioural question -
 * how does this person narrow a catalog - and it is answered from filter usage.
 * The value ranking is a taste question - which club, which player, which price
 * band - and it is answered from the profile posteriors, which is where taste
 * already lives. Reading the value off usage would mean a shopper who has
 * ticked one box gets that box ranked above a club the fold is 80% sure of.
 *
 * THE PRIOR IS KEPT, AND IT IS KEPT VISIBLE
 * -----------------------------------------
 * The department table is not deleted; it becomes the prior, and its weight
 * falls away as observations arrive. A cold shopper gets the merchandiser's
 * ordering, which is the right answer when nothing is known, and every filter
 * they touch moves the rail further from it. `basis` on each row says which of
 * the two is currently doing the work, so the screen can never claim a learned
 * ordering it did not learn.
 *
 * No React, no DOM: the harness runs this.
 */

import type { Department, Product, UserEvent } from '../types';
import { DEPARTMENT_IDS } from '../sim/taxonomy';
import type { VisitorProfile } from './profile';

/* ----------------------------------------------------------------- keys -- */

/**
 * The facet vocabulary. Identical to the listing page's own rail keys, and it
 * has to stay identical: a facet the model ranks that the rail cannot render
 * is a prediction with nowhere to land.
 */
export type FacetKey =
  | 'league'
  | 'department'
  | 'team'
  | 'player'
  | 'brand'
  | 'gender'
  | 'size'
  | 'colorway'
  | 'price';

export const FACET_KEYS: FacetKey[] = [
  'league',
  'department',
  'team',
  'player',
  'brand',
  'gender',
  'size',
  'colorway',
  'price',
];

export const FACET_LABEL: Record<FacetKey, string> = {
  league: 'League',
  department: 'Category',
  team: 'Team',
  player: 'Player',
  brand: 'Brand',
  gender: 'Gender',
  size: 'Size',
  colorway: 'Color',
  price: 'Price',
};

/**
 * Which profile field answers "what value inside this facet".
 *
 * Null means the facet has no posterior behind it and its values can only come
 * from what the shopper has actually ticked. Brand, size and colour sit there
 * on purpose: the fold holds no brand belief and no colour belief, and
 * inventing one so every row could be filled would be the worst kind of
 * completeness.
 */
const VALUE_SOURCE: Record<FacetKey, 'league' | 'team' | 'player' | 'department' | 'gender' | 'price' | null> = {
  league: 'league',
  department: 'department',
  team: 'team',
  player: 'player',
  gender: 'gender',
  price: 'price',
  brand: null,
  size: null,
  colorway: null,
};

/**
 * How fast a filter habit is given up.
 *
 * Faster than department (0.08) and slower than gift intent (0.2). A shopper
 * who filtered by size twice last visit probably still shops by size; a
 * shopper who opened Price once during a sale is not a price filterer forever.
 * Half-life is about four events, which is roughly one narrowing pass through
 * a listing page.
 */
export const FACET_LAMBDA = 0.17;

/**
 * How much a single observed filter application is worth against the prior.
 *
 * One tick of usage outweighs the department prior's top slot, which is the
 * behaviour that makes the rail feel like it is following the shopper rather
 * than following the catalog. Two makes it decisive.
 */
export const USAGE_WEIGHT = 1.0;
export const PRIOR_WEIGHT = 0.45;

/**
 * Below this the model is not allowed to claim it has learned anything and the
 * rail is told to fall back on the funnel. Denominated in decayed observations,
 * the same units `evidenceCount` reports.
 */
export const FACET_EVIDENCE_FLOOR = 1.0;

/* ---------------------------------------------------------------- prior -- */

/**
 * The merchandiser's ordering, per department, as a weight per facet.
 *
 * Same knowledge the `intent.ts` table encodes, in a shape that can be mixed
 * with evidence instead of replacing it. Weights fall off geometrically down
 * each list, so first place is worth about three times fifth.
 */
const DEPARTMENT_PRIOR: Record<string, FacetKey[]> = {
  Jerseys: ['player', 'size', 'team', 'gender', 'price'],
  Hats: ['team', 'size', 'brand', 'colorway', 'price'],
  Kids: ['size', 'gender', 'team', 'department', 'price'],
  Hoodies: ['size', 'team', 'gender', 'colorway', 'price'],
  Collectibles: ['player', 'team', 'price', 'brand', 'league'],
  'T-shirts': ['size', 'gender', 'team', 'colorway', 'price'],
  Accessories: ['department', 'team', 'price', 'brand', 'colorway'],
};

/** What a shopper with no department read gets: the generic narrowing ladder. */
const GENERIC_PRIOR: FacetKey[] = ['team', 'department', 'price', 'size', 'brand'];

function priorWeights(dept: Department | null): Record<FacetKey, number> {
  const order = (dept && DEPARTMENT_PRIOR[dept]) || GENERIC_PRIOR;
  const out = {} as Record<FacetKey, number>;
  for (const k of FACET_KEYS) out[k] = 0;
  order.forEach((k, i) => {
    out[k] = Math.pow(0.78, i);
  });
  return out;
}

/* ------------------------------------------------------------- observed -- */

/**
 * Reads a recorded filter back into a facet key and a value.
 *
 * The storefront writes `key=value`; the persona seeds and the search path
 * write `Label: value`. Both are real and both have to parse, because a model
 * that only understands the events one code path emits is a model that is
 * blind to the shopper's own history.
 */
export function parseFacetEvent(event: UserEvent): { key: FacetKey; value: string } | null {
  const raw = event.filterApplied;
  if (!raw) return null;

  const split = (sep: string) => {
    const at = raw.indexOf(sep);
    return at === -1 ? null : { head: raw.slice(0, at).trim(), tail: raw.slice(at + 1).trim() };
  };

  const parts = split('=') ?? split(':');
  if (!parts) return null;

  const head = parts.head.toLowerCase();
  const direct = FACET_KEYS.find((k) => k === head);
  if (direct) return { key: direct, value: parts.tail };

  // The label form. 'Category' and 'Color' are the display names of keys that
  // are spelled differently in the code, so they are mapped rather than matched.
  const byLabel: Record<string, FacetKey> = {
    category: 'department',
    color: 'colorway',
    colour: 'colorway',
    dept: 'department',
  };
  const mapped = byLabel[head] ?? FACET_KEYS.find((k) => FACET_LABEL[k].toLowerCase() === head);
  return mapped ? { key: mapped, value: parts.tail } : null;
}

/* ---------------------------------------------------------------- shape -- */

export interface FacetValueBelief {
  value: string;
  /** 0-1 within the facet. Comparable inside a row, not across rows. */
  score: number;
  /** Where the value came from. `observed` beats `posterior` beats `none`. */
  basis: 'observed' | 'posterior';
}

export interface FacetBelief {
  key: FacetKey;
  label: string;
  /** 0-1, normalised across the nine facets. P(this is the next filter used). */
  score: number;
  /** Decayed observations of this facet being applied. */
  usage: number;
  /** The department prior's contribution to this row, before normalising. */
  prior: number;
  /**
   * Which of the two is currently doing the work.
   *
   * `learned` once usage outweighs the prior on this row, `prior` while the
   * merchandiser's ordering still leads, `mixed` in between. Rendered rather
   * than inferred, so a rail can never present a merchandising default as a
   * personalized ordering.
   */
  basis: 'learned' | 'mixed' | 'prior';
  /** Top values inside the facet, best first. Empty when nothing supports one. */
  values: FacetValueBelief[];
}

export interface FacetModel {
  /** All nine, best first. Never filtered - a facet with no evidence is a fact. */
  ranked: FacetBelief[];
  /** 0-1 over the whole model, from total evidence against the floor. */
  confidence: number;
  /** Total decayed filter applications behind the ranking. */
  evidenceCount: number;
  /** How many raw filter events were read, before decay. */
  observedFilters: number;
  /** The event that last moved this model, or null. */
  lastUpdatedByEvent: string | null;
  /** True while the department prior is still the ordering on screen. */
  usingPrior: boolean;
  decayLambda: number;
}

/* ----------------------------------------------------------------- fold -- */

function topFromPosterior(
  posterior: Record<string, number>,
  limit: number
): FacetValueBelief[] {
  return Object.entries(posterior)
    .filter(([, v]) => v > 0.001)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, score]) => ({ value, score, basis: 'posterior' as const }));
}

/** The price scalar, banded onto the labels the listing page's rail uses. */
function priceValues(sensitivity: number): FacetValueBelief[] {
  const bands = [
    { value: 'Under $50', centre: 0.85 },
    { value: '$50 to $100', centre: 0.55 },
    { value: '$100 to $200', centre: 0.3 },
    { value: 'Over $200', centre: 0.1 },
  ];
  const weights = bands.map((b) => ({ b, w: 1 / (0.1 + Math.abs(sensitivity - b.centre)) }));
  const total = weights.reduce((a, x) => a + x.w, 0);
  return weights
    .map(({ b, w }) => ({ value: b.value, score: w / total, basis: 'posterior' as const }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Runs the model.
 *
 * `events` is newest-first, which is the order every other consumer in this
 * build uses. The catalog is optional and is read for one thing only: dropping
 * facet values that no longer exist in it after a market rebuild, so the rail
 * never proposes a filter that would return nothing.
 */
export function runFacetModel(
  events: UserEvent[],
  profile: VisitorProfile,
  catalog?: Product[]
): FacetModel {
  const usage = {} as Record<FacetKey, number>;
  const observedValues = {} as Record<FacetKey, Record<string, number>>;
  for (const k of FACET_KEYS) {
    usage[k] = 0;
    observedValues[k] = {};
  }

  let observedFilters = 0;
  let lastUpdatedByEvent: string | null = null;

  // Newest first, so the index IS the age in events and the decay is a plain
  // exponential on it. Folding oldest-first would need a second pass to know
  // how old anything was.
  events.forEach((event, age) => {
    const parsed = parseFacetEvent(event);
    if (!parsed) return;
    observedFilters += 1;
    if (lastUpdatedByEvent === null) lastUpdatedByEvent = event.id;
    const weight = USAGE_WEIGHT * Math.exp(-FACET_LAMBDA * age);
    usage[parsed.key] += weight;
    observedValues[parsed.key][parsed.value] = (observedValues[parsed.key][parsed.value] ?? 0) + weight;
  });

  const leadDept = profile.affinities.department.top as string | null;
  const prior = priorWeights(isDepartment(leadDept) ? leadDept : null);

  const evidenceCount = FACET_KEYS.reduce((sum, k) => sum + usage[k], 0);

  // Available catalog values, for the two facets whose values only ever come
  // from what the shopper ticked. A market rebuild can retire a brand.
  const live = catalog
    ? {
        brand: new Set(catalog.map((p) => p.brand)),
        colorway: new Set(catalog.map((p) => p.colorway).filter(Boolean) as string[]),
        size: new Set(catalog.flatMap((p) => p.sizes ?? [])),
      }
    : null;

  const raw = FACET_KEYS.map((key) => {
    const u = usage[key];
    const p = prior[key] * PRIOR_WEIGHT;
    const basis: FacetBelief['basis'] = u > p * 1.5 ? 'learned' : u > p * 0.5 ? 'mixed' : 'prior';

    const observed = Object.entries(observedValues[key])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const observedTotal = observed.reduce((s, [, v]) => s + v, 0);

    let values: FacetValueBelief[] = observed.map(([value, v]) => ({
      value,
      score: observedTotal > 0 ? v / observedTotal : 0,
      basis: 'observed' as const,
    }));

    // Only when the shopper has never ticked anything in this facet. A ticked
    // box is a statement and a posterior is an inference; the statement wins.
    if (values.length === 0) {
      const src = VALUE_SOURCE[key];
      if (src === 'price') values = priceValues(profile.traits.priceSensitivity.value);
      else if (src === 'gender') values = topFromPosterior(profile.traits.gender.posterior, 3);
      else if (src) values = topFromPosterior(profile.affinities[src].posterior, 3);
    }

    if (live && (key === 'brand' || key === 'colorway' || key === 'size')) {
      values = values.filter((v) => live[key].has(v.value));
    }

    return { key, label: FACET_LABEL[key], score: u + p, usage: u, prior: prior[key], basis, values };
  });

  const total = raw.reduce((s, r) => s + r.score, 0) || 1;

  return {
    ranked: raw
      .map((r) => ({ ...r, score: r.score / total }))
      .sort((a, b) => b.score - a.score || FACET_KEYS.indexOf(a.key) - FACET_KEYS.indexOf(b.key)),
    // Saturating rather than linear: the tenth filter application should not
    // read as ten times more certain than the first.
    confidence: Number((1 - Math.exp(-evidenceCount / 2.5)).toFixed(3)),
    evidenceCount: Number(evidenceCount.toFixed(3)),
    observedFilters,
    lastUpdatedByEvent,
    usingPrior: evidenceCount < FACET_EVIDENCE_FLOOR,
    decayLambda: FACET_LAMBDA,
  };
}

/**
 * The facet ordering, as the plain string list `IntentResult.topFilters`
 * carries.
 *
 * A bridge, and a deliberately narrow one. The listing page's rail already
 * consumes that shape, and giving the new model a way to speak it means the
 * rail can be moved onto it without a second rework of the page that owns the
 * most delicate ranking code in the build.
 */
export function facetOrder(model: FacetModel): FacetKey[] {
  return model.ranked.map((r) => r.key);
}

/** `Department` is a string union, so a membership test needs the widening. */
export function isDepartment(value: string | null | undefined): value is Department {
  return !!value && (DEPARTMENT_IDS as readonly string[]).includes(value);
}
