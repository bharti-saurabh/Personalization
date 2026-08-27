/**
 * Properties of the substitution ranker.
 *
 * The claim this module makes is that "what else is like this" and "what will
 * do instead of this" are different questions with different answers, and the
 * `divergence` table is the evidence for it. So the test that matters most here
 * is the one that constructs a case where the two orderings must disagree - if
 * they never disagree, the module is an expensive alias for the similarity rail
 * and the screen built on it is claiming something it cannot show.
 *
 * The other half is availability as a GATE. Every rejection below has to be a
 * rejection: an unavailable product must never appear in `ranked` with a low
 * score, because a scored-down product is one weight change away from being
 * recommended, and a shopper cannot buy it either way.
 *
 * Run with `npm test`. No DOM, no React.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { Product } from '../types';
import { sizeAvailability } from './fit';
import { CONTINUITY_WEIGHTS, PRICE_TOLERANCE, needsSubstitute, runSubstitution } from './substitution';

/* ------------------------------------------------------------- fixtures -- */

function product(partial: Partial<Product> = {}): Product {
  return {
    id: 'sub-anchor',
    name: 'Anchor',
    team: 'Eagles',
    league: 'NFL',
    department: 'Jerseys',
    subdepartment: 'Game Jersey',
    brand: 'Nike',
    gender: 'Men',
    ageGroup: 'Adult',
    price: 120,
    priceBand: '$$$',
    rating: 4.5,
    reviewCount: 100,
    inventoryStatus: 'In Stock',
    imageBg: '',
    styleFamily: 'Nike Game',
    popularity: 50,
    primaryColor: '#004C54',
    secondaryColor: '#A5ACAF',
    ...partial,
  };
}

/* ---------------------------------------------------- availability is a gate -- */

test('a pre-order candidate is rejected, never scored down', () => {
  const anchor = product({ inventoryStatus: 'Pre-Order' });
  const soon = product({ id: 'soon', name: 'Also pre-order', inventoryStatus: 'Pre-Order' });
  const now = product({ id: 'now', name: 'In stock' });

  const r = runSubstitution(anchor, [soon, now], 'L');
  assert.ok(!r.ranked.some((s) => s.product.id === 'soon'));
  const rej = r.rejected.find((x) => x.product.id === 'soon');
  assert.equal(rej?.reason, 'not_available');
  assert.equal(r.reason, 'product_preorder');
});

test('a candidate in the wrong body is rejected however close it is otherwise', () => {
  const anchor = product();
  // Identical in every scored dimension. Only the age group differs.
  const youth = product({ id: 'youth', name: 'Youth Anchor', ageGroup: 'Kids' });
  const r = runSubstitution(anchor, [youth], 'L');
  assert.equal(r.ranked.length, 0);
  assert.equal(r.rejected.find((x) => x.product.id === 'youth')?.reason, 'wrong_body');
});

test('the anchor never substitutes for itself', () => {
  const anchor = product();
  const r = runSubstitution(anchor, [anchor, product({ id: 'other', name: 'Other' })], 'L');
  assert.ok(!r.ranked.some((s) => s.product.id === anchor.id));
  assert.equal(r.rejected.find((x) => x.product.id === anchor.id)?.reason, 'is_the_anchor');
});

test('a candidate with no wearable size left is rejected, not offered in a size the shopper did not ask for', () => {
  // Every candidate here is low stock; the ones missing the requested size must
  // either come back in a size that exists or not come back at all.
  const anchor = product({ inventoryStatus: 'Pre-Order' });
  const pool = Array.from({ length: 40 }, (_, i) =>
    product({ id: `ls-${i}`, name: `LS ${i}`, inventoryStatus: 'Low Stock' })
  );
  const r = runSubstitution(anchor, pool, 'L', { limit: 40 });
  for (const s of r.ranked) {
    assert.ok(s.size, 'a ranked substitute always names the size it is offered in');
    assert.equal(sizeAvailability(s.product)[s.size!], true);
  }
});

/* --------------------------------------------------------------- ranking -- */

