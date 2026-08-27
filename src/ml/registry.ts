/**
 * The model registry: every model in the build, on one page, with the four
 * things a registry is actually for.
 *
 * Most "model registry" screens are inventories - a name, a version, a green
 * dot. That answers a governance question and no engineering one. The four
 * things this table carries instead are the ones somebody has to know before
 * they can reason about a personalization stack at all:
 *
 *   WHAT IT WRITES     The exact profile field, as a dotted path. A model that
 *                      writes nowhere is a model whose output nothing depends
 *                      on; a field written by two models is a field with a
 *                      merge policy somebody has to have decided.
 *   WHAT IT FORGETS    The decay constant on that field, and the half-life in
 *                      events that follows from it. Half of what a personalized
 *                      store gets wrong is holding evidence too long.
 *   WHEN IT ACTS       The activation threshold, and the scale it is
 *                      denominated in. A threshold without its scale is the
 *                      defect ml/suppression.ts has a whole type to prevent.
 *   HOW GOOD IT IS     The current offline metric, read live off the same
 *                      evaluation the Model Evidence screen runs - not a number
 *                      typed into a table once.
 *
 * And one thing a static registry cannot have: WHEN IT LAST FIRED IN THIS
 * SESSION, matched off the decision journal. That column is what turns the
 * screen from documentation into an observation.
 *
 * NAMING. This module deliberately does not export anything called
 * `ModelRegistry` - that name is taken, by the built-artefact cache in
 * ml/models.ts, and two different things called the same thing in the same
 * directory is how a codebase starts lying to its readers. The card is a
 * `ModelCard`; the table is `MODEL_CARDS`.
 *
 * No React, no DOM: the harness runs this.
 */

import type { EvaluationReport, MetricRow } from './evaluate';
import { DECAY, TEAM_RECENCY_LAMBDA, DEPT_RECENCY_LAMBDA } from './profile';
import type { DecayField, VisitorProfile } from './profile';
import { CONFIDENCE_THRESHOLD } from './intent';
import { FACET_EVIDENCE_FLOOR, FACET_LAMBDA, PRIOR_WEIGHT } from './facets';
import { CAMPAIGN_EVIDENCE, DEVICE_GENDER_EVIDENCE, GEO_EVIDENCE } from './identity';
import { RECOMMENDED_WEIGHTS } from './ranking';
import { SEARCH_WEIGHTS } from './query';
import {
  FATIGUE_CEILING,
  FATIGUE_LAMBDA,
  LOYALIST_CONFIDENCE_FLOOR,
  LOYALIST_POSTERIOR_FLOOR,
  RIVALRY_SUPPRESSION_FLOOR,
  SCALE_RANGE,
  SURFACE_POLICIES,
} from './suppression';
import type { ScoreScale } from './suppression';
import { FIT_PREFILL_FLOOR, FIT_TRANSFER_DAMPING, POPULATION_CONFIDENCE_CEILING } from './fit';
import { CONTINUITY_WEIGHTS, PRICE_TOLERANCE } from './substitution';
import { HOLDOUT_SHARE } from './lifecycle';

/* ----------------------------------------------------------------- types -- */

export type ModelFamily = 'retrieval' | 'inference' | 'ranking' | 'gate' | 'interpretation' | 'orchestration';

export const FAMILY_LABEL: Record<ModelFamily, string> = {
  inference: 'Inference',
  retrieval: 'Retrieval',
  ranking: 'Ranking',
  gate: 'Gate',
  interpretation: 'Interpretation',
  orchestration: 'Orchestration',
};

/**
 * Which engine's live output a card matches against the decision journal.
 *
 * Null for models that do not appear in the journal as their own step - the
 * gates, mostly, which are reported through the surface they gated rather than
 * on their own line. Null is the honest value there, and the screen renders it
 * as "reported through its surface" rather than as "never fired".
 */
export type EngineName =
  | 'intent'
  | 'similarity'
  | 'complement'
  | 'ranking'
  | 'query'
  | 'profile'
  | 'facet'
  | 'context';

export interface ModelCard {
  id: string;
  name: string;
  family: ModelFamily;
  version: string;
  /** What it is for, in one sentence, in the terms a client would use. */
  purpose: string;
  /** What goes in. Rendered as chips. */
  inputs: string[];
  /**
   * The profile field this model writes, as a dotted path, or null.
   *
   * Null is a real answer and appears on several cards: a retrieval engine
   * reads the profile and writes nothing back to it. Saying so is more useful
   * than inventing a field.
   */
  writes: string | null;
  /**
   * The decay on that field. Null when the model writes nothing.
   *
   * `field` widens past `DecayField` for the facet model, whose constant lives
   * in ml/facets.ts rather than in the fold's table - it decays a habit rather
   * than an affinity, and giving it a row in DECAY would imply the fold owned
   * a field it does not have.
   */
  decay: { field: DecayField | 'facet'; lambda: number; halfLifeEvents: number | null; note: string } | null;
  /** The bar it has to clear to act, and the distribution that bar lives in. */
  activation: { threshold: number; scale: ScoreScale | 'unit' | 'count'; note: string } | null;
  /** How to read this model's current score off a live evaluation run. */
  metric: {
    label: string;
    read: (r: EvaluationReport) => MetricRow;
    baseline: ((r: EvaluationReport) => MetricRow) | null;
    /** Which column of the row is this model's headline number. */
    headline: 'recallAt1' | 'recallAt3' | 'recallAt10' | 'ndcgAt10';
  } | null;
  /** Why there is no offline metric, when there is none. Never left blank. */
  metricAbsentReason: string | null;
  /** Matches journal entries to this card. */
  engine: EngineName | null;
  /**
   * How a model that never gets its own journal step reports that it ran.
   *
   * The gates and the two newest rankers do not appear in the decision journal
   * as their own beat - by design, because they are reported through the
   * surface they acted on rather than on a line of their own. They do leave a
   * trace, though: every one of them writes to the effort ledger when it fires.
   * Naming the ledger rows here means "last fired this session" has ONE
   * definition and one function behind it, rather than a journal answer for six
   * cards and an improvised answer for the other four.
   *
   * Null on cards that match through `engine`. A card with both would be two
   * writers for one number.
   */
  ledger: { kinds: string[]; surface?: string; notSurface?: string[] } | null;
  /** Where it lives. Clickable in the screen. */
  source: string;
  /** The one thing worth knowing that the columns above do not carry. */
  note: string;
}

