/**
 * Synthetic catalog generation.
 *
 * Produces a deterministic assortment of roughly 800 products spread across the
 * teams and departments declared in taxonomy.ts. Assortment depth follows
 * market size and department weight, prices follow a log-normal distribution
 * per department, and popularity follows a Zipf tail - so the resulting catalog
 * has the skew of a real merchandising file rather than a uniform grid.
 *
 * Popularity here is an intrinsic product property (how appealing the item is).
 * It is an input to the behaviour simulator, not an output of it. The co-view /
 * co-cart / co-order scores on each product are filled in later by
 * graphs.ts once sessions have actually been simulated.
 */

import { MarketFlag, Product, TeamId } from '../types';
import { Rng } from './rng';
import {
  SimClock,
  activeClock,
  describeEvent,
  effectAt,
  eventPlayer,
  eventTeams,
  monthsBetween,
  seasonality,
} from './clock';
import {
  BRANDS,
  DEPARTMENTS,
  SIZE_SCALES,
  TEAMS,
  TEAM_BY_ID,
  TeamConfig,
  DepartmentConfig,
  priceBandFor,
} from './taxonomy';

const CATALOG_SEED = 'catalog-v1';
const TARGET_CATALOG_SIZE = 800;

/** Team-specific colorway vocabulary, used in product titles and imagery. */
const COLORWAYS: Record<TeamId, string[]> = {
  Eagles: ['Midnight Green', 'Black', 'White', 'Silver', 'Kelly Green Throwback'],
  '76ers': ['Royal Blue', 'White', 'Red', 'Navy', 'City Edition Cream'],
  Phillies: ['Red', 'Powder Blue Throwback', 'White', 'Navy', 'Cream Alternate'],
  Cowboys: ['Navy', 'White', 'Silver', 'Royal Throwback', 'Black'],
  Chiefs: ['Red', 'White', 'Gold', 'Black', 'Sideline Grey'],
  Lakers: ['Purple', 'Gold', 'White', 'Black Mamba', 'City Edition Navy'],
};

const GENDERS: Product['gender'][] = ['Men', 'Women', 'Unisex'];

/**
 * Builds a merchandising title from the product's attributes.
 *
 * Style family is deliberately excluded: real catalog titles carry team,
 * player, colorway, brand and item type, while the style line stays a facet
 * used for filtering and similarity. Including it produced titles like
 * "Nike Limited Game Jersey" where the style and the item type restate each
 * other.
 */
