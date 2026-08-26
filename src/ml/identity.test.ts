/**
 * Properties of the identity ladder.
 *
 * The ladder's promise is that knowing more about a shopper never means knowing
 * less, and that a declared fact never silently erases what the shopper is
 * doing right now. Both are easy to break and neither would show up as a crash:
 * a reweighting that made `member` read lower than `identified`, or a CRM seed
 * heavy enough to bury live clicks, would just produce a demo that quietly
 * lied. These tests pin the promise.
 *
 * Run with `npm test`. No DOM, no React.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildScenarios } from '../data/scenarios';
import { UserEvent } from '../types';
import { buildProfile, promoteProfile } from './profile';
import {
  GEO_EVIDENCE,
  IDENTITY_LADDER,
  PRIOR_FLOOR,
  demoSeedFor,
  emptyContext,
  hasReached,
  profileCompleteness,
  readContext,
  resolveGeo,
  rungIndex,
  seedWrites,
} from './identity';
import type { VisitorContext } from './identity';

const SCENARIOS = buildScenarios();

/**
 * A fully-loaded context: mapped timezone, social referrer, a campaign whose
 * name states its own intent, and a handset. Everything the `contextual` rung
 * is allowed to see.
 */
const RICH_CONTEXT: VisitorContext = {
  timezone: 'America/New_York',
  referrer: 'https://www.instagram.com/',
  landingPage: '/campaign/eagles-playoff-jersey-drop',
  utm: { source: 'instagram', medium: 'paid_social', campaign: 'eagles-playoff-jersey-drop' },
  device: 'mobile',
};

let seq = 0;
function event(partial: Partial<UserEvent> = {}): UserEvent {
  seq += 1;
  return { id: `i${seq}`, timestamp: '', pageType: 'PDP', action: 'view', ...partial } as UserEvent;
}

test('an anonymous visitor reads as the prior floor, not as zero', () => {
  for (const scenario of SCENARIOS) {
    const seed = demoSeedFor(scenario, 'anonymous', RICH_CONTEXT);
    const { profile } = buildProfile(scenario, [], { now: 0 }, seed);
    const report = profileCompleteness(profile);

    assert.equal(
      Number(report.percent.toFixed(1)),
      Number((PRIOR_FLOOR * 100).toFixed(1)),
      `${scenario.id}: anonymous should read exactly the prior floor`
    );
    // The floor is a floor, not a fudge: it has to hold field by field.
    for (const field of report.fields) {
      assert.ok(field.score >= PRIOR_FLOOR - 1e-9, `${field.field} fell below the prior floor`);
      assert.equal(field.source, 'prior', `${field.field} claimed a source above prior`);
    }
  }
});

test('anonymous ignores context - the rung is what gates the evidence, not the browser', () => {
  // Same rich context, but at the bottom rung. If any of it leaked through,
  // the ladder would not be a ladder.
  for (const scenario of SCENARIOS.slice(0, 2)) {
    assert.equal(seedWrites(demoSeedFor(scenario, 'anonymous', RICH_CONTEXT)).length, 0);
  }
});

test('completeness is monotonic up the ladder', () => {
  for (const scenario of SCENARIOS) {
    let previous = -Infinity;
    for (const state of IDENTITY_LADDER) {
      const seed = demoSeedFor(scenario, state, RICH_CONTEXT);
      const { profile } = buildProfile(scenario, [], { now: 0 }, seed);
      const percent = profileCompleteness(profile).percent;
      assert.ok(
        percent >= previous - 1e-6,
        `${scenario.id}: ${state} read ${percent.toFixed(1)}%, below the rung beneath it at ${previous.toFixed(1)}%`
      );
      previous = percent;
    }
  }
});

test('each rung seeds a superset of the rung below it', () => {
  const key = (w: { field: string; key?: string; label: string }) => `${w.field}|${w.key ?? ''}|${w.label}`;

  for (const scenario of SCENARIOS) {
    for (let i = 1; i < IDENTITY_LADDER.length; i += 1) {
      const lower = new Set(seedWrites(demoSeedFor(scenario, IDENTITY_LADDER[i - 1], RICH_CONTEXT)).map(key));
      const upper = new Set(seedWrites(demoSeedFor(scenario, IDENTITY_LADDER[i], RICH_CONTEXT)).map(key));
      for (const k of lower) {
        assert.ok(upper.has(k), `${scenario.id}: ${IDENTITY_LADDER[i]} dropped "${k}" that ${IDENTITY_LADDER[i - 1]} had`);
      }
      // Every write is attributed to the rung that earned it.
      for (const w of seedWrites(demoSeedFor(scenario, IDENTITY_LADDER[i], RICH_CONTEXT))) {
        assert.ok(hasReached(IDENTITY_LADDER[i], w.rung), `a write claimed rung ${w.rung} above ${IDENTITY_LADDER[i]}`);
      }
    }
  }
});