/** ln 2 / lambda, in event ticks. Null for a field that does not decay. */
export function halfLife(lambda: number): number | null {
  if (lambda <= 0) return null;
  return Math.log(2) / lambda;
}

function decayOf(field: DecayField, note: string) {
  const lambda = DECAY[field];
  return { field, lambda, halfLifeEvents: halfLife(lambda), note };
}

/* ----------------------------------------------------------------- cards -- */

export const MODEL_CARDS: ModelCard[] = [
  {
    id: 'intent',
    name: 'Club and department intent',
    family: 'inference',
    version: 'v2.3-profile',
    purpose:
      'Reads a folded profile and returns a posterior over six clubs and eight departments, with a confidence that is earned rather than asserted.',
    inputs: ['profile.affinities.team', 'profile.affinities.department', 'event recency', 'seasonality'],
    writes: 'affinities.team.posterior',
    decay: decayOf(
      'team',
      `λ=${TEAM_RECENCY_LAMBDA} is the fastest of the affinities: club interest swings with the fixture list.`
    ),
    activation: {
      threshold: CONFIDENCE_THRESHOLD,
      scale: 'unit',
      note: 'Below this the store falls back to seasonal merchandising and says so on the page.',
    },
    metric: {
      label: 'Held-out club, recall@1',
      read: (r) => r.intentTeam,
      baseline: (r) => r.intentTeamBaseline,
      headline: 'recallAt1',
    },
    metricAbsentReason: null,
    engine: 'intent',
    ledger: null,
    source: 'src/ml/intent.ts',
    note:
      'The department head of this model is the weaker one and the Model Evidence screen says so in its own words rather than burying it - a department is a much flatter target than a club.',
  },
  {
    id: 'intent_department',
    name: 'Department intent head',
    family: 'inference',
    version: 'v2.3-profile',
    purpose:
      'The second head of the intent model: which department this shopper is in the market for, independent of club.',
    inputs: ['profile.affinities.department', 'event recency', 'department seasonality'],
    writes: 'affinities.department.posterior',
    decay: decayOf(
      'department',
      `λ=${DEPT_RECENCY_LAMBDA}, four times slower than club: a jersey buyer stays a jersey buyer across visits.`
    ),
    activation: {
      threshold: CONFIDENCE_THRESHOLD,
      scale: 'unit',
      note: 'Shares the intent model activation bar - one confidence, one gate.',
    },
    metric: {
      label: 'Held-out department, recall@1',
      read: (r) => r.intentDept,
      baseline: (r) => r.intentDeptBaseline,
      headline: 'recallAt1',
    },
    metricAbsentReason: null,
    engine: 'intent',
    ledger: null,
    source: 'src/ml/intent.ts',
    note:
      'Listed separately from the club head because it is measured separately and it performs differently. A registry that averaged the two would hide the weaker number, which is the number worth discussing.',
  },
  {
    id: 'similarity',
    name: 'Similar-item retrieval',
    family: 'retrieval',
    version: 'v1.8-hybrid',
    purpose:
      'Cosine k-NN over hybrid embeddings - catalog attributes plus co-view structure - to find substitutes for an anchor product.',
    inputs: ['anchor product', 'embedding index', 'candidate pool'],
    writes: null,
    decay: null,
    activation: {
      threshold: SURFACE_POLICIES.pdp_similar.leadThreshold,
      scale: 'similarity',
      note: `Lead slot of the similar rail. The cosine's observed range is ${SCALE_RANGE.similarity.lo}–${SCALE_RANGE.similarity.hi}, so this is roughly its midpoint - forgiving in its own terms.`,
    },
    metric: {
      label: 'Held-out co-view, recall@10',
      read: (r) => r.similarity,
      baseline: (r) => r.similarityBaseline,
      headline: 'recallAt10',
    },
    metricAbsentReason: null,
    engine: 'similarity',
    ledger: null,
    source: 'src/ml/similarity.ts',
    note: 'Reads the profile for candidate filtering and writes nothing back to it. A retrieval engine that mutated the profile would make every rail an observation.',
  },
  {
    id: 'complement',
    name: 'Complete-the-look retrieval',
    family: 'retrieval',
    version: 'v1.5-directional',
    purpose:
      'Directional co-order conditionals: given this in the basket, what else goes in it - and specifically not the reverse, because P(hat|jersey) is not P(jersey|hat).',
    inputs: ['anchor product', 'co-order graph', 'department backoff ladder'],
    writes: null,
    decay: null,
    activation: {
      threshold: SURFACE_POLICIES.pdp_complement.leadThreshold,
      scale: 'complement',
      note: `The median of the co-order conditional itself. Its p10 is ${SCALE_RANGE.complement.lo} and p90 ${SCALE_RANGE.complement.hi} - which is why 0.25 here is a stricter ask than 0.85 on a cosine.`,
    },
    metric: {
      label: 'Held-out co-order, recall@10',
      read: (r) => r.complement,
      baseline: (r) => r.complementBaseline,
      headline: 'recallAt10',
    },
    metricAbsentReason: null,
    engine: 'complement',
    ledger: null,
    source: 'src/ml/complement.ts',
    note: 'Backs off through the department ladder when the pair has no direct evidence, and names the backoff level it used rather than presenting a fallback as a finding.',
  },
  {
    id: 'profile_fold',
    name: 'Visitor profile fold',
    family: 'orchestration',
    version: 'v3.1-ladder',
    purpose:
      'A pure fold from an event stream to a profile: per-field decay, cross-field propagation, and a delta for every write.',
    inputs: ['event stream', 'identity seed', 'profile clock'],
    writes: 'the whole profile',
    decay: decayOf('league', 'Per field, not global. This is the slowest constant in the table; the fastest is player at 0.45.'),
    activation: null,
    metric: null,
    metricAbsentReason:
      'A fold is not a predictor. Its correctness is asserted by the 86 unit tests over it, not by a recall number - there is no held-out "true profile" to score against, and inventing one would be the kind of metric this build exists to argue against.',
    engine: 'profile',
    ledger: null,
    source: 'src/ml/profile.ts',
    note: 'Pure. It returns the next profile and never stores one - persistence is context/profileStore.ts and nowhere else.',
  },
  {
    id: 'ranking',
    name: 'Recommended-order ranker',
    family: 'ranking',
    version: 'v2.0-weighted',
    purpose:
      'Orders a category grid by a stated linear combination of affinity, popularity, recency and price fit - and computes the merchandised default alongside it in the same render.',
    inputs: ['candidate pool', 'profile affinities', 'catalog popularity', 'price sensitivity'],
    writes: null,
    decay: null,
    activation: {
      threshold: CONFIDENCE_THRESHOLD,
      scale: 'unit',
      note: 'Below the intent bar the ranker still runs, on popularity alone. Ranking never decides membership - only order.',
    },
    metric: null,
    metricAbsentReason:
      'Scored on-screen against its own merchandised default in every render, which is a stronger claim than an offline number: it is the same shopper, the same pool and the same moment. See the Experience tab.',
    engine: 'ranking',
    ledger: null,
    source: 'src/ml/ranking.ts',
    note: `Weights are stated, not fitted: ${Object.entries(RECOMMENDED_WEIGHTS)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}.`,
  },
  {
    id: 'query',
    name: 'Query interpretation',
    family: 'interpretation',
    version: 'v1.4-constraints',
    purpose:
      'Parses free text into constraints - club, department, player, price - and returns what it could not interpret rather than silently dropping it.',
    inputs: ['raw query string', 'taxonomy', 'roster at the active clock'],
    writes: null,
    decay: null,
    activation: {
      threshold: 1,
      scale: 'count',
      note: 'One recognised constraint is enough to act. Zero falls through to lexical match and says so.',
    },
    metric: null,
    metricAbsentReason:
      'No labelled query set exists for this synthetic catalog. Building one would mean writing the answers, which measures the author rather than the parser.',
    engine: 'query',
    ledger: null,
    source: 'src/ml/query.ts',
    note: `Constraint weights: ${Object.entries(SEARCH_WEIGHTS)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}. A player name outranks a club because it implies one.`,
  },
  {
    id: 'suppression',
    name: 'Suppression gate',
    family: 'gate',
    version: 'v1.2-perscale',
    purpose:
      'Four rules in a fixed order - already owned, rival club, shown and ignored, below this slot - applied after retrieval and before presentation.',
    inputs: ['candidates', 'profile.state.recentPurchases', 'profile.state.impressionFatigue', 'rivalry graph', 'surface policy'],
    writes: 'state.suppressedTeams',
    decay: decayOf('impression', 'Fatigue fades faster than gifting. A store that remembered an ignored impression next week would be holding a grudge.'),
    activation: {
      threshold: LOYALIST_POSTERIOR_FLOOR,
      scale: 'intent_posterior',
      note: `The rivalry rule needs ${LOYALIST_POSTERIOR_FLOOR} posterior AND ${LOYALIST_CONFIDENCE_FLOOR} confidence together, plus a rivalry at intensity ≥ ${RIVALRY_SUPPRESSION_FLOOR}. Both floors are pinned to named demo shoppers.`,
    },
    metric: null,
    metricAbsentReason:
      'A gate has no recall. What it has instead is a measured empty-rail rate per surface - 6.1% for the similar rail, 6.3% for complements, 15.3% for the cart - stated on the policy table rather than as a score.',
    engine: null,
    ledger: { kinds: ['suppressed_impression'], notSurface: ['Lifecycle triggers'] },
    source: 'src/ml/suppression.ts',
    note: `Demotes before it excludes: λ=${FATIGUE_LAMBDA} on unclicked impressions, hard exclusion only at ${FATIGUE_CEILING}. "Not yet" is a different claim from "never".`,
  },
  {
    id: 'fit',
    name: 'Size and fit prediction',
    family: 'inference',
    version: 'v1.0-ladder',
    purpose:
      'Predicts the size to prefill on a product page, with a distribution across the ladder, the department the evidence came from, and a stated refusal to transfer across incompatible scales.',
    inputs: ['profile.traits.sizeProfile', 'product department', 'cut bias by style family', 'per-size availability'],
    writes: 'traits.sizeProfile',
    decay: decayOf('size', 'Near-static. A shopper\'s size is a fact about their body, not a preference.'),
    activation: {
      threshold: FIT_PREFILL_FLOOR,
      scale: 'unit',
      note: `Below this the facet is left empty rather than guessed. The population fallback is capped at ${POPULATION_CONFIDENCE_CEILING}, which sits below the floor by construction - a catalog-wide modal size can never prefill anything.`,
    },
    metric: null,
    metricAbsentReason:
      'There is no held-out size to score against: the synthetic order history is where the sizes come from, so any evaluation would be scoring the generator against itself.',
    engine: null,
    ledger: { kinds: ['size_hunt'] },
    source: 'src/ml/fit.ts',
    note: `Transfers across departments at ${FIT_TRANSFER_DAMPING} damping and refuses outright between apparel and hats, and between adult and kids - a chest measurement says nothing about a head, and an adult size is not evidence about a child.`,
  },
  {
    id: 'substitution',
    name: 'Out-of-stock substitution',
    family: 'ranking',
    version: 'v1.0-continuity',
    purpose:
      'When the size the shopper asked for is gone, ranks the alternatives by what they keep of the original choice rather than by generic similarity - and shows where those two orderings disagree.',
    inputs: ['anchor product', 'requested size', 'availability by size', 'candidate pool', 'similarity scores'],
    writes: null,
    decay: null,
    activation: {
      threshold: PRICE_TOLERANCE,
      scale: 'unit',
      note: 'Price is a tolerance band, not a term to maximise: within ±25% of the anchor costs nothing, outside it is conceded explicitly.',
    },
    metric: null,
    metricAbsentReason:
      'A substitution is only right or wrong once a shopper accepts or rejects it, and this build has no shoppers. What it reports instead is the divergence table - where its ranking differs from the similarity rail\'s - which is checkable on screen.',
    engine: null,
    ledger: { kinds: ['dead_end'], surface: 'Out of stock' },
    source: 'src/ml/substitution.ts',
    note: `Continuity weights: ${Object.entries(CONTINUITY_WEIGHTS)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}. Availability is a gate here, not a feature - an unavailable product is removed before scoring, never scored down.`,
  },
  {
    id: 'lifecycle',
    name: 'Lifecycle trigger stack',
    family: 'gate',
    version: 'v1.0-sixgate',
    purpose:
      'Decides which email or SMS would fire given this session, and puts every qualifying trigger through six suppression gates before it does.',
    inputs: ['session state', 'identity rung', 'local hour', 'frequency counters', 'suppression context'],
    writes: null,
    decay: decayOf('giftIntent', 'Not a lifecycle field - carried here because gift intent is the trait that most changes which message is appropriate, and it is deliberately fast.'),
    activation: {
      threshold: SURFACE_POLICIES.lifecycle_sms.leadThreshold,
      scale: 'popularity',
      note: 'The highest bar the popularity scale carries anywhere in the build. One product, in a channel the shopper can revoke in one word.',
    },
    metric: null,
    metricAbsentReason:
      `Nothing is sent, so there is nothing to measure. The one number that is real is the control arm: ${Math.round(HOLDOUT_SHARE * 100)}% of visitors are held out deterministically by a hash of their id, which is what an offline metric would eventually be computed against.`,
    engine: null,
    ledger: { kinds: ['suppressed_impression'], surface: 'Lifecycle triggers' },
    source: 'src/ml/lifecycle.ts',
    note: 'The content gate is the storefront\'s own suppression gate. An Eagles loyalist\'s abandoned-cart email cannot carry a Cowboys hat, because the rivalry rule is a rule about the shopper and not about the page.',
  },
  {
    id: 'affinity_league',
    name: 'League affinity',
    family: 'inference',
    version: 'v3.1-fold',
    purpose:
      'Which of the four leagues this shopper follows, held as a posterior rather than a label so a football fan who buys one basketball gift stays a football fan.',
    inputs: ['event stream', 'team-to-league propagation', 'regional prior', 'order history'],
    writes: 'affinities.league.posterior',
    decay: decayOf(
      'league',
      'The slowest constant in the build, and deliberately: league allegiance survives a season that team allegiance does not.'
    ),
    activation: {
      threshold: CONFIDENCE_THRESHOLD,
      scale: 'unit',
      note: 'Below the bar the league navigation keeps its merchandised order rather than being reordered on a guess.',
    },
    metric: null,
    metricAbsentReason:
      'League is almost entirely determined by the club a shopper looks at, so a held-out league score would measure the propagation rule rather than a prediction and would read far higher than the club number it depends on. The club recall on the intent card is the honest version of this measurement.',
    engine: 'profile',
    ledger: null,
    source: 'src/ml/profile.ts',
    note:
      'Rarely written directly. Almost every update arrives by propagation from a club event, at a fraction of the weight - which is why its evidence count climbs slower than the club it came from.',
  },
  {
    id: 'affinity_player',
    name: 'Player affinity',
    family: 'inference',
    version: 'v3.1-fold',
    purpose:
      'Which athlete this shopper is actually shopping for, kept separate from the club because a name on the back is a different purchase from a badge on the front.',
    inputs: ['event stream', 'player-attributed products', 'roster membership'],
    writes: 'affinities.player.posterior',
    decay: {
      field: 'player',
      lambda: DECAY.player,
      halfLifeEvents: halfLife(DECAY.player),
      note: 'The fastest decay of any affinity. Players are traded, injured and retired; the club they played for is not.',
    },
    activation: {
      threshold: CONFIDENCE_THRESHOLD,
      scale: 'unit',
      note: 'The players rail is not rendered below this. An empty rail is a better outcome than a rail of the wrong name.',
    },
    metric: null,
    metricAbsentReason:
      'The synthetic population buys player merchandise too sparsely for a held-out score to mean anything: most simulated customers have one or two player-attributed events, and recall over a two-item history reports the noise rather than the model.',
    engine: 'profile',
    ledger: null,
    source: 'src/ml/profile.ts',
    note:
      'A player event propagates to the club it belongs to but never the reverse. Buying an Eagles hat says nothing about Jalen Hurts, and the fold refuses to pretend otherwise.',
  },
  {
    id: 'trait_gender',
    name: 'Fit and gender belief',
    family: 'inference',
    version: 'v3.1-fold',
    purpose:
      'Which cut to show first, held as a distribution over four values because the answer is frequently and legitimately mixed.',
    inputs: ['product cut viewed', 'department', 'device class', 'CRM record when consented'],
    writes: 'traits.gender.posterior',
    decay: {
      field: 'gender',
      lambda: DECAY.gender,
      halfLifeEvents: halfLife(DECAY.gender),
      note: 'Near-static. Who someone shops for changes on a timescale of years, so the fold holds this almost indefinitely.',
    },
    activation: {
      threshold: DEVICE_GENDER_EVIDENCE,
      scale: 'count',
      note: `The device skew is worth ${DEVICE_GENDER_EVIDENCE} of one event - roughly a third of a page view. It is enough to break a tie and nowhere near enough to make a claim.`,
    },
    metric: null,
    metricAbsentReason:
      'Scoring this would require the synthetic population to carry a true gender label, and it deliberately does not: the simulator models who a customer buys for, which is a basket property rather than a person property. Inventing the label to score against would be scoring the simulator.',
    engine: 'profile',
    ledger: null,
    source: 'src/ml/profile.ts',
    note:
      'The one belief in the build most likely to be wrong in a way that offends. It is why the gifting trait exists alongside it and why a high gift intent suppresses the size prefill entirely.',
  },
  {
    id: 'trait_price',
    name: 'Price sensitivity',
    family: 'inference',
    version: 'v3.1-fold',
    purpose:
      'Where in the price range this shopper is comfortable, as a scalar the ranker reads directly and the offer surfaces gate on.',
    inputs: ['price of items viewed', 'price of items carted', 'referral channel', 'order history'],
    writes: 'traits.priceSensitivity.value',
    decay: {
      field: 'priceSensitivity',
      lambda: DECAY.priceSensitivity,
      halfLifeEvents: halfLife(DECAY.priceSensitivity),
      note: 'Between the affinities and the traits. A budget moves with circumstance but not with a single click.',
    },
    activation: null,
    metric: null,
    metricAbsentReason:
      'A scalar with no held-out target. The nearest real measurement is the price-fit term inside the ranker, and that is scored on-screen against the merchandised default in every render rather than offline.',
    engine: 'profile',
    ledger: null,
    source: 'src/ml/profile.ts',
    note:
      'Read by the ranker as one of four weighted terms and by the offer gate as a threshold. A shopper who views expensive items and buys cheap ones ends mid-band, which is the correct answer and not a failure to converge.',
  },
  {
    id: 'trait_gift',
    name: 'Gift intent',
    family: 'inference',
    version: 'v3.1-fold',
    purpose:
      'Whether this basket is for the shopper or for somebody else - the single trait that most changes what a store should do next.',
    inputs: ['mixed-club basket', 'kids sizing', 'gift wrap', 'seasonality', 'basket coherence'],
    writes: 'traits.giftIntent.value',
    decay: {
      field: 'giftIntent',
      lambda: DECAY.giftIntent,
      halfLifeEvents: halfLife(DECAY.giftIntent),
      note: 'Fast, and deliberately so. Gifting is an episode. A shopper who bought a present in December is not a gift shopper in March.',
    },
    activation: null,
    metric: null,
    metricAbsentReason:
      'The simulator knows which of its baskets were gifts, but the events it emits do not carry that flag - which is the point. Scoring against a label the runtime cannot see would measure a model this build does not ship.',
    engine: 'profile',
    ledger: null,
    source: 'src/ml/profile.ts',
    note:
      'When this is high the store stops personalizing the shopper and starts personalizing the recipient: the size prefill is suppressed, the rival-club rule relaxes, and the gifting rail opens.',
  },
  {
    id: 'facet_intent',
    name: 'Filter intent',
    family: 'inference',
    version: 'v1.0-habit',
    purpose:
      'Which control this shopper reaches for, so the facet rail on the listing page is ordered by the way they shop rather than by the way the catalog is filed.',
    inputs: ['filter applications', 'department prior', 'live catalog'],
    writes: null,
    decay: {
      field: 'facet',
      lambda: FACET_LAMBDA,
      halfLifeEvents: halfLife(FACET_LAMBDA),
      note: `λ=${FACET_LAMBDA}: about four events. A filter habit is a habit and not an affinity, and it should fade over a session rather than over a year.`,
    },
    activation: {
      threshold: FACET_EVIDENCE_FLOOR,
      scale: 'count',
      note: `One filter application. Below it the rail keeps the category prior, weighted at ${PRIOR_WEIGHT}, and the panel says the order is a prior rather than a belief.`,
    },
    metric: null,
    metricAbsentReason:
      'The synthetic population emits purchases and views, not filter ticks, so there is no held-out facet history to score against. Generating one would score the generator - and the honest reading is that this model is calibrated by its nine property tests and by watching the rail reorder on screen.',
    engine: 'facet',
    ledger: null,
    source: 'src/ml/facets.ts',
    note:
      'Replaces a hardcoded switch that returned five filter names per department. That table survives as the prior and nothing more: its weight falls away as soon as the shopper touches a control, which is the difference between a rule and a model.',
  },
  {
    id: 'facet_value',
    name: 'Filter value ranking',
    family: 'ranking',
    version: 'v1.0-habit',
    purpose:
      'Which values to show first inside the leading facet, and whether that ordering is something observed or something borrowed.',
    inputs: ['ticked values', 'affinity posteriors', 'live catalog availability'],
    writes: null,
    decay: {
      field: 'facet',
      lambda: FACET_LAMBDA,
      halfLifeEvents: halfLife(FACET_LAMBDA),
      note: 'Shares the facet decay. A value ticked six clicks ago is worth a quarter of one ticked just now.',
    },
    activation: {
      threshold: FACET_EVIDENCE_FLOOR,
      scale: 'count',
      note: 'A ticked value always outranks a borrowed one, however confident the borrow. Observation beats inference at equal evidence.',
    },
    metric: null,
    metricAbsentReason:
      'Measured against the same absent filter history as the facet model above. What can be checked is the invariant, and it is: a value the shopper actually ticked can never be ranked below one the fold merely believes.',
    engine: 'facet',
    ledger: null,
    source: 'src/ml/facets.ts',
    note:
      'Three of the nine facets carry no posterior at all. Brand, size and colour have no home in the fold, so an untouched one of those is offered in catalog order and the panel says so rather than inventing a preference.',
  },
  {
    id: 'context_read',
    name: 'Arrival context reader',
    family: 'interpretation',
    version: 'v2.0-ladder',
    purpose:
      'Turns the arriving request into evidence: a timezone into a market, a referrer into a channel, a campaign tag into a stated intent.',
    inputs: ['timezone', 'referrer', 'campaign tags', 'device class', 'landing path'],
    writes: 'affinities.team.posterior',
    decay: decayOf(
      'region',
      'The region seed does not decay. It is a property of where the request came from, not of anything the shopper did, and re-reading it every session would not make it newer.'
    ),
    activation: {
      threshold: GEO_EVIDENCE,
      scale: 'count',
      note: `A whole zone is worth ${GEO_EVIDENCE} events, split across the clubs inside it by market size - so no single club receives it. A campaign tag is worth ${CAMPAIGN_EVIDENCE} and goes to one club, because it is a statement rather than a correlation.`,
    },
    metric: null,
    metricAbsentReason:
      'This is a reader, not a predictor: it converts an arriving request into evidence and the fold does the predicting. What it can be held to is that a zone containing no catalog market yields nothing at all, and that is asserted in ml/identity.test.ts rather than scored.',
    engine: 'context',
    ledger: null,
    source: 'src/ml/identity.ts',
    note:
      'Every field it reads is on screen in the Journey view, with how it was obtained and what it was worth. A timezone is a much coarser signal than an IP lookup and the accuracy radius on that panel says so in kilometres.',
  },
];

