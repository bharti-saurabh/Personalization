/**
 * The decision stream: one entry per thing that happened.
 *
 * This joins two records that were kept separately and on purpose. The journal
 * knows what RAN - which engines fired, what they scored, which gate opened,
 * what got rendered. The profile's delta log knows what was WRITTEN - which
 * fields moved, by how much, under which decay constant. Neither is the whole
 * story: an engine that ran and wrote nothing is noise, and a field that moved
 * with no surface behind it is a number nobody can act on. Joined on the event
 * id, they are a decision.
 *
 * MARKET EVENTS ARE THE EXCEPTION, AND THEY BELONG HERE ANYWAY.
 *
 * Every other entry in this stream traces to something the shopper did, and the
 * join key is the id of that user event. A trade has no user event behind it -
 * the shopper was standing still when the world moved under them. It gets an
 * entry regardless, with `eventId: null` and no field writes, because a stream
 * that only shows shopper-caused changes would leave the single most visible
 * re-rank in the demo unexplained. The three-part reading still holds: the
 * mechanism is what was rebuilt, the consequence is what moved on screen, and
 * the number counts products and milliseconds.
 *
 * THE READING RULE, made structural rather than editorial.
 *
 * Every entry reads mechanism, then consequence, then number, and no entry ends
 * on a posterior. That is not a style guide the renderer is trusted to follow -
 * `DecisionReading` has exactly three fields in that order, `number` is built
 * only from countable things (fields, surfaces, milliseconds, evidence mass),
 * and a posterior can only appear inside `mechanism` where it is the cause of
 * something rather than the point.
 *
 * The reason is that a posterior is the least useful true thing a model can
 * say. "Eagles 0.83" is unfalsifiable in the room and unactionable outside it.
 * "A cart-add weighted 1.6 decayed at lambda 0.35" is a mechanism someone can
 * argue with, and "six of twenty-four tiles re-ordered" is a consequence
 * someone can go and check.
 *
 * No React, no DOM: the harness runs this.
 */

import { StorefrontPage } from '../types';
import type { JournalBeat, MarketBeat, ModelRun, SurfaceChange, WithheldBeat } from './journal';
import type { ProfileDelta, VisitorProfile } from './profile';
import { RULE_LABEL } from './suppression';

/** The three-part reading. Order is the contract; do not render out of order. */
export interface DecisionReading {
  /** What the machinery physically did. May cite a posterior as a cause. */
  mechanism: string;
  /** What changed for the shopper as a result. */
  consequence: string;
  /** Countable close. Never a probability. */
  number: string;
}

export interface FeatureRow {
  group: string;
  label: string;
  value: string;
  /** Contribution to the decision where one is meaningful. */
  weight?: number;
}

export interface DecisionEntry {
  id: string;
  seq: number;
  at: string;
  eventId: string | null;
  trigger: { headline: string; page: StorefrontPage; weight?: number };
  models: ModelRun[];
  /** Field writes caused by this event, newest first. */
  writes: ProfileDelta[];
  surfaces: SurfaceChange[];
  rules: { label: string; passed: boolean; detail: string }[];
  reading: DecisionReading;
  /** The full input vector, for the expanded view. */
  features: FeatureRow[];
  personalizationOn: boolean;
  /** Present only when the world itself moved. See the note in the header. */
  market?: MarketBeat;
  /**
   * Present only when the suppression gate refused something.
   *
   * Carried in full rather than summarised into `rules`, because the panel's
   * reader is a merchandiser who will want to know WHICH product was refused -
   * the storefront's own notice deliberately does not say, and this is the
   * screen where that question gets answered.
   */
  withheld?: WithheldBeat;
}

const PAGE_LABEL: Record<StorefrontPage, string> = {
  home: 'homepage',
  plp: 'category grid',
  pdp: 'product page',
  cart: 'cart',
};