function buildProductName(
  team: TeamConfig,
  subdepartment: string,
  colorway: string,
  brand: string,
  player: string | undefined,
  gender: Product['gender'],
  isKids: boolean
): string {
  const parts: string[] = [team.fullName];

  if (player) parts.push(player);
  if (isKids) parts.push('Youth');
  else if (gender === 'Women') parts.push("Women's");

  parts.push(colorway, brand, subdepartment);
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function generateProduct(
  rng: Rng,
  team: TeamConfig,
  dept: DepartmentConfig,
  serial: number,
  clock: SimClock
): Product {
  const isKidsDept = dept.id === 'Kids';
  const subdepartment = rng.pick(dept.subdepartments);
  const styleFamily = rng.pick(dept.styleFamilies);
  const colorway = rng.pick(COLORWAYS[team.id]);

  // Brand: style families that name a brand pin it; otherwise sample.
  const namedBrand = BRANDS.find((b) => styleFamily.startsWith(b));
  const brand = namedBrand ?? rng.pick(BRANDS);

  // Player attribution, weighted toward the more popular roster members.
  const attributed = rng.chance(dept.playerAttributionRate);
  const rosterEntry = attributed
    ? rng.pickWeighted(
        team.players,
        team.players.map((p) => p.popularity)
      )
    : undefined;

  const gender: Product['gender'] = isKidsDept ? 'Kids' : rng.pickWeighted(GENDERS, [0.55, 0.2, 0.25]);
  const ageGroup: Product['ageGroup'] = isKidsDept ? (rng.chance(0.3) ? 'Toddler' : 'Kids') : 'Adult';

  // Price: log-normal per department, nudged up for player-attributed items.
  const rawPrice = rng.logNormal(dept.priceMu, dept.priceSigma) * (rosterEntry ? 1.08 : 1);
  const price = Math.round(Math.max(9, rawPrice)) - 0.01;

  // Roughly a third of the catalog carries a markdown.
  const onSale = rng.chance(0.32);
  const salePrice = onSale ? Math.round(price * rng.range(0.68, 0.9)) - 0.01 : undefined;

  /**
   * Intrinsic appeal. Combines national fan-base size, the seasonal relevance
   * of the league right now, player draw, and an idiosyncratic product term.
   * This is what the behaviour simulator samples against.
   */
  const seasonal = seasonality(team.league, clock);
  const playerDraw = rosterEntry ? rosterEntry.popularity : 0.55;
  const idiosyncratic = rng.range(0.45, 1.0);
  const popularityRaw = team.marketSize * 0.32 + seasonal * 0.24 + playerDraw * 0.24 + idiosyncratic * 0.2;
  const popularity = Math.round(Math.min(100, Math.max(4, popularityRaw * 100)));

  // Ratings cluster high in sports merch; volume tracks popularity.
  const rating = Number(Math.min(5, Math.max(3.2, rng.gaussian(4.55, 0.28))).toFixed(1));
  const reviewCount = Math.max(3, Math.round(rng.logNormal(Math.log(popularity * 2.4), 0.7)));

  const inventoryStatus: Product['inventoryStatus'] = rng.chance(0.06)
    ? 'Low Stock'
    : rng.chance(0.04)
      ? 'Pre-Order'
      : 'In Stock';

  const releaseRecency = Number(rng.float().toFixed(3));

  let badge: string | undefined;
  if (popularity > 88) badge = 'Best Seller';
  else if (salePrice) badge = 'Sale';
  else if (releaseRecency < 0.12) badge = 'Just Dropped';
  else if (popularity > 74) badge = 'Popular';

  const name = buildProductName(team, subdepartment, colorway, brand, rosterEntry?.name, gender, isKidsDept);

  return {
    id: `${team.id.toLowerCase().replace(/[^a-z0-9]/g, '')}-${dept.id.toLowerCase().replace(/[^a-z0-9]/g, '')}-${serial}`,
    name,
    team: team.id,
    league: team.league,
    department: dept.id,
    subdepartment,
    player: rosterEntry?.name,
    brand,
    gender,
    ageGroup,
    price,
    salePrice,
    priceBand: priceBandFor(salePrice ?? price),
    rating,
    reviewCount,
    inventoryStatus,
    imageBg: team.gradientClass,
    badge,
    styleFamily,
    popularity,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    jerseyNumber: rosterEntry?.number,
    colorway,
    sizes: SIZE_SCALES[dept.sizeScale],
    releaseRecency,
  };
}

/* -------------------------------------------------------- market events -- */

/**
 * Rewrites a generated catalog for the events that have fired.
 *
 * WHY THIS IS A POST-PASS AND NOT A GENERATION INPUT
 *
 * The obvious design is to fold the event log into the roster first and then
 * generate - a trade would simply produce the player's jerseys under the new
 * club, and everything downstream would follow with no rewrite at all. It is
 * cleaner, and it is wrong here for one concrete reason: product ids are
 * positional (`eagles-jerseys-31`), so regenerating under a changed roster
 * issues new ids for the affected items. The shopper who has that jersey in
 * their cart when the trade lands would find the cart holding a product the
 * catalog no longer contains, and the demo's whole point is that the event
 * fires while somebody is mid-session.
 *
 * So the roster fold stays available in clock.ts for the population side, and
 * the catalog side transfers products in place: same id, new club. That is also
 * the more faithful merchandising story - the SKU does not cease to exist when
 * a player moves, it gets re-badged and re-priced.
 *
 * PURITY
 *
 * Returns a new array of new objects for anything it touches, and the SAME
 * object for anything it does not. It never writes to its input. Two worlds
 * built from two clocks therefore share only the products no event in either
 * log touched, and those are immutable in practice because nothing else in the
 * codebase writes to a Product - graph scores moved to a side table for exactly
 * this reason.
 *
 * The empty-log case returns the input array unchanged and consumes no rng, so
 * a clock with no events reproduces the published metrics byte for byte.
 */
export function applyMarketEvents(products: Product[], clock: SimClock = activeClock()): Product[] {
  if (clock.events.length === 0) return products;

  let current = products;
  for (const event of clock.events) {
    const effect = effectAt(event, clock);
    const monthsSince = Math.max(0, monthsBetween(event.at, clock));
    const { headline } = describeEvent(event);
    const player = eventPlayer(event);
    const { team: subject, from } = eventTeams(event);

    current = current.map((product) => {
      // A trade is the only event that moves a product between clubs, and it
      // moves only the products carrying the traded name.
      if (event.kind === 'TRADE' && product.player === player && product.team === from) {
        return transferProduct(product, event.toTeam, event.newNumber, effect.playerLift, {
          eventId: event.id,
          kind: event.kind,
          headline,
          lift: effect.playerLift,
          monthsSince,
        });
      }

      // Player-scoped lift: the name is what moved, not the club.
      if (player && product.player === player && product.team === subject) {
        return liftProduct(product, effect.playerLift, {
          eventId: event.id,
          kind: event.kind,
          headline,
          lift: effect.playerLift,
          monthsSince,
        });
      }

      // Club-scoped lift, department-weighted. An event that says nothing about
      // this product's department still lifts it by the club term, because a
      // title win moves the whole assortment.
      if (product.team === subject) {
        const lift = effect.teamLift * (effect.deptLift[product.department] ?? 1);
        if (Math.abs(lift - 1) < 0.02) return product;
        return liftProduct(product, lift, { eventId: event.id, kind: event.kind, headline, lift, monthsSince });
      }

      // The club that lost the player. Flagged, because "demand left here" is
      // as much a merchandising fact as "demand arrived there", and a planner
      // who only sees the arriving side will over-buy.
      if (from && product.team === from) {
        if (Math.abs(effect.sourceTeamLift - 1) < 0.02) return product;
        return liftProduct(product, effect.sourceTeamLift, {
          eventId: event.id,
          kind: event.kind,
          headline,
          lift: effect.sourceTeamLift,
          monthsSince,
        });
      }

      return product;
    });
  }

  // Indices are positional and the graphs key on them, so re-stamp after the
  // rewrite even though nothing was added or removed. Cheap, and it means the
  // invariant holds by construction rather than by argument.
  return current.map((p, i) => (p.index === i ? p : { ...p, index: i }));
}

/**
 * Applies a market lift to a popularity score without destroying the ordering
 * inside the affected club.
 *
 * WHY THIS IS NOT `min(100, popularity * lift)`. That was the first version and
 * it is wrong in a way that only shows up when you measure it. Catalog
 * popularity runs in the 80s and 90s for a marquee club, and a trade lands a
 * team lift of 1.3 on top of a Jerseys department lift of 1.55 - very nearly
 * 2x. Multiply and clamp, and every one of the 163 Dallas products pins to
 * exactly 100. The assortment the event just made interesting becomes the one
 * assortment with no internal ranking signal at all, which is precisely
 * backwards: `npm run sim:market` reported one distinct popularity value across
 * the whole club.
 *
 * So an upward lift is applied to the HEADROOM rather than to the score. A
 * product sitting at 87 with 13 points of room and a 2x lift closes half that
 * gap to 93.5; one at 95 closes to 97.5. The transform is strictly increasing
 * in both popularity and lift, so the within-club order is preserved exactly,
 * the ceiling is approached and never reached, and a hot club still clears an
 * untouched one by a wide margin. It agrees with the multiplicative form at
 * lift = 1, so a quiet clock is unaffected.
 *
 * Downward lifts stay multiplicative. Damping runs away from the ceiling, not
 * into it, so it never saturates - it only needs the floor to stop a long-dated
 * injury from zeroing a club out.
 */
function liftedPopularity(popularity: number, lift: number): number {
  if (lift <= 1) return Math.round(Math.max(3, popularity * lift));
  return Math.round(Math.min(100, 100 - (100 - popularity) / lift));
}

function liftProduct(product: Product, lift: number, flag: MarketFlag): Product {
  return { ...product, popularity: liftedPopularity(product.popularity, lift), marketFlag: flag };
}

/**
 * Moves one product to a new club, keeping its id.
 *
 * Everything the storefront paints a club with is rewritten - colours, gradient,
 * colourway vocabulary, title - and `movedFrom` records where it came from so
 * the tile can say so rather than silently swapping badges under the shopper.
 * The colourway is chosen by a stable hash of the product id rather than by rng,
 * because this pass runs outside the seeded generator and must not depend on
 * how many products preceded it.
 */
function transferProduct(
  product: Product,
  toTeam: TeamId,
  newNumber: string,
  lift: number,
  flag: MarketFlag
): Product {
  const team = TEAM_BY_ID[toTeam];
  const palette = COLORWAYS[toTeam];
  let hash = 0;
  for (let i = 0; i < product.id.length; i++) hash = (hash * 31 + product.id.charCodeAt(i)) >>> 0;
  const colorway = palette[hash % palette.length];

  return {
    ...product,
    team: toTeam,
    league: team.league,
    name: buildProductName(
      team,
      product.subdepartment,
      colorway,
      product.brand,
      product.player,
      product.gender,
      product.department === 'Kids'
    ),
    colorway,
    imageBg: team.gradientClass,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    jerseyNumber: newNumber,
    popularity: liftedPopularity(product.popularity, lift),
    // `badge` is left alone. It is the merchandising flag - Best Seller, Sale,
    // Just Dropped - and overwriting it would trade a fact the storefront
    // already knew for one `marketFlag` states more precisely.
    marketFlag: flag,
    movedFrom: { team: product.team, league: product.league },
  };
}

/**
 * Generates the full catalog. Assortment depth per (team, department) cell is
 * proportional to market size and department weight, with a floor of two so no
 * cell renders as an empty listing page.
 */
export function generateCatalog(seed: string = CATALOG_SEED, clock: SimClock = activeClock()): Product[] {
  const rng = new Rng(seed);
  const products: Product[] = [];

  const totalWeight = TEAMS.reduce(
    (acc, team) => acc + DEPARTMENTS.reduce((a, d) => a + d.assortmentWeight * team.marketSize, 0),
    0
  );

  for (const team of TEAMS) {
    for (const dept of DEPARTMENTS) {
      const share = (dept.assortmentWeight * team.marketSize) / totalWeight;
      const count = Math.max(2, Math.round(share * TARGET_CATALOG_SIZE));
      for (let i = 0; i < count; i++) {
        products.push(generateProduct(rng, team, dept, products.length, clock));
      }
    }
  }

  // Assign dense indices - these are the keys used by the co-occurrence graphs
  // and the embedding matrix, so they must be stable for the process lifetime.
  products.forEach((p, i) => {
    p.index = i;
  });

  return applyMarketEvents(products, clock);
}
