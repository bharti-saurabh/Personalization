/**
 * Lifecycle triggers: which message would fire, and every rule that could stop it.
 *
 * On-site personalization is forgiving. A wrong tile costs a scroll. Off-site
 * it is not: an email the shopper did not ask for, at an hour they did not
 * choose, about a club they do not follow, is the one personalization failure
 * that has an unsubscribe button attached to it. So the interesting half of a
 * lifecycle engine has never been the trigger logic - "cart has items and no
 * order" is four lines - it is the suppression stack sitting on top of it, and
 * that stack is what this module makes visible.
 *
 * A trigger here goes through SIX gates in a fixed order, and the order is the
 * argument:
 *
 *   1. CONSENT       Does this shopper's identity rung even carry the channel?
 *                    SMS needs an authenticated member; email needs a captured,
 *                    consented address. An anonymous visitor is unreachable, and
 *                    that is a fact about the ladder rather than a rule we chose.
 *   2. HOLDOUT       10% of visitors receive nothing, deterministically, so the
 *                    programme has a control group. Runs before anything
 *                    expensive because a held-out visitor's message should not
 *                    be composed at all.
 *   3. QUIET HOURS   Local time from the request's own timezone. An SMS at 3am
 *                    is not a personalization decision, it is a complaint.
 *   4. FREQUENCY     A rolling cap per channel. Two triggers can be individually
 *                    correct and jointly wrong.
 *   5. PRIORITY      What survives is ranked, and only the cap's worth sends.
 *                    A trigger that loses here is HELD, not killed - the
 *                    distinction matters, because next session it fires.
 *   6. CONTENT       The products in the message run through the same
 *                    `applySuppression` gate the storefront uses, against the
 *                    `lifecycle_email` / `lifecycle_sms` policies. If nothing
 *                    clears the bar, the send is suppressed rather than sent
 *                    short - see the rationale on `lifecycle_sms`.
 *
 * GATE 6 STANDS DOWN WITH THE REST OF PERSONALIZATION. Handed an inert
 * suppression context - the demo's off switch - `applySuppression` cuts
 * nothing, so the message carries whatever the caller retrieved. That is the
 * correct reading rather than a hole: personalization off is a store sending
 * its merchandised default to everybody, which is exactly what a batch send
 * without a profile behind it is. The consent, holdout, quiet-hours and
 * frequency gates are NOT personalization and keep running either way.
 *
 * Gate 6 is the one worth pointing at in a demo. It means an Eagles loyalist's
 * abandoned-cart email cannot recommend a Cowboys hat as an add-on, because the
 * rivalry rule is not a storefront rule - it is a rule about this shopper, and
 * it applies to every surface that speaks to them.
 *
 * WHAT IS SIMULATED. All of it, and specifically: no message is composed, no
 * address is read, nothing is queued or sent. `frequencyState` is a counter the
 * caller keeps. The trigger conditions are evaluated against the live session,
 * so the *decisions* are real computations over real session state; the
 * delivery is a description of what a CRM would do with them.
 *
 * No React, no DOM: the harness runs this.
 */

import type { Product, TeamId } from '../types';
import type { IdentityState } from './profile';
import { hasReached } from './identity';
import { applySuppression, SURFACE_POLICIES } from './suppression';
import type { Candidate, SuppressionContext, SuppressionResult, SurfacePolicy } from './suppression';
import { saving } from './effort';
import type { EffortEntry } from './effort';

/* ------------------------------------------------------------- constants -- */

export type Channel = 'email' | 'sms';

/**
 * The rung a channel becomes available at.
 *
 * Not a preference - a consequence of the identity ladder. `identified` is the
 * rung where an address was captured with consent; `member` is the rung where
 * the shopper authenticated, which is the only place a verified mobile number
 * lives. A demo that sends SMS to a cookie is describing a compliance incident.
 */
export const CHANNEL_RUNG: Record<Channel, IdentityState> = {
  email: 'identified',
  sms: 'member',
};

/**
 * Local hours during which each channel may send.
 *
 * Email is tolerant because it waits in an inbox; SMS is not because it makes a
 * noise. `[from, until)` in the visitor's own local hours.
 */
