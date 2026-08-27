/**
 * Properties of the fit model.
 *
 * A size prefill is the one personalization decision on a product page that the
 * shopper cannot ignore: it is already in the facet when they arrive, and if it
 * is wrong they either notice and correct it or they do not and a return gets
 * created. So the tests here pin the refusals rather than the predictions - the
 * cases where the model has something it could say and declines to say it.
 *
 * The population ceiling test is the one worth having most. A fallback that can
 * clear the prefill bar is a fallback that puts the catalog's modal size onto
 * every cold visitor's screen as though it were a reading of them, and that
 * failure is invisible on a page: an L in the box looks the same whether it was
 * earned or defaulted.
 *
 * Run with `npm test`. No DOM, no React.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { Department, Product } from '../types';
import { createProfile } from './profile';
import type { SizeEstimate, VisitorProfile } from './profile';
import {
  FIT_PREFILL_FLOOR,
  GIFT_INTENT_BAR,
  GIFT_INTENT_CONFIDENCE_FLOOR,
  POPULATION_CONFIDENCE_CEILING,
  SIZE_TRANSFER,
  ladderFor,
  predictFit,
  readsAsGift,
  sizeAvailability,
} from './fit';

/* ------------------------------------------------------------- fixtures -- */

let pid = 0;
function product(partial: Partial<Product> = {}): Product {
  pid += 1;
  return {
    id: `fit-p${pid}`,
    name: `Product ${pid}`,
    team: 'Eagles',
    league: 'NFL',
    department: 'T-shirts',
    subdepartment: 'Graphic Tee',
    brand: 'Nike',
    gender: 'Men',
    ageGroup: 'Adult',
    price: 40,
    priceBand: '$$',
    rating: 4.5,
    reviewCount: 100,
    inventoryStatus: 'In Stock',
    imageBg: '',
    styleFamily: 'Nike Club Fleece',
    popularity: 50,
    primaryColor: '#004C54',
    secondaryColor: '#A5ACAF',
    ...partial,
  };
}

function estimate(size: string, value: number): SizeEstimate {
  return {
    size,
    confidence: { value, evidenceCount: 4, lastUpdated: 0, source: 'history', decayLambda: 0.02 },
  };
}

function withSizes(sizes: Partial<Record<Department, SizeEstimate>>): VisitorProfile {
  const p = createProfile('fit-test');
  return { ...p, traits: { ...p.traits, sizeProfile: sizes } };
}

/* ------------------------------------------------------------ the floors -- */

test('the population fallback cannot clear the prefill bar, by construction', () => {
  // Not "does not today" - CANNOT. If someone raises the population ceiling
  // above the prefill floor, this fails before the modal size reaches a screen.
  assert.ok(
    POPULATION_CONFIDENCE_CEILING < FIT_PREFILL_FLOOR,
    `population ceiling ${POPULATION_CONFIDENCE_CEILING} must stay below the prefill floor ${FIT_PREFILL_FLOOR}`
  );
});

test('a cold visitor gets a suggestion and never a prefill', () => {
  const fit = predictFit(product(), createProfile('cold'));
  assert.equal(fit.source, 'population');
  assert.ok(fit.size, 'the size chart still gets a starting point');
  assert.equal(fit.prefill, false);
  assert.ok(fit.blocked?.includes('never prefills'));
});

test('a confident own-department size prefills and says where it came from', () => {
  const fit = predictFit(product(), withSizes({ 'T-shirts': estimate('L', 0.82) }));
  assert.equal(fit.source, 'observed');
  assert.equal(fit.size, 'L');
  assert.equal(fit.prefill, true);
  assert.equal(fit.blocked, null);
  assert.ok(fit.reasons.some((r) => r.includes('T-shirts')));
});

test('a size the shopper picked but is not sure of stays out of the facet', () => {
  const weak = FIT_PREFILL_FLOOR - 0.1;
  const fit = predictFit(product(), withSizes({ 'T-shirts': estimate('L', weak) }));
  assert.equal(fit.source, 'observed');
  assert.equal(fit.prefill, false);
  assert.ok(fit.blocked?.includes('under the'));
});

/* ---------------------------------------------------------- the refusals -- */

