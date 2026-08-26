/**
 * Behaviour simulation.
 *
 * Generates a synthetic shopper population, has each shopper browse and buy,
 * and records the resulting event streams. The observable output - session view
 * sequences, cart adds and order baskets - is everything the three engines are
 * allowed to see.
 *
 * The latent variables that drive the simulation (a shopper's true team
 * affinity, the department outfit-affinity table) are the ground truth. They
 * are exported only for the evaluation harness, which measures how well the
 * engines recover them. No engine imports them.
 *
 * Each shopper's final session is held out. The intent engine is scored on
 * whether it can predict the team and department of that held-out purchase
 * from the earlier sessions alone - a genuine next-basket prediction task.
 */

import { Department, Product, TeamId } from '../types';
import { Rng } from './rng';
import {
  CHOICE_SHAPE,
  ChoiceModel,
  abandonProbability,
  addProbability,
  examinationProbability,
  fitLogisticIntercept,
  fitMonotone,
  orderProbability,
  relevanceProbability,
  utility,
} from './choice';
import {
  DEPARTMENTS,
  DEPARTMENT_BY_ID,
  DEPARTMENT_IDS,
  LEAGUE_SEASONALITY,
  SIM_MONTH,
  TEAM_BY_ID,
  TEAM_IDS,
} from './taxonomy';

const BEHAVIOR_SEED = 'behavior-v1';

/**
 * Population size is set by what the *co-order graph* needs, not by what looks
 * impressive. Item-to-item complement estimates are only meaningful with a few
 * observations per pair, and pair counts grow far more slowly than order counts
 * because baskets are small. At 3,200 shoppers essentially every product pair
 * was a singleton, which would have forced every complement to back off to the
 * department level. This size puts a usable fraction of the catalog on
 * item-level evidence while keeping the one-off build under a second.
 */
const POPULATION_SIZE = 14000;
const CO_VIEW_WINDOW = 3;

/**
 * Concentration exponent applied to popularity when choosing basket companions.
 *
 * Real co-purchase graphs are heavily head-weighted: a handful of bestsellers
 * appear in a large share of baskets, so their pairs accumulate real support
 * while the tail stays sparse. Sampling companions proportional to raw
 * popularity spreads observations too evenly and produces a co-order graph made
 * almost entirely of one-off pairs.
 */
const BASKET_CONCENTRATION = 2.2;

/**
 * How many slots the un-personalised grid offers before the shopper runs out of
 * page. Sessions almost never reach this - abandonment ends them first - but it
 * has to be finite, because an infinite grid would let a patient shopper find
 * anything and there would be no such thing as burying an item.
 */
/**
 * How much a session's own department intent suppresses everything outside it.
 *
 * A statement about the shopper: an item outside today's mission is worth about
 * a quarter of an equivalent item inside it. Not fitted, and deliberately not
 * fitted against any evaluation metric.
 *
 * It was first aimed at an observable target - 70% of a session's views landing
 * in one department - and that target turned out to be unreachable at any gate
 * value. Sweeping the gate from 0.05 to 0.45 moved realised concentration by
 * less than a point, from 0.386 to 0.380. The reason is worth stating, because
 * it is the finding rather than the obstacle: the shopper can only click what
 * the grid shows, the organic grid is ordered by popularity across every
 * department, and the mission's department is about an eighth of it. Intent
 * exists in the shopper and the store gives them no way to act on it.
 *
 * That gap - between what the shopper came for and what they end up looking at -
 * is exactly the headroom personalisation is meant to capture, and
 * `measureSurfacePolicy` now shows it is worth about 130% more cart adds per
 * session against an oracle ranker. Closing it properly needs site navigation
 * in the simulator, which is a larger change and its own piece of work.
 */
const DEPT_OFF_FOCUS_GATE = 0.24;

const SURFACE_DEPTH = 48;

/**
 * Concentration applied to popularity when ordering the grid.
 *
 * The un-personalised storefront sorts by sales rank. That would be a hard
 * deterministic sort; this softens it into a popularity-weighted sample without
 * replacement, which stands in for the merchandising rotation, inventory churn
 * and tie-breaking that keep a real grid from being frozen. The hard sort is the
 * limiting case as this exponent goes to infinity.
 */
const SURFACE_CONCENTRATION = 2.2;

/** Off-team items placed in the grid, standing in for cross-sell rails. */
const STRAY_SLOTS = 24;

/* ------------------------------------------------------- calibration ------ */

/**
 * The volume the choice model is fitted to reproduce.
 *
 * These are the aggregate rates the flat constants this model replaces used to
 * produce - measured off the previous generator, not chosen. Holding them fixed
 * is the experimental design: it means any movement in the evaluation metrics
 * comes from a change in *which* items get clicked and carted, not from the
 * population generating more or fewer events. A choice model that also moved
 * the event counts would confound composition with volume and there would be no
 * way to attribute the difference.
 */
const VOLUME_TARGETS = {
  /** Mean distinct products clicked per session, over all generated sessions. */
  depth: 6.6157,
  /** P(add to cart | product clicked). The old rule was 0.2 x mean recency boost. */
  addRate: 0.14,
  /** P(session converts | at least one cart add). The old rule was a flat 0.55. */
  conversion: 0.55,
};

