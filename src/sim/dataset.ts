/**
 * The single synthetic dataset the whole application runs on.
 *
 * Built once, lazily, on first access, and memoised. Everything downstream - the
 * catalog you browse, the co-occurrence graphs, the embedding matrix, the
 * evaluation metrics - derives from this one deterministic construction.
 *
 * The memo is versioned rather than permanent. Market events later in this build
 * mutate the catalog, and a cache with no invalidation path would keep serving
 * the pre-event world forever. `invalidateWorld()` drops the memo and bumps the
 * version; `getDatasetVersion()` lets a derived cache - the model registry, the
 * scenario list - notice that what it was built from has gone. Nothing calls
 * `invalidateWorld()` yet, so the version is a constant zero today.
 *
 * The rule that comes with it: call `getDataset()` at the point of use. Reaching
 * in once for `.products` and holding the array is a reference the invalidation
 * cannot reach, and it is how a demo ends up showing a catalog the models have
 * already stopped believing in.
 */

import { Product } from '../types';
import { ChoiceModel } from './choice';
import { generateCatalog } from './catalog';
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
  stats: SimulationResult['stats'] & { catalogSize: number; buildMs: number };
}

let cached: Dataset | null = null;
let version = 0;
const listeners = new Set<() => void>();

export function getDataset(): Dataset {
  if (cached) return cached;

  const startedAt = performance.now();
  const products = generateCatalog();
  const simulation = simulateBehavior(products);
  const graphScores = computeGraphScores(products, simulation.graphs);

  const productById = new Map<string, Product>();
  for (const p of products) productById.set(p.id, p);

  cached = {
    products,
    productByIndex: products,
    productById,
    graphs: simulation.graphs,
    graphScores,
    customers: simulation.customers,
    choice: simulation.choice,
    stats: {
      ...simulation.stats,
      catalogSize: products.length,
      buildMs: Math.round(performance.now() - startedAt),
    },
  };

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
