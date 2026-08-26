/**
 * The only place a visitor profile is persisted.
 *
 * `src/ml/profile.ts` is a pure fold - it takes a profile and an event and hands
 * back a new profile. It has no memory and no storage, deliberately: that is
 * what lets the evaluation harness run it under tsx with no browser anywhere in
 * sight. Something still has to hold the current profile between events, though,
 * and this is that something. It lives in `context/` rather than `ml/` for
 * exactly one reason: it touches localStorage, and nothing in `ml/` or `sim/`
 * may touch the DOM.
 *
 * The split is worth stating plainly because it is easy to erode. Derivation
 * belongs to the fold. Persistence belongs here. A profile is never mutated in
 * place anywhere - this module replaces its stored reference with the new object
 * the fold returned, which is what makes React's identity checks work and what
 * makes a stale render impossible.
 *
 * NOT YET WIRED. Nothing in the app reads this today; AppContext still recomputes
 * intent from the event stream on every change. Wiring it in is a behaviour
 * change and belongs in its own commit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Scenario, TeamId, UserEvent } from '../types';
import {
  runIntentEngineFromProfile,
  runProfileBuild,
  runProfileUpdate,
} from '../ml/engine';
import type { IntentResult, ProfileDelta, VisitorProfile } from '../ml/engine';

/**
 * Bumped whenever the profile shape changes in a way that makes an old stored
 * blob unreadable. A stored profile from a previous schema is discarded and
 * refolded rather than migrated: the fold is cheap, the events are still there,
 * and migration code for a demo's local cache is pure liability.
 */
export const PROFILE_SCHEMA_VERSION = 1;

const STORAGE_PREFIX = 'prosports.profile.v';

interface StoredEnvelope {
  schemaVersion: number;
  profile: VisitorProfile;
}

function storageKey(visitorId: string): string {
  return `${STORAGE_PREFIX}${PROFILE_SCHEMA_VERSION}.${visitorId}`;
}

/**
 * localStorage is not guaranteed to be there. Private browsing, a storage quota,
 * a locked-down corporate profile and server-side rendering all produce either a
 * missing object or a throwing one, and a personalization demo that white-screens
 * because it could not cache a profile would be an unusually poor advertisement.
 * Every access goes through these two, and a failure degrades to in-memory only.
 */
function readStorage(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    /* Quota or a disabled store. In-memory state remains correct. */
  }
}

/**
 * Reads a stored profile, or null.
 *
 * The shape check is deliberately shallow - schema version plus the handful of
 * fields every consumer dereferences without guarding. It is there to catch a
 * blob written by an older build, not to validate untrusted input; the only
 * writer is `saveProfile` on the same origin.
 */
export function loadProfile(visitorId: string): VisitorProfile | null {
  const raw = readStorage(storageKey(visitorId));
  if (!raw) return null;

  try {
    const envelope = JSON.parse(raw) as StoredEnvelope;
    if (envelope?.schemaVersion !== PROFILE_SCHEMA_VERSION) return null;

    const p = envelope.profile;
    if (
      !p?.visitorId ||
      !p.affinities?.team?.posterior ||
      !p.affinities?.department?.posterior ||
      !p.traits?.gender?.posterior ||
      !p.persona?.label ||
      !p.state ||
      typeof p.observedEvents !== 'number'
    ) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function saveProfile(profile: VisitorProfile): void {
  const envelope: StoredEnvelope = { schemaVersion: PROFILE_SCHEMA_VERSION, profile };
  writeStorage(storageKey(profile.visitorId), JSON.stringify(envelope));
}

/** Drops one visitor's cached profile. The next mount refolds from the events. */
export function clearProfile(visitorId: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(storageKey(visitorId));
  } catch {
    /* nothing to clear */
  }
}

/** Drops every cached profile, current schema or not. Used by the demo reset. */
export function clearAllProfiles(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* nothing to clear */
  }
}

export function visitorIdFor(scenario: Scenario): string {
  return `visitor-${scenario.id}`;
}

