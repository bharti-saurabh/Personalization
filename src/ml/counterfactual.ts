/**
 * PAIRED COUNTERFACTUAL - what personalization costs the shopper, in steps.
 *
 * Every other measurement in this repo scores ranking quality: given a held-out
 * purchase, how high did the model put it. That is the right question for a
 * model and the wrong question for a shopper, who does not experience NDCG.
 * They experience walking a grid until they find the thing, or until they give
 * up. This module measures that walk.
 *
 * NOTHING HERE PRODUCES A CURRENCY FIGURE. No revenue, no ROI, no order value,
 * no lift on any of them. The units are steps taken, items seen, dead ends
 * walked into and sessions abandoned - counts of shopper effort in a simulated
 * world, labelled exactly as the existing offline metrics are labelled. This is
 * deliberate and it is the point: an effort claim can be checked against the
 * simulator that produced it, and a revenue claim cannot be checked against
 * anything at all.
 *
 * ------------------------------------------------------------------ method --
 *
 * Two arms, per shopper:
 *
 *   personalized   the grid is ordered by the intent engine's posterior over
 *                  clubs and departments - the SAME engine the storefront runs,
 *                  reading the SAME observable event stream, denied the
 *                  shopper's latents exactly as it is in the app.
 *   popularity     the grid is ordered by sales rank, softened into a
 *                  popularity-weighted sample. This is the control, and it is
 *                  the honest control: it is what the storefront actually does
 *                  when personalization is switched off.
 *
 * PAIRED, and paired hard. The two arms get the same shopper, the same latent
 * affinities, the same session intent, the same candidate pool, and - this is
 * the part that matters - the same underlying random draws at each slot, from a
 * pre-drawn tape. If slot 3 in both arms would be examined at u = 0.11, both
 * arms examine slot 3. The arms therefore differ in exactly one respect: WHAT
 * IS SITTING IN THAT SLOT. Any difference in outcome is attributable to the
 * ordering and to nothing else.
 *
 * That is common random numbers, a standard variance-reduction device for
 * paired simulation, and it is doing real work here. Without it the difference
 * between arms is swamped by the difference between lucky and unlucky draws,
 * and the confidence intervals are two to three times wider for the same
 * sample. The one randomness NOT shared is the popularity arm's own tie-break
 * jitter, because the personalized arm has no counterpart to share it with.
 *
 * ------------------------------------------------------------------ target --
 *
 * The target is not invented. It is the shopper's HELD-OUT session - the
 * purchase the simulator generated and then quarantined from every engine. The
 * spec ("a men's Eagles jersey, size L, under $120") is read off that product,
 * so "did the shopper reach the target" is a question about ground truth rather
 * than about a goal we chose after seeing the answer.
 *
 * Two bars, deliberately different:
 *
 *   RELEVANT  right club, right department. The correct aisle.
 *   TARGET    relevant, and also the right gender, an available size, and
 *             within budget. The actual thing they came for.
 *
 * Collapsing these would hide the failure mode that matters most: a grid can be
 * full of Eagles jerseys and still not contain a men's large under $120, and a
 * shopper in that grid is doing work that looks like progress and is not.
 *
 * No React, no DOM: `npm run sim:effort` runs this from the command line.
 */

import { Department, Product, TeamId } from '../types';
import {
  SURFACE_CONCENTRATION,
  SURFACE_DEPTH,
  SyntheticCustomer,
  productAffinityScore,
} from '../sim/behavior';
import {
  CHOICE_SHAPE,
  ChoiceModel,
  abandonProbability,
  addProbability,
  examinationProbability,
  relevanceProbability,
} from '../sim/choice';
import { Rng } from '../sim/rng';
import { CONFIDENCE_THRESHOLD, predictIntent } from './intent';
import { asScenario } from './evaluate';

/* --------------------------------------------------------------- target -- */