/** `affinities.team.posterior.Eagles` -> `team`. The field, not the leaf. */
export function fieldOf(path: string): string {
  const parts = path.split('.');
  if (parts[0] === 'affinities' || parts[0] === 'traits') return parts[1];
  if (parts[0] === 'state') return parts[1];
  return parts[0];
}

const FIELD_LABEL: Record<string, string> = {
  team: 'team affinity',
  league: 'league affinity',
  player: 'player affinity',
  department: 'category affinity',
  gender: 'gender skew',
  ageBand: 'age band',
  priceSensitivity: 'price sensitivity',
  giftIntent: 'gift intent',
  region: 'region',
  sizeProfile: 'size profile',
  loyaltyTier: 'loyalty tier',
  persona: 'persona',
};

export function fieldLabel(path: string): string {
  const f = fieldOf(path);
  return FIELD_LABEL[f] ?? f;
}

/** Distinct fields touched, in the order they were first written. */
function fieldsTouched(writes: ProfileDelta[]): string[] {
  const seen: string[] = [];
  for (const w of writes) {
    const f = fieldOf(w.path);
    if (!seen.includes(f)) seen.push(f);
  }
  return seen;
}

function list(items: string[], max = 3): string {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  const joined =
    shown.length <= 1
      ? shown[0] ?? ''
      : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  return rest > 0 ? `${joined} and ${rest} more` : joined;
}

/* --------------------------------------------------------------- mechanism -- */

/**
 * What the machinery did, in the machinery's own terms.
 *
 * This is the only one of the three that is allowed to be technical, because it
 * is the only one whose audience is the client's data science team. It names
 * the weight, the decay constant and the channel, which together are enough to
 * reproduce the write by hand.
 */
function mechanismOf(beat: JournalBeat, writes: ProfileDelta[]): string {
  /*
   * A market beat is the only kind whose cause is outside the shopper, so it is
   * also the only one where the mechanism has to describe the world rather than
   * the fold. It says what was REBUILT, in the order it was rebuilt, because
   * "the recommendations changed" is a claim anyone can make and "the population
   * was re-simulated and the co-order graph re-estimated from the sessions that
   * produced" is a claim a client's data scientist can go and check.
   */
  if (beat.kind === 'market' && beat.market) {
    const m = beat.market;
    return `${m.headline}. The world was rebuilt from the event log rather than patched: the catalog was regenerated and re-badged, the simulated population re-drew its club and category intent against the new market, and all three co-occurrence graphs were re-estimated from the sessions that produced. ${m.detail}`;
  }

  if (beat.kind === 'session') {
    const seeds = writes.filter((w) => w.kind === 'seed');
    if (seeds.length) {
      return `Session opened. ${seeds.length} prior${seeds.length === 1 ? '' : 's'} seeded from identity and history into the durable evidence channel, which ages on the calendar rather than on clicks.`;
    }
    return 'Session opened against population priors alone. No identifier, no stored profile, nothing to fold.';
  }

  if (beat.kind === 'setting') {
    return `Personalization switched ${beat.personalizationOn ? 'on' : 'off'}. The engines ${beat.personalizationOn ? 'resumed scoring' : 'kept scoring but their output stopped reaching the surfaces'}.`;
  }

  const observations = writes.filter((w) => w.kind === 'observation');
  const propagations = writes.filter((w) => w.kind === 'propagation');
  const promotions = writes.filter((w) => w.kind === 'promotion');

  if (promotions.length) {
    return `Identity moved up a rung, so the profile was re-folded from its prior-only constructor against the richer seed rather than patched in place. The session's own events were replayed on top, which is why a declared fact can leave a field less certain than it was.`;
  }

  const parts: string[] = [];
  if (beat.signalWeight !== undefined) {
    parts.push(
      `A ${PAGE_LABEL[beat.page]} interaction entered the fold at weight ${beat.signalWeight.toFixed(2)} after decay`
    );
  } else {
    parts.push(`A ${PAGE_LABEL[beat.page]} interaction entered the fold`);
  }

  if (observations.length) {
    const lam = observations[0].confidenceAfter;
    void lam;
    const mass = observations.reduce((n, w) => n + w.contribution, 0);
    parts.push(
      `adding ${mass.toFixed(2)} evidence across ${list(fieldsTouched(observations).map((f) => FIELD_LABEL[f] ?? f))}`
    );
  }
  if (propagations.length) {
    parts.push(
      `then propagating damped into ${list(fieldsTouched(propagations).map((f) => FIELD_LABEL[f] ?? f))}, since a player implies a team implies a league but never the reverse`
    );
  }
  if (!observations.length && !propagations.length) {
    parts.push('carrying no team or category attribution, so no field could move');
  }

  return `${parts.join(', ')}.`;
}

