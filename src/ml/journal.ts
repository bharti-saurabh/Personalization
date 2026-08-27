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
 *   4. WHAT THE RULES DID the confidence gate, the suppression gate, activate or
 *                         fall back - and, when a slot was refused, which named
 *                         rule refused it
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
import type { SearchResult } from './query';
import type { SuppressionResult, SuppressionRule } from './suppression';
import { RULE_LABEL, refusalSentence } from './suppression';

export type EngineName = 'Intent' | 'Similarity' | 'Complement' | 'Query';

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

/**
 * What the gate refused on this beat, and under which rule.
 *
 * Recommendation is easy to show: it is the thing on the screen. Refusal leaves
 * no trace at all unless something records it, which is how a store ends up
 * unable to answer "why did you never show me that". This is that record, and it
 * is deliberately shaped like the presented surfaces above rather than like a
 * log line - the panel renders the two side by side, and they have to read as
 * two halves of one decision.
 *
 * A rule is NAMED, not summarised. "3 items withheld" is a statistic; "Rival
 * club - NFC East, the oldest grudge in the division" is an answer.
 */
export interface WithheldBeat {
  /** Products the gate refused across every surface on this beat. */
  count: number;
  /** Slots left empty because nothing behind the refusal cleared the bar. */
  emptied: number;
  /** Rules that fired, in the order the gate applies them. */
  rules: { rule: SuppressionRule; label: string; count: number }[];
  /** One line per surface that refused something, for the panel card. */
  surfaces: {
    surface: string;
    kept: number;
    slots: number;
    /** The refusals themselves, each already carrying its own reason. */
    reasons: { product: string; rule: SuppressionRule; ruleLabel: string; reason: string }[];
  }[];
  /**
   * The rivalry rule's own sentence, when it fired.
   *
   * Broken out because it is the only rule here that a shopper would notice the
   * absence of, and the only one whose justification lives outside the model -
   * it comes from a stated graph, not from a score.
   */
  rivalry: string | null;
  /** The shopper-facing summary, when anything fired at all. */
  sentence: string | null;
  /**
   * Surfaces where the rivalry rule declined to fire because the shopper had
   * anchored the page on that rival themselves.
   *
   * A beat can carry this and nothing else - a page where the only decision the
   * gate made was to stand down. That is still a decision and the panel prints
   * it, because a rule that is only ever visible when it removes something
   * reads as absolute, and this one is not.
   */
  stoodDown: { surface: string; team: string; loyalTo: string }[];
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
  /** Present only when the suppression gate actually refused something. */
  withheld?: WithheldBeat;
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
  /**
   * Present only on the beat caused by a typed query.
   *
   * Search is the one surface where the shopper says what they want in words
   * rather than by clicking something, so the beat that reports it has to show
   * the interpretation - otherwise the panel records "searched for X" and never
   * explains what the system decided X meant.
   */
  search?: SearchResult;
  /**
   * Every suppression decision made while rendering this beat, one per surface.
   *
   * Passed in rather than recomputed here for the same reason the deltas are:
   * the journal reports what the surfaces did, and a journal that re-derives its
   * own version of events can disagree with the screen it is describing.
   */
  suppression?: SuppressionResult[];
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
/**
 * The query run: free text in, taxonomy nodes out.
 *
 * This is the only engine in the build whose input is a string the shopper
 * typed, and it is scored differently from the others for that reason. The
 * others publish a posterior over a fixed set of options; this one publishes a
 * per-node confidence, and the confidences are not a distribution - they do not
 * sum to one and are not meant to. Each is a separate answer to a separate
 * question ("is this word a player?", "is this word a department?"), so the bar
 * beside each node is read on its own, not against its neighbours.
 */
function queryRun(i: BeatInput): ModelRun | null {
  const search = i.search;
  if (!search) return null;

  const { interpretation: q } = search;
  const resolved = q.nodes.filter((n) => n.via !== 'propagated');
  const inferred = q.nodes.filter((n) => n.via === 'propagated');

  const inputs: { label: string; value: string }[] = [
    { label: 'Query', value: `"${q.raw}"` },
    { label: 'Tokens', value: `${q.tokens.length}` },
    { label: 'Nodes resolved', value: `${resolved.length} matched, ${inferred.length} inferred` },
    { label: 'Unmapped words', value: q.unmatched.length ? q.unmatched.join(', ') : 'none' },
    { label: 'Constraints applied', value: `${search.applied.length} of ${search.constraints.length}` },
  ];

  const verdict = search.rescue
    ? search.rescue.kind === 'profile'
      ? `${search.matchedBeforeRescue} exact matches. ${search.rescue.headline} - ${search.matched.length} products ranked by profile affinity instead of an empty page.`
      : `${search.matchedBeforeRescue} exact matches. ${search.rescue.steps.length} constraint(s) relaxed weakest-first to reach ${search.matched.length}.`
    : `${search.matched.length} products satisfy every interpreted constraint.`;

  return {
    engine: 'Query',
    question: 'What did the shopper actually ask for?',
    inputs,
    scoreLabel: 'match confidence per node',
    scores: q.nodes.slice(0, 6).map((n) => ({
      label: `${n.kind}: ${n.value}`,
      score: n.confidence,
      hint: n.span ? `"${n.span}" via ${n.via}` : `inferred, ${n.via}`,
    })),
    verdict,
  };
}

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
    if (i.search) {
      const s = i.search;
      out.push({
        surface: 'Search result set',
        detail: s.rescue
          ? `${s.rescue.headline}. ${s.rescue.detail}`
          : `${s.matched.length} products satisfy the interpreted query. The constraints came from the shopper's words, not from the model.`,
        items: s.applied.map((c) => c.label),
        isFallback: s.rescue?.kind === 'profile',
      });
      out.push({
        surface: 'Search result order',
        detail: s.personalized
          ? 'Relevance times profile affinity. Personalization decides the order; it never decides membership.'
          : 'Relevance only. Profile affinity is switched off, so this is the same order any anonymous visitor would see.',
        items: s.hits.slice(0, 3).map((h) => `${h.rank}. ${h.product.name}${h.defaultRank !== h.rank ? ` (was ${h.defaultRank})` : ''}`),
        isFallback: !s.personalized,
      });
    }
    out.push({
      surface: 'Facet rail order',
      detail: `Re-ranked for a ${dept} shopper. The top two facets carry the ML RANKED badge.`,
      items: intent.topFilters.slice(0, 5),
    });
    out.push({
      surface: 'Recommended sort',
      detail: fell
        ? 'Gate not cleared - Recommended is plain popularity, identical to the personalization-off page.'
        : `Popularity reweighted by the team and department posteriors, so ${team} ${dept} float up without being filtered in.`,
      isFallback: fell,
    });
    if (!i.search) {
      out.push({
        surface: 'Result set',
        detail:
          'Unchanged by the model. Filtering stays exactly what the shopper asked for - only the ordering is personalized.',
      });
    }
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