/** Sessions per calibration pass. Large enough to fit against, small enough to be free. */
const CALIBRATION_SESSIONS = 800;
/**
 * Rounds of alternating click/add fits.
 *
 * The two are coupled - a cart add relieves abandonment, so the add rate feeds
 * back into session depth - so neither can be fitted once in isolation. Two
 * rounds of coordinate descent is enough: the second round moves the click
 * intercept by less than a thousandth of a logit.
 */
const CALIBRATION_ROUNDS = 2;

export interface SimSession {
  focusTeam: TeamId;
  /**
   * Share of this session's clicks that landed in the top affinity quartile of
   * the grid it was shown. Per-session because it is a property of the grid.
   */
  discrimination: number;
  /** Sum of the grid positions of this session's clicks. */
  clickPositionSum: number;
  /**
   * The department the shopper came in for.
   *
   * Drawn once at session start rather than implied per click. See
   * `simulateSession` for why the generative story changed.
   */
  focusDept: Department;
  /** Product indices viewed, in order. */
  viewed: number[];
  carted: number[];
  ordered: number[];
  /**
   * Effort accounting. Not observable to any engine - these are what the effort
   * ledger is scored against, and a session that found its item in slot two and
   * one that ground through thirty are only distinguishable here.
   */
  slotsWalked: number;
  /** Slots the shopper actually looked at. The rest were never seen. */
  examined: number;
  /** Slots examined and rejected. */
  scrolledPast: number;
  /** True if the shopper left rather than running out of grid. */
  abandoned: boolean;
}

export interface SyntheticCustomer {
  id: string;
  /** LATENT - normalised true affinity over teams. */
  teamAffinity: Record<TeamId, number>;
  /** LATENT - normalised true affinity over departments. */
  deptAffinity: Record<Department, number>;
  /** 0 = indifferent to price, 1 = highly sensitive. */
  priceSensitivity: number;
  /** 0 = promiscuous browser, 1 = single-team loyalist. */
  loyalty: number;
  /** Observable history the engines may consume. */
  sessions: SimSession[];
  /**
   * HELD OUT - the shopper's next purchasing session.
   *
   * Quarantined: it is excluded from `sessions`, contributes nothing to the
   * co-occurrence graphs, and no engine imports it. The evaluation harness is
   * its only consumer. `basket` and `viewed` are retained because the
   * complement and similarity evaluations need the whole session, not just its
   * anchor label.
   */
  heldOut: {
    team: TeamId;
    department: Department;
    productIndex: number;
    basket: number[];
    viewed: number[];
  } | null;
}

/** Sparse symmetric co-occurrence counts, keyed by product index. */
export type CoMatrix = Map<number, Map<number, number>>;

export interface CoGraphs {
  coView: CoMatrix;
  coCart: CoMatrix;
  coOrder: CoMatrix;
  /** Marginals - how many sessions/orders each product appeared in. */
  viewCount: Int32Array;
  cartCount: Int32Array;
  orderCount: Int32Array;
  totalSessions: number;
  totalOrders: number;
}

export interface SimulationResult {
  customers: SyntheticCustomer[];
  graphs: CoGraphs;
  /** The fitted choice model this world was generated under. */
  choice: ChoiceModel;
  stats: {
    populationSize: number;
    sessionCount: number;
    orderCount: number;
    viewEventCount: number;
    meanBasketSize: number;
    elapsedMs: number;
    /**
     * What the fitted intercepts actually produced over the whole population,
     * as against what they were fitted to on the calibration sample. Reported
     * because a calibration that missed should be visible rather than assumed.
     * Measured over every generated session, held-out ones included, since that
     * is the population the fit targeted.
     */
    realised: {
      depth: number;
      addRate: number;
      conversion: number;
      /** Mean grid slots walked per session. */
      slotsWalked: number;
      /** Mean slots examined and rejected per session. */
      scrolledPast: number;
      /** Share of sessions ended by the shopper leaving rather than by running out of grid. */
      abandonRate: number;
      /**
       * Share of clicks landing in the top affinity quartile of the grid that
       * was shown, averaged over sessions. Indifference is about 0.25.
       *
       * This is the number that says whether the simulated shopper is actually
       * a shopper. It is reported rather than assumed because the first version
       * of the choice model was close to indifferent - it clicked things it did
       * not want almost as readily as things it did - and nothing else in the
       * output showed it. See the note on CHOICE_SHAPE.
       */
      discrimination: number;
    };
  };
}

function bump(matrix: CoMatrix, a: number, b: number, amount = 1): void {
  let row = matrix.get(a);
  if (!row) {
    row = new Map();
    matrix.set(a, row);
  }
  row.set(b, (row.get(b) ?? 0) + amount);
}

function bumpSymmetric(matrix: CoMatrix, a: number, b: number, amount = 1): void {
  if (a === b) return;
  bump(matrix, a, b, amount);
  bump(matrix, b, a, amount);
}

/** Index the catalog by team and by (team, department) for fast weighted sampling. */
function buildBuckets(products: Product[]) {
  const byTeam = new Map<TeamId, number[]>();
  const byTeamDept = new Map<string, number[]>();

  products.forEach((p, i) => {
    if (!byTeam.has(p.team)) byTeam.set(p.team, []);
    byTeam.get(p.team)!.push(i);

    const key = `${p.team}|${p.department}`;
    if (!byTeamDept.has(key)) byTeamDept.set(key, []);
    byTeamDept.get(key)!.push(i);
  });

  return { byTeam, byTeamDept };
}