export const QUIET_HOURS: Record<Channel, { from: number; until: number }> = {
  email: { from: 6, until: 23 },
  sms: { from: 9, until: 20 },
};

/** Rolling sends per channel, and the window they are counted over. */
export const FREQUENCY_CAP: Record<Channel, { max: number; windowHours: number }> = {
  email: { max: 2, windowHours: 24 },
  sms: { max: 1, windowHours: 72 },
};

/**
 * Share of visitors who receive nothing, so the programme has a control arm.
 *
 * Assigned by a hash of the visitor id rather than by a coin flip, for the same
 * reason per-size stock is: the same visitor must land in the same arm on every
 * render, or the screen contradicts itself between two paints and the holdout
 * stops being a holdout.
 */
export const HOLDOUT_SHARE = 0.1;

export const LIFECYCLE_POLICY: Record<Channel, SurfacePolicy> = {
  email: SURFACE_POLICIES.lifecycle_email,
  sms: SURFACE_POLICIES.lifecycle_sms,
};

/* -------------------------------------------------------------- triggers -- */

export type TriggerId =
  | 'abandoned_cart'
  | 'browse_abandon'
  | 'size_back_in_stock'
  | 'price_drop'
  | 'market_moment'
  | 'post_purchase'
  | 'winback';

export interface TriggerDefinition {
  id: TriggerId;
  label: string;
  channel: Channel;
  /** The condition, in the words a CRM manager would write it. */
  condition: string;
  /** Ranks against other qualifying triggers. Higher wins a contested slot. */
  priority: number;
  /** How long after the session the CRM would wait before sending. */
  delayMinutes: number;
  /** What the message is for. One line, rendered verbatim. */
  intent: string;
}

/**
 * The deck, in priority order.
 *
 * Priorities are stated rather than learned and the ordering carries an
 * opinion: a shopper who left something in a cart has told us more than one
 * who browsed, a market event is worth interrupting for and a winback is worth
 * interrupting for least. `post_purchase` outranks everything because it is
 * the only trigger the shopper is expecting.
 */
export const TRIGGERS: TriggerDefinition[] = [
  {
    id: 'post_purchase',
    label: 'Order confirmation and companions',
    channel: 'email',
    condition: 'an order was placed this session',
    priority: 100,
    delayMinutes: 2,
    intent: 'Confirm the order, then show what pairs with it from the co-order graph',
  },
  {
    id: 'abandoned_cart',
    label: 'Abandoned cart',
    channel: 'email',
    condition: 'cart holds at least one item and no order was placed',
    priority: 80,
    delayMinutes: 60,
    intent: 'Return the shopper to a decision they had already almost made',
  },
  {
    id: 'size_back_in_stock',
    label: 'Your size is back',
    channel: 'sms',
    condition: 'a product was viewed in a size the feed shows as gone',
    priority: 70,
    delayMinutes: 0,
    intent: 'The one message where the shopper has an unambiguous reason to want it',
  },
  {
    id: 'market_moment',
    label: 'Market moment',
    channel: 'sms',
    condition: 'a market event has fired that touches the club this shopper reads as',
    priority: 60,
    delayMinutes: 15,
    intent: 'Reach the shopper inside the window where a trade is still news',
  },
  {
    id: 'price_drop',
    label: 'Price drop on something you viewed',
    channel: 'email',
    condition: 'a viewed product carries a sale price',
    priority: 50,
    delayMinutes: 240,
    intent: 'Give a hesitating shopper the one new fact that changes the decision',
  },
  {
    id: 'browse_abandon',
    label: 'Browse abandon',
    channel: 'email',
    condition: 'three or more products viewed, nothing added to a cart',
    priority: 40,
    delayMinutes: 180,
    intent: 'Re-open a session that ended without a decision either way',
  },
  {
    id: 'winback',
    label: 'Winback',
    channel: 'email',
    condition: 'a prior order exists and the last session ended more than 45 days ago',
    priority: 20,
    delayMinutes: 1440,
    intent: 'Re-establish a lapsed relationship without pretending it never lapsed',
  },
];

export const TRIGGER_BY_ID: Record<TriggerId, TriggerDefinition> = Object.fromEntries(
  TRIGGERS.map((t) => [t.id, t])
) as Record<TriggerId, TriggerDefinition>;

