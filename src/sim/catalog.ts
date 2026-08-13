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

import { Product, TeamId } from '../types';
import { Rng } from './rng';
import {
  BRANDS,
  DEPARTMENTS,
  LEAGUE_SEASONALITY,
  SIM_MONTH,
  SIZE_SCALES,
  TEAMS,
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
  serial: number
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
  const seasonal = LEAGUE_SEASONALITY[team.league][SIM_MONTH];
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
    // Filled in by graphs.ts once sessions are simulated.
    coViewScore: 0,
    coCartScore: 0,
    coOrderScore: 0,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    jerseyNumber: rosterEntry?.number,
    colorway,
    sizes: SIZE_SCALES[dept.sizeScale],
    releaseRecency,
  };
}

/**
 * Generates the full catalog. Assortment depth per (team, department) cell is
 * proportional to market size and department weight, with a floor of two so no
 * cell renders as an empty listing page.
 */
export function generateCatalog(seed: string = CATALOG_SEED): Product[] {
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
        products.push(generateProduct(rng, team, dept, products.length));
      }
    }
  }

  // Assign dense indices - these are the keys used by the co-occurrence graphs
  // and the embedding matrix, so they must be stable for the process lifetime.
  products.forEach((p, i) => {
    p.index = i;
  });

  return products;
}