/* ------------------------------------------------------------- consequence -- */

/**
 * What changed for the shopper.
 *
 * Deliberately written in merchandising language, not model language. If this
 * sentence cannot be checked by looking at the screen, it is the wrong
 * sentence.
 */
function consequenceOf(beat: JournalBeat): string {
  const changed = beat.presented.filter((s) => !s.isFallback);
  const fallbacks = beat.presented.filter((s) => s.isFallback);

  if (beat.kind === 'market' && beat.market) {
    const m = beat.market;
    const parts: string[] = [];
    if (m.moved > 0) {
      parts.push(
        `${m.moved} product${m.moved === 1 ? '' : 's'} changed club in place - same id, new badge and colourway - so a shopper holding one in their cart still has it`
      );
    }
    if (m.lifted > 0) parts.push(`${m.lifted} rose in the ranking`);
    if (m.damped > 0) parts.push(`${m.damped} fell`);
    const surfaces = changed.length
      ? `${list(changed.map((s) => s.surface))} re-ranked against the new catalog.`
      : `The open surfaces re-ranked against the new catalog.`;
    return parts.length ? `${parts.join(', ')}. ${surfaces}` : surfaces;
  }

  if (!beat.personalizationOn) {
    return `Nothing on the storefront moved: with personalization off every surface serves its merchandised default, which is the comparison this switch exists to make.`;
  }

  if (!beat.gate.passed) {
    return `The confidence gate stayed shut, so ${fallbacks.length || 'the'} surface${fallbacks.length === 1 ? '' : 's'} held their merchandised default rather than guessing. ${beat.gate.detail}`;
  }

  if (!changed.length) {
    return `No surface changed. The write moved a field that none of the currently rendered slots read, which is the common and unglamorous case.`;
  }

  return `${list(changed.map((s) => s.surface))} re-ranked. ${changed[0].detail}`;
}

/* ------------------------------------------------------------------ number -- */

/**
 * The countable close.
 *
 * Built only from things that can be counted: fields, surfaces, items, evidence
 * mass, milliseconds. Never a posterior - that is the whole rule, and building
 * the string here rather than in the renderer is what enforces it.
 */
