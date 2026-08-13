/**
 * The single synthetic dataset the whole application runs on.
 *
 * Built once, lazily, on first access, and memoised for the lifetime of the
 * page. Everything downstream - the catalog you browse, the co-occurrence
 * graphs, the embedding matrix, the evaluation metrics - derives from this one
 * deterministic construction.
 */

import { Product } from '../types';
import { generateCatalog } from './catalog';
import { CoGraphs, SimulationResult, SyntheticCustomer, attachGraphScores, simulateBehavior } from './behavior';

export interface Dataset {
  products: Product[];
  productByIndex: Product[];
  productById: Map<string, Product>;
  graphs: CoGraphs;
  customers: SyntheticCustomer[];
  stats: SimulationResult['stats'] & { catalogSize: number; buildMs: number };
}

let cached: Dataset | null = null;

export function getDataset(): Dataset {
  if (cached) return cached;

  const startedAt = performance.now();
  const products = generateCatalog();
  const simulation = simulateBehavior(products);
  attachGraphScores(products, simulation.graphs);

  const productById = new Map<string, Product>();
  for (const p of products) productById.set(p.id, p);

  cached = {
    products,
    productByIndex: products,
    productById,
    graphs: simulation.graphs,
    customers: simulation.customers,
    stats: {
      ...simulation.stats,
      catalogSize: products.length,
      buildMs: Math.round(performance.now() - startedAt),
    },
  };

  return cached;
}
