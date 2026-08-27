/**
 * The visitor model: one place that says what the engine believes right now.
 *
 * WHY THIS EXISTS AS A SEPARATE MODULE
 * -----------------------------------
 * `VisitorProfile` in ml/profile.ts is the *fold* - a Bayesian object built for
 * arithmetic, with seeds, evidence maps, drivers and per-key posteriors. It is
 * the right shape for updating and the wrong shape for rendering. Before this
 * module existed, every panel reached into the fold and made its own decision
 * about which keys to show, how to rank them and what counted as movement, so
 * two surfaces reading the same field could and did disagree.
 *
 * A slot is the rendering contract. It is deliberately narrow: a ranked list,
 * one confidence, one evidence count, and the id of the event that last moved
 * it. Everything the storefront personalizes has to name the slot that fed it,
 * which is what lets the rail explain the page without the storefront carrying
 * any explanation of its own.
 *
 * MOVEMENT IS COMPUTED HERE, NOT STORED IN THE FOLD
 * ------------------------------------------------
 * `delta` is the difference against the previous model, and it is computed by
 * diffing two snapshots rather than by asking the fold what it changed. The
 * fold reports writes; a write of the same value is still a write, and an
 * arrow that points somewhere when nothing visibly moved is worse than no
 * arrow. Diffing the rendered scores means the arrow agrees with the number
 * printed next to it, always.
 *
 * This module is React-free and DOM-free, the same rule src/ml and src/sim
 * hold to, so it stays testable from the command line.
 */

import type {
  AgeBand,
  CompletenessReport,
  Dist,
  FacetModel,
  GenderTrait,
  IdentityState,
  ScalarTrait,
  VisitorProfile,
} from '../ml/engine';
import type { PersonaDimensions } from './personas';

/* ------------------------------------------------------------------ slots -- */

export interface SlotEntry<T extends string = string> {
  id: T;
  label: string;
  /** Posterior share, 0-1. Comparable within a slot, not across slots. */
  score: number;
  /**
   * Movement since the previous model, in the same units as `score`.
   *
   * Zero is a real answer and reads as "held". A slot the shopper has given no
   * new evidence for should show nothing moving, and decay alone rarely clears
   * the arrow floor between two consecutive events.
   */
  delta: number;
}

export interface Slot<T extends string = string> {
  ranked: SlotEntry<T>[];
  /** 0-1. The fold's own confidence in this field, not a function of rank. */
  confidence: number;
  evidenceCount: number;
  /**
   * The event that last wrote this slot, or null if nothing has.
   *
   * Carried so the Signals tab can highlight which slots an event moved
   * without re-running the fold, and so the Decisions tab can say "this module
   * changed because of that click" rather than "this module changed".
   */
  lastUpdatedByEvent: string | null;
  /** Decay constant governing this field, surfaced per slot rather than in a footnote. */
  decayLambda: number;
  /** Where the belief came from: session clicks, order history, CRM, or a prior. */
  source: string;
}

/** Names every module on the stage must quote when it explains itself. */
export type SlotId =
  | 'topLeague'
  | 'topTeam'
  | 'topPlayer'
  | 'topCategory'
  | 'priceBand'
  | 'gender'
  | 'giftingPropensity'
  | 'topFilter'
  | 'topFilterValue';

export interface VisitorModel {
  identityStage: IdentityState;
  persona: {
    presetId: string | null;
    label: string;
    dimensions: PersonaDimensions;
    confidence: number;
    /** Runner-up label and margin, so a persona is never shown as a bare claim. */
    runnerUp: string;
    margin: number;
  };
  topLeague: Slot;
  topTeam: Slot;
  topPlayer: Slot;
  topCategory: Slot;
  priceBand: Slot;
  gender: Slot;
  giftingPropensity: Slot;
  topFilter: Slot;
  topFilterValue: Slot;
  /** 0-100, weighted. Replaces the old header meter. */
  completeness: number;
  /** How many events the fold has seen. The denominator for everything above. */
  observedEvents: number;
}

/** Iteration order for anything that walks every slot. Rail order, not alphabetical. */
export const SLOT_IDS: SlotId[] = [
  'topTeam',
  'topLeague',
  'topPlayer',
  'topCategory',
  'priceBand',
  'gender',
  'giftingPropensity',
  'topFilter',
  'topFilterValue',
];

export const SLOT_LABEL: Record<SlotId, string> = {
  topTeam: 'Top team',
  topLeague: 'Top league',
  topPlayer: 'Top player',
  topCategory: 'Top category',
  priceBand: 'Price band',
  gender: 'Fit and gender',
  giftingPropensity: 'Gifting propensity',
  topFilter: 'Best filter',
  topFilterValue: 'Top filter values',
};

