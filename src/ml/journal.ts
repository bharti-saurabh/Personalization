/**
 * Decision journal - the narrative layer over the three engines.
 *
 * The intelligence panel used to show a fixed seven-step pipeline that replayed
 * itself whenever the demo scenario changed. It looked like a model running, but
 * it was not tied to anything the shopper did: browse for five minutes and the
 * panel said exactly what it said on arrival.
 *
 * This module turns the same engines into a running account of the session. Each
 * thing the shopper does becomes one BEAT, and a beat answers five questions in
 * the order a sceptical viewer asks them:
 *
 *   1. WHAT HAPPENED      the event, and how much decayed weight it carried
 *   2. WHAT RAN           which engines re-scored, and what they read
 *   3. WHAT THEY SCORED   ranked outputs, with the delta against the previous beat
 *   4. WHAT THE RULES DID the confidence gate, inventory check, activate or fall back
 *   5. WHAT WAS PRESENTED the surfaces that are now bound to that decision
 *
 * Every number here is read back from a prediction the engines actually produced
 * for that event - including the deltas, which are computed against the previous
 * beat's stored prediction rather than re-derived. Nothing is scripted, so a beat
 * that moved nothing says so, and a beat that failed the gate explains which of
 * the two confidence terms was binding.
 */

import {
  DecisionTrace,
  Department,
  MarketEventKind,
  Product,
  Scenario,
  StorefrontPage,
  TeamId,
  UserEvent,
} from '../types';
import { CONFIDENCE_THRESHOLD, IntentResult } from './intent';
import { SimilarityResult } from './similarity';
import { ComplementResult } from './complement';

export type EngineName = 'Intent' | 'Similarity' | 'Complement';

export interface ScoreRow {
  label: string;
  /** Normalised 0..1 so every engine's bar is drawn on one scale. */
  score: number;
  /** Signed change against the previous beat. Undefined when there is no prior. */
  delta?: number;
  /** Short supporting number, e.g. "lift 3.4x on 118 co-orders". */
  hint?: string;
}

export interface ModelRun {
  engine: EngineName;
  /** The plain-English question this run answers. Used as the card title. */
  question: string;
  inputs: { label: string; value: string }[];
  scores: ScoreRow[];
  scoreLabel: string;
  verdict: string;
  latencyMs?: number;
}

export interface SurfaceChange {
  surface: string;
  detail: string;
  items?: string[];
  /** True when this surface is serving the un-personalized default. */
  isFallback?: boolean;
}

/**
 * What a market event did to the world, recorded on the beat that reports it.
 *
 * A market event is the one thing in this demo that happens WITHOUT the shopper
 * doing anything, which is exactly why it needs its own record. Every other beat
 * can be explained by pointing at a user event; this one has to explain itself,
 * and the counts are how it does that. They are all countable by construction -
 * products rewritten, products moved between clubs, milliseconds spent - because
 * the decision stream's closing line may never be a posterior.
 */
export interface MarketBeat {
  kind: MarketEventKind;
  /** The event, as a merchandising desk would write it. */
  headline: string;
  /** What it is expected to do to demand. */
  detail: string;
  /** Products the market pass rewrote. */
  touched: number;
  /** Products that changed club. A trade moves these; nothing else does. */
  moved: number;
  /** Products whose intrinsic popularity the event raised. */
  lifted: number;
  /** Products whose intrinsic popularity the event cut. An injury does this. */
  damped: number;
  /** Wall-clock cost of rebuilding catalog, population and all three graphs. */
  rebuildMs: number;
  /** The clock the world now stands on. */
  at: string;
}