export interface Target {
  /** The held-out purchase this spec was read off. */
  productIndex: number;
  team: TeamId;
  department: Department;
  gender: Product['gender'];
  /** The size the shopper needs, when the department has a size ladder. */
  size: string | null;
  /** Budget ceiling, rounded up from the held-out product's price. */
  maxPrice: number;
  /** Plain words, for the top of the race screen. */
  description: string;
}

/** Article the description needs. Trivial, but "a Eagles jersey" reads wrong. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/**
 * Reads a target spec off the shopper's held-out purchase.
 *
 * Returns null when the shopper has no held-out session - roughly the shoppers
 * who never bought anything - because a race with no finish line is not a race
 * and padding the sample with them would quietly bias every metric toward the
 * arm that gives up first.
 */
export function deriveTarget(customer: SyntheticCustomer, products: Product[]): Target | null {
  if (!customer.heldOut) return null;
  const p = products[customer.heldOut.productIndex];
  if (!p) return null;

  const sizes = p.sizes ?? [];
  // The middle of the ladder - the size most shoppers need, and the one most
  // likely to be genuinely stocked, so the target is hard but not unfair.
  const size = sizes.length > 0 ? sizes[Math.floor(sizes.length / 2)] : null;
  const price = p.salePrice ?? p.price;
  const maxPrice = Math.ceil((price + 1) / 10) * 10;

  const genderWord =
    p.gender === 'Men' ? "men's" : p.gender === 'Women' ? "women's" : p.gender === 'Kids' ? "kids'" : 'unisex';
  const item = p.department.toLowerCase().replace(/s$/, '');
  const sizeClause = size ? `, size ${size}` : '';

  return {
    productIndex: customer.heldOut.productIndex,
    team: p.team,
    department: p.department,
    gender: p.gender,
    size,
    maxPrice,
    description: `wants ${article(genderWord)} ${genderWord} ${p.team} ${item}${sizeClause}, under $${maxPrice}`,
  };
}

/** Right aisle: the club and the department the shopper came in for. */
export function isRelevant(p: Product, t: Target): boolean {
  return p.team === t.team && p.department === t.department;
}

/** The actual thing: right aisle, right gender, available in size, in budget. */
export function isTarget(p: Product, t: Target): boolean {
  if (!isRelevant(p, t)) return false;
  if (p.gender !== t.gender) return false;
  if (t.size && !(p.sizes ?? []).includes(t.size)) return false;
  return (p.salePrice ?? p.price) <= t.maxPrice;
}

/* ----------------------------------------------------------------- tape -- */

/**
 * Pre-drawn uniforms, addressed by slot and by which decision they settle.
 *
 * Both arms read the same tape, so the shopper's luck is held fixed across the
 * comparison and only the ordering varies. Four draws per slot: examine,
 * relevance, add, abandon - allocated whether or not each is reached, because a
 * tape whose addressing depended on outcomes would de-synchronise the moment
 * the arms diverged, which is immediately.
 */
const DRAWS_PER_SLOT = 4;
const D_EXAMINE = 0;
const D_RELEVANCE = 1;
const D_ADD = 2;
const D_ABANDON = 3;

class DrawTape {
  private readonly u: Float64Array;

  constructor(rng: Rng, slots: number) {
    this.u = new Float64Array(slots * DRAWS_PER_SLOT);
    for (let i = 0; i < this.u.length; i++) this.u[i] = rng.float();
  }

  at(slot: number, kind: number): number {
    return this.u[slot * DRAWS_PER_SLOT + kind];
  }
}

/* ---------------------------------------------------------------- steps -- */

export type Arm = 'personalized' | 'popularity';

/** One slot of grid, and what the shopper did with it. */
export interface RaceStep {
  /** Zero-based slot in the surfaced grid. */
  position: number;
  productIndex: number;
  /** False when the slot was walked past without being looked at. */
  examined: boolean;
  clicked: boolean;
  added: boolean;
  /** True on the slot where the shopper gave up. */
  abandonedHere: boolean;
  relevant: boolean;
  target: boolean;
  /** Items examined up to and including this slot. */
  seenSoFar: number;
  /** Length of the current run of examined-and-rejected slots. */
  deadEndRun: number;
}

