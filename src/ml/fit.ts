/**
 * Size and fit prediction.
 *
 * The engine that answers "what size are you" before the shopper has to say it,
 * and - more importantly for a demo about honest personalization - the engine
 * that refuses to answer when the evidence it holds is about a different part
 * of a different body.
 *
 * THE ARGUMENT FOR REFUSING TO TRANSFER. A shopper who has bought a Large
 * T-shirt has told you something about their torso. It transfers to a hoodie
 * because a hoodie goes on the same torso, and it transfers badly to a hat
 * because a head is not a torso. Nothing in the arithmetic knows that. Every
 * ladder here is a list of strings in [0, n), so a naive implementation happily
 * maps position 2 of 6 on the apparel ladder onto position 1 of 4 on the hat
 * ladder and prefills "M/L" with the confidence it earned measuring a chest.
 * `SIZE_TRANSFER` is a stated table of which transfers are allowed, for the
 * same reason `RIVALRIES` is stated rather than learned: the fact that decides
 * it lives outside the data.
 *
 * THREE SOURCES, AND ONLY TWO OF THEM MAY PREFILL:
 *
 *   observed      the shopper picked this size in this department. Prefills.
 *   transferred   they picked it in a department on the same body, adjusted for
 *                 layering and cut. Prefills if it clears the floor.
 *   population    the modal size of the apparel-buying population. Informs the
 *                 shopper, never prefills - and cannot, because
 *                 POPULATION_CONFIDENCE_CEILING sits below FIT_PREFILL_FLOOR by
 *                 construction and a test asserts it. Prefilling from the
 *                 population is a store telling you that you are average.
 *
 * WHAT IS MEASURED AND WHAT IS A BENCHMARK. The observed sizes are real folds
 * over real session events. `POPULATION_SIZE_CURVE` and `CUT_BIAS` are stated
 * benchmarks - the kind of table a merchandising team hands you on day one -
 * and every surface that renders them says so. They are not derived from the
 * synthetic population, and deriving them would have meant writing sizes into
 * `src/sim/behavior.ts`, which would have moved the RNG stream and changed
 * every published offline number for a decoration.
 *
 * PER-SIZE AVAILABILITY IS DERIVED, NOT STORED, for the same reason. The
 * catalog carries a product-level `inventoryStatus` and no size ladder stock.
 * `sizeAvailability` derives one from a hash of the product id and the size,
 * outside the catalog's RNG stream, so it is stable across reloads, identical
 * in every arm of every comparison, and costs the offline harness nothing.
 *
 * No React, no DOM: this module runs under tsx in the evaluation harness.
 */

import type { Department, Product } from '../types';
import { DEPARTMENT_BY_ID, SIZE_SCALES } from '../sim/taxonomy';
import type { VisitorProfile } from './profile';

export type SizeScaleId = 'apparel' | 'hat' | 'onesize' | 'kids';

/** Where the recommendation came from. Rendered verbatim; never collapsed. */
export type FitSource =
  /** This department, this shopper, folded from their own selections. */
  | 'observed'
  /** Another department on the same body, damped. */
  | 'transferred'
  /** The stated population curve. Informs; never prefills. */
  | 'population'
  /** One-size product: there is nothing to predict. */
  | 'universal'
  /** Nothing to say. */
  | 'none';

export interface FitPrediction {
  /** The ladder this product actually ships in. */
  ladder: string[];
  scale: SizeScaleId;
  /** Best size, or null when there is nothing to recommend. */
  size: string | null;
  /** 0..1. What the recommendation is worth, not what the model wishes. */
  confidence: number;
  source: FitSource;
  /** Normalised mass over the ladder. Empty when `size` is null. */
  distribution: { size: string; p: number; available: boolean }[];
  /** Department the evidence came from, when it was not this one. */
  transferredFrom: Department | null;
  /** Ladder steps applied on top of the observed size, and why. */
  adjustments: { steps: number; label: string; detail: string }[];
  /** In order of application. The panel prints these as the explanation. */
  reasons: string[];
  /** True when this is strong enough to preselect a size or a facet. */
  prefill: boolean;
  /** Why it did not prefill. Null when it did. */
  blocked: string | null;
  /** Availability of the recommended size, when there is one. */
  available: boolean;
}

/* --------------------------------------------------------------- constants -- */

/**
 * Confidence a prediction must reach before a surface may act on it.
 *
 * Acting means preselecting a size on a product page or ticking a facet on the
 * grid - both of which put a claim about the shopper's body on screen without
 * being asked. 0.55 is the point at which the fold has seen roughly one and a
 * half weighted selections in the department, which is the first moment the
 * answer stops being a guess dressed as a fact.
 */
