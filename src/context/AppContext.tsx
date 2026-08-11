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
} from '../types';
import { SCENARIOS } from '../data/scenarios';
import { SYNTHETIC_PRODUCTS } from '../data/products';
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
  lastModelFeedback: string | null;

  // Live ML Engine Outputs
  topazPrediction: IntentPrediction;
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

  const [products] = useState<Product[]>(SYNTHETIC_PRODUCTS);
  const [selectedProduct, setSelectedProduct] = useState<Product>(SYNTHETIC_PRODUCTS[0]);
  const [cart, setCart] = useState<CartItem[]>([
    {
      product: SYNTHETIC_PRODUCTS[0], // Jalen Hurts Jersey
      quantity: 1,
      selectedSize: 'L',
    },
  ]);

  const [userEvents, setUserEvents] = useState<UserEvent[]>(SCENARIOS[0].recentEvents);
  const [activeTeamOverride, setActiveTeamOverride] = useState<TeamId | null>(null);
  const [activeDeptFilter, setActiveDeptFilter] = useState<string | null>(null);
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
      // Pick representative product for scenario
      if (found.id === 'hot_market') {
        const chiefsHat = products.find((p) => p.id === 'chiefs-hat-champions-cap') || products[0];
        setSelectedProduct(chiefsHat);
      } else if (found.id === 'anonymous') {
        setSelectedProduct(products[0]);
        setStorefrontPage('pdp');
      } else {
        setSelectedProduct(products[0]);
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

  // Live ML Engine calculations
  const topazPrediction = runIntentEngine(selectedScenario, userEvents, activeTeamOverride);
  const similarityMatches = runSimilarityEngine(selectedProduct, products, 4);
  const complementMatches = runComplementEngine(selectedProduct, products, 4);
  const activeDecisionTrace = generateDecisionTrace(
    topazPrediction,
    storefrontPage === 'home' ? 'Homepage Hero A-Spot & Team Widget' : storefrontPage === 'plp' ? 'Dynamic Filter Prioritization' : storefrontPage === 'pdp' ? 'Similarity & Cross-Sell Carousels' : 'Cart Cross-sell'
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
        lastModelFeedback,
        topazPrediction,
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