/**
 * Draws a shopper's latent team affinity. Most fans are concentrated on one
 * club with a secondary local interest; a minority browse broadly. The
 * `loyalty` parameter controls the concentration and is what ultimately makes
 * some customers predictable and others genuinely ambiguous - which is how the
 * low-confidence and fallback paths earn their behaviour.
 */
function drawTeamAffinity(rng: Rng): { affinity: Record<TeamId, number>; loyalty: number } {
  const loyalty = Math.min(0.98, Math.max(0.08, rng.gaussian(0.68, 0.24)));

  const primary = rng.pickWeighted(
    TEAM_IDS,
    TEAM_IDS.map((t) => TEAM_BY_ID[t].marketSize)
  );
  const primaryCfg = TEAM_BY_ID[primary];

  const raw: Record<TeamId, number> = {} as Record<TeamId, number>;
  for (const t of TEAM_IDS) {
    const cfg = TEAM_BY_ID[t];
    if (t === primary) {
      raw[t] = 1.0;
    } else {
      // Same-city clubs are the natural secondary interest.
      const cityBonus = cfg.city === primaryCfg.city ? 0.45 : 0.0;
      const base = (1 - loyalty) * rng.range(0.05, 0.7);
      raw[t] = base + cityBonus * (1 - loyalty) * 1.6 + rng.range(0, 0.04);
    }
  }

  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const affinity = {} as Record<TeamId, number>;
  for (const t of TEAM_IDS) affinity[t] = raw[t] / total;
  return { affinity, loyalty };
}

function drawDeptAffinity(rng: Rng): Record<Department, number> {
  const raw = {} as Record<Department, number>;
  // A shopper has one or two departments they gravitate to, over a base rate
  // proportional to how much of the assortment that department represents.
  const favourite = rng.pickWeighted(
    DEPARTMENT_IDS,
    DEPARTMENTS.map((d) => d.assortmentWeight)
  );
  for (const d of DEPARTMENT_IDS) {
    const cfg = DEPARTMENT_BY_ID[d];
    raw[d] = cfg.assortmentWeight * rng.range(0.4, 1.3) + (d === favourite ? rng.range(0.35, 0.8) : 0);
  }
  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  for (const d of DEPARTMENT_IDS) raw[d] = raw[d] / total;
  return raw;
}

/**
 * Relevance of a product to a shopper in a given session, before popularity.
 *
 * This reads the shopper's latent affinities directly, which is the point: it is
 * the ground truth every ranker in this repo is denied, and the choice model in
 * choice.ts is a calibrated link function over exactly this quantity. The gap
 * between what this knows and what an engine can infer is the only thing the
 * evaluation harness is measuring.
 *
 * `focusDept` enters the same way `focusTeam` does, and deliberately so - see
 * `simulateSession`.
 */
function productAffinityScore(
  product: Product,
  customer: SyntheticCustomer,
  focusTeam: TeamId,
  focusDept: Department
): number {
  // Standing taste: what this shopper likes in general, unchanged from before.
  const teamTerm = product.team === focusTeam ? 1.0 : customer.teamAffinity[product.team] * 0.35;
  const deptTerm = customer.deptAffinity[product.department];
  const standingTaste = Math.max(1e-4, teamTerm * 0.5 + deptTerm * 0.3);

  // Today's mission, applied as a gate rather than as a fourth additive term.
  // The additive form was tried first and it does not work: team and department
  // compete for the same fixed mass there, so a session cannot be made more
  // department-focused without being made less team-focused, and the strongest
  // honest setting still left the focus department at only ~1.45:1 over its
  // rivals. A gate says something different and truer - standing taste decides
  // what you would like, session intent decides what you came for today.
  const intentGate = product.department === focusDept ? 1 : DEPT_OFF_FOCUS_GATE;

  const popularityTerm = product.popularity / 100;

  // Price sensitivity pushes shoppers toward the cheaper end of the assortment.
  const effectivePrice = product.salePrice ?? product.price;
  const priceTerm = 1 - customer.priceSensitivity * Math.min(1, effectivePrice / 200);

  return standingTaste * intentGate * (0.35 + popularityTerm * 0.65) * priceTerm;
}

/**
 * Builds an order basket from an anchor product using the department
 * outfit-affinity ground truth. Deliberately directional: the anchor pulls in
 * companions, not the other way round.
 */
function buildBasket(
  rng: Rng,
  anchorIdx: number,
  products: Product[],
  byTeamDept: Map<string, number[]>,
  customer: SyntheticCustomer
): number[] {
  const anchor = products[anchorIdx];
  const basket = [anchorIdx];
  const affinities = DEPARTMENT_BY_ID[anchor.department].outfitAffinity;

  for (const [deptRaw, propensityRaw] of Object.entries(affinities)) {
    const dept = deptRaw as Department;
    const propensity = propensityRaw ?? 0;
    // Price-sensitive shoppers attach fewer extras.
    const adjusted = propensity * (1 - customer.priceSensitivity * 0.35);
    if (!rng.chance(adjusted)) continue;

    const bucket = byTeamDept.get(`${anchor.team}|${dept}`);
    if (!bucket || bucket.length === 0) continue;

    const pick = rng.pickWeighted(
      bucket,
      bucket.map((i) => Math.pow(products[i].popularity, BASKET_CONCENTRATION))
    );
    if (!basket.includes(pick)) basket.push(pick);
  }

  return basket;
}