/* --------------------------------------------------------------- session -- */

/**
 * What the session has done, as the trigger rules need to see it.
 *
 * A flat record rather than the profile itself, so the rules can be exercised
 * from a test without folding a session, and so a component passes one memo
 * dependency instead of six.
 */
export interface LifecycleSession {
  visitorId: string;
  identityState: IdentityState;
  /** Products currently in the cart. */
  cart: Product[];
  /** Products opened this session, most recent last. */
  viewed: Product[];
  /** True once an order has been placed in this session. */
  ordered: boolean;
  /** Sizes the shopper asked for and could not have: productId -> size. */
  unavailableSizes: Record<string, string>;
  /** The club this shopper reads as, from the fold. Null when nobody knows yet. */
  topTeam: TeamId | null;
  /** How sure that read is. */
  topTeamConfidence: number;
  /** A fired market event and the club it touches, or null. */
  marketEvent: { id: string; headline: string; team: TeamId } | null;
  /** Days since the previous session ended. Null for a first-ever visit. */
  daysSinceLastSession: number | null;
  lifetimeOrders: number;
  /** The visitor's local hour, 0-23. See `localHourIn`. */
  localHour: number;
  /** The zone that hour came from, for display. */
  timezone: string | null;
}

/**
 * The visitor's local hour, from a IANA zone, with no network call.
 *
 * `Intl` carries the zone database in the runtime. Returns the machine's own
 * hour when the zone is unknown, which is the honest fallback: a request with
 * no geo hint is a request we cannot place, and pretending it is UTC would put
 * a shopper in the quiet window for reasons that have nothing to do with them.
 */
export function localHourIn(timezone: string | null, at: Date): number {
  if (!timezone) return at.getHours();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(at);
    const h = parts.find((p) => p.type === 'hour')?.value;
    const n = h ? Number(h) : NaN;
    return Number.isFinite(n) ? n % 24 : at.getHours();
  } catch {
    return at.getHours();
  }
}

/** What the caller remembers about sends already made. */
export interface FrequencyState {
  /** channel -> sends inside that channel's window. */
  sent: Record<Channel, number>;
}

export const EMPTY_FREQUENCY: FrequencyState = { sent: { email: 0, sms: 0 } };

/* ----------------------------------------------------------------- gates -- */

export type SendBlock =
  | 'no_consent'
  | 'holdout'
  | 'quiet_hours'
  | 'frequency_cap'
  | 'outranked'
  | 'no_content';

export const BLOCK_LABEL: Record<SendBlock, string> = {
  no_consent: 'Channel not available at this rung',
  holdout: 'Held out for measurement',
  quiet_hours: 'Outside sending hours',
  frequency_cap: 'Frequency cap reached',
  outranked: 'Outranked by a higher-priority trigger',
  no_content: 'Nothing cleared the content bar',
};

/** FNV-1a over a string, to [0,1). Same construction as ml/fit.ts, same reason. */
function hashUnit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}

/** True when this visitor is in the control arm. Stable for a given id. */
export function inHoldout(visitorId: string): boolean {
  return hashUnit(`holdout:${visitorId}`) < HOLDOUT_SHARE;
}

export function withinSendingHours(channel: Channel, localHour: number): boolean {
  const { from, until } = QUIET_HOURS[channel];
  return localHour >= from && localHour < until;
}

/* ------------------------------------------------------------ evaluation -- */

export interface TriggerEvaluation {
  trigger: TriggerDefinition;
  /** Did the trigger's own condition hold? */
  qualified: boolean;
  /** What made it hold, or what was missing. */
  evidence: string;
  /** The product the message is about, when there is one. */
  subject: Product | null;
  /** Every gate this trigger was put through, in order, with its verdict. */
  gates: { rule: SendBlock | 'condition'; label: string; passed: boolean; detail: string }[];
  /** The gate that stopped it. Null when it would send. */
  blockedBy: SendBlock | null;
  /** The content gate's own result, when it got that far. */
  content: SuppressionResult | null;
  /** Products the message would carry, after the content gate. */
  products: Product[];
  /** True only when every gate passed. */
  fires: boolean;
}