  // Refusal, listed as a surface rather than as a footnote. A slot the gate
  // emptied is a slot that changed, and the panel's job is to account for every
  // slot that changed - including the ones that changed to nothing.
  for (const r of i.suppression ?? []) {
    if (!r.fired) continue;
    out.push({
      surface: `${r.policy.label} - withheld`,
      detail:
        `${r.suppressed.length} candidate(s) refused before ranking. ` +
        (r.withheld > 0
          ? `${r.withheld} slot(s) left empty: nothing behind them cleared this surface's bar.`
          : `Backfilled from the next-best candidates, so the rail is still full.`),
      items: r.suppressed.map((d) => `${d.product.name} - ${d.ruleLabel}`),
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

  // A typed query explains itself better than any posterior movement can: the
  // shopper stated their intent, and the interesting question is what the
  // system decided the words meant.
  if (i.search) {
    const s = i.search;
    const named = s.interpretation.nodes
      .filter((n) => n.via !== 'propagated')
      .map((n) => `"${n.span}" -> ${n.kind} ${n.value}`)
      .join(', ');
    const inferred = s.interpretation.nodes.filter((n) => n.via === 'propagated');
    const chain = inferred.length
      ? ` ${inferred.map((n) => `${n.value} was inferred at ${pct(n.confidence)}%, damped because it was never typed`).join('; ')}.`
      : '';
    const head = named
      ? `The query mapped onto the taxonomy as ${named}.`
      : `Nothing in the query mapped onto the taxonomy.`;
    const tail = s.rescue
      ? s.rescue.kind === 'profile'
        ? ` ${s.rescue.headline}, so the page fell back to profile affinity over ${s.matched.length} products rather than showing an empty result.`
        : ` ${s.rescue.steps.length} constraint(s) were dropped weakest-first to reach ${s.matched.length} products; each dropped constraint stays on as a ranking bonus, so the results still lean toward what was asked for.`
      : ` ${s.matched.length} products satisfy it, ordered by relevance times profile affinity.`;
    return `${head}${chain}${tail}`;
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

/* ------------------------------------------------------------ withheld -- */

/**
 * Fold every surface's refusals into one record for the beat.
 *
 * Returns undefined - not an empty record - when nothing fired. A beat that
 * refused nothing should carry no withheld field at all, so that the panel can
 * distinguish "the gate ran and let everything through" from "the gate is
 * reported here as zeros", which look identical once rendered.
 */
function withheldFor(i: BeatInput): WithheldBeat | undefined {
  const all = i.suppression ?? [];
  const results = all.filter((r) => r.fired);
  const stoodDown = all
    .filter((r) => r.rivalryStoodDown)
    .map((r) => ({
      surface: r.policy.label,
      team: r.rivalryStoodDown!.team as string,
      loyalTo: r.rivalryStoodDown!.loyalTo as string,
    }));
  // A stand-down with no refusals is still a beat worth writing.
  if (results.length === 0 && stoodDown.length === 0) return undefined;

  // Rule order is the gate's own order, not descending count: the panel is
  // explaining a sequence of decisions, and re-sorting it by frequency would
  // misreport which rule got to the product first.
  const order: SuppressionRule[] = ['recent_purchase', 'rivalry', 'fatigue', 'confidence_floor'];
  const tally = new Map<SuppressionRule, { label: string; count: number }>();
  for (const r of results) {
    for (const row of r.byRule) {
      const cur = tally.get(row.rule);
      if (cur) cur.count += row.count;
      else tally.set(row.rule, { label: row.label, count: row.count });
    }
  }

  const rivalryHit = results
    .flatMap((r) => r.suppressed)
    .find((d) => d.rule === 'rivalry');

  return {
    count: results.reduce((n, r) => n + r.suppressed.length, 0),
    emptied: results.reduce((n, r) => n + r.withheld, 0),
    rules: order
      .filter((rule) => tally.has(rule))
      .map((rule) => ({ rule, label: tally.get(rule)!.label, count: tally.get(rule)!.count })),
    surfaces: results.map((r) => ({
      surface: r.policy.label,
      kept: r.kept.length,
      slots: r.policy.slots,
      reasons: r.suppressed.map((d) => ({
        product: d.product.name,
        rule: d.rule,
        ruleLabel: d.ruleLabel,
        reason: d.reason,
      })),
    })),
    rivalry: rivalryHit ? rivalryHit.reason : null,
    // One sentence for the whole beat, built from the surface that refused most.
    // Concatenating every surface's sentence produces a paragraph nobody reads.
    sentence: results.length
      ? refusalSentence(results.reduce((a, b) => (b.suppressed.length > a.suppressed.length ? b : a)))
      : null,
    stoodDown,
  };
}

/* ----------------------------------------------------------------- build -- */

export function buildBeat(i: BeatInput): JournalBeat {
  const { intent, prevIntent, trace, event, page } = i;

  // Query runs first when there was one: it is the run that decided what the
  // page is even about, and the intent posterior below is downstream of it.
  const q = queryRun(i);
  const runs: ModelRun[] = q ? [q, ...intentRuns(i)] : [...intentRuns(i)];
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
  const withheld = withheldFor(i);

  // The refusal clause goes AFTER the explanation, never instead of it, and it
  // names the rule rather than counting the casualties. It also lands last on
  // purpose: the house style for this stream is mechanism, then consequence,
  // then number, and a rule name is a better closing word than a posterior.
  // Three cases, and the third is the one worth having: a beat where the gate's
  // only decision was to NOT fire. Reporting that as "Gate fired: " with an
  // empty list is how the first draft of this read.
  const gateNote = !withheld
    ? null
    : withheld.rivalry
      ? `${RULE_LABEL.rivalry} fired: ${withheld.rivalry}`
      : withheld.rules.length
        ? `Gate fired: ${withheld.rules.map((r) => `${r.label} (${r.count})`).join(', ')}.`
        : withheld.stoodDown.length
          ? `${RULE_LABEL.rivalry} stood down: this page is anchored on ${withheld.stoodDown[0].team}, which the shopper opened themselves, so it is shown despite the ${withheld.stoodDown[0].loyalTo} read.`
          : null;

  const why = gateNote ? `${whySentence(i)} ${gateNote}` : whySentence(i);

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
    withheld,
    why,
    shift: prevIntent
      ? { label: top.team, from: probOf(prevIntent, top.team), to: top.probability }
      : undefined,
    confidence: { from: prevIntent?.confidence ?? intent.confidence, to: intent.confidence },
    personalizationOn: i.personalizationOn,
    market: i.market,
  };
}
