/**
 * The single synthetic dataset the whole application runs on.
 *
 * Built once, lazily, on first access, and memoised. Everything downstream - the
 * catalog you browse, the co-occurrence graphs, the embedding matrix, the
 * evaluation metrics - derives from this one deterministic construction.
 *
 * The memo is versioned rather than permanent, and it is now load-bearing:
 * `fireMarketEvent()` moves the clock and drops the memo, so the world the next
 * `getDataset()` builds is the post-event one. `getDatasetVersion()` lets a
 * derived cache - the model registry, the scenario list - notice that what it
 * was built from has gone, which is how firing a trade re-estimates the
 * complement model without anybody calling `invalidateModels()` by hand.
 *
 * The world is a FUNCTION OF A CLOCK. `buildWorld(clock)` is the whole
 * construction and takes no globals; `getDataset()` is that function plus a
 * one-entry cache keyed on the active clock. Everything about how an event
 * reaches the catalog, the population and the graphs follows from that one
 * shape, including the fact that two arms cannot see each other's events.
 *
 * The rule that comes with it: call `getDataset()` at the point of use. Reaching
 * in once for `.products` and holding the array is a reference the invalidation
 * cannot reach, and it is how a demo ends up showing a catalog the models have
 * already stopped believing in. This is no longer hypothetical - a trade fires
 * from a button on the storefront.
 */

import { Product } from '../types';
import { ChoiceModel } from './choice';
import { generateCatalog } from './catalog';
import {
  MarketEvent,
  MarketEventTemplate,
  SimClock,
  activeClock,
  advanceMonths,
  fireTemplate,
  resetClock,
  setActiveClock,
  withEvent,
} from './clock';
import {
  CoGraphs,
  GraphScoreTable,
  SimulationResult,
  SyntheticCustomer,
  computeGraphScores,
  simulateBehavior,
} from './behavior';

export interface Dataset {
  products: Product[];
  productByIndex: Product[];
  productById: Map<string, Product>;
  graphs: CoGraphs;
  /**
   * Normalised co-occurrence degree per product, keyed by product id. A side
   * table rather than three fields on `Product` - see `computeGraphScores`.
   */
  graphScores: GraphScoreTable;
  customers: SyntheticCustomer[];
  /**
   * The choice model the behaviour was generated through, carrying its fitted
   * intercepts and the calibration record that produced them. Exposed because a
   * screen that reports a metric off this dataset should be able to state which
   * parameters were fitted, against what target, and how close the fit landed -
   * without that, "calibrated" is a word rather than a claim.
   */
  choice: ChoiceModel;
  /**
   * The clock this world was built under, carried so anything reporting off it
   * can state which month and which market it is describing. A metric without a
   * date on it is not reproducible once the world can move.
   */
  clock: SimClock;
  stats: SimulationResult['stats'] & { catalogSize: number; buildMs: number };
}

let cached: Dataset | null = null;
let cachedForClock: SimClock | null = null;
let version = 0;
let eventSeq = 0;
const listeners = new Set<() => void>();

/**
 * Builds one world from one clock. No memo, no globals, no shared mutable state.
 *
 * This is the leak-proof seam, and it is a plain function on purpose. `getDataset`
 * is this function plus a cache; an experimental arm is this function called
 * directly with its own clock. Two arms therefore share nothing but the frozen
 * taxonomy and the seeded RNG, both of which are read-only.
 *
 * The three places a fired event could have leaked, and why none of them can:
 *
 *  1. The catalog. `generateCatalog` allocates a fresh array per call and
 *     `applyMarketEvents` clones every product it touches, so an event applied
 *     in one arm cannot reach an object another arm is holding.
 *  2. The roster. `rosterAt` folds the event log into a fresh table rather than
 *     writing to `TEAMS`, so a trade does not move the player process-wide.
 *  3. The seasonality curve. Frozen at both levels, so a stray write throws in
 *     strict mode rather than silently rewriting every other arm's calendar.
 *
 * `clock.test.ts` builds two worlds from two clocks and checks all three.
 */
