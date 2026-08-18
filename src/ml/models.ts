/**
 * Model registry.
 *
 * Builds the embedding index and the complement model once from the synthetic
 * dataset, then memoises them. This is the prototype's analogue of loading
 * model artefacts at service start-up.
 */

import { getDataset, Dataset } from '../sim/dataset';
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

export function getModels(): ModelRegistry {
  if (cached) return cached;

  const startedAt = performance.now();
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

  return cached;
}
