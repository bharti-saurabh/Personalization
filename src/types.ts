export type TeamId = 'Eagles' | '76ers' | 'Phillies' | 'Cowboys' | 'Chiefs' | 'Lakers';

export type Department = 'Jerseys' | 'T-shirts' | 'Hats' | 'Hoodies' | 'Collectibles' | 'Accessories' | 'Kids' | 'Home & Office';

export type League = 'NFL' | 'NBA' | 'MLB';

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
  | 'lab'
  | 'architecture'
  | 'straive_contribution';

export type StorefrontPage = 'home' | 'plp' | 'pdp' | 'cart';
