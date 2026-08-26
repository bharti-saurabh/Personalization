/**
 * Customer intent - next-team and next-department prediction.
 *
 * Scores a shopper's event sequence into a probability distribution over teams
 * and departments. The mechanism is a recency-weighted log-odds accumulation
 * followed by a temperature-scaled softmax:
 *
 *     logit(t) = log(prior(t)) + SUM_e  w(e) * 1[team(e) = t]
 *     w(e)     = exp(-lambda * age(e))
 *     P(t)     = softmax(logit / T)
 *
 * Three properties of this formulation matter for the demo, and all three are
 * real consequences of the maths rather than staged effects:
 *
 *  1. RECENCY. The exponential decay means the last few clicks dominate, so
 *     browsing a new team visibly moves the distribution within a few events.
 *
 *  2. CONFIDENCE IS EARNED. Confidence is derived from the normalised Shannon
 *     entropy of the output distribution, discounted by how much evidence was
 *     available. A shopper with conflicting signals produces a flat
 *     distribution, high entropy, and therefore low confidence - which is what
 *     trips the fallback path. Nothing hard-codes "this scenario is uncertain".
 *
 *  3. PRIORS DEGRADE GRACEFULLY. With no events at all the posterior collapses
 *     to the popularity prior, which is precisely the cold-start behaviour the
 *     anonymous-visitor scenario needs to demonstrate.
 */

import {
  Department,
  IntentPrediction,
  Scenario,
  TeamId,
  UserEvent,
} from '../types';
import { normalisedEntropy, softmax } from '../sim/rng';
import { DEPARTMENTS, DEPARTMENT_IDS, TEAM_IDS } from '../sim/taxonomy';
// The priors and the two recency constants now live in profile.ts, which owns
// the accumulation they belong to. They are imported rather than duplicated so
// the event path and the profile path cannot drift apart - the whole point of
// running the two side by side during the transition is that a disagreement
// between them means a bug, not a difference of opinion.
import {
  DEPT_RECENCY_LAMBDA,
  TEAM_RECENCY_LAMBDA,
  departmentPrior,
  teamPrior,
} from './profile';
import type { VisitorProfile } from './profile';

/** Softmax temperature. Below 1 sharpens the distribution, above 1 flattens it. */
const TEMPERATURE = 0.62;

/**
 * Maximum contribution the observed evidence may make to a logit, in log units.
 *
 * Evidence enters as each candidate's *share* of the total observed weight
 * rather than as a raw sum. Without this the logit grows without bound in the
 * length of the shopper's history: someone with forty events gets a distribution
 * pinned at ~100% on one option, which destroys the ordering of everything
 * below rank 1, while someone with three events gets a sensible spread. The
 * offline harness caught exactly that - department prediction beat the
 * popularity baseline at rank 1 but lost to it at rank 3, because ranks 2 and 3
 * had saturated to noise.
 *
 * Normalising also keeps the two components of confidence independent, which is
 * what they should be: the softmax measures how *concentrated* the preference
 * is, and the sufficiency term separately measures how *much* evidence there
 * was. Summing raw weights conflated the two.
 */
const EVIDENCE_SCALE = 3.5;
/**
 * Evidence needed before the model is willing to be confident at all.
 *
 * Sufficiency is `1 - exp(-evidence / K)`, so K is the evidence mass at which
 * the model reaches ~63% of full confidence. At K = 2.0 a single strong session
 * is not enough on its own, but a recognised customer with purchase history
 * plus a few consistent clicks is.
 */
const SUFFICIENCY_K = 2.0;
/** Confidence below this routes to the fallback experience. */
export const CONFIDENCE_THRESHOLD = 0.5;
/** Weight of a single page view versus a stronger signal. */
const EVENT_WEIGHTS: Record<string, number> = {
  PDP: 1.0,
  PLP: 0.75,
  Filter: 0.6,
  Search: 0.7,
  Cart: 1.6,
  Home: 0.15,
};