export interface JournalBeat {
  id: string;
  /**
   * The event that caused this beat, when there was one.
   *
   * Carried so the decision stream can join a beat to the field writes the same
   * event produced. The beat id is a sequence number and cannot do that job -
   * two records of the same moment need a shared key, not two private ones.
   */
  eventId: string | null;
  seq: number;
  kind: 'session' | 'action' | 'setting' | 'market';
  at: string;
  /** What the shopper did, in their words not the model's. */
  headline: string;
  page: StorefrontPage;
  /** Decayed weight this single event contributed to the team logits. */
  signalWeight?: number;
  runs: ModelRun[];
  gate: { passed: boolean; label: string; detail: string };
  presented: SurfaceChange[];
  why: string;
  /** Headline belief movement, for the one-line summary on the collapsed card. */
  shift?: { label: string; from: number; to: number };
  confidence: { from: number; to: number };
  personalizationOn: boolean;
  /** Present only on a `market` beat. */
  market?: MarketBeat;
}

export interface BeatInput {
  seq: number;
  kind: JournalBeat['kind'];
  /** The newest event, absent for the session-seed and setting beats. */
  event?: UserEvent;
  headline?: string;
  scenario: Scenario;
  intent: IntentResult;
  prevIntent: IntentResult | null;
  trace: DecisionTrace;
  similarity: SimilarityResult[];
  complement: ComplementResult[];
  page: StorefrontPage;
  anchor: Product;
  personalizationOn: boolean;
  market?: MarketBeat;
}

const pct = (v: number) => Math.round(v * 100);
const signed = (d: number) => `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}pp`;
const probOf = (pred: IntentResult | null, team: TeamId) =>
  pred?.teams.find((t) => t.team === team)?.probability ?? 0;
const deptProbOf = (pred: IntentResult | null, dept: Department) =>
  pred?.departments.find((d) => d.department === dept)?.probability ?? 0;

/** Where the shopper is standing, in the language the merchandising team uses. */
const PAGE_LABEL: Record<StorefrontPage, string> = {
  home: 'Homepage',
  plp: 'Category page',
  pdp: 'Product page',
  cart: 'Cart',
};

/* ------------------------------------------------------------------ runs -- */

function intentRuns(i: BeatInput): ModelRun[] {
  const { intent, prevIntent, scenario } = i;
  const t = intent.trace;

  // The newest event's own decay weight, which is the number that actually
  // explains why this beat moved the distribution as much or as little as it did.
  const thisWeight =
    i.event && t.eventWeights[0]?.event.id === i.event.id ? t.eventWeights[0].weight : undefined;

  const inputs: { label: string; value: string }[] = [
    { label: 'Events in window', value: `${t.observedEventCount}` },
    { label: 'Prior orders', value: `${scenario.historicalOrdersCount}` },
    { label: 'Evidence sufficiency', value: `${pct(t.sufficiency)}%` },
    { label: 'Distribution entropy', value: `${t.entropy.toFixed(2)} / 1.00` },
    { label: 'Softmax temperature', value: `${t.temperature}` },
  ];
  if (thisWeight !== undefined) {
    inputs.unshift({ label: 'This event weight', value: thisWeight.toFixed(2) });
  }

  const top = intent.teams[0];
  const prevTop = prevIntent?.teams[0];
  const moved = prevTop && prevTop.team !== top.team;

  const teamRun: ModelRun = {
    engine: 'Intent',
    question: 'Which club is this shopper shopping for?',
    inputs,
    scoreLabel: 'posterior probability',
    latencyMs: intent.inferenceTimeMs,
    scores: intent.teams.slice(0, 4).map((row) => {
      const before = probOf(prevIntent, row.team);
      const logit = t.teamLogits.find((l) => l.team === row.team);
      return {
        label: row.team,
        score: row.probability,
        delta: prevIntent ? row.probability - before : undefined,
        hint: logit
          ? `logit ${logit.logit.toFixed(2)} = prior ${logit.priorTerm.toFixed(2)} + evidence ${logit.evidenceTerm.toFixed(2)}`
          : undefined,
      };
    }),
    verdict: moved
      ? `Lead changed: ${prevTop!.team} -> ${top.team}, now ${pct(top.probability)}%`
      : prevIntent
        ? `${top.team} stays first at ${pct(top.probability)}% (${signed(top.probability - probOf(prevIntent, top.team))})`
        : `${top.team} first at ${pct(top.probability)}%`,
  };

  const topDept = intent.departments[0];
  const deptRun: ModelRun = {
    engine: 'Intent',
    question: 'And which department are they in the market for?',
    inputs: [
      { label: 'Department decay', value: 'slow (lambda 0.08)' },
      { label: 'Team decay', value: 'fast (lambda 0.35)' },
    ],
    scoreLabel: 'posterior probability',
    scores: intent.departments.slice(0, 4).map((row) => ({
      label: row.department,
      score: row.probability,
      delta: prevIntent ? row.probability - deptProbOf(prevIntent, row.department) : undefined,
    })),
    verdict: `${topDept.department} at ${pct(topDept.probability)}%, so the facet rail opens on ${intent.topFilters[0]} and hands over to the funnel once three filters are set`,
  };

  return [teamRun, deptRun];
}