test('the refused transfers stay refused', () => {
  // The table is the claim. These four pairs are the ones a naive index-carry
  // would happily convert, and every one of them is a different body part or a
  // different body.
  assert.equal(SIZE_TRANSFER.apparel.hat.allowed, false);
  assert.equal(SIZE_TRANSFER.hat.apparel.allowed, false);
  assert.equal(SIZE_TRANSFER.apparel.kids.allowed, false);
  assert.equal(SIZE_TRANSFER.kids.apparel.allowed, false);
  // A refusal with no reason attached is indistinguishable from missing data.
  for (const from of Object.keys(SIZE_TRANSFER) as (keyof typeof SIZE_TRANSFER)[]) {
    for (const to of Object.keys(SIZE_TRANSFER[from]) as (keyof typeof SIZE_TRANSFER)[]) {
      const rule = SIZE_TRANSFER[from][to];
      assert.ok(rule.why.length > 10, `${from}->${to} needs a stated reason`);
      if (!rule.allowed) assert.equal(rule.damping, 0);
    }
  }
});

test('a hat size does not become a jersey size, and the page says it was ignored', () => {
  const fit = predictFit(product({ department: 'Jerseys' }), withSizes({ Hats: estimate('M/L', 0.9) }));
  assert.equal(fit.source, 'population');
  assert.equal(fit.transferredFrom, null);
  assert.ok(fit.reasons.some((r) => r.includes('Ignored your Hats size')));
});

test('an adult size is not evidence about a child', () => {
  const fit = predictFit(product({ department: 'Kids' }), withSizes({ 'T-shirts': estimate('L', 0.95) }));
  assert.equal(fit.source, 'population');
  assert.ok(fit.reasons.some((r) => r.includes('child')));
});

test('a same-family transfer is allowed and damped', () => {
  const fit = predictFit(product({ department: 'Hoodies' }), withSizes({ 'T-shirts': estimate('L', 0.9) }));
  assert.equal(fit.source, 'transferred');
  assert.equal(fit.transferredFrom, 'T-shirts');
  assert.ok(fit.confidence < 0.9, 'a carried size is worth less than the one it was carried from');
  // A hoodie goes over the tee, so the ladder moves up a step.
  assert.ok(fit.adjustments.some((a) => a.steps === 1));
});

test('a gift blocks the prefill outright rather than lowering it', () => {
  const profile = withSizes({ 'T-shirts': estimate('L', 0.95) });
  const own = predictFit(product(), profile);
  const gift = predictFit(product(), profile, { giftIntent: true });
  assert.equal(own.prefill, true);
  assert.equal(gift.prefill, false);
  // The reading itself is unchanged - only the permission to act on it.
  assert.equal(gift.size, own.size);
  assert.equal(gift.confidence, own.confidence);
  assert.ok(gift.blocked?.includes('someone else'));
});

test('personalization off falls to the population curve and says so', () => {
  const fit = predictFit(product(), withSizes({ 'T-shirts': estimate('L', 0.95) }), { personalized: false });
  assert.equal(fit.source, 'population');
  assert.ok(fit.reasons.some((r) => r.includes('personalization is off')));
});

/* -------------------------------------------------------- the distribution -- */

test('the distribution is a distribution, and it widens as confidence falls', () => {
  const sure = predictFit(product(), withSizes({ 'T-shirts': estimate('L', 0.95) }));
  const unsure = predictFit(product(), withSizes({ 'T-shirts': estimate('L', 0.35) }));

  for (const fit of [sure, unsure]) {
    const total = fit.distribution.reduce((a, d) => a + d.p, 0);
    assert.ok(Math.abs(total - 1) < 0.01, `mass sums to ${total}`);
    assert.equal(fit.distribution.length, fit.ladder.length);
  }

  const peak = (f: typeof sure) => Math.max(...f.distribution.map((d) => d.p));
  assert.ok(peak(sure) > peak(unsure), 'a confident call is a spike; an unconfident one is a hump');
});

/* -------------------------------------------------------- availability -- */

test('a pre-order product has no size available at all', () => {
  const p = product({ inventoryStatus: 'Pre-Order' });
  const avail = sizeAvailability(p);
  assert.ok(Object.values(avail).every((v) => v === false));
  assert.equal(predictFit(p, withSizes({ 'T-shirts': estimate('L', 0.95) })).prefill, false);
});

