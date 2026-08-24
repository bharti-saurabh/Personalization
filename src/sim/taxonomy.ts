/**
 * Vertical configuration.
 *
 * Everything specific to sports commerce lives here. The catalog generator, the
 * behaviour simulator and the three engines read from this file and contain no
 * hard-coded team or department names of their own - swapping this file for a
 * different taxonomy (apparel, electronics, grocery) re-skins the entire
 * prototype without touching the modelling code.
 *
 * IMPORTANT BOUNDARY
 * ------------------
 * `DEPARTMENTS[x].outfitAffinity` is *ground truth* consumed only by the
 * behaviour simulator when it assembles synthetic baskets. The complement
 * engine never reads it. The engine sees only the co-occurrence counts that
 * fall out of the simulated orders, and has to recover the structure
 * statistically. Keeping that boundary intact is what makes the offline
 * evaluation meaningful rather than circular.
 */

import { Department, League, TeamId } from '../types';

export interface TeamConfig {
  id: TeamId;
  fullName: string;
  city: string;
  league: League;
  primaryColor: string;
  secondaryColor: string;
  /** Relative national fan-base size; drives baseline popularity and cold-start fallbacks. */
  marketSize: number;
  /** Static Tailwind gradient classes for merchandise imagery. Must be literal so JIT retains them. */
  gradientClass: string;
  /** Roster used to generate player-attributed merchandise. */
  players: { name: string; number: string; popularity: number }[];
}

export const TEAMS: TeamConfig[] = [
  {
    id: 'Eagles',
    fullName: 'Philadelphia Eagles',
    city: 'Philadelphia',
    league: 'NFL',
    primaryColor: '#004C54',
    secondaryColor: '#A5ACAF',
    marketSize: 0.92,
    gradientClass: 'from-emerald-900 to-teal-950',
    players: [
      { name: 'Jalen Hurts', number: '1', popularity: 0.98 },
      { name: 'A.J. Brown', number: '11', popularity: 0.88 },
      { name: 'DeVonta Smith', number: '6', popularity: 0.8 },
      { name: 'Saquon Barkley', number: '26', popularity: 0.94 },
      { name: 'Jalen Carter', number: '98', popularity: 0.66 },
    ],
  },
  {
    id: '76ers',
    fullName: 'Philadelphia 76ers',
    city: 'Philadelphia',
    league: 'NBA',
    primaryColor: '#006BB6',
    secondaryColor: '#ED174C',
    marketSize: 0.74,
    gradientClass: 'from-blue-800 to-indigo-950',
    players: [
      { name: 'Joel Embiid', number: '21', popularity: 0.93 },
      { name: 'Tyrese Maxey', number: '0', popularity: 0.87 },
      { name: 'Paul George', number: '8', popularity: 0.79 },
    ],
  },
  {
    id: 'Phillies',
    fullName: 'Philadelphia Phillies',
    city: 'Philadelphia',
    league: 'MLB',
    primaryColor: '#E81828',
    secondaryColor: '#002D72',
    marketSize: 0.7,
    gradientClass: 'from-red-700 to-rose-950',
    players: [
      { name: 'Bryce Harper', number: '3', popularity: 0.95 },
      { name: 'Trea Turner', number: '7', popularity: 0.78 },
      { name: 'Kyle Schwarber', number: '12', popularity: 0.76 },
      { name: 'Zack Wheeler', number: '45', popularity: 0.68 },
    ],
  },
  {
    id: 'Cowboys',
    fullName: 'Dallas Cowboys',
    city: 'Dallas',
    league: 'NFL',
    primaryColor: '#003594',
    secondaryColor: '#869397',
    marketSize: 1.0,
    gradientClass: 'from-blue-900 to-slate-900',
    players: [
      { name: 'Dak Prescott', number: '4', popularity: 0.9 },
      { name: 'CeeDee Lamb', number: '88', popularity: 0.89 },
      { name: 'Micah Parsons', number: '11', popularity: 0.85 },
    ],
  },
  {
    id: 'Chiefs',
    fullName: 'Kansas City Chiefs',
    city: 'Kansas City',
    league: 'NFL',
    primaryColor: '#E31837',
    secondaryColor: '#FFB81C',
    marketSize: 0.95,
    gradientClass: 'from-red-700 to-amber-900',
    players: [
      { name: 'Patrick Mahomes', number: '15', popularity: 0.99 },
      { name: 'Travis Kelce', number: '87', popularity: 0.96 },
      { name: 'Chris Jones', number: '95', popularity: 0.7 },
    ],
  },
  {
    id: 'Lakers',
    fullName: 'Los Angeles Lakers',
    city: 'Los Angeles',
    league: 'NBA',
    primaryColor: '#552583',
    secondaryColor: '#FDB927',
    marketSize: 0.98,
    gradientClass: 'from-purple-800 to-yellow-900',
    players: [
      { name: 'LeBron James', number: '23', popularity: 0.99 },
      { name: 'Anthony Davis', number: '3', popularity: 0.86 },
      { name: 'Austin Reaves', number: '15', popularity: 0.72 },
    ],
  },
];