export interface LifecycleResult {
  evaluations: TriggerEvaluation[];
  fired: TriggerEvaluation[];
  /** Qualified but stopped, with the rule that stopped them. */
  held: TriggerEvaluation[];
  /** Triggers whose condition simply did not hold this session. */
  dormant: TriggerEvaluation[];
  holdout: boolean;
  /** Channels the shopper's current rung can be reached on at all. */
  reachable: Channel[];
}

/** Does this trigger's own condition hold? */
function evaluateCondition(
  t: TriggerDefinition,
  s: LifecycleSession
): { qualified: boolean; evidence: string; subject: Product | null } {
  switch (t.id) {
    case 'post_purchase':
      return s.ordered
        ? { qualified: true, evidence: 'an order was placed in this session', subject: s.cart[0] ?? null }
        : { qualified: false, evidence: 'no order placed', subject: null };

    case 'abandoned_cart':
      return s.cart.length > 0 && !s.ordered
        ? {
            qualified: true,
            evidence: `${s.cart.length} item${s.cart.length === 1 ? '' : 's'} in the cart, no order`,
            subject: s.cart[0],
          }
        : { qualified: false, evidence: s.ordered ? 'the order went through' : 'cart is empty', subject: null };

    case 'size_back_in_stock': {
      const ids = Object.keys(s.unavailableSizes);
      const hit = s.viewed.find((p) => ids.includes(p.id)) ?? null;
      return hit
        ? {
            qualified: true,
            evidence: `size ${s.unavailableSizes[hit.id]} of ${hit.name} was asked for and is gone`,
            subject: hit,
          }
        : { qualified: false, evidence: 'no size was asked for and refused', subject: null };
    }

    case 'market_moment': {
      const e = s.marketEvent;
      if (!e) return { qualified: false, evidence: 'no market event has fired', subject: null };
      if (!s.topTeam) return { qualified: false, evidence: `${e.headline} fired, but this shopper has no club read`, subject: null };
      if (e.team !== s.topTeam)
        return {
          qualified: false,
          evidence: `${e.headline} touches ${e.team}; this shopper reads as ${s.topTeam}`,
          subject: null,
        };
      const subject = s.viewed.find((p) => p.team === e.team) ?? null;
      return {
        qualified: true,
        evidence: `${e.headline} touches ${e.team}, the club this shopper reads as at ${Math.round(s.topTeamConfidence * 100)}% confidence`,
        subject,
      };
    }

    case 'price_drop': {
      const hit = s.viewed.find((p) => p.salePrice) ?? null;
      return hit
        ? {
            qualified: true,
            evidence: `${hit.name} is marked down from $${hit.price.toFixed(0)} to $${(hit.salePrice ?? 0).toFixed(0)}`,
            subject: hit,
          }
        : { qualified: false, evidence: 'nothing viewed this session is discounted', subject: null };
    }

    case 'browse_abandon':
      return s.viewed.length >= 3 && s.cart.length === 0 && !s.ordered
        ? {
            qualified: true,
            evidence: `${s.viewed.length} products opened, nothing added`,
            subject: s.viewed[s.viewed.length - 1],
          }
        : {
            qualified: false,
            evidence:
              s.cart.length > 0
                ? 'the session reached a cart, so abandoned cart owns this shopper'
                : `${s.viewed.length} of the 3 product views this needs`,
            subject: null,
          };

    case 'winback': {
      const gap = s.daysSinceLastSession;
      return s.lifetimeOrders > 0 && gap !== null && gap > 45
        ? { qualified: true, evidence: `${s.lifetimeOrders} prior orders, last session ${gap} days ago`, subject: null }
        : {
            qualified: false,
            evidence:
              s.lifetimeOrders === 0
                ? 'no prior order to win back'
                : gap === null
                  ? 'no prior session on record'
                  : `last session was ${gap} days ago, inside the 45-day window`,
            subject: null,
          };
    }
  }
}

export interface LifecycleOptions {
  /** Candidates the message would carry, per trigger. Over-fetch: the gate backfills. */
  candidatesFor?: (t: TriggerDefinition, subject: Product | null) => Candidate[];
  frequency?: FrequencyState;
}

