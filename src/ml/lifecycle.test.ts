/**
 * Properties of the lifecycle trigger stack.
 *
 * Every test here is about a message NOT being sent. That is not a stylistic
 * choice: the trigger conditions are four lines each and nothing interesting
 * lives in them, while the six gates on top are where a lifecycle programme
 * either respects a shopper or generates an unsubscribe. The two that would be
 * genuine incidents rather than mistakes - an SMS to someone who never
 * authenticated, and an SMS at 4am - are pinned first.
 *
 * The last test is the one this build is actually about: the content gate is
 * the storefront's own suppression gate, so a rival club's merchandise cannot
 * reach a loyalist through an email either. A rule that holds on the page and
 * not in the inbox is not a rule about the shopper.
 *
 * Run with `npm test`. No DOM, no React.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { Product, TeamId } from '../types';
import { createProfile } from './profile';
import type { IdentityState, VisitorProfile } from './profile';
import { inertContext, suppressionContext } from './suppression';
import type { Candidate } from './suppression';
import {
  CHANNEL_RUNG,
  EMPTY_FREQUENCY,
  FREQUENCY_CAP,
  HOLDOUT_SHARE,
  QUIET_HOURS,
  TRIGGERS,
  inHoldout,
  localHourIn,
  runLifecycle,
  withinSendingHours,
} from './lifecycle';
import type { LifecycleSession } from './lifecycle';

/* ------------------------------------------------------------- fixtures -- */

let pid = 0;
function product(partial: Partial<Product> = {}): Product {
  pid += 1;
  return {
    id: `lc-p${pid}`,
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
    popularity: 95,
    primaryColor: '#004C54',
    secondaryColor: '#A5ACAF',
    ...partial,
  };
}

/** A visitor id that is NOT in the control arm, so holdout never confounds a test. */
function reachableId(prefix: string): string {
  for (let i = 0; i < 500; i++) {
    const id = `${prefix}-${i}`;
    if (!inHoldout(id)) return id;
  }
  throw new Error('no id outside the holdout in 500 tries - the hash is not uniform');
}

function session(partial: Partial<LifecycleSession> = {}): LifecycleSession {
  return {
    visitorId: reachableId('lc'),
    identityState: 'member',
    cart: [],
    viewed: [],
    ordered: false,
    unavailableSizes: {},
    topTeam: 'Eagles',
    topTeamConfidence: 0.8,
    marketEvent: null,
    daysSinceLastSession: 3,
    lifetimeOrders: 2,
    localHour: 14,
    timezone: 'America/New_York',
    ...partial,
  };
}

/** Enough candidates, all comfortably over the popularity bar. */
function candidates(team: TeamId = 'Eagles'): Candidate[] {
  return Array.from({ length: 8 }, () => {
    const p = product({ team, popularity: 96 });
    return { product: p, confidence: p.popularity / 100, source: 'test' } as Candidate;
  });
}

function loyalist(team: TeamId, posterior: number, confidence: number): VisitorProfile {
  const p = createProfile('lc-loyalist');
  const dist = p.affinities.team;
  const posteriors = { ...dist.posterior } as Record<TeamId, number>;
  for (const k of Object.keys(posteriors) as TeamId[]) posteriors[k] = (1 - posterior) / 5;
  posteriors[team] = posterior;
  return {
    ...p,
    affinities: {
      ...p.affinities,
      team: { ...dist, top: team, posterior: posteriors, confidence: { ...dist.confidence, value: confidence } },
    },
  };
}

const feed = () => ({ candidatesFor: () => candidates() });

/* ---------------------------------------------------------------- consent -- */

test('SMS needs an authenticated member and email needs a captured address', () => {
  assert.equal(CHANNEL_RUNG.sms, 'member');
  assert.equal(CHANNEL_RUNG.email, 'identified');
});

test('an anonymous visitor is unreachable on every channel', () => {
  const r = runLifecycle(
    session({ identityState: 'anonymous', cart: [product()], viewed: [product(), product(), product()] }),
    inertContext(),
    feed()
  );
  assert.equal(r.fired.length, 0);
  assert.equal(r.reachable.length, 0);
  assert.ok(r.held.every((h) => h.blockedBy === 'no_consent'));
});

test('an identified shopper gets email and not SMS', () => {
  const rungs: IdentityState[] = ['identified'];
  for (const rung of rungs) {
    const r = runLifecycle(
      session({ identityState: rung, viewed: [product(), product(), product()] }),
      inertContext(),
      feed()
    );
    assert.deepEqual(r.reachable, ['email']);
    const sms = r.evaluations.filter((e) => e.qualified && e.trigger.channel === 'sms');
    assert.ok(sms.every((e) => e.blockedBy === 'no_consent'));
  }
});

