/**
 * What the browser knows about a visitor before they touch anything.
 *
 * This is the DOM half of the identity ladder. `src/ml/identity.ts` decides what
 * context is worth and stays free of React and the DOM so the harness can run
 * it; this file does the reading, and nothing else.
 *
 * Geo comes from the IANA timezone rather than an IP lookup. That is a
 * constraint, not a preference - the prototype makes no network call at runtime,
 * so there is no geolocation service to ask. A timezone is a coarser signal than
 * an IP and `resolveGeo` treats it as such: a zone is narrowed to the catalog's
 * markets inside it and split by market size, and a zone with no catalog market
 * in it yields nothing at all.
 */

import type { DeviceClass, VisitorContext } from '../ml/identity';
import { emptyContext } from '../ml/identity';

/**
 * Query parameters that let a demo be opened as a specific arriving visitor.
 *
 * The point of the ladder is that a link carries context, so the demo has to be
 * openable that way: `?utm_campaign=eagles-playoff-jersey-drop&tz=America/New_York`
 * arrives as a shopper who clicked a campaign in Philadelphia. Without this the
 * `contextual` rung could only ever show whatever the presenter's own laptop
 * happened to be, which in practice is an unmapped timezone and no campaign.
 */
export interface ContextOverrides {
  timezone?: string;
  referrer?: string;
  device?: DeviceClass;
}

function readDevice(): DeviceClass {
  if (typeof window === 'undefined') return 'desktop';
  // Pointer coarseness over user-agent sniffing: it asks the question we
  // actually care about - is this a finger or a mouse - and does not need a
  // table of device strings kept up to date.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const width = window.innerWidth || 1280;
  if (coarse && width < 768) return 'mobile';
  if (coarse) return 'tablet';
  return 'desktop';
}

function readTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Reads the arriving context. Safe to call during render and safe under SSR -
 * with no `window` it returns the same empty context the `anonymous` rung would
 * see anyway.
 */
export function readVisitorContext(overrides: ContextOverrides = {}): VisitorContext {
  if (typeof window === 'undefined') return { ...emptyContext(), ...overrides } as VisitorContext;

  const params = new URLSearchParams(window.location.search);
  const param = (k: string) => params.get(k) ?? undefined;

  const utm = {
    source: param('utm_source'),
    medium: param('utm_medium'),
    campaign: param('utm_campaign'),
  };

  return {
    timezone: overrides.timezone ?? param('tz') ?? readTimezone(),
    // An empty referrer is a direct arrival, which is itself a signal. Coercing
    // it to null keeps that distinct from "we could not read it".
    referrer: overrides.referrer ?? param('ref') ?? (document.referrer || null),
    landingPage: param('landing') ?? window.location.pathname + window.location.search,
    utm: {
      source: utm.source,
      medium: utm.medium,
      campaign: utm.campaign,
    },
    device: overrides.device ?? (param('device') as DeviceClass | undefined) ?? readDevice(),
  };
}

/**
 * A worked example for presenting on a machine whose own context says nothing.
 *
 * Most laptops in the room will be on an unmapped timezone with no referrer and
 * no campaign, and the honest reading of that is silence - which makes for a
 * poor demonstration of a rung whose entire subject is what context can tell
 * you. This is the arriving visitor the demo assumes when nothing real is
 * present, and the UI labels it as simulated.
 */
export const SIMULATED_ARRIVAL: VisitorContext = {
  timezone: 'America/New_York',
  referrer: 'https://www.instagram.com/',
  landingPage: '/campaign/eagles-playoff-jersey-drop',
  utm: { source: 'instagram', medium: 'paid_social', campaign: 'eagles-playoff-jersey-drop' },
  device: 'mobile',
};

/**
 * True when the real context carries nothing the `contextual` rung could act on.
 * The caller uses this to decide whether to fall back to `SIMULATED_ARRIVAL`,
 * and to tell the viewer which of the two they are looking at.
 */
export function contextIsBare(context: VisitorContext): boolean {
  return !context.referrer && !context.utm.campaign && !context.utm.source;
}
