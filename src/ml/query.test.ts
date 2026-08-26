/**
 * Query understanding, retrieval and the rescue ladder.
 *
 * These are the claims the search box makes on screen, asserted against the
 * real generated catalog rather than a fixture, because the whole point of
 * mapping onto a taxonomy is that the mapping can be checked. Three of them
 * are the brief's own examples: a player name reaching the player axis,
 * "jersey" reaching a department, and "something for my son" reaching Kids
 * plus gift intent.
 *
 * The rescue tests are the ones worth having. A search that returns nothing is
 * the failure a shopper actually meets, and the property that matters is not
 * "it returns something" - it is that what it returns is explained, that the
 * constraint it gave up on was the least certain one, and that giving up on a
 * constraint downgrades it to a ranking signal rather than deleting it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { constraintsFrom, interpretQuery, runQuery, suggest } from './query';
import { getDataset } from '../sim/dataset';
import { applyEvent, createProfile } from './profile';
import type { UserEvent } from '../types';

const { products } = getDataset();
const anon = { profile: null, personalized: false };

const nodeFor = (q: string, kind: string) => interpretQuery(q).nodes.filter((n) => n.kind === kind);

test('a player name maps onto the player axis and propagates to club and league', () => {
  const i = interpretQuery('hurts jersey');
  const player = i.nodes.find((n) => n.kind === 'player');
  assert.equal(player?.value, 'Jalen Hurts');
  assert.equal(player?.via, 'surname');

  const team = i.nodes.find((n) => n.kind === 'team');
  assert.equal(team?.value, 'Eagles');
  assert.equal(team?.via, 'propagated');
  // Damped, not copied: the club is inferred from the player, and the
  // confidence has to say so.
  assert.ok(team!.confidence < player!.confidence);

  const league = i.nodes.find((n) => n.kind === 'league');
  assert.equal(league?.value, 'NFL');
  assert.ok(league!.confidence < team!.confidence);
});

test('"jersey" maps onto the Jerseys department, not onto product names', () => {
  const depts = nodeFor('jersey', 'department');
  assert.equal(depts.length, 1);
  assert.equal(depts[0].value, 'Jerseys');
  assert.equal(depts[0].via, 'synonym');

  const r = runQuery(products, 'jersey', anon);
  assert.ok(r.matched.length > 0);
  assert.ok(r.matched.every((p) => p.department === 'Jerseys'));
});

test('"something for my son" maps onto Kids plus gift intent', () => {
  const i = interpretQuery('something for my son');
  assert.equal(i.giftIntent, true);
  assert.deepEqual(
    i.nodes.filter((n) => n.kind === 'department').map((n) => n.value),
    ['Kids']
  );
  // "something" is filler, not a failure to understand.
  assert.deepEqual(i.unmatched, []);

  const r = runQuery(products, 'something for my son', anon);
  assert.ok(r.matched.length > 0);
  assert.ok(r.matched.every((p) => p.department === 'Kids'));
});

test('an ambiguous word keeps every meaning it has', () => {
  // Philadelphia fields three clubs in this catalog. Resolving it to one of
  // them was a real bug: the first lexicon entry consumed the span.
  const teams = nodeFor('philadelphia hoodie', 'team').map((n) => n.value).sort();
  assert.deepEqual(teams, ['76ers', 'Eagles', 'Phillies']);
  // And an ambiguous span is believed less than an unambiguous one.
  assert.ok(nodeFor('philadelphia hoodie', 'team')[0].confidence < nodeFor('eagles hoodie', 'team')[0].confidence);
});

test('a price ceiling is a constraint, and a vague one says it is an assumption', () => {
  const exact = nodeFor('cap under $40', 'priceCeiling')[0];
  assert.equal(exact.value, '40');
  assert.ok(exact.confidence > 0.8);

  const vague = nodeFor('cheap hat', 'priceCeiling')[0];
  assert.ok(vague.confidence < 0.5, 'a number nobody typed cannot be believed like one they did');
  assert.match(vague.note, /stated assumption/);

  const r = runQuery(products, 'cap under $40', anon);
  assert.ok(r.matched.length > 0);
  assert.ok(r.matched.every((p) => (p.salePrice ?? p.price) <= 40));
});

test('a query that matches nothing drops its least certain constraint first', () => {
  const r = runQuery(products, 'hurts beanie', anon);
  assert.equal(r.matchedBeforeRescue, 0);
  assert.ok(r.matched.length > 0);
  assert.equal(r.rescue?.kind, 'relaxed');

  // Weakest first, strictly increasing in confidence as the ladder climbs.
  const confidences = r.rescue!.steps.map((s) => s.constraint.confidence);
  for (let i = 1; i < confidences.length; i += 1) {
    assert.ok(confidences[i] >= confidences[i - 1], 'the ladder must climb, not wander');
  }
  // The last rung is the one that actually produced results.
  assert.ok(r.rescue!.steps[r.rescue!.steps.length - 1].matchesAfter > 0);
  assert.ok(r.rescue!.steps.slice(0, -1).every((s) => s.matchesAfter === 0));
});

test('a dropped constraint becomes a ranking credit rather than disappearing', () => {
  const r = runQuery(products, 'hurts beanie', anon);
  // Player came off, so Hurts stock cannot be required - but it must still
  // outrank stock by anyone else, otherwise relaxing the query threw away the
  // only thing the shopper actually said.
  const firstHurts = r.matched.findIndex((p) => p.player === 'Jalen Hurts');
  const firstOther = r.matched.findIndex((p) => p.player && p.player !== 'Jalen Hurts');
  if (firstHurts >= 0 && firstOther >= 0) assert.ok(firstHurts < firstOther);
  assert.ok(r.hits[0].score.soft > 0);
});

test('a query with no taxonomy match falls back to the profile, not to an empty page', () => {
  const r = runQuery(products, 'xyzzy plugh', anon);
  assert.equal(r.matchedBeforeRescue, 0);
  assert.equal(r.rescue?.kind, 'profile');
  assert.equal(r.matched.length, products.length);
  assert.deepEqual(r.interpretation.unmatched, ['xyzzy', 'plugh']);
});

/* -------------------------------------------------------------- ranking -- */

