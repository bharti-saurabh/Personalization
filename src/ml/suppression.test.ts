/**
 * Properties of the gate.
 *
 * The rules in ml/suppression.ts are the only ones in this codebase that
 * REMOVE things, and a removal is much harder to notice going wrong than a
 * ranking is. A ranker that drifts puts the wrong thing second; a gate that
 * drifts empties a rail, and the page still looks like a page. So each test
 * here pins a property some surface is relying on rather than exercising a path:
 * that the loyalty bar is genuinely a bar, that a rivalry below the floor is
 * spared, that gifting really does lift ownership, that fatigue demotes before
 * it excludes, and - the one worth having most - that a slot's threshold
 * belongs to the slot rather than to the candidate that arrived in it.
 *
 * Run with `npm test`. No DOM, no React.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Product, TeamId } from '../types';
import { RIVALRIES, rivalsOf, rivalryBetween } from '../sim/taxonomy';
import { createProfile } from './profile';
import type { VisitorProfile } from './profile';
import {
  FATIGUE_CEILING,
  LOYALIST_CONFIDENCE_FLOOR,
  LOYALIST_POSTERIOR_FLOOR,
  RECENT_PURCHASE_WINDOW_DAYS,
  RIVALRY_SUPPRESSION_FLOOR,
  SCALE_RANGE,
  SURFACE_POLICIES,
  applySuppression,
  suppressionContext,
  thresholdAt,
} from './suppression';
import type { Candidate } from './suppression';

/* ------------------------------------------------------------- fixtures -- */

