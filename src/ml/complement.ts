/**
 * Complement retrieval - "Complete the Look" / "Fans Also Add".
 *
 * Complements, not substitutes: items bought *together with* the anchor rather
 * than instead of it. This is a genuinely different estimation problem from
 * similarity, and the prototype treats it that way.
 *
 * The score is a directional conditional probability estimated off the
 * simulated order graph:
 *
 *     P(b | a) = co-order(a, b) / occurrences(a)
 *     lift     = P(b | a) / P(b)
 *
 * Directionality is not asserted anywhere in this file. It falls out of the
 * arithmetic: the joint count is symmetric, but the denominators are not, so
 * P(hat | jersey) and P(jersey | hat) differ whenever hats and jerseys sell at
 * different rates. That is exactly the asymmetry a real complement model finds.
 *
 * HIERARCHICAL SHRINKAGE
 * ----------------------
 * Item-to-item co-order data is sparse: most product pairs have never been
 * bought together, and the pairs that have are usually backed by one or two
 * observations. Trusting `support / occurrences` directly would emit confident
 * nonsense off a single order; ignoring it below a hard cut-off would throw
 * away the only real evidence there is.
 *
 * So the estimate shrinks the item-level rate toward the department-level rate
 * in proportion to how much support actually exists - standard additive /
 * empirical-Bayes smoothing:
 *
 *     lambda   = support / (support + ALPHA)
 *     P(b | a) = lambda * P_item(b|a) + (1 - lambda) * P_dept(b|a) * share(b)
 *
 * With no observations the estimate is exactly the department prior. As support
 * accumulates it slides continuously onto the item-level rate. There is no
 * cliff, evidence is never discarded, and - importantly for ranking - a pair
 * with real co-order history always outranks an otherwise identical pair
 * without any. `backoffLevel` then *describes* which term dominated rather than
 * selecting between them.
 */

import { ComplementMatch, Department, Product } from '../types';
import { CoGraphs } from '../sim/behavior';
import { DEPARTMENT_IDS } from '../sim/taxonomy';

/**
 * Shrinkage strength, in units of co-order observations.
 *
 * ALPHA is the number of observations at which the item-level rate and the
 * department prior carry equal weight. At 2.0, a single co-order pulls the
 * estimate a third of the way onto item-level evidence and four pull it
 * two-thirds - which matches how much a pair count of that size is actually
 * worth against a catalog of this depth.
 */
const ALPHA = 2.0;

/**
 * Display scale for `complementScore`. A conditional probability over a
 * specific one-of-798 item is small by nature - the strongest pairs here sit
 * near 0.09 - so the raw value would render as a permanently-empty progress
 * bar. This constant maps the working range onto [0,1] for the UI only;
 * `conditionalProbability` and `lift` carry the untransformed numbers.
 */
const SCORE_FULL_SCALE = 0.09;

export type BackoffLevel = 'item' | 'department' | 'prior';

export interface ComplementModel {
  /** P(candidate department | anchor department), directional. */
  deptConditional: Map<string, number>;
  /** Marginal P(department) across all order line items. */
  deptMarginal: Map<Department, number>;
  /** Raw order line-item counts per department - denominator for within-dept share. */
  deptItems: Map<Department, number>;
  /** Total order line items per product index. */
  itemOccurrences: Int32Array;
  totalOrderItems: number;
  graphs: CoGraphs;
}

export function buildComplementModel(products: Product[], graphs: CoGraphs): ComplementModel {
  const deptItems = new Map<Department, number>();
  const deptPairs = new Map<string, number>();

  let totalOrderItems = 0;
  for (let i = 0; i < products.length; i++) {
    const count = graphs.orderCount[i];
    if (count === 0) continue;
    const dept = products[i].department;
    deptItems.set(dept, (deptItems.get(dept) ?? 0) + count);
    totalOrderItems += count;
  }

  // Aggregate the item-level co-order graph up to department granularity.
  for (const [i, row] of graphs.coOrder) {
    const deptA = products[i].department;
    for (const [j, count] of row) {
      const deptB = products[j].department;
      const key = `${deptA}->${deptB}`;
      deptPairs.set(key, (deptPairs.get(key) ?? 0) + count);
    }
  }

  // P(B | A) at department level, using A's line-item count as the denominator.
  // Asymmetric by construction of the denominator, not by fiat.
  const deptConditional = new Map<string, number>();
  for (const a of DEPARTMENT_IDS) {
    const denom = deptItems.get(a) ?? 0;
    if (denom === 0) continue;
    for (const b of DEPARTMENT_IDS) {
      const joint = deptPairs.get(`${a}->${b}`) ?? 0;
      deptConditional.set(`${a}->${b}`, joint / denom);
    }
  }

  const deptMarginal = new Map<Department, number>();
  for (const d of DEPARTMENT_IDS) {
    deptMarginal.set(d, totalOrderItems > 0 ? (deptItems.get(d) ?? 0) / totalOrderItems : 0);
  }

  return {
    deptConditional,
    deptMarginal,
    deptItems,
    itemOccurrences: graphs.orderCount,
    totalOrderItems,
    graphs,
  };
}