export const CARD_BY_ID: Record<string, ModelCard> = Object.fromEntries(
  MODEL_CARDS.map((c) => [c.id, c])
);

/* -------------------------------------------------------- feature vectors -- */

export interface FeatureRow {
  name: string;
  value: number | string | null;
  /** Where the number came from. Never "the model". */
  source: string;
  /** Set when the value is a probability or a share, so the screen can bar it. */
  unit: 'probability' | 'score' | 'count' | 'lambda' | 'text' | null;
}

/**
 * What a card is reading right now.
 *
 * The point of expanding a registry row is to see the row stop being a
 * description. Every value below is read off the live profile at the moment of
 * the render - nothing here is a constant dressed as an observation, and the
 * `source` on each row says which field it came from so it can be checked.
 */
export function featureVectorFor(card: ModelCard, profile: VisitorProfile | null): FeatureRow[] {
  if (!profile) {
    return [
      {
        name: 'No profile in session',
        value: null,
        source: 'context/profileStore.ts',
        unit: null,
      },
    ];
  }

  const team = profile.affinities.team;
  const dept = profile.affinities.department;
  const common: FeatureRow[] = [
    { name: 'identityState', value: profile.identityState, source: 'profile.identityState', unit: 'text' },
    { name: 'observedEvents', value: profile.observedEvents, source: 'profile.observedEvents', unit: 'count' },
  ];

  switch (card.id) {
    case 'intent':
      return [
        ...common,
        { name: 'team.top', value: team.top, source: 'affinities.team.top', unit: 'text' },
        { name: `posterior[${team.top}]`, value: team.posterior[team.top] ?? 0, source: 'affinities.team.posterior', unit: 'probability' },
        { name: 'team.confidence', value: team.confidence.value, source: 'affinities.team.confidence.value', unit: 'probability' },
        { name: 'team.evidence', value: team.confidence.evidenceCount, source: 'affinities.team.confidence.evidenceCount', unit: 'count' },
        { name: 'team.decayLambda', value: team.confidence.decayLambda, source: 'affinities.team.confidence.decayLambda', unit: 'lambda' },
        { name: 'clears activation', value: team.confidence.value >= CONFIDENCE_THRESHOLD ? 'yes' : 'no', source: `vs CONFIDENCE_THRESHOLD ${CONFIDENCE_THRESHOLD}`, unit: 'text' },
      ];

    case 'intent_department':
      return [
        ...common,
        { name: 'department.top', value: dept.top, source: 'affinities.department.top', unit: 'text' },
        { name: `posterior[${dept.top}]`, value: dept.posterior[dept.top] ?? 0, source: 'affinities.department.posterior', unit: 'probability' },
        { name: 'department.confidence', value: dept.confidence.value, source: 'affinities.department.confidence.value', unit: 'probability' },
        { name: 'department.decayLambda', value: dept.confidence.decayLambda, source: 'affinities.department.confidence.decayLambda', unit: 'lambda' },
      ];

    case 'similarity':
    case 'complement':
      return [
        ...common,
        { name: 'candidate pool', value: 'the live catalog, filtered by the surface', source: 'ml/models.ts dataset', unit: 'text' },
        { name: 'writes to profile', value: 'nothing', source: 'card.writes', unit: 'text' },
        { name: 'gated by', value: card.id === 'similarity' ? 'pdp_similar' : 'pdp_complement', source: 'SURFACE_POLICIES', unit: 'text' },
      ];

    case 'profile_fold':
      return [
        ...common,
        { name: 'sessionCount', value: profile.state.sessionCount, source: 'state.sessionCount', unit: 'count' },
        { name: 'lifetimeOrders', value: profile.state.lifetimeOrders, source: 'state.lifetimeOrders', unit: 'count' },
        { name: 'recentPurchases', value: profile.state.recentPurchases.length, source: 'state.recentPurchases', unit: 'count' },
        { name: 'fatigued products', value: Object.keys(profile.state.impressionFatigue).length, source: 'state.impressionFatigue', unit: 'count' },
        { name: 'loyaltyTier', value: profile.state.loyaltyTier ?? 'none', source: 'state.loyaltyTier', unit: 'text' },
      ];

    case 'ranking':
      return [
        ...common,
        { name: `affinity[${team.top}]`, value: team.posterior[team.top] ?? 0, source: 'affinities.team.posterior', unit: 'probability' },
        { name: 'priceSensitivity', value: profile.traits.priceSensitivity.value, source: 'traits.priceSensitivity.value', unit: 'score' },
        { name: 'priceSensitivity.evidence', value: profile.traits.priceSensitivity.confidence.evidenceCount, source: 'traits.priceSensitivity.confidence.evidenceCount', unit: 'count' },
        ...Object.entries(RECOMMENDED_WEIGHTS).map(([k, v]) => ({
          name: `weight.${k}`,
          value: v as number,
          source: 'ml/ranking.ts RECOMMENDED_WEIGHTS',
          unit: 'score' as const,
        })),
      ];

    case 'query':
      return [
        ...common,
        ...Object.entries(SEARCH_WEIGHTS).map(([k, v]) => ({
          name: `weight.${k}`,
          value: v as number,
          source: 'ml/query.ts SEARCH_WEIGHTS',
          unit: 'score' as const,
        })),
      ];

    case 'suppression':
      return [
        ...common,
        { name: `posterior[${team.top}]`, value: team.posterior[team.top] ?? 0, source: 'affinities.team.posterior', unit: 'probability' },
        { name: 'team.confidence', value: team.confidence.value, source: 'affinities.team.confidence.value', unit: 'probability' },
        { name: 'is loyalist', value: (team.posterior[team.top] ?? 0) >= LOYALIST_POSTERIOR_FLOOR && team.confidence.value >= LOYALIST_CONFIDENCE_FLOOR ? 'yes' : 'no', source: `vs ${LOYALIST_POSTERIOR_FLOOR} / ${LOYALIST_CONFIDENCE_FLOOR}`, unit: 'text' },
        { name: 'suppressedTeams', value: profile.state.suppressedTeams.join(', ') || 'none', source: 'state.suppressedTeams', unit: 'text' },
        { name: 'fatigued products', value: Object.keys(profile.state.impressionFatigue).length, source: 'state.impressionFatigue', unit: 'count' },
        { name: 'giftIntent', value: profile.traits.giftIntent.value, source: 'traits.giftIntent.value', unit: 'score' },
      ];

    case 'fit': {
      const sizes = Object.entries(profile.traits.sizeProfile);
      return [
        ...common,
        ...(sizes.length
          ? sizes.map(([d, est]) => ({
              name: `sizeProfile.${d}`,
              value: `${est?.size ?? '—'} @ ${((est?.confidence.value ?? 0) * 100).toFixed(0)}%`,
              source: 'traits.sizeProfile',
              unit: 'text' as const,
            }))
          : [{ name: 'sizeProfile', value: 'empty', source: 'traits.sizeProfile', unit: 'text' as const }]),
        { name: 'prefill floor', value: FIT_PREFILL_FLOOR, source: 'ml/fit.ts FIT_PREFILL_FLOOR', unit: 'probability' },
        { name: 'population ceiling', value: POPULATION_CONFIDENCE_CEILING, source: 'ml/fit.ts POPULATION_CONFIDENCE_CEILING', unit: 'probability' },
        { name: 'giftIntent', value: profile.traits.giftIntent.value, source: 'traits.giftIntent.value — blocks prefill above the override', unit: 'score' },
      ];
    }

    case 'substitution':
      return [
        ...common,
        ...Object.entries(CONTINUITY_WEIGHTS).map(([k, v]) => ({
          name: `weight.${k}`,
          value: v as number,
          source: 'ml/substitution.ts CONTINUITY_WEIGHTS',
          unit: 'score' as const,
        })),
        { name: 'price tolerance', value: PRICE_TOLERANCE, source: 'ml/substitution.ts PRICE_TOLERANCE', unit: 'score' },
      ];

    case 'lifecycle':
      return [
        ...common,
        { name: 'identity rung', value: profile.identityState, source: 'profile.identityState — decides which channels exist', unit: 'text' },
        { name: 'lifetimeOrders', value: profile.state.lifetimeOrders, source: 'state.lifetimeOrders', unit: 'count' },
        { name: 'holdout share', value: HOLDOUT_SHARE, source: 'ml/lifecycle.ts HOLDOUT_SHARE', unit: 'probability' },
        { name: 'in holdout', value: 'computed from visitorId', source: `hash(holdout:${profile.visitorId})`, unit: 'text' },
      ];

    case 'affinity_league': {
      const league = profile.affinities.league;
      return [
        ...common,
        { name: 'league.top', value: league.top, source: 'affinities.league.top', unit: 'text' },
        { name: `posterior[${league.top}]`, value: league.posterior[league.top] ?? 0, source: 'affinities.league.posterior', unit: 'probability' },
        { name: 'league.confidence', value: league.confidence.value, source: 'affinities.league.confidence.value', unit: 'probability' },
        { name: 'league.evidence', value: league.confidence.evidenceCount, source: 'affinities.league.confidence.evidenceCount', unit: 'count' },
        { name: 'league.decayLambda', value: league.confidence.decayLambda, source: 'affinities.league.confidence.decayLambda', unit: 'lambda' },
        { name: 'evidence vs club', value: `${league.confidence.evidenceCount.toFixed(1)} against ${team.confidence.evidenceCount.toFixed(1)}`, source: 'both confidence.evidenceCount', unit: 'text' },
      ];
    }

    case 'affinity_player': {
      const player = profile.affinities.player;
      return [
        ...common,
        { name: 'player.top', value: player.top || 'none', source: 'affinities.player.top', unit: 'text' },
        { name: `posterior[${player.top || 'none'}]`, value: player.posterior[player.top] ?? 0, source: 'affinities.player.posterior', unit: 'probability' },
        { name: 'player.confidence', value: player.confidence.value, source: 'affinities.player.confidence.value', unit: 'probability' },
        { name: 'player.evidence', value: player.confidence.evidenceCount, source: 'affinities.player.confidence.evidenceCount', unit: 'count' },
        { name: 'player.decayLambda', value: player.confidence.decayLambda, source: 'affinities.player.confidence.decayLambda', unit: 'lambda' },
        { name: 'clears activation', value: player.confidence.value >= CONFIDENCE_THRESHOLD ? 'yes' : 'no', source: `vs CONFIDENCE_THRESHOLD ${CONFIDENCE_THRESHOLD}`, unit: 'text' },
      ];
    }

    case 'trait_gender': {
      const g = profile.traits.gender;
      return [
        ...common,
        { name: 'gender.top', value: g.top, source: 'traits.gender.top', unit: 'text' },
        ...Object.entries(g.posterior).map(([k, v]) => ({
          name: `posterior[${k}]`,
          value: v as number,
          source: 'traits.gender.posterior',
          unit: 'probability' as const,
        })),
        { name: 'gender.confidence', value: g.confidence.value, source: 'traits.gender.confidence.value', unit: 'probability' },
        { name: 'device skew weight', value: DEVICE_GENDER_EVIDENCE, source: 'ml/identity.ts DEVICE_GENDER_EVIDENCE', unit: 'count' },
      ];
    }

    case 'trait_price':
      return [
        ...common,
        { name: 'priceSensitivity', value: profile.traits.priceSensitivity.value, source: 'traits.priceSensitivity.value', unit: 'score' },
        { name: 'priceSensitivity.confidence', value: profile.traits.priceSensitivity.confidence.value, source: 'traits.priceSensitivity.confidence.value', unit: 'probability' },
        { name: 'priceSensitivity.evidence', value: profile.traits.priceSensitivity.confidence.evidenceCount, source: 'traits.priceSensitivity.confidence.evidenceCount', unit: 'count' },
        { name: 'priceSensitivity.decayLambda', value: profile.traits.priceSensitivity.confidence.decayLambda, source: 'traits.priceSensitivity.confidence.decayLambda', unit: 'lambda' },
        { name: 'read by', value: 'the ranker price term and the offer gate', source: 'ml/ranking.ts, ml/suppression.ts', unit: 'text' },
      ];

    case 'trait_gift':
      return [
        ...common,
        { name: 'giftIntent', value: profile.traits.giftIntent.value, source: 'traits.giftIntent.value', unit: 'score' },
        { name: 'giftIntent.confidence', value: profile.traits.giftIntent.confidence.value, source: 'traits.giftIntent.confidence.value', unit: 'probability' },
        { name: 'giftIntent.evidence', value: profile.traits.giftIntent.confidence.evidenceCount, source: 'traits.giftIntent.confidence.evidenceCount', unit: 'count' },
        { name: 'giftIntent.decayLambda', value: profile.traits.giftIntent.confidence.decayLambda, source: 'traits.giftIntent.confidence.decayLambda', unit: 'lambda' },
        { name: 'suppresses size prefill', value: profile.traits.giftIntent.value > 0.6 ? 'yes' : 'no', source: 'traits.giftIntent.value vs 0.6', unit: 'text' },
      ];

    case 'facet_intent':
    case 'facet_value':
      return [
        ...common,
        { name: 'observation channel', value: 'filter applications only', source: 'ml/facets.ts parseFacetEvent', unit: 'text' },
        { name: 'prior weight', value: PRIOR_WEIGHT, source: 'ml/facets.ts PRIOR_WEIGHT', unit: 'score' },
        { name: 'decayLambda', value: FACET_LAMBDA, source: 'ml/facets.ts FACET_LAMBDA', unit: 'lambda' },
        { name: 'prior keyed on', value: dept.top, source: 'affinities.department.top', unit: 'text' },
        { name: 'facets with a posterior', value: 6, source: 'ml/facets.ts VALUE_SOURCE — brand, size and colour have none', unit: 'count' },
      ];

    case 'context_read':
      return [
        ...common,
        { name: 'region seed', value: profile.traits.region.value ?? 'none', source: 'traits.region.value', unit: 'text' },
        { name: 'region.confidence', value: profile.traits.region.confidence.value, source: 'traits.region.confidence.value', unit: 'probability' },
        { name: 'zone evidence', value: GEO_EVIDENCE, source: 'ml/identity.ts GEO_EVIDENCE', unit: 'count' },
        { name: 'campaign evidence', value: CAMPAIGN_EVIDENCE, source: 'ml/identity.ts CAMPAIGN_EVIDENCE', unit: 'count' },
        { name: 'device skew', value: DEVICE_GENDER_EVIDENCE, source: 'ml/identity.ts DEVICE_GENDER_EVIDENCE', unit: 'count' },
        { name: 'rung reached', value: profile.identityState, source: 'profile.identityState', unit: 'text' },
      ];

    default:
      return common;
  }
}