export interface IntentTrace {
  /**
   * Which path produced this prediction.
   *
   * `events` replays the raw stream; `profile` reads an already-folded
   * VisitorProfile. The two are kept distinguishable because they carry
   * different evidence - the profile path has no per-event weights to report,
   * and a panel that silently showed an empty list would look broken rather
   * than honest.
   */
  source: 'events' | 'profile';
  /**
   * Per-event decay weight actually applied, most recent first. Empty on the
   * profile path, where the per-event detail has already been folded away and
   * `drivers` carries what survives of it.
   */
  eventWeights: { event: UserEvent; weight: number; ageRank: number }[];
  /** Surviving per-field evidence, profile path only. */
  drivers?: { field: string; label: string; contribution: number }[];
  /** Pre-softmax logits by team. */
  teamLogits: { team: TeamId; logit: number; priorTerm: number; evidenceTerm: number }[];
  temperature: number;
  /** Normalised Shannon entropy of the team distribution, 0 = certain. */
  entropy: number;
  /** Evidence sufficiency in [0,1]; low when the sequence is short. */
  sufficiency: number;
  observedEventCount: number;
}

export interface IntentResult extends IntentPrediction {
  trace: IntentTrace;
}

/**
 * @param scenario     Demo persona; supplies historical pseudo-counts.
 * @param userEvents   Observed events, MOST RECENT FIRST (as stored by AppContext).
 * @param activeTeamOverride Explicit team context, e.g. the shopper is on a team page.
 */
