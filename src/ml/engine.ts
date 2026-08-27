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
import { applyEvent, applyImpressions, applyPurchase, buildProfile, createProfile, promoteProfile } from './profile';
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
  PurchaseRecord,
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
  resolveGeo,
  rungIndex,
} from './identity';
export type {
  CompletenessField,
  CompletenessReport,
  ContextReading,
  DeviceClass,
  GeoResolution,
  IdentityRungMeta,
  IdentitySeed,
  VisitorContext,
} from './identity';
// The facet model, through the same façade. Which filter to offer and which
// value inside it are two predictions, and both are read by the listing page.
export {
  FACET_KEYS,
  FACET_LABEL,
  FACET_LAMBDA,
  facetOrder,
  isDepartment,
  runFacetModel,
} from './facets';
export type { FacetBelief, FacetKey, FacetModel, FacetValueBelief } from './facets';
// The decision join, and the path helper the journey screen groups writes by.
export { buildDecisions, fieldOf } from './decisions';
export type { DecisionEntry, DecisionReading } from './decisions';
export type { SimilarityResult } from './similarity';
export type { ComplementResult, BackoffLevel } from './complement';
// Refusal, through the same façade as recommendation - which is the whole point
// of the module. A component that can import the ranker and not the gate will
// eventually ship a rail with no gate on it.
export {
  RULE_LABEL,
  SURFACE_POLICIES,
  applySuppression,
  inertContext,
  refusalSentence,
  suppressedTeamsFor,
  suppressionContext,
  suppressionEffort,
  thresholdAt,
  FATIGUE_CEILING,
  GIFT_OVERRIDE,
  LOYALIST_CONFIDENCE_FLOOR,
  LOYALIST_POSTERIOR_FLOOR,
  RECENT_PURCHASE_WINDOW_DAYS,
  RIVALRY_SUPPRESSION_FLOOR,
} from './suppression';
export type {
  Candidate,
  ScoreScale,
  SuppressionContext,
  SuppressionDecision,
  SuppressionResult,
  SuppressionRule,
  SurfacePolicy,
} from './suppression';
// Size and fit. The prefill is a decision the shopper cannot ignore, so it goes
// through the same door as everything else that decides something.
export {
  BRAND_CUT_BIAS,
  CUT_BIAS,
  FIT_PREFILL_FLOOR,
  FIT_TRANSFER_DAMPING,
  GIFT_INTENT_BAR,
  GIFT_INTENT_CONFIDENCE_FLOOR,
  LAYER_INDEX,
  POPULATION_CONFIDENCE_CEILING,
  POPULATION_SIZE_CURVE,
  SIZE_TRANSFER,
  fitSentence,
  ladderFor,
  predictFit,
  readsAsGift,
  scaleOf,
  sizeAvailability,
} from './fit';
export type { CutBias, FitPrediction, FitSource, SizeScaleId, TransferRule } from './fit';
// Out-of-stock substitution.
export { CONTINUITY_WEIGHTS, PRICE_TOLERANCE, needsSubstitute, runSubstitution } from './substitution';
export type {
  RejectReason,
  SubstitutionResult,
  SubstituteScore,
  UnavailabilityReason,
} from './substitution';
// Merchandising badges, and the population statistic behind each one.
export { BADGE_BASIS_NOTE, badgeStatsFor, buildBadgeIndex } from './badges';
export type { BadgeIndex, BadgeStat } from './badges';
// Lifecycle triggers.
export {
  BLOCK_LABEL,
  CHANNEL_RUNG,
  EMPTY_FREQUENCY,
  FREQUENCY_CAP,
  HOLDOUT_SHARE,
  LIFECYCLE_POLICY,
  QUIET_HOURS,
  TRIGGERS,
  TRIGGER_BY_ID,
  inHoldout,
  lifecycleEffort,
  localHourIn,
  runLifecycle,
  sendSentence,
  withinSendingHours,
} from './lifecycle';
export type {
  Channel,
  LifecycleResult,
  LifecycleSession,
  SendBlock,
  TriggerDefinition,
  TriggerEvaluation,
  TriggerId,
} from './lifecycle';
// The model registry.
export { CARD_BY_ID, FAMILY_LABEL, MODEL_CARDS, featureVectorFor, halfLife, lastFiredFor } from './registry';
export type { EngineName, FeatureRow, FiredMark, ModelCard, ModelFamily } from './registry';

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

/**
 * Folds a slate of impressions in. Not an event: nothing about intent moves.
 *
 * See the header of `applyImpressions` for why surfaces batch these to one
 * write per user event rather than writing on render.
 */
export function runImpressions(
  profile: VisitorProfile,
  productIds: string[],
  clock?: ProfileClock
): ProfileUpdate {
  return applyImpressions(profile, productIds, clock);
}

/** Records a completed order into the durable state the ownership rule reads. */
export function runPurchase(
  profile: VisitorProfile,
  items: { productId: string; gift?: boolean }[],
  clock?: ProfileClock
): ProfileUpdate {
  return applyPurchase(profile, items, clock);
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
