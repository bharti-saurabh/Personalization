export type TeamId = 'Eagles' | '76ers' | 'Phillies' | 'Cowboys' | 'Chiefs' | 'Lakers';

export type Department = 'Jerseys' | 'T-shirts' | 'Hats' | 'Hoodies' | 'Collectibles' | 'Accessories' | 'Kids' | 'Home & Office';

export type League = 'NFL' | 'NBA' | 'MLB';

/**
 * The seven things that can happen to the sports world between two page loads.
 *
 * Declared here rather than in `src/sim/clock.ts` on purpose. `Product` carries
 * a market flag, and if the flag's `kind` were imported from clock.ts then
 * types.ts and clock.ts would import each other. Erasable type cycles are legal
 * in TypeScript, but the direction of dependency should read one way: clock.ts
 * knows about the catalog, and the catalog does not know about the clock.
 */
export type MarketEventKind =
  | 'TRADE'
  | 'INJURY'
  | 'PLAYOFF_WIN'
  | 'CHAMPIONSHIP'
  | 'NEW_SIGNING'
  | 'RETIREMENT'
  | 'KIT_LAUNCH';

/**
 * Why a product is hot right now, stamped on it by the market-event pass.
 *
 * Present only on products an event actually touched, which is what makes it
 * usable as a filter: `products.filter(p => p.marketFlag)` is the hot-market
 * assortment, with no threshold to argue about.
 */
export interface MarketFlag {
  /**
   * Which fired event stamped this flag.
   *
   * Carried so the count of what an event touched is exact rather than inferred
   * from the headline. Two trades of the same player in the same demo would
   * otherwise be indistinguishable on the product.
   */
  eventId: string;
  kind: MarketEventKind;
  /** One line, in merchandising language. Rendered as-is on the tile. */
  headline: string;
  /**
   * Multiplier this event applied to intrinsic popularity, after calendar
   * decay. Above 1 is demand pulled in, below 1 is demand pushed away - an
   * injury flags a product just as loudly as a championship does, and the sign
   * is the difference.
   */
  lift: number;
  /** Months since the event fired, at the clock the catalog was built under. */
  monthsSince: number;
}

export interface Product {
  id: string;
  name: string;
  team: TeamId;
  league: League;
  department: Department;
  subdepartment: string;
  player?: string;
  brand: string;
  gender: 'Men' | 'Women' | 'Unisex' | 'Kids';
  ageGroup: 'Adult' | 'Kids' | 'Toddler';
  price: number;
  salePrice?: number;
  priceBand: '$' | '$$' | '$$$' | '$$$$';
  rating: number;
  reviewCount: number;
  inventoryStatus: 'In Stock' | 'Low Stock' | 'Pre-Order';
  /**
   * Team gradient class from the catalog feed. Retained because a real
   * merchandising feed carries an image reference, but the storefront no longer
   * renders it: product visuals are drawn procedurally by ProductImage.tsx.
   */
  imageBg: string;
  badge?: string;
  styleFamily: string;
  popularity: number; // 0 - 100
  primaryColor: string;
  secondaryColor: string;
  jerseyNumber?: string;

  // --- Fields added by the synthetic catalog generator (src/sim/catalog.ts) ---
  /** Dense position in the catalog array; used as the row/column key in the co-occurrence graphs. */
  index?: number;
  /** Human-readable colorway, e.g. "Midnight Green". Part of the product text used for embedding. */
  colorway?: string;
  /** Size ladder appropriate to this department. */
  sizes?: string[];
  /** 0 = brand new release, 1 = long-standing catalog item. Feeds the cold-start narrative. */
  releaseRecency?: number;

  // --- Fields written by the market-event pass (src/sim/catalog.ts) ---
  /** Set when a fired market event touched this product. Absent on a quiet catalog. */
  marketFlag?: MarketFlag;
  /**
   * Where this product was before an event moved it.
   *
   * A trade rewrites `team`, `league` and the colourway in place so the product
   * id survives - a shopper with the jersey in their cart should not find it
   * missing. This records what it used to be, which is the only way the
   * storefront can say "moved from Philadelphia" rather than silently showing
   * a different club than the one the shopper clicked.
   */
  movedFrom?: { team: TeamId; league: League };
}

export type ScenarioId = 'returning_eagles' | 'multi_team' | 'anonymous' | 'hot_market' | 'low_confidence';

export interface Scenario {
  id: ScenarioId;
  name: string;
  subtitle: string;
  profileType: 'Recognized' | 'Anonymous';
  primaryInterest: string;
  secondaryInterest?: string;
  device: 'mobile' | 'desktop';
  channel: 'Direct' | 'Paid Social' | 'Search' | 'Email';
  conversionPropensity: 'High' | 'Medium' | 'Low';
  confidenceScore: number; // 0 - 1.0
  description: string;
  recentEvents: UserEvent[];
  historicalOrdersCount: number;
  favTeams: TeamId[];
}

export interface UserEvent {
  id: string;
  timestamp: string;
  pageType: 'Home' | 'PLP' | 'PDP' | 'Cart' | 'Search' | 'Filter';
  league?: League;
  team?: TeamId;
  department?: Department;
  productId?: string;
  productName?: string;
  filterApplied?: string;
  action: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedSize: string;
  addedByRecommendation?: boolean;
  recommendationSource?: 'Cross-Sell Complement' | 'Vector Similarity' | 'Intent Hero';
}

export interface IntentPrediction {
  teams: { team: TeamId; probability: number }[];
  departments: { department: Department; probability: number }[];
  conversionPropensity: number; // 0 - 1.0
  expectedSessionValue: number;
  topFilters: string[];
  confidence: number;
  isFallback: boolean;
  fallbackReason?: string;
  inferenceTimeMs: number;
}

export interface SimilarityMatch {
  product: Product;
  totalScore: number;
  breakdown: {
    teamMatch: number;
    playerMatch: number;
    deptMatch: number;
    styleMatch: number;
    priceProximity: number;
    coViewStrength: number;
  };
  explanation: string;
}

export interface ComplementMatch {
  product: Product;
  complementScore: number;
  relationshipType: 'Co-Order High' | 'Complete the Look' | 'Cart Accessory' | 'Cross-Dept Classic';
  supportingSignal: string;
  breakdown: {
    coOrder: number;
    coCart: number;
    deptCompatibility: number;
    teamMatch: number;
  };
  explanation: string;
}

export interface DecisionTrace {
  confidenceThreshold: number;
  passedConfidence: boolean;
  inventoryAvailable: boolean;
  teamConsistencyPassed: boolean;
  diversityApplied: boolean;
  fallbackTriggered: boolean;
  finalDecisionReason: string;
  targetComponent: string;
}

export type NavigationTab = 
  | 'experience'
  | 'comparison'
  | 'journey'
  | 'model_intelligence'
  | 'model_evidence'
  | 'pipeline'
  | 'lab'
  | 'architecture'
  | 'straive_contribution';

export type StorefrontPage = 'home' | 'plp' | 'pdp' | 'cart';