/**
 * Runs every trigger against the session and every gate against every trigger.
 *
 * Returns ALL of them, including the ones whose condition never held. A CRM
 * screen that lists only what fired cannot answer the question a client
 * actually asks, which is "why didn't the other six".
 */
export function runLifecycle(
  session: LifecycleSession,
  ctx: SuppressionContext,
  opts: LifecycleOptions = {}
): LifecycleResult {
  const frequency = opts.frequency ?? EMPTY_FREQUENCY;
  const holdout = inHoldout(session.visitorId);
  const reachable = (['email', 'sms'] as Channel[]).filter((c) =>
    hasReached(session.identityState, CHANNEL_RUNG[c])
  );

  // Priority is resolved before the per-trigger walk, because "outranked" is
  // the one verdict a trigger cannot reach on its own - it depends on what else
  // qualified. Counted per channel, since the caps are per channel.
  const qualifying = TRIGGERS.filter((t) => evaluateCondition(t, session).qualified)
    .slice()
    .sort((a, b) => b.priority - a.priority);
  const rank: Record<string, number> = {};
  const perChannel: Record<Channel, number> = { email: 0, sms: 0 };
  for (const t of qualifying) {
    rank[t.id] = perChannel[t.channel];
    perChannel[t.channel] += 1;
  }

  const evaluations: TriggerEvaluation[] = TRIGGERS.map((t) => {
    const { qualified, evidence, subject } = evaluateCondition(t, session);
    const gates: TriggerEvaluation['gates'] = [
      { rule: 'condition', label: 'Trigger condition', passed: qualified, detail: `${t.condition} — ${evidence}` },
    ];

    let blockedBy: SendBlock | null = null;
    const fail = (rule: SendBlock, detail: string) => {
      gates.push({ rule, label: BLOCK_LABEL[rule], passed: false, detail });
      if (!blockedBy) blockedBy = rule;
    };
    const pass = (rule: SendBlock, detail: string) => {
      gates.push({ rule, label: BLOCK_LABEL[rule], passed: true, detail });
    };

    if (!qualified) {
      return {
        trigger: t,
        qualified,
        evidence,
        subject,
        gates,
        blockedBy: null,
        content: null,
        products: [],
        fires: false,
      };
    }

    // 1. Consent.
    const rung = CHANNEL_RUNG[t.channel];
    if (!hasReached(session.identityState, rung)) {
      fail('no_consent', `${t.channel.toUpperCase()} needs the ${rung} rung; this shopper is ${session.identityState}`);
    } else {
      pass('no_consent', `${t.channel.toUpperCase()} is available from the ${rung} rung and this shopper is ${session.identityState}`);
    }

    // 2. Holdout.
    if (!blockedBy) {
      if (holdout) {
        fail('holdout', `visitor ${session.visitorId} hashes into the ${Math.round(HOLDOUT_SHARE * 100)}% control arm`);
      } else {
        pass('holdout', `outside the ${Math.round(HOLDOUT_SHARE * 100)}% control arm`);
      }
    }

    // 3. Quiet hours.
    if (!blockedBy) {
      const { from, until } = QUIET_HOURS[t.channel];
      const zone = session.timezone ?? 'no zone on the request';
      if (!withinSendingHours(t.channel, session.localHour)) {
        fail(
          'quiet_hours',
          `${String(session.localHour).padStart(2, '0')}:00 local (${zone}) is outside ${from}:00–${until}:00 for ${t.channel}`
        );
      } else {
        pass(
          'quiet_hours',
          `${String(session.localHour).padStart(2, '0')}:00 local (${zone}) is inside ${from}:00–${until}:00 for ${t.channel}`
        );
      }
    }

    // 4. Frequency.
    if (!blockedBy) {
      const cap = FREQUENCY_CAP[t.channel];
      const already = frequency.sent[t.channel];
      if (already >= cap.max) {
        fail('frequency_cap', `${already} of ${cap.max} ${t.channel} sends already used in the last ${cap.windowHours}h`);
      } else {
        pass('frequency_cap', `${already} of ${cap.max} ${t.channel} sends used in the last ${cap.windowHours}h`);
      }
    }

    // 5. Priority. A trigger that loses here is held, not discarded.
    if (!blockedBy) {
      const cap = FREQUENCY_CAP[t.channel];
      const seat = rank[t.id] ?? 0;
      const room = cap.max - frequency.sent[t.channel];
      if (seat >= room) {
        const ahead = qualifying
          .filter((o) => o.channel === t.channel && (rank[o.id] ?? 0) < seat)
          .map((o) => o.label)
          .join(', ');
        fail('outranked', `priority ${t.priority}, behind ${ahead} on the same channel with ${room} slot${room === 1 ? '' : 's'} free`);
      } else {
        pass('outranked', `priority ${t.priority}, highest-ranked qualifying ${t.channel} trigger with a free slot`);
      }
    }

    // 6. Content. The storefront's own gate, on the storefront's own rules.
    let content: SuppressionResult | null = null;
    let products: Product[] = [];
    if (!blockedBy) {
      const candidates = opts.candidatesFor?.(t, subject) ?? [];
      content = applySuppression(candidates, ctx, LIFECYCLE_POLICY[t.channel]);
      products = content.kept.map((c) => c.product);
      if (products.length === 0) {
        fail(
          'no_content',
          candidates.length === 0
            ? 'no candidates were retrieved for this message'
            : `all ${candidates.length} candidates were refused: ${content.byRule.map((r) => `${r.count} ${r.label.toLowerCase()}`).join(', ')}`
        );
      } else {
        pass(
          'no_content',
          `${products.length} of ${LIFECYCLE_POLICY[t.channel].slots} slots filled` +
            (content.suppressed.length > 0
              ? `; ${content.suppressed.length} refused (${content.byRule.map((r) => `${r.count} ${r.label.toLowerCase()}`).join(', ')})`
              : '; nothing refused')
        );
      }
    }

    return {
      trigger: t,
      qualified,
      evidence,
      subject,
      gates,
      blockedBy,
      content,
      products,
      fires: blockedBy === null,
    };
  });

  return {
    evaluations,
    fired: evaluations.filter((e) => e.fires),
    held: evaluations.filter((e) => e.qualified && !e.fires),
    dormant: evaluations.filter((e) => !e.qualified),
    holdout,
    reachable,
  };
}

