/**
 * The simulated calendar, and the things that happen on it.
 *
 * WHY THIS MODULE EXISTS AT ALL
 *
 * Until now the world had one timestamp - `SIM_MONTH = 8`, a frozen constant in
 * taxonomy.ts - and three modules read it independently to ask the same
 * question: how in-season is this league right now. That is fine while the
 * answer never changes. The moment anything can move the world forward, or fire
 * an event into it, a constant read from three places is three places that can
 * disagree.
 *
 * So time stops being a constant and becomes a value: `SimClock`. Every
 * function that used to read the module-level month now takes a clock as its
 * last parameter, defaulted to the active one so no existing call site has to
 * change and no existing number moves.
 *
 * WHAT A CLOCK IS
 *
 * A month, a year, and the log of market events that have fired. The event log
 * is part of the clock rather than a separate registry because a market event
 * is a fact about a moment: a trade that cleared in September is not the same
 * input as the same trade clearing in February, and pairing the event with the
 * date it fired is what lets the lift decay honestly.
 *
 * WHAT MAKES IT LEAK-PROOF
 *
 * A clock is a plain immutable value. `withEvent` returns a new clock rather
 * than pushing onto the old one, `LEAGUE_SEASONALITY` is frozen at both levels,
 * and `rosterAt` folds the log into a fresh roster table on every call rather
 * than mutating `TEAMS`. There is a module-level `activeClock()` because the
 * React tree needs a single answer to "what time is it", but nothing in the
 * simulation path reads it except as a parameter default - which means an
 * arm that passes its own clock cannot be reached by anything another arm
 * fires. `clock.test.ts` is the runnable version of that claim.
 *
 * No React, no DOM. The evaluation harness runs this under tsx.
 */

import { Department, League, MarketEventKind, TeamId } from '../types';
import { TEAMS, TEAM_BY_ID } from './taxonomy';

/* --------------------------------------------------------------- calendar -- */

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * Seasonality by league, indexed by month (0 = January). Drives which teams a
 * simulated shopper is likely to browse, so the co-occurrence graphs carry a
 * realistic sports-calendar signature rather than uniform noise.
 *
 * Moved here from taxonomy.ts, which is the register of what the world is made
 * of rather than what time it is. Frozen at both levels: an arm that reached in
 * and wrote `LEAGUE_SEASONALITY.NFL[8] = 0` would silently change every other
 * arm's world, and a runtime freeze turns that from a mystery into a throw.
 */
export const LEAGUE_SEASONALITY: Readonly<Record<League, readonly number[]>> = Object.freeze({
  //              J    F    M    A     M    J    J     A    S    O     N     D
  NFL: Object.freeze([0.75, 0.5, 0.3, 0.3, 0.35, 0.3, 0.45, 0.7, 1.0, 1.0, 0.95, 0.9]),
  NBA: Object.freeze([0.85, 0.8, 0.8, 0.9, 0.85, 0.6, 0.35, 0.3, 0.4, 0.8, 0.85, 0.85]),
  MLB: Object.freeze([0.3, 0.4, 0.65, 0.9, 0.85, 0.85, 0.85, 0.8, 0.9, 0.8, 0.4, 0.35]),
});

/**
 * Month the simulated "today" falls in, unless a clock says otherwise.
 *
 * Kept as a named export because it is the number every published metric in
 * this repo was measured at. Anything comparing against those tables has to be
 * able to state which month it ran under, and a literal 8 buried in a default
 * argument cannot be cited.
 */
export const SIM_MONTH = 8; // September - NFL season opening
export const SIM_YEAR = 2025;

/**
 * Where a league is in its own year.
 *
 * Derived from the seasonality curve rather than declared separately, so the
 * phase and the demand multiplier can never tell different stories. The bands
 * are the obvious ones: a league at its own peak is in the postseason run-in,
 * a league at its own floor is dark.
 */
export type SeasonPhase = 'offseason' | 'preseason' | 'regular' | 'peak';

export interface SimClock {
  /** 0 = January. */
  month: number;
  /** Calendar year. Affects nothing but the label and the age of events. */
  year: number;
  /**
   * Market events that have fired, oldest first.
   *
   * Order is load-bearing: two trades of the same player have to be applied in
   * the order they cleared or the player ends up on the wrong club.
   */
  events: readonly MarketEvent[];
}