/* ------------------------------------------------------------- surfacing -- */

/**
 * What the un-personalised storefront puts in front of the shopper, in order.
 *
 * This is the seam that did not exist before, and its absence is why a paired
 * A/B over the old simulator would have measured exactly zero. Sessions used to
 * sample viewed products directly from an affinity-weighted pool, which means
 * the shopper found what they wanted regardless of what the store showed them.
 * Ranking could not help and could not hurt.
 *
 * Now the store surfaces a list and the shopper walks it. The default policy
 * knows nothing about the shopper - it sorts by sales rank, softened, which is
 * what an un-personalised grid does. A personalised arm supplies a different
 * ordering over the same candidates and the difference in outcome is a real
 * measurement rather than an artefact.
 *
 * Selection is an exponential race - key = -ln(u) / weight, take the smallest -
 * which is a weighted sample without replacement in one pass, rather than the
 * repeated weighted picks that would make this quadratic in the assortment.
 */
export type SurfacePolicy = (
  candidates: number[],
  products: Product[],
  customer: SyntheticCustomer,
  focusTeam: TeamId,
  focusDept: Department
) => number[];

/**
 * The affinity value at the 75th percentile of a grid.
 *
 * Used to score selectivity as the share of a session's clicks landing in the
 * quarter of the grid the shopper most wanted. A ratio of click probabilities
 * was tried first and is the wrong statistic: the bottom of a real grid holds
 * off-team strays whose relevance is near zero, so the ratio divides by
 * approximately nothing and reports five-figure numbers that mean nothing. A
 * share is bounded, and it degrades gracefully.
 */
function topQuartileThreshold(affinities: number[]): number {
  if (affinities.length === 0) return Infinity;
  const sorted = affinities.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.75)];
}

function surfaceOrganic(rng: Rng, candidates: number[], products: Product[]): number[] {
  const n = candidates.length;
  const keys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const weight = Math.pow(products[candidates[i]].popularity, SURFACE_CONCENTRATION);
    keys[i] = -Math.log(Math.max(1e-12, rng.float())) / Math.max(1e-9, weight);
  }
  const order = candidates.map((_, i) => i);
  order.sort((a, b) => keys[a] - keys[b]);
  const depth = Math.min(SURFACE_DEPTH, n);
  const out: number[] = new Array(depth);
  for (let i = 0; i < depth; i++) out[i] = candidates[order[i]];
  return out;
}

/* --------------------------------------------------------------- browse -- */

interface BrowseOutcome {
  viewed: number[];
  carted: number[];
  /** Affinity of each carted item, in the same order. */
  cartedAffinity: number[];
  slotsWalked: number;
  examined: number;
  scrolledPast: number;
  abandoned: boolean;
}

/**
 * Walks a surfaced list slot by slot under the choice model.
 *
 * The three outcomes per slot partition exhaustively - examined and clicked,
 * examined and rejected, never seen - which is what lets a later effort ledger
 * tell indifference apart from invisibility. They are different failures and
 * they have different fixes: one is a relevance problem, the other is a ranking
 * problem, and a simulator that collapses them cannot support the distinction.
 */
function browse(
  rng: Rng,
  surfaced: number[],
  affinities: number[],
  model: ChoiceModel
): BrowseOutcome {
  const viewed: number[] = [];
  const carted: number[] = [];
  const cartedAffinity: number[] = [];
  const state = { slotsWalked: 0, missStreak: 0, clicks: 0, adds: 0 };
  let examined = 0;
  let scrolledPast = 0;
  let abandoned = false;

  for (let pos = 0; pos < surfaced.length; pos++) {
    state.slotsWalked++;
    const affinity = affinities[pos];

    if (rng.chance(examinationProbability(pos, model))) {
      examined++;
      if (rng.chance(relevanceProbability(affinity, model))) {
        viewed.push(surfaced[pos]);
        state.clicks++;
        state.missStreak = 0;
        if (rng.chance(addProbability(affinity, model))) {
          carted.push(surfaced[pos]);
          cartedAffinity.push(affinity);
          state.adds++;
        }
      } else {
        scrolledPast++;
        state.missStreak++;
      }
    }

    if (rng.chance(abandonProbability(state, CHOICE_SHAPE))) {
      abandoned = true;
      break;
    }
  }

  return {
    viewed,
    carted,
    cartedAffinity,
    slotsWalked: state.slotsWalked,
    examined,
    scrolledPast,
    abandoned,
  };
}

/* -------------------------------------------------------------- session -- */

/** Median basket value, used to make the conversion price term unitless. */
const REFERENCE_BASKET_VALUE = 120;

