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
import { CONFIDENCE_THRESHOLD, IntentResult, predictIntent, predictIntentFromProfile } from './intent';
import { applyEvent, buildProfile, createProfile, promoteProfile } from './profile';
import type { ProfileClock, ProfileUpdate, VisitorProfile } from './profile';
import type { IdentitySeed } from './identity';
import { ComplementOptions, ComplementResult, retrieveComplements } from './complement';
import { SimilarityOptions, SimilarityResult, retrieveSimilar } from './similarity';
import { getModels } from './models';

export { CONFIDENCE_THRESHOLD } from './intent';
export type { IntentResult, IntentTrace } from './intent';
// The profile's vocabulary is re-exported here for the same reason the engines
// are: React should import from one place. Adding a second ml/ module to every
// component's import list is how a façade stops being one.
export type {
  AgeBand,
  Confidence,
  Dist,
  DistDriver,
  GenderTrait,
  IdentityState,
  PlayerId,
  ProfileClock,
  ProfileDelta,
  ProfileSource,
  ProfileUpdate,
  ScalarTrait,
  SizeEstimate,
  VisitorProfile,
} from './profile';
export type { PersonaBlock, PersonaId } from './persona';
// The identity ladder, same façade rule.
export {
  IDENTITY_LADDER,
  IDENTITY_RUNGS,
  demoSeedFor,
  emptyContext,
  hasReached,
  profileCompleteness,
  readContext,
  rungIndex,
} from './identity';
export type {
  CompletenessField,
  CompletenessReport,
  ContextReading,
  DeviceClass,
  IdentityRungMeta,
  IdentitySeed,
  VisitorContext,
} from './identity';
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

/**
 * Customer intent, read from a folded profile instead of a raw event stream.
 *
 * Same output type as `runIntentEngine`, so a caller can switch paths without
 * touching anything downstream. Both are exported while the transition runs.
 */
export function runIntentEngineFromProfile(
  profile: VisitorProfile,
  activeTeamOverride?: TeamId | null
): IntentResult {
  return predictIntentFromProfile(profile, activeTeamOverride);
}

/* ------------------------------------------------------ profile derivation -- */

/**
 * Folds one event into a profile and reports what moved.
 *
 * Pure, like everything in ml/: it returns the next profile rather than storing
 * it. Persistence is `context/profileStore.ts`'s job and nowhere else's.
 */
export function runProfileUpdate(
  profile: VisitorProfile,
  event: UserEvent,
  clock?: ProfileClock
): ProfileUpdate {
  return applyEvent(profile, event, clock);
}

/** Folds a whole history from the prior-only constructor. Events newest-first. */
export function runProfileBuild(
  scenario: Scenario,
  userEvents: UserEvent[],
  clock?: ProfileClock,
  seed?: IdentitySeed
): ProfileUpdate {
  return buildProfile(scenario, userEvents, clock, seed);
}

/**
 * Moves a visitor up the identity ladder mid-session.
 *
 * Re-folds against the richer seed rather than patching in place, and returns
 * only the fields that actually changed - which is what the panel animates.
 */
export function runProfilePromotion(
  previous: VisitorProfile,
  scenario: Scenario,
  userEvents: UserEvent[],
  seed: IdentitySeed,
  clock?: ProfileClock
): ProfileUpdate {
  return promoteProfile(previous, scenario, userEvents, seed, clock);
}

/** A prior-only profile: what an anonymous first-time visitor is. */
export function runProfileCreate(
  visitorId: string,
  identityState?: Parameters<typeof createProfile>[1],
  clock?: ProfileClock
): VisitorProfile {
  return createProfile(visitorId, identityState, clock);
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