export interface ProfileStore {
  profile: VisitorProfile;
  /** Intent read from the profile rather than replayed from the event stream. */
  intent: IntentResult;
  /** Deltas from the most recent fold, newest batch only. */
  lastDeltas: ProfileDelta[];
  /** Every delta since the profile was created, newest first, capped. */
  deltaLog: ProfileDelta[];
  /** Folds one event in and persists the result. */
  recordEvent: (event: UserEvent) => void;
  /** Discards the stored profile and refolds from the scenario's history. */
  reset: () => void;
}

/** How much delta history the panel can usefully scroll. */
const DELTA_LOG_CAP = 200;

/**
 * The React-facing store.
 *
 * A scenario switch rebuilds from that scenario's own history rather than
 * carrying the previous shopper's evidence across - each demo persona is a
 * different person, and blending them would make the panel a liar.
 *
 * The stored profile is preferred over a fresh fold when one exists, because the
 * whole claim being demonstrated is that a profile persists across sessions. A
 * reload that silently rebuilt from scratch would look identical on screen and
 * prove nothing.
 */
export function useProfileStore(
  scenario: Scenario,
  seedEvents: UserEvent[],
  activeTeamOverride?: TeamId | null
): ProfileStore {
  const visitorId = visitorIdFor(scenario);

  // The seed fold is deliberately not a dependency of anything below. It runs
  // once per visitor: afterwards the profile is the source of truth and the
  // events that built it are history.
  const seedRef = useRef(seedEvents);
  seedRef.current = seedEvents;

  const initialise = useCallback((): VisitorProfile => {
    const stored = loadProfile(visitorId);
    if (stored) return stored;
    const built = runProfileBuild(scenario, seedRef.current, { now: 0 }).profile;
    saveProfile(built);
    return built;
  }, [scenario, visitorId]);

  const [profile, setProfile] = useState<VisitorProfile>(initialise);
  const [lastDeltas, setLastDeltas] = useState<ProfileDelta[]>([]);
  const [deltaLog, setDeltaLog] = useState<ProfileDelta[]>([]);

  // The fold runs outside the state updater, against this mirror, rather than
  // inside `setProfile(current => ...)`. Under StrictMode React invokes an
  // updater twice to surface impurity, and a fold that also writes to
  // localStorage and appends to the delta log is not pure - doing it there would
  // double every entry in the panel. The mirror is written in the same tick as
  // the state, so it is never behind.
  const profileRef = useRef(profile);
  profileRef.current = profile;

  // Scenario switch. `useState`'s initialiser only ever runs on mount, so the
  // swap has to be explicit.
  const lastVisitorRef = useRef(visitorId);
  useEffect(() => {
    if (lastVisitorRef.current === visitorId) return;
    lastVisitorRef.current = visitorId;
    const fresh = initialise();
    profileRef.current = fresh;
    setProfile(fresh);
    setLastDeltas([]);
    setDeltaLog([]);
  }, [visitorId, initialise]);

  const recordEvent = useCallback((event: UserEvent) => {
    const current = profileRef.current;
    // The clock advances with the profile rather than with wall time: one event
    // is one tick, which is what makes a demo reproducible and what keeps this
    // path's decay identical to the harness's.
    const { profile: next, deltas } = runProfileUpdate(current, event, {
      now: current.observedEvents + 1,
      ticks: 1,
    });
    profileRef.current = next;
    saveProfile(next);
    setProfile(next);
    setLastDeltas(deltas);
    setDeltaLog((log) => [...deltas].reverse().concat(log).slice(0, DELTA_LOG_CAP));
  }, []);

  const reset = useCallback(() => {
    clearProfile(visitorId);
    const rebuilt = runProfileBuild(scenario, seedRef.current, { now: 0 }).profile;
    saveProfile(rebuilt);
    profileRef.current = rebuilt;
    setProfile(rebuilt);
    setLastDeltas([]);
    setDeltaLog([]);
  }, [scenario, visitorId]);

  const intent = useMemo(
    () => runIntentEngineFromProfile(profile, activeTeamOverride),
    [profile, activeTeamOverride]
  );

  return { profile, intent, lastDeltas, deltaLog, recordEvent, reset };
}
