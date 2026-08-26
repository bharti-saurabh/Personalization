/**
 * Properties of the fold.
 *
 * These are not smoke tests. Each one pins a property the rest of the system
 * assumes and would silently violate if the arithmetic drifted: that an
 * unobserved profile is exactly its prior, that a single click cannot open the
 * activation gate, that confidence is earned rather than asserted, that old
 * evidence really does fade, and that the same history always folds to the same
 * profile. The last one is what makes the demo reproducible and the harness
 * comparable across runs.
 *
 * Run with `npm test`. No DOM, no React - the same constraint the fold itself is
 * under.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { TEAM_IDS } from '../sim/taxonomy';
import { softmax } from '../sim/rng';
import { UserEvent } from '../types';
import {
  DECAY,
  applyEvent,
  buildProfile,
  createProfile,
  distConfidence,
  teamPrior,
} from './profile';
import { CONFIDENCE_THRESHOLD } from './intent';

let seq = 0;
function event(partial: Partial<UserEvent> = {}): UserEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    timestamp: '',
    pageType: 'PDP',
    action: 'view',
    ...partial,
  };
}

/** Folds a list oldest-first, one tick per event, from a clean prior. */
function fold(events: UserEvent[]) {
  let profile = createProfile('test-visitor');
  events.forEach((e, i) => {
    profile = applyEvent(profile, e, { now: i + 1, ticks: 1 }).profile;
  });
  return profile;
}

test('no evidence returns the prior, exactly', () => {
  const profile = createProfile('cold');
  const team = profile.affinities.team;

  const expected = softmax(TEAM_IDS.map((t) => Math.log(teamPrior(t))), 0.62);

  TEAM_IDS.forEach((t, i) => {
    assert.ok(
      Math.abs(team.posterior[t] - expected[i]) < 1e-9,
      `${t}: posterior ${team.posterior[t]} should be the prior ${expected[i]}`
    );
  });

  assert.equal(team.confidence.evidenceCount, 0);
  assert.equal(team.confidence.source, 'prior');
  // Floored, not zero: the model is always willing to say something, it is just
  // not willing to act on it.
  assert.equal(team.confidence.value, 0.02);
  assert.ok(team.confidence.value < CONFIDENCE_THRESHOLD);
});

test('one strong event moves the posterior but leaves the gate shut', () => {
  const cold = createProfile('one-event');
  const priorTop = cold.affinities.team.posterior.Eagles;

  const after = applyEvent(cold, event({ team: 'Eagles', department: 'Jerseys' })).profile;
  const team = after.affinities.team;

  assert.equal(team.top, 'Eagles');
  assert.ok(team.posterior.Eagles > priorTop + 0.2, 'a PDP view should visibly move the posterior');

  // The margin is wide after one observation - with a single event the leader
  // holds 100% of the evidence share, so of course it is clear of the field.
  // What holds the gate shut is sufficiency: one click is not enough evidence
  // to act on however unambiguous it is. The margin term is what bites when
  // evidence is plentiful but split, and it is tested on its own below.
  assert.ok(
    team.confidence.value < CONFIDENCE_THRESHOLD,
    `one event should not clear the ${CONFIDENCE_THRESHOLD} activation threshold, got ${team.confidence.value}`
  );
  assert.equal(team.confidence.evidenceCount, 1);
});

test('the confidence gate reads the margin, not the peak alone', () => {
  // Same evidence total, same leader height as near as the softmax allows: the
  // only difference is whether the runner-up is close. The old `top *
  // sufficiency` rule scored these identically.
  const clean = distConfidence(6, 0.6, 0.55);
  const split = distConfidence(6, 0.6, 0.02);

  assert.ok(split < clean, 'a 60/58 call must score below a 60/5 one');
  assert.ok(split < clean * 0.6, 'and the discount must be large enough to matter');

  // An unambiguous call reduces to exactly the old formula, so nothing that was
  // previously confident becomes mysteriously less so.
  const sufficiency = 1 - Math.exp(-6 / 2.0);
  assert.ok(Math.abs(distConfidence(6, 0.6, 0.6) - sufficiency * 0.6) < 1e-9);
});

test('repeated consistent events raise confidence monotonically', () => {
  let profile = createProfile('repeat');
  const seen: number[] = [profile.affinities.team.confidence.value];

  for (let i = 0; i < 8; i++) {
    profile = applyEvent(profile, event({ team: 'Eagles', department: 'Jerseys' }), {
      now: i + 1,
      ticks: 1,
    }).profile;
    seen.push(profile.affinities.team.confidence.value);
  }

  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i] >= seen[i - 1], `confidence fell at step ${i}: ${seen[i - 1]} -> ${seen[i]}`);
  }
  assert.ok(seen[seen.length - 1] > seen[0] + 0.4, 'eight consistent events should earn real confidence');
  assert.ok(
    profile.affinities.team.confidence.value > CONFIDENCE_THRESHOLD,
    'and should eventually clear the activation threshold'
  );
});

