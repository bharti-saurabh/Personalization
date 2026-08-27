/**
 * The capture ledger: every field the store has on this visitor, where it came
 * from, and what it bought us.
 *
 * WHY THIS EXISTS
 * ---------------
 * The engine has always read the arriving request - `ml/identity.ts` resolves a
 * timezone to a market, a referrer to a channel and a campaign to an intent, and
 * has done since the identity ladder landed. None of it was on screen. The demo
 * opened with a profile that already believed things and no account of where the
 * belief had come from, which is the single question every audience asks first:
 * what do you actually know about me before I have done anything?
 *
 * This module answers it as a ledger rather than as prose. One row per field,
 * with four columns that matter: what was captured, how it was obtained, what
 * the engine inferred from it, and which slot that inference moved. A row with
 * an empty inference is worth as much as a full one - it says the field was
 * collected and nothing was done with it, which is the honest state of most
 * fields in most real stacks.
 *
 * HOW MUCH OF THIS IS REAL
 * ------------------------
 * Every row carries its own `basis`, and the split is not cosmetic:
 *
 *   read       genuinely read from the browser this page is running in. The
 *              screen size, the language, the timezone, the pointer type, the
 *              connection hint. Open the console and check any of them.
 *   derived    computed from a read field by a function in this build. The
 *              market from the timezone, the channel from the referrer, the
 *              day part from the local hour.
 *   simulated  invented, deterministically, because the prototype makes no
 *              network call at runtime and therefore has no IP lookup, no
 *              identity graph and no CRM to ask. The IP address, the carrier,
 *              the cookie age and the prior-session counts are all here.
 *   withheld   available at a higher rung of the identity ladder and not at
 *              this one. This is the row that matters most in a privacy
 *              conversation: it is what the store is choosing not to hold.
 *
 * Nothing is labelled `read` that is not read. A demo that blurs that line is
 * worse than one that shows less.
 *
 * DETERMINISM. The simulated fields are hashed from the visitor id and the
 * timezone, so the same visitor gets the same address on every render and
 * across a reload. A field that changes when nobody did anything is a field
 * nobody believes.
 *
 * React-free and DOM-free, like the rest of `src/state`. The DOM reads happen
 * in `context/visitorContext.ts` and arrive here as data.
 */

import type { IdentityState, VisitorContext } from '../ml/engine';
import { IDENTITY_LADDER, resolveGeo } from '../ml/engine';
import type { UserEvent } from '../types';
import { hashString, mulberry32 } from '../sim/rng';
import { TEAM_BY_ID } from '../sim/taxonomy';

/* -------------------------------------------------------- client signals -- */

/**
 * What the browser can be asked directly.
 *
 * Every field is nullable because every one of them is genuinely absent
 * somewhere: a locked-down browser reports no connection hint, Firefox reports
 * no `deviceMemory`, and a server render has none of it. Null is rendered as
 * "not available", which is itself an interesting row.
 */
export interface ClientSignals {
  language: string | null;
  languages: string[];
  platform: string | null;
  screen: { width: number; height: number; dpr: number } | null;
  viewport: { width: number; height: number } | null;
  pointer: 'coarse' | 'fine' | null;
  prefersDark: boolean | null;
  prefersReducedMotion: boolean | null;
  /** navigator.connection. Chromium only, and absent everywhere else. */
  connection: { effectiveType: string | null; downlink: number | null; saveData: boolean | null } | null;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  cookiesEnabled: boolean | null;
  doNotTrack: string | null;
  /** Local hour in the visitor's own zone, 0-23. */
  localHour: number | null;
  localWeekday: string | null;
}

export function emptyClientSignals(): ClientSignals {
  return {
    language: null,
    languages: [],
    platform: null,
    screen: null,
    viewport: null,
    pointer: null,
    prefersDark: null,
    prefersReducedMotion: null,
    connection: null,
    hardwareConcurrency: null,
    deviceMemoryGb: null,
    cookiesEnabled: null,
    doNotTrack: null,
    localHour: null,
    localWeekday: null,
  };
}

/* -------------------------------------------------- the simulated half -- */

/**
 * A carrier per market, so the simulated address is at least plausible for the
 * city the timezone resolved to. Cosmetic, and cheaply so: a Philadelphia
 * shopper on a Los Angeles cable network is the kind of detail that makes an
 * audience stop trusting everything else on the screen.
 */