test('continuity beats popularity, and the divergence table shows where', () => {
  const anchor = product({ player: 'A. Hurts', team: 'Eagles', inventoryStatus: 'Pre-Order' });

  // Keeps everything the shopper asked for, and almost nobody buys it.
  const faithful = product({
    id: 'faithful',
    name: 'Faithful',
    player: 'A. Hurts',
    team: 'Eagles',
    popularity: 5,
  });
  // Keeps nothing except the department, and it is the best seller in the store.
  const popular = product({
    id: 'popular',
    name: 'Popular',
    player: 'Someone Else',
    team: 'Chiefs',
    styleFamily: 'Nike Limited',
    popularity: 99,
  });

  const r = runSubstitution(anchor, [faithful, popular], 'L');
  assert.equal(r.chosen?.product.id, 'faithful');
  // Popularity is the stand-in ordering when no similarity scores are handed in,
  // so the two rankings must be exact inversions here.
  assert.deepEqual(r.similarityOrder, ['popular', 'faithful']);
  assert.ok(r.divergence.length > 0, 'the two orderings disagree and the table has to say so');
  const d = r.divergence.find((x) => x.productId === 'faithful');
  assert.equal(d?.substitutionRank, 1);
  assert.equal(d?.similarityRank, 2);
});

test('a handed-in similarity ordering is used rather than popularity', () => {
  const anchor = product({ inventoryStatus: 'Pre-Order' });
  const a = product({ id: 'a', name: 'A', popularity: 10 });
  const b = product({ id: 'b', name: 'B', popularity: 90 });
  const r = runSubstitution(anchor, [a, b], 'L', { similarityScores: { a: 0.99, b: 0.1 } });
  assert.deepEqual(r.similarityOrder, ['a', 'b']);
});

test('the score is the breakdown, with nothing added on the side', () => {
  const anchor = product({ player: 'A. Hurts', inventoryStatus: 'Pre-Order' });
  const c = product({ id: 'c', name: 'C', player: 'A. Hurts' });
  const r = runSubstitution(anchor, [c], 'L');
  const s = r.ranked[0];
  const sum = Object.values(s.breakdown).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum - s.score) < 0.001, `${sum} vs ${s.score}`);
  // And a perfect continuity match cannot exceed the stated weights.
  const ceiling = Object.values(CONTINUITY_WEIGHTS).reduce((x, y) => x + y, 0);
  assert.ok(s.score <= ceiling + 0.001);
  assert.ok(Math.abs(ceiling - 1) < 0.001, 'the weights are a convex combination');
});

test('what a substitute changes is named, not just what it keeps', () => {
  const anchor = product({ player: 'A. Hurts', team: 'Eagles', inventoryStatus: 'Pre-Order' });
  const other = product({ id: 'o', name: 'Other club', team: 'Cowboys', player: 'Someone Else', price: 210 });
  const r = runSubstitution(anchor, [other], 'L');
  const s = r.ranked[0];
  assert.ok(s.concedes.some((c) => c.includes('Cowboys')));
  assert.ok(s.concedes.some((c) => c.includes('$')), 'a price outside the band is conceded out loud');
});

test('price is a tolerance band and not a term to maximise', () => {
  const anchor = product({ price: 100, inventoryStatus: 'Pre-Order' });
  const same = product({ id: 'same', name: 'Same price', price: 100 });
  const inside = product({ id: 'inside', name: 'Inside band', price: 100 * (1 + PRICE_TOLERANCE * 0.5) });
  const outside = product({ id: 'outside', name: 'Outside band', price: 100 * (1 + PRICE_TOLERANCE * 3) });

  const r = runSubstitution(anchor, [same, inside, outside], 'L', { limit: 3 });
  const by = Object.fromEntries(r.ranked.map((s) => [s.product.id, s.breakdown.price]));
  assert.ok(by.same >= by.inside, 'nothing beats matching the anchor');
  assert.ok(by.inside > by.outside, 'inside the band beats outside it');
});

/* ----------------------------------------------------------- the trigger -- */

test('needsSubstitute agrees with the availability model it is named for', () => {
  assert.equal(needsSubstitute(product({ inventoryStatus: 'Pre-Order' }), 'L'), true);
  assert.equal(needsSubstitute(product({ inventoryStatus: 'In Stock' }), 'L'), false);
  assert.equal(needsSubstitute(product({ inventoryStatus: 'Low Stock' }), null), false);

  for (let i = 0; i < 60; i++) {
    const p = product({ id: `ns-${i}`, inventoryStatus: 'Low Stock' });
    const avail = sizeAvailability(p);
    for (const [size, ok] of Object.entries(avail)) {
      assert.equal(needsSubstitute(p, size), !ok, `${p.id} ${size}`);
    }
  }
});
