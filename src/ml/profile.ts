/**
 * The visitor profile - the thing the rankers are consumers of.
 *
 * Intent used to be recomputed from the raw event stream on every call. That
 * works, but it means the only durable asset in the system is the event log:
 * nothing accumulates, nothing carries a confidence, and nothing can be shown to
 * a client as the thing they are actually buying. This module is the profile
 * those events fold into.
 *
 * THREE PROPERTIES, ALL LOAD-BEARING.
 *
 * 1. IT IS A PURE FOLD. `applyEvent(profile, event, clock)` returns a new
 *    profile and the deltas that produced it. It mutates nothing, reads no
 *    module state, and touches no DOM - so the evaluation harness can fold a
 *    synthetic customer's history under tsx exactly as the browser folds a live
 *    session, and get the same answer. Engines take a profile as an argument and
 *    write to it never.
 *
 * 2. IT CARRIES EVIDENCE, NOT JUST POSTERIORS. A posterior cannot be folded -
 *    normalising throws away the mass you need to add the next observation to.
 *    So every `Dist` keeps a decayed evidence accumulator alongside its
 *    posterior, in "current tick" units: each new event first ages what is
 *    already there by `exp(-lambda)`, then adds its own weight at 1.0. That is
 *    algebraically identical to the `exp(-lambda * ageRank)` sweep in intent.ts,
 *    which is what lets the two coexist during the transition.
 *
 * 3. CONFIDENCE READS THE MARGIN. `top * sufficiency` - the old rule - cannot
 *    tell a clean 60/10 call from a coin-flip 60/58. Both are "60% confident"
 *    and only one is worth reshaping a storefront over. Confidence here is
 *    discounted by how far the leader actually is from the runner-up, and the
 *    discount is built so that an unambiguous call reduces to exactly the old
 *    formula. See `distConfidence`.
 *
 * Layout note: flat file, types exported from the module that owns them, same as
 * intent.ts and complement.ts. Persona scoring is the one thing split out, into
 * persona.ts, because it is a different computation - distances to archetypes
 * rather than an accumulation of evidence.
 */

import { Department, League, Scenario, TeamId, UserEvent } from '../types';
import { softmax } from '../sim/rng';
import {
  DEPARTMENTS,
  DEPARTMENT_IDS,
  LEAGUES,
  LEAGUE_SEASONALITY,
  SIM_MONTH,
  TEAMS,
  TEAM_BY_ID,
  TEAM_IDS,
} from '../sim/taxonomy';
import { scorePersona } from './persona';
import type { PersonaBlock, PersonaFeatures } from './persona';
import { seedWrites } from './identity';
import type { IdentitySeed, SeedWrite } from './identity';

/* ------------------------------------------------------------------ types -- */

/** Where a field's current value came from. Rendered as a badge in the panel. */
export type ProfileSource = 'session' | 'history' | 'crm' | 'prior' | 'inferred';

/** Identity ladder. Only `anonymous` and `member` are reachable today; the
 *  promotion control that walks the rungs is workstream 2. */
export type IdentityState = 'anonymous' | 'contextual' | 'returning' | 'identified' | 'member';

export interface Confidence {
  /** 0..1. For a distribution, produced by `distConfidence`. */
  value: number;
  /** Weighted observations behind this field, after decay. */
  evidenceCount: number;
  /** Sim clock, ms. */
  lastUpdated: number;
  source: ProfileSource;
  /** This field's own decay constant, surfaced in the Model Registry screen. */
  decayLambda: number;
}

/**
 * One contribution to a field, kept so the panel can name its causes.
 *
 * `eventId` is null when the cause was not an event - an identity seed, a CRM
 * record, an order history. Those are real contributions with real weights;
 * they simply have no click behind them to point at.
 */
export interface DistDriver {
  eventId: string | null;
  contribution: number;
  label: string;
}

/**
 * A posterior over a small closed set, plus everything needed to gate on it.
 *
 * `evidence` is the fold's actual state and `posterior` is derived from it; the
 * pair is kept together so a reader never has to know which one to trust.
 */
export interface Dist<K extends string> {
  /**
   * Session evidence, in current-tick units. Aged by this field's own decay
   * constant every time an event lands.
   */
  evidence: Record<K, number>;
  /**
   * Durable evidence - completed orders, CRM facts - held in a separate channel
   * because it decays on a different clock.
   *
   * Folding it in with clicks was the obvious first implementation and it is
   * wrong: order history would then fade at the click rate, so a shopper with
   * ten years of purchases behind them would have all of it discounted to
   * nothing by twelve minutes of browsing. A purchase does not become less true
   * because the shopper clicked again. Calendar-scale ageing of this channel is
   * workstream 3's job; `DECAY.history` is where it goes when it arrives.
   */
  seed: Record<K, number>;
  posterior: Record<K, number>;
  top: K;
  runnerUp: K;
  /** top - runnerUp. Never show a call without it. */
  margin: number;
  confidence: Confidence;
  /** Most recent first, capped at DRIVER_CAP. */
  drivers: DistDriver[];
}

/** A continuous trait in [0,1] with its own confidence. */
export interface ScalarTrait {
  value: number;
  confidence: Confidence;
  /** Decayed observation mass; the fold's state, as with `Dist.evidence`. */
  evidence: number;
}

export type GenderTrait = 'mens' | 'womens' | 'unisex' | 'kids';
export type AgeBand = 'kids' | 'teen' | 'adult' | 'senior';
/** Roster names, e.g. "Jalen Hurts". The taxonomy is the universe. */
export type PlayerId = string;

export interface SizeEstimate {
  size: string;
  confidence: Confidence;
}

export interface VisitorProfile {
  visitorId: string;
  identityState: IdentityState;

  affinities: {
    league: Dist<League>;
    team: Dist<TeamId>;
    player: Dist<PlayerId>;
    department: Dist<Department>;
  };

  traits: {
    gender: Dist<GenderTrait>;
    ageBand: Dist<AgeBand>;
    priceSensitivity: ScalarTrait;
    giftIntent: ScalarTrait;
    sizeProfile: Partial<Record<Department, SizeEstimate>>;
    region: { value: string | null; confidence: Confidence };
  };

  persona: PersonaBlock;

  state: {
    sessionCount: number;
    lifetimeOrders: number;
    recentPurchases: Array<{ productId: string; ts: number }>;
    /** productId -> decayed impression count. */
    impressionFatigue: Record<string, number>;
    /** Rivalry suppression, written by workstream 6. */
    suppressedTeams: TeamId[];
    /** Set at the `member` rung. Null at every rung below it. */
    loyaltyTier: string | null;
  };

  /** How many events have been folded in. The fold's tick counter. */
  observedEvents: number;
  updatedAt: number;
}

export type DeltaKind = 'observation' | 'propagation' | 'state' | 'seed' | 'promotion';

/**
 * One field write.
 *
 * Emitted by the fold with before and after read off the profile either side of
 * the write, in the same way the journal's `prevIntentRef` captures the previous
 * posterior before the new one lands. The panel renders these rather than
 * diffing two snapshots, so what it shows is what actually happened.
 */
export interface ProfileDelta {
  /** Dotted path, e.g. `affinities.team.posterior.Eagles`. */
  path: string;
  before: number | string | null;
  after: number | string | null;
  /** The event that caused this, or null for seeds and propagations. */
  eventId: string | null;
  /** Evidence weight added by this write, in current-tick units. */
  contribution: number;
  /** The field's confidence after the write. */
  confidenceAfter: number;
  kind: DeltaKind;
  /** Plain-language cause, e.g. "PDP view of an Eagles item". */
  label: string;
}

