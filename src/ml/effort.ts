/**
 * What the shopper spent to get where they got.
 *
 * Personalization is usually argued in revenue, which is the retailer's side of
 * the trade. This is the shopper's side: the searches, the filter flips, the
 * pages of grid, the backtracks, the dead ends. Every one of them is a cost the
 * experience imposed, and the only honest claim a recommender can make is that
 * it removed some of them.
 *
 * The ledger is deliberately a separate account from the profile. The profile
 * says what we know; this says what it cost the shopper to tell us. They move
 * in opposite directions when personalization is working, and stapling them
 * together would hide exactly the comparison that matters.
 *
 * NO LONGER EMPTY. The storefront's surfaces are instrumented now, and every
 * entry below is emitted by a surface that actually made the decision it
 * describes. Nothing here is invented: an entry exists only where a personalized
 * ordering was computed alongside the merchandised default it replaced.
 *
 * HOW THE "REPLAYED UNPERSONALIZED" TOTAL IS EARNED.
 *
 * The obvious way to answer "what did personalization save this session" is to
 * re-run the whole session with the switch off and diff the two. We do not do
 * that, and not because it is hard - because it is unfalsifiable. A replayed
 * session diverges at the first click: the unpersonalized shopper lands
 * somewhere else, sees different things and takes different actions, and by
 * step four the two sessions are not comparable and the diff is a guess.
 *
 * Instead every entry is PAIRED AT THE MOMENT OF THE DECISION. When the home
 * page orders its category rail, it computes both orderings from the same
 * inputs in the same render - the intent posterior's and the alphabetical
 * default's - and records where the shopper's target sat in each. The decision
 * is the unit, the pairing is exact, and neither side is a hypothetical.
 * Summed, those pairs ARE the session replayed unpersonalized, decision by
 * decision, with no divergence to hand-wave over.
 *
 * The consequence to be honest about: this counts only the decisions the
 * shopper actually reached. A session that ended on the home page has one
 * decision in it, and the ledger says one decision, not an extrapolated ten.
 *
 * ENTRIES CAN GO THE OTHER WAY. When the model reads a shopper wrong it pushes
 * their target DOWN the rail, and that is recorded as effort incurred rather
 * than quietly dropped. A ledger that can only count savings is an advert.
 *
 * No React, no DOM: the harness runs this.
 */

import { StorefrontPage } from '../types';

/**
 * A kind of work the shopper had to do.
 *
 * Each carries a default cost because the point of the ledger is comparison,
 * and a comparison needs a common unit. The units are seconds of shopper
 * attention and discrete interactions - both observable, neither inferred.
 */
export type EffortKind =
  | 'search'
  | 'filter'
  | 'sort'
  | 'pagination'
  | 'backtrack'
  | 'dead_end'
  | 'size_hunt'
  | 'scroll_depth'
  | 'suppressed_impression';

export interface EffortKindMeta {
  id: EffortKind;
  label: string;
  /** What the shopper was actually trying to do. */
  intent: string;
  /** Seconds one occurrence typically costs. Simulated, and labelled as such. */
  secondsEach: number;
  clicksEach: number;
}

export const EFFORT_KINDS: Record<EffortKind, EffortKindMeta> = {
  search: {
    id: 'search',
    label: 'Search',
    intent: 'Naming the thing because the page would not offer it',
    secondsEach: 12,
    clicksEach: 1,
  },
  filter: {
    id: 'filter',
    label: 'Filter applied',
    intent: 'Narrowing a grid that arrived too wide',
    secondsEach: 6,
    clicksEach: 1,
  },
  sort: {
    id: 'sort',
    label: 'Sort changed',
    intent: 'Rejecting the default ordering',
    secondsEach: 4,
    clicksEach: 1,
  },
  pagination: {
    id: 'pagination',
    label: 'Next page',
    intent: 'The first page did not contain it',
    secondsEach: 8,
    clicksEach: 1,
  },
  backtrack: {
    id: 'backtrack',
    label: 'Backtrack',
    intent: 'A path that turned out to be wrong',
    secondsEach: 9,
    clicksEach: 2,
  },
  dead_end: {
    id: 'dead_end',
    label: 'Zero results',
    intent: 'A query the catalog could not answer',
    secondsEach: 15,
    clicksEach: 1,
  },
  size_hunt: {
    id: 'size_hunt',
    label: 'Size hunt',
    intent: 'Checking whether it comes in their size',
    secondsEach: 11,
    clicksEach: 2,
  },
  scroll_depth: {
    id: 'scroll_depth',
    label: 'Deep scroll',
    intent: 'Reading past the fold to find the relevant row',
    secondsEach: 5,
    clicksEach: 0,
  },
  /*
   * The only kind here that is exclusively a SAVING, because it is the only one
   * a shopper cannot perform. A slot the rules refused to fill is attention the
   * store did not ask for, and it is worth less than a scroll because looking
   * past an empty space is cheaper than looking past a wrong product.
   */
  suppressed_impression: {
    id: 'suppressed_impression',
    label: 'Slot withheld',
    intent: 'A recommendation the evidence would not stand behind',
    secondsEach: 3,
    clicksEach: 0,
  },
};

