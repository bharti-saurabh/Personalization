/**
 * Personas as points in a space, not as a list of buttons.
 *
 * THE ARGUMENT THIS MODULE MAKES
 * ------------------------------
 * The first question anyone asks a personalization demo is "why these
 * personas?", and the honest answer is that they are examples. Five hardcoded
 * buttons cannot say that: they look like the system's opinion about how many
 * kinds of shopper exist. So personas are defined here as coordinates in five
 * continuous dimensions, and the presets are named points in that space rather
 * than the space itself. An operator can move off every preset with the
 * sliders and watch the storefront follow, which is the demonstration.
 *
 * NOTHING BELOW IS A MODEL OUTPUT
 * -------------------------------
 * A persona is an INPUT. It decides what the simulated shopper did before the
 * demo opened - which clubs they browsed, how deep the history goes, whether
 * they filtered by price. The engine then reads that behaviour and derives its
 * own persona label, which may disagree with the preset that generated it.
 * That disagreement is a feature and it is visible in the rail: the preset name
 * sits under Director controls, the derived label sits under Visitor.
 *
 * IDENTITY STAGE IS NOT ONE OF THE DIMENSIONS
 * -------------------------------------------
 * It is deliberately orthogonal. The same die-hard loyalist is a different
 * problem at Anonymous than at Member - same beliefs wanted, different evidence
 * available to support them - and collapsing the two axes into one list of
 * personas would hide exactly that. The rail renders them as two axes for the
 * same reason.
 *
 * React-free and DOM-free, like src/ml and src/sim.
 */

import type { Department, League, Scenario, TeamId, UserEvent } from '../types';
import type { IdentityState } from '../ml/engine';
import { findAnchorProduct } from '../data/scenarios';
import { TEAM_BY_ID } from '../sim/taxonomy';

/* ---------------------------------------------------------- the dimensions -- */

export interface PersonaDimensions {
  /** 0 = one club and nothing else, 1 = follows several clubs across leagues. */
  fandomBreadth: number;
  /** 0 = pays list price without looking, 1 = shops the sale rail first. */
  priceSensitivity: number;
  /** 0 = buying for themselves, 1 = buying for someone else. */
  giftingPropensity: number;
  /** 0 = lapsed, has not been back in months, 1 = in-season and active weekly. */
  recency: number;
  /** 0 = apparel, 1 = memorabilia and collectibles. */
  categoryBias: number;
}

export interface DimensionMeta {
  id: keyof PersonaDimensions;
  label: string;
  /** What the left end of the slider means, then the right end. */
  low: string;
  high: string;
  /** What moves on the storefront when this slider moves. Engineering voice. */
  effect: string;
}

export const DIMENSIONS: DimensionMeta[] = [
  {
    id: 'fandomBreadth',
    label: 'Fandom breadth',
    low: 'Single club',
    high: 'Multi league',
    effect: 'How many clubs appear in the seeded history, so how concentrated the team posterior can get',
  },
  {
    id: 'priceSensitivity',
    label: 'Price sensitivity',
    low: 'Pays list',
    high: 'Shops sale',
    effect: 'Adds price filters to the seeded history and moves the price band slot',
  },
  {
    id: 'giftingPropensity',
    label: 'Gifting propensity',
    low: 'For self',
    high: 'For others',
    effect: 'Seeds kids and gifting browsing, which opens the gifting rail and suppresses the size prefill',
  },
  {
    id: 'recency',
    label: 'Recency',
    low: 'Lapsed',
    high: 'In season',
    effect: 'Sets how many events the fold has seen and how old they are, so it drives every confidence at once',
  },
  {
    id: 'categoryBias',
    label: 'Category bias',
    low: 'Apparel',
    high: 'Memorabilia',
    effect: 'Chooses which departments the seeded history visits, so it orders the category ladder',
  },
];

/* -------------------------------------------------------------- the presets -- */

export type PersonaGroup = 'Fandom driven' | 'Occasion driven' | 'Value driven' | 'Lifecycle';

export interface PersonaPreset {
  id: string;
  label: string;
  group: PersonaGroup;
  /** One line, retail voice, for the picker. */
  blurb: string;
  dimensions: PersonaDimensions;
  /** Clubs the seeded history walks, most important first. */
  teams: TeamId[];
  /** Named player to anchor the player slot, when the persona has one. */
  player?: string;
  /** Orders already on file. Zero means the profile has no durable evidence at all. */
  orders: number;
  /** Where this persona naturally starts on the identity ladder. Still overridable. */
  identity: IdentityState;
  device: 'mobile' | 'desktop';
  channel: Scenario['channel'];
}