export const FIT_PREFILL_FLOOR = 0.55;

/**
 * Ceiling on a population-sourced prediction.
 *
 * Below FIT_PREFILL_FLOOR on purpose, and a test enforces the ordering. The
 * modal size of a population is a real number and a useful hint; it is not
 * evidence about the person reading the page, and the difference has to be
 * structural rather than a matter of whoever tunes the constants next.
 */
export const POPULATION_CONFIDENCE_CEILING = 0.3;

/**
 * What a cross-department transfer costs.
 *
 * A hoodie size inferred from a T-shirt size is a real inference with a real
 * error rate, so it keeps most of its confidence rather than a token amount -
 * but it must never outrank a size the shopper picked themselves in the
 * department they are standing in.
 */
export const FIT_TRANSFER_DAMPING = 0.6;

export interface TransferRule {
  allowed: boolean;
  /** Multiplier on the source confidence. 0 when the transfer is refused. */
  damping: number;
  why: string;
}

/**
 * Which size ladders may inform which, stated rather than inferred.
 *
 * Read as SIZE_TRANSFER[from][to]. Refusals carry their reason because they are
 * the interesting half: a store that silently declines to prefill looks like a
 * store that has no data, and this one has data and is declining to misuse it.
 */
export const SIZE_TRANSFER: Record<SizeScaleId, Record<SizeScaleId, TransferRule>> = {
  apparel: {
    apparel: { allowed: true, damping: FIT_TRANSFER_DAMPING, why: 'same body, adjusted for how the garment is worn' },
    hat: { allowed: false, damping: 0, why: 'a chest measurement says nothing about a head' },
    kids: { allowed: false, damping: 0, why: 'an adult size is not evidence about a child - this is usually a gift' },
    onesize: { allowed: true, damping: 1, why: 'one size: nothing to transfer' },
  },
  hat: {
    apparel: { allowed: false, damping: 0, why: 'a head measurement says nothing about a torso' },
    hat: { allowed: true, damping: FIT_TRANSFER_DAMPING, why: 'same head, same ladder' },
    kids: { allowed: false, damping: 0, why: 'an adult size is not evidence about a child' },
    onesize: { allowed: true, damping: 1, why: 'one size: nothing to transfer' },
  },
  kids: {
    apparel: { allowed: false, damping: 0, why: "a child's size is not evidence about the buyer's own" },
    hat: { allowed: false, damping: 0, why: "a child's size is not evidence about the buyer's own" },
    kids: { allowed: true, damping: FIT_TRANSFER_DAMPING, why: 'same child, same ladder' },
    onesize: { allowed: true, damping: 1, why: 'one size: nothing to transfer' },
  },
  onesize: {
    apparel: { allowed: false, damping: 0, why: 'a one-size purchase carries no measurement' },
    hat: { allowed: false, damping: 0, why: 'a one-size purchase carries no measurement' },
    kids: { allowed: false, damping: 0, why: 'a one-size purchase carries no measurement' },
    onesize: { allowed: true, damping: 1, why: 'one size: nothing to transfer' },
  },
};

/**
 * How many layers the garment sits over, on the apparel ladder.
 *
 * The reason a transfer between two apparel departments is not the identity
 * function. A hoodie goes over a tee, so the shopper who wears a Large tee buys
 * an XL hoodie; a replica jersey is cut to go over a shoulder pad it will never
 * meet, so it runs a step large in the other direction and the shopper sizes
 * down. Stated as a merchandising fact, because it is one.
 */
export const LAYER_INDEX: Partial<Record<Department, number>> = {
  'T-shirts': 0,
  Jerseys: -1,
  Hoodies: 1,
  Kids: 0,
};

export interface CutBias {
  /** Ladder steps to move. Positive means size up. */
  steps: number;
  note: string;
  /** Stated benchmark. Rendered with the word "simulated" beside it. */
  evidence: string;
}

/**
 * Per-style-family cut bias, with a brand-level fallback.
 *
 * SIMULATED. These are the numbers a merchandising team would hand over on day
 * one from their own returns data, and this demo has no returns data - so they
 * are stated, labelled, and every surface that shows one shows the label.
 */