test('a low-stock product always keeps at least one size, and the answer is stable', () => {
  // Derived from the product id outside the catalog's RNG stream, so it must be
  // identical across calls - a facet that changes between two paints is worse
  // than one that is wrong.
  for (let i = 0; i < 60; i++) {
    const p = product({ id: `low-${i}`, inventoryStatus: 'Low Stock' });
    const a = sizeAvailability(p);
    const b = sizeAvailability(p);
    assert.deepEqual(a, b);
    assert.ok(Object.values(a).some((v) => v), `${p.id} left with nothing`);
    assert.equal(Object.keys(a).length, ladderFor(p).length);
  }
});

test('an unavailable predicted size is a block, not a silent substitution', () => {
  // Find a low-stock product where the shopper's own size is gone, then assert
  // the model still names that size and refuses to prefill it - the swap is the
  // substitution ranker's decision to make and to show, not this one's.
  let found = false;
  for (let i = 0; i < 200 && !found; i++) {
    const p = product({ id: `blocked-${i}`, inventoryStatus: 'Low Stock' });
    if (sizeAvailability(p).L) continue;
    const fit = predictFit(p, withSizes({ 'T-shirts': estimate('L', 0.95) }));
    if (fit.size !== 'L') continue;
    found = true;
    assert.equal(fit.available, false);
    assert.equal(fit.prefill, false);
    assert.ok(fit.blocked?.includes('not available'));
  }
  assert.ok(found, 'no low-stock product in 200 tried had L missing - the availability model is not depleting');
});

test('a one-size product predicts nothing and admits it', () => {
  const fit = predictFit(product({ department: 'Accessories' }), createProfile('cold'));
  if (fit.ladder.length <= 1) {
    assert.equal(fit.source, 'universal');
    assert.ok(fit.reasons.some((r) => r.includes('one size')));
  }
});

/* ------------------------------------------------------ the gift reading -- */

/** A profile whose gift scalar sits wherever the test needs it. */
function withGift(value: number, confidence: number): VisitorProfile {
  const p = createProfile('gift-test');
  return {
    ...p,
    traits: {
      ...p.traits,
      giftIntent: {
        ...p.traits.giftIntent,
        value,
        confidence: { ...p.traits.giftIntent.confidence, value: confidence },
      },
    },
  };
}

test('a shopper who has done nothing does not read as buying a gift', () => {
  // The scalar starts at 0.5 - "no idea", not "no gift". Reading the neutral
  // value as a gift would switch the prefill off for every cold visitor, which
  // is the opposite of what the guard is for.
  const cold = createProfile('cold-gift');
  assert.equal(cold.traits.giftIntent.value, 0.5);
  assert.equal(readsAsGift(cold), false);
});

test('the gift reading needs both a value and something behind it', () => {
  // Over the bar but barely observed: not enough. One ambiguous click should
  // not be able to decide the purchase is for somebody else.
  assert.equal(readsAsGift(withGift(GIFT_INTENT_BAR + 0.2, GIFT_INTENT_CONFIDENCE_FLOOR - 0.05)), false);
  // Well observed but under the bar: also not enough.
  assert.equal(readsAsGift(withGift(GIFT_INTENT_BAR - 0.05, 0.9)), false);
  // Both, and it fires.
  assert.equal(readsAsGift(withGift(GIFT_INTENT_BAR, GIFT_INTENT_CONFIDENCE_FLOOR)), true);
});

test('a gift reading blocks the prefill without erasing what the model knew', () => {
  const profile = withSizes({ 'T-shirts': estimate('L', 0.95) });
  const gifted = predictFit(product(), profile, { giftIntent: true });
  const own = predictFit(product(), profile);
  assert.equal(own.prefill, true);
  assert.equal(gifted.prefill, false);
  // Same reading, withheld - not a different reading. A surface that wants to
  // say "we think you are an L, but this looks like a gift" still can.
  assert.equal(gifted.size, own.size);
  assert.equal(gifted.confidence, own.confidence);
  assert.ok(gifted.blocked?.includes('someone else'));
});