export function buildWorld(clock: SimClock): Dataset {
  const startedAt = performance.now();
  const products = generateCatalog(undefined, clock);
  const simulation = simulateBehavior(products, undefined, clock);
  const graphScores = computeGraphScores(products, simulation.graphs);

  const productById = new Map<string, Product>();
  for (const p of products) productById.set(p.id, p);

  return {
    products,
    productByIndex: products,
    productById,
    graphs: simulation.graphs,
    graphScores,
    customers: simulation.customers,
    choice: simulation.choice,
    clock,
    stats: {
      ...simulation.stats,
      catalogSize: products.length,
      buildMs: Math.round(performance.now() - startedAt),
    },
  };
}

export function getDataset(): Dataset {
  const clock = activeClock();
  // Identity, not deep equality: clocks are frozen values and every transition
  // returns a new one, so a changed clock is always a changed reference.
  if (cached && cachedForClock === clock) return cached;

  cached = buildWorld(clock);
  cachedForClock = clock;
  return cached;
}

/**
 * Which generation of the world the current memo belongs to.
 *
 * Anything that caches a value derived from the dataset should record this
 * alongside it and rebuild when the two disagree. That is cheaper to reason
 * about than a second invalidator per derived cache, because it removes the
 * question of what order the invalidators run in.
 */
export function getDatasetVersion(): number {
  return version;
}

/**
 * Drops the world and everything derived from it.
 *
 * Bumps the version before notifying, so a listener that immediately calls
 * `getDataset()` builds the new world rather than racing the old one.
 */
export function invalidateWorld(): void {
  cached = null;
  cachedForClock = null;
  version += 1;
  for (const listener of listeners) listener();
}

/**
 * Notification for consumers that cannot poll - the React tree, mainly, which
 * needs a state change to re-render rather than a version number it can read.
 *
 * Plain callbacks, no DOM: this module is imported by the evaluation harness
 * under tsx and must stay runnable there. Returns its own unsubscribe.
 */
export function subscribeToWorld(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ------------------------------------------------------------ market events -- */

/**
 * Fires a market event into the world the application is standing on.
 *
 * This is the only writer of the active clock outside tests, and it is the
 * caller of `invalidateWorld()` that the memo was built for. Note the order:
 * the clock moves FIRST, then the memo is dropped, then listeners are told. A
 * listener that reacts by calling `getDataset()` synchronously therefore builds
 * the post-event world rather than racing the pre-event one back into the cache.
 *
 * It rebuilds everything - catalog, 14,000 shoppers, all three co-occurrence
 * graphs - which takes a couple of seconds. That is the honest cost of the claim
 * being made: the co-order priors for the affected items are re-ESTIMATED from
 * sessions that happened in the new market, not re-weighted from the old ones.
 * A cheaper implementation would have to describe itself differently.
 *
 * Returns the stamped event so the caller can write it into the decision stream.
 */
export function fireMarketEvent(template: MarketEventTemplate): MarketEvent {
  const clock = activeClock();
  eventSeq += 1;
  const event = fireTemplate(template, clock, eventSeq);
  setActiveClock(withEvent(clock, event));
  invalidateWorld();
  return event;
}

/** Moves the application's clock forward, decaying every live lift with it. */
export function advanceClock(months: number): SimClock {
  const next = advanceMonths(activeClock(), months);
  setActiveClock(next);
  invalidateWorld();
  return next;
}

/**
 * Back to the world every published metric was measured under.
 *
 * Not just a convenience: a demo that can fire seven events and never get back
 * to the baseline cannot make the before-and-after comparison the events exist
 * to make.
 */
export function resetMarket(): SimClock {
  resetClock();
  invalidateWorld();
  return activeClock();
}

/** The clock the application is standing on. Convenience re-export. */
export { activeClock };