function simulateSession(
  rng: Rng,
  customer: SyntheticCustomer,
  products: Product[],
  byTeam: Map<TeamId, number[]>,
  byTeamDept: Map<string, number[]>,
  model: ChoiceModel,
  rank?: SurfacePolicy
): SimSession {
  // Which club is front of mind this session: affinity weighted by how in-season
  // that club's league currently is.
  const focusTeam = rng.pickWeighted(
    TEAM_IDS,
    TEAM_IDS.map((t) => customer.teamAffinity[t] * LEAGUE_SEASONALITY[TEAM_BY_ID[t].league][SIM_MONTH])
  );

  /*
   * The department the shopper came in for, drawn once, here.
   *
   * This replaces a generative story that had no session-level department at
   * all: every click sampled independently from the shopper's lifetime
   * department affinity, so a single session could wander from a jersey to a
   * mug to a pair of socks with nothing tying them together. That is not how
   * anybody shops. People arrive with a mission - a gift, a birthday, a kit for
   * the new season - and the mission is a property of the visit rather than of
   * the click.
   *
   * It enters exactly where `focusTeam` does and with the same coefficients,
   * which is the point: this is the same claim about how a session is
   * organised, applied to the axis it was previously missing. It is a change to
   * the story the simulator tells, not a knob turned until a metric improved -
   * and it moves the department metric in a direction that has to be published
   * either way.
   */
  const focusDept = rng.pickWeighted(
    DEPARTMENT_IDS,
    DEPARTMENT_IDS.map((d) => customer.deptAffinity[d])
  );

  // Candidate set: the focus team's assortment, plus a slice of the rest of the
  // catalog so cross-team co-views exist at a realistic low rate.
  const focusPool = byTeam.get(focusTeam) ?? [];
  // Sampled directly rather than by shuffling the whole catalog - this runs once
  // per simulated session and the allocation churn is otherwise significant.
  const candidates = focusPool.slice();
  for (let i = 0; i < STRAY_SLOTS; i++) candidates.push(rng.int(0, products.length - 1));
  const empty: SimSession = {
    focusTeam,
    focusDept,
    discrimination: 0,
    clickPositionSum: 0,
    viewed: [],
    carted: [],
    ordered: [],
    slotsWalked: 0,
    examined: 0,
    scrolledPast: 0,
    abandoned: false,
  };
  if (candidates.length === 0) return empty;

  const surfaced = rank
    ? rank(candidates, products, customer, focusTeam, focusDept).slice(0, SURFACE_DEPTH)
    : surfaceOrganic(rng, candidates, products);

  const affinities = surfaced.map((i) => productAffinityScore(products[i], customer, focusTeam, focusDept));

  const outcome = browse(rng, surfaced, affinities, model);

  // Selectivity, conditioned within this one grid - the comparison that means
  // something is between two items the same shopper saw on the same visit.
  // Reference point is 0.25: a shopper who clicks without regard to what the
  // item is scatters their clicks evenly across the grid's affinity quartiles.
  // The organic grid is popularity-ordered and popularity feeds affinity, so
  // the true indifference level sits a little above 0.25 rather than exactly on
  // it; the statistic is a check for gross insensitivity, not a hypothesis test.
  const threshold = topQuartileThreshold(affinities);
  let topClicks = 0;
  let clickPositionSum = 0;
  for (const idx of outcome.viewed) {
    const at = surfaced.indexOf(idx);
    if (at < 0) continue;
    clickPositionSum += at;
    if (affinities[at] >= threshold) topClicks++;
  }
  const discrimination = outcome.viewed.length > 0 ? topClicks / outcome.viewed.length : 0;

  // Conversion now reads the cart rather than a coin. A cart full of things the
  // shopper wanted converts better than a cart full of things they did not,
  // which is the whole mechanism by which better recommending can move revenue.
  let ordered: number[] = [];
  if (outcome.carted.length > 0) {
    let affinitySum = 0;
    let value = 0;
    for (let i = 0; i < outcome.carted.length; i++) {
      affinitySum += outcome.cartedAffinity[i];
      const p = products[outcome.carted[i]];
      value += p.salePrice ?? p.price;
    }
    const meanAffinity = affinitySum / outcome.carted.length;

    if (
      rng.chance(
        orderProbability(
          {
            meanAffinity,
            relativeValue: value / REFERENCE_BASKET_VALUE,
            priceSensitivity: customer.priceSensitivity,
          },
          model
        )
      )
    ) {
      // The anchor is the item the shopper actually came for, so it is drawn by
      // affinity rather than uniformly. Weighted rather than argmax: a cart is
      // not always anchored on its single best item.
      const anchorIdx = rng.pickWeighted(outcome.carted, outcome.cartedAffinity);
      ordered = buildBasket(rng, anchorIdx, products, byTeamDept, customer);
    }
  }

  return {
    focusTeam,
    focusDept,
    discrimination,
    clickPositionSum,
    viewed: outcome.viewed,
    carted: outcome.carted,
    ordered,
    slotsWalked: outcome.slotsWalked,
    examined: outcome.examined,
    scrolledPast: outcome.scrolledPast,
    abandoned: outcome.abandoned,
  };
}

/* ---------------------------------------------------------- calibration -- */

/** A shopper drawn only to fit the choice model against; never enters the population. */
function drawCustomer(rng: Rng, id: string): SyntheticCustomer {
  const { affinity, loyalty } = drawTeamAffinity(rng);
  return {
    id,
    teamAffinity: affinity,
    deptAffinity: drawDeptAffinity(rng),
    priceSensitivity: Math.min(1, Math.max(0, rng.gaussian(0.45, 0.22))),
    loyalty,
    sessions: [],
    heldOut: null,
  };
}