/** One line each, in engineering voice: what the slot is for, not what it says. */
export const SLOT_PURPOSE: Record<SlotId, string> = {
  topTeam: 'Drives the hero banner, the teams ladder and every team-filtered rail',
  topLeague: 'Orders the league navigation and the first cut of the catalog',
  topPlayer: 'Feeds the players rail and the player facet on the listing page',
  topCategory: 'Orders the category tiles and the department facet group',
  priceBand: 'Chooses the price framing and whether an offer surface is shown at all',
  gender: 'Sets the default fit, the size prefill and which cut is shown first',
  giftingPropensity: 'Opens the gifting rail and suppresses the size prefill when it is high',
  topFilter: 'Orders the facet rail on the listing page, so the filter this shopper uses sits first',
  topFilterValue: 'Pre-expands the leading facet and orders the values inside it',
};

/* --------------------------------------------------------------- building -- */

const TOP_N = 3;

/** Arrow floor. Below this a movement is noise and the rail says "held". */
export const DELTA_FLOOR = 0.005;

function entriesFromDist<K extends string>(
  dist: Dist<K>,
  labelOf: (k: K) => string,
  previous: Slot | undefined
): SlotEntry[] {
  const prior = new Map(previous?.ranked.map((r) => [r.id, r.score]) ?? []);
  return (Object.keys(dist.posterior) as K[])
    .map((k) => ({
      id: k as string,
      label: labelOf(k),
      score: dist.posterior[k],
      delta: dist.posterior[k] - (prior.get(k as string) ?? dist.posterior[k]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);
}

function slotFromDist<K extends string>(
  dist: Dist<K>,
  labelOf: (k: K) => string,
  previous: Slot | undefined
): Slot {
  return {
    ranked: entriesFromDist(dist, labelOf, previous),
    confidence: dist.confidence.value,
    evidenceCount: dist.confidence.evidenceCount,
    // The fold records drivers newest-first, so the head is the last writer.
    lastUpdatedByEvent: dist.drivers[0]?.eventId ?? null,
    decayLambda: dist.confidence.decayLambda,
    source: dist.confidence.source,
  };
}

/**
 * Turns a 0-1 scalar into a ranked slot over named bands.
 *
 * A scalar has no runner-up of its own, and a slot that renders as a single
 * number cannot be compared against the ones that render as ladders. Banding
 * it gives the rail one shape to draw and gives the storefront something to
 * name: "shows the value band" is a decision, "shows 0.62" is not.
 */
function slotFromScalar(
  trait: ScalarTrait,
  bands: { id: string; label: string; centre: number }[],
  previous: Slot | undefined
): Slot {
  const prior = new Map(previous?.ranked.map((r) => [r.id, r.score]) ?? []);
  // Soft assignment by inverse distance, so a value sitting between two bands
  // reports both rather than snapping to one and hiding the ambiguity.
  const weights = bands.map((b) => ({ b, w: 1 / (0.08 + Math.abs(trait.value - b.centre)) }));
  const total = weights.reduce((a, x) => a + x.w, 0);
  const ranked = weights
    .map(({ b, w }) => ({
      id: b.id,
      label: b.label,
      score: w / total,
      delta: w / total - (prior.get(b.id) ?? w / total),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);

  return {
    ranked,
    confidence: trait.confidence.value,
    evidenceCount: trait.confidence.evidenceCount,
    lastUpdatedByEvent: previous?.lastUpdatedByEvent ?? null,
    decayLambda: trait.confidence.decayLambda,
    source: trait.confidence.source,
  };
}

const PRICE_BANDS = [
  { id: 'value', label: 'Value led', centre: 0.85 },
  { id: 'mid', label: 'Mid market', centre: 0.5 },
  { id: 'premium', label: 'Premium', centre: 0.15 },
];

const GIFT_BANDS = [
  { id: 'self', label: 'Shopping for self', centre: 0.1 },
  { id: 'mixed', label: 'Mixed basket', centre: 0.5 },
  { id: 'gift', label: 'Shopping for others', centre: 0.9 },
];

const GENDER_LABEL: Record<GenderTrait, string> = {
  mens: "Men's",
  womens: "Women's",
  unisex: 'Unisex',
  kids: 'Kids',
};

export const AGE_LABEL: Record<AgeBand, string> = {
  kids: 'Kids',
  teen: 'Teen',
  adult: 'Adult',
  senior: 'Senior',
};

/**
 * The facet model in slot shape.
 *
 * The other slots read the Bayesian fold; these two read a second model that
 * folds the same event stream over a different question - which control the
 * shopper reaches for, rather than what they are shopping for. It is kept
 * separate because its evidence is separate: nothing but an actual filter tick
 * counts, and a department prior stands in until one arrives.
 */
function slotFromFacets(facets: FacetModel, previous: Slot | undefined): Slot {
  const prior = new Map(previous?.ranked.map((r) => [r.id, r.score]) ?? []);
  const ranked = facets.ranked.slice(0, TOP_N).map((f) => ({
    id: f.key as string,
    label: f.label,
    score: f.score,
    delta: f.score - (prior.get(f.key as string) ?? f.score),
  }));

  return {
    ranked,
    confidence: facets.confidence,
    evidenceCount: facets.evidenceCount,
    lastUpdatedByEvent: facets.lastUpdatedByEvent,
    decayLambda: facets.decayLambda,
    source: facets.usingPrior ? 'Category prior, no filter used yet' : 'Filter applications this session',
  };
}

/**
 * The values inside the leading facet.
 *
 * Ranks values within one facet rather than across all of them, because "Eagles
 * ahead of Cowboys" only means anything once you have said which control they
 * are values of. The slot label carries the facet name for that reason.
 */
function slotFromFacetValues(facets: FacetModel, previous: Slot | undefined): Slot {
  const lead = facets.ranked[0];
  const prior = new Map(previous?.ranked.map((r) => [r.id, r.score]) ?? []);
  const values = lead?.values ?? [];
  const total = values.reduce((a, v) => a + v.score, 0) || 1;

  const ranked = values.slice(0, TOP_N).map((v) => ({
    id: `${lead?.key ?? 'none'}:${v.value}`,
    label: lead ? `${v.value} in ${lead.label.toLowerCase()}` : v.value,
    score: v.score / total,
    delta: v.score / total - (prior.get(`${lead?.key ?? 'none'}:${v.value}`) ?? v.score / total),
  }));

  const observed = values.some((v) => v.basis === 'observed');
  return {
    ranked,
    // Values inside an untouched facet are borrowed from the affinity fold, so
    // they are never claimed at the parent facet's confidence.
    confidence: observed ? facets.confidence : facets.confidence * 0.5,
    evidenceCount: facets.evidenceCount,
    lastUpdatedByEvent: facets.lastUpdatedByEvent,
    decayLambda: facets.decayLambda,
    source: observed ? 'Values ticked in this facet' : 'Borrowed from the affinity posterior',
  };
}

/**
 * Folds the profile into the rendering shape.
 *
 * `previous` is last render's model. Passing null on the first build is correct
 * and yields every delta at zero, which is the honest reading of a session that
 * has not moved yet.
 */
export function buildVisitorModel(
  profile: VisitorProfile,
  completeness: CompletenessReport,
  dimensions: PersonaDimensions,
  presetId: string | null,
  facets: FacetModel,
  previous: VisitorModel | null
): VisitorModel {
  return {
    identityStage: profile.identityState,
    persona: {
      presetId,
      label: profile.persona.label,
      dimensions,
      confidence: profile.persona.confidence.value,
      runnerUp: profile.persona.runnerUp,
      margin: profile.persona.margin,
    },
    topLeague: slotFromDist(profile.affinities.league, (k) => k, previous?.topLeague),
    topTeam: slotFromDist(profile.affinities.team, (k) => k, previous?.topTeam),
    topPlayer: slotFromDist(profile.affinities.player, (k) => k, previous?.topPlayer),
    topCategory: slotFromDist(profile.affinities.department, (k) => k, previous?.topCategory),
    priceBand: slotFromScalar(profile.traits.priceSensitivity, PRICE_BANDS, previous?.priceBand),
    gender: slotFromDist(profile.traits.gender, (k) => GENDER_LABEL[k], previous?.gender),
    giftingPropensity: slotFromScalar(profile.traits.giftIntent, GIFT_BANDS, previous?.giftingPropensity),
    topFilter: slotFromFacets(facets, previous?.topFilter),
    topFilterValue: slotFromFacetValues(facets, previous?.topFilterValue),
    completeness: completeness.percent,
    observedEvents: profile.observedEvents,
  };
}

/** The slot's leading entry, or null when the slot is empty. */
export function leaderOf(slot: Slot): SlotEntry | null {
  return slot.ranked[0] ?? null;
}

/**
 * Which slots a given event moved.
 *
 * Reads `lastUpdatedByEvent` rather than re-deriving, so the Signals tab and
 * the Visitor tab can never disagree about who wrote what.
 */
export function slotsMovedBy(model: VisitorModel, eventId: string): SlotId[] {
  return SLOT_IDS.filter((id) => model[id].lastUpdatedByEvent === eventId);
}