export interface ComplementOptions {
  limit?: number;
  /** Require the candidate to sit in a different department than the anchor. */
  crossDepartmentOnly?: boolean;
  inStockOnly?: boolean;
  /** Cap how many results may come from any one department. */
  maxPerDepartment?: number;
  minScore?: number;
}

export interface ComplementResult extends ComplementMatch {
  /** Which term dominated the shrunk estimate. */
  backoffLevel: BackoffLevel;
  /** Directional conditional probability P(candidate | anchor), after shrinkage. */
  conditionalProbability: number;
  /** Lift over the candidate's base rate. Above 1.0 means a genuine association. */
  lift: number;
  /** How many co-order observations exist for this exact pair. */
  support: number;
  /** Share of the estimate that came from item-level evidence, in [0,1]. */
  lambda: number;
}

export interface PairEstimate {
  probability: number;
  lift: number;
  level: BackoffLevel;
  support: number;
  /** Mixing coefficient: how much of the estimate came from item-level evidence. */
  lambda: number;
}

function estimatePair(
  model: ComplementModel,
  products: Product[],
  anchorIdx: number,
  candidateIdx: number
): PairEstimate {
  const anchor = products[anchorIdx];
  const candidate = products[candidateIdx];

  const support = model.graphs.coOrder.get(anchorIdx)?.get(candidateIdx) ?? 0;
  const anchorOccurrences = model.itemOccurrences[anchorIdx];

  const candidateMarginal =
    model.totalOrderItems > 0 ? model.itemOccurrences[candidateIdx] / model.totalOrderItems : 0;

  // Department-level rate decomposed down to this specific item:
  //
  //     P(b | a) ~= P(dept_b | a) * P(b | dept_b)
  //
  // The second factor must be b's measured share of its department's order
  // volume. Using a raw popularity score here would leave the two branches on
  // different scales - a per-department probability on one side and a
  // per-item probability on the other - and every lift computed against them
  // would be off by the size of the department.
  const deptProb = model.deptConditional.get(`${anchor.department}->${candidate.department}`) ?? 0;
  const deptVolume = model.deptItems.get(candidate.department) ?? 0;
  const withinDeptShare =
    deptVolume > 0 ? model.itemOccurrences[candidateIdx] / deptVolume : 0;
  const deptEstimate = deptProb * withinDeptShare;

  // No department association either - nothing to go on but the candidate's own
  // base rate, which is already an item-level probability.
  if (deptProb <= 0 && support === 0) {
    return { probability: candidateMarginal, lift: 0, level: 'prior', support: 0, lambda: 0 };
  }

  const itemEstimate = anchorOccurrences > 0 ? support / anchorOccurrences : 0;
  const lambda = support > 0 ? support / (support + ALPHA) : 0;
  const probability = lambda * itemEstimate + (1 - lambda) * deptEstimate;

  // Lift against the candidate's own base rate. Above 1.0 means the pairing is
  // genuinely more common than chance, not just that the candidate sells well.
  const lift = candidateMarginal > 0 ? probability / candidateMarginal : 0;

  // The level reports which term actually carried the estimate.
  const level: BackoffLevel = lambda >= 0.5 ? 'item' : deptProb > 0 ? 'department' : 'prior';

  return { probability, lift, level, support, lambda };
}

function relationshipFor(
  anchor: Product,
  candidate: Product,
  level: BackoffLevel,
  lift: number
): ComplementMatch['relationshipType'] {
  if (level === 'item' && lift > 1.5) return 'Co-Order High';
  if (candidate.department === 'Accessories' || candidate.department === 'Hats') return 'Cart Accessory';
  if (candidate.department !== anchor.department) return 'Complete the Look';
  return 'Cross-Dept Classic';
}

function supportingSignalFor(
  anchor: Product,
  candidate: Product,
  est: PairEstimate
): string {
  const { level, support, lift, lambda } = est;
  switch (level) {
    case 'item':
      return `${support} co-order observations for this exact pair (${Math.round(lambda * 100)}% item-level weight), ${lift.toFixed(1)}x the candidate's base rate`;
    case 'department':
      return support > 0
        ? `${support} co-order observation(s) for this pair, shrunk toward the ${anchor.department}-to-${candidate.department} department rate (${Math.round(lambda * 100)}% item-level weight)`
        : `No observations for this exact pair; estimated from the ${anchor.department}-to-${candidate.department} department rate at ${lift.toFixed(1)}x base rate`;
    default:
      return 'No co-order association observed; ranked on popularity prior only';
  }
}