/* ------------------------------------------------------------ quiet hours -- */

test('an SMS at 4am is held, and the same trigger at 2pm is not', () => {
  const s = { unavailableSizes: {}, viewed: [] as Product[] };
  const p = product({ inventoryStatus: 'Low Stock' });
  const base = { ...s, viewed: [p], unavailableSizes: { [p.id]: 'L' } };

  const night = runLifecycle(session({ ...base, localHour: 4 }), inertContext(), feed());
  const day = runLifecycle(session({ ...base, localHour: 14 }), inertContext(), feed());

  const at = (r: typeof night) => r.evaluations.find((e) => e.trigger.id === 'size_back_in_stock')!;
  assert.equal(at(night).blockedBy, 'quiet_hours');
  assert.equal(at(day).fires, true);
});

test('email tolerates hours SMS does not, because an inbox waits and a phone does not', () => {
  assert.ok(QUIET_HOURS.email.from < QUIET_HOURS.sms.from);
  assert.ok(QUIET_HOURS.email.until > QUIET_HOURS.sms.until);
  assert.equal(withinSendingHours('email', 7), true);
  assert.equal(withinSendingHours('sms', 7), false);
  assert.equal(withinSendingHours('sms', 22), false);
});

test('the local hour comes from the visitor own zone and never from a network call', () => {
  const at = new Date('2026-03-14T12:00:00Z');
  const ny = localHourIn('America/New_York', at);
  const tokyo = localHourIn('Asia/Tokyo', at);
  assert.notEqual(ny, tokyo);
  assert.ok(ny >= 0 && ny <= 23);
  // An unparseable zone falls back rather than throwing, because a request with
  // no geo hint is normal and a thrown error on a render is not.
  assert.ok(localHourIn('Not/AZone', at) >= 0);
  assert.ok(localHourIn(null, at) >= 0);
});

/* -------------------------------------------------------------- frequency -- */

test('a channel at its cap sends nothing more', () => {
  const r = runLifecycle(session({ cart: [product()] }), inertContext(), {
    ...feed(),
    frequency: { sent: { email: FREQUENCY_CAP.email.max, sms: 0 } },
  });
  const cart = r.evaluations.find((e) => e.trigger.id === 'abandoned_cart')!;
  assert.equal(cart.blockedBy, 'frequency_cap');
});

test('two correct triggers on one channel do not both send', () => {
  // A cart and a price drop both qualify. The cap is two, so with one send
  // already used only the higher-priority one gets the remaining slot.
  const sale = product({ salePrice: 80 });
  const r = runLifecycle(session({ cart: [product()], viewed: [sale] }), inertContext(), {
    ...feed(),
    frequency: { sent: { email: FREQUENCY_CAP.email.max - 1, sms: 0 } },
  });
  const email = r.evaluations.filter((e) => e.qualified && e.trigger.channel === 'email');
  assert.ok(email.length >= 2, 'the fixture needs two qualifying email triggers');
  assert.equal(email.filter((e) => e.fires).length, 1);
  assert.ok(email.some((e) => e.blockedBy === 'outranked'));
});

test('a held trigger is held, not deleted - it names the rule and stays on the screen', () => {
  const r = runLifecycle(session({ identityState: 'anonymous', cart: [product()] }), inertContext(), feed());
  const cart = r.evaluations.find((e) => e.trigger.id === 'abandoned_cart')!;
  assert.equal(cart.qualified, true);
  assert.equal(cart.fires, false);
  assert.ok(cart.blockedBy);
  assert.ok(cart.gates.length >= 2, 'the gates it passed before the one that stopped it are still listed');
});

/* ---------------------------------------------------------------- holdout -- */

test('the control arm is stable for a visitor and roughly the stated size', () => {
  const ids = Array.from({ length: 4000 }, (_, i) => `visitor-${i}`);
  const held = ids.filter(inHoldout).length;
  const share = held / ids.length;
  assert.ok(Math.abs(share - HOLDOUT_SHARE) < 0.03, `holdout share ${share} is not near ${HOLDOUT_SHARE}`);
  for (const id of ids.slice(0, 50)) assert.equal(inHoldout(id), inHoldout(id));
});

