/**
 * The Recommended sort.
 *
 * The first test is the one that matters and it is a regression test, not a
 * feature test: the comparator moved out of the listing page into src/ml, and
 * the claim attached to that move was "the ordering did not change". This
 * re-implements the old inline comparator and asserts the two agree on the real
 * catalog. If someone re-tunes the weights later, this fails and they have to
 * say so out loud rather than quietly shipping a different shelf.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { RECOMMENDED_WEIGHTS, rankRecommended } from './ranking';
import { getDataset } from '../sim/dataset';
import type { Product } from '../types';

const { products } = getDataset();
const pool = products.slice(0, 300);

const teamProb = new Map<string, number>([
  ['Eagles', 0.61],
  ['Cowboys', 0.14],
  ['Chiefs', 0.09],
]);
const deptProb = new Map<string, number>([
  ['Jerseys', 0.52],
  ['Hats', 0.21],
]);

/** The comparator exactly as it read inside ProductListingPage.tsx. */
const legacyOrder = (arr: Product[]) =>
  arr
    .slice()
    .sort((a, b) => {
      const score = (p: Product) =>
        (p.popularity / 100) * (1 + 2.0 * (teamProb.get(p.team) ?? 0) + 1.2 * (deptProb.get(p.department) ?? 0));
      return score(b) - score(a);
    })
    .map((p) => p.id);

test('the relocated sort produces the same order as the comparator it replaced', () => {
  const r = rankRecommended(pool, { teamProb, deptProb, personalizationOn: true });
  assert.deepEqual(r.ordered.map((p) => p.id), legacyOrder(pool));
});

test('with personalization off it is plain popularity, and says so', () => {
  const r = rankRecommended(pool, { teamProb, deptProb, personalizationOn: false });
  assert.equal(r.active, false);
  assert.match(r.formula, /popularity/);
  assert.deepEqual(
    r.ordered.map((p) => p.id),
    pool.slice().sort((a, b) => b.popularity - a.popularity).map((p) => p.id)
  );
  assert.deepEqual(r.moved, [], 'nothing moved because nothing was moved');
});

test('every explained multiplier is the sum of its own drivers', () => {
  const r = rankRecommended(pool, { teamProb, deptProb, personalizationOn: true });
  for (const it of r.items) {
    const sum = 1 + it.drivers.reduce((a, d) => a + d.contribution, 0);
    assert.ok(Math.abs(sum - it.multiplier) < 1e-9);
    assert.ok(Math.abs(it.base * it.multiplier - it.score) < 1e-9);
  }
});

test('a movement is measured against the popularity order, not asserted', () => {
  const r = rankRecommended(pool, { teamProb, deptProb, personalizationOn: true });
  const byPopularity = pool.slice().sort((a, b) => b.popularity - a.popularity).map((p) => p.id);
  for (const m of r.moved) {
    assert.equal(byPopularity[m.from - 1], m.productId);
    assert.equal(r.ordered[m.to - 1].id, m.productId);
    assert.equal(m.delta, m.from - m.to);
  }
});

test('the weights the panel quotes are the weights the sort used', () => {
  assert.equal(RECOMMENDED_WEIGHTS.team, 2.0);
  assert.equal(RECOMMENDED_WEIGHTS.department, 1.2);
  assert.ok(RECOMMENDED_WEIGHTS.team > RECOMMENDED_WEIGHTS.department, 'club outranks garment');
});