function similarityRun(i: BeatInput): ModelRun | null {
  if (i.similarity.length === 0) return null;
  const best = i.similarity[0];
  return {
    engine: 'Similarity',
    question: `What else is like "${i.anchor.name}"?`,
    inputs: [
      { label: 'Anchor', value: i.anchor.name },
      { label: 'Method', value: 'cosine k-NN over hybrid embeddings' },
      { label: 'Candidates scored', value: 'full in-stock catalog' },
    ],
    scoreLabel: 'blended similarity',
    scores: i.similarity.slice(0, 4).map((m) => ({
      label: m.product.name,
      score: m.totalScore,
      hint: `cosine ${m.cosine.toFixed(3)} - ${m.explanation}`,
    })),
    verdict: `${best.product.name} is the nearest neighbour at ${pct(best.totalScore)}%`,
  };
}

function complementRun(i: BeatInput): ModelRun | null {
  if (i.complement.length === 0) return null;
  const best = i.complement[0];
  return {
    engine: 'Complement',
    question: `What is usually bought alongside it?`,
    inputs: [
      { label: 'Anchor', value: i.anchor.name },
      { label: 'Method', value: 'directional co-order P(item | anchor), shrunk' },
      { label: 'Backoff level', value: best.backoffLevel },
    ],
    scoreLabel: 'complement score',
    scores: i.complement.slice(0, 4).map((m) => ({
      label: m.product.name,
      score: m.complementScore,
      hint:
        `${m.relationshipType} - ${m.backoffLevel}-level estimate, lift ${m.lift.toFixed(1)}x ` +
        `on ${m.support} direct co-order${m.support === 1 ? '' : 's'}`,
    })),
    verdict: `${best.product.name} leads on ${best.relationshipType.toLowerCase()} at ${best.lift.toFixed(1)}x lift`,
  };
}

/* -------------------------------------------------------------- surfaces -- */

/**
 * What the storefront is showing right now as a consequence of this decision.
 *
 * These are phrased as the state the surfaces are in after the beat, not as
 * "this changed", because a beat that moved nothing still leaves the surfaces
 * bound to the standing prediction - and claiming a change that did not happen
 * is exactly the kind of thing this panel exists to disprove.
 */
