/**
 * The identity ladder: how much of a shopper you are allowed to know, and why.
 *
 * A visitor is not simply known or unknown. There are five rungs, each one a
 * different legal and technical basis for holding data, and each seeding more of
 * the profile than the one below it:
 *
 *   anonymous    global priors only. Nothing about this person is known.
 *   contextual   what the request itself carries - timezone, referrer, landing
 *                page, UTM, device. No identifier, no storage, no consent
 *                needed. Yields a regional team prior and a campaign intent.
 *   returning    a device cookie. Prior sessions, their affinities decayed by
 *                how long ago they ended.
 *   identified   an email address. CRM traits and email engagement.
 *   member       logged in. Full order history, size profile, loyalty tier.
 *
 * WHY THIS IS A SEED AND NOT A MUTATION. Promotion up the ladder does not patch
 * the profile in place - it re-folds the same event stream against a richer
 * seed. That is the difference between a model and a set of overrides. If
 * logging in merely stamped `gender = womens` over whatever the session had
 * inferred, the session's own evidence would be silently discarded and the
 * confidence attached to the result would be a fiction. Re-folding lets the
 * two argue: eight events saying `mens` and a CRM record saying `womens` produce
 * a contested distribution with a visible margin, which is the truth.
 *
 * This module is a leaf. It produces DESCRIPTIONS of evidence - `SeedWrite[]` -
 * and applies none of it; `profile.ts` owns application, as it owns every other
 * write. Nothing here imports a runtime value from `profile.ts`, so the two
 * cannot form a cycle.
 */

import { Department, League, Product, Scenario, TeamId } from '../types';
import { DEPARTMENT_IDS, TEAMS, TEAM_BY_ID } from '../sim/taxonomy';
import type { AgeBand, GenderTrait, IdentityState, ProfileSource, VisitorProfile } from './profile';

/** Bottom to top. Index order is the promotion order; nothing skips a rung. */
export const IDENTITY_LADDER: IdentityState[] = [
  'anonymous',
  'contextual',
  'returning',
  'identified',
  'member',
];

export interface IdentityRungMeta {
  id: IdentityState;
  label: string;
  /** What technically makes this rung available. */
  basis: string;
  /** What it adds over the rung below. */
  adds: string;
}

export const IDENTITY_RUNGS: Record<IdentityState, IdentityRungMeta> = {
  anonymous: {
    id: 'anonymous',
    label: 'Anonymous',
    basis: 'No identifier of any kind',
    adds: 'Global popularity priors only',
  },
  contextual: {
    id: 'contextual',
    label: 'Contextual',
    basis: 'The request itself - no storage, no identifier',
    adds: 'Regional team prior, campaign intent, device skew',
  },
  returning: {
    id: 'returning',
    label: 'Returning',
    basis: 'First-party device cookie',
    adds: 'Prior-session affinities, decayed by age',
  },
  identified: {
    id: 'identified',
    label: 'Identified',
    basis: 'Email captured, consented',
    adds: 'CRM traits and email engagement',
  },
  member: {
    id: 'member',
    label: 'Member',
    basis: 'Authenticated session',
    adds: 'Full order history, size profile, loyalty tier',
  },
};

export function rungIndex(state: IdentityState): number {
  return IDENTITY_LADDER.indexOf(state);
}

/** True when `state` is at or above `rung` on the ladder. */
export function hasReached(state: IdentityState, rung: IdentityState): boolean {
  return rungIndex(state) >= rungIndex(rung);
}

/* --------------------------------------------------------- what a rung has -- */

export type DeviceClass = 'mobile' | 'tablet' | 'desktop';

/**
 * What the request carries. Every field is nullable: a demo that assumes the
 * referrer is present is a demo that has never been opened from a bookmark.
 */
export interface VisitorContext {
  /** IANA zone, e.g. `America/Chicago`. Read locally - never a network call. */
  timezone: string | null;
  referrer: string | null;
  landingPage: string;
  utm: { source?: string; medium?: string; campaign?: string };
  device: DeviceClass;
}

export interface PriorSession {
  /** How long ago the session ended. Drives the decay applied to its evidence. */
  endedDaysAgo: number;
  teams: Partial<Record<TeamId, number>>;
  departments: Partial<Record<Department, number>>;
}

export interface CrmTraits {
  gender?: GenderTrait;
  ageBand?: AgeBand;
  /** Billing region, e.g. `Greater Philadelphia`. */
  region?: string;
  /** Email opens and clicks in [0,1]. High engagement implies campaign receptivity. */
  emailEngagement?: number;
  /** Average order value in dollars; inverted into a price sensitivity. */
  avgOrderValue?: number;
}