function numberOf(beat: JournalBeat, writes: ProfileDelta[]): string {
  const bits: string[] = [];

  if (beat.kind === 'market' && beat.market) {
    const m = beat.market;
    bits.push(`${m.touched} product${m.touched === 1 ? '' : 's'} rewritten`);
    if (m.moved > 0) bits.push(`${m.moved} re-badged`);
    const surfaces = beat.presented.filter((s) => !s.isFallback).length;
    if (surfaces) bits.push(`${surfaces} surface${surfaces === 1 ? '' : 's'} re-ranked`);
    bits.push(`${m.rebuildMs}ms to rebuild the world`);
    return `${bits.join(' \u00b7 ')}.`;
  }

  const fields = fieldsTouched(writes).length;
  if (fields) bits.push(`${fields} field${fields === 1 ? '' : 's'} written`);

  const items = beat.presented.reduce((n, s) => n + (s.items?.length ?? 0), 0);
  const surfaces = beat.presented.filter((s) => !s.isFallback).length;
  if (surfaces) bits.push(`${surfaces} surface${surfaces === 1 ? '' : 's'} re-ranked`);
  if (items) bits.push(`${items} item${items === 1 ? '' : 's'} placed`);
  // The refusal is as countable as the placement, and it belongs in the same
  // sentence. A close that reports only what was shown is reporting half a
  // decision.
  if (beat.withheld) {
    // A beat can carry a stand-down and no refusals at all. "0 withheld" is a
    // true statement that reads as nothing having happened, so it is not made.
    if (beat.withheld.count > 0) bits.push(`${beat.withheld.count} withheld`);
    if (beat.withheld.emptied > 0) bits.push(`${beat.withheld.emptied} slot(s) left empty`);
    if (beat.withheld.stoodDown.length > 0) {
      bits.push(`rivalry stood down on ${beat.withheld.stoodDown.length} surface(s)`);
    }
  }

  const mass = writes.reduce((n, w) => n + w.contribution, 0);
  if (mass > 0) bits.push(`${mass.toFixed(2)} evidence added`);

  const latency = beat.runs.reduce((n, r) => n + (r.latencyMs ?? 0), 0);
  if (latency > 0) bits.push(`${latency < 0.1 ? '<0.1' : latency.toFixed(1)}ms`);

  if (!bits.length) return 'Nothing written, nothing re-ranked, nothing rendered differently.';
  return `${bits.join(' · ')}.`;
}

/* ----------------------------------------------------------------- vector -- */

/**
 * The full input vector behind one decision.
 *
 * Grouped rather than flat because a flat list of forty numbers is not an
 * explanation, it is a dump. The groups follow the order the fold actually
 * consumes them: the event, then the fields it touched, then the engine inputs.
 */
function featuresOf(beat: JournalBeat, writes: ProfileDelta[], profile: VisitorProfile): FeatureRow[] {
  const rows: FeatureRow[] = [];

  rows.push({ group: 'Event', label: 'Page', value: PAGE_LABEL[beat.page] });
  rows.push({ group: 'Event', label: 'Action', value: beat.headline });

  // The market pass, made inspectable. A client's merchandising lead should be
  // able to open this and see the arithmetic that lifted their category, rather
  // than being told the catalog "responded to the news".
  if (beat.market) {
    const m = beat.market;
    rows.push({ group: 'Market event', label: 'Kind', value: m.kind });
    rows.push({ group: 'Market event', label: 'Clock after', value: m.at });
    rows.push({ group: 'Market event', label: 'Products rewritten', value: String(m.touched), weight: m.touched });
    rows.push({ group: 'Market event', label: 'Changed club', value: String(m.moved), weight: m.moved });
    rows.push({ group: 'Market event', label: 'Popularity raised', value: String(m.lifted), weight: m.lifted });
    rows.push({ group: 'Market event', label: 'Popularity cut', value: String(m.damped), weight: m.damped });
    rows.push({ group: 'Market event', label: 'World rebuild', value: `${m.rebuildMs}ms` });
  }
  if (beat.signalWeight !== undefined) {
    rows.push({ group: 'Event', label: 'Decayed weight', value: beat.signalWeight.toFixed(3), weight: beat.signalWeight });
  }
  rows.push({ group: 'Event', label: 'Events folded', value: String(profile.observedEvents) });

  for (const w of writes) {
    rows.push({
      group: 'Field writes',
      label: w.path,
      value: `${w.before ?? '-'} -> ${w.after ?? '-'}`,
      weight: w.contribution,
    });
  }

  // Confidence, evidence and the decay constant per field. The decay constant is
  // here rather than only on the Profile tab because it is the number that
  // explains why two fields with the same evidence disagree about how sure they
  // are.
  const dists: [string, { confidence: { value: number; evidenceCount: number; decayLambda: number } }][] = [
    ['team', profile.affinities.team],
    ['league', profile.affinities.league],
    ['player', profile.affinities.player],
    ['department', profile.affinities.department],
    ['gender', profile.traits.gender],
    ['ageBand', profile.traits.ageBand],
  ];
  for (const [name, d] of dists) {
    rows.push({
      group: 'Field state',
      label: `${name} · evidence / lambda`,
      value: `${d.confidence.evidenceCount.toFixed(2)} / ${d.confidence.decayLambda}`,
      weight: d.confidence.value,
    });
  }

  for (const run of beat.runs) {
    for (const input of run.inputs) {
      rows.push({ group: `${run.engine} inputs`, label: input.label, value: input.value });
    }
    for (const score of run.scores.slice(0, 5)) {
      rows.push({
        group: `${run.engine} scores`,
        label: score.label,
        value: score.hint ?? score.score.toFixed(3),
        weight: score.score,
      });
    }
  }

  return rows;
}

