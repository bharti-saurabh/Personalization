import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import {
  Product,
  Scenario,
  ScenarioId,
  StorefrontPage,
  NavigationTab,
  CartItem,
  UserEvent,
  DecisionTrace,
  TeamId,
  League,
} from '../types';
import { IntentResult } from '../ml/intent';
import { SimilarityResult } from '../ml/similarity';
import { ComplementResult } from '../ml/complement';
import { JournalBeat, MarketBeat, buildBeat } from '../ml/journal';
import { buildDecisions } from '../ml/decisions';
import type { DecisionEntry } from '../ml/decisions';
import { emptyLedger } from '../ml/effort';
import type { EffortLedger } from '../ml/effort';
import { buildScenarios, findAnchorProduct } from '../data/scenarios';
import { getDataset, fireMarketEvent, resetMarket, subscribeToWorld } from '../sim/dataset';
import {
  EVENT_DECK,
  MarketEvent,
  MarketEventTemplate,
  activeClock,
  clockLabel,
  describeEvent,
} from '../sim/clock';
import {
  runIntentEngine,
  runSimilarityEngine,
  runComplementEngine,
  generateDecisionTrace,
  readContext,
} from '../ml/engine';
import type {
  CompletenessReport,
  ContextReading,
  IdentityState,
  ProfileDelta,
  VisitorContext,
  VisitorProfile,
} from '../ml/engine';
import { useProfileStore } from './profileStore';
import { SIMULATED_ARRIVAL, contextIsBare, readVisitorContext } from './visitorContext';

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
  intentPrediction: IntentResult;
  similarityMatches: SimilarityResult[];
  complementMatches: ComplementResult[];
  activeDecisionTrace: DecisionTrace;

  /**
   * Running account of the session: one beat per thing the shopper did, each
   * carrying what ran, what it scored, which rule fired and what got rendered.
   * Newest first. See ml/journal.ts.
   */
  journal: JournalBeat[];
  activeExplainedProduct: Product | null;
  setActiveExplainedProduct: (p: Product | null) => void;

  /* ------------------------------------------------- identity and profile -- */

  /** The folded visitor profile. Persisted across reloads by profileStore. */
  visitorProfile: VisitorProfile;
  /** Weighted completeness of that profile, for the always-on meter. */
  completeness: CompletenessReport;
  /** Which rung of the identity ladder the shopper is on. */
  identityState: IdentityState;
  /** Moves them to another rung mid-session. Re-folds; never patches. */
  promoteTo: (state: IdentityState) => void;
  /** What the last promotion changed, so the panel can animate it. */
  promotionDeltas: ProfileDelta[];
  /** What was read off the arriving request before the shopper did anything. */
  visitorContext: VisitorContext;
  contextReading: ContextReading;
  /** True when the arrival context is invented rather than read from the browser. */
  contextIsSimulated: boolean;

  /** Every field write since the profile was created, newest first. */
  deltaLog: ProfileDelta[];
  /** Writes from the most recent fold only. What the Profile tab highlights. */
  lastDeltas: ProfileDelta[];
  /**
   * Journal beats joined to the writes they caused - what ran, what moved, what
   * got rendered, in one record per action.
   */
  decisions: DecisionEntry[];
  /**
   * What the session cost the shopper. Empty until the storefront's surfaces are
   * instrumented; the arithmetic and the wiring are real, the entries are not
   * invented. See ml/effort.ts.
   */
  effortLedger: EffortLedger;

  /* ------------------------------------------------------- market events -- */

  /** The events the demo can fire, in the order the deck presents them. */
  eventDeck: MarketEventTemplate[];
  /**
   * Fires one into the live world.
   *
   * Rebuilds the catalog, re-simulates the population, re-estimates all three
   * co-occurrence graphs, and writes a beat into the decision stream. Takes a
   * couple of seconds, which is why `marketRebuilding` exists.
   */
  fireEvent: (template: MarketEventTemplate) => void;
  /** True while the world is being rebuilt, so surfaces can say so. */
  marketRebuilding: boolean;
  /** Events fired so far, newest first. Empty on a quiet world. */
  firedEvents: MarketEvent[];
  /** The month and year the world currently stands on. */
  marketClockLabel: string;
  /** Back to the world every published metric was measured under. */
  resetMarket: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /**
   * Which generation of the synthetic world this tree is rendering.
   *
   * Everything below reads the catalog through `getDataset()` keyed on this
   * counter rather than capturing the array once. Holding the reference was fine
   * while nothing could invalidate it and wrong the moment a market event can:
   * the models would move to the new catalog and the storefront would keep
   * painting the old one. Nothing bumps this yet - `invalidateWorld()` has no
   * callers - so today it stays at zero and every memo below is built once.
   */
  const [worldVersion, setWorldVersion] = useState(0);
  useEffect(() => subscribeToWorld(() => setWorldVersion((v) => v + 1)), []);

  const scenarios = React.useMemo<Scenario[]>(() => buildScenarios(), [worldVersion]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario>(() => buildScenarios()[0]);
  const [isPersonalizationOn, setIsPersonalizationOn] = useState<boolean>(true);
  const [showMLPanel, setShowMLPanel] = useState<boolean>(true);

  /**
   * The arriving context, read once.
   *
   * A presenter's laptop usually has an unmapped timezone, no referrer and no
   * campaign, and the honest reading of that is silence - which makes a poor
   * demonstration of a rung whose whole subject is what context can tell you.
   * When the real context carries nothing actionable we fall back to a worked
   * arrival and say so; `contextIsSimulated` is what the UI labels.
   */
  const [visitorContext] = useState<VisitorContext>(() => {
    const real = readVisitorContext();
    return contextIsBare(real) ? { ...SIMULATED_ARRIVAL, timezone: real.timezone ?? SIMULATED_ARRIVAL.timezone } : real;
  });
  const contextIsSimulated = React.useMemo(() => contextIsBare(readVisitorContext()), []);
  const contextReading = React.useMemo(() => readContext(visitorContext), [visitorContext]);

  const [navigationTab, setNavigationTab] = useState<NavigationTab>('experience');
  const [storefrontPage, setStorefrontPage] = useState<StorefrontPage>('home');

  // The catalog and the trained-artefact stand-ins are built once, lazily, by
  // the simulation layer. Memoising on the world version keeps that off the
  // render path while still letting an invalidation through.
  const products = React.useMemo<Product[]>(() => getDataset().products, [worldVersion]);

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

  const [userEvents, setUserEvents] = useState<UserEvent[]>(() => buildScenarios()[0].recentEvents);
  const [activeTeamOverride, setActiveTeamOverride] = useState<TeamId | null>(null);
  const [activeDeptFilter, setActiveDeptFilter] = useState<string | null>(null);
  const [activeLeagueFilter, setActiveLeagueFilter] = useState<League | null>(null);
  const [lastModelFeedback, setLastModelFeedback] = useState<string | null>(null);
  const [activeExplainedProduct, setActiveExplainedProduct] = useState<Product | null>(null);
  const [journal, setJournal] = useState<JournalBeat[]>([]);

  // Journal bookkeeping. The recorder needs three things React state cannot give
  // it: which event it has already written up, what the posterior looked like
  // BEFORE this event so the deltas are real, and a monotonic sequence number.
  const loggedEventId = useRef<string | null>(null);
  const prevIntentRef = useRef<IntentResult | null>(null);
  const beatSeq = useRef(0);

  // Switch Scenario
  const selectScenarioById = (id: ScenarioId) => {
    const found = scenarios.find((s) => s.id === id);
    if (found) {
      setSelectedScenario(found);
      setUserEvents(found.recentEvents);
      setActiveTeamOverride(null);
      setActiveDeptFilter(null);
      setActiveLeagueFilter(null);
      // A new persona is a new session, so the story starts over. Clearing the
      // cursor as well makes the next beat a fresh "session opened" read rather
      // than a delta against the previous shopper's posterior.
      setJournal([]);
      loggedEventId.current = null;
      prevIntentRef.current = null;
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

  /**
   * The profile fold, reached through a ref.
   *
   * `recordEvent` is declared above the store that consumes it - moving either
   * one would mean reordering a lot of interdependent state - so the fold is
   * called through a ref that the store fills in on the same render. The ref is
   * only ever read inside an event handler, long after it is set.
   */
  const foldEventRef = useRef<((event: UserEvent) => void) | null>(null);

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
    // Same event, folded into the persisted profile. The two paths are
    // deliberately fed from one place so they can never disagree about what the
    // shopper did.
    foldEventRef.current?.(newEv);

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

  /**
   * The persisted profile.
   *
   * Mounted alongside the event-stream intent path rather than replacing it.
   * Switching what the storefront's recommendations are computed from is a
   * behaviour change to every surface at once and belongs in its own commit;
   * this one adds the profile, the ladder and the meter without moving the
   * ground under the merchandising.
   *
   * It opens at `contextual`, not `anonymous`, because the demo has to open
   * with the model already having said something - the regional prior, the
   * campaign intent and the device skew are all available before a single
   * click.
   */
  const profileStore = useProfileStore(
    selectedScenario,
    selectedScenario.recentEvents,
    activeTeamOverride,
    visitorContext,
    'contextual'
  );

  foldEventRef.current = profileStore.recordEvent;

  /**
   * The two records joined. Memoised on all three inputs because the join walks
   * the whole delta log once per beat, and the panel re-renders on every hover.
   */
  const decisions = React.useMemo(
    () => buildDecisions(journal, profileStore.deltaLog, profileStore.profile),
    [journal, profileStore.deltaLog, profileStore.profile]
  );

  /**
   * Empty, and honestly so. Populating this means instrumenting searches,
   * filter flips, pagination and backtracks on the storefront itself, which is
   * its own piece of work. A ledger filled with plausible invented numbers
   * would read as evidence and would not be.
   */
  const effortLedger = React.useMemo<EffortLedger>(() => emptyLedger(), []);

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

  /* -------------------------------------------------------- market events -- */

  const [marketRebuilding, setMarketRebuilding] = useState(false);
  const [firedEvents, setFiredEvents] = useState<MarketEvent[]>([]);

  /**
   * A fired event waiting for its beat.
   *
   * The rebuild has to finish, and the engines have to re-run against the new
   * catalog, BEFORE the beat is written - otherwise the entry would report the
   * pre-event scores and claim they were caused by the event. So the handler
   * fires, stashes the counts here, and an effect keyed on `worldVersion` writes
   * the beat once React has re-rendered through the new world. Same ordering
   * trick the user-event recorder uses with `prevIntentRef`, for the same
   * reason.
   */
  const pendingMarket = useRef<{ event: MarketEvent; beat: MarketBeat } | null>(null);

  const fireEvent = (template: MarketEventTemplate) => {
    if (marketRebuilding) return;
    setMarketRebuilding(true);

    // Yielded to the browser first so the rebuilding state actually paints. The
    // rebuild is a couple of seconds of synchronous work on the main thread -
    // honest, because the co-order priors really are re-estimated from a fresh
    // population - and a freeze with no explanation reads as a crash.
    setTimeout(() => {
      const startedAt = performance.now();
      const event = fireMarketEvent(template);
      const after = getDataset();
      const rebuildMs = Math.round(performance.now() - startedAt);

      const touchedProducts = after.products.filter((p) => p.marketFlag?.eventId === event.id);
      const { detail } = describeEvent(event);

      pendingMarket.current = {
        event,
        beat: {
          kind: event.kind,
          headline: describeEvent(event).headline,
          detail,
          touched: touchedProducts.length,
          moved: touchedProducts.filter((p) => p.movedFrom !== undefined).length,
          lifted: touchedProducts.filter((p) => (p.marketFlag?.lift ?? 1) > 1).length,
          damped: touchedProducts.filter((p) => (p.marketFlag?.lift ?? 1) < 1).length,
          rebuildMs,
          at: clockLabel(activeClock()),
        },
      };

      /*
       * Re-bind what the shopper is holding to the rebuilt catalog.
       *
       * Product ids survive a market event on purpose, so this is a lookup
       * rather than a reconciliation - but it has to happen, because the PDP and
       * the cart hold Product OBJECTS, and those objects are the pre-event ones.
       * Without this the storefront would re-rank correctly everywhere except
       * the two places the shopper is actually looking.
       *
       * Batched with the world bump above into a single commit, so the beat
       * effect below sees a tree where every surface, the anchor and the cart
       * are all on the new world at once.
       */
      setSelectedProduct((current) => after.productById.get(current.id) ?? current);
      setCart((prev) =>
        prev.map((item) => {
          const fresh = after.productById.get(item.product.id);
          return fresh ? { ...item, product: fresh } : item;
        })
      );

      setFiredEvents((prev) => [event, ...prev]);
      setMarketRebuilding(false);
    }, 30);
  };

  const resetMarketWorld = () => {
    resetMarket();
    setFiredEvents([]);
    pendingMarket.current = null;
  };

  const marketClockLabel = React.useMemo(() => clockLabel(activeClock()), [worldVersion]);

  /* ------------------------------------------------------------- journal -- */

  // A render-time snapshot of everything a beat needs. The recorder effects fire
  // on one narrow trigger each, so they read the rest from here rather than
  // listing it as a dependency and re-firing on every unrelated change.
  const latest = useRef({
    scenario: selectedScenario,
    intent: intentPrediction,
    trace: activeDecisionTrace,
    similarity: similarityMatches,
    complement: complementMatches,
    page: storefrontPage,
    anchor: selectedProduct,
    personalizationOn: isPersonalizationOn,
  });
  latest.current = {
    scenario: selectedScenario,
    intent: intentPrediction,
    trace: activeDecisionTrace,
    similarity: similarityMatches,
    complement: complementMatches,
    page: storefrontPage,
    anchor: selectedProduct,
    personalizationOn: isPersonalizationOn,
  };

  /**
   * Writes one beat per new event.
   *
   * Timing is the whole trick here. `recordEvent` prepends to `userEvents`, which
   * invalidates the intent memo in the same render, so by the time this effect
   * runs `latest.current.intent` is the posterior AFTER the event while
   * `prevIntentRef` still holds the one from before it. That is what makes the
   * per-team deltas on each card genuine rather than reconstructed.
   */
  useEffect(() => {
    const newest = userEvents[0];
    const key = newest?.id ?? '__empty__';
    if (loggedEventId.current === key) return;

    const isSessionStart = loggedEventId.current === null;
    loggedEventId.current = key;

    const L = latest.current;
    beatSeq.current += 1;

    const beat = buildBeat({
      seq: beatSeq.current,
      kind: isSessionStart ? 'session' : 'action',
      // The seed beat summarises the whole opening read, so pinning it to one
      // replayed history event would misattribute the posterior to that event.
      event: isSessionStart ? undefined : newest,
      headline: isSessionStart
        ? `Session opened - ${L.scenario.name.split(':')[1]?.trim() || L.scenario.name}`
        : undefined,
      scenario: L.scenario,
      intent: L.intent,
      prevIntent: prevIntentRef.current,
      trace: L.trace,
      similarity: L.similarity,
      complement: L.complement,
      page: L.page,
      anchor: L.anchor,
      personalizationOn: L.personalizationOn,
    });

    prevIntentRef.current = L.intent;
    // Capped because this is a demo session, not an audit log - forty beats is
    // far more than anyone scrolls and keeps the panel's DOM bounded.
    setJournal((prev) => [beat, ...prev].slice(0, 40));
  }, [userEvents]);

  /**
   * Flipping personalization does not change a single score - the engines keep
   * running either way - but it changes everything about what reaches the page.
   * That is worth its own beat, because it is the clearest statement in the demo
   * of where the model stops and the merchandising decision begins.
   */
  const prevPersonalizationOn = useRef(isPersonalizationOn);
  useEffect(() => {
    if (prevPersonalizationOn.current === isPersonalizationOn) return;
    prevPersonalizationOn.current = isPersonalizationOn;

    const L = latest.current;
    beatSeq.current += 1;
    const beat = buildBeat({
      seq: beatSeq.current,
      kind: 'setting',
      headline: `Personalization switched ${isPersonalizationOn ? 'ON' : 'OFF'}`,
      scenario: L.scenario,
      intent: L.intent,
      prevIntent: prevIntentRef.current,
      trace: L.trace,
      similarity: L.similarity,
      complement: L.complement,
      page: L.page,
      anchor: L.anchor,
      personalizationOn: isPersonalizationOn,
    });
    setJournal((prev) => [beat, ...prev].slice(0, 40));
  }, [isPersonalizationOn]);

  /**
   * Writes the beat for a fired market event.
   *
   * Keyed on `worldVersion` rather than on the fire handler, so by the time it
   * runs the products memo, all three engine memos and the decision trace have
   * already re-run against the rebuilt world. The scores this beat reports are
   * therefore the post-event ones, which is the only version of the claim worth
   * making.
   *
   * `eventId` stays null: a market event is not a user event and has no field
   * writes to join to. The decision stream renders it from the `market` payload
   * instead - see the header note in ml/decisions.ts.
   */
  useEffect(() => {
    const pending = pendingMarket.current;
    if (!pending) return;
    pendingMarket.current = null;

    const L = latest.current;
    beatSeq.current += 1;
    const beat = buildBeat({
      seq: beatSeq.current,
      kind: 'market',
      headline: pending.beat.headline,
      scenario: L.scenario,
      intent: L.intent,
      prevIntent: prevIntentRef.current,
      trace: L.trace,
      similarity: L.similarity,
      complement: L.complement,
      page: L.page,
      anchor: L.anchor,
      personalizationOn: L.personalizationOn,
      market: pending.beat,
    });
    prevIntentRef.current = L.intent;
    setJournal((prev) => [beat, ...prev].slice(0, 40));
  }, [worldVersion]);

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
        journal,
        activeExplainedProduct,
        setActiveExplainedProduct,
        visitorProfile: profileStore.profile,
        completeness: profileStore.completeness,
        identityState: profileStore.identityState,
        promoteTo: profileStore.promoteTo,
        promotionDeltas: profileStore.promotionDeltas,
        visitorContext,
        contextReading,
        contextIsSimulated,
        deltaLog: profileStore.deltaLog,
        lastDeltas: profileStore.lastDeltas,
        decisions,
        effortLedger,
        eventDeck: EVENT_DECK,
        fireEvent,
        marketRebuilding,
        firedEvents,
        marketClockLabel,
        resetMarket: resetMarketWorld,
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