const d = (
  fandomBreadth: number,
  priceSensitivity: number,
  giftingPropensity: number,
  recency: number,
  categoryBias: number
): PersonaDimensions => ({ fandomBreadth, priceSensitivity, giftingPropensity, recency, categoryBias });

export const PERSONA_PRESETS: PersonaPreset[] = [
  /* ------------------------------------------------------------ fandom -- */
  {
    id: 'die_hard',
    label: 'Die hard loyalist',
    group: 'Fandom driven',
    blurb: 'One club, every season, buys the new kit on release day',
    dimensions: d(0.05, 0.25, 0.1, 0.92, 0.35),
    teams: ['Eagles'],
    player: 'Jalen Hurts',
    orders: 6,
    identity: 'identified',
    device: 'mobile',
    channel: 'Direct',
  },
  {
    id: 'multi_club',
    label: 'Multi club fan',
    group: 'Fandom driven',
    blurb: 'Follows a city rather than a sport, three clubs across two leagues',
    dimensions: d(0.9, 0.35, 0.2, 0.75, 0.45),
    teams: ['Eagles', '76ers', 'Phillies'],
    orders: 4,
    identity: 'returning',
    device: 'desktop',
    channel: 'Direct',
  },
  {
    id: 'player_first',
    label: 'Player first fan',
    group: 'Fandom driven',
    blurb: 'Follows the player, and the club only for as long as the player is there',
    dimensions: d(0.45, 0.3, 0.15, 0.85, 0.3),
    teams: ['Chiefs', 'Eagles'],
    player: 'Patrick Mahomes',
    orders: 3,
    identity: 'identified',
    device: 'mobile',
    channel: 'Paid Social',
  },
  {
    id: 'bandwagoner',
    label: 'Bandwagoner',
    group: 'Fandom driven',
    blurb: 'Arrived with the winning streak, no history behind the enthusiasm',
    dimensions: d(0.3, 0.6, 0.15, 0.95, 0.2),
    teams: ['Chiefs'],
    orders: 0,
    identity: 'contextual',
    device: 'mobile',
    channel: 'Paid Social',
  },
  {
    id: 'casual_apparel',
    label: 'Casual apparel buyer',
    group: 'Fandom driven',
    blurb: 'Wears the hoodie, could not name the back four',
    dimensions: d(0.55, 0.5, 0.25, 0.4, 0.1),
    teams: ['Lakers', 'Eagles'],
    orders: 1,
    identity: 'returning',
    device: 'desktop',
    channel: 'Search',
  },
  {
    id: 'fantasy',
    label: 'Fantasy driven fan',
    group: 'Fandom driven',
    blurb: 'Buys around a roster rather than a club, changes weekly',
    dimensions: d(0.85, 0.4, 0.1, 0.9, 0.25),
    teams: ['Chiefs', 'Cowboys', 'Eagles'],
    player: 'Patrick Mahomes',
    orders: 2,
    identity: 'identified',
    device: 'desktop',
    channel: 'Direct',
  },

  /* ---------------------------------------------------------- occasion -- */
  {
    id: 'gameday',
    label: 'Gameday shopper',
    group: 'Occasion driven',
    blurb: 'Buying today because there is a fixture today',
    dimensions: d(0.15, 0.3, 0.2, 1.0, 0.2),
    teams: ['Eagles'],
    orders: 2,
    identity: 'contextual',
    device: 'mobile',
    channel: 'Direct',
  },
  {
    id: 'gift_buyer',
    label: 'Gift buyer',
    group: 'Occasion driven',
    blurb: 'Shopping for someone whose size they are guessing at',
    dimensions: d(0.4, 0.45, 0.95, 0.55, 0.5),
    teams: ['Cowboys', 'Eagles'],
    orders: 1,
    identity: 'identified',
    device: 'desktop',
    channel: 'Search',
  },
  {
    id: 'parent_kids',
    label: 'Parent outfitting kids',
    group: 'Occasion driven',
    blurb: 'Two children, two sizes, one club',
    dimensions: d(0.2, 0.65, 0.8, 0.7, 0.15),
    teams: ['Eagles'],
    orders: 3,
    identity: 'member',
    device: 'mobile',
    channel: 'Email',
  },
  {
    id: 'travelling',
    label: 'Travelling fan',
    group: 'Occasion driven',
    blurb: 'Away end, buying near the ground, delivery window matters',
    dimensions: d(0.35, 0.35, 0.3, 0.95, 0.3),
    teams: ['76ers', 'Lakers'],
    orders: 2,
    identity: 'returning',
    device: 'mobile',
    channel: 'Search',
  },
  {
    id: 'corporate',
    label: 'Corporate bulk buyer',
    group: 'Occasion driven',
    blurb: 'Twelve of the same thing, needs a size run and an invoice',
    dimensions: d(0.25, 0.55, 0.85, 0.45, 0.4),
    teams: ['Phillies'],
    orders: 2,
    identity: 'identified',
    device: 'desktop',
    channel: 'Direct',
  },

  /* ------------------------------------------------------------- value -- */
  {
    id: 'deal_seeker',
    label: 'Deal seeker',
    group: 'Value driven',
    blurb: 'Enters through the sale rail and never leaves it',
    dimensions: d(0.5, 0.95, 0.2, 0.7, 0.2),
    teams: ['Eagles', 'Cowboys'],
    orders: 2,
    identity: 'returning',
    device: 'desktop',
    channel: 'Email',
  },
  {
    id: 'collector',
    label: 'Collector',
    group: 'Value driven',
    blurb: 'Signed, numbered, framed. Price is the least interesting attribute',
    dimensions: d(0.3, 0.05, 0.1, 0.6, 0.95),
    teams: ['Phillies', 'Eagles'],
    orders: 5,
    identity: 'member',
    device: 'desktop',
    channel: 'Direct',
  },

  /* --------------------------------------------------------- lifecycle -- */
  {
    id: 'first_touch',
    label: 'Anonymous first touch',
    group: 'Lifecycle',
    blurb: 'No history, no cookie, nothing but the request headers',
    dimensions: d(0.5, 0.5, 0.5, 0.5, 0.5),
    teams: ['Eagles'],
    orders: 0,
    identity: 'anonymous',
    device: 'desktop',
    channel: 'Search',
  },
  {
    id: 'high_value_returning',
    label: 'High value returning',
    group: 'Lifecycle',
    blurb: 'Six orders deep, opens every email, buys twice a season',
    dimensions: d(0.35, 0.2, 0.35, 0.88, 0.55),
    teams: ['Eagles', '76ers'],
    player: 'Jalen Hurts',
    orders: 8,
    identity: 'member',
    device: 'mobile',
    channel: 'Email',
  },
  {
    id: 'lapsed',
    label: 'Lapsed reactivation',
    group: 'Lifecycle',
    blurb: 'Bought once, two seasons ago, and has not been back since',
    dimensions: d(0.4, 0.7, 0.3, 0.08, 0.3),
    teams: ['Cowboys'],
    orders: 1,
    identity: 'returning',
    device: 'desktop',
    channel: 'Email',
  },
];