export interface EffortEntry {
  id: string;
  /** The event this was observed on, when there was one. */
  eventId: string | null;
  kind: EffortKind;
  page: StorefrontPage;
  /** Which surface made the decision. Free text; used to group the ledger. */
  surface: string;
  /** How many times it happened in this occurrence. */
  count: number;
  /**
   * True when personalization removed this step rather than the shopper taking
   * it. An avoided entry is a saving; an incurred one is a cost. Both belong in
   * the same ledger or the total means nothing.
   */
  avoided: boolean;
  /** What happened, in the shopper's terms. */
  label: string;
  /**
   * The paired reading: the personalized outcome against the merchandised
   * default, both computed from the same inputs in the same render. This is
   * the field that makes an entry checkable rather than assertable.
   */
  detail: string | null;
}

export interface EffortTotals {
  clicks: number;
  seconds: number;
  avoidedClicks: number;
  avoidedSeconds: number;
}

/**
 * The session as it happened, against the same session with the switch off.
 *
 * `unpersonalized` is not a second simulation. Every avoided entry was paired
 * against its own merchandised default at the moment it was recorded, so the
 * counterfactual total is the sum of those pairs - see the header. `saved` can
 * be negative, and is, for a shopper the intent model reads wrong.
 */
export interface EffortReplay {
  /** Steps the shopper actually took, in this session, as it ran. */
  personalizedClicks: number;
  personalizedSeconds: number;
  /** The same decisions, resolved the way the un-personalized store resolves them. */
  unpersonalizedClicks: number;
  unpersonalizedSeconds: number;
  savedClicks: number;
  savedSeconds: number;
  /** How many paired decisions the total is built from. Its own denominator. */
  decisions: number;
}

export interface EffortLedger {
  entries: EffortEntry[];
  incurred: EffortTotals;
  /** Session end: what the same decisions would have cost unpersonalized. */
  replay: EffortReplay;
  /** Per-kind counts, incurred and avoided, for the breakdown. */
  byKind: { kind: EffortKind; incurred: number; avoided: number }[];
  /**
   * Share of identified effort that personalization removed, in [0,1].
   * Null when nothing has been recorded - a ratio over an empty ledger is not
   * zero, it is undefined, and rendering it as 0% would be a lie about a
   * measurement that has not been taken.
   */
  avoidedShare: number | null;
}

const ZERO: EffortTotals = { clicks: 0, seconds: 0, avoidedClicks: 0, avoidedSeconds: 0 };