export interface MemberRecord {
  lifetimeOrders: number;
  loyaltyTier: string;
  /** Ordered teams with how many orders each. */
  orderedTeams: { team: TeamId; orders: number }[];
  orderedDepartments: { department: Department; orders: number }[];
  /**
   * Players whose merchandise was bought. Order history genuinely contains
   * this - the catalog puts the roster name in the product title - and for
   * jersey merchandising it is the most actionable fact in the record.
   */
  orderedPlayers: { player: string; orders: number }[];
  /** Confirmed sizes, by department. The strongest fact in the whole profile. */
  sizeProfile: Partial<Record<Department, string>>;
  /**
   * Orders that shipped to an address other than the account's own, out of
   * `lifetimeOrders`. The cleanest gifting signal a retailer actually holds -
   * it needs no inference, only a join. A member with none of these is
   * informative too: that is a shopper who buys for themselves.
   */
  giftOrders: number;
  /**
   * The line items, with SKUs.
   *
   * Everything else in this record is an aggregate - counts by club, by
   * department, by player - and aggregates cannot answer the one question the
   * ownership rule asks, which is "have you got THIS". A retailer's order
   * history is line items; the aggregates above are the summaries built from
   * them. Modelling it the other way round would have made the suppression rule
   * fuzzy for no reason other than the shape of this interface.
   */
  recentOrders: { productId: string; daysAgo: number; gift: boolean }[];
}

/** Everything the ladder makes available at a given rung. */
export interface IdentitySeed {
  state: IdentityState;
  context?: VisitorContext;
  priorSessions?: PriorSession[];
  crm?: CrmTraits;
  member?: MemberRecord;
}

/* ------------------------------------------------------------ seed writes -- */

export type SeedField =
  | 'league'
  | 'team'
  | 'player'
  | 'department'
  | 'gender'
  | 'ageBand'
  | 'priceSensitivity'
  | 'giftIntent'
  | 'size'
  | 'region'
  | 'loyalty'
  | 'orders';

/**
 * One piece of evidence a rung makes available, described but not applied.
 *
 * `weight` is in the same units as an event's contribution, so a seed and a
 * click are directly comparable - which is the point. A CRM gender fact at
 * weight 4 outvotes three sessions of browsing, and you can see that it did.
 */
export interface SeedWrite {
  field: SeedField;
  /** Distribution key, or the size/region value. Absent for scalars. */
  key?: string;
  /** Evidence mass, or the target value for a scalar in [0,1]. */
  weight: number;
  value?: number;
  source: ProfileSource;
  label: string;
  /** Which rung put this on the table. Rendered as the delta's cause. */
  rung: IdentityState;
}

/* ------------------------------------------------------- context inference -- */

/**
 * Timezone to the catalog's markets.
 *
 * A real deployment resolves an IP to a metro. This build may not make a network
 * call, so it reads the browser's own IANA zone instead - which is genuinely
 * local and genuinely informative, just coarser. A zone is not a metro: it
 * contains several, so it narrows the catalog's markets rather than picking one,
 * and the weights below say how much narrowing that is worth. Anything not
 * listed yields no regional signal at all, which is the honest answer for a
 * visitor whose zone contains none of the catalog's cities.
 */
const GEO_ZONES: Record<string, { label: string; cities: string[] }> = {
  'America/New_York': { label: 'US Eastern', cities: ['Philadelphia'] },
  'America/Detroit': { label: 'US Eastern', cities: ['Philadelphia'] },
  'America/Toronto': { label: 'US/Canada Eastern', cities: ['Philadelphia'] },
  'America/Chicago': { label: 'US Central', cities: ['Dallas', 'Kansas City'] },
  'America/Winnipeg': { label: 'US/Canada Central', cities: ['Dallas', 'Kansas City'] },
  'America/Denver': { label: 'US Mountain', cities: ['Kansas City'] },
  'America/Phoenix': { label: 'US Mountain', cities: ['Los Angeles'] },
  'America/Los_Angeles': { label: 'US Pacific', cities: ['Los Angeles'] },
  'America/Vancouver': { label: 'US/Canada Pacific', cities: ['Los Angeles'] },
};

/**
 * Total evidence a regional prior is worth.
 *
 * Deliberately small. Living near a city is a real signal and a weak one - the
 * catalog's own popularity prior already encodes most of what "near Dallas"
 * implies, and plenty of people do not support their local club. Two units is
 * about two page views: enough to break a tie, not enough to survive contact
 * with evidence.
 */