export const TEAM_BY_ID: Record<TeamId, TeamConfig> = Object.fromEntries(
  TEAMS.map((t) => [t.id, t])
) as Record<TeamId, TeamConfig>;

export interface DepartmentConfig {
  id: Department;
  /** Log-normal price parameters, in USD. */
  priceMu: number;
  priceSigma: number;
  /** Share of catalog assortment. */
  assortmentWeight: number;
  /** Probability a product in this department is attributed to a named player. */
  playerAttributionRate: number;
  sizeScale: 'apparel' | 'hat' | 'onesize' | 'kids';
  styleFamilies: string[];
  subdepartments: string[];
  /**
   * GROUND TRUTH for the behaviour simulator only - the propensity for a
   * shopper who has this department in their basket to add each other
   * department. Deliberately asymmetric: buying a jersey often pulls in a hat,
   * while a hat rarely pulls in a jersey. The complement engine must rediscover
   * this from observed orders; it never reads these numbers.
   */
  outfitAffinity: Partial<Record<Department, number>>;
}

export const DEPARTMENTS: DepartmentConfig[] = [
  {
    id: 'Jerseys',
    priceMu: Math.log(125),
    priceSigma: 0.28,
    assortmentWeight: 0.24,
    playerAttributionRate: 0.95,
    sizeScale: 'apparel',
    styleFamilies: ['Nike Vapor F.U.S.E.', 'Nike Game', 'Nike Limited', 'Throwback Heritage', 'Alternate Colorway'],
    subdepartments: ['Game Jersey', 'Limited Jersey', 'Elite Jersey', 'Throwback Jersey'],
    outfitAffinity: { Hats: 0.42, Hoodies: 0.24, Collectibles: 0.19, Accessories: 0.16, 'T-shirts': 0.14 },
  },
  {
    id: 'Hats',
    priceMu: Math.log(34),
    priceSigma: 0.22,
    assortmentWeight: 0.17,
    playerAttributionRate: 0.12,
    sizeScale: 'hat',
    styleFamilies: ['New Era 59FIFTY', 'New Era 9FORTY', 'Sideline Snapback', 'Structured Trucker'],
    subdepartments: ['Fitted Cap', 'Snapback', 'Trucker', 'Beanie'],
    outfitAffinity: { 'T-shirts': 0.31, Hoodies: 0.2, Accessories: 0.15, Jerseys: 0.08 },
  },
  {
    id: 'T-shirts',
    priceMu: Math.log(32),
    priceSigma: 0.24,
    assortmentWeight: 0.16,
    playerAttributionRate: 0.4,
    sizeScale: 'apparel',
    styleFamilies: ['Sideline Primary', 'Nike Legend Tee', 'Vintage Tri-Blend', 'Local Pride Graphic'],
    subdepartments: ['Graphic Tee', 'Logo Tee', 'Player Tee', 'Long Sleeve'],
    outfitAffinity: { Hats: 0.28, Accessories: 0.14, Hoodies: 0.12 },
  },
  {
    id: 'Hoodies',
    priceMu: Math.log(78),
    priceSigma: 0.26,
    assortmentWeight: 0.14,
    playerAttributionRate: 0.22,
    sizeScale: 'apparel',
    styleFamilies: ['Nike Club Fleece', 'Therma Performance', 'Vintage Wash Fleece', 'Sideline Coaches'],
    subdepartments: ['Pullover Hoodie', 'Full-Zip Hoodie', 'Crewneck Fleece'],
    outfitAffinity: { Hats: 0.3, Accessories: 0.13, 'T-shirts': 0.11 },
  },
  {
    id: 'Collectibles',
    priceMu: Math.log(96),
    priceSigma: 0.55,
    assortmentWeight: 0.1,
    playerAttributionRate: 0.85,
    sizeScale: 'onesize',
    styleFamilies: ['Stadium Authentic', 'Signed Memorabilia', 'Framed Display', 'Bobblehead Series'],
    subdepartments: ['Signed Photo', 'Framed Print', 'Bobblehead', 'Mini Helmet'],
    outfitAffinity: { Accessories: 0.1, 'Home & Office': 0.22 },
  },
  {
    id: 'Accessories',
    priceMu: Math.log(24),
    priceSigma: 0.35,
    assortmentWeight: 0.1,
    playerAttributionRate: 0.05,
    sizeScale: 'onesize',
    styleFamilies: ['Team Colorway Basics', 'Game Day Essentials', 'Travel Series'],
    subdepartments: ['Socks', 'Scarf', 'Backpack', 'Phone Case', 'Lanyard'],
    outfitAffinity: { 'T-shirts': 0.12, Hats: 0.12 },
  },
  {
    id: 'Kids',
    priceMu: Math.log(48),
    priceSigma: 0.3,
    assortmentWeight: 0.06,
    playerAttributionRate: 0.55,
    sizeScale: 'kids',
    styleFamilies: ['Youth Game Replica', 'Toddler Team Set', 'Kids Graphic Line'],
    subdepartments: ['Youth Jersey', 'Youth Tee', 'Toddler Set', 'Kids Hoodie'],
    outfitAffinity: { Kids: 0.34, Hats: 0.18, Accessories: 0.12 },
  },
  {
    id: 'Home & Office',
    priceMu: Math.log(42),
    priceSigma: 0.45,
    assortmentWeight: 0.03,
    playerAttributionRate: 0.08,
    sizeScale: 'onesize',
    styleFamilies: ['Team Home Series', 'Desk & Office Line', 'Tailgate Collection'],
    subdepartments: ['Drinkware', 'Wall Art', 'Blanket', 'Desk Accessory'],
    outfitAffinity: { Collectibles: 0.18, Accessories: 0.12 },
  },
];