export const CUT_BIAS: Record<string, CutBias> = {
  'Nike Vapor F.U.S.E.': { steps: 1, note: 'athletic cut, runs slim', evidence: 'simulated: 22% of exchanges on this line were one size up' },
  'Nike Limited': { steps: 1, note: 'tailored through the chest', evidence: 'simulated: 18% of exchanges were one size up' },
  'Vintage Tri-Blend': { steps: 1, note: 'pre-shrunk, runs short', evidence: 'simulated: 24% of exchanges were one size up' },
  'Throwback Heritage': { steps: -1, note: 'period cut, runs generous', evidence: 'simulated: 15% of exchanges were one size down' },
  'Vintage Wash Fleece': { steps: -1, note: 'boxy through the body', evidence: 'simulated: 13% of exchanges were one size down' },
  'Nike Club Fleece': { steps: 0, note: 'true to size', evidence: 'simulated: exchange rate at the category average' },
};

/** Brand-level fallback when the style family has no stated bias. */
export const BRAND_CUT_BIAS: Record<string, CutBias> = {
  'Mitchell & Ness': { steps: -1, note: 'throwback block, runs large', evidence: 'simulated: 16% of exchanges were one size down' },
  'Pro Standard': { steps: 1, note: 'cropped modern fit', evidence: 'simulated: 20% of exchanges were one size up' },
};

/**
 * The population's size curve, by ladder. Shares sum to 1.
 *
 * SIMULATED BENCHMARK, and the one number on this screen that is about
 * everybody rather than about you. It exists so a cold visitor gets a useful
 * default on the size chart - never a prefilled facet.
 */
export const POPULATION_SIZE_CURVE: Record<SizeScaleId, Record<string, number>> = {
  apparel: { S: 0.09, M: 0.24, L: 0.31, XL: 0.22, '2XL': 0.1, '3XL': 0.04 },
  hat: { 'S/M': 0.18, 'M/L': 0.34, 'L/XL': 0.29, OSFA: 0.19 },
  kids: { '2T': 0.09, '3T': 0.11, '4T': 0.13, YS: 0.21, YM: 0.26, YL: 0.2 },
  onesize: { 'One Size': 1 },
};

/* ---------------------------------------------------------------- ladders -- */

export function scaleOf(dept: Department): SizeScaleId {
  return DEPARTMENT_BY_ID[dept].sizeScale;
}

/** The ladder a product ships in. Falls back to its department's scale. */
export function ladderFor(product: Product): string[] {
  return product.sizes && product.sizes.length > 0 ? product.sizes : SIZE_SCALES[scaleOf(product.department)];
}

/* ----------------------------------------------------------- availability -- */

/** FNV-1a. Deterministic, cheap, and outside the catalog's RNG stream. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/**
 * Which sizes of this product can be had right now.
 *
 * DERIVED, NOT STORED - see the module header. The mapping from the catalog's
 * product-level status is stated here rather than guessed at the call site:
 *
 *   In Stock    every size.
 *   Low Stock   a deterministic subset is gone, weighted towards the ends of
 *               the ladder, which is where a real size curve empties first.
 *               At least one size always survives; a product with no sizes left
 *               is an out-of-stock product and the catalog would have said so.
 *   Pre-Order   none, today. This is the case the substitution ranker exists
 *               for.
 */
export function sizeAvailability(product: Product): Record<string, boolean> {
  const ladder = ladderFor(product);
  const out: Record<string, boolean> = {};

  if (product.inventoryStatus === 'Pre-Order') {
    for (const s of ladder) out[s] = false;
    return out;
  }
  if (product.inventoryStatus === 'In Stock' || ladder.length <= 1) {
    for (const s of ladder) out[s] = true;
    return out;
  }

  // Low Stock. Distance from the middle of the ladder raises the odds a size is
  // gone, so the tails empty first, which is how a real size curve depletes.
  const mid = (ladder.length - 1) / 2;
  let survivors = 0;
  for (const s of ladder) {
    const i = ladder.indexOf(s);
    const edge = mid === 0 ? 0 : Math.abs(i - mid) / mid;
    const gone = hash(`${product.id}:${s}`) < 0.16 + 0.34 * edge;
    out[s] = !gone;
    if (!gone) survivors++;
  }
  if (survivors === 0) out[ladder[Math.round(mid)]] = true;
  return out;
}

/* ------------------------------------------------------------- prediction -- */

function cutBiasFor(product: Product): CutBias | null {
  return CUT_BIAS[product.styleFamily] ?? BRAND_CUT_BIAS[product.brand] ?? null;
}

function clampIndex(i: number, ladder: string[]): number {
  return Math.max(0, Math.min(ladder.length - 1, i));
}

/**
 * Mass around a centre, widening as confidence falls.
 *
 * A confident call is a spike on one size; an unconfident one is a hump across
 * three, and the shopper should be able to see which they are being handed.
 * Rendering a 34% belief and a 91% belief as the same highlighted button is the
 * single most common way a fit widget overstates itself.
 */