export const GEO_EVIDENCE = 2.0;

/** Device is the weakest thing on this list and is weighted accordingly. */
export const DEVICE_GENDER_EVIDENCE = 0.35;

export interface GeoResolution {
  zoneLabel: string | null;
  cities: string[];
  teams: { team: TeamId; weight: number }[];
}

/** Resolves a timezone to catalog markets. Returns an empty result when unmapped. */
export function resolveGeo(timezone: string | null): GeoResolution {
  const zone = timezone ? GEO_ZONES[timezone] : undefined;
  if (!zone) return { zoneLabel: null, cities: [], teams: [] };

  const local = TEAMS.filter((t) => zone.cities.includes(t.city));
  const massTotal = local.reduce((sum, t) => sum + t.marketSize, 0);
  if (massTotal === 0) return { zoneLabel: zone.label, cities: zone.cities, teams: [] };

  return {
    zoneLabel: zone.label,
    cities: zone.cities,
    // Split within the zone by market size, so a zone holding one big club and
    // one small one does not treat them as equals.
    teams: local.map((t) => ({ team: t.id, weight: (t.marketSize / massTotal) * GEO_EVIDENCE })),
  };
}

interface CampaignHint {
  match: RegExp;
  team?: TeamId;
  department?: Department;
  giftIntent?: number;
  priceSensitivity?: number;
  reads: string;
}

/**
 * Campaign intent from the UTM string.
 *
 * A campaign name is written by a marketer to describe what the campaign is, so
 * it is a genuine statement of intent about the traffic it carries - the one
 * piece of context that is authored rather than observed. Matching is on the
 * whole `source/medium/campaign` triple, lowercased.
 */
const CAMPAIGN_HINTS: CampaignHint[] = [
  { match: /eagles|philly|philadelphia/, team: 'Eagles', reads: 'Eagles campaign' },
  { match: /cowboys|dallas/, team: 'Cowboys', reads: 'Cowboys campaign' },
  { match: /chiefs|kansas|kc/, team: 'Chiefs', reads: 'Chiefs campaign' },
  { match: /lakers|lal/, team: 'Lakers', reads: 'Lakers campaign' },
  { match: /sixers|76ers/, team: '76ers', reads: '76ers campaign' },
  { match: /phillies/, team: 'Phillies', reads: 'Phillies campaign' },
  { match: /jersey|kit|uniform/, department: 'Jerseys', reads: 'jersey campaign' },
  { match: /hat|cap|headwear/, department: 'Hats', reads: 'headwear campaign' },
  { match: /kids|youth|junior/, department: 'Kids', reads: 'kids campaign' },
  { match: /collectible|memorabilia|signed/, department: 'Collectibles', reads: 'collectibles campaign' },
  { match: /gift|holiday|christmas|fathers-day|mothers-day/, giftIntent: 0.9, reads: 'gifting campaign' },
  { match: /sale|clearance|promo|discount|outlet|bogo/, priceSensitivity: 0.9, reads: 'discount campaign' },
  { match: /playoff|postseason|championship|finals/, department: 'Jerseys', reads: 'postseason campaign' },
];

/** Weight a campaign match carries. Between a click and a purchase record. */
export const CAMPAIGN_EVIDENCE = 1.5;

interface ReferrerHint {
  match: RegExp;
  channel: string;
  giftIntent?: number;
  priceSensitivity?: number;
}

const REFERRER_HINTS: ReferrerHint[] = [
  { match: /google|bing|duckduckgo|yahoo/, channel: 'Organic search' },
  // Social traffic browses rather than buys, and converts on price. Both of
  // these are weak nudges, not claims.
  { match: /instagram|tiktok|facebook|pinterest|reddit|x\.com|twitter/, channel: 'Social', priceSensitivity: 0.7 },
  { match: /mail|klaviyo|sendgrid|mailchimp/, channel: 'Email' },
  { match: /espn|bleacherreport|theathletic|sports/, channel: 'Sports media' },
];

export interface ContextReading {
  geo: GeoResolution;
  channel: string;
  campaignReads: string[];
  deviceSkew: { gender: GenderTrait; weight: number } | null;
  /** Human-readable list of everything context alone established. */
  notes: string[];
}

/**
 * Everything context alone allows, with nothing else known.
 *
 * This is what the demo opens on: the model has already said something before
 * the shopper has done anything, which is the entire argument for contextual
 * personalization.
 */