export interface ProfileUpdate {
  profile: VisitorProfile;
  deltas: ProfileDelta[];
}

/**
 * Time, as the fold sees it.
 *
 * `ticks` is the unit decay is expressed in, and one event is one tick by
 * default - which reproduces intent.ts's `ageRank` semantics exactly and is the
 * reason the two models agree while both exist. Workstream 3's calendar can pass
 * a real elapsed value here without any other part of this file changing.
 */
export interface ProfileClock {
  /** Simulated wall clock in ms, stamped onto every Confidence written. */
  now: number;
  /** How much this event ages what is already in the profile. Default 1. */
  ticks?: number;
}

/* -------------------------------------------------------------- constants -- */

/**
 * Per-field decay, replacing the two globals that used to live in intent.ts.
 *
 * Team and department carry across at their existing values - 0.35 and 0.08 -
 * because changing them would move the published sim:eval numbers, and
 * recalibration is its own piece of work with its own before-and-after. They are
 * exported under their original names and intent.ts now imports them from here,
 * so there is one definition rather than two that can drift.
 *
 * The new constants follow the same reasoning the department one was argued
 * from: how volatile is this preference actually?
 *
 * One note for whoever reads these next. DEPT_RECENCY_LAMBDA was moved to 0.08
 * once already, because at the team rate department prediction scored below a
 * plain popularity baseline. That measurement was taken under the retired
 * generator ("Harness A" - see the header of evaluate.ts), where the department
 * of a purchased item barely depended on the shopper at all and the task was
 * close to unlearnable. Under the current generator the same engine, unchanged,
 * runs 1.50x over its baseline. So the original justification for 0.08 no
 * longer describes the world it was fitted to, and the constant is now
 * unexamined rather than wrong - it has simply never been checked against a
 * task that could distinguish good settings from bad ones. Re-deriving it is
 * legitimate work. Nudging it until the metric improves is not, and the
 * difference between the two is whether the target is written down first.
 */
export const TEAM_RECENCY_LAMBDA = 0.35;
export const DEPT_RECENCY_LAMBDA = 0.08;

export type DecayField =
  | 'league'
  | 'team'
  | 'player'
  | 'department'
  | 'gender'
  | 'ageBand'
  | 'priceSensitivity'
  | 'giftIntent'
  | 'size'
  | 'region'
  | 'history';

export const DECAY: Record<DecayField, number> = {
  /** Slowest of the affinities. Someone who follows the NFL follows it next year. */
  league: 0.03,
  /** Volatile: swings with the fixture list, a result, a campaign email. */
  team: TEAM_RECENCY_LAMBDA,
  /** Faster than team. Players are traded, injured and retired; allegiance is not. */
  player: 0.45,
  /** Slow. A jersey buyer stays a jersey buyer across visits. */
  department: DEPT_RECENCY_LAMBDA,
  /** Near-static. Who a shopper buys for changes on a timescale of years. */
  gender: 0.02,
  ageBand: 0.02,
  /** Between the two: budget moves with circumstance but not with a click. */
  priceSensitivity: 0.1,
  /** Fast, and deliberately so - gifting is an episode, not a trait. */
  giftIntent: 0.2,
  /**
   * Durable evidence does not age within a session, and a session is the only
   * clock this module has. Zero is the honest value until there is a calendar to
   * measure months against; it is a named constant rather than an absent one so
   * that when the calendar lands there is a single place to change.
   */
  history: 0,
  /** Static. A shopper's size is a fact about their body. */
  size: 0.02,
  /** Does not decay: a region is replaced by better information, never faded. */
  region: 0,
};

/** Weight of one event by page type. Carried across from intent.ts unchanged. */
const EVENT_WEIGHTS: Record<string, number> = {
  PDP: 1.0,
  PLP: 0.75,
  Filter: 0.6,
  Search: 0.7,
  Cart: 1.6,
  Home: 0.15,
};

/**
 * Evidence mass at which a field reaches ~63% of full confidence. Shared with
 * intent.ts's sufficiency term so the two agree about what "enough" means.
 */
const SUFFICIENCY_K = 2.0;
/** Caps the evidence term's contribution to a logit, in log units. */
const EVIDENCE_SCALE = 3.5;
/** Softmax temperature. Below 1 sharpens. */
const TEMPERATURE = 0.62;

/**
 * Damping on cross-field propagation.
 *
 * A click on a Jalen Hurts jersey is direct evidence about Hurts, weaker
 * evidence about the Eagles, and weaker still about the NFL. The chain is
 * multiplicative, so league picks up 0.6 * 0.5 = 0.3 of the original weight -
 * enough to separate a multi-sport household from a single-league one over a
 * session, not enough for one click to claim a league allegiance.
 */
export const PLAYER_TO_TEAM_DAMPING = 0.6;
export const TEAM_TO_LEAGUE_DAMPING = 0.5;

/** How many drivers a Dist keeps. Enough to explain a call, bounded for the DOM. */
const DRIVER_CAP = 8;

export const GENDER_TRAITS: GenderTrait[] = ['mens', 'womens', 'unisex', 'kids'];
export const AGE_BANDS: AgeBand[] = ['kids', 'teen', 'adult', 'senior'];
/** Every roster name in the taxonomy, in a stable order. */
export const PLAYER_IDS: PlayerId[] = TEAMS.flatMap((t) => t.players.map((p) => p.name));

/* ----------------------------------------------------------------- priors -- */

/**
 * Popularity prior: national fan-base size weighted by how in-season the league
 * is. Moved here from intent.ts, which now imports it, because the prior is
 * where a profile starts and intent is only one of its readers.
 */
export function teamPrior(team: TeamId): number {
  const cfg = TEAM_BY_ID[team];
  const seasonal = LEAGUE_SEASONALITY[cfg.league as League][SIM_MONTH];
  return Math.max(0.01, cfg.marketSize * (0.45 + 0.55 * seasonal));
}

export function departmentPrior(dept: Department): number {
  const cfg = DEPARTMENTS.find((d) => d.id === dept);
  return Math.max(0.01, cfg?.assortmentWeight ?? 0.05);
}

/** A league is as likely as the sum of its clubs' priors. */
export function leaguePrior(league: League): number {
  const total = TEAM_IDS.filter((t) => TEAM_BY_ID[t].league === league).reduce(
    (sum, t) => sum + teamPrior(t),
    0
  );
  return Math.max(0.01, total);
}

/** A player is as likely as their own draw times their club's. */
export function playerPrior(player: PlayerId): number {
  for (const team of TEAMS) {
    const entry = team.players.find((p) => p.name === player);
    if (entry) return Math.max(0.005, entry.popularity * teamPrior(team.id));
  }
  return 0.005;
}

/**
 * Assortment-weighted gender prior. Matches the catalog's own generation split
 * (55/20/25 men/women/unisex) with a small kids mass, so an anonymous visitor's
 * prior is the shape of the shelf rather than an assumption about them.
 */
const GENDER_PRIOR: Record<GenderTrait, number> = {
  mens: 0.5,
  womens: 0.18,
  unisex: 0.23,
  kids: 0.09,
};

