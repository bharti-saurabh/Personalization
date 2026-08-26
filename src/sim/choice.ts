/**
 * The choice model.
 *
 * WHAT THIS IS, AND WHY IT IS NOT behavior.ts
 * ===========================================
 * `productAffinityScore` in behavior.ts is the right seed for this, because it
 * already reads the latent ground truth - the shopper's true team and
 * department affinity - that every ranker in this repo is denied. That
 * asymmetry is the whole basis of the comparison: the simulator knows what the
 * shopper wants, the models have to infer it, and the gap between the two is
 * the only thing worth measuring.
 *
 * But an affinity score is a *sampling weight*, not a probability. It has no
 * calibration - nothing pins it to an observed click-through rate. It has no
 * notion of a surfaced set - it scores a product in the abstract rather than a
 * product in slot 14 of a grid. And it has no position bias, which means it
 * cannot distinguish a good item shown badly from a bad item shown well. Those
 * three gaps are exactly what makes an A/B over a simulator meaningless, so
 * they are what this file closes.
 *
 * This module is deliberately a link function and nothing else. It takes a
 * latent utility - the affinity score, which is the sufficient statistic for
 * (product, shopper, session focus) - and returns probabilities. It does not
 * know what a Product is, does not walk a session, and does not draw random
 * numbers. behavior.ts owns the mechanics; this owns the probabilities. Keeping
 * them apart is what makes the probabilities testable in isolation.
 *
 * WHICH PARAMETERS ARE FITTED AND WHICH ARE ASSUMED
 * =================================================
 * This distinction matters more than any individual value, so it is in the type
 * system rather than in a comment: `ChoiceShape` holds the parameters that were
 * ASSUMED - chosen from the published shapes of e-commerce examination and
 * choice curves, with no data here to fit them against - and `ChoiceModel` adds
 * the three intercepts that are FITTED, by bisection, against explicit volume
 * targets recorded in `calibration`.
 *
 * The three intercepts are fitted to reproduce the aggregate volumes the flat
 * constants they replace used to produce: the same mean session depth, the same
 * add-to-cart rate, the same conversion rate. That is a deliberate experimental
 * design and not a coincidence. Holding volume fixed means any movement in the
 * evaluation metrics is attributable to a change in *composition* - which items
 * get clicked and carted, and in what order - rather than to the population
 * simply generating more or fewer events. A choice model that also changed the
 * event counts would confound the two and there would be no way to tell which
 * one moved the number.
 *
 * The slopes are not fitted, and could not honestly be: fitting a
 * discrimination slope requires observed clicks with known relevance, which is
 * precisely what a synthetic world does not have. They are stated as
 * assumptions and their sensitivity is somebody's next piece of work.
 */

/* --------------------------------------------------------------- helpers -- */