export function readContext(context: VisitorContext): ContextReading {
  const geo = resolveGeo(context.timezone);
  const notes: string[] = [];

  if (geo.teams.length > 0) {
    notes.push(
      `Timezone ${context.timezone} resolves to ${geo.zoneLabel}, narrowing to ${geo.cities.join(' and ')}.`
    );
  } else {
    notes.push(
      context.timezone
        ? `Timezone ${context.timezone} contains none of the catalog's markets, so no regional prior is applied.`
        : 'No timezone available, so no regional prior is applied.'
    );
  }

  const ref = context.referrer?.toLowerCase() ?? '';
  const hint = REFERRER_HINTS.find((h) => h.match.test(ref));
  const channel = ref ? (hint?.channel ?? 'Referral') : 'Direct';
  notes.push(
    ref ? `Referrer reads as ${channel.toLowerCase()} traffic.` : 'No referrer: direct or bookmarked arrival.'
  );

  const utmBlob = [context.utm.source, context.utm.medium, context.utm.campaign]
    .filter(Boolean)
    .join('/')
    .toLowerCase();
  const matched = utmBlob ? CAMPAIGN_HINTS.filter((h) => h.match.test(utmBlob)) : [];
  const campaignReads = matched.map((m) => m.reads);
  if (campaignReads.length > 0) {
    notes.push(`Campaign "${context.utm.campaign}" reads as ${campaignReads.join(', ')}.`);
  } else if (utmBlob) {
    notes.push(`Campaign "${context.utm.campaign}" matched no known intent pattern.`);
  }

  // Device to a gender skew. This is the weakest inference in the module and is
  // the one most likely to be wrong about any individual: it is an aggregate
  // tendency in apparel traffic, nothing more. It is included because it is real
  // and excluded from mattering because its weight is a third of one page view.
  const deviceSkew =
    context.device === 'mobile'
      ? { gender: 'womens' as GenderTrait, weight: DEVICE_GENDER_EVIDENCE }
      : context.device === 'desktop'
        ? { gender: 'mens' as GenderTrait, weight: DEVICE_GENDER_EVIDENCE }
        : null;
  if (deviceSkew) {
    notes.push(
      `${context.device === 'mobile' ? 'Mobile' : 'Desktop'} session applies a mild ${deviceSkew.gender} skew - an aggregate tendency, weighted at a third of a page view.`
    );
  }

  return { geo, channel, campaignReads, deviceSkew, notes };
}

/* ------------------------------------------------------- the seed itself -- */

/** How fast a prior session's affinities fade. Half-life of about two weeks. */
export const PRIOR_SESSION_HALF_LIFE_DAYS = 14;

/**
 * Everything a rung puts on the table, as evidence descriptions.
 *
 * Cumulative: `member` returns the contextual writes as well, because a logged-in
 * shopper still arrived from somewhere on some device. Nothing is replaced as
 * you climb - it is added to, which is what makes the completeness meter
 * monotonic and the promotion animation legible.
 */