let pid = 0;
function product(partial: Partial<Product> = {}): Product {
  pid += 1;
  return {
    id: `p${pid}`,
    name: `Product ${pid}`,
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

function candidate(p: Product, confidence: number): Candidate {
  return { product: p, confidence, source: 'test' };
}

/**
 * A score comfortably clear of the bar the given slot will hold it to.
 *
 * WRITTEN AFTER THE FACT, AND THE REASON MATTERS. The first draft of this file
 * used bare numbers - 0.9, 0.8, 0.51 - chosen to sit either side of thresholds
 * that were themselves bare numbers. When the thresholds were recalibrated
 * against the scales the engines actually emit, six tests failed for reasons
 * that had nothing to do with what they were testing: a rivalry test broke
 * because its control candidate no longer cleared a confidence bar. A test of
 * the rivalry rule must not be able to fail because of the confidence rule.
 * Everything below asks the policy where its bar is.
 */
function clears(policy: (typeof SURFACE_POLICIES)[string], slot: number): number {
  return Math.min(1, thresholdAt(policy, slot) + 0.05);
}

/**
 * A profile with the team posterior forced to a chosen shape.
 *
 * Written directly rather than folded from events on purpose. What is under
 * test is the gate's reading of a profile, not the fold's ability to produce
 * one, and driving the posterior through clicks would couple every assertion
 * here to intent.ts's decay constants.
 */
function loyalist(team: TeamId, posterior: number, confidence: number): VisitorProfile {
  const base = createProfile('gate-test');
  const dist = base.affinities.team;
  const rest = (1 - posterior) / 5;
  const forced = Object.fromEntries(
    Object.keys(dist.posterior).map((t) => [t, t === team ? posterior : rest])
  ) as Record<TeamId, number>;

  return {
    ...base,
    affinities: {
      ...base.affinities,
      team: {
        ...dist,
        posterior: forced,
        top: team,
        confidence: { ...dist.confidence, value: confidence },
      },
    },
  };
}

/* ------------------------------------------------------- the rivalry graph -- */

test('same-city clubs are not rivals, which is the error the graph exists to prevent', () => {
  // An Eagles loyalist is MORE likely to buy a Phillies cap, not less. If
  // "different club" ever starts reading as "rival", this is the assertion
  // that catches it.
  assert.equal(rivalryBetween('Eagles', 'Phillies'), null);
  assert.equal(rivalryBetween('Eagles', '76ers'), null);
  assert.equal(rivalryBetween('76ers', 'Phillies'), null);
});

test('a club with no rival in the catalog returns an empty list rather than a guess', () => {
  assert.deepEqual(rivalsOf('Phillies'), []);
});

test('the graph is undirected: every edge reads the same from both ends', () => {
  for (const r of RIVALRIES) {
    const fromA = rivalsOf(r.a).find((x) => x.team === r.b);
    const fromB = rivalsOf(r.b).find((x) => x.team === r.a);
    assert.ok(fromA && fromB, `${r.a}/${r.b} missing from one side`);
    assert.equal(fromA!.intensity, fromB!.intensity);
  }
});

/* ------------------------------------------------------------- loyalty -- */

test('a peaked posterior on thin evidence is not a loyalist', () => {
  // One click gives a peaked distribution over six clubs. Both terms are
  // required precisely so that this case does not censor anything.
  const ctx = suppressionContext(loyalist('Eagles', 0.9, LOYALIST_CONFIDENCE_FLOOR - 0.05));
  assert.equal(ctx.loyalty, null);
  assert.deepEqual(ctx.rivals, []);
});

test('a confident but split shopper is not a loyalist either', () => {
  const ctx = suppressionContext(loyalist('Eagles', LOYALIST_POSTERIOR_FLOOR - 0.05, 0.9));
  assert.equal(ctx.loyalty, null);
});

test('clearing both floors makes the rivalry rule live', () => {
  const ctx = suppressionContext(
    loyalist('Eagles', LOYALIST_POSTERIOR_FLOOR + 0.05, LOYALIST_CONFIDENCE_FLOOR + 0.05)
  );
  assert.equal(ctx.loyalty?.team, 'Eagles');
  assert.deepEqual(ctx.rivals.map((r) => r.team).sort(), ['Chiefs', 'Cowboys']);
});

test('personalization off is inert - the gate cuts nothing at all', () => {
  const ctx = suppressionContext(loyalist('Eagles', 0.9, 0.9), { personalized: false });
  const cands = [candidate(product({ team: 'Cowboys' }), 0.9), candidate(product({ team: 'Eagles' }), 0.8)];
  const result = applySuppression(cands, ctx, SURFACE_POLICIES.pdp_similar);

  assert.equal(result.fired, false);
  assert.equal(result.suppressed.length, 0);
  assert.equal(result.kept.length, 2);
});

/* ------------------------------------------------------------- rivalry -- */

test('no score buys a rival past the gate', () => {
  const ctx = suppressionContext(loyalist('Eagles', 0.85, 0.8));
  const rival = product({ team: 'Cowboys' });
  const own = product({ team: 'Eagles' });
  // The rival is the strongest thing in the pool and the loyal item only just
  // clears its slot. The point is that the ordering of the two rules is not
  // negotiable by score.
  const result = applySuppression(
    [candidate(rival, 1.0), candidate(own, clears(SURFACE_POLICIES.pdp_similar, 1))],
    ctx,
    SURFACE_POLICIES.pdp_similar
  );

  assert.deepEqual(result.kept.map((k) => k.product.id), [own.id]);
  assert.equal(result.suppressed[0]?.rule, 'rivalry');
  // The panel prints this string. It has to carry the number it gated on.
  assert.match(result.suppressed[0]!.reason, /intensity 0\.95/);
});

test('a rivalry below the intensity floor is spared, and the context says so', () => {
  const ctx = suppressionContext(loyalist('Cowboys', 0.85, 0.8));
  const chiefs = product({ team: 'Chiefs' });
  const result = applySuppression([candidate(chiefs, 0.9)], ctx, SURFACE_POLICIES.pdp_similar);

  assert.equal(result.suppressed.length, 0);
  assert.ok(rivalryBetween('Cowboys', 'Chiefs')!.intensity < RIVALRY_SUPPRESSION_FLOOR);
  assert.deepEqual(ctx.spared.map((r) => r.team), ['Chiefs']);
});

/* ------------------------------------------------------------ ownership -- */

function owned(profile: VisitorProfile, productId: string, daysAgo: number, gift = false) {
  return {
    ...profile,
    state: {
      ...profile.state,
      recentPurchases: [{ productId, ts: 0, daysAgo, gift }],
    },
  };
}

test('something bought inside the window is withheld', () => {
  const jersey = product();
  const ctx = suppressionContext(owned(createProfile('own'), jersey.id, 30));
  const result = applySuppression([candidate(jersey, 0.9)], ctx, SURFACE_POLICIES.pdp_similar);

  assert.equal(result.suppressed[0]?.rule, 'recent_purchase');
});

test('the window has an outside edge', () => {
  const jersey = product();
  const ctx = suppressionContext(
    owned(createProfile('own'), jersey.id, RECENT_PURCHASE_WINDOW_DAYS + 1)
  );
  const result = applySuppression([candidate(jersey, 0.9)], ctx, SURFACE_POLICIES.pdp_similar);

  assert.equal(result.suppressed.length, 0);
});

test('a consumable is exempt: socks wear out, jerseys do not', () => {
  const socks = product({ department: 'Accessories', subdepartment: 'Socks' });
  const ctx = suppressionContext(owned(createProfile('own'), socks.id, 30));
  const result = applySuppression([candidate(socks, 0.9)], ctx, SURFACE_POLICIES.pdp_similar);

  assert.equal(result.suppressed.length, 0);
  assert.equal(result.kept.length, 1);
});

test('a youth jersey is exempt, because a child outgrows one inside a season', () => {
  const youth = product({ department: 'Kids', subdepartment: 'Youth Jersey' });
  const ctx = suppressionContext(owned(createProfile('own'), youth.id, 60));
  assert.equal(applySuppression([candidate(youth, 0.9)], ctx, SURFACE_POLICIES.pdp_similar).suppressed.length, 0);
});

test('an order that shipped elsewhere lifts the ownership rule entirely', () => {
  const jersey = product();
  const ctx = suppressionContext(owned(createProfile('own'), jersey.id, 30, true));
  const result = applySuppression([candidate(jersey, 0.9)], ctx, SURFACE_POLICIES.pdp_similar);

  assert.equal(result.suppressed.length, 0);
  assert.equal(result.kept.length, 1);
});

/* -------------------------------------------------------------- fatigue -- */

function fatigued(profile: VisitorProfile, productId: string, shows: number): VisitorProfile {
  return { ...profile, state: { ...profile.state, impressionFatigue: { [productId]: shows } } };
}

test('fatigue demotes before it excludes - "not yet" is not "never"', () => {
  const seen = product({ id: 'seen' });
  const fresh = product({ id: 'fresh' });
  const ctx = suppressionContext(fatigued(createProfile('f'), 'seen', 1));

  // Both clear the rail on their own merits; `seen` starts ahead. What the
  // penalty has to do is swap them without removing either.
  const result = applySuppression(
    [candidate(seen, 1.0), candidate(fresh, clears(SURFACE_POLICIES.pdp_similar, 1))],
    ctx,
    SURFACE_POLICIES.pdp_similar
  );

  // Still served - just no longer first. The strong candidate survives one
  // ignored showing, which is what makes the penalty multiplicative rather
  // than a second exclusion rule wearing a different name.
  assert.deepEqual(result.kept.map((k) => k.product.id), ['fresh', 'seen']);
  assert.equal(result.suppressed.length, 0);
  assert.equal(result.demoted[0]?.product.id, 'seen');
  assert.ok(result.demoted[0]!.to < result.demoted[0]!.from);
});

test('a marginal candidate does not survive what a strong one does', () => {
  // Same single ignored impression, weaker starting score: the demotion drops
  // it under the bar for the slot it would have taken. Fatigue and the floor
  // compose, and the entry names the floor, because the floor is what cut it.
  const seen = product({ id: 'seen' });
  const ctx = suppressionContext(fatigued(createProfile('f'), 'seen', 2));
  const result = applySuppression([candidate(seen, 0.9)], ctx, SURFACE_POLICIES.pdp_similar);

  assert.equal(result.kept.length, 0);
  assert.equal(result.suppressed[0]?.rule, 'confidence_floor');
  assert.ok(result.suppressed[0]!.scored! < 0.9);
});

test('past the ceiling it is withheld outright', () => {
  const seen = product({ id: 'seen' });
  const ctx = suppressionContext(fatigued(createProfile('f'), 'seen', FATIGUE_CEILING));
  const result = applySuppression([candidate(seen, 1.0)], ctx, SURFACE_POLICIES.pdp_similar);

  assert.equal(result.suppressed[0]?.rule, 'fatigue');
});

test('a click clears the count, so fatigue means disinterest and not exposure', async () => {
  const { applyEvent, applyImpressions } = await import('./profile');
  let profile = createProfile('clicker');

  profile = applyImpressions(profile, ['p-hot', 'p-cold'], { now: 1 }).profile;
  profile = applyImpressions(profile, ['p-hot', 'p-cold'], { now: 1 }).profile;
  assert.equal(profile.state.impressionFatigue['p-hot'], 2);

  profile = applyEvent(
    profile,
    { id: 'e1', timestamp: '', pageType: 'PDP', action: 'view', productId: 'p-hot' },
    { now: 2, ticks: 1 }
  ).profile;

  assert.equal(profile.state.impressionFatigue['p-hot'], undefined);
  assert.ok((profile.state.impressionFatigue['p-cold'] ?? 0) > 0);
});

/* ---------------------------------------------------- per-surface thresholds -- */

/** Where a threshold sits inside the operating range of its own engine, 0..1. */
function severity(policy: (typeof SURFACE_POLICIES)[string], slot: number): number {
  const { lo, hi } = SCALE_RANGE[policy.scale];
  return (thresholdAt(policy, slot) - lo) / (hi - lo);
}

test('a hero demands more than the tail of a carousel', () => {
  // COMPARED THROUGH THEIR SCALES, NOT AS BARE NUMBERS. This assertion used to
  // read `hero.leadThreshold > home_carousel.tailThreshold` and it passed for a
  // while by luck: the hero is denominated in an intent posterior and the
  // carousel in catalog popularity, and the two happened to be 0.72 and 0.30.
  // Recalibrating the carousel to its real scale put both at 0.72 and the
  // assertion inverted without anything about the policy changing. What the
  // surfaces actually differ on is how far up their own engine's range the bar
  // sits, which is the only sense in which "the hero asks for more" is a fact.
  assert.ok(
    severity(SURFACE_POLICIES.hero, 1) >
      severity(SURFACE_POLICIES.home_carousel, SURFACE_POLICIES.home_carousel.slots)
  );
});

test('no policy sets a bar its own engine cannot clear, or one it always clears', () => {
  // THE TEST THIS FILE MOST NEEDED AND DID NOT HAVE. A threshold at or above
  // its scale's ceiling empties the rail for every shopper; one at or below the
  // floor is a gate that never fires. Both look fine on screen - the first is
  // an absent rail, the second a rail that was never filtered - and both
  // shipped here at once: `pdp_complement` sat at 0.50 against a conditional
  // whose median is 0.24 and refused everything, while `pdp_similar` sat at
  // 0.45 against a cosine that never goes below 0.59 and refused nothing.
  for (const [id, policy] of Object.entries(SURFACE_POLICIES)) {
    const { lo, hi } = SCALE_RANGE[policy.scale];
    for (const slot of [1, policy.slots]) {
      const bar = thresholdAt(policy, slot);
      assert.ok(bar > lo, `${id} slot ${slot}: bar ${bar} is at or below the ${policy.scale} floor ${lo} - inert gate`);
      assert.ok(bar < hi, `${id} slot ${slot}: bar ${bar} is at or above the ${policy.scale} ceiling ${hi} - empties the rail`);
    }
  }
});

test('the bar falls monotonically across a rail', () => {
  const policy = SURFACE_POLICIES.home_carousel;
  for (let i = 2; i <= policy.slots; i++) {
    assert.ok(thresholdAt(policy, i) <= thresholdAt(policy, i - 1));
  }
});

test('the threshold belongs to the slot, not to the candidate that arrived in it', () => {
  // The lead candidate is cut, so the runner-up is promoted into slot 1 - and
  // has to clear slot 1's bar, not the one it would have faced at slot 2.
  const ctx = suppressionContext(loyalist('Eagles', 0.85, 0.8));
  const rival = product({ team: 'Cowboys' });
  const weak = product({ team: 'Eagles' });
  const policy = SURFACE_POLICIES.cart_crosssell;

  const between = (thresholdAt(policy, 1) + thresholdAt(policy, 2)) / 2;
  const result = applySuppression(
    [candidate(rival, 0.99), candidate(weak, between)],
    ctx,
    policy
  );

  assert.equal(result.kept.length, 0);
  assert.equal(result.suppressed.length, 2);
  const floor = result.suppressed.find((s) => s.rule === 'confidence_floor');
  assert.equal(floor?.position, 1);
  assert.equal(floor?.required, thresholdAt(policy, 1));
});

test('an unfillable rail serves fewer slots rather than filling them with anything', () => {
  const ctx = suppressionContext(createProfile('cold'));
  const policy = SURFACE_POLICIES.cart_crosssell;
  const result = applySuppression(
    [candidate(product(), 0.1), candidate(product(), 0.05)],
    ctx,
    policy
  );

  assert.equal(result.kept.length, 0);
  assert.equal(result.withheld, policy.slots);
});

/* ------------------------------------------------------------ the pairing -- */

test('the unsuppressed order is carried alongside, so the difference is a count', () => {
  const ctx = suppressionContext(loyalist('Eagles', 0.8, 0.8));
  const rival = product({ team: 'Cowboys' });
  const own = product({ team: 'Eagles' });
  const result = applySuppression(
    [candidate(rival, 1.0), candidate(own, clears(SURFACE_POLICIES.pdp_similar, 1))],
    ctx,
    SURFACE_POLICIES.pdp_similar
  );

  assert.deepEqual(result.unsuppressed.map((c) => c.product.id), [rival.id, own.id]);
  assert.deepEqual(result.kept.map((c) => c.product.id), [own.id]);
});

test('a gate that refused nothing writes nothing to the ledger', async () => {
  const { suppressionEffort } = await import('./suppression');
  const ctx = suppressionContext(createProfile('cold'));
  const result = applySuppression([candidate(product(), 0.9)], ctx, SURFACE_POLICIES.pdp_similar);

  assert.equal(suppressionEffort(result, { id: 'x', eventId: null }), null);
});

test('a gate that refused something writes exactly what it refused', async () => {
  const { suppressionEffort } = await import('./suppression');
  const ctx = suppressionContext(loyalist('Eagles', 0.85, 0.8));
  const result = applySuppression(
    [
      candidate(product({ team: 'Cowboys' }), 1.0),
      candidate(product({ team: 'Eagles' }), clears(SURFACE_POLICIES.pdp_similar, 1)),
    ],
    ctx,
    SURFACE_POLICIES.pdp_similar
  );
  const entry = suppressionEffort(result, { id: 'x', eventId: 'e1' })!;

  assert.equal(entry.kind, 'suppressed_impression');
  assert.equal(entry.count, 1);
  assert.equal(entry.avoided, true);
  assert.match(entry.detail!, /rival club/i);
});

/* ------------------------------------------------- the rivalry stand-down -- */

test('a shopper who opened a rival\'s product still gets that page', () => {
  // The failure this prevents: an Eagles loyalist opens a Cowboys jersey and
  // gets a blank page, because every neighbour of a Cowboys jersey is a
  // Cowboys product. Measured across the catalog, an anchor-blind rule emptied
  // about 40% of product-page rails for a confident loyalist.
  const ctx = suppressionContext(loyalist('Eagles', 0.85, 0.8));
  const anchor = product({ team: 'Cowboys' });
  const neighbour = product({ team: 'Cowboys' });

  const blind = applySuppression([candidate(neighbour, 1.0)], ctx, SURFACE_POLICIES.pdp_similar);
  assert.equal(blind.kept.length, 0);
  assert.equal(blind.suppressed[0]?.rule, 'rivalry');

  const anchored = applySuppression([candidate(neighbour, 1.0)], ctx, SURFACE_POLICIES.pdp_similar, {
    anchor,
  });
  assert.deepEqual(anchored.kept.map((k) => k.product.id), [neighbour.id]);
  assert.equal(anchored.suppressed.length, 0);
});

test('the stand-down is reported, not silent', () => {
  const ctx = suppressionContext(loyalist('Eagles', 0.85, 0.8));
  const result = applySuppression(
    [candidate(product({ team: 'Cowboys' }), 1.0)],
    ctx,
    SURFACE_POLICIES.pdp_similar,
    { anchor: product({ team: 'Cowboys' }) }
  );
  assert.deepEqual(result.rivalryStoodDown, { team: 'Cowboys', loyalTo: 'Eagles' });
});

test('standing down for one rival does not stand down for the other', () => {
  // The Eagles have two rivals. Opening a Cowboys page is an override of the
  // Cowboys read, and says nothing about the Chiefs.
  const ctx = suppressionContext(loyalist('Eagles', 0.85, 0.8));
  const chiefs = product({ team: 'Chiefs' });
  const cowboys = product({ team: 'Cowboys' });

  const result = applySuppression(
    [candidate(cowboys, 1.0), candidate(chiefs, 0.99)],
    ctx,
    SURFACE_POLICIES.pdp_similar,
    { anchor: product({ team: 'Cowboys' }) }
  );

  assert.deepEqual(result.kept.map((k) => k.product.id), [cowboys.id]);
  assert.equal(result.suppressed[0]?.product.id, chiefs.id);
  assert.equal(result.suppressed[0]?.rule, 'rivalry');
});

test('an anchor on a neutral club stands nothing down', () => {
  const ctx = suppressionContext(loyalist('Eagles', 0.85, 0.8));
  const result = applySuppression(
    [candidate(product({ team: 'Cowboys' }), 1.0)],
    ctx,
    SURFACE_POLICIES.pdp_similar,
    { anchor: product({ team: 'Lakers' }) }
  );
  assert.equal(result.rivalryStoodDown, null);
  assert.equal(result.suppressed[0]?.rule, 'rivalry');
});

test('the store-chosen surfaces get no anchor, so nothing can stand them down', () => {
  // The hero and the trending rail are the store's choices, not the shopper's.
  // There is no anchor to override anything with, and the rule is absolute.
  const ctx = suppressionContext(loyalist('Eagles', 0.85, 0.8));
  for (const policy of [SURFACE_POLICIES.hero, SURFACE_POLICIES.home_carousel]) {
    const result = applySuppression([candidate(product({ team: 'Cowboys' }), 1.0)], ctx, policy);
    assert.equal(result.rivalryStoodDown, null);
    assert.equal(result.suppressed[0]?.rule, 'rivalry', `${policy.id} let a rival through`);
  }
});

/* ------------------------------------------ calibration against real folds -- */

/**
 * THE TESTS ABOVE CANNOT CATCH A MISCALIBRATED FLOOR, AND ONE SHIPPED.
 *
 * `loyalist()` forces the posterior and the confidence to whatever a test needs,
 * which is right for testing the gate's logic and useless for testing its
 * numbers. `LOYALIST_CONFIDENCE_FLOOR` was 0.6 for a while, on the assumption
 * that confidence was posterior-like. It is not: `distConfidence` returns a
 * product of three sub-unit terms and no demo shopper ever reached 0.6, so the
 * rivalry rule could not fire for anyone. Every test above passed throughout.
 *
 * These fold the five demo scenarios' own events, at every rung of the identity
 * ladder, and assert which of them the gate reads as a loyalist. They are the
 * assertions that fail if either floor drifts off the scale it is measured in.
 */

const LOYALIST_SCENARIOS = new Set(['returning_eagles', 'hot_market']);

test('the gate agrees with the demo about who is a loyalist, at every identity rung', async () => {
  const { buildScenarios } = await import('../data/scenarios');
  const { buildProfile } = await import('./profile');
  const { demoSeedFor } = await import('./identity');
  const rungs = ['anonymous', 'contextual', 'returning', 'identified', 'member'] as const;

  for (const scenario of buildScenarios()) {
    const expected = LOYALIST_SCENARIOS.has(scenario.id);
    for (const rung of rungs) {
      const profile = buildProfile(
        scenario,
        scenario.recentEvents,
        { now: 0 },
        demoSeedFor(scenario, rung)
      ).profile;
      const ctx = suppressionContext(profile);
      const dist = profile.affinities.team;

      assert.equal(
        ctx.loyalty !== null,
        expected,
        `${scenario.id} at ${rung}: posterior ${(dist.posterior[dist.top] ?? 0).toFixed(3)}, ` +
          `confidence ${dist.confidence.value.toFixed(3)} - expected loyalist=${expected}`
      );
    }
  }
});

test('each floor is the one that separates its own scenario', async () => {
  const { buildScenarios } = await import('../data/scenarios');
  const { buildProfile } = await import('./profile');
  const { demoSeedFor } = await import('./identity');
  const read = (id: string, rung: 'contextual' | 'member') => {
    const scenario = buildScenarios().find((s) => s.id === id)!;
    const dist = buildProfile(scenario, scenario.recentEvents, { now: 0 }, demoSeedFor(scenario, rung))
      .profile.affinities.team;
    return { posterior: dist.posterior[dist.top] ?? 0, confidence: dist.confidence.value };
  };

  // The posterior floor is doing the work on the multi-team shopper. Confidence
  // cannot: as a known member theirs is higher than the Eagles fan's on arrival,
  // so a confidence-only rule would suppress a rival for the one shopper in the
  // set who demonstrably buys across clubs.
  const multi = read('multi_team', 'member');
  const eagles = read('returning_eagles', 'contextual');
  assert.ok(multi.posterior < LOYALIST_POSTERIOR_FLOOR, 'multi-team must fail the posterior floor');
  assert.ok(eagles.posterior >= LOYALIST_POSTERIOR_FLOOR, 'the Eagles fan must clear it on arrival');
  assert.ok(multi.confidence > eagles.confidence, 'the case the posterior floor exists to decide');

  // The confidence floor is doing the work on the visitor with one event, whose
  // posterior reads 0.71 off that single click.
  const anon = read('anonymous', 'contextual');
  assert.ok(anon.confidence < LOYALIST_CONFIDENCE_FLOOR, 'one event must fail the confidence floor');
  assert.ok(eagles.confidence >= LOYALIST_CONFIDENCE_FLOOR, 'five events must clear it');
});
