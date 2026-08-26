/**
 * Demo personas.
 *
 * These five scenarios are the presentation narrative, deliberately hand-authored
 * rather than sampled - a demo needs the same five stories every time. What is
 * *not* hand-authored is any of the model output: each persona supplies only an
 * event sequence and a history, and the intent engine derives the team
 * distribution, the confidence and the fallback decision from those inputs.
 *
 * EVENT ORDERING
 * --------------
 * Events are authored oldest-first below because that is how a journey reads,
 * but the canonical runtime order is NEWEST FIRST - `AppContext.recordEvent`
 * prepends, `IntelligencePanel` slices from the head, and the intent engine's
 * recency decay treats index 0 as the latest event. `buildScenarios()` reverses
 * each list on the way out so all four agree.
 *
 * PRODUCT REFERENCES
 * ------------------
 * Products are resolved against the generated catalog by predicate (team,
 * department, player) rather than by hard-coded id, because catalog ids change
 * whenever the generator seed or assortment weights change.
 */

import { Department, Product, Scenario, TeamId, UserEvent } from '../types';
import { getDataset, getDatasetVersion } from '../sim/dataset';

/**
 * Finds the most popular catalog item matching a predicate. Used to anchor
 * scenario events to real generated products.
 */
export function findAnchorProduct(criteria: {
  team: TeamId;
  department?: Department;
  player?: string;
}): Product | undefined {
  const { products } = getDataset();
  const matches = products.filter(
    (p) =>
      p.team === criteria.team &&
      (!criteria.department || p.department === criteria.department) &&
      (!criteria.player || p.player === criteria.player)
  );
  if (matches.length === 0) return undefined;
  return matches.reduce((best, p) => (p.popularity > best.popularity ? p : best));
}

/** Attaches a resolved product to an event, if one can be found. */
function withProduct(event: UserEvent, criteria: Parameters<typeof findAnchorProduct>[0]): UserEvent {
  const product = findAnchorProduct(criteria);
  if (!product) return event;
  return { ...event, productId: product.id, productName: product.name };
}

type AuthoredScenario = Omit<Scenario, 'recentEvents'> & { recentEvents: UserEvent[] };