export function retrieveComplements(
  anchor: Product,
  products: Product[],
  model: ComplementModel,
  options: ComplementOptions = {}
): ComplementResult[] {
  const {
    limit = 4,
    crossDepartmentOnly = true,
    inStockOnly = true,
    maxPerDepartment = 2,
    minScore = 0,
  } = options;

  const anchorIdx = anchor.index;
  if (anchorIdx === undefined) return [];

  const scored: (ComplementResult & { _sort: number })[] = [];

  // `products` may be a filtered subset, so graph lookups key off each product's
  // catalog-wide `index` rather than its position in this array.
  for (const candidate of products) {
    const i = candidate.index;
    if (i === undefined || i === anchorIdx) continue;

    if (crossDepartmentOnly && candidate.department === anchor.department) continue;
    if (inStockOnly && candidate.inventoryStatus === 'Pre-Order') continue;
    // Complements must be wearable together - a Cowboys hat does not complete an
    // Eagles jersey. Team consistency is a hard business rule here, not a score.
    if (candidate.team !== anchor.team) continue;

    const est = estimatePair(model, products, anchorIdx, i);
    const { probability, lift, level, support } = est;
    if (probability <= minScore) continue;

    // Price compatibility: a $400 signed jersey is a poor add-on to a $30 cap.
    const anchorPrice = anchor.salePrice ?? anchor.price;
    const candidatePrice = candidate.salePrice ?? candidate.price;
    const priceRatio = candidatePrice / Math.max(1, anchorPrice);
    const priceCompatibility = priceRatio <= 1 ? 1 : Math.max(0.25, 1 / priceRatio);

    // Shrinkage already rewards genuine co-order evidence, so the only thing
    // left to apply here is the price-compatibility business rule.
    const composite = probability * (0.6 + 0.4 * priceCompatibility);

    scored.push({
      product: candidate,
      complementScore: Number(Math.min(1, composite / SCORE_FULL_SCALE).toFixed(3)),
      relationshipType: relationshipFor(anchor, candidate, level, lift),
      supportingSignal: supportingSignalFor(anchor, candidate, est),
      breakdown: {
        coOrder: Math.round(probability * 100),
        coCart: Math.round((model.graphs.coCart.get(anchorIdx)?.get(i) ?? 0) * 10),
        deptCompatibility: Math.round(
          (model.deptConditional.get(`${anchor.department}->${candidate.department}`) ?? 0) * 100
        ),
        teamMatch: candidate.team === anchor.team ? 100 : 0,
      },
      explanation:
        level === 'item'
          ? `Bought together with ${anchor.name} in ${support} simulated orders - ${lift.toFixed(1)}x more often than this item sells on its own.`
          : level === 'department'
            ? `${anchor.department} orders include a ${candidate.department} item ${Math.round((model.deptConditional.get(`${anchor.department}->${candidate.department}`) ?? 0) * 100)}% of the time. ${support > 0 ? `This pair has ${support} co-order observation(s), too few to stand alone, so the estimate leans on that department rate.` : `This item is the strongest ${candidate.department} match for the same team.`}`
            : `No direct co-order evidence. Surfaced as a popular ${candidate.team} ${candidate.department} item.`,
      backoffLevel: level,
      conditionalProbability: probability,
      lift,
      support,
      lambda: est.lambda,
      _sort: composite,
    });
  }

  scored.sort((a, b) => b._sort - a._sort);

  // Department diversity - a "Complete the Look" row of four hats is useless.
  const perDept = new Map<Department, number>();
  const results: ComplementResult[] = [];
  for (const item of scored) {
    if (results.length >= limit) break;
    const used = perDept.get(item.product.department) ?? 0;
    if (used >= maxPerDepartment) continue;
    perDept.set(item.product.department, used + 1);
    const { _sort, ...rest } = item;
    results.push(rest);
  }

  return results;
}

/**
 * Directional pair inspection, used by the complement visualisation to
 * show that P(b|a) and P(a|b) genuinely differ.
 */
export function inspectDirectionality(
  model: ComplementModel,
  anchorDept: Department,
  candidateDept: Department
): { forward: number; reverse: number } {
  return {
    forward: model.deptConditional.get(`${anchorDept}->${candidateDept}`) ?? 0,
    reverse: model.deptConditional.get(`${candidateDept}->${anchorDept}`) ?? 0,
  };
}