test('decay reduces the contribution of older evidence', () => {
  // One Eagles event, then three Cowboys events. The Eagles evidence should have
  // aged by exactly three ticks of the team decay constant - not approximately,
  // exactly, because the accumulator is what makes the fold equivalent to the
  // decayed sweep in intent.ts.
  const profile = fold([
    event({ team: 'Eagles' }),
    event({ team: 'Cowboys' }),
    event({ team: 'Cowboys' }),
    event({ team: 'Cowboys' }),
  ]);

  const eaglesEvidence = profile.affinities.team.evidence.Eagles;
  const expected = Math.exp(-DECAY.team * 3);

  assert.ok(
    Math.abs(eaglesEvidence - expected) < 1e-9,
    `Eagles evidence ${eaglesEvidence} should have decayed to ${expected}`
  );
  assert.ok(eaglesEvidence < 1, 'the older event must weigh less than it did when it landed');
  assert.equal(profile.affinities.team.top, 'Cowboys', 'the recent run should now lead');

  // And the same four events in the opposite order put Eagles back on top,
  // which is the whole point of recency.
  const reversed = fold([
    event({ team: 'Cowboys' }),
    event({ team: 'Cowboys' }),
    event({ team: 'Cowboys' }),
    event({ team: 'Eagles' }),
  ]);
  assert.ok(
    reversed.affinities.team.posterior.Eagles > profile.affinities.team.posterior.Eagles,
    'a recent Eagles event should outweigh an old one'
  );
});

test('folding the same events in the same order is deterministic', () => {
  const events = [
    event({ team: 'Eagles', department: 'Jerseys', productName: 'Philadelphia Eagles Jalen Hurts Player Jersey' }),
    event({ pageType: 'PLP', department: 'Kids', filterApplied: 'gender=Kids' }),
    event({ pageType: 'Filter', department: 'Jerseys', filterApplied: 'price=50-100' }),
    event({ pageType: 'Cart', team: 'Eagles', department: 'Hats', productId: 'p-1' }),
  ];

  const a = fold(events);
  const b = fold(events);

  assert.deepEqual(b, a, 'the fold must be a function of its inputs and nothing else');

  // Same events, different order: a different profile. Determinism is not the
  // same claim as order-independence, and asserting it here stops the first test
  // from passing vacuously.
  const shuffled = fold([events[3], events[0], events[2], events[1]]);
  assert.notDeepEqual(shuffled, a);
});

test('a player observation propagates to team and league, damped, and says so', () => {
  const { deltas } = applyEvent(
    createProfile('propagate'),
    event({ department: 'Jerseys', productName: 'Philadelphia Eagles Jalen Hurts Player Jersey' })
  );

  const player = deltas.find((d) => d.path.startsWith('affinities.player'));
  const team = deltas.find((d) => d.path.startsWith('affinities.team'));
  const league = deltas.find((d) => d.path.startsWith('affinities.league'));

  assert.ok(player && team && league, 'all three levels should be written');
  assert.equal(player!.kind, 'observation');
  assert.equal(team!.kind, 'propagation');
  assert.equal(league!.kind, 'propagation');

  // Each rung is strictly weaker than the one below it, and each names its cause.
  assert.ok(team!.contribution < player!.contribution);
  assert.ok(league!.contribution < team!.contribution);
  assert.match(team!.label, /propagated from player/);
  assert.match(league!.label, /propagated from team/);
});

test('a naming event does not also count as a propagation into the same field', () => {
  // An event carrying both team and league is one observation, not two. If the
  // league were credited twice the evidence total would inflate and the
  // sufficiency term - which gates confidence everywhere - would lie.
  const { profile, deltas } = applyEvent(
    createProfile('no-double-count'),
    event({ league: 'NFL', team: 'Eagles' })
  );

  const leagueDeltas = deltas.filter((d) => d.path.startsWith('affinities.league'));
  assert.equal(leagueDeltas.length, 1);
  assert.equal(leagueDeltas[0].kind, 'observation');
  assert.equal(profile.affinities.league.evidence.NFL, 1);
});

test('an anonymous scenario folds to a profile with no history behind it', () => {
  const scenario = {
    id: 99,
    name: 'Test Anonymous',
    profileType: 'Anonymous' as const,
    historicalOrdersCount: 0,
    favTeams: [],
    recentEvents: [],
  };

  const { profile } = buildProfile(
    scenario as unknown as Parameters<typeof buildProfile>[0],
    [event({ team: 'Chiefs' })]
  );

  assert.equal(profile.identityState, 'anonymous');
  assert.equal(profile.state.lifetimeOrders, 0);
  assert.equal(profile.observedEvents, 1);
});

test('order history does not decay at the click rate', () => {
  // The bug this pins: if durable evidence shared the session channel, a
  // recognised customer's purchase history would be discounted to nothing by a
  // few minutes of browsing, and the profile path would drop below the
  // activation threshold on exactly the shoppers it should be most sure about.
  const scenario = {
    id: 98,
    name: 'Test Member',
    profileType: 'Recognized' as const,
    historicalOrdersCount: 12,
    favTeams: ['Eagles'],
    recentEvents: [],
  } as unknown as Parameters<typeof buildProfile>[0];

  const seeded = buildProfile(scenario, []).profile.affinities.team.seed.Eagles;
  assert.ok(seeded > 0, 'history should land in the durable channel');

  const browsed = buildProfile(
    scenario,
    Array.from({ length: 15 }, () => event({ team: 'Cowboys' }))
  ).profile.affinities.team;

  assert.equal(
    browsed.seed.Eagles,
    seeded,
    'fifteen clicks elsewhere must not erode a purchase record'
  );
  assert.ok(browsed.evidence.Eagles === 0, 'and none of it should have leaked into the session channel');
});