export function seedWrites(seed: IdentitySeed): SeedWrite[] {
  const writes: SeedWrite[] = [];
  const at = (rung: IdentityState) => hasReached(seed.state, rung);

  // --- contextual --------------------------------------------------------
  if (at('contextual') && seed.context) {
    const reading = readContext(seed.context);

    for (const { team, weight } of reading.geo.teams) {
      writes.push({
        field: 'team',
        key: team,
        weight,
        source: 'inferred',
        label: `Regional prior - ${TEAM_BY_ID[team].city} is in ${reading.geo.zoneLabel}`,
        rung: 'contextual',
      });
    }

    const utmBlob = [seed.context.utm.source, seed.context.utm.medium, seed.context.utm.campaign]
      .filter(Boolean)
      .join('/')
      .toLowerCase();
    for (const hint of utmBlob ? CAMPAIGN_HINTS.filter((h) => h.match.test(utmBlob)) : []) {
      const label = `Campaign intent - ${hint.reads}`;
      if (hint.team) {
        writes.push({ field: 'team', key: hint.team, weight: CAMPAIGN_EVIDENCE, source: 'inferred', label, rung: 'contextual' });
      }
      if (hint.department) {
        writes.push({ field: 'department', key: hint.department, weight: CAMPAIGN_EVIDENCE, source: 'inferred', label, rung: 'contextual' });
      }
      if (hint.giftIntent !== undefined) {
        writes.push({ field: 'giftIntent', weight: CAMPAIGN_EVIDENCE, value: hint.giftIntent, source: 'inferred', label, rung: 'contextual' });
      }
      if (hint.priceSensitivity !== undefined) {
        writes.push({ field: 'priceSensitivity', weight: CAMPAIGN_EVIDENCE, value: hint.priceSensitivity, source: 'inferred', label, rung: 'contextual' });
      }
    }

    const ref = seed.context.referrer?.toLowerCase() ?? '';
    const refHint = REFERRER_HINTS.find((h) => h.match.test(ref));
    if (refHint?.priceSensitivity !== undefined) {
      writes.push({
        field: 'priceSensitivity',
        weight: 0.8,
        value: refHint.priceSensitivity,
        source: 'inferred',
        label: `${refHint.channel} traffic converts on price`,
        rung: 'contextual',
      });
    }

    if (reading.deviceSkew) {
      writes.push({
        field: 'gender',
        key: reading.deviceSkew.gender,
        weight: reading.deviceSkew.weight,
        source: 'inferred',
        label: `Device skew - ${seed.context.device} session`,
        rung: 'contextual',
      });
    }
  }

  // --- returning ---------------------------------------------------------
  if (at('returning') && seed.priorSessions) {
    for (const session of seed.priorSessions) {
      // Halved every fortnight. A session from three months ago is worth about
      // 1% of a fresh one, which is roughly what it deserves.
      const decay = Math.pow(0.5, session.endedDaysAgo / PRIOR_SESSION_HALF_LIFE_DAYS);
      const when =
        session.endedDaysAgo <= 1 ? 'yesterday' : `${Math.round(session.endedDaysAgo)} days ago`;

      for (const [team, weight] of Object.entries(session.teams)) {
        writes.push({
          field: 'team',
          key: team,
          weight: (weight ?? 0) * decay,
          source: 'session',
          label: `Prior session ${when} - browsed ${team}`,
          rung: 'returning',
        });
      }
      for (const [dept, weight] of Object.entries(session.departments)) {
        writes.push({
          field: 'department',
          key: dept,
          weight: (weight ?? 0) * decay,
          source: 'session',
          label: `Prior session ${when} - browsed ${dept}`,
          rung: 'returning',
        });
      }
    }
  }

  // --- identified --------------------------------------------------------
  if (at('identified') && seed.crm) {
    const { crm } = seed;
    // A CRM record is a declared fact, not an inference, so it lands heavy -
    // heavier than any single session can move it. It can still be outvoted by
    // sustained contrary behaviour, which is correct: people shop for others.
    if (crm.gender) {
      writes.push({ field: 'gender', key: crm.gender, weight: 4.0, source: 'crm', label: 'CRM record - declared gender preference', rung: 'identified' });
    }
    if (crm.ageBand) {
      writes.push({ field: 'ageBand', key: crm.ageBand, weight: 4.0, source: 'crm', label: 'CRM record - age band', rung: 'identified' });
    }
    if (crm.region) {
      writes.push({ field: 'region', weight: 4.0, key: crm.region, source: 'crm', label: 'CRM record - billing region', rung: 'identified' });
    }
    if (crm.avgOrderValue !== undefined) {
      // Inverted onto [0,1] across a $20-$180 band: a high average order value
      // means low price sensitivity.
      const sensitivity = Math.max(0.05, Math.min(0.95, 1 - (crm.avgOrderValue - 20) / 160));
      writes.push({
        field: 'priceSensitivity',
        weight: 2.5,
        value: sensitivity,
        source: 'crm',
        label: `CRM record - $${crm.avgOrderValue.toFixed(0)} average order value`,
        rung: 'identified',
      });
    }
    if (crm.emailEngagement !== undefined && crm.emailEngagement > 0.5) {
      writes.push({
        field: 'giftIntent',
        weight: 0.6,
        value: 0.6,
        source: 'crm',
        label: `Email engagement ${(crm.emailEngagement * 100).toFixed(0)}% - responsive to campaign merchandising`,
        rung: 'identified',
      });
    }
  }

  // --- member ------------------------------------------------------------
  if (at('member') && seed.member) {
    const { member } = seed;

    for (const { team, orders } of member.orderedTeams) {
      // Log-scaled: the tenth order for a club says much less than the first.
      const weight = Math.min(3.5, Math.log1p(orders) * 1.6);
      writes.push({
        field: 'team',
        key: team,
        weight,
        source: 'history',
        label: `Order history - ${orders} order${orders === 1 ? '' : 's'} of ${team} merchandise`,
        rung: 'member',
      });
      writes.push({
        field: 'league',
        key: TEAM_BY_ID[team].league,
        weight: weight * 0.5,
        source: 'history',
        label: `Order history - propagated from ${team}`,
        rung: 'member',
      });
    }

    {
      // Present whether or not any gift orders exist. Zero gift orders out of
      // eight is a fact about this shopper, not an absence of one, and the
      // meter should credit us for knowing it.
      const share = member.lifetimeOrders > 0 ? member.giftOrders / member.lifetimeOrders : 0;
      writes.push({
        field: 'giftIntent',
        weight: 2.0,
        value: Math.min(0.95, 0.15 + share * 1.1),
        source: 'history',
        label: member.giftOrders > 0
          ? `Order history - ${member.giftOrders} of ${member.lifetimeOrders} orders shipped to another address`
          : `Order history - all ${member.lifetimeOrders} orders shipped to the account address`,
        rung: 'member',
      });
    }

    for (const { player, orders } of member.orderedPlayers) {
      writes.push({
        field: 'player',
        key: player,
        weight: Math.min(3.5, Math.log1p(orders) * 1.6),
        source: 'history',
        label: `Order history - ${orders} ${player} item${orders === 1 ? '' : 's'}`,
        rung: 'member',
      });
    }

    for (const { department, orders } of member.orderedDepartments) {
      writes.push({
        field: 'department',
        key: department,
        weight: Math.min(3.5, Math.log1p(orders) * 1.6),
        source: 'history',
        label: `Order history - ${orders} ${department} purchase${orders === 1 ? '' : 's'}`,
        rung: 'member',
      });
    }

    for (const [dept, size] of Object.entries(member.sizeProfile)) {
      writes.push({
        field: 'size',
        key: `${dept}:${size}`,
        // A shipped and unreturned order is the strongest fact in the profile.
        weight: 5.0,
        source: 'history',
        label: `Confirmed ${size} in ${dept} from a completed order`,
        rung: 'member',
      });
    }

    writes.push({
      field: 'orders',
      weight: member.lifetimeOrders,
      source: 'history',
      label: `${member.lifetimeOrders} lifetime orders`,
      rung: 'member',
    });
    writes.push({
      field: 'loyalty',
      key: member.loyaltyTier,
      weight: 1,
      source: 'crm',
      label: `Loyalty tier - ${member.loyaltyTier}`,
      rung: 'member',
    });
  }

  return writes;
}