const AGE_BAND_PRIOR: Record<AgeBand, number> = {
  kids: 0.12,
  teen: 0.14,
  adult: 0.62,
  senior: 0.12,
};

/* ------------------------------------------------------------ dist helpers -- */

function zeroed<K extends string>(keys: readonly K[]): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = 0;
  return out;
}

/**
 * Confidence for a distribution.
 *
 * Three things have to be true at once before a field is worth acting on: there
 * has to be enough evidence, the leader has to hold real mass, and the leader
 * has to be clear of the runner-up. The first two are the old rule. The third is
 * the one the old rule missed, and it is the difference between a 60/10 call and
 * a 60/58 one.
 *
 * The margin enters as a ratio of the peak, scaled into [0.5, 1.0]. That makes
 * the discount well-behaved at both ends: an unambiguous call (runner-up at
 * zero) scores `sufficiency * top`, exactly the old formula, so nothing that was
 * previously confident becomes mysteriously less so; a dead heat scores half
 * that, which is the intended correction.
 */
export function distConfidence(evidenceTotal: number, top: number, margin: number): number {
  const sufficiency = 1 - Math.exp(-evidenceTotal / SUFFICIENCY_K);
  const marginRatio = top > 0 ? Math.max(0, Math.min(1, margin / top)) : 0;
  const value = sufficiency * top * (0.5 + 0.5 * marginRatio);
  return Math.max(0.02, Math.min(0.99, value));
}

/**
 * Rebuilds a Dist's posterior, ordering and confidence from its evidence.
 *
 * The logit form is intent.ts's: log-prior plus the candidate's *share* of the
 * evidence, scaled by sufficiency so a single observation cannot leap to a 99%
 * call. Keeping the two identical is what makes the profile path and the event
 * path comparable rather than merely similar.
 */
function recompute<K extends string>(
  dist: Dist<K>,
  keys: readonly K[],
  prior: (k: K) => number,
  clock: ProfileClock,
  source: ProfileSource
): Dist<K> {
  // The two channels are summed here and nowhere else. Everything downstream -
  // the share, the sufficiency term, the confidence - sees one evidence mass,
  // which is what keeps this identical in form to intent.ts.
  const mass = (k: K) => dist.evidence[k] + dist.seed[k];
  const evidenceTotal = keys.reduce((sum, k) => sum + mass(k), 0);
  const sufficiency = 1 - Math.exp(-evidenceTotal / SUFFICIENCY_K);
  const scale = EVIDENCE_SCALE * sufficiency;

  const logits = keys.map(
    (k) => Math.log(prior(k)) + (evidenceTotal > 0 ? (mass(k) / evidenceTotal) * scale : 0)
  );
  const probs = softmax(logits, TEMPERATURE);

  const posterior = {} as Record<K, number>;
  keys.forEach((k, i) => {
    posterior[k] = probs[i];
  });

  const ranked = [...keys].sort((a, b) => posterior[b] - posterior[a]);
  const top = ranked[0];
  const runnerUp = ranked[1] ?? ranked[0];
  const margin = posterior[top] - posterior[runnerUp];

  return {
    ...dist,
    posterior,
    top,
    runnerUp,
    margin,
    confidence: {
      ...dist.confidence,
      value: distConfidence(evidenceTotal, posterior[top], margin),
      evidenceCount: evidenceTotal,
      lastUpdated: clock.now,
      source: evidenceTotal > 0 ? source : 'prior',
    },
  };
}

function createDist<K extends string>(
  keys: readonly K[],
  prior: (k: K) => number,
  decayLambda: number,
  clock: ProfileClock
): Dist<K> {
  const base: Dist<K> = {
    evidence: zeroed(keys),
    seed: zeroed(keys),
    posterior: zeroed(keys),
    top: keys[0],
    runnerUp: keys[1] ?? keys[0],
    margin: 0,
    confidence: {
      value: 0.02,
      evidenceCount: 0,
      lastUpdated: clock.now,
      source: 'prior',
      decayLambda,
    },
    drivers: [],
  };
  return recompute(base, keys, prior, clock, 'prior');
}

function createScalar(initial: number, decayLambda: number, clock: ProfileClock): ScalarTrait {
  return {
    value: initial,
    evidence: 0,
    confidence: {
      value: 0.02,
      evidenceCount: 0,
      lastUpdated: clock.now,
      source: 'prior',
      decayLambda,
    },
  };
}

/**
 * Ages a Dist by `ticks`. Each channel on its own constant - session evidence at
 * the field's own rate, durable evidence at the history rate.
 */
function decayDist<K extends string>(dist: Dist<K>, keys: readonly K[], ticks: number): Dist<K> {
  if (ticks <= 0) return dist;
  const factor = Math.exp(-dist.confidence.decayLambda * ticks);
  const seedFactor = Math.exp(-DECAY.history * ticks);
  const evidence = {} as Record<K, number>;
  const seed = {} as Record<K, number>;
  for (const k of keys) {
    evidence[k] = dist.evidence[k] * factor;
    seed[k] = dist.seed[k] * seedFactor;
  }
  return { ...dist, evidence, seed };
}

function decayScalar(trait: ScalarTrait, ticks: number): ScalarTrait {
  if (ticks <= 0) return trait;
  const factor = Math.exp(-trait.confidence.decayLambda * ticks);
  return { ...trait, evidence: trait.evidence * factor };
}

/**
 * Folds one observation into a scalar trait.
 *
 * An evidence-weighted running mean rather than a step: the trait moves toward
 * the observation in proportion to how much this observation weighs against
 * everything already seen, which means the tenth budget filter moves it far less
 * than the first did. Decay is what stops that from ossifying.
 */
function observeScalar(
  trait: ScalarTrait,
  observation: number,
  weight: number,
  clock: ProfileClock,
  source: ProfileSource
): ScalarTrait {
  const evidence = trait.evidence + weight;
  const value = evidence > 0 ? (trait.value * trait.evidence + observation * weight) / evidence : trait.value;
  return {
    value,
    evidence,
    confidence: {
      ...trait.confidence,
      value: Math.max(0.02, Math.min(0.99, 1 - Math.exp(-evidence / SUFFICIENCY_K))),
      evidenceCount: evidence,
      lastUpdated: clock.now,
      source,
    },
  };
}

function pushDrivers(drivers: DistDriver[], next: DistDriver): DistDriver[] {
  return [next, ...drivers].slice(0, DRIVER_CAP);
}

/* ------------------------------------------------------- reading an event -- */

/**
 * Facet filters arrive in two shapes: `gender=Men` from the listing page, and
 * `Player: Jalen Hurts` from an authored scenario. Both are parsed rather than
 * one being normalised at the call site, because the authored form is what the
 * demo personas ship with and rewriting them would change the published
 * scenarios for no gain.
 */
function parseFilter(filterApplied?: string): { key: string; value: string } | null {
  if (!filterApplied) return null;
  const eq = filterApplied.indexOf('=');
  if (eq > 0) {
    return { key: filterApplied.slice(0, eq).trim().toLowerCase(), value: filterApplied.slice(eq + 1).trim() };
  }
  const colon = filterApplied.indexOf(':');
  if (colon > 0) {
    return { key: filterApplied.slice(0, colon).trim().toLowerCase(), value: filterApplied.slice(colon + 1).trim() };
  }
  return null;
}