/* ------------------------------------------------------------------ build -- */

/**
 * Joins beats to the writes they caused.
 *
 * A beat with no matching writes is kept, not dropped: "the engines ran and
 * nothing moved" is a real outcome and hiding it would make the stream look
 * busier than the session actually was.
 */
export function buildDecisions(
  beats: JournalBeat[],
  deltas: ProfileDelta[],
  profile: VisitorProfile
): DecisionEntry[] {
  return beats.map((beat) => {
    const writes = beat.eventId ? deltas.filter((d) => d.eventId === beat.eventId) : [];

    return {
      id: beat.id,
      seq: beat.seq,
      at: beat.at,
      eventId: beat.eventId ?? null,
      trigger: { headline: beat.headline, page: beat.page, weight: beat.signalWeight },
      models: beat.runs,
      writes,
      surfaces: beat.presented,
      // The confidence gate first, then whatever the suppression gate refused.
      // Order matters: the confidence gate decides whether there is a
      // personalized ordering at all, and the suppression rules only get to run
      // on one that exists.
      rules: [
        { label: beat.gate.label, passed: beat.gate.passed, detail: beat.gate.detail },
        ...(beat.withheld?.stoodDown ?? []).map((sd) => ({
          label: `${RULE_LABEL.rivalry} - stood down`,
          // Passed, because the rule ran and let the product through. The
          // opposite reading - a failed rule - would put this in the panel's
          // refusal column, where it is the one entry that is not a refusal.
          passed: true,
          detail: `${sd.surface} is anchored on ${sd.team}, which the shopper opened themselves, so ${sd.team} merchandise is shown despite the ${sd.loyalTo} read. Other rivals are still withheld.`,
        })),
        ...(beat.withheld?.rules ?? []).map((r) => ({
          label: r.label,
          // `passed: false` is the right reading here and it is worth being
          // explicit about why: a fired suppression rule is a refusal, and the
          // panel colours these red. A rule that fires is a slot that did not.
          passed: false,
          detail:
            r.rule === 'rivalry' && beat.withheld?.rivalry
              ? beat.withheld.rivalry
              : `${r.count} candidate${r.count === 1 ? '' : 's'} refused under this rule.`,
        })),
      ],
      reading: {
        mechanism: mechanismOf(beat, writes),
        consequence: consequenceOf(beat),
        number: numberOf(beat, writes),
      },
      features: featuresOf(beat, writes, profile),
      personalizationOn: beat.personalizationOn,
      market: beat.market,
      withheld: beat.withheld,
    };
  });
}

/**
 * The one-line summary the Profile tab surfaces when a write lands.
 *
 * Same rule in miniature: cause, then effect. Never just a number.
 */
export function summariseWrite(delta: ProfileDelta): string {
  const field = fieldLabel(delta.path);
  if (delta.kind === 'propagation') return `${delta.label} propagated into ${field}`;
  if (delta.kind === 'promotion') return `${delta.label} re-sourced ${field}`;
  if (delta.kind === 'seed') return `${delta.label} seeded ${field}`;
  return `${delta.label} moved ${field}`;
}