/**
 * Consecutive rejections that count as a dead end.
 *
 * Three, because one rejection is browsing and two is bad luck. Three items in
 * a row examined and dismissed is the shopper discovering that this stretch of
 * grid is not for them - a path that turned out to be wrong, which is the
 * definition the effort ledger already uses for the kind.
 *
 * Named and exported because it is a judgement call, and a threshold buried in
 * a function body is a judgement call nobody can argue with.
 */
export const DEAD_END_RUN = 3;

export interface ArmTrace {
  arm: Arm;
  /** Catalog indices in the order the grid presented them. */
  surfaced: number[];
  steps: RaceStep[];
  /** 1-based step at which the first relevant item was EXAMINED, or null. */
  firstRelevantStep: number | null;
  /** 1-based step at which a target-matching item was CLICKED, or null. */
  targetStep: number | null;
  /**
   * Items examined before the first relevant one appeared, or null when none
   * ever did.
   *
   * NULL RATHER THAN THE TOTAL EXAMINED, which is what it used to be. The
   * fallback silently mixed two different quantities - "how much did they wade
   * through before finding it" and "how much did they wade through, never
   * finding it" - into one median, and the two arms then disagreed with the
   * steps-to-first-relevant row that measures the same thing. A session that
   * never found a relevant item has no value for this metric; it has a value
   * for the reach rate, which is a different row.
   */
  seenBeforeFirstRelevant: number | null;
  deadEnds: number;
  /** Slots walked, examined or not. The scroll the shopper actually did. */
  scrollDepth: number;
  abandoned: boolean;
  reached: boolean;
  clicks: number;
  adds: number;
}

/**
 * Walks one grid.
 *
 * The probability functions are imported from `src/sim/choice.ts` unchanged -
 * this is the same shopper behaving the same way, not a second model of
 * shopping written to make a point. The only thing this adds to `browse()` in
 * behavior.ts is bookkeeping: where the target sat, when it was found, and how
 * much grid was burned getting there.
 *
 * Reaching the target requires CLICKING it, not merely being shown it. A grid
 * that contains the right item at slot 40, unexamined, has not delivered it.
 */
function walk(
  arm: Arm,
  surfaced: number[],
  products: Product[],
  customer: SyntheticCustomer,
  target: Target,
  model: ChoiceModel,
  tape: DrawTape
): ArmTrace {
  const steps: RaceStep[] = [];
  const state = { slotsWalked: 0, missStreak: 0, clicks: 0, adds: 0 };

  let firstRelevantStep: number | null = null;
  let seenBeforeFirstRelevant: number | null = null;
  let targetStep: number | null = null;
  let deadEnds = 0;
  let runLength = 0;
  let runCounted = false;
  let abandoned = false;
  let seen = 0;

  for (let pos = 0; pos < surfaced.length; pos++) {
    state.slotsWalked++;
    const productIndex = surfaced[pos];
    const product = products[productIndex];
    const affinity = productAffinityScore(product, customer, target.team, target.department);
    const relevant = isRelevant(product, target);
    const target_ = isTarget(product, target);

    let examined = false;
    let clicked = false;
    let added = false;

    if (tape.at(pos, D_EXAMINE) < examinationProbability(pos, model)) {
      examined = true;
      seen++;

      /*
       * First-relevant is recorded on EXAMINATION, target on CLICK, and the
       * asymmetry is deliberate.
       *
       * "Items seen before the first genuinely relevant one" is a question about
       * what the grid put in front of the shopper, so it resolves the moment
       * they look at one - whether or not they happened to click. Requiring a
       * click made it a question about the click model instead, and collapsed
       * the sample to a few dozen shoppers.
       *
       * "Target reached" keeps the click bar, because a grid that showed the
       * right item and got scrolled past has not delivered it.
       */
      if (relevant && firstRelevantStep === null) {
        firstRelevantStep = pos + 1;
        seenBeforeFirstRelevant = seen - 1;
      }

      if (tape.at(pos, D_RELEVANCE) < relevanceProbability(affinity, model)) {
        clicked = true;
        state.clicks++;
        state.missStreak = 0;
        runLength = 0;
        runCounted = false;
        if (target_ && targetStep === null) targetStep = pos + 1;
        if (tape.at(pos, D_ADD) < addProbability(affinity, model)) {
          added = true;
          state.adds++;
        }
      } else {
        state.missStreak++;
        runLength++;
        // Counted once per run, on the slot that completes it, so a run of six
        // is one dead end rather than four.
        if (runLength >= DEAD_END_RUN && !runCounted) {
          deadEnds++;
          runCounted = true;
        }
      }
    }

    const abandonedHere = tape.at(pos, D_ABANDON) < abandonProbability(state, CHOICE_SHAPE);

    steps.push({
      position: pos,
      productIndex,
      examined,
      clicked,
      added,
      abandonedHere,
      relevant,
      target: target_,
      seenSoFar: seen,
      deadEndRun: runLength,
    });

    if (abandonedHere) {
      abandoned = true;
      break;
    }
  }

  return {
    arm,
    surfaced,
    steps,
    firstRelevantStep,
    seenBeforeFirstRelevant,
    targetStep,
    deadEnds,
    scrollDepth: state.slotsWalked,
    abandoned,
    reached: targetStep !== null,
    clicks: state.clicks,
    adds: state.adds,
  };
}