export function predictIntent(
  scenario: Scenario,
  userEvents: UserEvent[],
  activeTeamOverride?: TeamId | null
): IntentResult {
  const startedAt = performance.now();
  const isAnonymous = scenario.profileType === 'Anonymous';

  // --- 1. Priors ------------------------------------------------------------
  // Historical favourites act as Bayesian pseudo-counts. An anonymous visitor
  // has none, so their posterior is driven entirely by the current session.
  const teamEvidence: Record<TeamId, number> = {} as Record<TeamId, number>;
  const teamPriorTerm: Record<TeamId, number> = {} as Record<TeamId, number>;
  for (const t of TEAM_IDS) {
    teamEvidence[t] = 0;
    teamPriorTerm[t] = Math.log(teamPrior(t));
  }

  // Total evidence mass the model has to work with. Drives the sufficiency
  // discount in step 4, so everything that genuinely informs the posterior has
  // to be counted here - including history, not just live clicks.
  let effectiveEvidence = 0;

  if (!isAnonymous) {
    // Prior orders are strong, durable evidence - but they are history, so they
    // enter at a fixed discount rather than competing with live clicks.
    const historicalWeight = Math.min(3.0, Math.log1p(scenario.historicalOrdersCount) * 1.1);
    scenario.favTeams.forEach((team, rank) => {
      if (teamEvidence[team] === undefined) return;
      const w = historicalWeight * Math.pow(0.6, rank);
      teamEvidence[team] += w;
      effectiveEvidence += w;
    });
  }

  const deptEvidence: Record<Department, number> = {} as Record<Department, number>;
  const deptPriorTerm: Record<Department, number> = {} as Record<Department, number>;
  for (const d of DEPARTMENT_IDS) {
    deptEvidence[d] = 0;
    deptPriorTerm[d] = Math.log(departmentPrior(d));
  }

  // --- 2. Recency-weighted evidence from the event sequence -----------------
  const eventWeights: IntentTrace['eventWeights'] = [];

  userEvents.forEach((event, ageRank) => {
    const typeWeight = EVENT_WEIGHTS[event.pageType] ?? 0.5;
    const weight = Math.exp(-TEAM_RECENCY_LAMBDA * ageRank) * typeWeight;
    const deptWeight = Math.exp(-DEPT_RECENCY_LAMBDA * ageRank) * typeWeight;

    // The trace reports the team weight, which is what drives the headline
    // team distribution shown in the intelligence panel.
    eventWeights.push({ event, weight, ageRank });
    effectiveEvidence += weight;

    if (event.team && teamEvidence[event.team] !== undefined) teamEvidence[event.team] += weight;
    if (event.department && deptEvidence[event.department] !== undefined) {
      deptEvidence[event.department] += deptWeight;
    }
  });

  // Explicit page context is strong but not absolute - it should bias the
  // ranking without erasing a shopper's established history.
  if (activeTeamOverride && teamEvidence[activeTeamOverride] !== undefined) {
    teamEvidence[activeTeamOverride] += 1.8;
    effectiveEvidence += 1.8;
  }

  // --- 3. Logits and softmax ------------------------------------------------
  // Evidence enters as a share of the total, bounded by EVIDENCE_SCALE, so the
  // logits stay on the same scale as the log-prior no matter how long the
  // shopper's history is. See the constant's comment for why this matters.
  //
  // The share alone is not enough, though. A share is a purity measure: one
  // click on a Cowboys jersey is 100% Cowboys, and so is a hundred of them.
  // Left unscaled, the model leaps to a 99% call on its first observation,
  // which is both wrong and the single most obvious tell that a demo is not
  // running a real model. So the share is damped by the same sufficiency term
  // that already gates confidence - `1 - exp(-evidence / K)` - which starts
  // near zero and approaches one as evidence accumulates. The distribution and
  // the confidence number then move together instead of disagreeing.
  const sufficiency = 1 - Math.exp(-effectiveEvidence / SUFFICIENCY_K);
  const evidenceScale = EVIDENCE_SCALE * sufficiency;

  const teamEvidenceTotal = TEAM_IDS.reduce((sum, t) => sum + teamEvidence[t], 0);
  const teamShare = (t: TeamId) =>
    teamEvidenceTotal > 0 ? (teamEvidence[t] / teamEvidenceTotal) * evidenceScale : 0;

  const teamLogitsRaw = TEAM_IDS.map((team) => ({
    team,
    priorTerm: teamPriorTerm[team],
    evidenceTerm: teamShare(team),
    logit: teamPriorTerm[team] + teamShare(team),
  }));

  const teamProbs = softmax(
    teamLogitsRaw.map((t) => t.logit),
    TEMPERATURE
  );

  const teams = TEAM_IDS.map((team, i) => ({
    team,
    probability: Number(teamProbs[i].toFixed(3)),
  })).sort((a, b) => b.probability - a.probability);

  const deptEvidenceTotal = DEPARTMENT_IDS.reduce((sum, d) => sum + deptEvidence[d], 0);
  const deptLogits = DEPARTMENT_IDS.map(
    (d) =>
      deptPriorTerm[d] +
      (deptEvidenceTotal > 0 ? (deptEvidence[d] / deptEvidenceTotal) * evidenceScale : 0)
  );
  const deptProbs = softmax(deptLogits, TEMPERATURE);
  const departments = DEPARTMENT_IDS.map((department, i) => ({
    department,
    probability: Number(deptProbs[i].toFixed(3)),
  })).sort((a, b) => b.probability - a.probability);

  // --- 4. Confidence: entropy discounted by evidence sufficiency ------------
  const entropy = normalisedEntropy(teamProbs);

  // Confidence is the probability mass on the predicted team, discounted by how
  // much evidence produced it. Both halves matter: a 90% call from one click is
  // not the same claim as a 90% call from a decade of orders, and only the
  // second should be allowed to reshape the storefront.
  //
  // This deliberately reads the top of the distribution rather than its entropy.
  // Entropy answers "is this shopper focused overall", which is a different -
  // and for an activation gate, wrong - question: a shopper split cleanly
  // between two clubs has high entropy but the leading call may still be sound
  // enough to merchandise against. Entropy is kept below to explain a
  // low-confidence result, where naming the spread is genuinely informative.
  const topProbability = teamProbs.length > 0 ? Math.max(...teamProbs) : 0;
  const confidence = Math.max(0.02, Math.min(0.99, topProbability * sufficiency));

  const isFallback = confidence < CONFIDENCE_THRESHOLD;
  let fallbackReason: string | undefined;
  if (isFallback) {
    // Confidence is the product of two terms, so the honest explanation names
    // whichever one is actually binding rather than guessing at a narrative.
    const certaintyTerm = topProbability;
    const belowThreshold = `Confidence ${(confidence * 100).toFixed(0)}% is below the ${CONFIDENCE_THRESHOLD * 100}% activation threshold.`;

    if (isAnonymous && effectiveEvidence < 1.5) {
      fallbackReason =
        `Anonymous visitor with ${userEvents.length} in-session event(s) and no customer history, so the team distribution stays close to the popularity prior. ` +
        `${belowThreshold} Serving contextual and popularity-based merchandising.`;
    } else if (certaintyTerm <= sufficiency) {
      fallbackReason =
        `Conflicting interest signals: the team distribution is spread across ${teams.filter((t) => t.probability > 0.05).length} clubs ` +
        `(normalised entropy ${entropy.toFixed(2)} of a possible 1.00). ${belowThreshold}`;
    } else {
      fallbackReason =
        `Insufficient evidence - total effective weight ${effectiveEvidence.toFixed(2)} across ${userEvents.length} event(s) ` +
        `and ${scenario.historicalOrdersCount} prior order(s). ${belowThreshold}`;
    }
  }

  // --- 5. Downstream commercial estimates -----------------------------------
  // Conversion propensity rises with both certainty and depth of engagement.
  const cartSignal = userEvents.some((e) => e.pageType === 'Cart') ? 0.12 : 0;
  const conversionPropensity = Number(
    Math.min(0.95, Math.max(0.03, 0.06 + confidence * 0.45 + Math.min(0.25, effectiveEvidence * 0.04) + cartSignal)).toFixed(3)
  );

  // Expected value blends propensity with the price level of the predicted
  // department, so a jersey-intent shopper is worth more than a hat-intent one.
  const topDeptCfg = DEPARTMENTS.find((d) => d.id === departments[0]?.department);
  const expectedBasket = topDeptCfg ? Math.exp(topDeptCfg.priceMu) * 1.5 : 90;
  const expectedSessionValue = Number((conversionPropensity * expectedBasket).toFixed(2));

  // --- 6. Filter prioritisation follows the predicted department ------------
  const topDept = departments[0]?.department;
  const topFilters = filtersForDepartment(topDept, isFallback);

  return {
    teams,
    departments,
    conversionPropensity,
    expectedSessionValue,
    topFilters,
    confidence: Number(confidence.toFixed(3)),
    isFallback,
    fallbackReason,
    inferenceTimeMs: Number((performance.now() - startedAt).toFixed(2)),
    trace: {
      source: 'events',
      eventWeights,
      teamLogits: teamLogitsRaw.sort((a, b) => b.logit - a.logit),
      temperature: TEMPERATURE,
      entropy: Number(entropy.toFixed(3)),
      sufficiency: Number(sufficiency.toFixed(3)),
      observedEventCount: userEvents.length,
    },
  };
}

