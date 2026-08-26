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

export interface SimSession {
  focusTeam: TeamId;
  /** Product indices viewed, in order. */
  viewed: number[];
  carted: number[];
  ordered: number[];
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
  stats: {
    populationSize: number;
    sessionCount: number;
    orderCount: number;
    viewEventCount: number;
    meanBasketSize: number;
    elapsedMs: number;
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

/** Relevance of a product to a shopper in a given session, before popularity. */
function productAffinityScore(
  product: Product,
  customer: SyntheticCustomer,
  focusTeam: TeamId
): number {
  const teamTerm = product.team === focusTeam ? 1.0 : customer.teamAffinity[product.team] * 0.35;
  const deptTerm = customer.deptAffinity[product.department];
  const popularityTerm = product.popularity / 100;

  // Price sensitivity pushes shoppers toward the cheaper end of the assortment.
  const effectivePrice = product.salePrice ?? product.price;
  const priceTerm = 1 - customer.priceSensitivity * Math.min(1, effectivePrice / 200);

  return Math.max(1e-4, teamTerm * 0.5 + deptTerm * 0.3) * (0.35 + popularityTerm * 0.65) * priceTerm;
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

function simulateSession(
  rng: Rng,
  customer: SyntheticCustomer,
  products: Product[],
  byTeam: Map<TeamId, number[]>,
  byTeamDept: Map<string, number[]>
): SimSession {
  // Which club is front of mind this session: affinity weighted by how in-season
  // that club's league currently is.
  const focusTeam = rng.pickWeighted(
    TEAM_IDS,
    TEAM_IDS.map((t) => customer.teamAffinity[t] * LEAGUE_SEASONALITY[TEAM_BY_ID[t].league][SIM_MONTH])
  );

  // Browse depth: log-normal, most sessions shallow, some long.
  const depth = Math.max(2, Math.min(18, Math.round(rng.logNormal(Math.log(6), 0.5))));

  // Candidate pool: the focus team's assortment, plus a slice of the rest of the
  // catalog so cross-team co-views exist at a realistic low rate.
  const focusPool = byTeam.get(focusTeam) ?? [];
  // Sampled directly rather than by shuffling the whole catalog - this runs once
  // per simulated session and the allocation churn is otherwise significant.
  const strayPool: number[] = [];
  for (let i = 0; i < 40; i++) strayPool.push(rng.int(0, products.length - 1));
  const pool = focusPool.concat(strayPool);
  if (pool.length === 0) return { focusTeam, viewed: [], carted: [], ordered: [] };

  const weights = pool.map((i) => productAffinityScore(products[i], customer, focusTeam));

  const viewed: number[] = [];
  for (let i = 0; i < depth; i++) {
    const pick = rng.pickWeighted(pool, weights);
    if (!viewed.includes(pick)) viewed.push(pick);
  }

  // Cart adds: a subset of what was viewed, biased toward later views.
  const carted: number[] = [];
  viewed.forEach((idx, position) => {
    const recencyBoost = 0.4 + (position / Math.max(1, viewed.length - 1)) * 0.6;
    if (rng.chance(0.2 * recencyBoost)) carted.push(idx);
  });

  // Conversion: carted sessions convert at a realistic rate.
  let ordered: number[] = [];
  if (carted.length > 0 && rng.chance(0.55)) {
    const anchorIdx = rng.pick(carted);
    ordered = buildBasket(rng, anchorIdx, products, byTeamDept, customer);
  }

  return { focusTeam, viewed, carted, ordered };
}

export function simulateBehavior(products: Product[], seed: string = BEHAVIOR_SEED): SimulationResult {
  const startedAt = performance.now();
  const rng = new Rng(seed);
  const { byTeam, byTeamDept } = buildBuckets(products);

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
      allSessions.push(simulateSession(rng, customer, products, byTeam, byTeamDept));
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

  return {
    customers,
    graphs,
    stats: {
      populationSize: customers.length,
      sessionCount: graphs.totalSessions,
      orderCount: graphs.totalOrders,
      viewEventCount,
      meanBasketSize: graphs.totalOrders > 0 ? basketSizeTotal / graphs.totalOrders : 0,
      elapsedMs: Math.round(performance.now() - startedAt),
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