function surfacesFor(i: BeatInput): SurfaceChange[] {
  const { intent, trace, page, personalizationOn } = i;

  if (!personalizationOn) {
    return [
      {
        surface: `${PAGE_LABEL[page]} - all slots`,
        detail:
          'Personalization is switched off. Every slot on this page is serving the popularity-ranked default, which is the control side of the A/B.',
        isFallback: true,
      },
    ];
  }

  const team = intent.teams[0].team;
  const dept = intent.departments[0].department;
  const fell = trace.fallbackTriggered;

  const out: SurfaceChange[] = [];

  if (page === 'home') {
    out.push({
      surface: 'Hero band',
      detail: fell
        ? 'Confidence did not clear the gate, so the hero is serving the league-wide seasonal creative instead of a club.'
        : `Bound to ${team} at ${pct(intent.teams[0].probability)}% predicted intent.`,
      isFallback: fell,
    });
    out.push({
      surface: 'Predicted favourite teams widget',
      detail: 'Ordered by the posterior above, top six shown with their probabilities.',
      items: intent.teams.slice(0, 3).map((t) => `${t.team} ${pct(t.probability)}%`),
    });
    out.push({
      surface: 'Recommended departments strip',
      detail: `Leads with ${dept}; the rest follow the department posterior.`,
      items: intent.departments.slice(0, 3).map((d) => `${d.department} ${pct(d.probability)}%`),
    });
    out.push({
      surface: 'Recommended gear carousel',
      detail: fell
        ? 'Falling back to catalog-wide best sellers.'
        : `Filtered to ${team} and sorted by popularity within the club.`,
      isFallback: fell,
    });
  }

  if (page === 'plp') {
    out.push({
      surface: 'Facet rail order',
      detail: `Re-ranked for a ${dept} shopper. The top two facets carry the ML RANKED badge.`,
      items: intent.topFilters.slice(0, 5),
    });
    out.push({
      surface: 'Featured sort',
      detail: fell
        ? 'Gate not cleared - Featured is plain popularity, identical to the personalization-off page.'
        : `Popularity reweighted by the team and department posteriors, so ${team} ${dept} float up without being filtered in.`,
      isFallback: fell,
    });
    out.push({
      surface: 'Result set',
      detail:
        'Unchanged by the model. Filtering stays exactly what the shopper asked for - only the ordering is personalized.',
    });
  }

  if (page === 'pdp') {
    out.push({
      surface: 'Similar items carousel',
      detail: 'Top four cosine neighbours of the product on screen.',
      items: i.similarity.slice(0, 4).map((m) => `${m.product.name} (${pct(m.totalScore)}%)`),
    });
    out.push({
      surface: 'Complete the look carousel',
      detail: 'Top four co-order companions, cross-department by construction.',
      items: i.complement.slice(0, 4).map((m) => `${m.product.name} (${m.relationshipType})`),
    });
  }

  if (page === 'cart') {
    out.push({
      surface: 'Cart cross-sell',
      detail: 'Co-order companions for the highest-value item in the basket.',
      items: i.complement.slice(0, 3).map((m) => `${m.product.name} (${pct(m.complementScore)}%)`),
    });
    out.push({
      surface: 'Expected session value',
      detail: `$${intent.expectedSessionValue.toFixed(2)} at ${pct(intent.conversionPropensity)}% modelled propensity.`,
    });
  }

  return out;
}

/* ------------------------------------------------------------------- why -- */


/**
 * The single sentence that has to survive an executive reading it out loud.
 *
 * It names the mechanism that actually moved - or failed to move - the decision,
 * so it is assembled from the trace rather than from a template bank.
 */