/** Filter ordering by predicted department. Falls back to a generic ladder. */
function filtersForDepartment(dept: Department | undefined, isFallback: boolean): string[] {
  if (isFallback || !dept) return ['Team', 'Department', 'Price', 'Size', 'Brand'];

  switch (dept) {
    case 'Jerseys':
      return ['Player', 'Size', 'Jersey Type', 'Gender/Age', 'Price'];
    case 'Hats':
      return ['Hat Style', 'Team', 'Size', 'Brand', 'Price'];
    case 'Kids':
      return ['Kids Age Segment', 'Size', 'Team', 'Department', 'Price'];
    case 'Hoodies':
      return ['Size', 'Player', 'Style', 'Team', 'Price'];
    case 'Collectibles':
      return ['Player', 'Authenticity', 'Display Type', 'Team', 'Price'];
    case 'T-shirts':
      return ['Size', 'Gender/Age', 'Graphic Style', 'Team', 'Price'];
    case 'Accessories':
      return ['Accessory Type', 'Team', 'Price', 'Brand', 'Colour'];
    default:
      return ['Department', 'Team', 'Price', 'Size', 'Brand'];
  }
}

/* ------------------------------------------------- the profile-fed path -- */

/**
 * The same prediction, read from an already-folded profile.
 *
 * This exists alongside `predictIntent` rather than replacing it, and will keep
 * existing until every caller has moved. `evaluate.ts` and the published
 * benchmark numbers run on the event path; changing that in the same commit
 * that introduces the profile would make any movement in the metrics
 * uninterpretable - you would not know whether the profile is better or merely
 * different.
 *
 * WHAT IS AND IS NOT SHARED. The posteriors come straight off the profile,
 * which computed them with the same log-prior-plus-evidence-share form this
 * file uses, from the same priors and the same decay constants (all four are
 * imported above, not copied). What differs is the confidence rule: the profile
 * discounts by the leader's margin over the runner-up, this file does not. That
 * difference is deliberate and is the reason for running the two side by side -
 * the margin-aware gate should refuse to activate on split shoppers that the
 * old gate waved through, and the demo needs to be able to show both answers.
 */