const eaglesEvents: UserEvent[] = [
  { id: 'e1', timestamp: 'x', pageType: 'PLP', action: 'browse', team: 'Eagles', league: 'NFL', department: 'Jerseys' },
  {
    id: 'e2',
    timestamp: 'x',
    pageType: 'PDP',
    action: 'view',
    team: 'Eagles',
    league: 'NFL',
    department: 'Jerseys',
    productId: 'p1',
    productName: 'Philadelphia Eagles Jalen Hurts Kelly Green Nike Game Jersey',
  },
];

const eaglesProfile = eaglesEvents.reduce((p, e) => applyEvent(p, e).profile, createProfile('t', 'anonymous'));

test('the profile reorders results without changing which results there are', () => {
  const off = runQuery(products, 'jersey', { profile: eaglesProfile, personalized: false });
  const on = runQuery(products, 'jersey', { profile: eaglesProfile, personalized: true });

  assert.deepEqual(
    off.matched.map((p) => p.id).sort(),
    on.matched.map((p) => p.id).sort(),
    'personalization is a sort, not a filter'
  );
  assert.equal(on.matched[0].team, 'Eagles');
  assert.notEqual(off.matched.map((p) => p.id).join(), on.matched.map((p) => p.id).join());
});

test('gift intent withdraws the shopper own-player term', () => {
  const withGift = runQuery(products, 'jersey gift', { profile: eaglesProfile, personalized: true });
  const without = runQuery(products, 'jersey', { profile: eaglesProfile, personalized: true });

  const playerDriver = (r: typeof withGift) =>
    r.hits[0].score.drivers.some((d) => d.label.startsWith('P(Jalen Hurts'));
  assert.equal(playerDriver(without), true, 'the player term applies when shopping for yourself');
  assert.equal(playerDriver(withGift), false, 'and is withdrawn when the query says it is for somebody else');
});

/* --------------------------------------------------------- autocomplete -- */

test('autocomplete is ranked by the profile and carries the order it displaced', () => {
  const s = suggest(products, 'jersey', { profile: eaglesProfile, personalized: true });
  const scopes = s.suggestions.filter((x) => x.kind === 'scope');
  assert.ok(scopes.length > 0);
  assert.equal(scopes[0].scope.team, 'Eagles');
  // Every row knows where it would have been without the profile, which is
  // what the effort ledger reads when one is chosen.
  assert.ok(s.suggestions.every((x) => x.rank > 0 && x.defaultRank > 0));
  assert.ok(scopes.some((x) => x.rank !== x.defaultRank), 'a profile that changes nothing is not being used');
});

test('autocomplete completes a word the shopper has not finished', () => {
  const s = suggest(products, 'hur', { profile: eaglesProfile, personalized: true });
  assert.ok(s.suggestions.some((x) => x.scope.player === 'Jalen Hurts'));
});

test('constraints are grouped one per axis and OR-ed within it', () => {
  const cs = constraintsFrom(interpretQuery('philadelphia jersey'));
  const team = cs.find((c) => c.kind === 'team');
  assert.equal(team?.values.length, 3);
  assert.equal(cs.filter((c) => c.kind === 'team').length, 1);
  // Gift intent is a modifier, never a filter - it would match nothing.
  assert.equal(constraintsFrom(interpretQuery('gift')).length, 0);
});