test('promotion re-folds rather than mutating the profile it was given', () => {
  const scenario = SCENARIOS[0];
  const events = [
    event({ action: 'view', team: 'Eagles', department: 'Jerseys' }),
    event({ action: 'add_to_cart', team: 'Eagles', department: 'Jerseys' }),
  ];

  const before = buildProfile(scenario, events, { now: 0 }, demoSeedFor(scenario, 'anonymous', RICH_CONTEXT)).profile;
  const snapshot = JSON.stringify(before);

  const memberSeed = demoSeedFor(scenario, 'member', RICH_CONTEXT);
  const promoted = promoteProfile(before, scenario, events, memberSeed, { now: 0 });

  // The profile handed in is untouched. This is the whole reason promotion is a
  // re-fold: the panel needs both sides to animate between them.
  assert.equal(JSON.stringify(before), snapshot);

  // And the result is exactly what folding from scratch with the richer seed
  // gives - promotion takes no shortcut that a cold build would not take.
  const cold = buildProfile(scenario, events, { now: 0 }, memberSeed).profile;
  assert.equal(JSON.stringify(promoted.profile), JSON.stringify(cold));

  assert.ok(promoted.deltas.length > 0, 'promotion logged nothing');
  assert.ok(promoted.deltas.every((d) => d.kind === 'promotion'), 'a promotion delta was mis-labelled');
  assert.ok(
    promoted.deltas.some((d) => d.path.startsWith('traits.region')),
    'region changed source on promotion and should have said so'
  );
});

test('a CRM fact and contrary session evidence leave a contested distribution, not an overwrite', () => {
  const scenario = SCENARIOS[0];
  // The CRM says this account is a mens shopper. The session says otherwise,
  // repeatedly and recently - someone is buying for a child.
  const kidsSession = Array.from({ length: 8 }, () =>
    event({ action: 'view', department: 'Kids', team: 'Eagles' })
  );

  const seed = demoSeedFor(scenario, 'member', RICH_CONTEXT);
  const { profile } = buildProfile(scenario, kidsSession, { now: 0 }, seed);

  const gender = profile.traits.gender;
  assert.ok(gender.evidence.kids > 0, 'the session left no trace on gender at all');
  // Whatever the call, it must not be a confident one: two sources disagree and
  // the margin is the only honest way to say so.
  assert.ok(
    gender.margin < 0.6,
    `gender margin ${gender.margin.toFixed(2)} - a contested field was reported as settled`
  );
});

test('geo splits a zone by market size and stays silent on zones it does not know', () => {
  const eastern = resolveGeo('America/New_York');
  assert.equal(eastern.zoneLabel, 'US Eastern');
  assert.ok(eastern.teams.length > 0);
  const total = eastern.teams.reduce((sum, t) => sum + t.weight, 0);
  assert.ok(Math.abs(total - GEO_EVIDENCE) < 1e-9, 'a zone spent more or less than one geo prior');

  // A zone with more than one catalog club must not treat them as equals.
  const philly = resolveGeo('America/Chicago');
  assert.ok(philly.teams.length > 1);
  assert.notEqual(philly.teams[0].weight, philly.teams[1].weight);

  // Unmapped is unmapped. Inventing a region for a shopper in Bengaluru would
  // be worse than admitting we cannot place them.
  const unknown = resolveGeo('Asia/Kolkata');
  assert.equal(unknown.zoneLabel, null);
  assert.deepEqual(unknown.teams, []);
  assert.ok(readContext({ ...RICH_CONTEXT, timezone: 'Asia/Kolkata' }).notes.some((n) => /region|locat/i.test(n)));
});

test('context alone moves the model off its prior', () => {
  // The demo has to open with the model already having said something.
  const scenario = SCENARIOS[0];
  const cold = buildProfile(scenario, [], { now: 0 }, demoSeedFor(scenario, 'anonymous', RICH_CONTEXT)).profile;
  const warm = buildProfile(scenario, [], { now: 0 }, demoSeedFor(scenario, 'contextual', RICH_CONTEXT)).profile;

  assert.notEqual(warm.affinities.team.top, cold.affinities.team.top);
  assert.ok(warm.affinities.team.confidence.value > cold.affinities.team.confidence.value);
  assert.ok(profileCompleteness(warm).percent > profileCompleteness(cold).percent + 10);
});

test('the ladder is ordered and hasReached agrees with it', () => {
  for (let i = 0; i < IDENTITY_LADDER.length; i += 1) {
    assert.equal(rungIndex(IDENTITY_LADDER[i]), i);
    for (let j = 0; j <= i; j += 1) {
      assert.ok(hasReached(IDENTITY_LADDER[i], IDENTITY_LADDER[j]));
    }
    for (let j = i + 1; j < IDENTITY_LADDER.length; j += 1) {
      assert.ok(!hasReached(IDENTITY_LADDER[i], IDENTITY_LADDER[j]));
    }
  }
});

test('completeness weights sum to one, so the meter means what it says', () => {
  const { fields } = profileCompleteness(
    buildProfile(SCENARIOS[0], [], { now: 0 }, demoSeedFor(SCENARIOS[0], 'member', emptyContext())).profile
  );
  const total = fields.reduce((sum, f) => sum + f.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights summed to ${total}`);
});