/* ------------------------------------------------------------ completeness -- */

/**
 * How much of the profile is actually filled in, weighted by what each field is
 * worth to a merchandising decision.
 *
 * The weights are not uniform because the fields are not equal: knowing a
 * shopper's club reshapes an entire page, knowing their gift intent nudges one
 * carousel. They sum to 1 so the meter reads as a percentage without a scaling
 * step nobody can audit.
 */
export const COMPLETENESS_WEIGHTS: Record<string, number> = {
  team: 0.18,
  department: 0.14,
  league: 0.07,
  player: 0.05,
  gender: 0.08,
  ageBand: 0.06,
  region: 0.06,
  priceSensitivity: 0.07,
  giftIntent: 0.04,
  size: 0.1,
  history: 0.09,
  loyalty: 0.06,
};

/**
 * What a global prior is worth.
 *
 * Not zero. An anonymous visitor is not a blank: the popularity prior is a real
 * statement about every field and it beats chance. Twelve percent is the floor
 * the meter starts at, and it is the reason `anonymous` reads as 12% rather than
 * as an accusing 0%.
 */
export const PRIOR_FLOOR = 0.12;

/**
 * The ceiling each kind of evidence can raise a field to.
 *
 * A field known only from a device skew can never be complete however much of
 * that skew accumulates - the signal has a quality limit, not just a quantity
 * one. A declared CRM fact has no such limit. This is what stops the meter
 * rewarding a large pile of weak inferences as if it were knowledge.
 */
const SOURCE_CEILING: Record<ProfileSource, number> = {
  prior: PRIOR_FLOOR,
  inferred: 0.55,
  session: 0.8,
  history: 0.97,
  crm: 1.0,
};

/**
 * Evidence at which a field reaches ~63% of its ceiling. Mirrors profile.ts's
 * SUFFICIENCY_K deliberately - duplicated rather than imported to keep this
 * module a runtime leaf, the same trade persona.ts makes.
 */
const COVERAGE_K = 2.0;

/**
 * How filled-in a field is: how much evidence, capped by how good that evidence
 * can be.
 *
 * NOT confidence. The two answer different questions and conflating them was
 * the first version's mistake. A shopper who genuinely splits between the
 * Eagles and the Phillies has a COMPLETE team profile and a LOW-confidence
 * prediction - we know exactly what they like, and what they like is two
 * clubs. A meter reading confidence would report that shopper as barely known,
 * which is the opposite of the truth and would send an operator hunting for
 * data they already have.
 */