const PLAYER_TEAM: Record<PlayerId, TeamId> = Object.fromEntries(
  TEAMS.flatMap((t) => t.players.map((p) => [p.name, t.id]))
) as Record<PlayerId, TeamId>;

/** Price band ids as the listing page emits them, mapped to a sensitivity in [0,1]. */
const PRICE_BAND_SENSITIVITY: Record<string, number> = {
  u25: 0.95,
  '25-50': 0.75,
  '50-100': 0.5,
  '100-150': 0.25,
  '150+': 0.05,
};

const GENDER_FACET: Record<string, GenderTrait> = {
  Men: 'mens',
  Women: 'womens',
  Unisex: 'unisex',
  Kids: 'kids',
};

/**
 * Damping on department -> gender.
 *
 * Browsing the Kids department says something about who the shopper is buying
 * for, but far less than ticking the Kids gender facet does - one is an
 * inference, the other is a statement. Half weight keeps the distinction.
 */
export const KIDS_DEPT_TO_GENDER_DAMPING = 0.5;

/**
 * Events carry no player field, so the player is recovered from whichever roster
 * name appears in the product title. The catalog's name builder puts it there
 * verbatim (`buildProductName` in sim/catalog.ts), which makes this a lookup
 * against the taxonomy rather than a guess - and keeps the fold free of any
 * dependency on the generated catalog.
 */
function resolvePlayer(event: UserEvent, filter: { key: string; value: string } | null): PlayerId | undefined {
  if (filter?.key === 'player' && PLAYER_TEAM[filter.value]) return filter.value;
  if (!event.productName) return undefined;
  return PLAYER_IDS.find((name) => event.productName!.includes(name));
}

/** Short human-readable cause, used as the delta and driver label. */
function describeEvent(event: UserEvent): string {
  const what = [event.team, event.department].filter(Boolean).join(' ');
  return what ? `${event.pageType} - ${what}` : `${event.pageType} - ${event.action}`;
}

/* -------------------------------------------------------------- the fold -- */

function addEvidence<K extends string>(
  dist: Dist<K>,
  key: K,
  weight: number,
  driver: DistDriver,
  channel: 'session' | 'seed' = 'session'
): Dist<K> {
  if (dist.evidence[key] === undefined || weight <= 0) return dist;
  const target = channel === 'seed' ? dist.seed : dist.evidence;
  const updated = { ...target, [key]: target[key] + weight };
  return {
    ...dist,
    evidence: channel === 'seed' ? dist.evidence : updated,
    seed: channel === 'seed' ? updated : dist.seed,
    drivers: pushDrivers(dist.drivers, driver),
  };
}

/** A write that has landed in `evidence` and is waiting for its posterior. */
interface PendingWrite<K extends string> {
  path: string;
  key: K;
  contribution: number;
  kind: DeltaKind;
  label: string;
  eventId: string | null;
}

function emitDeltas<K extends string>(
  writes: PendingWrite<K>[],
  before: Dist<K>,
  after: Dist<K>
): ProfileDelta[] {
  return writes.map((w) => ({
    path: `${w.path}.${w.key}`,
    before: Number(before.posterior[w.key].toFixed(4)),
    after: Number(after.posterior[w.key].toFixed(4)),
    eventId: w.eventId,
    contribution: Number(w.contribution.toFixed(4)),
    confidenceAfter: Number(after.confidence.value.toFixed(4)),
    kind: w.kind,
    label: w.label,
  }));
}

/** Prior-only profile. This is what an anonymous first-time visitor is. */
export function createProfile(
  visitorId: string,
  identityState: IdentityState = 'anonymous',
  clock: ProfileClock = { now: 0 }
): VisitorProfile {
  const profile: VisitorProfile = {
    visitorId,
    identityState,
    affinities: {
      league: createDist(LEAGUES, leaguePrior, DECAY.league, clock),
      team: createDist(TEAM_IDS, teamPrior, DECAY.team, clock),
      player: createDist(PLAYER_IDS, playerPrior, DECAY.player, clock),
      department: createDist(DEPARTMENT_IDS, departmentPrior, DECAY.department, clock),
    },
    traits: {
      gender: createDist(GENDER_TRAITS, (g) => GENDER_PRIOR[g], DECAY.gender, clock),
      ageBand: createDist(AGE_BANDS, (a) => AGE_BAND_PRIOR[a], DECAY.ageBand, clock),
      // Both scalars start at the midpoint with zero evidence, which is the only
      // honest opening position: not "average shopper", but "not yet observed".
      priceSensitivity: createScalar(0.5, DECAY.priceSensitivity, clock),
      giftIntent: createScalar(0.5, DECAY.giftIntent, clock),
      sizeProfile: {},
      region: {
        value: null,
        confidence: {
          value: 0.02,
          evidenceCount: 0,
          lastUpdated: clock.now,
          source: 'prior',
          decayLambda: DECAY.region,
        },
      },
    },
    // Replaced immediately below; a profile is never handed out without one.
    persona: scorePersona(
      { concentration: 0, breadth: 0, giftIntent: 0.5, priceSensitivity: 0.5, kidsShare: 0, collectibleShare: 0, historyDepth: 0, evidenceTotal: 0 },
      clock.now,
      DECAY.team
    ),
    state: {
      sessionCount: 0,
      lifetimeOrders: 0,
      recentPurchases: [],
      impressionFatigue: {},
      suppressedTeams: [],
      loyaltyTier: null,
    },
    observedEvents: 0,
    updatedAt: clock.now,
  };

  return { ...profile, persona: scorePersona(personaFeatures(profile), clock.now, DECAY.team) };
}

/** Derives the persona's inputs from fields already visible on the Profile tab. */
function personaFeatures(profile: VisitorProfile): PersonaFeatures {
  const team = profile.affinities.team;
  const activeTeams = TEAM_IDS.filter((t) => team.posterior[t] > 0.12).length;
  const evidenceTotal =
    team.confidence.evidenceCount + profile.affinities.department.confidence.evidenceCount;

  return {
    concentration: team.posterior[team.top],
    // One club is breadth 0; four or more is breadth 1.
    breadth: Math.min(1, Math.max(0, activeTeams - 1) / 3),
    giftIntent: profile.traits.giftIntent.value,
    priceSensitivity: profile.traits.priceSensitivity.value,
    kidsShare: profile.traits.gender.posterior.kids,
    collectibleShare: profile.affinities.department.posterior.Collectibles,
    historyDepth: 1 - Math.exp(-profile.state.lifetimeOrders / 3),
    evidenceTotal,
  };
}

/**
 * Folds one event into a profile.
 *
 * Pure: returns a new profile and the deltas that made it, mutates nothing, and
 * reads no state beyond its arguments and the static taxonomy.
 *
 * The order matters. Everything already in the profile is aged first, then the
 * new observation lands at full weight - which is what makes the accumulator
 * equivalent to a decayed sweep over the whole history. Posteriors are recomputed
 * once at the end rather than after each write, so a single event produces one
 * coherent state rather than a sequence of intermediate ones nobody asked for.
 *
 * PROPAGATION RULE: a damped propagation only ever lands on a field the event did
 * not name itself. An event carrying both a team and a league is one observation,
 * not two, and letting it count twice would inflate the evidence total that the
 * confidence term depends on.
 */