/**
 * A one-line rendering of what would land, for the panel.
 */
export function sendSentence(e: TriggerEvaluation): string {
  if (!e.qualified) return `${e.trigger.label} — dormant: ${e.evidence}`;
  if (!e.fires) return `${e.trigger.label} — held: ${BLOCK_LABEL[e.blockedBy!]}`;
  const wait =
    e.trigger.delayMinutes >= 60
      ? `${Math.round(e.trigger.delayMinutes / 60)}h`
      : `${e.trigger.delayMinutes}m`;
  return `${e.trigger.channel.toUpperCase()} in ${wait} — ${e.trigger.label}, ${e.products.length} product${e.products.length === 1 ? '' : 's'}`;
}

/**
 * Messages the stack decided not to send, as a ledger row.
 *
 * A suppressed send is effort avoided in the plainest sense in this build: an
 * email that was not opened and dismissed, an SMS that did not interrupt
 * anything. Priced at the same rate as a suppressed impression, because the
 * alternative is to invent a number for what an unwanted message costs a
 * person, and this file is not going to be the one that does that.
 *
 * Returns null when nothing was held. A zero row would be counted.
 */
export function lifecycleEffort(result: LifecycleResult, eventId: string | null): EffortEntry | null {
  if (result.held.length === 0) return null;
  const byRule = new Map<SendBlock, number>();
  for (const h of result.held) {
    if (h.blockedBy) byRule.set(h.blockedBy, (byRule.get(h.blockedBy) ?? 0) + 1);
  }
  const rules = [...byRule.entries()].map(([r, n]) => `${n} ${BLOCK_LABEL[r].toLowerCase()}`).join(', ');
  return saving({
    id: `lifecycle:${eventId ?? 'open'}`,
    eventId,
    page: 'offsite',
    surface: 'Lifecycle triggers',
    kind: 'suppressed_impression',
    count: result.held.length,
    label: `Held ${result.held.length} message${result.held.length === 1 ? '' : 's'} that qualified`,
    detail: `${rules}; ${result.fired.length} would send`,
  });
}