function coverage(evidence: number, source: ProfileSource): number {
  const ceiling = SOURCE_CEILING[source] ?? PRIOR_FLOOR;
  return Math.max(PRIOR_FLOOR, ceiling * (1 - Math.exp(-evidence / COVERAGE_K)));
}

export interface CompletenessField {
  field: string;
  weight: number;
  /** How filled in this field is, in [0,1]. */
  score: number;
  /** Its contribution to the total, in percentage points. */
  contribution: number;
  source: ProfileSource;
}

export interface CompletenessReport {
  /** 0-100. */
  percent: number;
  fields: CompletenessField[];
  /** The three cheapest wins, highest weighted shortfall first. */
  biggestGaps: CompletenessField[];
}

export function profileCompleteness(profile: VisitorProfile): CompletenessReport {
  const sizeKnown = Object.keys(profile.traits.sizeProfile);
  const sizeSource: ProfileSource = sizeKnown.length
    ? profile.traits.sizeProfile[sizeKnown[0] as Department]!.confidence.source
    : 'prior';

  const raw: { field: string; score: number; source: ProfileSource }[] = [
    { field: 'team', score: coverage(profile.affinities.team.confidence.evidenceCount, profile.affinities.team.confidence.source), source: profile.affinities.team.confidence.source },
    { field: 'department', score: coverage(profile.affinities.department.confidence.evidenceCount, profile.affinities.department.confidence.source), source: profile.affinities.department.confidence.source },
    { field: 'league', score: coverage(profile.affinities.league.confidence.evidenceCount, profile.affinities.league.confidence.source), source: profile.affinities.league.confidence.source },
    { field: 'player', score: coverage(profile.affinities.player.confidence.evidenceCount, profile.affinities.player.confidence.source), source: profile.affinities.player.confidence.source },
    { field: 'gender', score: coverage(profile.traits.gender.confidence.evidenceCount, profile.traits.gender.confidence.source), source: profile.traits.gender.confidence.source },
    { field: 'ageBand', score: coverage(profile.traits.ageBand.confidence.evidenceCount, profile.traits.ageBand.confidence.source), source: profile.traits.ageBand.confidence.source },
    { field: 'region', score: profile.traits.region.value ? coverage(profile.traits.region.confidence.evidenceCount, profile.traits.region.confidence.source) : PRIOR_FLOOR, source: profile.traits.region.confidence.source },
    { field: 'priceSensitivity', score: coverage(profile.traits.priceSensitivity.evidence, profile.traits.priceSensitivity.confidence.source), source: profile.traits.priceSensitivity.confidence.source },
    { field: 'giftIntent', score: coverage(profile.traits.giftIntent.evidence, profile.traits.giftIntent.confidence.source), source: profile.traits.giftIntent.confidence.source },
    // Three departments' worth of confirmed sizing is a complete picture for
    // apparel; beyond that it stops changing any decision.
    { field: 'size', score: Math.max(PRIOR_FLOOR, (SOURCE_CEILING[sizeSource] ?? PRIOR_FLOOR) * Math.min(1, sizeKnown.length / 3)), source: sizeSource },
    { field: 'history', score: Math.max(PRIOR_FLOOR, 0.97 * (1 - Math.exp(-profile.state.lifetimeOrders / 4))), source: profile.state.lifetimeOrders > 0 ? 'history' : 'prior' },
    { field: 'loyalty', score: profile.state.loyaltyTier ? 1 : PRIOR_FLOOR, source: profile.state.loyaltyTier ? 'crm' : 'prior' },
  ];

  const fields: CompletenessField[] = raw.map((r) => {
    const weight = COMPLETENESS_WEIGHTS[r.field] ?? 0;
    const score = Math.max(PRIOR_FLOOR, Math.min(1, r.score));
    return { field: r.field, weight, score, contribution: weight * score * 100, source: r.source };
  });

  const percent = fields.reduce((sum, f) => sum + f.contribution, 0);

  const biggestGaps = [...fields]
    .sort((a, b) => b.weight * (1 - b.score) - a.weight * (1 - a.score))
    .slice(0, 3);

  return { percent: Number(percent.toFixed(1)), fields, biggestGaps };
}

/* -------------------------------------------- demo seeds from a scenario -- */

/**
 * The SKUs a member with this history would plausibly have bought.
 *
 * Deterministic, like the rest of the seed: for each favourite club, the most
 * popular item in the two departments the record already says they order from.
 * That is the merchandise a fan with a handful of orders realistically owns,
 * and picking it by popularity rather than at random means the demo's ownership
 * rule fires on products the shopper is likely to meet again - which is the
 * whole thing worth demonstrating.
 *
 * Ages are spread across and beyond the ownership window on purpose. A record
 * where every order is recent would make the rule look absolute; one order at
 * 210 days is what shows a viewer that the window has an outside edge.
 *
 * The gift flag lands on the SECOND club's item, when there is one. A shopper
 * whose order history is mostly one club with an occasional other-club item in
 * it is the archetypal gift buyer, and that is the pattern the exception exists
 * to protect.
 */