const CARRIERS: Record<string, { isp: string; asn: string; block: number }[]> = {
  Philadelphia: [
    { isp: 'Comcast Cable', asn: 'AS7922', block: 73 },
    { isp: 'Verizon Fios', asn: 'AS701', block: 108 },
  ],
  Dallas: [
    { isp: 'Charter Spectrum', asn: 'AS20115', block: 24 },
    { isp: 'AT&T Internet', asn: 'AS7018', block: 99 },
  ],
  'Kansas City': [{ isp: 'Google Fiber', asn: 'AS16591', block: 136 }],
  'Los Angeles': [
    { isp: 'Charter Spectrum', asn: 'AS20115', block: 47 },
    { isp: 'Cox Communications', asn: 'AS22773', block: 68 },
  ],
};

const FALLBACK_CARRIER = { isp: 'Regional broadband', asn: 'AS3356', block: 63 };

const MOBILE_CARRIERS = [
  { isp: 'T-Mobile US', asn: 'AS21928', block: 172 },
  { isp: 'Verizon Wireless', asn: 'AS6167', block: 174 },
];

/** Postal prefixes per market. Three digits only, which is the honest precision. */
const POSTAL: Record<string, string[]> = {
  Philadelphia: ['191', '190', '080'],
  Dallas: ['752', '750', '761'],
  'Kansas City': ['641', '660'],
  'Los Angeles': ['900', '902', '913'],
};

export interface NetworkEstimate {
  ip: string;
  ipVersion: 'IPv4';
  isp: string;
  asn: string;
  connectionType: string;
  city: string | null;
  region: string | null;
  postalPrefix: string | null;
  /** Radius in kilometres the geo claim is good to. Never presented as a point. */
  accuracyKm: number;
  proxy: boolean;
}

/**
 * Invents a network identity for the visitor, deterministically.
 *
 * The accuracy radius is the important field and it is deliberately wide. A
 * commercial IP-to-city database is right about the metro roughly three times
 * in four and right about the postcode almost never, and a demo that prints a
 * street-level location from an IP is teaching the audience something false.
 */
export function simulateNetwork(
  visitorId: string,
  context: VisitorContext
): NetworkEstimate {
  const geo = resolveGeo(context.timezone);
  const city = geo.cities[0] ?? null;
  const rng = mulberry32(hashString(`${visitorId}|${context.timezone ?? 'nozone'}`));

  const mobile = context.device === 'mobile';
  const pool = mobile
    ? MOBILE_CARRIERS
    : (city && CARRIERS[city]) || [FALLBACK_CARRIER];
  const carrier = pool[Math.floor(rng() * pool.length)] ?? FALLBACK_CARRIER;

  const octet = () => Math.floor(rng() * 254) + 1;
  const postals = (city && POSTAL[city]) || null;

  return {
    ip: `${carrier.block}.${octet()}.${octet()}.${octet()}`,
    ipVersion: 'IPv4',
    isp: carrier.isp,
    asn: carrier.asn,
    connectionType: mobile ? 'Cellular' : 'Fixed broadband',
    city,
    region: geo.zoneLabel,
    postalPrefix: postals ? `${postals[Math.floor(rng() * postals.length)]}xx` : null,
    // Cellular addresses geolocate far worse than fixed lines, and saying so is
    // the whole point of carrying the number at all.
    accuracyKm: mobile ? 65 : 25,
    proxy: false,
  };
}

export interface StorageEstimate {
  /** First-party cookie. Present from `returning` upwards. */
  cookieId: string | null;
  cookieAgeDays: number | null;
  priorSessions: number | null;
  lastSeenDaysAgo: number | null;
  /** What the visitor has consented to. Simulated, and stated as such. */
  consent: { analytics: boolean; personalization: boolean; advertising: boolean };
}