/** The world as every published number in this repo was measured. */
export const DEFAULT_CLOCK: SimClock = Object.freeze({
  month: SIM_MONTH,
  year: SIM_YEAR,
  events: Object.freeze([]) as readonly MarketEvent[],
});

export function clockLabel(clock: SimClock): string {
  return `${MONTH_NAMES[clock.month]} ${clock.year}`;
}

/** Absolute month index, so two clocks can be subtracted. */
function absMonth(month: number, year: number): number {
  return year * 12 + month;
}

export function monthsBetween(from: { month: number; year: number }, to: SimClock): number {
  return absMonth(to.month, to.year) - absMonth(from.month, from.year);
}

/** How in-season a league is at this clock, in [0, 1]. */
export function seasonality(league: League, clock: SimClock = activeClock()): number {
  const curve = LEAGUE_SEASONALITY[league];
  return curve[((clock.month % 12) + 12) % 12];
}

export function phaseOf(league: League, clock: SimClock = activeClock()): SeasonPhase {
  const curve = LEAGUE_SEASONALITY[league];
  const now = seasonality(league, clock);
  const lo = Math.min(...curve);
  const hi = Math.max(...curve);
  const t = hi === lo ? 0.5 : (now - lo) / (hi - lo);
  if (t < 0.15) return 'offseason';
  if (t < 0.45) return 'preseason';
  if (t < 0.85) return 'regular';
  return 'peak';
}

/* ---------------------------------------------------------- market events -- */

export interface MarketEventBase {
  id: string;
  kind: MarketEventKind;
  /** When it fired. The lift decays from here, not from the clock's origin. */
  at: { month: number; year: number };
}

export type MarketEvent =
  | (MarketEventBase & {
      kind: 'TRADE';
      player: string;
      fromTeam: TeamId;
      toTeam: TeamId;
      /** Squad number at the new club. Trades rarely preserve one. */
      newNumber: string;
    })
  | (MarketEventBase & { kind: 'INJURY'; player: string; team: TeamId; weeksOut: number })
  | (MarketEventBase & { kind: 'PLAYOFF_WIN'; team: TeamId; round: string })
  | (MarketEventBase & { kind: 'CHAMPIONSHIP'; team: TeamId; title: string })
  | (MarketEventBase & { kind: 'NEW_SIGNING'; player: string; team: TeamId; number: string; draw: number })
  | (MarketEventBase & { kind: 'RETIREMENT'; player: string; team: TeamId })
  | (MarketEventBase & { kind: 'KIT_LAUNCH'; team: TeamId; kitName: string });

/**
 * What an event does, declared as data rather than as branching code.
 *
 * Every kind fills in the same five fields, which is what makes the seven of
 * them comparable and what makes adding an eighth a table entry rather than a
 * new code path through the catalog. The two consumers - the catalog rewrite in
 * catalog.ts and the population demand in behavior.ts - each read the fields
 * they care about and ignore the rest.
 */
export interface MarketEffect {
  /**
   * Multiplier on the intrinsic popularity of products attributed to the named
   * player, before decay. 1 means the event says nothing about that player.
   */
  playerLift: number;
  /** Multiplier on demand for the affected club across the whole population. */
  teamLift: number;
  /** Multiplier on the club the demand came FROM, where one exists. */
  sourceTeamLift: number;
  /** Departments this event pushes shoppers toward, before decay. */
  deptLift: Partial<Record<Department, number>>;
  /**
   * Months over which the lift halves back toward 1.
   *
   * These are the numbers a merchandising planner would argue with, and they
   * should: an injury is a fact for as long as the player is out, a
   * championship is a fact for a season, and a kit launch is a fact until the
   * next kit. They are stated so they can be argued with.
   */
  halfLifeMonths: number;
}

const NEUTRAL: MarketEffect = {
  playerLift: 1,
  teamLift: 1,
  sourceTeamLift: 1,
  deptLift: {},
  halfLifeMonths: 3,
};