export function applyEvent(
  profile: VisitorProfile,
  event: UserEvent,
  clock: ProfileClock = { now: profile.updatedAt + 1 }
): ProfileUpdate {
  const ticks = clock.ticks ?? 1;
  const typeWeight = EVENT_WEIGHTS[event.pageType] ?? 0.5;
  const label = describeEvent(event);
  const eventId = event.id;

  const before = profile;
  const filter = parseFilter(event.filterApplied);

  // --- 1. Age everything already held -------------------------------------
  let league = decayDist(profile.affinities.league, LEAGUES, ticks);
  let team = decayDist(profile.affinities.team, TEAM_IDS, ticks);
  let player = decayDist(profile.affinities.player, PLAYER_IDS, ticks);
  let department = decayDist(profile.affinities.department, DEPARTMENT_IDS, ticks);
  let gender = decayDist(profile.traits.gender, GENDER_TRAITS, ticks);
  let ageBand = decayDist(profile.traits.ageBand, AGE_BANDS, ticks);
  let priceSensitivity = decayScalar(profile.traits.priceSensitivity, ticks);
  let giftIntent = decayScalar(profile.traits.giftIntent, ticks);

  const leagueWrites: PendingWrite<League>[] = [];
  const teamWrites: PendingWrite<TeamId>[] = [];
  const playerWrites: PendingWrite<PlayerId>[] = [];
  const deptWrites: PendingWrite<Department>[] = [];
  const genderWrites: PendingWrite<GenderTrait>[] = [];
  const ageWrites: PendingWrite<AgeBand>[] = [];
  const other: ProfileDelta[] = [];

  // --- 2. Resolve what this event says, deciding each field exactly once ----
  const playerKey = resolvePlayer(event, filter);
  const teamKey = event.team ?? (playerKey ? PLAYER_TEAM[playerKey] : undefined);
  const leagueKey = event.league ?? (teamKey ? TEAM_BY_ID[teamKey].league : undefined);
  const deptKey =
    event.department ?? (filter?.key === 'department' ? (filter.value as Department) : undefined);

  // --- 3. Player, and the damped chain upward ------------------------------
  if (playerKey) {
    player = addEvidence(player, playerKey, typeWeight, { eventId, contribution: typeWeight, label });
    playerWrites.push({ path: 'affinities.player.posterior', key: playerKey, contribution: typeWeight, kind: 'observation', label, eventId });
  }

  if (teamKey) {
    const direct = Boolean(event.team);
    const w = direct ? typeWeight : typeWeight * PLAYER_TO_TEAM_DAMPING;
    team = addEvidence(team, teamKey, w, { eventId, contribution: w, label });
    teamWrites.push({
      path: 'affinities.team.posterior',
      key: teamKey,
      contribution: w,
      kind: direct ? 'observation' : 'propagation',
      label: direct ? label : `${label} - propagated from player ${playerKey}`,
      eventId,
    });

    if (leagueKey) {
      const directLeague = Boolean(event.league);
      const lw = directLeague ? typeWeight : w * TEAM_TO_LEAGUE_DAMPING;
      league = addEvidence(league, leagueKey, lw, { eventId, contribution: lw, label });
      leagueWrites.push({
        path: 'affinities.league.posterior',
        key: leagueKey,
        contribution: lw,
        kind: directLeague ? 'observation' : 'propagation',
        label: directLeague ? label : `${label} - propagated from team ${teamKey}`,
        eventId,
      });
    }
  } else if (leagueKey) {
    league = addEvidence(league, leagueKey, typeWeight, { eventId, contribution: typeWeight, label });
    leagueWrites.push({ path: 'affinities.league.posterior', key: leagueKey, contribution: typeWeight, kind: 'observation', label, eventId });
  }

  // --- 4. Department, and what it implies about who is being shopped for ---
  if (deptKey && department.evidence[deptKey] !== undefined) {
    department = addEvidence(department, deptKey, typeWeight, { eventId, contribution: typeWeight, label });
    deptWrites.push({ path: 'affinities.department.posterior', key: deptKey, contribution: typeWeight, kind: 'observation', label, eventId });

    if (deptKey === 'Kids') {
      const w = typeWeight * KIDS_DEPT_TO_GENDER_DAMPING;
      gender = addEvidence(gender, 'kids', w, { eventId, contribution: w, label });
      genderWrites.push({ path: 'traits.gender.posterior', key: 'kids', contribution: w, kind: 'propagation', label: `${label} - propagated from the Kids department`, eventId });
      ageBand = addEvidence(ageBand, 'kids', w, { eventId, contribution: w, label });
      ageWrites.push({ path: 'traits.ageBand.posterior', key: 'kids', contribution: w, kind: 'propagation', label: `${label} - propagated from the Kids department`, eventId });

      // Kids merchandise from a profile with adult evidence behind it is the
      // clearest gift signal available without asking. Read only in that
      // direction: ordinary browsing is not evidence *against* gifting, so
      // nothing here ever pushes the trait down.
      const adultMass = gender.evidence.mens + gender.evidence.womens;
      if (adultMass > 0) {
        const beforeVal = giftIntent.value;
        giftIntent = observeScalar(giftIntent, 1, typeWeight, clock, 'inferred');
        other.push({
          path: 'traits.giftIntent.value',
          before: Number(beforeVal.toFixed(4)),
          after: Number(giftIntent.value.toFixed(4)),
          eventId,
          contribution: Number(typeWeight.toFixed(4)),
          confidenceAfter: Number(giftIntent.confidence.value.toFixed(4)),
          kind: 'propagation',
          label: `${label} - kids merchandise from a profile with adult evidence`,
        });
      }
    }
  }

  // --- 5. Facet filters: gender, price band, size --------------------------
  if (filter?.key === 'gender' && GENDER_FACET[filter.value]) {
    const g = GENDER_FACET[filter.value];
    gender = addEvidence(gender, g, typeWeight, { eventId, contribution: typeWeight, label });
    genderWrites.push({ path: 'traits.gender.posterior', key: g, contribution: typeWeight, kind: 'observation', label, eventId });
  }

  if (filter?.key === 'price' && PRICE_BAND_SENSITIVITY[filter.value] !== undefined) {
    const beforeVal = priceSensitivity.value;
    priceSensitivity = observeScalar(priceSensitivity, PRICE_BAND_SENSITIVITY[filter.value], typeWeight, clock, 'session');
    other.push({
      path: 'traits.priceSensitivity.value',
      before: Number(beforeVal.toFixed(4)),
      after: Number(priceSensitivity.value.toFixed(4)),
      eventId,
      contribution: Number(typeWeight.toFixed(4)),
      confidenceAfter: Number(priceSensitivity.confidence.value.toFixed(4)),
      kind: 'observation',
      label: `${label} - price band ${filter.value}`,
    });
  }

  const sizeProfile = { ...profile.traits.sizeProfile };
  if (filter?.key === 'size' && deptKey) {
    const existing = sizeProfile[deptKey];
    // Same size again accumulates. A different size replaces rather than
    // averages, because selecting a size is a statement about a body, and the
    // most recent statement is the true one - averaging L and S gives M, which
    // is a size the shopper never chose.
    const evidenceCount = existing && existing.size === filter.value ? existing.confidence.evidenceCount + typeWeight : typeWeight;
    sizeProfile[deptKey] = {
      size: filter.value,
      confidence: {
        value: Math.max(0.02, Math.min(0.99, 1 - Math.exp(-evidenceCount / SUFFICIENCY_K))),
        evidenceCount,
        lastUpdated: clock.now,
        source: 'session',
        decayLambda: DECAY.size,
      },
    };
    other.push({
      path: `traits.sizeProfile.${deptKey}.size`,
      before: existing?.size ?? null,
      after: filter.value,
      eventId,
      contribution: Number(typeWeight.toFixed(4)),
      confidenceAfter: Number(sizeProfile[deptKey]!.confidence.value.toFixed(4)),
      kind: 'observation',
      label: `${label} - size ${filter.value}`,
    });
  }

  // --- 6. Impression fatigue ----------------------------------------------
  // Decayed with the rest, so a product seen once ten events ago stops counting
  // against itself. Surface impressions - the real source - are written here by
  // workstream 6; a product-detail view is the one impression observable today.
  const fatigueFactor = Math.exp(-DECAY.giftIntent * ticks);
  const impressionFatigue: Record<string, number> = {};
  for (const [id, count] of Object.entries(profile.state.impressionFatigue)) {
    const decayed = count * fatigueFactor;
    if (decayed > 0.01) impressionFatigue[id] = decayed;
  }
  if (event.productId) {
    impressionFatigue[event.productId] = (impressionFatigue[event.productId] ?? 0) + 1;
  }

  // --- 7. Recompute every posterior once -----------------------------------
  league = recompute(league, LEAGUES, leaguePrior, clock, 'session');
  team = recompute(team, TEAM_IDS, teamPrior, clock, 'session');
  player = recompute(player, PLAYER_IDS, playerPrior, clock, 'session');
  department = recompute(department, DEPARTMENT_IDS, departmentPrior, clock, 'session');
  gender = recompute(gender, GENDER_TRAITS, (g) => GENDER_PRIOR[g], clock, 'session');
  ageBand = recompute(ageBand, AGE_BANDS, (a) => AGE_BAND_PRIOR[a], clock, 'session');

  const next: VisitorProfile = {
    ...profile,
    affinities: { league, team, player, department },
    traits: { ...profile.traits, gender, ageBand, priceSensitivity, giftIntent, sizeProfile },
    state: { ...profile.state, impressionFatigue },
    persona: profile.persona,
    observedEvents: profile.observedEvents + 1,
    updatedAt: clock.now,
  };
  next.persona = scorePersona(personaFeatures(next), clock.now, DECAY.team);

  // --- 8. Deltas, read off the two states either side of the write ---------
  const deltas: ProfileDelta[] = [
    ...emitDeltas(playerWrites, before.affinities.player, player),
    ...emitDeltas(teamWrites, before.affinities.team, team),
    ...emitDeltas(leagueWrites, before.affinities.league, league),
    ...emitDeltas(deptWrites, before.affinities.department, department),
    ...emitDeltas(genderWrites, before.traits.gender, gender),
    ...emitDeltas(ageWrites, before.traits.ageBand, ageBand),
    ...other,
  ];

  if (before.persona.label !== next.persona.label) {
    deltas.push({
      path: 'persona.label',
      before: before.persona.label,
      after: next.persona.label,
      eventId,
      contribution: 0,
      confidenceAfter: Number(next.persona.confidence.value.toFixed(4)),
      kind: 'state',
      label: `Persona moved to ${next.persona.label} over ${next.persona.runnerUp}`,
    });
  }

  return { profile: next, deltas };
}