function authorScenarios(): AuthoredScenario[] {
  return [
    {
      id: 'returning_eagles',
      name: 'Scenario 1: Returning Eagles Fan',
      subtitle: 'Recognized Customer • High Intent • Primary Eagles / Secondary 76ers',
      profileType: 'Recognized',
      primaryInterest: 'Philadelphia Eagles',
      secondaryInterest: 'Philadelphia 76ers',
      device: 'mobile',
      channel: 'Direct',
      conversionPropensity: 'High',
      confidenceScore: 0.88,
      description:
        'Recognized returning fan with repeated recent visits to Eagles jerseys and hats, plus a prior purchase of Eagles apparel.',
      historicalOrdersCount: 4,
      favTeams: ['Eagles', '76ers'],
      recentEvents: [
        {
          id: 'ev-101',
          timestamp: '10 mins ago',
          pageType: 'Home',
          action: 'Landed on homepage via direct mobile app',
        },
        {
          id: 'ev-102',
          timestamp: '8 mins ago',
          pageType: 'PLP',
          league: 'NFL',
          team: 'Eagles',
          department: 'Jerseys',
          filterApplied: 'Player: Jalen Hurts',
          action: 'Filtered listing by player Jalen Hurts and department Jerseys',
        },
        withProduct(
          {
            id: 'ev-103',
            timestamp: '5 mins ago',
            pageType: 'PDP',
            league: 'NFL',
            team: 'Eagles',
            department: 'Jerseys',
            action: 'Viewed product detail page for 45s, selected size L',
          },
          { team: 'Eagles', department: 'Jerseys', player: 'Jalen Hurts' }
        ),
        {
          id: 'ev-104',
          timestamp: '3 mins ago',
          pageType: 'PLP',
          league: 'NFL',
          team: 'Eagles',
          department: 'Hats',
          action: 'Browsed Eagles sideline fitted hats',
        },
        {
          id: 'ev-105',
          timestamp: '1 min ago',
          pageType: 'Home',
          action: 'Returned to homepage',
        },
      ],
    },
    {
      id: 'multi_team',
      name: 'Scenario 2: Multi-Team Sports Shopper',
      subtitle: 'Recognized Customer • Medium Confidence • Eagles, Phillies & 76ers',
      profileType: 'Recognized',
      primaryInterest: 'Philadelphia Eagles',
      secondaryInterest: 'Philadelphia Phillies & 76ers',
      device: 'desktop',
      channel: 'Search',
      conversionPropensity: 'Medium',
      confidenceScore: 0.64,
      description:
        'Buys across all three Philadelphia clubs, with interest that rotates by sports calendar. Genuine multi-team history keeps the distribution wider.',
      historicalOrdersCount: 3,
      favTeams: ['Eagles', 'Phillies', '76ers'],
      recentEvents: [
        {
          id: 'ev-201',
          timestamp: '15 mins ago',
          pageType: 'PLP',
          league: 'MLB',
          team: 'Phillies',
          department: 'T-shirts',
          action: 'Browsed Phillies graphic tees',
        },
        {
          id: 'ev-202',
          timestamp: '9 mins ago',
          pageType: 'PLP',
          league: 'NBA',
          team: '76ers',
          department: 'Hoodies',
          action: 'Browsed 76ers fleece',
        },
        {
          id: 'ev-203',
          timestamp: '4 mins ago',
          pageType: 'PLP',
          league: 'NFL',
          team: 'Eagles',
          department: 'Hats',
          action: 'Browsed Eagles sideline hats',
        },
      ],
    },
    {
      id: 'anonymous',
      name: 'Scenario 3: Anonymous First-Time Visitor',
      subtitle: 'Anonymous Guest • Cold Start • Paid Social Entry on PDP',
      profileType: 'Anonymous',
      primaryInterest: 'Current Product Context Only',
      device: 'mobile',
      channel: 'Paid Social',
      conversionPropensity: 'Medium',
      confidenceScore: 0.42,
      description:
        'No customer record. Entered directly onto a Jalen Hurts product page from a paid social campaign, so personalization has only product context and one in-session event to work with.',
      historicalOrdersCount: 0,
      favTeams: [],
      recentEvents: [
        withProduct(
          {
            id: 'ev-301',
            timestamp: 'Just now',
            pageType: 'PDP',
            league: 'NFL',
            team: 'Eagles',
            department: 'Jerseys',
            action: 'Landed on product detail page via paid social campaign link',
          },
          { team: 'Eagles', department: 'Jerseys', player: 'Jalen Hurts' }
        ),
      ],
    },
    {
      id: 'hot_market',
      name: 'Scenario 4: Hot-Market Event Shopper',
      subtitle: 'Recognized Customer • High Urgency • Championship Surge',
      profileType: 'Recognized',
      primaryInterest: 'Kansas City Chiefs',
      secondaryInterest: 'Championship Gear',
      device: 'desktop',
      channel: 'Direct',
      conversionPropensity: 'High',
      confidenceScore: 0.94,
      description:
        'Arrives shortly after a major championship result and moves fast through event merchandise. Dense, consistent, very recent signal.',
      historicalOrdersCount: 6,
      favTeams: ['Chiefs'],
      recentEvents: [
        {
          id: 'ev-401',
          timestamp: '3 mins ago',
          pageType: 'Home',
          action: 'Clicked championship banner',
        },
        {
          id: 'ev-402',
          timestamp: '2 mins ago',
          pageType: 'PLP',
          league: 'NFL',
          team: 'Chiefs',
          department: 'Hoodies',
          action: 'Browsed Chiefs locker room fleece',
        },
        withProduct(
          {
            id: 'ev-403',
            timestamp: '1 min ago',
            pageType: 'Cart',
            league: 'NFL',
            team: 'Chiefs',
            department: 'Hats',
            action: 'Added Chiefs locker room cap to cart',
          },
          { team: 'Chiefs', department: 'Hats' }
        ),
      ],
    },
    {
      id: 'low_confidence',
      name: 'Scenario 5: Low-Confidence Customer',
      subtitle: 'Recognized Customer • Below Threshold • Conflicting Browsing',
      profileType: 'Recognized',
      primaryInterest: 'Conflicting Signals (Eagles / Cowboys / Lakers)',
      device: 'mobile',
      channel: 'Email',
      conversionPropensity: 'Low',
      confidenceScore: 0.35,
      description:
        'Sparse browsing spread across three unrelated clubs with no recent purchase. The team distribution stays near-uniform, so confidence lands below the activation threshold and fallback rules take over.',
      historicalOrdersCount: 1,
      favTeams: ['Eagles', 'Cowboys'],
      recentEvents: [
        {
          id: 'ev-501',
          timestamp: '20 mins ago',
          pageType: 'PLP',
          league: 'NFL',
          team: 'Cowboys',
          department: 'Jerseys',
          action: 'Browsed Cowboys jerseys',
        },
        {
          id: 'ev-502',
          timestamp: '12 mins ago',
          pageType: 'PLP',
          league: 'NBA',
          team: 'Lakers',
          department: 'Hats',
          action: 'Browsed Lakers snapbacks',
        },
        {
          id: 'ev-503',
          timestamp: '5 mins ago',
          pageType: 'PLP',
          league: 'NFL',
          team: 'Eagles',
          department: 'Accessories',
          action: 'Browsed Eagles drinkware',
        },
      ],
    },
  ];
}

let cachedScenarios: Scenario[] | null = null;
let cachedForVersion = -1;

/**
 * Scenarios with events flipped into canonical newest-first order.
 *
 * Version-checked like the model registry, and for the same reason: every event
 * in these scenarios carries a product id resolved out of the catalog, so the
 * list is exactly as perishable as the catalog it was resolved against.
 *
 * There is deliberately no module-level `SCENARIOS` constant any more. Building
 * one at import time both captured a reference nothing could invalidate and
 * dragged the whole catalog build onto the import path. Callers ask for the list
 * when they need it; `getDataset()` is memoised, so the work is unchanged.
 */
export function buildScenarios(): Scenario[] {
  if (cachedScenarios && cachedForVersion === getDatasetVersion()) return cachedScenarios;
  const builtForVersion = getDatasetVersion();
  cachedScenarios = authorScenarios().map((s) => ({
    ...s,
    recentEvents: [...s.recentEvents].reverse(),
  }));
  cachedForVersion = builtForVersion;
  return cachedScenarios;
}