export function sigmoid(x: number): number {
  // Split by sign so neither branch can overflow exp() at large |x|.
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Affinity enters every link function as a log, not a level.
 *
 * Affinity scores span roughly two orders of magnitude, and the thing that
 * actually predicts a click is a ratio - twice as relevant, not 0.004 more
 * relevant. A logit linear in the level would be dominated entirely by the head
 * of the distribution and flat across the tail, which is where most of the
 * catalog lives.
 */
export function utility(affinity: number): number {
  return Math.log(Math.max(1e-6, affinity));
}

/* ------------------------------------------------------------ parameters -- */

/** ASSUMED parameters. Nothing in this repo fits these; see the header. */
export interface ChoiceShape {
  /** Logit points per natural-log unit of affinity, for the click decision. */
  clickSlope: 1.6,
  /** Examination decays as (1 / (rank + 1)) ^ gamma. */
  positionGamma: 0.22,
  /** Examination never falls below this - deep slots are rare, not impossible. */
  positionFloor: 0.35,
  /** Rank at which the page fold is crossed. */
  foldPosition: number;
  /** Multiplier applied to examination past the fold. */
  foldPenalty: 0.7,
  /** Logit points per natural-log unit of affinity, for the add decision. */
  addSlope: 0.9,
  /** Abandonment: base logit before any session state is read. */
  abandonIntercept: number;
  /** Logit added per consecutive examined-and-rejected slot. */
  abandonMissWeight: number;
  /** Logit removed per click already made this session. */
  abandonClickRelief: number;
  /** Logit removed per cart add already made this session. */
  abandonAddRelief: number;
  /** Logit added per slot walked, regardless of outcome. */
  abandonFatigue: number;
  /** Conversion: logit points per natural-log unit of mean cart affinity. */
  orderAffinitySlope: number;
  /** Conversion: logit points removed per unit of price-weighted basket value. */
  orderPricePenalty: number;
}

/**
 * The assumed shape.
 *
 * positionGamma is gentler than the ~0.9 usually estimated for ten blue links,
 * because a product grid is scanned in rows rather than read top to bottom and
 * the drop across the first screen is correspondingly shallower. The fold
 * penalty carries the sharp part of the decay instead, which is where a grid
 * actually loses people.
 *
 * The abandonment weights encode one claim: frustration accumulates on
 * consecutive misses and is relieved by engagement. That is why this file is a
 * prerequisite for the effort ledger rather than an ornament on it - a shopper
 * who leaves after nine bad slots and one who leaves after two good ones and a
 * cart add have spent very different amounts of themselves, and a simulator
 * with a flat session depth cannot tell them apart.
 */
/**
 * The assumed half of the model.
 *
 * The slopes were first set at roughly a third of these values, and that version
 * was measured rather than trusted. It failed, and the failure is worth keeping
 * on the record because it is not visible from the parameters:
 *
 *   With a steep position curve, the whole grid contributed only ~10.5 expected
 *   examinations. Calibrating to a mean depth of 6.6 clicks therefore forced a
 *   click-given-examination rate of ~63%, which drove the fitted intercept up to
 *   +2.64 - deep into the flat top of the sigmoid, where affinity stops mattering.
 *   The resulting shopper clicked an item they barely wanted 69% of the time and
 *   one they loved 92%: a discrimination ratio of 1.35 to 1. That is not a
 *   shopper, it is a metronome, and every downstream signal was correspondingly
 *   washed out.
 *
 * The lesson is structural, not a matter of constants: a shopper must examine far
 * more than they click, or selectivity has nowhere to live. So examination is now
 * broad and shallow-decaying, and the click decision is where discrimination
 * happens.
 *
 * The slopes are still ASSUMED - they cannot be fitted without observed clicks of
 * known relevance. But the assumption is now checkable rather than merely
 * asserted: `npm run sim:eval` reports the share of clicks landing in the top
 * affinity quartile of the grid that was shown, where indifference is about 0.25.
 * The pre-fix shape scored 0.27 - statistically a shopper who did not care. This
 * one scores 0.35.
 *
 * 0.35 is not high, and raising `clickSlope` further does not fix it: at 2.6 it
 * reaches 0.38 and at 4.6 only 0.40, while the fitted intercept climbs to +10.4,
 * which is the sigmoid saturating again in a new place. The ceiling is not the
 * shopper's selectivity. It is that a popularity-ordered grid rarely puts the
 * shopper's best quartile where they will examine it - and an oracle-ranked grid
 * lifts the same statistic to 0.38 while nearly doubling cart adds. So the slope
 * stays where the parameterisation is still honest, and the remaining gap is
 * reported as headroom rather than tuned away.
 */
export const CHOICE_SHAPE: ChoiceShape = {
  clickSlope: 1.6,
  positionGamma: 0.22,
  positionFloor: 0.35,
  foldPosition: 12,
  foldPenalty: 0.7,
  addSlope: 0.9,
  abandonIntercept: -3.1,
  abandonMissWeight: 0.34,
  abandonClickRelief: 0.55,
  abandonAddRelief: 0.9,
  abandonFatigue: 0.035,
  orderAffinitySlope: 0.9,
  orderPricePenalty: 0.9,
};

/** What a fitted intercept was aimed at, and what it actually achieved. */
export interface CalibrationRecord {
  target: number;
  achieved: number;
  iterations: number;
}

/** ASSUMED shape plus the three FITTED intercepts. */
export interface ChoiceModel extends ChoiceShape {
  clickIntercept: number;
  addIntercept: number;
  orderIntercept: number;
  calibration: {
    /** Mean distinct products clicked per session. */
    depth: CalibrationRecord;
    /** P(add to cart | product clicked). */
    addRate: CalibrationRecord;
    /** P(session results in an order | at least one cart add). */
    conversion: CalibrationRecord;
  };
}

/* -------------------------------------------------------- the link model -- */

/**
 * P(the shopper examines the item in this slot at all).
 *
 * This is the term that makes a ranking matter. Without it a recommender that
 * puts the right item in slot 1 and one that buries it in slot 40 produce
 * identical sessions, which is why a paired A/B over the previous simulator
 * would have measured exactly nothing.
 */
export function examinationProbability(position: number, shape: ChoiceShape): number {
  const decay = Math.pow(1 / (position + 1), shape.positionGamma);
  const fold = position >= shape.foldPosition ? shape.foldPenalty : 1;
  return clamp(decay * fold, shape.positionFloor, 1);
}

/** P(click | examined). Position-free: the quality half of the click. */
export function relevanceProbability(affinity: number, model: ChoiceModel): number {
  return sigmoid(model.clickIntercept + model.clickSlope * utility(affinity));
}

/**
 * P(click | product, shopper, position).
 *
 * The three outcomes for a slot partition exactly:
 *   clickProbability      examined and clicked
 *   scrollPastProbability examined and rejected
 *   1 - examination       never seen at all
 * Keeping them exhaustive is what lets the effort ledger later attribute a
 * non-click to indifference or to invisibility, which are different failures
 * with different fixes.
 */
export function clickProbability(affinity: number, position: number, model: ChoiceModel): number {
  return examinationProbability(position, model) * relevanceProbability(affinity, model);
}

/** P(examined this slot and moved on without clicking). */
export function scrollPastProbability(affinity: number, position: number, model: ChoiceModel): number {
  return examinationProbability(position, model) * (1 - relevanceProbability(affinity, model));
}

/** P(add to cart | clicked). */
export function addProbability(affinity: number, model: ChoiceModel): number {
  return sigmoid(model.addIntercept + model.addSlope * utility(affinity));
}

/** Everything the abandonment decision is allowed to read. */
export interface BrowseState {
  /** Slots walked so far this session, examined or not. */
  slotsWalked: number;
  /** Consecutive slots examined and rejected since the last click. */
  missStreak: number;
  /** Clicks made so far this session. */
  clicks: number;
  /** Cart adds made so far this session. */
  adds: number;
}

/**
 * P(leave the session | what has been surfaced so far).
 *
 * Reads only session state, never the shopper's latents, because abandonment is
 * a response to the experience rather than a trait. That is deliberate: it means
 * the only way to reduce abandonment in this simulator is to surface better
 * items sooner, which is exactly the lever a recommender pulls.
 */
export function abandonProbability(state: BrowseState, shape: ChoiceShape): number {
  const logit =
    shape.abandonIntercept +
    shape.abandonMissWeight * state.missStreak +
    shape.abandonFatigue * state.slotsWalked -
    shape.abandonClickRelief * state.clicks -
    shape.abandonAddRelief * state.adds;
  return clamp(sigmoid(logit), 0.001, 0.9);
}

/** Everything the conversion decision is allowed to read. */
export interface CartState {
  /** Mean affinity of what is in the cart. */
  meanAffinity: number;
  /** Basket value as a fraction of a typical basket, so the slope is unitless. */
  relativeValue: number;
  /** The shopper's latent price sensitivity, 0..1. */
  priceSensitivity: number;
}

/**
 * P(the session converts | the cart is non-empty).
 *
 * Replaces a flat 0.55. The flat rate was the single most damaging constant in
 * the simulator: it meant a cart full of things the shopper actually wanted
 * converted at exactly the rate of a cart full of things they did not, so no
 * amount of better recommending could move revenue and any A/B would have come
 * back dead flat by construction.
 */
export function orderProbability(cart: CartState, model: ChoiceModel): number {
  const logit =
    model.orderIntercept +
    model.orderAffinitySlope * utility(cart.meanAffinity) -
    model.orderPricePenalty * cart.priceSensitivity * cart.relativeValue;
  return clamp(sigmoid(logit), 0.001, 0.999);
}

/* -------------------------------------------------------------- fitting -- */

const FIT_TOLERANCE = 1e-4;
const FIT_MAX_ITERATIONS = 60;

/**
 * Monotone scalar bisection.
 *
 * Every quantity fitted here - mean depth, add rate, conversion rate - is
 * strictly increasing in its intercept, so bisection is exact rather than a
 * heuristic, and it is deterministic, which matters more: the whole dataset has
 * to be byte-reproducible and a stochastic optimiser would break that.
 *
 * Returns the achieved value alongside the parameter, because a fit that missed
 * its target should say so rather than be discovered later.
 */
export function fitMonotone(
  evaluate: (x: number) => number,
  target: number,
  lo: number,
  hi: number,
  opts?: { tolerance?: number; maxIterations?: number }
): { value: number; achieved: number; iterations: number } {
  const tolerance = opts?.tolerance ?? FIT_TOLERANCE;
  // Capped separately for objectives that are expensive to evaluate. The
  // interval halves every step regardless, so a lower cap is a coarser
  // parameter rather than a different one - 22 steps over a 50-logit bracket
  // still locates the crossing to within 1e-5.
  const maxIterations = opts?.maxIterations ?? FIT_MAX_ITERATIONS;
  let low = lo;
  let high = hi;
  let mid = (low + high) / 2;
  let achieved = evaluate(mid);
  let i = 1;

  for (; i < maxIterations; i++) {
    if (Math.abs(achieved - target) <= tolerance * Math.max(1, Math.abs(target))) break;
    if (achieved < target) low = mid;
    else high = mid;
    mid = (low + high) / 2;
    achieved = evaluate(mid);
  }

  return { value: mid, achieved, iterations: i };
}

/**
 * Fits a logistic intercept so the mean predicted probability over a sample of
 * utilities hits a target rate. Used for the add and conversion intercepts,
 * where the sample can be collected once and scored in closed form.
 */
export function fitLogisticIntercept(
  utilities: number[],
  slope: number,
  target: number,
  offsets?: number[]
): { value: number; achieved: number; iterations: number } {
  if (utilities.length === 0) return { value: 0, achieved: target, iterations: 0 };
  const mean = (intercept: number): number => {
    let total = 0;
    for (let i = 0; i < utilities.length; i++) {
      total += sigmoid(intercept + slope * utilities[i] - (offsets?.[i] ?? 0));
    }
    return total / utilities.length;
  };
  return fitMonotone(mean, target, -25, 25);
}