export function predictIntentFromProfile(
  profile: VisitorProfile,
  activeTeamOverride?: TeamId | null
): IntentResult {
  const startedAt = performance.now();

  const teamDist = profile.affinities.team;
  const deptDist = profile.affinities.department;

  // An explicit page context is applied here rather than folded into the
  // profile, because it is not evidence about the shopper - it is where they
  // happen to be standing. Writing it into a durable profile would make a
  // single visit to a team page look like a lasting preference.
  let teamPosterior = { ...teamDist.posterior };
  if (activeTeamOverride && teamPosterior[activeTeamOverride] !== undefined) {
    const boosted = TEAM_IDS.map((t) => ({
      t,
      v: teamPosterior[t] * (t === activeTeamOverride ? Math.exp(1.8 / TEMPERATURE) : 1),
    }));
    const total = boosted.reduce((sum, b) => sum + b.v, 0);
    teamPosterior = Object.fromEntries(boosted.map((b) => [b.t, b.v / total])) as Record<
      TeamId,
      number
    >;
  }

  const teams = TEAM_IDS.map((team) => ({
    team,
    probability: Number(teamPosterior[team].toFixed(3)),
  })).sort((a, b) => b.probability - a.probability);

  const departments = DEPARTMENT_IDS.map((department) => ({
    department,
    probability: Number(deptDist.posterior[department].toFixed(3)),
  })).sort((a, b) => b.probability - a.probability);

  const teamProbs = teams.map((t) => t.probability);
  const entropy = normalisedEntropy(teamProbs);
  const evidenceTotal = teamDist.confidence.evidenceCount;
  const sufficiency = 1 - Math.exp(-evidenceTotal / SUFFICIENCY_K);

  // The profile already computed this, margin discount and all. Recomputing it
  // here from the posterior would be a second opinion nobody asked for, and the
  // two would drift.
  const topProbability = teams[0]?.probability ?? 0;
  const confidence = activeTeamOverride
    ? Math.max(0.02, Math.min(0.99, topProbability * sufficiency))
    : teamDist.confidence.value;

  const isFallback = confidence < CONFIDENCE_THRESHOLD;
  let fallbackReason: string | undefined;
  if (isFallback) {
    const belowThreshold = `Confidence ${(confidence * 100).toFixed(0)}% is below the ${CONFIDENCE_THRESHOLD * 100}% activation threshold.`;
    const marginPct = (teamDist.margin * 100).toFixed(0);

    if (profile.identityState === 'anonymous' && evidenceTotal < 1.5) {
      fallbackReason =
        `Anonymous visitor: ${profile.observedEvents} observed event(s) and no customer history, so the team distribution stays close to the popularity prior. ` +
        `${belowThreshold} Serving contextual and popularity-based merchandising.`;
    } else if (teamDist.margin < 0.15) {
      // The case the old gate could not name. Say it plainly.
      fallbackReason =
        `Split interest: ${teamDist.top} leads ${teamDist.runnerUp} by only ${marginPct} points ` +
        `(normalised entropy ${entropy.toFixed(2)} of a possible 1.00), so the leading call is not clear enough to merchandise against. ${belowThreshold}`;
    } else {
      fallbackReason =
        `Insufficient evidence - total effective weight ${evidenceTotal.toFixed(2)} across ${profile.observedEvents} observed event(s) ` +
        `and ${profile.state.lifetimeOrders} prior order(s). ${belowThreshold}`;
    }
  }

  const cartSignal = 0;
  const conversionPropensity = Number(
    Math.min(
      0.95,
      Math.max(0.03, 0.06 + confidence * 0.45 + Math.min(0.25, evidenceTotal * 0.04) + cartSignal)
    ).toFixed(3)
  );

  const topDeptCfg = DEPARTMENTS.find((d) => d.id === departments[0]?.department);
  const expectedBasket = topDeptCfg ? Math.exp(topDeptCfg.priceMu) * 1.5 : 90;
  const expectedSessionValue = Number((conversionPropensity * expectedBasket).toFixed(2));

  const topFilters = filtersForDepartment(departments[0]?.department, isFallback);

  return {
    teams,
    departments,
    conversionPropensity,
    expectedSessionValue,
    topFilters,
    confidence: Number(confidence.toFixed(3)),
    isFallback,
    fallbackReason,
    inferenceTimeMs: Number((performance.now() - startedAt).toFixed(2)),
    trace: {
      source: 'profile',
      // Nothing to report: the per-event weights were consumed by the fold. The
      // drivers below are what survived of them.
      eventWeights: [],
      drivers: [
        ...teamDist.drivers.map((d) => ({ field: 'team', label: d.label, contribution: d.contribution })),
        ...deptDist.drivers.map((d) => ({ field: 'department', label: d.label, contribution: d.contribution })),
      ],
      teamLogits: TEAM_IDS.map((team) => {
        const priorTerm = Math.log(teamPrior(team));
        return {
          team,
          priorTerm,
          evidenceTerm: Math.log(Math.max(1e-6, teamPosterior[team])) - priorTerm,
          logit: Math.log(Math.max(1e-6, teamPosterior[team])),
        };
      }).sort((a, b) => b.logit - a.logit),
      temperature: TEMPERATURE,
      entropy: Number(entropy.toFixed(3)),
      sufficiency: Number(sufficiency.toFixed(3)),
      observedEventCount: profile.observedEvents,
    },
  };
}
