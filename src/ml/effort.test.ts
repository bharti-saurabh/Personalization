/**
 * The effort ledger's arithmetic.
 *
 * These are the properties the storefront's surfaces rely on and that a
 * reviewer would otherwise have to take on trust: that a decision which changed
 * nothing produces no row, that a decision which went the wrong way produces a
 * COST rather than being dropped, and that the un-personalized column is
 * genuinely the sum of the paired diffs rather than a second guess.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLedger, rankMove, saving, cost, emptyLedger, EFFORT_KINDS } from './effort';

const base = { id: 'x', eventId: null, page: 'plp' as const, surface: 'Result grid' };

test('a decision that moved nothing is not a row', () => {
  assert.equal(rankMove({ ...base, subject: 'a', personalizedPosition: 3, defaultPosition: 3 }), null);
  // Same row of a four-wide grid: positions differ, the shopper's scroll does not.
  assert.equal(
    rankMove({ ...base, subject: 'a', personalizedPosition: 1, defaultPosition: 4, perRow: 4 }),
    null
  );
});

test('a target pushed down is recorded as a cost, not dropped', () => {
  const e = rankMove({ ...base, subject: 'Eagles jersey', personalizedPosition: 20, defaultPosition: 2 });
  assert.ok(e);
  assert.equal(e.avoided, false);
  assert.equal(e.count, 18);
  assert.match(e.label, /pushed down/);
  // The paired reading carries both positions, so the row can be checked.
  assert.match(e.detail ?? '', /position 2 unpersonalized -> position 20 personalized/);
});

test('positions are counted as rows of scrolling, not as raw slots', () => {
  const e = rankMove({ ...base, subject: 'a', personalizedPosition: 2, defaultPosition: 41, perRow: 4 });
  assert.ok(e);
  assert.equal(e.avoided, true);
  // Row 11 down to row 1: ten rows of scrolling, not thirty-nine slots.
  assert.equal(e.count, 10);
});

test('the un-personalized column is the sum of the paired diffs', () => {
  const s = saving({
    ...base,
    kind: 'size_hunt',
    count: 1,
    label: 'Prefilled size L',
    detail: 'one facet interaction avoided',
  });
  const c = cost({
    ...base,
    kind: 'filter',
    count: 2,
    label: 'Two filters set by hand',
    detail: 'the rail led with the wrong question',
  });

  const ledger = buildLedger([s, c]);
  const sizeMeta = EFFORT_KINDS.size_hunt;
  const filterMeta = EFFORT_KINDS.filter;

  assert.equal(ledger.replay.personalizedSeconds, filterMeta.secondsEach * 2);
  assert.equal(
    ledger.replay.unpersonalizedSeconds,
    filterMeta.secondsEach * 2 + sizeMeta.secondsEach * 1
  );
  assert.equal(ledger.replay.savedSeconds, sizeMeta.secondsEach * 1);
  assert.equal(ledger.replay.savedClicks, sizeMeta.clicksEach * 1);
  assert.equal(ledger.replay.decisions, 2);
});

test('an empty ledger reports an undefined share, not zero', () => {
  const l = emptyLedger();
  assert.equal(l.avoidedShare, null);
  assert.equal(l.replay.decisions, 0);
  assert.equal(l.replay.savedSeconds, 0);
  assert.deepEqual(l.byKind, []);
});

test('byKind drops kinds nothing was recorded against', () => {
  const l = buildLedger([
    saving({ ...base, kind: 'sort', count: 1, label: 'Featured sort was already relevance', detail: 'd' }),
  ]);
  assert.equal(l.byKind.length, 1);
  assert.equal(l.byKind[0].kind, 'sort');
  assert.equal(l.byKind[0].avoided, 1);
  assert.equal(l.byKind[0].incurred, 0);
});