/**
 * Folds a whole history into a profile, from the prior-only constructor.
 *
 * This is the harness entry point: it needs no React, no storage and no clock of
 * its own, so `evaluate.ts` can build a synthetic customer's profile exactly as
 * the browser builds a live one.
 *
 * `events` are expected NEWEST FIRST, the same convention `predictIntent` and
 * AppContext already use. They are reversed internally because a fold runs
 * forward through time - a caller should not have to know that.
 */
export function buildProfile(
  scenario: Scenario,
  events: UserEvent[],
  clock: ProfileClock = { now: 0 },
  seed?: IdentitySeed
): ProfileUpdate {
  const isAnonymous = seed ? seed.state === 'anonymous' : scenario.profileType === 'Anonymous';
  const identityState: IdentityState = seed
    ? seed.state
    : scenario.profileType === 'Anonymous'
      ? 'anonymous'
      : 'member';

  let profile = createProfile(`visitor-${scenario.id}`, identityState, clock);

  const deltas: ProfileDelta[] = [];

  profile = {
    ...profile,
    state: {
      ...profile.state,
      lifetimeOrders: isAnonymous ? 0 : scenario.historicalOrdersCount,
      sessionCount: isAnonymous ? 1 : Math.max(1, scenario.historicalOrdersCount),
    },
  };

  // When an identity seed is supplied the ladder governs entirely: it decides
  // what is known at this rung, including the order history the legacy branch
  // below would otherwise assume. The two never both run - a profile seeded
  // twice would double-count its own history.
  if (seed) {
    const seeded = applySeedWrites(profile, seedWrites(seed), clock);
    profile = seeded.profile;
    deltas.push(...seeded.deltas);
  }

  // Prior orders are strong, durable evidence, but they are history: they enter
  // as pseudo-counts at a fixed discount rather than competing with live clicks.
  // Identical arithmetic to intent.ts's historical term, so a profile-fed
  // prediction and an event-fed one start from the same place.
  if (!seed && !isAnonymous) {
    const historicalWeight = Math.min(3.0, Math.log1p(scenario.historicalOrdersCount) * 1.1);
    let team = profile.affinities.team;
    let league = profile.affinities.league;
    const teamWrites: PendingWrite<TeamId>[] = [];
    const leagueWrites: PendingWrite<League>[] = [];

    scenario.favTeams.forEach((favTeam, rank) => {
      if (team.evidence[favTeam] === undefined) return;
      const w = historicalWeight * Math.pow(0.6, rank);
      const label = `Order history - ${favTeam} at rank ${rank + 1}`;
      team = addEvidence(team, favTeam, w, { eventId: `history-${favTeam}`, contribution: w, label }, 'seed');
      teamWrites.push({ path: 'affinities.team.posterior', key: favTeam, contribution: w, kind: 'seed', label, eventId: null });

      const lg = TEAM_BY_ID[favTeam].league;
      const lw = w * TEAM_TO_LEAGUE_DAMPING;
      league = addEvidence(league, lg, lw, { eventId: `history-${favTeam}`, contribution: lw, label }, 'seed');
      leagueWrites.push({ path: 'affinities.league.posterior', key: lg, contribution: lw, kind: 'propagation', label: `${label} - propagated to league`, eventId: null });
    });

    const teamAfter = recompute(team, TEAM_IDS, teamPrior, clock, 'history');
    const leagueAfter = recompute(league, LEAGUES, leaguePrior, clock, 'history');
    deltas.push(
      ...emitDeltas(teamWrites, profile.affinities.team, teamAfter),
      ...emitDeltas(leagueWrites, profile.affinities.league, leagueAfter)
    );
    profile = { ...profile, affinities: { ...profile.affinities, team: teamAfter, league: leagueAfter } };
    profile = { ...profile, persona: scorePersona(personaFeatures(profile), clock.now, DECAY.team) };
  }

  // Oldest first: the fold runs forward, ageing what it already holds.
  for (const event of [...events].reverse()) {
    const step = applyEvent(profile, event, { now: clock.now, ticks: clock.ticks });
    profile = step.profile;
    deltas.push(...step.deltas);
  }

  return { profile, deltas };
}

