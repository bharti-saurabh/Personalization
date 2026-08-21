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
  League,
  Scenario,
  TeamId,
  UserEvent,
} from '../types';
import { normalisedEntropy, softmax } from '../sim/rng';
import {
  DEPARTMENTS,
  DEPARTMENT_IDS,
  LEAGUE_SEASONALITY,
  SIM_MONTH,
  TEAM_BY_ID,
  TEAM_IDS,
} from '../sim/taxonomy';

/** Exponential decay constant over event age. ~0.35 gives a half-life of 2 events. */
const RECENCY_LAMBDA = 0.35;

/**
 * Departments decay far more slowly than teams, because they are a different
 * kind of preference.
 *
 * Which club is front of mind is volatile - it swings with the fixture list, a
 * result, a campaign email - so the last few clicks really are the best guide.
 * What a shopper *buys* is a stable trait: a jersey buyer stays a jersey buyer
 * across visits. Applying the team decay to departments throws away most of the
 * history that carries the signal, and the offline harness catches it: at the
 * team rate, department prediction scored below a plain popularity baseline.
 */
const DEPT_RECENCY_LAMBDA = 0.08;
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
  /** Per-event decay weight actually applied, most recent first. */
  eventWeights: { event: UserEvent; weight: number; ageRank: number }[];
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

/** Popularity prior: national fan-base size weighted by how in-season the league is. */
function teamPrior(team: TeamId): number {
  const cfg = TEAM_BY_ID[team];
  const seasonal = LEAGUE_SEASONALITY[cfg.league as League][SIM_MONTH];
  return Math.max(0.01, cfg.marketSize * (0.45 + 0.55 * seasonal));
}

function departmentPrior(dept: Department): number {
  const cfg = DEPARTMENTS.find((d) => d.id === dept);
  return Math.max(0.01, cfg?.assortmentWeight ?? 0.05);
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
    const weight = Math.exp(-RECENCY_LAMBDA * ageRank) * typeWeight;
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
  const teamEvidenceTotal = TEAM_IDS.reduce((sum, t) => sum + teamEvidence[t], 0);
  const teamShare = (t: TeamId) =>
    teamEvidenceTotal > 0 ? (teamEvidence[t] / teamEvidenceTotal) * EVIDENCE_SCALE : 0;

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
      (deptEvidenceTotal > 0 ? (deptEvidence[d] / deptEvidenceTotal) * EVIDENCE_SCALE : 0)
  );
  const deptProbs = softmax(deptLogits, TEMPERATURE);
  const departments = DEPARTMENT_IDS.map((department, i) => ({
    department,
    probability: Number(deptProbs[i].toFixed(3)),
  })).sort((a, b) => b.probability - a.probability);

  // --- 4. Confidence: entropy discounted by evidence sufficiency ------------
  const entropy = normalisedEntropy(teamProbs);
  const sufficiency = 1 - Math.exp(-effectiveEvidence / SUFFICIENCY_K);
  const confidence = Math.max(0.02, Math.min(0.99, (1 - entropy) * sufficiency));

  const isFallback = confidence < CONFIDENCE_THRESHOLD;
  let fallbackReason: string | undefined;
  if (isFallback) {
    // Confidence is the product of two terms, so the honest explanation names
    // whichever one is actually binding rather than guessing at a narrative.
    const certaintyTerm = 1 - entropy;
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
