/**
 * Model registry.
 *
 * Builds the embedding index and the complement model once from the synthetic
 * dataset, then memoises them. This is the prototype's analogue of loading
 * model artefacts at service start-up.
 *
 * Both artefacts are derived from the catalog and the co-occurrence graphs, so
 * the memo has to expire when those do. It carries the dataset version it was
 * built against and rebuilds when that no longer matches, which means callers
 * never have to invalidate this cache and the dataset cache in the right order -
 * there is only one way to drop the world, and this follows it.
 */

import { getDataset, getDatasetVersion, Dataset } from '../sim/dataset';
import { buildEmbeddingIndex, EMBEDDING_DIM, EmbeddingIndex } from './embeddings';
import { buildComplementModel, ComplementModel } from './complement';

export interface ModelRegistry {
  dataset: Dataset;
  embeddings: EmbeddingIndex;
  complement: ComplementModel;
  meta: {
    embeddingDim: number;
    catalogSize: number;
    /** Wall-clock cost of building every artefact, in ms. Real, not simulated. */
    buildMs: number;
    datasetBuildMs: number;
    /** Version strings surfaced in the ML intelligence panel. */
    versions: {
      intent: string;
      similarity: string;
      complement: string;
    };
  };
}

let cached: ModelRegistry | null = null;
let cachedForVersion = -1;

export function getModels(): ModelRegistry {
  if (cached && cachedForVersion === getDatasetVersion()) return cached;

  const startedAt = performance.now();
  // Read the version before the build, not after: a rebuild triggered from
  // inside an invalidation would otherwise stamp the cache with a generation it
  // did not actually read.
  const builtForVersion = getDatasetVersion();
  const dataset = getDataset();
  const embeddings = buildEmbeddingIndex(dataset.products, dataset.graphs);
  const complement = buildComplementModel(dataset.products, dataset.graphs);

  cached = {
    dataset,
    embeddings,
    complement,
    meta: {
      embeddingDim: EMBEDDING_DIM,
      catalogSize: dataset.products.length,
      buildMs: Math.round(performance.now() - startedAt),
      datasetBuildMs: dataset.stats.buildMs,
      versions: {
        intent: 'intent-seq-v1.3.0',
        similarity: 'similarity-hybrid-v2.1.0',
        complement: 'complement-coorder-v1.4.0',
      },
    },
  };

  cachedForVersion = builtForVersion;
  return cached;
}

/**
 * Drops the artefacts without rebuilding the world underneath them. For changes
 * to the models themselves - embedding weights, complement priors - where the
 * catalog and the graphs are still good.
 */
export function invalidateModels(): void {
  cached = null;
  cachedForVersion = -1;
}