/* ------------------------------------------------------- identity seeding -- */

/**
 * Which channel a seed lands in, decided by what kind of claim it is.
 *
 * A declared fact - a CRM record, a completed order - is durable and does not
 * age at the click rate. An inference - a regional prior, a device skew - is
 * exactly the kind of weak guess that live behaviour should be free to
 * overwrite, so it goes in the session channel and fades like anything else.
 * The rule is the source, not the rung, because it is the nature of the claim
 * that decides how long it should survive.
 */
function channelFor(source: ProfileSource): 'session' | 'seed' {
  return source === 'history' || source === 'crm' ? 'seed' : 'session';
}

/**
 * Applies a rung's evidence to a profile.
 *
 * Same shape as `applyEvent` and for the same reason: it is a fold step, it
 * returns a new profile and its deltas, and it mutates nothing. Promotion
 * re-runs this from the prior-only constructor rather than patching what is
 * already there - see `promoteProfile`.
 */
export function applySeedWrites(
  profile: VisitorProfile,
  writes: SeedWrite[],
  clock: ProfileClock = { now: profile.updatedAt }
): ProfileUpdate {
  if (writes.length === 0) return { profile, deltas: [] };

  const before = profile;

  let league = profile.affinities.league;
  let team = profile.affinities.team;
  let player = profile.affinities.player;
  let department = profile.affinities.department;
  let gender = profile.traits.gender;
  let ageBand = profile.traits.ageBand;
  let priceSensitivity = profile.traits.priceSensitivity;
  let giftIntent = profile.traits.giftIntent;
  const sizeProfile = { ...profile.traits.sizeProfile };
  let region = profile.traits.region;
  let lifetimeOrders = profile.state.lifetimeOrders;
  let loyaltyTier = profile.state.loyaltyTier;

  const leagueWrites: PendingWrite<League>[] = [];
  const teamWrites: PendingWrite<TeamId>[] = [];
  const playerWrites: PendingWrite<PlayerId>[] = [];
  const deptWrites: PendingWrite<Department>[] = [];
  const genderWrites: PendingWrite<GenderTrait>[] = [];
  const ageWrites: PendingWrite<AgeBand>[] = [];
  const other: ProfileDelta[] = [];

  for (const w of writes) {
    if (w.weight <= 0) continue;
    const driver = { eventId: null, contribution: w.weight, label: w.label };
    const channel = channelFor(w.source);
    const pending = { contribution: w.weight, kind: 'seed' as DeltaKind, label: w.label, eventId: null };

    switch (w.field) {
      case 'league':
        league = addEvidence(league, w.key as League, w.weight, driver, channel);
        leagueWrites.push({ ...pending, path: 'affinities.league.posterior', key: w.key as League });
        break;
      case 'team':
        team = addEvidence(team, w.key as TeamId, w.weight, driver, channel);
        teamWrites.push({ ...pending, path: 'affinities.team.posterior', key: w.key as TeamId });
        break;
      case 'player':
        player = addEvidence(player, w.key as PlayerId, w.weight, driver, channel);
        playerWrites.push({ ...pending, path: 'affinities.player.posterior', key: w.key as PlayerId });
        break;
      case 'department':
        department = addEvidence(department, w.key as Department, w.weight, driver, channel);
        deptWrites.push({ ...pending, path: 'affinities.department.posterior', key: w.key as Department });
        break;
      case 'gender':
        gender = addEvidence(gender, w.key as GenderTrait, w.weight, driver, channel);
        genderWrites.push({ ...pending, path: 'traits.gender.posterior', key: w.key as GenderTrait });
        break;
      case 'ageBand':
        ageBand = addEvidence(ageBand, w.key as AgeBand, w.weight, driver, channel);
        ageWrites.push({ ...pending, path: 'traits.ageBand.posterior', key: w.key as AgeBand });
        break;
      case 'priceSensitivity': {
        const prev = priceSensitivity.value;
        priceSensitivity = observeScalar(priceSensitivity, w.value ?? 0.5, w.weight, clock, w.source);
        other.push(scalarDelta('traits.priceSensitivity.value', prev, priceSensitivity, w));
        break;
      }
      case 'giftIntent': {
        const prev = giftIntent.value;
        giftIntent = observeScalar(giftIntent, w.value ?? 0.5, w.weight, clock, w.source);
        other.push(scalarDelta('traits.giftIntent.value', prev, giftIntent, w));
        break;
      }
      case 'size': {
        // Encoded as `Department:Size` because a size means nothing without the
        // department it was measured in - a shopper is an L in jerseys and an XL
        // in hoodies, and both are true.
        const [dept, size] = (w.key ?? '').split(':');
        if (!dept || !size) break;
        const existing = sizeProfile[dept as Department];
        const evidenceCount = existing && existing.size === size ? existing.confidence.evidenceCount + w.weight : w.weight;
        sizeProfile[dept as Department] = {
          size,
          confidence: {
            value: Math.max(0.02, Math.min(0.99, 1 - Math.exp(-evidenceCount / SUFFICIENCY_K))),
            evidenceCount,
            lastUpdated: clock.now,
            source: w.source,
            decayLambda: DECAY.size,
          },
        };
        other.push({
          path: `traits.sizeProfile.${dept}.size`,
          before: existing?.size ?? null,
          after: size,
          eventId: null,
          contribution: Number(w.weight.toFixed(4)),
          confidenceAfter: Number(sizeProfile[dept as Department]!.confidence.value.toFixed(4)),
          kind: 'seed',
          label: w.label,
        });
        break;
      }
      case 'region': {
        const prev = region.value;
        const evidenceCount = region.confidence.evidenceCount + w.weight;
        region = {
          value: w.key ?? null,
          confidence: {
            value: Math.max(0.02, Math.min(0.99, 1 - Math.exp(-evidenceCount / SUFFICIENCY_K))),
            evidenceCount,
            lastUpdated: clock.now,
            source: w.source,
            decayLambda: DECAY.region,
          },
        };
        other.push({
          path: 'traits.region.value',
          before: prev,
          after: region.value,
          eventId: null,
          contribution: Number(w.weight.toFixed(4)),
          confidenceAfter: Number(region.confidence.value.toFixed(4)),
          kind: 'seed',
          label: w.label,
        });
        break;
      }
      case 'orders':
        lifetimeOrders = Math.max(lifetimeOrders, Math.round(w.weight));
        other.push({
          path: 'state.lifetimeOrders',
          before: profile.state.lifetimeOrders,
          after: lifetimeOrders,
          eventId: null,
          contribution: 0,
          confidenceAfter: 1,
          kind: 'seed',
          label: w.label,
        });
        break;
      case 'loyalty':
        loyaltyTier = w.key ?? null;
        other.push({
          path: 'state.loyaltyTier',
          before: profile.state.loyaltyTier,
          after: loyaltyTier,
          eventId: null,
          contribution: 0,
          confidenceAfter: 1,
          kind: 'seed',
          label: w.label,
        });
        break;
    }
  }

  league = recompute(league, LEAGUES, leaguePrior, clock, 'history');
  team = recompute(team, TEAM_IDS, teamPrior, clock, 'history');
  player = recompute(player, PLAYER_IDS, playerPrior, clock, 'history');
  department = recompute(department, DEPARTMENT_IDS, departmentPrior, clock, 'history');
  gender = recompute(gender, GENDER_TRAITS, (g) => GENDER_PRIOR[g], clock, 'crm');
  ageBand = recompute(ageBand, AGE_BANDS, (a) => AGE_BAND_PRIOR[a], clock, 'crm');

  const next: VisitorProfile = {
    ...profile,
    affinities: { league, team, player, department },
    traits: { ...profile.traits, gender, ageBand, priceSensitivity, giftIntent, sizeProfile, region },
    state: { ...profile.state, lifetimeOrders, loyaltyTier },
    updatedAt: clock.now,
  };
  next.persona = scorePersona(personaFeatures(next), clock.now, DECAY.team);

  const deltas: ProfileDelta[] = [
    ...emitDeltas(teamWrites, before.affinities.team, team),
    ...emitDeltas(leagueWrites, before.affinities.league, league),
    ...emitDeltas(playerWrites, before.affinities.player, player),
    ...emitDeltas(deptWrites, before.affinities.department, department),
    ...emitDeltas(genderWrites, before.traits.gender, gender),
    ...emitDeltas(ageWrites, before.traits.ageBand, ageBand),
    ...other,
  ];

  return { profile: next, deltas };
}

