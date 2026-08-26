/**
 * Isolation between simulation arms, and the calendar properties that hold it up.
 *
 * The claim these tests exist to make runnable is narrow and specific: a market
 * event fired into one world cannot be observed from another. That claim is
 * cheap to assert in a comment and easy to break by accident, because the ways
 * it breaks are all invisible - a pushed array, a mutated roster entry, a shared
 * constant written through. So each of the three leak routes gets its own test
 * that would fail loudly if someone reintroduced the mutation.
 *
 * The fourth test is the one that matters commercially: two arms built from two
 * clocks produce two different worlds, and neither one is the world the
 * published metrics were measured under unless its clock says so.
 *
 * No DOM, no React. `npm test`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CLOCK,
  LEAGUE_SEASONALITY,
  SIM_MONTH,
  activeClock,
  advanceMonths,
  departmentDemand,
  effectAt,
  fireTemplate,
  phaseOf,
  resetClock,
  rosterAt,
  seasonality,
  teamDemand,
  teamOfPlayer,
  withEvent,
} from './clock';
import { TEAMS, TEAM_BY_ID } from './taxonomy';
import { generateCatalog } from './catalog';
import { buildWorld } from './dataset';

const TRADE = fireTemplate(
  { kind: 'TRADE', player: 'Jalen Hurts', fromTeam: 'Eagles', toTeam: 'Cowboys', newNumber: '4' },
  DEFAULT_CLOCK,
  1
);
const TITLE = fireTemplate({ kind: 'CHAMPIONSHIP', team: 'Lakers', title: 'NBA Finals' }, DEFAULT_CLOCK, 2);

/* ------------------------------------------------------------- the calendar -- */

test('the default clock reproduces the month every published metric was measured at', () => {
  assert.equal(DEFAULT_CLOCK.month, SIM_MONTH);
  assert.equal(DEFAULT_CLOCK.events.length, 0);
  // The seasonality lookup and the old constant-index read must agree exactly,
  // or the migration out of taxonomy.ts silently moved every prior in the app.
  for (const league of ['NFL', 'NBA', 'MLB'] as const) {
    assert.equal(seasonality(league, DEFAULT_CLOCK), LEAGUE_SEASONALITY[league][SIM_MONTH]);
  }
});

test('a quiet clock applies no lift at all, so an unfired world is the measured world', () => {
  for (const team of TEAMS) assert.equal(teamDemand(team.id, DEFAULT_CLOCK), 1);
  assert.equal(departmentDemand('Jerseys', DEFAULT_CLOCK), 1);
  assert.equal(departmentDemand('Hats', DEFAULT_CLOCK), 1);
});

test('the calendar phases follow the seasonality curve rather than a second table', () => {
  // September: the NFL at its own peak, the NBA still in the run-up. Note that
  // the phase is relative to each league's OWN curve, which is the point - an
  // NBA September of 0.4 is a quiet month for the NBA, not a quiet month in
  // absolute terms, and merchandising decisions are made per league.
  assert.equal(phaseOf('NFL', DEFAULT_CLOCK), 'peak');
  assert.equal(phaseOf('NBA', DEFAULT_CLOCK), 'preseason');
  assert.equal(phaseOf('MLB', DEFAULT_CLOCK), 'peak');
  // March: the reverse for the NFL.
  const march = advanceMonths(DEFAULT_CLOCK, -6);
  assert.equal(march.month, 2);
  assert.equal(phaseOf('NFL', march), 'offseason');
});

test('a lift decays toward 1 as the clock moves past the event, and never past it', () => {
  const fired = withEvent(DEFAULT_CLOCK, TITLE);
  const atFiring = effectAt(TITLE, fired).teamLift;
  const oneHalfLife = effectAt(TITLE, advanceMonths(fired, 6)).teamLift;
  const longAfter = effectAt(TITLE, advanceMonths(fired, 60)).teamLift;

  assert.ok(atFiring > 1.9, `expected the full lift at firing, got ${atFiring}`);
  // One half-life removes half the EXCESS over 1, not half the multiplier.
  assert.ok(Math.abs(oneHalfLife - (1 + (atFiring - 1) / 2)) < 1e-9);
  assert.ok(longAfter > 1 && longAfter < 1.01, `expected decay toward 1, got ${longAfter}`);
});

/* -------------------------------------------------------------- leak route 1 -- */

test('firing an event returns a new clock and leaves the old one untouched', () => {
  const before = DEFAULT_CLOCK;
  const after = withEvent(before, TRADE);

  assert.equal(before.events.length, 0, 'the pre-event clock grew an event');
  assert.equal(after.events.length, 1);
  assert.notEqual(before, after, 'withEvent returned the same object');

  // And the arms genuinely diverge rather than converging on a shared log.
  const armA = withEvent(DEFAULT_CLOCK, TRADE);
  const armB = withEvent(DEFAULT_CLOCK, TITLE);
  assert.equal(armA.events.length, 1);
  assert.equal(armB.events.length, 1);
  assert.equal(armA.events[0].kind, 'TRADE');
  assert.equal(armB.events[0].kind, 'CHAMPIONSHIP');
});

/* -------------------------------------------------------------- leak route 2 -- */