/* -------------------------------------------------------------- rankers -- */

/**
 * The control arm: sales rank, softened.
 *
 * Same construction as `surfaceOrganic` in behavior.ts, and deliberately so -
 * the control has to be the storefront's real unpersonalized behaviour or the
 * comparison is against a straw man. A hard popularity sort is the limiting
 * case; the jitter stands in for merchandising rotation and inventory churn.
 */
function popularityOrder(candidates: number[], products: Product[], rng: Rng): number[] {
  const keys = new Float64Array(candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    const weight = Math.pow(products[candidates[i]].popularity, SURFACE_CONCENTRATION);
    keys[i] = -Math.log(Math.max(1e-12, rng.float())) / Math.max(1e-9, weight);
  }
  const order = candidates.map((_, i) => i);
  order.sort((a, b) => keys[a] - keys[b]);
  return order.slice(0, Math.min(SURFACE_DEPTH, candidates.length)).map((i) => candidates[i]);
}

/**
 * The treatment arm: the intent engine's posterior, applied to the grid.
 *
 * LEAKAGE GUARD, and it is the whole credibility of this measurement. The
 * scores below read `teamPosterior` and `deptPosterior`, which come out of
 * `predictIntent` running on the shopper's OBSERVABLE event stream. They do not
 * read `customer.teamAffinity`, `customer.deptAffinity`, or the held-out
 * session that defines the target. The ranker is exactly as ignorant here as it
 * is in the browser.
 *
 * The functional form mirrors `productAffinityScore` - club term, department
 * term, popularity term - with the shopper's latents replaced by the model's
 * estimates of them. That is the cleanest statement of what personalization is
 * attempting: to stand in for knowledge it does not have.
 */