export function simulateStorage(visitorId: string, rung: IdentityState): StorageEstimate {
  const known = rungAtLeast(rung, 'returning');
  if (!known) {
    return {
      cookieId: null,
      cookieAgeDays: null,
      priorSessions: null,
      lastSeenDaysAgo: null,
      // No cookie means no stored consent record, which is not the same as a
      // refusal. Personalization on contextual signals alone needs no consent
      // because nothing is stored; that is the legal shape of the rung.
      consent: { analytics: false, personalization: false, advertising: false },
    };
  }

  const rng = mulberry32(hashString(`storage|${visitorId}`));
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join('');

  return {
    cookieId: `${hex(8)}-${hex(4)}-${hex(4)}-${hex(12)}`,
    cookieAgeDays: 30 + Math.floor(rng() * 300),
    priorSessions: 2 + Math.floor(rng() * 9),
    lastSeenDaysAgo: 1 + Math.floor(rng() * 21),
    consent: {
      analytics: true,
      personalization: true,
      advertising: rung === 'member' || rng() > 0.5,
    },
  };
}

function rungAtLeast(state: IdentityState, floor: IdentityState): boolean {
  return IDENTITY_LADDER.indexOf(state) >= IDENTITY_LADDER.indexOf(floor);
}

/* ----------------------------------------------------------- the ledger -- */

export type CaptureGroup = 'network' | 'device' | 'referral' | 'timing' | 'storage' | 'account';

export const CAPTURE_GROUPS: { id: CaptureGroup; label: string; note: string }[] = [
  { id: 'referral', label: 'How they arrived', note: 'The link that brought them, before any code of ours ran' },
  { id: 'network', label: 'Network and place', note: 'Read from the connection. Coarse, and stated as coarse' },
  { id: 'device', label: 'Device and browser', note: 'Asked of the browser directly. No fingerprint is assembled' },
  { id: 'timing', label: 'Time and context', note: 'When they are shopping, in their own clock' },
  { id: 'storage', label: 'First-party storage', note: 'What we are allowed to remember between visits' },
  { id: 'account', label: 'Account and history', note: 'Only above the identified rung, only with consent' },
];

export type CaptureBasis = 'read' | 'derived' | 'simulated' | 'withheld';

export const BASIS_NOTE: Record<CaptureBasis, string> = {
  read: 'Read from this browser. Verifiable in the console right now',
  derived: 'Computed from a read field by a function in this build',
  simulated: 'Invented deterministically. The prototype makes no network call',
  withheld: 'Available at a higher rung of the identity ladder, not at this one',
};

export interface CapturedField {
  id: string;
  group: CaptureGroup;
  label: string;
  /** Rendered as-is. Never null: an absent value is the string, and says why. */
  value: string;
  basis: CaptureBasis;
  /** What the engine concluded, or null when the field is held and not used. */
  inference: string | null;
  /** Slot ids this field moves, for the rail to cross-reference. */
  slots: string[];
  /** Evidence units the inference is worth, in the same scale as a click. */
  weight: number | null;
}

export interface CaptureLedger {
  fields: CapturedField[];
  network: NetworkEstimate;
  storage: StorageEstimate;
  /** Rows that carry an inference. The number worth quoting. */
  actingCount: number;
  /** Rows held back by the rung. The number worth quoting in a privacy review. */
  withheldCount: number;
  readCount: number;
  simulatedCount: number;
}

function dayPart(hour: number | null): string | null {
  if (hour === null) return null;
  if (hour < 6) return 'Overnight';
  if (hour < 11) return 'Morning';
  if (hour < 14) return 'Midday';
  if (hour < 18) return 'Afternoon';
  if (hour < 22) return 'Evening';
  return 'Late night';
}

/**
 * Builds the ledger for the arriving visitor.
 *
 * `channel` and `campaignReads` come from `readContext` rather than being
 * recomputed, so this table and the identity panel can never disagree about
 * what the referrer said.
 */