test('a trade folds into a fresh roster and never writes to TEAMS', () => {
  const eaglesBefore = TEAM_BY_ID.Eagles.players.map((p) => p.name);
  const traded = withEvent(DEFAULT_CLOCK, TRADE);

  assert.equal(teamOfPlayer('Jalen Hurts', traded), 'Cowboys');
  assert.equal(teamOfPlayer('Jalen Hurts', DEFAULT_CLOCK), 'Eagles');

  // The frozen taxonomy is the shared object every arm reads. If the fold wrote
  // through it, this is the assertion that catches it.
  assert.deepEqual(TEAM_BY_ID.Eagles.players.map((p) => p.name), eaglesBefore);

  // And the fold is not cached either: two calls give two tables.
  const t1 = rosterAt(traded);
  const t2 = rosterAt(traded);
  assert.notEqual(t1.Cowboys, t2.Cowboys, 'rosterAt handed out the same array twice');
  t1.Cowboys.push({ name: 'Ghost', number: '00', popularity: 1 });
  assert.ok(!rosterAt(traded).Cowboys.some((p) => p.name === 'Ghost'));
});

/* -------------------------------------------------------------- leak route 3 -- */

test('the seasonality curve is frozen at both levels', () => {
  assert.ok(Object.isFrozen(LEAGUE_SEASONALITY));
  assert.ok(Object.isFrozen(LEAGUE_SEASONALITY.NFL));
  assert.throws(() => {
    (LEAGUE_SEASONALITY.NFL as number[])[SIM_MONTH] = 0;
  }, TypeError);
});

/* --------------------------------------------------- the arms, end to end -- */

test('a catalog built under one clock is unreachable from another', () => {
  const quiet = generateCatalog(undefined, DEFAULT_CLOCK);
  const traded = generateCatalog(undefined, withEvent(DEFAULT_CLOCK, TRADE));

  const hurtsInQuiet = quiet.filter((p) => p.player === 'Jalen Hurts');
  const hurtsInTraded = traded.filter((p) => p.player === 'Jalen Hurts');

  assert.ok(hurtsInQuiet.length > 0, 'the fixture player has no products to move');
  assert.equal(hurtsInQuiet.length, hurtsInTraded.length, 'the trade added or dropped products');

  // The arm that fired the trade moved them; the arm that did not, did not.
  assert.ok(hurtsInQuiet.every((p) => p.team === 'Eagles'));
  assert.ok(hurtsInTraded.every((p) => p.team === 'Cowboys'));
  assert.ok(hurtsInQuiet.every((p) => p.marketFlag === undefined));
  assert.ok(hurtsInTraded.every((p) => p.marketFlag?.kind === 'TRADE'));

  // Ids survive the move. This is what lets a cart hold a product across an
  // event, and it is the reason the market pass is a rewrite rather than a
  // regeneration.
  assert.deepEqual(
    hurtsInTraded.map((p) => p.id).sort(),
    hurtsInQuiet.map((p) => p.id).sort()
  );
  assert.ok(hurtsInTraded.every((p) => p.movedFrom?.team === 'Eagles'));

  // Untouched products are shared by reference between the two catalogs, which
  // is only safe because nothing writes to a Product. Assert the sharing so the
  // day someone adds a mutation, this test is standing there.
  const untouchedQuiet = quiet.find((p) => p.team === 'Chiefs' && p.player === undefined)!;
  const untouchedTraded = traded.find((p) => p.id === untouchedQuiet.id)!;
  assert.equal(untouchedQuiet.popularity, untouchedTraded.popularity);
});

test('two worlds built from two clocks disagree, and neither disturbs the active clock', () => {
  resetClock();
  const activeBefore = activeClock();

  const armA = buildWorld(withEvent(DEFAULT_CLOCK, TRADE));
  const armB = buildWorld(DEFAULT_CLOCK);

  // The active clock is a default, not a dependency: building two arms through
  // it explicitly must not have moved it.
  assert.equal(activeClock(), activeBefore);
  assert.equal(activeClock().events.length, 0);

  // The arms really are different worlds, all the way down to the graphs. The
  // co-order priors for the moved items are re-estimated rather than re-sorted,
  // which is only true because the population was re-simulated under the new
  // market - so the check is on the graph, not on the catalog.
  // `movedFrom` rather than `marketFlag.kind`: the flag records WHICH event
  // touched a product, and a trade touches both clubs' whole assortments through
  // the demand terms. Only the transferred items carry a previous club.
  const moved = armA.products.find((p) => p.movedFrom !== undefined);
  assert.ok(moved, 'arm A has no transferred product');
  const movedId = moved!.id;
  assert.equal(armB.productById.get(movedId)!.team, 'Eagles');
  assert.equal(armA.productById.get(movedId)!.team, 'Cowboys');

  const degreeA = armA.graphScores.get(movedId)?.coOrder ?? 0;
  const degreeB = armB.graphScores.get(movedId)?.coOrder ?? 0;
  assert.notEqual(degreeA, degreeB, 'the co-order graph did not re-estimate under the new market');

  // Arm B is still the measured world: same clock in, same catalog size out.
  assert.equal(armB.clock, DEFAULT_CLOCK);
  assert.equal(armA.products.length, armB.products.length);
});