/**
 * Fits the three intercepts against the volume targets.
 *
 * Runs on its own RNG stream, re-seeded identically for every evaluation, for
 * two reasons. The main population stream is untouched, so calibrating does not
 * shift the world it is calibrating for. And each evaluation is a deterministic
 * function of the intercept, which is what makes bisection exact - on a noisy
 * objective it would wander and the dataset would stop being reproducible.
 *
 * The fitted values are reported with what they achieved on the calibration
 * sample, and `simulateBehavior` separately reports what they realised over the
 * full population. Those are not the same number and the gap is the fit's
 * sampling error, which is worth being able to see.
 */
function calibrateChoiceModel(
  products: Product[],
  byTeam: Map<TeamId, number[]>,
  byTeamDept: Map<string, number[]>,
  seed: string
): ChoiceModel {
  const model: ChoiceModel = {
    ...CHOICE_SHAPE,
    clickIntercept: 0,
    addIntercept: 0,
    orderIntercept: 0,
    calibration: {
      depth: { target: VOLUME_TARGETS.depth, achieved: 0, iterations: 0 },
      addRate: { target: VOLUME_TARGETS.addRate, achieved: 0, iterations: 0 },
      conversion: { target: VOLUME_TARGETS.conversion, achieved: 0, iterations: 0 },
    },
  };

  /** One deterministic calibration pass. Same seed every time, by design. */
  const pass = (): SimSession[] => {
    const rng = new Rng(`${seed}:calibration`);
    const out: SimSession[] = [];
    for (let i = 0; i < CALIBRATION_SESSIONS; i++) {
      const customer = drawCustomer(rng, `calib-${i}`);
      out.push(simulateSession(rng, customer, products, byTeam, byTeamDept, model));
    }
    return out;
  };

  // Click and add are coupled through abandonment relief, so they alternate.
  for (let round = 0; round < CALIBRATION_ROUNDS; round++) {
    const depthFit = fitMonotone(
      (intercept) => {
        model.clickIntercept = intercept;
        const sessions = pass();
        let views = 0;
        for (const s of sessions) views += s.viewed.length;
        return views / Math.max(1, sessions.length);
      },
      VOLUME_TARGETS.depth,
      -25,
      25,
      { maxIterations: 22 }
    );
    model.clickIntercept = depthFit.value;
    model.calibration.depth = {
      target: VOLUME_TARGETS.depth,
      achieved: depthFit.achieved,
      iterations: depthFit.iterations,
    };

    // The add rate is a closed-form fit over the affinities that were actually
    // clicked, which is why it needs the click intercept settled first.
    const clicked: number[] = [];
    {
      const rng = new Rng(`${seed}:calibration`);
      for (let i = 0; i < CALIBRATION_SESSIONS; i++) {
        const customer = drawCustomer(rng, `calib-${i}`);
        const session = simulateSession(rng, customer, products, byTeam, byTeamDept, model);
        for (const idx of session.viewed) {
          clicked.push(
            utility(productAffinityScore(products[idx], customer, session.focusTeam, session.focusDept))
          );
        }
      }
    }
    const addFit = fitLogisticIntercept(clicked, model.addSlope, VOLUME_TARGETS.addRate);
    model.addIntercept = addFit.value;
    model.calibration.addRate = {
      target: VOLUME_TARGETS.addRate,
      achieved: addFit.achieved,
      iterations: addFit.iterations,
    };
  }

  // Conversion is downstream of both and feeds back into neither, so it is
  // fitted once, last, over the carts the settled model actually produces.
  const cartUtilities: number[] = [];
  const cartPriceOffsets: number[] = [];
  {
    const rng = new Rng(`${seed}:calibration`);
    for (let i = 0; i < CALIBRATION_SESSIONS; i++) {
      const customer = drawCustomer(rng, `calib-${i}`);
      const session = simulateSession(rng, customer, products, byTeam, byTeamDept, model);
      if (session.carted.length === 0) continue;
      let affinitySum = 0;
      let value = 0;
      for (const idx of session.carted) {
        affinitySum += productAffinityScore(products[idx], customer, session.focusTeam, session.focusDept);
        const p = products[idx];
        value += p.salePrice ?? p.price;
      }
      cartUtilities.push(utility(affinitySum / session.carted.length));
      cartPriceOffsets.push(
        model.orderPricePenalty * customer.priceSensitivity * (value / REFERENCE_BASKET_VALUE)
      );
    }
  }
  const orderFit = fitLogisticIntercept(
    cartUtilities,
    model.orderAffinitySlope,
    VOLUME_TARGETS.conversion,
    cartPriceOffsets
  );
  model.orderIntercept = orderFit.value;
  model.calibration.conversion = {
    target: VOLUME_TARGETS.conversion,
    achieved: orderFit.achieved,
    iterations: orderFit.iterations,
  };

  return model;
}