test('a held-out visitor receives nothing, whatever they do', () => {
  let heldOutId: string | null = null;
  for (let i = 0; i < 500 && !heldOutId; i++) if (inHoldout(`h-${i}`)) heldOutId = `h-${i}`;
  assert.ok(heldOutId);
  const r = runLifecycle(session({ visitorId: heldOutId!, cart: [product()] }), inertContext(), feed());
  assert.equal(r.holdout, true);
  assert.equal(r.fired.length, 0);
  assert.ok(r.held.every((h) => h.blockedBy === 'holdout' || h.blockedBy === 'no_consent'));
});

/* ------------------------------------------------------------ the content -- */

test('a message with nothing over the content bar does not send short - it does not send', () => {
  const weak = Array.from({ length: 8 }, () => {
    const p = product({ popularity: 58 });
    return { product: p, confidence: p.popularity / 100, source: 'test' } as Candidate;
  });
  // An ACTIVE context, deliberately. An inert one is personalization switched
  // off, and the gate's contract is that it cuts nothing then - which is right
  // for a store serving its merchandised default and would make this assertion
  // test the off switch rather than the bar.
  const ctx = suppressionContext(createProfile('lc-cold'));
  const r = runLifecycle(session({ cart: [product()] }), ctx, { candidatesFor: () => weak });
  const cart = r.evaluations.find((e) => e.trigger.id === 'abandoned_cart')!;
  assert.equal(cart.blockedBy, 'no_content');
  assert.equal(cart.products.length, 0);
});

test('the rivalry rule reaches the inbox, because it is a rule about the shopper', () => {
  // THE TEST THIS FILE EXISTS FOR. An Eagles loyalist's abandoned-cart email
  // cannot carry Cowboys merchandise, and it is stopped by exactly the same
  // gate that stops it on the home page - not by a second implementation.
  const ctx = suppressionContext(loyalist('Eagles', 0.9, 0.8));
  const rivals = Array.from({ length: 8 }, () => {
    const p = product({ team: 'Cowboys', popularity: 97 });
    return { product: p, confidence: p.popularity / 100, source: 'test' } as Candidate;
  });
  const r = runLifecycle(session({ cart: [product()] }), ctx, { candidatesFor: () => rivals });
  const cart = r.evaluations.find((e) => e.trigger.id === 'abandoned_cart')!;
  assert.equal(cart.blockedBy, 'no_content');
  assert.ok(cart.content);
  assert.ok(cart.content!.suppressed.every((s) => s.rule === 'rivalry'));
});

/* ------------------------------------------------------------- conditions -- */

test('a dormant trigger says what was missing rather than going quiet', () => {
  const r = runLifecycle(session(), inertContext(), feed());
  assert.ok(r.dormant.length > 0);
  for (const d of r.dormant) {
    assert.ok(d.evidence.length > 5, `${d.trigger.id} gave no reason`);
    assert.equal(d.blockedBy, null, 'a dormant trigger was never blocked - its condition simply did not hold');
    assert.equal(d.gates.length, 1);
  }
});

test('a cart session belongs to abandoned cart and not to browse abandon', () => {
  const r = runLifecycle(
    session({ cart: [product()], viewed: [product(), product(), product()] }),
    inertContext(),
    feed()
  );
  assert.ok(r.evaluations.find((e) => e.trigger.id === 'abandoned_cart')!.qualified);
  const browse = r.evaluations.find((e) => e.trigger.id === 'browse_abandon')!;
  assert.equal(browse.qualified, false);
  assert.ok(browse.evidence.includes('abandoned cart'));
});

test('a market moment only fires for the club the event touched', () => {
  const eagles = session({
    marketEvent: { id: 'e1', headline: 'A trade', team: 'Eagles' },
    topTeam: 'Eagles',
  });
  const chiefs = session({
    marketEvent: { id: 'e1', headline: 'A trade', team: 'Chiefs' },
    topTeam: 'Eagles',
  });
  const at = (s: LifecycleSession) =>
    runLifecycle(s, inertContext(), feed()).evaluations.find((e) => e.trigger.id === 'market_moment')!;
  assert.equal(at(eagles).qualified, true);
  assert.equal(at(chiefs).qualified, false);
  assert.ok(at(chiefs).evidence.includes('Chiefs'));
});

test('every trigger states its condition, its intent and a delay', () => {
  for (const t of TRIGGERS) {
    assert.ok(t.condition.length > 10, `${t.id} has no stated condition`);
    assert.ok(t.intent.length > 10, `${t.id} has no stated intent`);
    assert.ok(t.delayMinutes >= 0);
    assert.ok(t.priority > 0);
  }
  const ids = TRIGGERS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(EMPTY_FREQUENCY.sent.email, 0);
});