function spreadAround(centre: number, ladder: string[], confidence: number): number[] {
  const sigma = 0.45 + 1.15 * (1 - Math.max(0, Math.min(1, confidence)));
  const raw = ladder.map((_, i) => Math.exp(-((i - centre) ** 2) / (2 * sigma * sigma)));
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / total);
}

export interface FitOptions {
  /**
   * The shopper has told you the purchase is not for them.
   *
   * Prefilling their own size onto a gift is the exact failure that makes
   * personalization feel like surveillance rather than service, so this blocks
   * the prefill outright and says so - it does not merely lower a score.
   */
  giftIntent?: boolean;
  /** Off switch. Returns the population reading, marked as such. */
  personalized?: boolean;
}

/**
 * What size this shopper takes in this product, and what the answer is worth.
 */
export function predictFit(
  product: Product,
  profile: VisitorProfile,
  opts: FitOptions = {}
): FitPrediction {
  const ladder = ladderFor(product);
  const scale = scaleOf(product.department);
  const reasons: string[] = [];
  const adjustments: FitPrediction['adjustments'] = [];
  const avail = sizeAvailability(product);

  const base = (over: Partial<FitPrediction>): FitPrediction => ({
    ladder,
    scale,
    size: null,
    confidence: 0,
    source: 'none',
    distribution: [],
    transferredFrom: null,
    adjustments,
    reasons,
    prefill: false,
    blocked: null,
    available: false,
    ...over,
  });

  // 1. One-size products. There is nothing to predict and saying so is better
  //    than printing a confident "One Size" as though a model earned it.
  if (ladder.length <= 1) {
    reasons.push('This product ships in one size. Nothing to predict.');
    return base({
      size: ladder[0] ?? null,
      confidence: 1,
      source: 'universal',
      distribution: ladder.map((s) => ({ size: s, p: 1, available: avail[s] ?? true })),
      prefill: true,
      available: avail[ladder[0]] ?? true,
    });
  }

  const personalized = opts.personalized !== false;

  // 2. The shopper's own selections, this department first.
  const own = personalized ? profile.traits.sizeProfile[product.department] : undefined;

  let centre: number | null = null;
  let confidence = 0;
  let source: FitSource = 'none';
  let transferredFrom: Department | null = null;

  if (own && ladder.includes(own.size)) {
    centre = ladder.indexOf(own.size);
    confidence = own.confidence.value;
    source = 'observed';
    reasons.push(
      `Picked ${own.size} in ${product.department} before, held at ${(confidence * 100).toFixed(0)}% ` +
        `on ${own.confidence.evidenceCount.toFixed(1)} weighted selections.`
    );
  } else if (personalized) {
    // 3. Transfer, but only where the stated table allows it. The refusals are
    //    recorded even when a later source succeeds: "we did not use your hat
    //    size" is a thing the panel should be able to say out loud.
    let best: { dept: Department; index: number; confidence: number } | null = null;
    for (const [deptKey, est] of Object.entries(profile.traits.sizeProfile)) {
      const dept = deptKey as Department;
      if (dept === product.department || !est) continue;
      const rule = SIZE_TRANSFER[scaleOf(dept)][scale];
      if (!rule.allowed) {
        reasons.push(`Ignored your ${dept} size (${est.size}): ${rule.why}.`);
        continue;
      }
      const sourceLadder = SIZE_SCALES[scaleOf(dept)];
      const i = sourceLadder.indexOf(est.size);
      if (i < 0) continue;
      // Same ladder family, so the index carries over directly. Cross-family
      // transfers are refused above rather than rescaled, which is the point.
      const c = est.confidence.value * rule.damping;
      if (!best || c > best.confidence) best = { dept, index: i, confidence: c };
    }
    if (best) {
      centre = best.index;
      confidence = best.confidence;
      source = 'transferred';
      transferredFrom = best.dept;
      reasons.push(
        `No ${product.department} size on file. Carried across from ${best.dept} ` +
          `(${SIZE_SCALES[scaleOf(best.dept)][best.index]}) at ${(FIT_TRANSFER_DAMPING * 100).toFixed(0)}% of its confidence.`
      );

      const from = LAYER_INDEX[best.dept] ?? 0;
      const to = LAYER_INDEX[product.department] ?? 0;
      const step = Math.max(-1, Math.min(1, to - from));
      if (step !== 0) {
        centre += step;
        adjustments.push({
          steps: step,
          label: step > 0 ? 'Sized up one' : 'Sized down one',
          detail:
            step > 0
              ? `a ${product.department.toLowerCase().replace(/s$/, '')} goes over what you bought in ${best.dept}`
              : `${product.department} are cut to go over a layer they will not meet here`,
        });
      }
    }
  }

  // 4. Cut bias on the target product, applied to whatever the shopper's own
  //    evidence produced. Not applied to the population reading: that curve is
  //    already a distribution over what people actually bought, cut included.
  if (centre !== null) {
    const cut = cutBiasFor(product);
    if (cut && cut.steps !== 0) {
      centre += cut.steps;
      adjustments.push({
        steps: cut.steps,
        label: cut.steps > 0 ? 'Sized up one' : 'Sized down one',
        detail: `${product.styleFamily} - ${cut.note}`,
      });
      reasons.push(`${product.styleFamily} ${cut.note}; ${cut.evidence}.`);
    }
  }

  // 5. Population fallback. Informs, never prefills.
  if (centre === null) {
    const curve = POPULATION_SIZE_CURVE[scale];
    const modal = ladder.reduce((a, b) => ((curve[b] ?? 0) > (curve[a] ?? 0) ? b : a), ladder[0]);
    centre = ladder.indexOf(modal);
    confidence = Math.min(POPULATION_CONFIDENCE_CEILING, curve[modal] ?? 0);
    source = 'population';
    reasons.push(
      `Nothing on file for you${personalized ? '' : ' (personalization is off)'}. ` +
        `${modal} is the most common size in this ladder at ${((curve[modal] ?? 0) * 100).toFixed(0)}% of the ` +
        `simulated population - a starting point, not a reading of you.`
    );
  }

  const idx = clampIndex(Math.round(centre), ladder);
  const size = ladder[idx];
  const probs = spreadAround(idx, ladder, confidence);

  // 6. Whether a surface may act on it, and why not when it may not.
  let blocked: string | null = null;
  if (opts.giftIntent) {
    blocked = 'This is being bought for someone else - your own size is not the answer.';
  } else if (source === 'population') {
    blocked = `Population default, capped at ${(POPULATION_CONFIDENCE_CEILING * 100).toFixed(0)}%. A curve about everybody never prefills.`;
  } else if (confidence < FIT_PREFILL_FLOOR) {
    blocked = `${(confidence * 100).toFixed(0)}% is under the ${(FIT_PREFILL_FLOOR * 100).toFixed(0)}% bar for putting a size on screen unasked.`;
  } else if (!(avail[size] ?? true)) {
    blocked = `${size} is not available on this product right now.`;
  }

  return base({
    size,
    confidence: Number(confidence.toFixed(4)),
    source,
    distribution: ladder.map((s, i) => ({ size: s, p: Number(probs[i].toFixed(4)), available: avail[s] ?? true })),
    transferredFrom,
    prefill: blocked === null,
    blocked,
    available: avail[size] ?? true,
  });
}