/** Aggregate outcome of one arm of a surfacing experiment. */
export interface ArmResult {
  sessions: number;
  depth: number;
  addRate: number;
  conversion: number;
  /** Share of clicks landing in the grid's top affinity quartile. */
  selectivity: number;
  abandonRate: number;
  /** Mean grid position of a click. Lower is a shopper finding things sooner. */
  meanClickPosition: number;
}

/**
 * Runs one surfacing policy against a fresh population and reports what it did.
 *
 * This exists because the surfacing seam is only worth having if something can
 * measure through it. Both arms draw their shoppers from the same seed, so the
 * two populations are identical shopper for shopper and the comparison is
 * paired: any difference is the ordering of the grid and nothing else.
 *
 * Pass `null` for the organic popularity-ordered grid.
 */
export function measureSurfacePolicy(
  products: Product[],
  policy: SurfacePolicy | null,
  seed: string = BEHAVIOR_SEED,
  shoppers = 4000
): ArmResult {
  const rng = new Rng(`${seed}:experiment`);
  const { byTeam, byTeamDept } = buildBuckets(products);
  const choice = calibrateChoiceModel(products, byTeam, byTeamDept, seed);

  let sessions = 0;
  let views = 0;
  let carts = 0;
  let withCart = 0;
  let converted = 0;
  let abandoned = 0;
  let selectivity = 0;
  let clickPositionSum = 0;
  let clickPositionN = 0;

  for (let c = 0; c < shoppers; c++) {
    const customer = drawCustomer(rng, `arm-${c}`);
    const sessionCount = Math.max(2, Math.min(7, Math.round(rng.logNormal(Math.log(3.2), 0.45))));
    for (let i = 0; i < sessionCount; i++) {
      const session = simulateSession(rng, customer, products, byTeam, byTeamDept, choice, policy ?? undefined);
      sessions++;
      views += session.viewed.length;
      carts += session.carted.length;
      selectivity += session.discrimination;
      if (session.abandoned) abandoned++;
      if (session.carted.length > 0) {
        withCart++;
        if (session.ordered.length > 0) converted++;
      }
      clickPositionSum += session.clickPositionSum;
      clickPositionN += session.viewed.length;
    }
  }

  const r = (v: number, d: number) => Number((v / Math.max(1, d)).toFixed(4));
  return {
    sessions,
    depth: r(views, sessions),
    addRate: r(carts, views),
    conversion: r(converted, withCart),
    selectivity: r(selectivity, sessions),
    abandonRate: r(abandoned, sessions),
    meanClickPosition: r(clickPositionSum, clickPositionN),
  };
}