function scalarDelta(path: string, before: number, after: ScalarTrait, w: SeedWrite): ProfileDelta {
  return {
    path,
    before: Number(before.toFixed(4)),
    after: Number(after.value.toFixed(4)),
    eventId: null,
    contribution: Number(w.weight.toFixed(4)),
    confidenceAfter: Number(after.confidence.value.toFixed(4)),
    kind: 'seed',
    label: w.label,
  };
}

/* ------------------------------------------------------------- promotion -- */

/** Every field the panel can animate, with a reader for its current state. */
const TRACKED_FIELDS: {
  path: string;
  label: string;
  read: (p: VisitorProfile) => { value: string; confidence: number; source: ProfileSource };
}[] = [
  { path: 'affinities.team', label: 'Team affinity', read: (p) => ({ value: p.affinities.team.top, confidence: p.affinities.team.confidence.value, source: p.affinities.team.confidence.source }) },
  { path: 'affinities.league', label: 'League affinity', read: (p) => ({ value: p.affinities.league.top, confidence: p.affinities.league.confidence.value, source: p.affinities.league.confidence.source }) },
  { path: 'affinities.player', label: 'Player affinity', read: (p) => ({ value: p.affinities.player.top, confidence: p.affinities.player.confidence.value, source: p.affinities.player.confidence.source }) },
  { path: 'affinities.department', label: 'Department affinity', read: (p) => ({ value: p.affinities.department.top, confidence: p.affinities.department.confidence.value, source: p.affinities.department.confidence.source }) },
  { path: 'traits.gender', label: 'Gender', read: (p) => ({ value: p.traits.gender.top, confidence: p.traits.gender.confidence.value, source: p.traits.gender.confidence.source }) },
  { path: 'traits.ageBand', label: 'Age band', read: (p) => ({ value: p.traits.ageBand.top, confidence: p.traits.ageBand.confidence.value, source: p.traits.ageBand.confidence.source }) },
  { path: 'traits.priceSensitivity', label: 'Price sensitivity', read: (p) => ({ value: p.traits.priceSensitivity.value.toFixed(2), confidence: p.traits.priceSensitivity.confidence.value, source: p.traits.priceSensitivity.confidence.source }) },
  { path: 'traits.giftIntent', label: 'Gift intent', read: (p) => ({ value: p.traits.giftIntent.value.toFixed(2), confidence: p.traits.giftIntent.confidence.value, source: p.traits.giftIntent.confidence.source }) },
  { path: 'traits.region', label: 'Region', read: (p) => ({ value: p.traits.region.value ?? 'unknown', confidence: p.traits.region.confidence.value, source: p.traits.region.confidence.source }) },
  { path: 'traits.sizeProfile', label: 'Size profile', read: (p) => { const k = Object.keys(p.traits.sizeProfile); return { value: k.length ? k.map((d) => `${d} ${p.traits.sizeProfile[d as Department]!.size}`).join(', ') : 'unknown', confidence: k.length ? 0.9 : 0, source: k.length ? 'history' : 'prior' }; } },
  { path: 'state.loyaltyTier', label: 'Loyalty tier', read: (p) => ({ value: p.state.loyaltyTier ?? 'none', confidence: p.state.loyaltyTier ? 1 : 0, source: p.state.loyaltyTier ? 'crm' : 'prior' }) },
  { path: 'persona', label: 'Persona', read: (p) => ({ value: p.persona.label, confidence: p.persona.confidence.value, source: 'inferred' }) },
];

/**
 * What changed between two folds, as deltas the panel can animate.
 *
 * This is a comparison rather than something emitted during the fold, and that
 * is not a compromise - it is what the change actually is. Promotion does not
 * happen *inside* a fold; it is the difference between one fold and another, so
 * the honest way to describe it is to run both and diff them. The `kind` is
 * `promotion` precisely so a reader can tell these apart from the observation
 * deltas, which are emitted inline at the point of the write.
 *
 * A field is reported when its source changed, its leading value changed, or its
 * confidence moved by more than a rounding error - the three things a viewer
 * would notice on screen.
 */
export function diffProfiles(
  before: VisitorProfile,
  after: VisitorProfile,
  cause: string
): ProfileDelta[] {
  const deltas: ProfileDelta[] = [];

  for (const field of TRACKED_FIELDS) {
    const a = field.read(before);
    const b = field.read(after);
    const sourceChanged = a.source !== b.source;
    const valueChanged = a.value !== b.value;
    const confidenceMoved = Math.abs(a.confidence - b.confidence) > 0.005;
    if (!sourceChanged && !valueChanged && !confidenceMoved) continue;

    const how = sourceChanged ? `${a.source} -> ${b.source}` : `${b.source}`;
    deltas.push({
      path: `${field.path}.top`,
      before: a.value,
      after: b.value,
      eventId: null,
      contribution: Number((b.confidence - a.confidence).toFixed(4)),
      confidenceAfter: Number(b.confidence.toFixed(4)),
      kind: 'promotion',
      label: `${cause} - ${field.label} now sourced from ${how}`,
    });
  }

  return deltas;
}

/**
 * Moves a visitor up the identity ladder.
 *
 * RE-FOLDS. It does not patch the profile it was handed; it builds a new one
 * from the prior-only constructor against the richer seed, replaying the same
 * events. That is the whole design: the new evidence has to compete with the
 * session's own, not overwrite it. A member whose CRM record says `mens` and
 * whose last eight clicks were all in Kids ends up with a contested gender
 * distribution and a visible margin, which is the truth about that shopper.
 * Patching in place would have produced a confident `mens` and thrown the
 * session away.
 *
 * The returned deltas are the promotion diff, not the re-fold's own seed
 * deltas - the caller wants to know what visibly changed, not to replay the
 * construction of a profile it already has.
 */
export function promoteProfile(
  previous: VisitorProfile,
  scenario: Scenario,
  events: UserEvent[],
  seed: IdentitySeed,
  clock: ProfileClock = { now: previous.updatedAt }
): ProfileUpdate {
  const rebuilt = buildProfile(scenario, events, clock, seed).profile;
  const cause = `Promoted to ${seed.state}`;
  return { profile: rebuilt, deltas: diffProfiles(previous, rebuilt, cause) };
}