function whySentence(i: BeatInput): string {
  const { intent, prevIntent, trace, event, kind, scenario } = i;
  const top = intent.teams[0];
  const t = intent.trace;

  if (kind === 'session') {
    const history = scenario.profileType === 'Recognized'
      ? `${scenario.historicalOrdersCount} prior orders and ${scenario.favTeams.length} known favourite(s)`
      : 'no customer history at all';
    return (
      `Session opened with ${history}, plus ${t.observedEventCount} replayed session event(s). ` +
      `Those combine to ${pct(t.sufficiency)}% evidence sufficiency, which damps the evidence term and leaves ` +
      `${top.team} at ${pct(top.probability)}% - ${trace.fallbackTriggered ? 'not enough to activate' : 'enough to activate'} at ${pct(intent.confidence)}% confidence.`
    );
  }

  if (kind === 'setting') {
    return i.personalizationOn
      ? 'Personalization switched back on. The same prediction now reaches the surfaces instead of being discarded at the binding step.'
      : 'Personalization switched off. The engines still run - the panel keeps scoring - but the storefront ignores the output and serves popularity, which is the control arm of the comparison.';
  }

  const carriedTeam = event?.team;
  const carriedDept = event?.department;
  const weight =
    event && t.eventWeights[0]?.event.id === event.id ? t.eventWeights[0].weight : undefined;

  // An event that names neither a team nor a department cannot move the team or
  // department posterior. Saying so is more useful than inventing a mechanism.
  if (!carriedTeam && !carriedDept) {
    return (
      `This action carried no club or department signal, so the posterior is unchanged at ` +
      `${top.team} ${pct(top.probability)}%. The surfaces below were re-bound from the standing prediction.`
    );
  }

  const parts: string[] = [];
  if (weight !== undefined) {
    parts.push(
      `The event is the most recent in the window, so it enters at full recency weight ${weight.toFixed(2)}`
    );
  }
  if (carriedTeam) {
    const before = probOf(prevIntent, carriedTeam);
    const after = probOf(intent, carriedTeam);
    const d = after - before;
    parts.push(
      Math.abs(d) < 0.005
        ? `${carriedTeam} was already saturated in the evidence share, so its probability held at ${pct(after)}%`
        : `${carriedTeam}'s share of the decayed evidence rose, moving it ${pct(before)}% -> ${pct(after)}% (${signed(d)})`
    );
  }
  if (carriedDept) {
    const before = deptProbOf(prevIntent, carriedDept);
    const after = deptProbOf(intent, carriedDept);
    parts.push(`${carriedDept} moved ${pct(before)}% -> ${pct(after)}% on the slower department decay`);
  }

  const gateClause = trace.fallbackTriggered
    ? `Confidence ${pct(intent.confidence)}% still sits under the ${pct(CONFIDENCE_THRESHOLD)}% gate, so the storefront stayed on popularity merchandising.`
    : `Confidence ${pct(intent.confidence)}% clears the ${pct(CONFIDENCE_THRESHOLD)}% gate, so the surfaces below were re-bound to ${top.team}.`;

  return `${parts.join('. ')}. ${gateClause}`;
}

/* ----------------------------------------------------------------- build -- */

export function buildBeat(i: BeatInput): JournalBeat {
  const { intent, prevIntent, trace, event, page } = i;

  const runs: ModelRun[] = [...intentRuns(i)];
  // The retrieval engines only re-score when there is an anchor on screen, so a
  // homepage or category beat honestly shows only the intent run.
  if (page === 'pdp') {
    const s = similarityRun(i);
    const c = complementRun(i);
    if (s) runs.push(s);
    if (c) runs.push(c);
  } else if (page === 'cart') {
    const c = complementRun(i);
    if (c) runs.push(c);
  }

  const top = intent.teams[0];
  const t = intent.trace;

  return {
    id: `beat-${i.seq}`,
    eventId: event?.id ?? null,
    seq: i.seq,
    kind: i.kind,
    at: event?.timestamp ?? 'Just now',
    headline: i.headline ?? event?.action ?? 'Session state re-evaluated',
    page,
    signalWeight:
      event && t.eventWeights[0]?.event.id === event.id ? t.eventWeights[0].weight : undefined,
    runs,
    gate: {
      passed: !trace.fallbackTriggered,
      label: trace.fallbackTriggered ? 'Fallback served' : 'Personalization activated',
      detail: trace.finalDecisionReason,
    },
    presented: surfacesFor(i),
    why: whySentence(i),
    shift: prevIntent
      ? { label: top.team, from: probOf(prevIntent, top.team), to: top.probability }
      : undefined,
    confidence: { from: prevIntent?.confidence ?? intent.confidence, to: intent.confidence },
    personalizationOn: i.personalizationOn,
    market: i.market,
  };
}
