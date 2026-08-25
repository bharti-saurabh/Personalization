import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Product,
  Scenario,
  ScenarioId,
  StorefrontPage,
  NavigationTab,
  CartItem,
  UserEvent,
  IntentPrediction,
  SimilarityMatch,
  ComplementMatch,
  DecisionTrace,
  TeamId,
  League,
} from '../types';
import { SCENARIOS, findAnchorProduct } from '../data/scenarios';
import { getDataset } from '../sim/dataset';
import {
  runIntentEngine,
  runSimilarityEngine,
  runComplementEngine,
  generateDecisionTrace,
} from '../ml/engine';

interface AppContextType {
  // Scenario & Settings State
  scenarios: Scenario[];
  selectedScenario: Scenario;
  selectScenarioById: (id: ScenarioId) => void;
  isPersonalizationOn: boolean;
  togglePersonalization: () => void;
  showMLPanel: boolean;
  toggleMLPanel: () => void;

  // Navigation State
  navigationTab: NavigationTab;
  setNavigationTab: (tab: NavigationTab) => void;
  storefrontPage: StorefrontPage;
  setStorefrontPage: (page: StorefrontPage) => void;

  // Products & Commerce State
  products: Product[];
  selectedProduct: Product;
  setSelectedProduct: (product: Product) => void;
  cart: CartItem[];
  addToCart: (product: Product, selectedSize?: string, source?: CartItem['recommendationSource']) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;

  // ML Intelligence & Events
  userEvents: UserEvent[];
  recordEvent: (action: string, details?: Partial<UserEvent>) => void;
  activeTeamOverride: TeamId | null;
  setActiveTeamOverride: (team: TeamId | null) => void;
  activeDeptFilter: string | null;
  setActiveDeptFilter: (dept: string | null) => void;
  activeLeagueFilter: League | null;
  setActiveLeagueFilter: (league: League | null) => void;
  lastModelFeedback: string | null;

  // Live ML Engine Outputs
  intentPrediction: IntentPrediction;
  similarityMatches: SimilarityMatch[];
  complementMatches: ComplementMatch[];
  activeDecisionTrace: DecisionTrace;
  activeExplainedProduct: Product | null;
  setActiveExplainedProduct: (p: Product | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scenarios] = useState<Scenario[]>(SCENARIOS);
  const [selectedScenario, setSelectedScenario] = useState<Scenario>(SCENARIOS[0]);
  const [isPersonalizationOn, setIsPersonalizationOn] = useState<boolean>(true);
  const [showMLPanel, setShowMLPanel] = useState<boolean>(true);

  const [navigationTab, setNavigationTab] = useState<NavigationTab>('experience');
  const [storefrontPage, setStorefrontPage] = useState<StorefrontPage>('home');

  // The catalog and the trained-artefact stand-ins are built once, lazily, by
  // the simulation layer. `useState` with an initialiser keeps that off the
  // render path after the first mount.
  const [products] = useState<Product[]>(() => getDataset().products);

  /** The hero product the demo opens on: the most popular Jalen Hurts jersey. */
  const openingProduct = React.useMemo(
    () =>
      findAnchorProduct({ team: 'Eagles', department: 'Jerseys', player: 'Jalen Hurts' }) ??
      products[0],
    [products]
  );

  const [selectedProduct, setSelectedProduct] = useState<Product>(openingProduct);
  const [cart, setCart] = useState<CartItem[]>([
    {
      product: openingProduct,
      quantity: 1,
      selectedSize: 'L',
    },
  ]);

  const [userEvents, setUserEvents] = useState<UserEvent[]>(SCENARIOS[0].recentEvents);
  const [activeTeamOverride, setActiveTeamOverride] = useState<TeamId | null>(null);
  const [activeDeptFilter, setActiveDeptFilter] = useState<string | null>(null);
  const [activeLeagueFilter, setActiveLeagueFilter] = useState<League | null>(null);
  const [lastModelFeedback, setLastModelFeedback] = useState<string | null>(null);
  const [activeExplainedProduct, setActiveExplainedProduct] = useState<Product | null>(null);