export function buildCaptureLedger(args: {
  visitorId: string;
  context: VisitorContext;
  client: ClientSignals;
  rung: IdentityState;
  channel: string;
  campaignReads: string[];
  /** True when the arrival itself is the worked example rather than the real one. */
  contextIsSimulated: boolean;
}): CaptureLedger {
  const { context, client, rung, channel, campaignReads, contextIsSimulated } = args;
  const network = simulateNetwork(args.visitorId, context);
  const storage = simulateStorage(args.visitorId, rung);
  const geo = resolveGeo(context.timezone);
  const fields: CapturedField[] = [];

  const push = (f: CapturedField) => fields.push(f);
  const arrivalBasis: CaptureBasis = contextIsSimulated ? 'simulated' : 'read';

  /* ---------------------------------------------------------- referral -- */

  push({
    id: 'referrer',
    group: 'referral',
    label: 'Referrer',
    value: context.referrer ?? 'None. Direct or bookmarked',
    basis: arrivalBasis,
    inference: `Classified as ${channel.toLowerCase()} traffic`,
    slots: channel === 'Social' ? ['priceBand'] : [],
    weight: channel === 'Social' ? 0.4 : null,
  });

  push({
    id: 'landing',
    group: 'referral',
    label: 'Landing path',
    value: context.landingPage,
    basis: arrivalBasis,
    inference: 'Entry point, used to decide which page the session opens on',
    slots: [],
    weight: null,
  });

  const utm = [context.utm.source, context.utm.medium, context.utm.campaign].filter(Boolean);
  push({
    id: 'utm',
    group: 'referral',
    label: 'Campaign tags',
    value: utm.length ? utm.join(' / ') : 'None on this link',
    basis: arrivalBasis,
    inference: campaignReads.length
      ? `Reads as ${campaignReads.join(', ')}`
      : utm.length
        ? 'Matched no known intent pattern'
        : null,
    slots: campaignReads.length ? ['topTeam', 'topCategory'] : [],
    weight: campaignReads.length ? 1.5 : null,
  });

  /* ----------------------------------------------------------- network -- */

  push({
    id: 'ip',
    group: 'network',
    label: 'IP address',
    value: network.ip,
    basis: 'simulated',
    inference: 'Never stored against the profile. Used once, for the market lookup',
    slots: [],
    weight: null,
  });

  push({
    id: 'isp',
    group: 'network',
    label: 'Carrier',
    value: `${network.isp} · ${network.asn} · ${network.connectionType.toLowerCase()}`,
    basis: 'simulated',
    inference: null,
    slots: [],
    weight: null,
  });

  push({
    id: 'geo',
    group: 'network',
    label: 'Approximate location',
    value: network.city
      ? `${network.city}${network.postalPrefix ? ` ${network.postalPrefix}` : ''} · ${network.region ?? 'unknown region'} · ±${network.accuracyKm}km`
      : `${context.timezone ?? 'unknown zone'} · no catalog market inside it`,
    // Derived, not simulated: the market really is resolved from the timezone by
    // `resolveGeo`, and that is the function the storefront actually calls.
    basis: context.timezone ? 'derived' : 'withheld',
    inference: geo.teams.length
      ? `Regional prior across ${geo.teams.map((t) => TEAM_BY_ID[t.team].fullName).join(', ')}, split by market size`
      : 'No catalog market in this zone, so no regional prior is applied',
    slots: geo.teams.length ? ['topTeam', 'topLeague'] : [],
    weight: geo.teams.length ? 2.0 : null,
  });

  /* ------------------------------------------------------------ device -- */

  push({
    id: 'device',
    group: 'device',
    label: 'Device class',
    value: `${context.device}${client.pointer ? ` · ${client.pointer} pointer` : ''}`,
    basis: client.pointer ? 'read' : 'derived',
    inference:
      context.device === 'mobile'
        ? 'Weak apparel-traffic skew, weighted at a third of one page view'
        : context.device === 'desktop'
          ? 'Weak apparel-traffic skew, weighted at a third of one page view'
          : 'No skew applied for tablet traffic',
    slots: context.device === 'tablet' ? [] : ['gender'],
    weight: context.device === 'tablet' ? null : 0.35,
  });

  push({
    id: 'screen',
    group: 'device',
    label: 'Screen and viewport',
    value: client.screen
      ? `${client.screen.width}x${client.screen.height} at ${client.screen.dpr}x` +
        (client.viewport ? ` · viewport ${client.viewport.width}x${client.viewport.height}` : '')
      : 'Not available',
    basis: client.screen ? 'read' : 'withheld',
    inference: 'Sets how many products fit above the fold, which the effort ledger counts against',
    slots: [],
    weight: null,
  });

  push({
    id: 'platform',
    group: 'device',
    label: 'Platform',
    value: client.platform ?? 'Not reported',
    basis: client.platform ? 'read' : 'withheld',
    inference: null,
    slots: [],
    weight: null,
  });

  push({
    id: 'language',
    group: 'device',
    label: 'Language',
    value: client.languages.length ? client.languages.join(', ') : (client.language ?? 'Not reported'),
    basis: client.language ? 'read' : 'withheld',
    inference: 'Copy and size scale. This catalog is US sizing only, so nothing switches',
    slots: [],
    weight: null,
  });

  push({
    id: 'connection',
    group: 'device',
    label: 'Connection quality',
    value: client.connection
      ? [
          client.connection.effectiveType,
          client.connection.downlink !== null ? `${client.connection.downlink}Mb down` : null,
          client.connection.saveData ? 'data saver on' : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Not reported by this browser',
    basis: client.connection ? 'read' : 'withheld',
    inference: client.connection?.saveData
      ? 'Data saver on, so image weight per rail is halved'
      : 'Governs how many images a rail preloads',
    slots: [],
    weight: null,
  });

  push({
    id: 'capability',
    group: 'device',
    label: 'Cores and memory',
    value: [
      client.hardwareConcurrency !== null ? `${client.hardwareConcurrency} cores` : null,
      client.deviceMemoryGb !== null ? `${client.deviceMemoryGb}GB` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Not reported',
    basis: client.hardwareConcurrency !== null ? 'read' : 'withheld',
    inference: 'Whether the ranking runs client-side or is asked of the service',
    slots: [],
    weight: null,
  });

  push({
    id: 'appearance',
    group: 'device',
    label: 'Appearance preferences',
    value: [
      client.prefersDark === null ? null : client.prefersDark ? 'dark theme' : 'light theme',
      client.prefersReducedMotion ? 'reduced motion' : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Not reported',
    basis: client.prefersDark === null ? 'withheld' : 'read',
    inference: client.prefersReducedMotion ? 'Carousels do not auto-advance for this visitor' : null,
    slots: [],
    weight: null,
  });

  /* ------------------------------------------------------------ timing -- */

  push({
    id: 'timezone',
    group: 'timing',
    label: 'Timezone',
    value: context.timezone ?? 'Not readable',
    basis: context.timezone ? 'read' : 'withheld',
    inference: 'The only geo signal this build actually has. Feeds the market lookup above',
    slots: geo.teams.length ? ['topTeam'] : [],
    weight: null,
  });

  const part = dayPart(client.localHour);
  push({
    id: 'localtime',
    group: 'timing',
    label: 'Local time',
    value:
      client.localHour === null
        ? 'Not readable'
        : `${String(client.localHour).padStart(2, '0')}:00 ${client.localWeekday ?? ''} · ${part}`.trim(),
    basis: client.localHour === null ? 'withheld' : 'derived',
    inference: part
      ? `${part} traffic. The lifecycle triggers hold their sends to a window in this clock`
      : null,
    slots: [],
    weight: null,
  });

  /* ----------------------------------------------------------- storage -- */

  push({
    id: 'cookie',
    group: 'storage',
    label: 'First-party cookie',
    value: storage.cookieId ?? 'None set. Nothing is stored at this rung',
    basis: storage.cookieId ? 'simulated' : 'withheld',
    inference: storage.cookieId
      ? `Set ${storage.cookieAgeDays} days ago. Links this session to the ones below`
      : 'No identifier means no cross-session memory, and no consent is required',
    slots: [],
    weight: null,
  });

  push({
    id: 'history',
    group: 'storage',
    label: 'Prior sessions',
    value:
      storage.priorSessions === null
        ? 'Not available without an identifier'
        : `${storage.priorSessions} sessions · last seen ${storage.lastSeenDaysAgo} days ago`,
    basis: storage.priorSessions === null ? 'withheld' : 'simulated',
    inference:
      storage.priorSessions === null
        ? null
        : 'Prior affinities are re-folded with their evidence decayed by how long ago the session ended',
    slots: storage.priorSessions === null ? [] : ['topTeam', 'topCategory', 'topPlayer'],
    weight: storage.priorSessions === null ? null : 3.0,
  });

  push({
    id: 'dnt',
    group: 'storage',
    label: 'Browser privacy signals',
    value: [
      client.cookiesEnabled === null ? null : client.cookiesEnabled ? 'cookies enabled' : 'cookies blocked',
      client.doNotTrack === '1' ? 'do not track set' : client.doNotTrack === null ? null : 'do not track off',
    ]
      .filter(Boolean)
      .join(' · ') || 'Not reported',
    basis: client.cookiesEnabled === null ? 'withheld' : 'read',
    inference:
      client.cookiesEnabled === false
        ? 'No storage is possible, so the session cannot climb above the contextual rung'
        : client.doNotTrack === '1'
          ? 'Honoured as a refusal of the advertising rung. The first-party fold continues'
          : null,
    slots: [],
    weight: null,
  });

  push({
    id: 'consent',
    group: 'storage',
    label: 'Consent on file',
    value: storage.cookieId
      ? [
          storage.consent.analytics ? 'analytics' : null,
          storage.consent.personalization ? 'personalization' : null,
          storage.consent.advertising ? 'advertising' : null,
        ]
          .filter(Boolean)
          .join(', ') || 'none granted'
      : 'No record. Nothing stored, so nothing to consent to',
    basis: storage.cookieId ? 'simulated' : 'withheld',
    inference: storage.cookieId
      ? 'Personalization consent is what makes the rungs above this one legal to use'
      : null,
    slots: [],
    weight: null,
  });

  /* ----------------------------------------------------------- account -- */

  const identified = rungAtLeast(rung, 'identified');
  const member = rungAtLeast(rung, 'member');

  push({
    id: 'crm',
    group: 'account',
    label: 'CRM record',
    value: identified ? 'Email matched. Gender, age band, region and email engagement readable' : 'Withheld at this rung',
    basis: identified ? 'simulated' : 'withheld',
    inference: identified
      ? 'Folded as evidence at weight 4, so it can be outvoted by a session that disagrees'
      : 'Requires a captured, consented email address',
    slots: identified ? ['gender', 'priceBand'] : [],
    weight: identified ? 4.0 : null,
  });

  push({
    id: 'orders',
    group: 'account',
    label: 'Order history',
    value: member ? 'Full line-item history, confirmed sizes and loyalty tier' : 'Withheld at this rung',
    basis: member ? 'simulated' : 'withheld',
    inference: member
      ? 'The strongest evidence in the build, and the only source the ownership rule can read'
      : 'Requires an authenticated session',
    slots: member ? ['topTeam', 'topPlayer', 'topCategory', 'giftingPropensity'] : [],
    weight: member ? 6.0 : null,
  });

  return {
    fields,
    network,
    storage,
    actingCount: fields.filter((f) => f.inference !== null && f.basis !== 'withheld').length,
    withheldCount: fields.filter((f) => f.basis === 'withheld').length,
    readCount: fields.filter((f) => f.basis === 'read').length,
    simulatedCount: fields.filter((f) => f.basis === 'simulated').length,
  };
}

/* ------------------------------------------------ progressive capture -- */

/**
 * What one shopper action added to the record.
 *
 * The arrival ledger above is the opening balance. This is the running one: a
 * click is not simply an event in a stream, it is a set of fields the store did
 * not have a second ago. Naming them individually is what turns "we track your
 * behaviour" into something a person can audit.
 */
export interface EventCapture {
  eventId: string;
  /** Field name and the value it took, in capture order. */
  captured: { label: string; value: string }[];
  /** Derived attributes the store computed from the raw capture. */
  derived: string[];
}

export function captureFromEvent(event: UserEvent, position: number): EventCapture {
  const captured: { label: string; value: string }[] = [
    { label: 'Event type', value: event.action },
    { label: 'Surface', value: event.pageType },
    { label: 'Sequence position', value: `${position}` },
  ];
  const derived: string[] = [];

  if (event.team) {
    captured.push({ label: 'Club', value: event.team });
    derived.push('Club affinity evidence, aged at the team decay rate');
  }
  if (event.league) captured.push({ label: 'League', value: event.league });
  if (event.department) {
    captured.push({ label: 'Category', value: event.department });
    derived.push('Category affinity evidence, and a size scale for the fit model');
  }
  if (event.productName) {
    captured.push({ label: 'Product', value: event.productName });
    derived.push('Price point, colourway and brand, read off the SKU rather than asked for');
  }
  if (event.filterApplied) {
    captured.push({ label: 'Filter applied', value: event.filterApplied });
    derived.push('Filter habit, which is the facet model’s only observation channel');
  }
  if (event.pageType === 'Search') {
    derived.push('Stated intent in the shopper’s own words, parsed to catalog nodes');
  }
  if (/added .* to cart/i.test(event.action)) {
    derived.push('Confirmed size and an accepted price point, both stronger than any view');
  }

  return { eventId: event.id, captured, derived };
}