/** The effect table, before any decay. */
export function baseEffect(event: MarketEvent): MarketEffect {
  switch (event.kind) {
    case 'TRADE':
      // The player is the story, so the player term is the largest. The new club
      // gains less than the player does because most of the lift is one name,
      // and the old club loses only a little: a fanbase does not stop existing.
      return { ...NEUTRAL, playerLift: 2.4, teamLift: 1.3, sourceTeamLift: 0.9, deptLift: { Jerseys: 1.55, 'T-shirts': 1.15 }, halfLifeMonths: 2 };
    case 'INJURY':
      // Below 1 in both terms. A flagged product is not always a hot product.
      return { ...NEUTRAL, playerLift: 0.5, teamLift: 0.93, deptLift: {}, halfLifeMonths: Math.max(1, event.weeksOut / 4.3) };
    case 'PLAYOFF_WIN':
      return { ...NEUTRAL, teamLift: 1.4, deptLift: { Hats: 1.5, 'T-shirts': 1.35, Jerseys: 1.15 }, halfLifeMonths: 1.5 };
    case 'CHAMPIONSHIP':
      return { ...NEUTRAL, teamLift: 1.95, deptLift: { Hats: 1.8, 'T-shirts': 1.6, Collectibles: 1.5, Jerseys: 1.25 }, halfLifeMonths: 6 };
    case 'NEW_SIGNING':
      // Draw is a property of the signing, so it scales the player term rather
      // than the table carrying one number for every possible name.
      return { ...NEUTRAL, playerLift: 1 + 1.6 * event.draw, teamLift: 1.2, deptLift: { Jerseys: 1.4 }, halfLifeMonths: 3 };
    case 'RETIREMENT':
      // Farewell demand is real and short. The club does not move.
      return { ...NEUTRAL, playerLift: 1.7, teamLift: 1.05, deptLift: { Collectibles: 1.6, Jerseys: 1.2 }, halfLifeMonths: 2 };
    case 'KIT_LAUNCH':
      return { ...NEUTRAL, teamLift: 1.25, deptLift: { Jerseys: 1.6 }, halfLifeMonths: 4 };
  }
}

/** Pulls a multiplier back toward 1 as the event ages. */
function decay(lift: number, halfLifeMonths: number, monthsSince: number): number {
  if (monthsSince <= 0) return lift;
  const remaining = Math.pow(0.5, monthsSince / Math.max(0.25, halfLifeMonths));
  return 1 + (lift - 1) * remaining;
}

/** The effect as it stands at `clock`, with age applied to every multiplier. */
export function effectAt(event: MarketEvent, clock: SimClock = activeClock()): MarketEffect {
  const base = baseEffect(event);
  const months = Math.max(0, monthsBetween(event.at, clock));
  const deptLift: Partial<Record<Department, number>> = {};
  for (const [dept, lift] of Object.entries(base.deptLift)) {
    deptLift[dept as Department] = decay(lift, base.halfLifeMonths, months);
  }
  return {
    playerLift: decay(base.playerLift, base.halfLifeMonths, months),
    teamLift: decay(base.teamLift, base.halfLifeMonths, months),
    sourceTeamLift: decay(base.sourceTeamLift, base.halfLifeMonths, months),
    deptLift,
    halfLifeMonths: base.halfLifeMonths,
  };
}

/** Which club an event is about, and which club it took demand from. */
export function eventTeams(event: MarketEvent): { team: TeamId; from: TeamId | null } {
  if (event.kind === 'TRADE') return { team: event.toTeam, from: event.fromTeam };
  return { team: event.team, from: null };
}

/** The player an event names, when it names one. */
export function eventPlayer(event: MarketEvent): string | null {
  return 'player' in event ? event.player : null;
}

/* -------------------------------------------------------------- narration -- */

export interface EventNarration {
  /** One line, as a merchandising desk would write it. */
  headline: string;
  /** What it is expected to do to demand, in a sentence. */
  detail: string;
}