/* --------------------------------------------------------- last-fired map -- */

export interface FiredMark {
  /** The card this journal entry belongs to. */
  cardId: string;
  /** 1-based step in the session, as the journal numbers it. */
  step: number;
  /** What the shopper did that made it run. */
  label: string;
}

/**
 * Matches journal entries onto cards.
 *
 * Kept here rather than in the screen so the mapping from an engine name to a
 * card is one definition. `engine: null` cards never match, by design - they are
 * reported through the surface they gated, and the screen says so.
 */
export function lastFiredFor(
  entries: { engine?: string | null; step: number; label: string }[],
  ledger: { kind: string; surface: string; step: number; label: string }[] = []
): Record<string, FiredMark> {
  const out: Record<string, FiredMark> = {};

  const mark = (cardId: string, step: number, label: string) => {
    const prev = out[cardId];
    if (!prev || prev.step < step) out[cardId] = { cardId, step, label };
  };

  // Case-insensitive on purpose. The journal names its engines `Intent` and
  // `Similarity`; the cards name theirs `intent` and `similarity`. They are two
  // enums for one concept, and a strict comparison between them silently marked
  // every journal-reported card as never having fired.
  for (const e of entries) {
    if (!e.engine) continue;
    const name = e.engine.toLowerCase();
    for (const card of MODEL_CARDS) {
      if (card.engine !== name) continue;
      mark(card.id, e.step, e.label);
    }
  }

  // The second source, for the models that report through a surface. Same
  // output shape, same recency rule - the screen cannot tell which door a mark
  // came in through, and should not need to.
  for (const row of ledger) {
    for (const card of MODEL_CARDS) {
      const probe = card.ledger;
      if (!probe || !probe.kinds.includes(row.kind)) continue;
      if (probe.surface && probe.surface !== row.surface) continue;
      if (probe.notSurface?.includes(row.surface)) continue;
      mark(card.id, row.step, row.label);
    }
  }

  return out;
}