/** Folds entries into totals. Pure; safe to call on every render. */
export function buildLedger(entries: EffortEntry[]): EffortLedger {
  const incurred = entries.reduce<EffortTotals>((acc, e) => {
    const meta = EFFORT_KINDS[e.kind];
    const clicks = meta.clicksEach * e.count;
    const seconds = meta.secondsEach * e.count;
    return e.avoided
      ? { ...acc, avoidedClicks: acc.avoidedClicks + clicks, avoidedSeconds: acc.avoidedSeconds + seconds }
      : { ...acc, clicks: acc.clicks + clicks, seconds: acc.seconds + seconds };
  }, ZERO);

  const byKind = (Object.keys(EFFORT_KINDS) as EffortKind[])
    .map((kind) => ({
      kind,
      incurred: entries.filter((e) => e.kind === kind && !e.avoided).reduce((n, e) => n + e.count, 0),
      avoided: entries.filter((e) => e.kind === kind && e.avoided).reduce((n, e) => n + e.count, 0),
    }))
    .filter((r) => r.incurred > 0 || r.avoided > 0);

  const totalSeconds = incurred.seconds + incurred.avoidedSeconds;

  /*
   * The un-personalized column.
   *
   * An AVOIDED entry is work the shopper did not do and the default store would
   * have made them do, so it lands on the un-personalized side only. An
   * INCURRED entry is work they did do - either the store made them do it, or
   * personalization pushed their target further away - and it lands on both,
   * because the default store would have imposed at least as much. Netting
   * those two gives `saved`, which is exactly the sum of the paired diffs.
   */
  const replay: EffortReplay = {
    personalizedClicks: incurred.clicks,
    personalizedSeconds: incurred.seconds,
    unpersonalizedClicks: incurred.clicks + incurred.avoidedClicks,
    unpersonalizedSeconds: incurred.seconds + incurred.avoidedSeconds,
    savedClicks: incurred.avoidedClicks,
    savedSeconds: incurred.avoidedSeconds,
    decisions: entries.length,
  };

  return {
    entries,
    incurred,
    replay,
    byKind,
    avoidedShare: totalSeconds > 0 ? incurred.avoidedSeconds / totalSeconds : null,
  };
}

/* ------------------------------------------------------------- recorders -- */

/**
 * How many rows of grid a position sits behind.
 *
 * Positions are converted to rows before they are counted, because a shopper
 * does not experience "nine slots" - they experience two rows of scrolling.
 * Counting raw positions would let a wide rail claim a saving of twelve for one
 * flick of the wrist.
 */
function rowsFor(position: number, perRow: number): number {
  return Math.ceil(Math.max(1, position) / Math.max(1, perRow));
}

export interface RankMoveInput {
  id: string;
  eventId: string | null;
  page: StorefrontPage;
  surface: string;
  /** What moved, named the way the shopper would name it. */
  subject: string;
  /** 1-based position under the personalized ordering. */
  personalizedPosition: number;
  /** 1-based position of the SAME thing under the merchandised default. */
  defaultPosition: number;
  /** Slots per visual row, so positions can be read as scrolling. */
  perRow?: number;
}

/**
 * One thing moving in one ordering.
 *
 * Returns null when it did not move: a decision that changed nothing is not a
 * saving and should not appear in a ledger as a zero-count row, because a
 * reader counting rows would read those zeros as decisions that helped.
 *
 * When the personalized ordering pushed the subject DOWN, the entry comes back
 * with `avoided: false` - a cost, in the same units, on the same ledger.
 */
export function rankMove(input: RankMoveInput): EffortEntry | null {
  const perRow = input.perRow ?? 1;
  const rowsPersonalized = rowsFor(input.personalizedPosition, perRow);
  const rowsDefault = rowsFor(input.defaultPosition, perRow);
  const delta = rowsDefault - rowsPersonalized;
  if (delta === 0) return null;

  return {
    id: input.id,
    eventId: input.eventId,
    kind: 'scroll_depth',
    page: input.page,
    surface: input.surface,
    count: Math.abs(delta),
    avoided: delta > 0,
    label:
      delta > 0
        ? `${input.subject} moved up to position ${input.personalizedPosition}`
        : `${input.subject} pushed down to position ${input.personalizedPosition}`,
    detail: `position ${input.defaultPosition} unpersonalized -> position ${input.personalizedPosition} personalized`,
  };
}

export interface SimpleSavingInput {
  id: string;
  eventId: string | null;
  page: StorefrontPage;
  surface: string;
  kind: EffortKind;
  count: number;
  label: string;
  detail: string;
}

/** A saving that is a whole interaction rather than a move in an ordering. */
export function saving(input: SimpleSavingInput): EffortEntry {
  return { ...input, avoided: true, detail: input.detail };
}

/** Work the shopper had to do. Same shape, other sign. */
export function cost(input: SimpleSavingInput): EffortEntry {
  return { ...input, avoided: false, detail: input.detail };
}

/** The ledger before anything has been recorded. */
export function emptyLedger(): EffortLedger {
  return buildLedger([]);
}
