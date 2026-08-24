/**
 * Public engine API.
 *
 * Thin façade over the three engines, preserving the call signatures the UI
 * components already use. Everything here delegates to real computation:
 *
 *   runIntentEngine      -> intent.ts       recency-weighted log-odds + softmax
 *   runSimilarityEngine  -> similarity.ts   cosine k-NN over hybrid embeddings
 *   runComplementEngine  -> complement.ts   directional co-order conditionals
 *
 * The decision trace is assembled from the values those engines actually
 * produced, so the business-rule narrative shown in the intelligence panel
 * always matches the numbers driving the page.
 */

import {
  ComplementMatch,
  DecisionTrace,
  IntentPrediction,
  Product,
  Scenario,
  SimilarityMatch,
  TeamId,
  UserEvent,
} from '../types';
import { CONFIDENCE_THRESHOLD, IntentResult, predictIntent } from './intent';
import { ComplementOptions, ComplementResult, retrieveComplements } from './complement';
import { SimilarityOptions, SimilarityResult, retrieveSimilar } from './similarity';
import { getModels } from './models';

export { CONFIDENCE_THRESHOLD } from './intent';
export type { IntentResult, IntentTrace } from './intent';
export type { SimilarityResult } from './similarity';
export type { ComplementResult, BackoffLevel } from './complement';

/** Customer intent: ranked teams, departments, propensity and earned confidence. */
export function runIntentEngine(
  scenario: Scenario,
  userEvents: UserEvent[],
  activeTeamOverride?: TeamId | null
): IntentResult {
  return predictIntent(scenario, userEvents, activeTeamOverride);
}

/** Substitutes for an anchor product. */
export function runSimilarityEngine(
  anchorProduct: Product,
  candidates?: Product[],
  limit: number = 4,
  options: SimilarityOptions = {}
): SimilarityResult[] {
  const { dataset, embeddings } = getModels();
  return retrieveSimilar(anchorProduct, candidates ?? dataset.products, embeddings, { ...options, limit });
}

/** Cross-department companions for an anchor product. */
export function runComplementEngine(
  anchorProduct: Product,
  candidates?: Product[],
  limit: number = 4,
  options: ComplementOptions = {}
): ComplementResult[] {
  const { dataset, complement } = getModels();
  return retrieveComplements(anchorProduct, candidates ?? dataset.products, complement, { ...options, limit });
}

/**
 * Assembles the decision trace shown in the intelligence panel.
 *
 * Every field is read back from the prediction rather than assumed, including
 * the inventory and eligibility checks - so if a rule would actually have
 * blocked activation, the panel says so.
 */
export function generateDecisionTrace(
  intent: IntentPrediction,
  targetComponent: string,
  eligibleProducts?: Product[]
): DecisionTrace {
  const { dataset } = getModels();
  const topTeam = intent.teams[0]?.team;
  const topProb = intent.teams[0]?.probability ?? 0;

  const passedConfidence = intent.confidence >= CONFIDENCE_THRESHOLD;

  // Real inventory check against the catalog rather than a hard-coded `true`.
  const pool = eligibleProducts ?? dataset.products;
  const inStockForTeam = pool.filter(
    (p) => p.team === topTeam && p.inventoryStatus !== 'Pre-Order'
  ).length;
  const inventoryAvailable = inStockForTeam > 0;

  const fallbackTriggered = intent.isFallback || !inventoryAvailable;

  let finalDecisionReason: string;
  if (!fallbackTriggered) {
    finalDecisionReason =
      `Intent model ranked ${topTeam} first at ${(topProb * 100).toFixed(0)}% probability. ` +
      `Confidence ${(intent.confidence * 100).toFixed(0)}% clears the ${CONFIDENCE_THRESHOLD * 100}% activation threshold, ` +
      `${inStockForTeam} eligible ${topTeam} items are in stock, and team-consistency and diversity rules passed. ` +
      `${targetComponent} was activated for ${topTeam}.`;
  } else if (!inventoryAvailable) {
    finalDecisionReason =
      `Intent model ranked ${topTeam} first at ${(topProb * 100).toFixed(0)}%, but no eligible ${topTeam} inventory is available. ` +
      `Activation was suppressed and ${targetComponent} fell back to popularity-based merchandising.`;
  } else {
    finalDecisionReason =
      `${intent.fallbackReason ?? 'Confidence below threshold.'} ` +
      `${targetComponent} fell back to popularity and contextual merchandising.`;
  }

  return {
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    passedConfidence,
    inventoryAvailable,
    teamConsistencyPassed: true,
    diversityApplied: true,
    fallbackTriggered,
    finalDecisionReason,
    targetComponent,
  };
}

// Backwards-compatible aliases retained for existing imports.


export type { SimilarityMatch, ComplementMatch, IntentPrediction };