export const PERSONA_GROUPS: PersonaGroup[] = [
  'Fandom driven',
  'Occasion driven',
  'Value driven',
  'Lifecycle',
];

export const PRESET_BY_ID: Record<string, PersonaPreset> = Object.fromEntries(
  PERSONA_PRESETS.map((p) => [p.id, p])
);

export const DEFAULT_PRESET = PERSONA_PRESETS[0];

/**
 * Whether the dimensions still sit on the preset they came from.
 *
 * Used to decide whether the rail shows a preset name or "custom". The
 * tolerance is a slider step, so nudging a slider and nudging it back does not
 * leave the label stuck on custom.
 */
export function matchesPreset(dims: PersonaDimensions, preset: PersonaPreset): boolean {
  return (Object.keys(preset.dimensions) as (keyof PersonaDimensions)[]).every(
    (k) => Math.abs(dims[k] - preset.dimensions[k]) < 0.026
  );
}

/* ------------------------------------------------- synthesising a history -- */

const APPAREL: Department[] = ['Jerseys', 'T-shirts', 'Hoodies', 'Hats'];
const MEMORABILIA: Department[] = ['Collectibles', 'Home & Office', 'Accessories'];

/** Human-readable age for the nth-most-recent event, given how active the shopper is. */
function stamp(index: number, recency: number): string {
  // An in-season shopper's last five events span an afternoon; a lapsed one's
  // span months. Same event list, different implied session.
  if (recency > 0.75) return index === 0 ? 'Just now' : `${index * 3 + 2} mins ago`;
  if (recency > 0.4) return index === 0 ? '2 mins ago' : `${index * 9 + 6} mins ago`;
  return index === 0 ? '1 min ago' : `${index * 4 + 3} days ago`;
}

function attach(event: UserEvent, team: TeamId, department?: Department, player?: string): UserEvent {
  const product = findAnchorProduct({ team, department, player });
  if (!product) return event;
  return { ...event, productId: product.id, productName: product.name };
}