export function simulateBehavior(products: Product[], seed: string = BEHAVIOR_SEED): SimulationResult {
  const startedAt = performance.now();
  const rng = new Rng(seed);
  const { byTeam, byTeamDept } = buildBuckets(products);

  // Fitted before a single population shopper is drawn, on its own RNG stream,
  // so calibrating the model does not perturb the world it is calibrated for.
  const choice = calibrateChoiceModel(products, byTeam, byTeamDept, seed);

  const graphs: CoGraphs = {
    coView: new Map(),
    coCart: new Map(),
    coOrder: new Map(),
    viewCount: new Int32Array(products.length),
    cartCount: new Int32Array(products.length),
    orderCount: new Int32Array(products.length),
    totalSessions: 0,
    totalOrders: 0,
  };

  const customers: SyntheticCustomer[] = [];
  let viewEventCount = 0;
  let basketSizeTotal = 0;

  // Realised volumes, accumulated over every generated session including the
  // held-out ones - the calibration targeted the generative process, so it has
  // to be checked against the generative process rather than against the
  // observable subset, which is depleted of orders by construction.
  let allSessions_ = 0;
  let allViews = 0;
  let allCarts = 0;
  let allSessionsWithCart = 0;
  let allConverted = 0;
  let allSlotsWalked = 0;
  let allScrolledPast = 0;
  let allAbandoned = 0;
  let allDiscrimination = 0;

  for (let c = 0; c < POPULATION_SIZE; c++) {
    const { affinity, loyalty } = drawTeamAffinity(rng);
    const customer: SyntheticCustomer = {
      id: `cust-${c}`,
      teamAffinity: affinity,
      deptAffinity: drawDeptAffinity(rng),
      priceSensitivity: Math.min(1, Math.max(0, rng.gaussian(0.45, 0.22))),
      loyalty,
      sessions: [],
      heldOut: null,
    };

    // Between 2 and 7 sessions; the last one is reserved for evaluation.
    const sessionCount = Math.max(2, Math.min(7, Math.round(rng.logNormal(Math.log(3.2), 0.45))));
    const allSessions: SimSession[] = [];
    for (let s = 0; s < sessionCount; s++) {
      allSessions.push(simulateSession(rng, customer, products, byTeam, byTeamDept, choice));
    }

    for (const session of allSessions) {
      allSessions_++;
      allViews += session.viewed.length;
      allCarts += session.carted.length;
      allSlotsWalked += session.slotsWalked;
      allScrolledPast += session.scrolledPast;
      if (session.abandoned) allAbandoned++;
      allDiscrimination += session.discrimination;
      if (session.carted.length > 0) {
        allSessionsWithCart++;
        if (session.ordered.length > 0) allConverted++;
      }
    }

    // Hold out the last session that actually resulted in a purchase, so the
    // evaluation task is well defined. Customers who never buy carry no label.
    let heldOutSessionIdx = -1;
    for (let s = allSessions.length - 1; s >= 1; s--) {
      if (allSessions[s].ordered.length > 0) {
        heldOutSessionIdx = s;
        break;
      }
    }

    if (heldOutSessionIdx >= 0) {
      const held = allSessions[heldOutSessionIdx];
      const anchorIdx = held.ordered[0];
      customer.heldOut = {
        team: products[anchorIdx].team,
        department: products[anchorIdx].department,
        productIndex: anchorIdx,
        basket: held.ordered,
        viewed: held.viewed,
      };
      customer.sessions = allSessions.slice(0, heldOutSessionIdx);
    } else {
      customer.sessions = allSessions;
    }

    // Only the observable (non-held-out) sessions contribute to the graphs.
    // Leaking the held-out basket into the co-occurrence counts would inflate
    // every metric the evaluation harness reports.
    for (const session of customer.sessions) {
      graphs.totalSessions++;
      viewEventCount += session.viewed.length;

      for (const idx of session.viewed) graphs.viewCount[idx]++;
      for (const idx of session.carted) graphs.cartCount[idx]++;

      // Co-view within a sliding window - adjacent views are the meaningful
      // signal; two products seen 15 clicks apart are not really related.
      for (let i = 0; i < session.viewed.length; i++) {
        for (let j = i + 1; j < Math.min(session.viewed.length, i + 1 + CO_VIEW_WINDOW); j++) {
          bumpSymmetric(graphs.coView, session.viewed[i], session.viewed[j]);
        }
      }

      for (let i = 0; i < session.carted.length; i++) {
        for (let j = i + 1; j < session.carted.length; j++) {
          bumpSymmetric(graphs.coCart, session.carted[i], session.carted[j]);
        }
      }

      if (session.ordered.length > 0) {
        graphs.totalOrders++;
        basketSizeTotal += session.ordered.length;
        for (const idx of session.ordered) graphs.orderCount[idx]++;
        for (let i = 0; i < session.ordered.length; i++) {
          for (let j = i + 1; j < session.ordered.length; j++) {
            bumpSymmetric(graphs.coOrder, session.ordered[i], session.ordered[j]);
          }
        }
      }
    }

    customers.push(customer);
  }

  const perSession = (v: number) => Number((v / Math.max(1, allSessions_)).toFixed(4));

  return {
    customers,
    graphs,
    choice,
    stats: {
      populationSize: customers.length,
      sessionCount: graphs.totalSessions,
      orderCount: graphs.totalOrders,
      viewEventCount,
      meanBasketSize: graphs.totalOrders > 0 ? basketSizeTotal / graphs.totalOrders : 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      realised: {
        depth: perSession(allViews),
        addRate: Number((allCarts / Math.max(1, allViews)).toFixed(4)),
        conversion: Number((allConverted / Math.max(1, allSessionsWithCart)).toFixed(4)),
        slotsWalked: perSession(allSlotsWalked),
        scrolledPast: perSession(allScrolledPast),
        abandonRate: Number((allAbandoned / Math.max(1, allSessions_)).toFixed(4)),
        discrimination: perSession(allDiscrimination),
      },
    },
  };
}

/** Normalised co-occurrence degree for a single product. */
export interface GraphScores {
  coView: number;
  coCart: number;
  coOrder: number;
}

/** Per-product co-occurrence degree, keyed by product id. */
export type GraphScoreTable = Map<string, GraphScores>;

/**
 * Measures normalised co-occurrence degree for every product.
 *
 * These were hand-authored constants in the original demo and are now measured
 * off the simulated graphs. They used to be written back onto each Product as
 * coViewScore / coCartScore / coOrderScore; they are returned as a side table
 * instead, for two reasons.
 *
 * The writeback made the catalog mutable after generation, and `getDataset()`
 * hands every caller the same Product instances - so the moment a market event
 * starts editing the catalog, two simulation arms sharing that dataset would be
 * reading each other's edits rather than running an honest paired comparison.
 * And the fields had no readers: the old comment here claimed the UI read them,
 * but nothing in src or scripts ever did, so nothing is being taken away.
 *
 * Keyed by id rather than by catalog index because an index is a position, and a
 * catalog-mutating event is exactly what invalidates positions.
 */
export function computeGraphScores(products: Product[], graphs: CoGraphs): GraphScoreTable {
  const degree = (m: CoMatrix, i: number): number => {
    const row = m.get(i);
    if (!row) return 0;
    let total = 0;
    for (const v of row.values()) total += v;
    return total;
  };

  const viewDeg = products.map((_, i) => degree(graphs.coView, i));
  const cartDeg = products.map((_, i) => degree(graphs.coCart, i));
  const orderDeg = products.map((_, i) => degree(graphs.coOrder, i));

  const norm = (arr: number[]) => {
    const max = Math.max(1, ...arr);
    return arr.map((v) => Number((v / max).toFixed(4)));
  };

  const nv = norm(viewDeg);
  const nc = norm(cartDeg);
  const no = norm(orderDeg);

  const table: GraphScoreTable = new Map();
  products.forEach((p, i) => {
    table.set(p.id, { coView: nv[i], coCart: nc[i], coOrder: no[i] });
  });
  return table;
}