export function describeEvent(event: MarketEvent): EventNarration {
  const club = (id: TeamId) => TEAM_BY_ID[id].fullName;
  switch (event.kind) {
    case 'TRADE':
      return {
        headline: `${event.player} traded to the ${TEAM_BY_ID[event.toTeam].city} ${event.toTeam}`,
        detail: `Jersey demand transfers with the player. ${club(event.toTeam)} gains the name; ${club(event.fromTeam)} keeps the fanbase but loses the marquee item.`,
      };
    case 'INJURY':
      return {
        headline: `${event.player} out ${event.weeksOut} weeks`,
        detail: `Demand for that name falls sharply and does not transfer anywhere. The club softens; the roster around him does not compensate.`,
      };
    case 'PLAYOFF_WIN':
      return {
        headline: `${event.team} win the ${event.round}`,
        detail: `A short, steep lift concentrated in commemorative categories - hats and tees move first, jerseys follow.`,
      };
    case 'CHAMPIONSHIP':
      return {
        headline: `${event.team} win the ${event.title}`,
        detail: `The largest and longest-lived event in the table. Every category lifts; headwear and collectibles lift most.`,
      };
    case 'NEW_SIGNING':
      return {
        headline: `${club(event.team)} sign ${event.player} (#${event.number})`,
        detail: `A new name with no catalog history behind it - this is the cold-start case, and the jersey has to be merchandised before anything has co-ordered with it.`,
      };
    case 'RETIREMENT':
      return {
        headline: `${event.player} retires`,
        detail: `Farewell demand: a sharp lift in collectibles and legacy jerseys that decays within a season and does not return.`,
      };
    case 'KIT_LAUNCH':
      return {
        headline: `${club(event.team)} launch the ${event.kitName}`,
        detail: `A supply-side event rather than a demand-side one. New jerseys enter with no co-order history, which is what the complement engine has to route around.`,
      };
  }
}

/* ----------------------------------------------------------------- roster -- */

export interface RosterEntry {
  name: string;
  number: string;
  popularity: number;
}

export type RosterTable = Record<TeamId, RosterEntry[]>;

/**
 * Who plays where, at this clock.
 *
 * Folds the event log over the frozen taxonomy roster and returns a fresh table
 * every call. `TEAMS` is never written to - a trade that mutated it would move
 * the player for every clock in the process, including the ones belonging to
 * other arms and the one the published metrics were measured under.
 *
 * Note what this is NOT used for: catalog generation still runs off the frozen
 * roster. That is deliberate and is explained where the market pass applies
 * itself in catalog.ts - product ids have to survive an event, because the
 * shopper may have one of those products in their cart when it fires.
 */
export function rosterAt(clock: SimClock = activeClock()): RosterTable {
  const table = {} as RosterTable;
  for (const team of TEAMS) table[team.id] = team.players.map((p) => ({ ...p }));

  for (const event of clock.events) {
    switch (event.kind) {
      case 'TRADE': {
        const idx = table[event.fromTeam].findIndex((p) => p.name === event.player);
        if (idx === -1) break;
        const [moved] = table[event.fromTeam].splice(idx, 1);
        table[event.toTeam] = [...table[event.toTeam], { ...moved, number: event.newNumber }];
        break;
      }
      case 'RETIREMENT': {
        table[event.team] = table[event.team].filter((p) => p.name !== event.player);
        break;
      }
      case 'NEW_SIGNING': {
        if (table[event.team].some((p) => p.name === event.player)) break;
        table[event.team] = [
          ...table[event.team],
          { name: event.player, number: event.number, popularity: event.draw },
        ];
        break;
      }
      case 'INJURY': {
        table[event.team] = table[event.team].map((p) =>
          p.name === event.player ? { ...p, popularity: p.popularity * 0.5 } : p
        );
        break;
      }
      default:
        break;
    }
  }
  return table;
}

/** Which club a name plays for at this clock, or null if nobody does. */
export function teamOfPlayer(player: string, clock: SimClock = activeClock()): TeamId | null {
  const table = rosterAt(clock);
  for (const team of TEAMS) {
    if (table[team.id].some((p) => p.name === player)) return team.id;
  }
  return null;
}

/* ---------------------------------------------------------------- demand -- */

/**
 * Population-level demand multiplier for a club at this clock.
 *
 * This is the population half of "each event has defined effects on catalog and
 * population". The catalog half rewrites products; this one changes how likely a
 * simulated shopper is to arrive with that club front of mind, which is what
 * makes the co-order graph move rather than just the popularity column.
 *
 * Composes multiplicatively across events, which is the right shape: a club that
 * wins a title and signs a star in the same month should compound, not average.
 */