  // Switch Scenario
  const selectScenarioById = (id: ScenarioId) => {
    const found = scenarios.find((s) => s.id === id);
    if (found) {
      setSelectedScenario(found);
      setUserEvents(found.recentEvents);
      setActiveTeamOverride(null);
      setActiveDeptFilter(null);
      setActiveLeagueFilter(null);
      // Anchor each scenario on a representative generated product, resolved by
      // predicate rather than by id - catalog ids move with the generator seed.
      if (found.id === 'hot_market') {
        setSelectedProduct(findAnchorProduct({ team: 'Chiefs', department: 'Hats' }) ?? openingProduct);
      } else if (found.id === 'anonymous') {
        setSelectedProduct(openingProduct);
        setStorefrontPage('pdp');
      } else if (found.id === 'low_confidence') {
        setSelectedProduct(findAnchorProduct({ team: 'Cowboys', department: 'Jerseys' }) ?? openingProduct);
      } else {
        setSelectedProduct(openingProduct);
      }
    }
  };

  // Record real-time telemetry events
  const recordEvent = (action: string, details?: Partial<UserEvent>) => {
    const newEv: UserEvent = {
      id: `ev-${Date.now()}`,
      timestamp: 'Just now',
      pageType: storefrontPage === 'home' ? 'Home' : storefrontPage === 'plp' ? 'PLP' : storefrontPage === 'pdp' ? 'PDP' : 'Cart',
      action,
      ...details,
    };
    setUserEvents((prev) => [newEv, ...prev]);

    // Model Feedback Toast Trigger
    setLastModelFeedback(`Recommendation interaction captured: "${action}"`);
    setTimeout(() => {
      setLastModelFeedback(null);
    }, 3500);
  };

  // Add to Cart
  const addToCart = (product: Product, selectedSize: string = 'L', source?: CartItem['recommendationSource']) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id && item.selectedSize === selectedSize);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.selectedSize === selectedSize
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1, selectedSize, addedByRecommendation: !!source, recommendationSource: source }];
    });

    recordEvent(`Added ${product.name} to Cart`, {
      productId: product.id,
      productName: product.name,
      team: product.team,
      department: product.department,
      league: product.league,
    });
  };

  // Remove from Cart
  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
    recordEvent(`Removed item from Cart`);
  };

  const clearCart = () => {
    setCart([]);
  };

  const togglePersonalization = () => {
    const nextVal = !isPersonalizationOn;
    setIsPersonalizationOn(nextVal);
  };

  const toggleMLPanel = () => {
    setShowMLPanel(!showMLPanel);
  };

  // Live ML engine calls. These are real computation now - a full cosine k-NN
  // sweep of the catalog and a co-order lookup per candidate - so they are
  // memoised on their actual inputs rather than re-run on every render.
  const intentPrediction = React.useMemo(
    () => runIntentEngine(selectedScenario, userEvents, activeTeamOverride),
    [selectedScenario, userEvents, activeTeamOverride]
  );

  const similarityMatches = React.useMemo(
    () => runSimilarityEngine(selectedProduct, products, 4),
    [selectedProduct, products]
  );

  const complementMatches = React.useMemo(
    () => runComplementEngine(selectedProduct, products, 4),
    [selectedProduct, products]
  );

  const targetComponent =
    storefrontPage === 'home'
      ? 'Homepage Hero A-Spot & Team Widget'
      : storefrontPage === 'plp'
        ? 'Dynamic Filter Prioritization'
        : storefrontPage === 'pdp'
          ? 'Similarity & Cross-Sell Carousels'
          : 'Cart Cross-sell';

  const activeDecisionTrace = React.useMemo(
    () => generateDecisionTrace(intentPrediction, targetComponent, products),
    [intentPrediction, targetComponent, products]
  );

  return (
    <AppContext.Provider
      value={{
        scenarios,
        selectedScenario,
        selectScenarioById,
        isPersonalizationOn,
        togglePersonalization,
        showMLPanel,
        toggleMLPanel,
        navigationTab,
        setNavigationTab,
        storefrontPage,
        setStorefrontPage,
        products,
        selectedProduct,
        setSelectedProduct,
        cart,
        addToCart,
        removeFromCart,
        clearCart,
        userEvents,
        recordEvent,
        activeTeamOverride,
        setActiveTeamOverride,
        activeDeptFilter,
        setActiveDeptFilter,
        activeLeagueFilter,
        setActiveLeagueFilter,
        lastModelFeedback,
        intentPrediction,
        similarityMatches,
        complementMatches,
        activeDecisionTrace,
        activeExplainedProduct,
        setActiveExplainedProduct,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