/**
 * The bar above which the fold's gift signal counts as "not for you".
 *
 * `traits.giftIntent` is a scalar that starts at 0.5 - not "no gift", but "no
 * idea" - and is pushed upward by gift-shaped behaviour: a kids item from a
 * shopper with no kids pattern, a collectible bought alongside apparel, a
 * second club appearing in a single session. Reading a neutral 0.5 as a gift
 * would block the prefill for every shopper who has done nothing at all, which
 * is the opposite of the intent.
 *
 * The confidence floor matters as much as the value. A single observation can
 * move the scalar a long way, and one ambiguous click should not be enough to
 * decide the purchase is for somebody else.
 */
export const GIFT_INTENT_BAR = 0.65;
export const GIFT_INTENT_CONFIDENCE_FLOOR = 0.25;

/**
 * Whether the fold currently reads this session as buying for someone else.
 *
 * Lives here rather than in the component that asks, because two surfaces ask -
 * the size selector and the lifecycle content gate - and a threshold that is
 * written down twice is a threshold that will eventually be written down two
 * different ways.
 */
export function readsAsGift(profile: VisitorProfile): boolean {
  const t = profile.traits.giftIntent;
  return t.value >= GIFT_INTENT_BAR && t.confidence.value >= GIFT_INTENT_CONFIDENCE_FLOOR;
}

/**
 * One line, for a surface that has room for a sentence and not a panel.
 */
export function fitSentence(fit: FitPrediction): string {
  if (!fit.size) return 'No size read.';
  if (fit.source === 'universal') return 'One size.';
  const pct = `${(fit.confidence * 100).toFixed(0)}%`;
  if (fit.source === 'observed') return `${fit.size}, from your own picks - held at ${pct}.`;
  if (fit.source === 'transferred') return `${fit.size}, carried from your ${fit.transferredFrom} size - ${pct}.`;
  return `${fit.size} is the most common size here. We have nothing on file for you.`;
}
