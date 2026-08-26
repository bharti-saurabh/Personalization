/**
 * Persona scoring.
 *
 * Personas are derived, never primitive. Nothing in the fold sets "this shopper
 * is a Gifter"; the label falls out of where the profile's own fields sit in
 * feature space, which means it always has a runner-up and a margin, and can
 * always be argued with. A persona shown without its margin is a claim the model
 * cannot support, so `PersonaBlock` has no shape that permits one.
 *
 * The computation is a softmax over negative weighted distance to six
 * archetypes. Archetype coordinates are a merchandising judgement rather than a
 * fitted parameter, and are written out in full below so the judgement is
 * inspectable rather than buried in a scoring function.
 *
 * This module is a runtime leaf on purpose: it imports types from profile.ts and
 * nothing else, so profile.ts can import the scorer without a cycle.
 */

import type { Confidence } from './profile';

export type PersonaId =
  | 'Loyalist'
  | 'Multi-Team Collector'
  | 'Gifter'
  | 'Bandwagoner'
  | 'Kids Outfitter'
  | 'Deal Seeker';

export const PERSONA_IDS: PersonaId[] = [
  'Loyalist',
  'Multi-Team Collector',
  'Gifter',
  'Bandwagoner',
  'Kids Outfitter',
  'Deal Seeker',
];

export interface PersonaBlock {
  label: PersonaId;
  runnerUp: PersonaId;
  /** label - runnerUp. Never render the label without it. */
  margin: number;
  posterior: Record<PersonaId, number>;
  /** Which features pulled hardest toward the label, in plain language. */
  drivers: string[];
  confidence: Confidence;
}

/**
 * Everything persona scoring is allowed to see.
 *
 * Deliberately a flat vector of derived quantities rather than the profile
 * itself. It keeps this module a leaf, and it forces every input to the persona
 * to be something already visible elsewhere in the panel - there is no private
 * signal here that a viewer cannot also find on the Profile tab.
 */
export interface PersonaFeatures {
  /** Posterior mass on the leading team. */
  concentration: number;
  /** Teams holding more than a token share, mapped onto [0,1]. */
  breadth: number;
  giftIntent: number;
  priceSensitivity: number;
  /** Posterior mass on the `kids` gender trait. */
  kidsShare: number;
  /** Posterior mass on the Collectibles department. */
  collectibleShare: number;
  /** Depth of purchase history, saturating. Separates a Loyalist from a Bandwagoner. */
  historyDepth: number;
  /** Total evidence behind the profile, for the confidence term. */
  evidenceTotal: number;
}

const FEATURE_ORDER: (keyof PersonaFeatures)[] = [
  'concentration',
  'breadth',
  'giftIntent',
  'priceSensitivity',
  'kidsShare',
  'collectibleShare',
  'historyDepth',
];

/**
 * Archetype coordinates in the order above.
 *
 * Loyalist and Bandwagoner are separated only by `historyDepth`: both are
 * concentrated on one club, and the difference between the two is whether that
 * concentration has any history behind it. That is the whole distinction a
 * merchandiser cares about, and it is why `historyDepth` is a feature at all.
 */
const ARCHETYPES: Record<PersonaId, number[]> = {
  Loyalist: [0.85, 0.05, 0.1, 0.35, 0.05, 0.3, 0.85],
  'Multi-Team Collector': [0.35, 0.9, 0.15, 0.3, 0.05, 0.7, 0.7],
  Gifter: [0.45, 0.35, 0.9, 0.4, 0.45, 0.3, 0.4],
  Bandwagoner: [0.75, 0.3, 0.15, 0.55, 0.1, 0.15, 0.1],
  'Kids Outfitter': [0.6, 0.2, 0.55, 0.55, 0.9, 0.1, 0.55],
  'Deal Seeker': [0.4, 0.4, 0.2, 0.92, 0.2, 0.1, 0.45],
};

/** Plain-language name for each feature, used to explain the label. */
const FEATURE_LABEL: Record<keyof PersonaFeatures, string> = {
  concentration: 'single-club concentration',
  breadth: 'interest spread across clubs',
  giftIntent: 'gift signals',
  priceSensitivity: 'price sensitivity',
  kidsShare: 'kids merchandise',
  collectibleShare: 'collectibles interest',
  historyDepth: 'depth of purchase history',
  evidenceTotal: 'total evidence',
};

/**
 * Softmax temperature over negative distance. Low enough that a clear match
 * separates, high enough that a profile sitting between two archetypes reports
 * a small margin rather than an arbitrary winner.
 */
const PERSONA_TEMPERATURE = 0.18;

/** Evidence mass at which the persona reaches ~63% of full confidence. */
const SUFFICIENCY_K = 2.0;

/**
 * Same shape as `distConfidence` in profile.ts - sufficiency, times peak, times
 * a margin discount that bottoms out at half. Written out here rather than
 * imported so this module stays a runtime leaf; if the rule changes, both move.
 */
function personaConfidence(evidenceTotal: number, top: number, margin: number): number {
  const sufficiency = 1 - Math.exp(-evidenceTotal / SUFFICIENCY_K);
  const marginRatio = top > 0 ? Math.max(0, Math.min(1, margin / top)) : 0;
  return Math.max(0.02, Math.min(0.99, sufficiency * top * (0.5 + 0.5 * marginRatio)));
}

export function scorePersona(
  features: PersonaFeatures,
  now: number,
  decayLambda: number
): PersonaBlock {
  const vector = FEATURE_ORDER.map((k) => features[k]);

  const distances = PERSONA_IDS.map((id) => {
    const archetype = ARCHETYPES[id];
    let sumSq = 0;
    for (let i = 0; i < vector.length; i++) {
      const d = vector[i] - archetype[i];
      sumSq += d * d;
    }
    return Math.sqrt(sumSq);
  });

  // Softmax over negative distance: closest archetype gets the most mass.
  const scaled = distances.map((d) => -d / PERSONA_TEMPERATURE);
  const max = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - max));
  const total = exps.reduce((a, b) => a + b, 0);

  const posterior = {} as Record<PersonaId, number>;
  PERSONA_IDS.forEach((id, i) => {
    posterior[id] = exps[i] / total;
  });

  const ranked = [...PERSONA_IDS].sort((a, b) => posterior[b] - posterior[a]);
  const label = ranked[0];
  const runnerUp = ranked[1];
  const margin = posterior[label] - posterior[runnerUp];

  // Explain the label by the features that agree with it most closely, which is
  // the same arithmetic that produced it rather than a narrative laid on top.
  const archetype = ARCHETYPES[label];
  const drivers = FEATURE_ORDER.map((key, i) => ({
    key,
    // High archetype coordinate the profile actually meets, or low one it avoids.
    agreement: 1 - Math.abs(vector[i] - archetype[i]),
    salience: Math.abs(archetype[i] - 0.5),
  }))
    .filter((d) => d.agreement > 0.6 && d.salience > 0.15)
    .sort((a, b) => b.salience * b.agreement - a.salience * a.agreement)
    .slice(0, 3)
    .map((d) => FEATURE_LABEL[d.key]);

  return {
    label,
    runnerUp,
    margin,
    posterior,
    drivers,
    confidence: {
      value: personaConfidence(features.evidenceTotal, posterior[label], margin),
      evidenceCount: features.evidenceTotal,
      lastUpdated: now,
      source: features.evidenceTotal > 0 ? 'inferred' : 'prior',
      decayLambda,
    },
  };
}
