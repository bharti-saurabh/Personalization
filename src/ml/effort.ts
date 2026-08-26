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
 * EMPTY BY DESIGN, for now. The types, the arithmetic and the wiring are real;
 * nothing writes to it yet. Instrumenting the storefront's surfaces to record
 * effort is its own piece of work, and a ledger populated with invented numbers
 * would be worse than an empty one - it would be a chart that looks like
 * evidence and is not. See `Experience` in the intelligence panel.
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
  | 'scroll_depth';

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
};

export interface EffortEntry {
  id: string;
  /** The event this was observed on, when there was one. */
  eventId: string | null;
  kind: EffortKind;
  page: StorefrontPage;
  /** How many times it happened in this occurrence. */
  count: number;
  /**
   * True when personalization removed this step rather than the shopper taking
   * it. An avoided entry is a saving; an incurred one is a cost. Both belong in
   * the same ledger or the total means nothing.
   */
  avoided: boolean;
  label: string;
}

export interface EffortTotals {
  clicks: number;
  seconds: number;
  avoidedClicks: number;
  avoidedSeconds: number;
}

export interface EffortLedger {
  entries: EffortEntry[];
  incurred: EffortTotals;
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

  return {
    entries,
    incurred,
    byKind,
    avoidedShare: totalSeconds > 0 ? incurred.avoidedSeconds / totalSeconds : null,
  };
}

/** The ledger before anything has been recorded. */
export function emptyLedger(): EffortLedger {
  return buildLedger([]);
}