export const DEPARTMENT_BY_ID: Record<Department, DepartmentConfig> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, d])
) as Record<Department, DepartmentConfig>;

export const DEPARTMENT_IDS: Department[] = DEPARTMENTS.map((d) => d.id);
export const TEAM_IDS: TeamId[] = TEAMS.map((t) => t.id);
export const LEAGUES: League[] = ['NFL', 'NBA', 'MLB'];

export const BRANDS = ['Nike', 'Sideline Collection', 'New Era', 'Mitchell & Ness', "'47 Brand", 'Pro Standard'];

export const SIZE_SCALES: Record<DepartmentConfig['sizeScale'], string[]> = {
  apparel: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  hat: ['S/M', 'M/L', 'L/XL', 'OSFA'],
  onesize: ['One Size'],
  kids: ['2T', '3T', '4T', 'YS', 'YM', 'YL'],
};

/** Price band thresholds in USD, applied after price generation. */
export function priceBandFor(price: number): '$' | '$$' | '$$$' | '$$$$' {
  if (price < 30) return '$';
  if (price < 70) return '$$';
  if (price < 140) return '$$$';
  return '$$$$';
}

/**
 * Seasonality by league, indexed by month (0 = January). Drives which teams a
 * simulated shopper is likely to browse, so the co-occurrence graphs carry a
 * realistic sports-calendar signature rather than uniform noise.
 */
export const LEAGUE_SEASONALITY: Record<League, number[]> = {
  //         J    F    M    A    M    J    J    A    S    O    N    D
  NFL: [0.75, 0.5, 0.3, 0.3, 0.35, 0.3, 0.45, 0.7, 1.0, 1.0, 0.95, 0.9],
  NBA: [0.85, 0.8, 0.8, 0.9, 0.85, 0.6, 0.35, 0.3, 0.4, 0.8, 0.85, 0.85],
  MLB: [0.3, 0.4, 0.65, 0.9, 0.85, 0.85, 0.85, 0.8, 0.9, 0.8, 0.4, 0.35],
};

/** Month the simulated "today" falls in. Fixed so the demo is reproducible. */
export const SIM_MONTH = 8; // September - NFL season opening