export function teamDemand(team: TeamId, clock: SimClock = activeClock()): number {
  let m = 1;
  for (const event of clock.events) {
    const effect = effectAt(event, clock);
    const { team: to, from } = eventTeams(event);
    if (to === team) m *= effect.teamLift;
    if (from === team) m *= effect.sourceTeamLift;
  }
  return m;
}

/** Same, for a department. Events push shoppers toward categories, not only clubs. */
export function departmentDemand(dept: Department, clock: SimClock = activeClock()): number {
  let m = 1;
  for (const event of clock.events) {
    const lift = effectAt(event, clock).deptLift[dept];
    if (lift !== undefined) m *= lift;
  }
  return m;
}

/* ------------------------------------------------------------ transitions -- */

/** A new clock with one more event on it. The old clock is untouched. */
export function withEvent(clock: SimClock, event: MarketEvent): SimClock {
  return Object.freeze({
    month: clock.month,
    year: clock.year,
    events: Object.freeze([...clock.events, event]),
  });
}

/** A new clock `n` months later, carrying the same log. Lifts decay by themselves. */
export function advanceMonths(clock: SimClock, n: number): SimClock {
  const abs = absMonth(clock.month, clock.year) + n;
  return Object.freeze({
    month: ((abs % 12) + 12) % 12,
    year: Math.floor(abs / 12),
    events: clock.events,
  });
}

/**
 * The clock the application is standing on.
 *
 * Module-level state, and the only piece of it in this file. It exists because
 * the React tree needs one answer to "what time is it" that every surface
 * agrees on, and threading a clock through every component would be a prop
 * drill with no benefit.
 *
 * The discipline that keeps it from becoming a leak: every simulation function
 * takes the clock as a defaulted parameter, and anything running more than one
 * world at once passes its own explicitly. `activeClock()` is then a default,
 * not a dependency, and two arms with two clocks share nothing. Enforced by
 * `clock.test.ts`, not by convention.
 */
let active: SimClock = DEFAULT_CLOCK;

export function activeClock(): SimClock {
  return active;
}

export function setActiveClock(clock: SimClock): void {
  active = Object.freeze({ ...clock, events: Object.freeze([...clock.events]) });
}

/** Back to the world every published metric was measured under. */
export function resetClock(): void {
  active = DEFAULT_CLOCK;
}

/* ------------------------------------------------------------- demo deck -- */

/**
 * The events the demo can fire, one keystroke each.
 *
 * Hand-written rather than generated because each one has to be a story a room
 * recognises, and because the trade in particular has to move a player the
 * shopper is already looking at - the opening product is a Jalen Hurts jersey,
 * and an event the audience cannot see land is not a demonstration.
 *
 * `at` is filled in when the event fires, from whatever clock is current.
 */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
/**
 * A deck entry: everything but the identity and the timestamp, which are
 * assigned at the moment of firing. `Omit` has to distribute over the union or
 * it collapses to the fields the seven kinds have in common, which is exactly
 * the fields being removed.
 */
export type MarketEventTemplate = DistributiveOmit<MarketEvent, 'id' | 'at'>;

export const EVENT_DECK: MarketEventTemplate[] = [
  { kind: 'TRADE', player: 'Jalen Hurts', fromTeam: 'Eagles', toTeam: 'Cowboys', newNumber: '4' },
  { kind: 'INJURY', player: 'Patrick Mahomes', team: 'Chiefs', weeksOut: 8 },
  { kind: 'PLAYOFF_WIN', team: 'Eagles', round: 'NFC Championship' },
  { kind: 'CHAMPIONSHIP', team: '76ers', title: 'NBA Finals' },
  { kind: 'NEW_SIGNING', player: 'Marcus Vane', team: 'Lakers', number: '11', draw: 0.82 },
  { kind: 'RETIREMENT', player: 'Bryce Harper', team: 'Phillies' },
  { kind: 'KIT_LAUNCH', team: 'Chiefs', kitName: 'Midnight Alternate Kit' },
];

/** Stamps a template with an id and the clock it fired at. */
export function fireTemplate(template: MarketEventTemplate, clock: SimClock, seq: number): MarketEvent {
  return {
    ...template,
    id: `mkt-${seq}-${template.kind.toLowerCase()}`,
    at: { month: clock.month, year: clock.year },
  } as MarketEvent;
}