function recentOrdersFor(
  favTeams: TeamId[],
  orders: number,
  catalog?: Product[]
): { productId: string; daysAgo: number; gift: boolean }[] {
  if (!catalog || catalog.length === 0 || orders === 0) return [];

  const wanted: Department[] = ['Jerseys', 'Hats'];
  const out: { productId: string; daysAgo: number; gift: boolean }[] = [];

  favTeams.slice(0, 2).forEach((team, clubIndex) => {
    wanted.forEach((department, deptIndex) => {
      const best = catalog
        .filter((p) => p.team === team && p.department === department)
        .sort((a, b) => b.popularity - a.popularity)[0];
      if (!best || out.some((o) => o.productId === best.id)) return;
      out.push({
        productId: best.id,
        daysAgo: 18 + clubIndex * 96 + deptIndex * 41,
        gift: clubIndex === 1,
      });
    });
  });

  return out;
}

/**
 * Synthesises the record each rung would hold for a demo persona.
 *
 * Derived deterministically from the scenario - no RNG - so the same shopper
 * promotes to the same profile every time the demo is run. The alternative,
 * hand-authoring five records per scenario, would drift from the scenario
 * definitions the moment either changed.
 *
 * `catalog` is optional and only the order history needs it. A seed built
 * without one is complete in every other respect and simply has no line items,
 * which is the correct behaviour for a caller that has not loaded a catalog -
 * better than resolving SKUs against a catalog that might not be the one the
 * storefront is rendering.
 */
export function demoSeedFor(
  scenario: Scenario,
  state: IdentityState,
  context?: VisitorContext,
  catalog?: Product[]
): IdentitySeed {
  const favTeams = scenario.favTeams ?? [];
  const orders = scenario.historicalOrdersCount ?? 0;

  const priorSessions: PriorSession[] = favTeams.slice(0, 2).map((team, i) => ({
    endedDaysAgo: 3 + i * 11,
    teams: { [team]: 1.6 - i * 0.5 } as Partial<Record<TeamId, number>>,
    departments: { [DEPARTMENT_IDS[i % DEPARTMENT_IDS.length]]: 1.0 } as Partial<
      Record<Department, number>
    >,
  }));

  const crm: CrmTraits = {
    gender: orders > 6 ? 'mens' : 'unisex',
    ageBand: 'adult',
    region: favTeams[0] ? `Greater ${TEAM_BY_ID[favTeams[0]].city}` : 'United States',
    emailEngagement: Math.min(0.9, 0.25 + orders * 0.05),
    avgOrderValue: 45 + orders * 6,
  };

  const member: MemberRecord = {
    lifetimeOrders: orders,
    loyaltyTier: orders >= 12 ? 'Gold' : orders >= 5 ? 'Silver' : 'Member',
    orderedTeams: favTeams.map((team, i) => ({
      team,
      orders: Math.max(1, Math.round(orders * Math.pow(0.5, i))),
    })),
    orderedDepartments: [
      { department: 'Jerseys' as Department, orders: Math.max(1, Math.round(orders * 0.5)) },
      { department: 'Hats' as Department, orders: Math.max(1, Math.round(orders * 0.3)) },
    ],
    // A quarter of orders going elsewhere is the realistic shape for a fan who
    // buys the occasional jersey for a relative.
    giftOrders: Math.round(orders * 0.25),
    recentOrders: recentOrdersFor(favTeams, orders, catalog),
    // The top-billed player from each favourite club, which is what a shopper
    // with a handful of orders realistically owns.
    orderedPlayers: favTeams.slice(0, 2).flatMap((team, i) => {
      const star = TEAM_BY_ID[team].players[0];
      return star ? [{ player: star.name, orders: Math.max(1, Math.round(orders * Math.pow(0.4, i))) }] : [];
    }),
    sizeProfile: { Jerseys: 'L', 'T-shirts': 'L', Hoodies: 'XL' },
  };

  return { state, context, priorSessions, crm, member };
}

/** A neutral context for a visitor the browser told us nothing about. */
export function emptyContext(): VisitorContext {
  return { timezone: null, referrer: null, landingPage: '/', utm: {}, device: 'desktop' };
}

export type { League };
