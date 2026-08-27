/**
 * Properties of the facet model.
 *
 * The claim this model makes is narrow and easy to overstate, so each test pins
 * one half of it: that a cold shopper gets the merchandiser's ordering and is
 * told so, that observation overtakes that ordering rather than being blended
 * invisibly into it, that a ticked box outranks an inferred posterior for the
 * value inside a facet, that habits decay, and that both event spellings parse.
 *
 * No DOM, no React.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { UserEvent } from '../types';
import { applyEvent, createProfile } from './profile';
import { FACET_KEYS, parseFacetEvent, runFacetModel } from './facets';

let seq = 0;
function event(partial: Partial<UserEvent> = {}): UserEvent {
  seq += 1;
  return { id: `f${seq}`, timestamp: '', pageType: 'Filter', action: 'filter', ...partial };
}

const cold = () => createProfile('facet-test');

/** Newest-first, the order every consumer in this build passes. */
function model(events: UserEvent[]) {
  return runFacetModel(events, cold());
}

test('a shopper who has filtered nothing gets the prior, and is told so', () => {
  const m = model([]);
  assert.equal(m.usingPrior, true);
  assert.equal(m.evidenceCount, 0);
  assert.equal(m.observedFilters, 0);
  assert.equal(m.lastUpdatedByEvent, null);
  assert.ok(m.ranked.every((r) => r.basis === 'prior'));
  // Every facet is present even with nothing behind it: absence is a fact.
  assert.equal(m.ranked.length, FACET_KEYS.length);
});

test('the ranking is a distribution over all nine facets', () => {
  const m = model([event({ filterApplied: 'player=Jalen Hurts' })]);
  const total = m.ranked.reduce((s, r) => s + r.score, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `scores summed to ${total}`);
});

test('two applications of one facet beat the department prior', () => {
  const m = model([
    event({ filterApplied: 'colorway=Midnight Green' }),
    event({ filterApplied: 'colorway=Black' }),
  ]);
  assert.equal(m.ranked[0].key, 'colorway');
  assert.equal(m.ranked[0].basis, 'learned');
  assert.equal(m.usingPrior, false);
});

test('a ticked value outranks the posterior the fold would have offered', () => {
  // A profile that believes hard in the Eagles, and a shopper who ticked Bears.
  let p = cold();
  for (let i = 0; i < 6; i++) {
    p = applyEvent(p, event({ pageType: 'PDP', team: 'Eagles' }), { now: i, ticks: 1 }).profile;
  }
  const m = runFacetModel([event({ filterApplied: 'team=Bears' })], p);
  const team = m.ranked.find((r) => r.key === 'team')!;
  assert.equal(team.values[0].value, 'Bears');
  assert.equal(team.values[0].basis, 'observed');
});

test('a facet with no ticks falls back to the posterior for its values', () => {
  let p = cold();
  for (let i = 0; i < 6; i++) {
    p = applyEvent(p, event({ pageType: 'PDP', team: 'Eagles' }), { now: i, ticks: 1 }).profile;
  }
  const team = runFacetModel([], p).ranked.find((r) => r.key === 'team')!;
  assert.equal(team.values[0].value, 'Eagles');
  assert.equal(team.values[0].basis, 'posterior');
});

test('brand, size and colour carry no posterior when never ticked', () => {
  const m = model([]);
  for (const key of ['brand', 'size', 'colorway'] as const) {
    assert.deepEqual(m.ranked.find((r) => r.key === key)!.values, []);
  }
});

test('a habit decays: the same application is worth less the older it is', () => {
  const recent = model([event({ filterApplied: 'size=L' })]);
  const stale = model([
    ...Array.from({ length: 8 }, () => event({ pageType: 'PDP' })),
    event({ filterApplied: 'size=L' }),
  ]);
  const recentUsage = recent.ranked.find((r) => r.key === 'size')!.usage;
  const staleUsage = stale.ranked.find((r) => r.key === 'size')!.usage;
  assert.ok(staleUsage < recentUsage, `${staleUsage} should be below ${recentUsage}`);
  assert.ok(staleUsage > 0, 'decay must fade evidence, never delete it');
});

test('both recorded spellings parse, and an unknown facet parses to nothing', () => {
  assert.deepEqual(parseFacetEvent(event({ filterApplied: 'price=50-100' })), {
    key: 'price',
    value: '50-100',
  });
  assert.deepEqual(parseFacetEvent(event({ filterApplied: 'Player: Jalen Hurts' })), {
    key: 'player',
    value: 'Jalen Hurts',
  });
  // The listing page's display label for `department`.
  assert.deepEqual(parseFacetEvent(event({ filterApplied: 'Category: Jerseys' })), {
    key: 'department',
    value: 'Jerseys',
  });
  assert.equal(parseFacetEvent(event({ filterApplied: 'Sale items only' })), null);
  assert.equal(parseFacetEvent(event({})), null);
});

test('the same history always folds to the same ranking', () => {
  const events = [
    event({ filterApplied: 'team=Eagles' }),
    event({ filterApplied: 'size=L' }),
    event({ filterApplied: 'team=Eagles' }),
  ];
  const a = runFacetModel(events, cold());
  const b = runFacetModel(events, cold());
  assert.deepEqual(a.ranked, b.ranked);
  assert.equal(a.confidence, b.confidence);
});