function personalizedOrder(
  candidates: number[],
  products: Product[],
  teamPosterior: Record<TeamId, number>,
  deptPosterior: Record<Department, number>
): number[] {
  const scored = candidates.map((idx) => {
    const p = products[idx];
    const team = teamPosterior[p.team] ?? 0.01;
    const dept = deptPosterior[p.department] ?? 0.01;
    const popularity = 0.35 + (p.popularity / 100) * 0.65;
    return { idx, score: team * dept * popularity };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.min(SURFACE_DEPTH, scored.length)).map((s) => s.idx);
}

/* ----------------------------------------------------------------- race -- */

export interface RacePair {
  customerId: string;
  target: Target;
  personalized: ArmTrace;
  popularity: ArmTrace;
  /**
   * Which arm got the shopper to the target in fewer steps. 'tie' covers both
   * arms reaching on the same step and neither arm reaching at all.
   */
  winner: Arm | 'tie';
  /** True when the control arm beat the personalized one. Reported, not hidden. */
  upset: boolean;
  /** The intent engine's confidence, and whether the gate would have withheld. */
  confidence: number;
  gateWithheld: boolean;
  /** True when the engine's top club was in fact the shopper's target club. */
  gateWouldHaveBeenRight: boolean;
}

export interface RaceOptions {
  /** Seed for the shared draw tape and the control arm's jitter. */
  seed?: string;
}

/**
 * Runs both arms for one shopper and returns the paired traces.
 *
 * Returns null when the shopper has no held-out purchase to aim at.
 */
export function raceShopper(
  customer: SyntheticCustomer,
  products: Product[],
  model: ChoiceModel,
  options: RaceOptions = {}
): RacePair | null {
  const target = deriveTarget(customer, products);
  if (!target) return null;

  const seed = options.seed ?? `race:${customer.id}`;

  /*
   * THE CANDIDATE POOL IS THE WHOLE CATALOG, and getting this wrong invalidates
   * the entire measurement.
   *
   * The first version reused `simulateSession`'s pool - the focus club's
   * assortment plus a few strays - because that is how the population
   * simulation works. It is the wrong pool here. That pool models a shopper who
   * has ALREADY navigated to their club's page, so the club, which is the single
   * hardest thing personalization has to guess, is handed to the control arm for
   * free. Measured that way the control arm won almost every row, and it won
   * them by being told the answer.
   *
   * A shopper landing on a storefront sees a storefront. The personalized arm
   * has to find their club in 798 products; so does the control, and the control
   * has only sales rank to do it with. That is the comparison the screen claims
   * to be making.
   *
   * Handed to both arms unchanged, so neither is shown a different shop.
   */
  const candidates = products.map((_, i) => i);

  // The engine's view of this shopper - observable history only.
  const { scenario, events } = asScenario(customer, products);
  const prediction = predictIntent(scenario, events);

  const teamPosterior = {} as Record<TeamId, number>;
  for (const t of prediction.teams) teamPosterior[t.team] = t.probability;
  const deptPosterior = {} as Record<Department, number>;
  for (const d of prediction.departments) deptPosterior[d.department] = d.probability;

  const tape = new DrawTape(new Rng(`${seed}:tape`), SURFACE_DEPTH);

  const personalized = walk(
    'personalized',
    personalizedOrder(candidates, products, teamPosterior, deptPosterior),
    products,
    customer,
    target,
    model,
    tape
  );
  const popularity = walk(
    'popularity',
    popularityOrder(candidates, products, new Rng(`${seed}:organic`)),
    products,
    customer,
    target,
    model,
    tape
  );

  const pSteps = personalized.targetStep;
  const oSteps = popularity.targetStep;
  let winner: Arm | 'tie' = 'tie';
  if (pSteps !== null && (oSteps === null || pSteps < oSteps)) winner = 'personalized';
  else if (oSteps !== null && (pSteps === null || oSteps < pSteps)) winner = 'popularity';

  const topTeam = prediction.teams[0]?.team ?? null;

  return {
    customerId: customer.id,
    target,
    personalized,
    popularity,
    winner,
    upset: winner === 'popularity',
    confidence: prediction.confidence,
    gateWithheld: prediction.confidence < CONFIDENCE_THRESHOLD,
    gateWouldHaveBeenRight: topTeam === target.team,
  };
}

/* ----------------------------------------------------------- statistics -- */

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * A paired statistic and the interval around its difference.
 *
 * `difference` is always personalized minus popularity. Whether that is good
 * news depends on the metric - fewer steps is better, more catalog coverage is
 * better - so `lowerIsBetter` is carried with the row rather than assumed by
 * the reader.
 */
export interface PairedStat {
  name: string;
  unit: string;
  personalized: number;
  popularity: number;
  difference: number;
  ciLow: number;
  ciHigh: number;
  n: number;
  lowerIsBetter: boolean;
  /**
   * True when the interval excludes zero. Not a p-value and not called one: it
   * is the reading of whether the paired difference is separated from no
   * difference at this sample size.
   */
  separated: boolean;
}

const BOOTSTRAP_ITERATIONS = 2000;

/**
 * Paired bootstrap over SHOPPERS, not over sessions.
 *
 * The resampling unit has to be the shopper because the pairing is at the
 * shopper: arm A and arm B for one person are not two independent observations,
 * they are one observation of a difference. Resampling the two arms separately
 * would throw away the pairing that the shared draw tape was built to create,
 * and would report intervals wider than the design actually earns.
 *
 * Percentile method, 2000 iterations. Bias-corrected and accelerated would be
 * tighter, and is not worth the extra machinery for a difference this well
 * separated - where it is not well separated, the row says so.
 */
function bootstrapPaired(
  pairs: { a: number; b: number }[],
  stat: (xs: number[]) => number,
  rng: Rng
): { low: number; high: number } {
  if (pairs.length === 0) return { low: NaN, high: NaN };
  const diffs = new Array<number>(BOOTSTRAP_ITERATIONS);
  const a = new Array<number>(pairs.length);
  const b = new Array<number>(pairs.length);

  for (let it = 0; it < BOOTSTRAP_ITERATIONS; it++) {
    for (let i = 0; i < pairs.length; i++) {
      const pick = pairs[rng.int(0, pairs.length - 1)];
      a[i] = pick.a;
      b[i] = pick.b;
    }
    diffs[it] = stat(a) - stat(b);
  }

  diffs.sort((x, y) => x - y);
  return { low: percentile(diffs, 0.025), high: percentile(diffs, 0.975) };
}

function pairedStat(
  name: string,
  unit: string,
  pairs: { a: number; b: number }[],
  stat: (xs: number[]) => number,
  lowerIsBetter: boolean,
  rng: Rng
): PairedStat {
  const personalized = stat(pairs.map((p) => p.a));
  const popularity = stat(pairs.map((p) => p.b));
  const { low, high } = bootstrapPaired(pairs, stat, rng);
  return {
    name,
    unit,
    personalized,
    popularity,
    difference: personalized - popularity,
    ciLow: low,
    ciHigh: high,
    n: pairs.length,
    lowerIsBetter,
    separated: (low > 0 && high > 0) || (low < 0 && high < 0),
  };
}

/* -------------------------------------------------------------- report --- */

export interface GateReading {
  /** Sessions where confidence fell below the activation threshold. */
  withheldSessions: number;
  /** Of those, the ones where the engine's top club was in fact wrong. */
  correctlyWithheld: number;
  /** Correctly withheld as a share of ALL sessions. */
  shareOfAllSessions: number;
  /** Correctly withheld as a share of withheld sessions - the gate's precision. */
  precision: number;
  /** Sessions the gate let through where the top club was wrong. */
  wronglyActivated: number;
  totalSessions: number;
}

export interface EffortReport {
  stats: PairedStat[];
  gate: GateReading;
  /**
   * Share of sessions in which each arm surfaced a relevant item at all - the
   * denominators the two conditioned rows are computed over. Published because
   * a conditioned median with an unstated denominator is the easiest number in
   * a table to read wrongly.
   */
  relevantSeenRate: { personalized: number; popularity: number; both: number };
  /**
   * Share of all impressions captured by the most-shown tenth of the catalog.
   * Higher means a narrower shop window. See the note beside its computation.
   */
  concentration: { personalized: number; popularity: number };
  /** Share of shoppers where the CONTROL arm reached the target sooner. */
  upsetRate: number;
  meta: {
    shoppers: number;
    withTarget: number;
    catalogSize: number;
    bootstrapIterations: number;
    elapsedMs: number;
    clockLabel: string;
  };
}

const EFFORT_SEED = 'effort-v1';

/**
 * Runs the paired race across a sample of the population and reports the
 * seven effort metrics with bootstrap intervals.
 *
 * Behind its own script (`npm run sim:effort`) rather than folded into
 * `sim:eval`, because it runs the intent engine once per shopper on top of two
 * grid walks and would roughly double the time of a command that is run on
 * every commit.
 */
export function runEffortEvaluation(
  customers: SyntheticCustomer[],
  products: Product[],
  model: ChoiceModel,
  clockLabel: string,
  sampleSize = 6000
): EffortReport {
  const startedAt = performance.now();
  const sample = customers.slice(0, sampleSize);

  const races: RacePair[] = [];
  for (const customer of sample) {
    const race = raceShopper(customer, products, model, { seed: `${EFFORT_SEED}:${customer.id}` });
    if (race) races.push(race);
  }

  const rng = new Rng(`${EFFORT_SEED}:bootstrap`);
  const pair = (f: (t: ArmTrace) => number) => races.map((r) => ({ a: f(r.personalized), b: f(r.popularity) }));

  /*
   * Steps-to-X is measured only over the shoppers who got there.
   *
   * The alternative - scoring a miss as the full grid depth - makes the median
   * a function of how deep the grid happens to be rather than of how fast the
   * item was found, and it double-counts: the share-reaching row already
   * carries the misses, and it carries them as what they are. Conditioning is
   * stated here rather than buried, because it means the two rows have to be
   * read together and either alone is misleading.
   */
  const reachedBoth = races.filter((r) => r.personalized.reached && r.popularity.reached);
  const relevantBoth = races.filter(
    (r) => r.personalized.firstRelevantStep !== null && r.popularity.firstRelevantStep !== null
  );

  const stats: PairedStat[] = [
    pairedStat(
      'Steps to first relevant item',
      'steps',
      relevantBoth.map((r) => ({ a: r.personalized.firstRelevantStep!, b: r.popularity.firstRelevantStep! })),
      median,
      true,
      rng
    ),
    pairedStat(
      'Steps to target reached',
      'steps',
      reachedBoth.map((r) => ({ a: r.personalized.targetStep!, b: r.popularity.targetStep! })),
      median,
      true,
      rng
    ),
    pairedStat(
      'Sessions reaching the target',
      'share',
      pair((t) => (t.reached ? 1 : 0)),
      mean,
      false,
      rng
    ),
    pairedStat('Dead ends per session', 'count', pair((t) => t.deadEnds), mean, true, rng),
    pairedStat(
      'Items seen before first relevant',
      'items',
      relevantBoth.map((r) => ({
        a: r.personalized.seenBeforeFirstRelevant!,
        b: r.popularity.seenBeforeFirstRelevant!,
      })),
      median,
      true,
      rng
    ),
  ];

  /*
   * Catalog coverage is a property of the POPULATION, not of a shopper, so it
   * cannot be a paired per-shopper statistic like the rows above. It is the
   * size of the union of everything surfaced, over the catalog. Bootstrapped by
   * resampling shoppers and re-taking the union, which is the same resampling
   * unit as everywhere else even though the statistic is not a mean.
   *
   * This is the row most likely to go AGAINST personalization, and it is in the
   * table for exactly that reason. A ranker that puts the right thing first
   * also stops showing the rest of the shop; that is a real cost, it lands on
   * the merchandiser rather than on the shopper, and a table that reported only
   * the shopper's side of the ledger would be arguing rather than measuring.
   */
  const coverageDiffs = new Array<number>(BOOTSTRAP_ITERATIONS);
  const covRng = new Rng(`${EFFORT_SEED}:coverage`);
  for (let it = 0; it < BOOTSTRAP_ITERATIONS; it++) {
    const seenP = new Set<number>();
    const seenO = new Set<number>();
    for (let i = 0; i < races.length; i++) {
      const r = races[covRng.int(0, races.length - 1)];
      for (const idx of r.personalized.surfaced) seenP.add(idx);
      for (const idx of r.popularity.surfaced) seenO.add(idx);
    }
    coverageDiffs[it] = (seenP.size - seenO.size) / products.length;
  }
  coverageDiffs.sort((a, b) => a - b);

  const allP = new Set<number>();
  const allO = new Set<number>();
  for (const r of races) {
    for (const idx of r.personalized.surfaced) allP.add(idx);
    for (const idx of r.popularity.surfaced) allO.add(idx);
  }
  /*
   * Impression concentration, the companion reading the union row needs.
   *
   * Coverage-as-union saturates: over a thousand shoppers at 48 slots each,
   * both arms eventually touch nearly the whole catalog, so the row is true and
   * nearly uninformative. What actually differs is how impressions are
   * DISTRIBUTED - a personalized grid shows a shopper their club and shows the
   * next shopper theirs, which spreads impressions; a popularity grid shows
   * everyone the same bestsellers.
   *
   * Reported alongside rather than instead of the union, because the union is
   * the metric that was asked for and swapping it out silently would be
   * answering a different question than the one on the table.
   */
  const concentration = (traces: ArmTrace[]) => {
    const counts = new Map<number, number>();
    let total = 0;
    for (const t of traces) for (const idx of t.surfaced) { counts.set(idx, (counts.get(idx) ?? 0) + 1); total++; }
    const sorted = [...counts.values()].sort((a, b) => b - a);
    const topDecile = Math.max(1, Math.ceil(products.length * 0.1));
    const head = sorted.slice(0, topDecile).reduce((a, b) => a + b, 0);
    return total > 0 ? head / total : 0;
  };

  const covLow = percentile(coverageDiffs, 0.025);
  const covHigh = percentile(coverageDiffs, 0.975);
  stats.push({
    name: 'Catalog surfaced across population',
    unit: 'share',
    personalized: allP.size / products.length,
    popularity: allO.size / products.length,
    difference: (allP.size - allO.size) / products.length,
    ciLow: covLow,
    ciHigh: covHigh,
    n: races.length,
    lowerIsBetter: false,
    separated: (covLow > 0 && covHigh > 0) || (covLow < 0 && covHigh < 0),
  });

  /*
   * The gate has no counterpart in the control arm - an unpersonalized
   * storefront withholds nothing because it promised nothing - so this is a
   * single-arm diagnostic and is reported separately rather than being given a
   * fake paired difference.
   *
   * "Correctly withheld" means: confidence fell below the activation threshold
   * AND the club the engine would have personalized to was not the club the
   * shopper was actually shopping for. Both halves are load-bearing. Withholding
   * on a shopper the model had right is a cost, not a save, and a gate scored
   * only on how often it fires can be made to look perfect by never firing.
   */
  const withheld = races.filter((r) => r.gateWithheld);
  const correctly = withheld.filter((r) => !r.gateWouldHaveBeenRight);
  const gate: GateReading = {
    withheldSessions: withheld.length,
    correctlyWithheld: correctly.length,
    shareOfAllSessions: races.length > 0 ? correctly.length / races.length : 0,
    precision: withheld.length > 0 ? correctly.length / withheld.length : 0,
    wronglyActivated: races.filter((r) => !r.gateWithheld && !r.gateWouldHaveBeenRight).length,
    totalSessions: races.length,
  };

  return {
    stats,
    gate,
    relevantSeenRate: {
      personalized: races.filter((r) => r.personalized.firstRelevantStep !== null).length / Math.max(1, races.length),
      popularity: races.filter((r) => r.popularity.firstRelevantStep !== null).length / Math.max(1, races.length),
      both: relevantBoth.length / Math.max(1, races.length),
    },
    concentration: {
      personalized: concentration(races.map((r) => r.personalized)),
      popularity: concentration(races.map((r) => r.popularity)),
    },
    upsetRate: races.length > 0 ? races.filter((r) => r.upset).length / races.length : 0,
    meta: {
      shoppers: sample.length,
      withTarget: races.length,
      catalogSize: products.length,
      bootstrapIterations: BOOTSTRAP_ITERATIONS,
      elapsedMs: Math.round(performance.now() - startedAt),
      clockLabel,
    },
  };
}