/**
 * Builds the seeded browsing history a persona implies.
 *
 * Every branch below is driven by a dimension rather than by the preset id, so
 * moving a slider produces a genuinely different history rather than switching
 * between authored ones. Output is newest-first, which is the order the fold
 * and the intent engine both expect.
 */
export function eventsForPersona(preset: PersonaPreset, dims: PersonaDimensions): UserEvent[] {
  const teams = preset.teams.length ? preset.teams : (['Eagles'] as TeamId[]);
  // Breadth decides how much of the persona's club list actually gets walked.
  const teamCount = Math.max(1, Math.min(teams.length, 1 + Math.round(dims.fandomBreadth * (teams.length - 1))));
  const walked = teams.slice(0, teamCount);

  const departments = dims.categoryBias > 0.5 ? MEMORABILIA : APPAREL;
  const depth = 2 + Math.round(dims.recency * 4);

  const out: UserEvent[] = [];
  let n = 0;
  const push = (e: Omit<UserEvent, 'id' | 'timestamp'>) => {
    out.push({ ...e, id: `p-${preset.id}-${n}`, timestamp: stamp(n, dims.recency) } as UserEvent);
    n++;
  };

  push({ pageType: 'Home', action: `Landed on homepage from ${preset.channel.toLowerCase()}` });

  for (let i = 0; i < depth; i++) {
    const team = walked[i % walked.length];
    const league = TEAM_BY_ID[team]?.league as League;
    const department = departments[i % departments.length];

    push({
      pageType: 'PLP',
      league,
      team,
      department,
      action: `Browsed ${team} ${department.toLowerCase()}`,
    });

    // Only the front half of the walk gets a product open. A shopper who opens
    // everything they see is not browsing, and the PDP weight in the fold is
    // high enough that over-seeding it would flatten every persona into the
    // same profile.
    if (i < Math.ceil(depth / 2)) {
      push(
        attach(
          {
            id: '',
            timestamp: '',
            pageType: 'PDP',
            league,
            team,
            department,
            action: `Viewed a ${team} ${department.toLowerCase().replace(/s$/, '')}`,
          },
          team,
          department,
          i === 0 ? preset.player : undefined
        )
      );
    }
  }

  if (dims.priceSensitivity > 0.6) {
    push({
      pageType: 'Filter',
      team: walked[0],
      filterApplied: 'Sale items only',
      action: 'Filtered to sale items',
    });
  }

  if (dims.giftingPropensity > 0.55) {
    push({
      pageType: 'PLP',
      team: walked[0],
      department: 'Kids',
      filterApplied: 'Gift guide',
      action: 'Opened the gift guide',
    });
  }

  if (preset.player && dims.fandomBreadth < 0.6) {
    push({
      pageType: 'Filter',
      team: walked[0],
      filterApplied: `Player: ${preset.player}`,
      action: `Filtered by player ${preset.player}`,
    });
  }

  // Authored oldest-first above because that is how a journey reads. The
  // runtime order is newest-first everywhere else, so reverse on the way out.
  return out.reverse();
}

/**
 * The full scenario a persona stands for.
 *
 * `confidenceScore` is derived rather than authored: concentration times
 * evidence depth. A persona cannot declare itself confident, it can only
 * arrange for the engine to be.
 */
export function scenarioForPersona(preset: PersonaPreset, dims: PersonaDimensions): Scenario {
  const events = eventsForPersona(preset, dims);
  const concentration = 1 - dims.fandomBreadth;
  const depth = Math.min(1, events.length / 9);
  const confidenceScore = Math.max(0.12, Math.min(0.95, 0.25 + 0.45 * concentration + 0.35 * depth * dims.recency));

  const propensity: Scenario['conversionPropensity'] =
    confidenceScore > 0.7 ? 'High' : confidenceScore > 0.42 ? 'Medium' : 'Low';

  return {
    // Scenario ids are a closed union in types.ts and persona ids are not, so
    // the cast is deliberate: the persona id is the identity that matters now,
    // and nothing downstream switches on the old five names any more.
    id: preset.id as Scenario['id'],
    name: preset.label,
    subtitle: preset.blurb,
    profileType: preset.identity === 'anonymous' || preset.identity === 'contextual' ? 'Anonymous' : 'Recognized',
    primaryInterest: preset.teams[0] ?? 'Eagles',
    secondaryInterest: preset.teams[1],
    device: preset.device,
    channel: preset.channel,
    conversionPropensity: propensity,
    confidenceScore,
    description: preset.blurb,
    recentEvents: events,
    historicalOrdersCount: Math.round(preset.orders * (0.35 + 0.65 * dims.recency)),
    favTeams: preset.teams,
  };
}
