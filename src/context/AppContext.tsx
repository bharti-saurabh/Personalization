import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import {
  Product,
  Scenario,
  ScenarioId,
  StorefrontPage,
  NavigationTab,
  ShellView,
  ModelsTab,
  JourneyTab,
  CartItem,
  UserEvent,
  DecisionTrace,
  TeamId,
  League,
  Department,
} from '../types';
import { IntentResult } from '../ml/intent';
import { SimilarityResult } from '../ml/similarity';
import { ComplementResult } from '../ml/complement';
import { JournalBeat, MarketBeat, buildBeat } from '../ml/journal';
import { buildDecisions } from '../ml/decisions';
import type { DecisionEntry } from '../ml/decisions';
import { buildLedger, saving } from '../ml/effort';
import type { EffortEntry, EffortLedger } from '../ml/effort';
import { interpretQuery, searchCatalog } from '../ml/query';
import type { SearchResult } from '../ml/query';
import type { RankingExplanation } from '../ml/ranking';
import { findAnchorProduct } from '../data/scenarios';
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
  SURFACE_POLICIES,
  applySuppression,
  inertContext,
  suppressionContext,
  suppressionEffort,
  runFacetModel,
} from '../ml/engine';
import type {
  CompletenessReport,
  ContextReading,
  FacetModel,
  IdentityState,
  ProfileDelta,
  SuppressionContext,
  SuppressionResult,
  VisitorContext,
  VisitorProfile,
} from '../ml/engine';
import { useProfileStore } from './profileStore';
import { clearAllProfiles } from './profileStore';
import {
  DEFAULT_PRESET,
  PERSONA_PRESETS,
  PRESET_BY_ID,
  matchesPreset,
  scenarioForPersona,
} from '../state/personas';
import type { PersonaDimensions, PersonaPreset } from '../state/personas';
import { buildVisitorModel } from '../state/visitorModel';
import { buildCaptureLedger, captureFromEvent } from '../state/capture';
import type { CaptureLedger, ClientSignals, EventCapture } from '../state/capture';
import type { VisitorModel } from '../state/visitorModel';
import { SIMULATED_ARRIVAL, contextIsBare, readClientSignals, readVisitorContext } from './visitorContext';

interface AppContextType {
  // Scenario & Settings State
  scenarios: Scenario[];
  selectedScenario: Scenario;
  selectScenarioById: (id: ScenarioId) => void;
  isPersonalizationOn: boolean;
  togglePersonalization: () => void;
  showMLPanel: boolean;
  toggleMLPanel: () => void;

  /* ------------------------------------------------------------ personas -- */

  /** The sixteen named points in the dimension space. */
  personaPresets: PersonaPreset[];
  /** Which one the operator last picked. Stays set after a slider moves. */
  personaPresetId: string;
  /** Where the shopper actually sits now, preset or not. */
  personaDimensions: PersonaDimensions;
  /** True once the sliders have been moved off the named point. */
  isCustomPersona: boolean;
  /** Snaps the dimensions back to a preset and re-seeds the session. */
  selectPersona: (id: string) => void;
  /** Moves one dimension. Re-seeds shortly after the operator stops dragging. */
  setPersonaDimension: (key: keyof PersonaDimensions, value: number) => void;

  /* ------------------------------------------------------- visitor model -- */

  /**
   * What the engine believes, in the shape the rail renders.
   *
   * Derived from `visitorProfile` on every fold, never written to directly. A
   * module on the stage names the slot that fed it and the rail looks it up
   * here, which is the whole mechanism behind the Explain overlay.
   */
  visitorModel: VisitorModel;

  /* --------------------------------------------------------------- shell -- */

  shellView: ShellView;
  setShellView: (view: ShellView) => void;
  modelsTab: ModelsTab;
  setModelsTab: (tab: ModelsTab) => void;
  journeyTab: JourneyTab;
  setJourneyTab: (tab: JourneyTab) => void;
  /** The engine rail. Collapses to a slim edge rather than disappearing. */
  railOpen: boolean;
  toggleRail: () => void;
  /**
   * The one circumstance under which model information is allowed over the
   * storefront: a deliberate reveal, off by default, driven from the rail.
   */
  explainOn: boolean;
  toggleExplain: () => void;
  /**
   * Which stage module the operator is pointing at, or null.
   *
   * Shared rather than owned by either side, because the pointing goes both
   * ways: clicking a marker on the shop highlights the rail row, and clicking
   * the rail row highlights the marker. One piece of state, so the two can never
   * both claim to be lit.
   */
  explainFocus: string | null;
  setExplainFocus: (id: string | null) => void;

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
  /** What survived the gate on the similar-items rail, in rank order. */
  similarityMatches: SimilarityResult[];
  /** What survived the gate on the complete-the-look rail, in rank order. */
  complementMatches: ComplementResult[];

  // The refusal half of the same decision.
  /** The facts the gate reads, folded once. Inert when personalization is off. */
  suppressionCtx: SuppressionContext;
  /** What the gate did on the surfaces this provider owns. */
  similarityGate: SuppressionResult;
  complementGate: SuppressionResult;
  /** Every gate that ran on the page the shopper is currently standing on. */
  suppressionResults: SuppressionResult[];
  /**
   * How a page-owned surface tells the provider what its gate did.
   *
   * The cart is the only caller. Its gate cannot live here because its anchor is
   * the basket, and the provider would then be recomputing a co-order sweep for
   * a page that is usually closed.
   */
  reportSuppression: (result: SuppressionResult | null, slot?: string) => void;
  /** Records a completed order, so the ownership rule has something to read. */
  recordPurchase: (items: { productId: string; gift?: boolean }[]) => void;
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
  /** Everything the browser answered when asked, read once at arrival. */
  clientSignals: ClientSignals;
  /**
   * Every field held on this visitor, with how it was obtained and what it
   * bought. The arrival half of "what do you know about me".
   */
  captureLedger: CaptureLedger;
  /** What each event since arrival added to the record. Newest first. */
  eventCaptures: EventCapture[];
  /** Which filter this shopper reaches for, and which values inside it. */
  facetModel: FacetModel;

  /**
   * Puts the whole demo back to the state a first-time viewer should see:
   * opening persona, empty cart, home page, no stored profile, fresh market.
   */
  resetDemo: () => void;
  /**
   * Increments on every reset. Components holding local state that a reset
   * should clear - an open tab, a scrubbed timeline - watch this rather than
   * being handed a setter each.
   */
  resetNonce: number;

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
  /**
   * How a surface reports what a personalized decision saved, or cost.
   *
   * Takes null so a caller can pass `rankMove(...)` straight through - a
   * decision that moved nothing returns null and should not become a row.
   * Entries are deduped by id, so calling this from a render effect is safe.
   */
  recordEffort: (entry: EffortEntry | null) => void;

  /* -------------------------------------------------------------- search -- */

  /**
   * The live search, or null when the shopper is browsing rather than searching.
   *
   * Held in context rather than in the header because the search box and the
   * results page are two components and they must never disagree about what was
   * asked. The header writes it; the listing page reads it as its result pool.
   */
  searchResult: SearchResult | null;
  /** Interprets, retrieves, records the event and lands on the results page. */
  runSearch: (raw: string) => void;
  clearSearch: () => void;

  /**
   * The most recent Recommended-sort explanation, published by whichever
   * surface last ran it. Read-only from the panel's point of view - an
   * explanation that can change an outcome is not an explanation.
   */
  lastRanking: RankingExplanation | null;
  publishRanking: (explanation: RankingExplanation) => void;

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

  /**
   * The persona, held as a preset id plus a live point in the dimension space.
   *
   * Both, not one. The preset id survives a slider move so the rail can still
   * say what the operator started from, and the dimensions are the truth about
   * what the shopper is now. `isCustomPersona` is the difference between them.
   */
  const [personaPresetId, setPersonaPresetId] = useState<string>(DEFAULT_PRESET.id);
  const [personaDimensions, setPersonaDimensions] = useState<PersonaDimensions>(DEFAULT_PRESET.dimensions);
  const preset = PRESET_BY_ID[personaPresetId] ?? DEFAULT_PRESET;

  /**
   * The scenario the current persona stands for.
   *
   * Recomputed whenever a slider moves, which is what makes the space feel
   * continuous rather than like sixteen buttons wearing a costume. It is cheap:
   * synthesising a dozen events and resolving three anchor products.
   */
  const selectedScenario = React.useMemo<Scenario>(
    () => scenarioForPersona(preset, personaDimensions),
    [preset, personaDimensions, worldVersion]
  );

  /** Every preset as a scenario, for surfaces that want to list them. */
  const scenarios = React.useMemo<Scenario[]>(
    () => PERSONA_PRESETS.map((x) => scenarioForPersona(x, x.dimensions)),
    [worldVersion]
  );

  const isCustomPersona = !matchesPreset(personaDimensions, preset);

  const [isPersonalizationOn, setIsPersonalizationOn] = useState<boolean>(true);
  const [showMLPanel, setShowMLPanel] = useState<boolean>(true);
  const [railOpen, setRailOpen] = useState<boolean>(true);
  const [explainOn, setExplainOn] = useState<boolean>(false);
  const [explainFocus, setExplainFocus] = useState<string | null>(null);

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

  /**
   * The rest of what the browser will answer, read once at arrival.
   *
   * Once, deliberately. Re-reading on every render would let a row change while
   * nobody did anything, and a capture ledger whose values drift is a capture
   * ledger nobody reads twice.
   */
  const [clientSignals] = useState<ClientSignals>(() => readClientSignals());

  const [shellView, setShellView] = useState<ShellView>('storefront');
  const [modelsTab, setModelsTab] = useState<ModelsTab>('intelligence');
  // Opens on the arrival ledger rather than the timeline: the first question an
  // audience asks is what the store knew before they did anything, and the
  // session timeline only makes sense once that has been answered.
  const [journeyTab, setJourneyTab] = useState<JourneyTab>('arrival');
  const [storefrontPage, setStorefrontPage] = useState<StorefrontPage>('home');

  /**
   * The old flat tab, still reachable, now derived rather than stored.
   *
   * Two pieces of state that both claim to say which screen is open will drift,
   * and the drift shows up as a header highlighting one thing while the stage
   * renders another. So the shell view is the state and `navigationTab` is a
   * reading of it; `setNavigationTab` writes through to the shell.
   */
  const navigationTab: NavigationTab =
    shellView === 'storefront'
      ? 'experience'
      : shellView === 'partnership'
        ? 'straive_contribution'
        : shellView === 'race'
        ? 'comparison'
        : shellView === 'architecture'
          ? 'architecture'
          : shellView === 'journey'
            ? journeyTab === 'lifecycle'
              ? 'lifecycle'
              : 'journey'
            : modelsTab === 'evidence'
              ? 'model_evidence'
              : modelsTab === 'pipeline'
                ? 'pipeline'
                : modelsTab === 'lab'
                  ? 'lab'
                  : modelsTab === 'registry'
                    ? 'registry'
                    : 'model_intelligence';

  const setNavigationTab = React.useCallback((tab: NavigationTab) => {
    switch (tab) {
      case 'experience':
        setShellView('storefront');
        return;
      case 'comparison':
        setShellView('race');
        return;
      case 'architecture':
        setShellView('architecture');
        return;
      case 'straive_contribution':
        setShellView('partnership');
        return;
      case 'journey':
        setShellView('journey');
        setJourneyTab('timeline');
        return;
      case 'lifecycle':
        setShellView('journey');
        setJourneyTab('lifecycle');
        return;
      default: {
        const map: Record<string, ModelsTab> = {
          model_intelligence: 'intelligence',
          model_evidence: 'evidence',
          pipeline: 'pipeline',
          lab: 'lab',
          registry: 'registry',
        };
        setShellView('models');
        setModelsTab(map[tab] ?? 'intelligence');
      }
    }
  }, []);

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

  // Seeded from the opening persona rather than from a hardcoded scenario, so
  // the event stream and the profile fold start from the same history.
  const [userEvents, setUserEvents] = useState<UserEvent[]>(
    () => scenarioForPersona(DEFAULT_PRESET, DEFAULT_PRESET.dimensions).recentEvents
  );
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

  /**
   * Everything a change of shopper has to forget.
   *
   * Pulled out of the persona switch because a slider move is also a change of
   * shopper - a smaller one, but the ledger, the journal and the search do not
   * belong to the person who existed before it any more than they belong to the
   * previous preset. One function so the two paths cannot diverge.
   */
  const resetSessionFor = (next: PersonaPreset, dims: PersonaDimensions) => {
    setUserEvents(scenarioForPersona(next, dims).recentEvents);
    setActiveTeamOverride(null);
    setActiveDeptFilter(null);
    setActiveLeagueFilter(null);
    // A query belongs to the shopper who typed it. Carrying it across a
    // persona switch would show the new shopper a results page they never
    // asked for, ranked against a profile that is no longer theirs.
    setSearchResult(null);
    pendingSearch.current = null;
    setLastRanking(null);
    // A new persona is a new session, so the story starts over. Clearing the
    // cursor as well makes the next beat a fresh "session opened" read rather
    // than a delta against the previous shopper's posterior.
    setJournal([]);
    loggedEventId.current = null;
    prevIntentRef.current = null;
    // A new persona is a new session, so the effort account starts at zero
    // too. Carrying the previous shopper's savings forward would make the
    // ledger a running total across people, which it is not.
    resetEffort();
    // Anchor on a product the persona would plausibly have been looking at,
    // resolved by predicate rather than by id - catalog ids move with the
    // generator seed.
    const anchorDept = dims.categoryBias > 0.5 ? 'Collectibles' : 'Jerseys';
    setSelectedProduct(
      findAnchorProduct({ team: next.teams[0] ?? 'Eagles', department: anchorDept, player: next.player }) ??
        findAnchorProduct({ team: next.teams[0] ?? 'Eagles' }) ??
        openingProduct
    );
  };

  /**
   * The identity rung a freshly-picked persona should land on.
   *
   * Applied in an effect rather than here because the promotion has to replay
   * against a profile that has already been rebuilt for the new visitor, and
   * that rebuild happens inside the profile store on the next render.
   */
  const pendingIdentity = useRef<IdentityState | null>(null);

  const selectPersona = (id: string) => {
    const next = PRESET_BY_ID[id];
    if (!next) return;
    setPersonaPresetId(id);
    setPersonaDimensions(next.dimensions);
    pendingIdentity.current = next.identity;
    resetSessionFor(next, next.dimensions);
  };

  /**
   * Moving one slider.
   *
   * The dimension is written straight through so the control stays responsive,
   * and the expensive half - re-synthesising the history and re-folding the
   * profile - is deferred to a short timer that restarts on every move. The
   * operator therefore sees the storefront settle when they let go rather than
   * thrash while they drag.
   */
  const reseedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPersonaDimension = (key: keyof PersonaDimensions, value: number) => {
    setPersonaDimensions((prev) => {
      const next = { ...prev, [key]: value };
      if (reseedTimer.current) clearTimeout(reseedTimer.current);
      reseedTimer.current = setTimeout(() => {
        resetSessionFor(preset, next);
        reseedRef.current?.();
      }, 240);
      return next;
    });
  };

  /** Filled by the profile store below, for the same reason `foldEventRef` is. */
  const reseedRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    if (reseedTimer.current) clearTimeout(reseedTimer.current);
  }, []);

  /** Kept for the surfaces that still address a shopper by scenario id. */
  const selectScenarioById = (id: ScenarioId) => selectPersona(id as string);

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
    'contextual',
    // Only so a returning member's seeded order history resolves onto real SKUs.
    // Held in a ref inside the store, so a market rebuild does not re-seed.
    products
  );

  foldEventRef.current = profileStore.recordEvent;
  reseedRef.current = profileStore.reset;

  /**
   * Lands a freshly-picked persona on its natural identity rung.
   *
   * Runs after the store has rebuilt for the new visitor id, so the promotion
   * replays against the right profile. It fires once per pick: the ref is
   * cleared on the way through, and `promoteTo` is a no-op when the rung is
   * already correct.
   */
  useEffect(() => {
    const wanted = pendingIdentity.current;
    if (!wanted) return;
    pendingIdentity.current = null;
    profileStore.promoteTo(wanted);
  }, [profileStore.profile.visitorId, profileStore.promoteTo]);

  /**
   * The visitor model: the profile in the shape the rail renders.
   *
   * Threaded through a ref so each build can diff against the last one and
   * report movement. The ref is written during render rather than in an effect
   * because the model is derived, not owned - by the time an effect ran, a
   * consumer would already have painted the arrows against a stale baseline.
   */
  /**
   * Which control this shopper reaches for.
   *
   * Folded from the same event stream as the profile but over a different
   * question, and kept out of the profile on purpose: the profile is what the
   * shopper wants, this is how they go looking for it, and the second has to be
   * allowed to disagree with the first. The live catalog is passed so a value
   * that no longer exists in stock cannot be offered.
   */
  const facetModel = React.useMemo(
    () => runFacetModel(userEvents, profileStore.profile, products),
    [userEvents, profileStore.profile, products]
  );

  const previousModel = useRef<VisitorModel | null>(null);
  const visitorModel = React.useMemo(() => {
    const built = buildVisitorModel(
      profileStore.profile,
      profileStore.completeness,
      personaDimensions,
      personaPresetId,
      facetModel,
      previousModel.current
    );
    previousModel.current = built;
    return built;
  }, [profileStore.profile, profileStore.completeness, personaDimensions, personaPresetId, facetModel]);

  /**
   * The capture ledger: what the store holds on this visitor and why.
   *
   * Rebuilt when the rung changes because the rung is what decides which rows
   * are readable and which are withheld, and that transition is the point of
   * the panel: promoting a shopper turns three greyed rows into live ones on
   * screen, which is a better argument for the ladder than any diagram.
   */
  const captureLedger = React.useMemo(
    () =>
      buildCaptureLedger({
        visitorId: profileStore.profile.visitorId,
        context: visitorContext,
        client: clientSignals,
        rung: profileStore.identityState,
        channel: contextReading.channel,
        campaignReads: contextReading.campaignReads,
        contextIsSimulated,
      }),
    [
      profileStore.profile.visitorId,
      profileStore.identityState,
      visitorContext,
      clientSignals,
      contextReading,
      contextIsSimulated,
    ]
  );

  /**
   * The progressive half. One entry per event, naming the fields that action
   * added rather than restating the action.
   *
   * Positions count from the oldest event, so the number matches the beat
   * numbering in the journal instead of counting down as the stream grows.
   */
  const eventCaptures = React.useMemo<EventCapture[]>(
    () => userEvents.map((e, i) => captureFromEvent(e, userEvents.length - i)),
    [userEvents]
  );

  /**
   * The two records joined. Memoised on all three inputs because the join walks
   * the whole delta log once per beat, and the panel re-renders on every hover.
   */
  const decisions = React.useMemo(
    () => buildDecisions(journal, profileStore.deltaLog, profileStore.profile),
    [journal, profileStore.deltaLog, profileStore.profile]
  );

  /**
   * The session's effort ledger, written by the storefront's own surfaces.
   *
   * IDs ARE THE DEDUPE KEY, and that is what makes this safe to call from a
   * render effect. A surface emits the same id for the same decision - the home
   * category rail on beat 4 is always `home:dept-rail:4` - so a re-render that
   * recomputes the same ordering re-offers an entry that is already in the
   * ledger and the recorder drops it. Without that, every hover on the panel
   * would inflate the totals, and a counter that grows when nobody is shopping
   * is a counter nobody will believe twice.
   */
  const [effortEntries, setEffortEntries] = useState<EffortEntry[]>([]);
  const effortIds = useRef<Set<string>>(new Set());

  const recordEffort = React.useCallback((entry: EffortEntry | null) => {
    if (!entry || effortIds.current.has(entry.id)) return;
    effortIds.current.add(entry.id);
    setEffortEntries((prev) => [...prev, entry]);
  }, []);

  const resetEffort = React.useCallback(() => {
    effortIds.current = new Set();
    setEffortEntries([]);
  }, []);

  const effortLedger = React.useMemo<EffortLedger>(() => buildLedger(effortEntries), [effortEntries]);

  /* --------------------------------------------------------------- search -- */

  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  /**
   * The search waiting to be written into the decision journal.
   *
   * The beat recorder is keyed on the newest user event, and `runSearch` emits
   * one. Handing the search across through a ref rather than through state
   * means the beat is built in the same pass as the event that caused it, with
   * no second render in between where a beat could be written without its query.
   */
  const pendingSearch = useRef<SearchResult | null>(null);

  const [lastRanking, setLastRanking] = useState<RankingExplanation | null>(null);
  const publishRanking = React.useCallback((explanation: RankingExplanation) => {
    setLastRanking((prev) => {
      // Cheap identity check so a re-render with the same order does not
      // restart every animation in the panel.
      if (
        prev &&
        prev.active === explanation.active &&
        prev.considered === explanation.considered &&
        prev.items.length === explanation.items.length &&
        prev.items.every((it, i) => it.product.id === explanation.items[i]?.product.id)
      ) {
        return prev;
      }
      return explanation;
    });
  }, []);

  const clearSearch = React.useCallback(() => {
    setSearchResult(null);
    pendingSearch.current = null;
  }, []);

  /**
   * Runs a typed query and lands on the results page.
   *
   * WHY THE EVENT CARRIES THE INTERPRETATION AND NOT THE QUERY STRING. The
   * profile fold reads `team`, `department` and `league` off an event; a raw
   * string moves nothing. Search is the one surface where the shopper states
   * their intent in words, so throwing that away at the profile boundary would
   * make the most explicit signal in the session the least useful one.
   *
   * Only nodes that clear a confidence floor are taught to the profile. A
   * league inferred from a club inferred from a surname sits at 0.25, and
   * writing that into the fold with the same weight as a click would teach the
   * profile a chain of guesses as though it were an observation.
   */
  const runSearch = (raw: string) => {
    const query = raw.trim();
    if (!query) return;

    const interpretation = interpretQuery(query);
    const result = searchCatalog(products, interpretation, {
      profile: profileStore.profile,
      personalized: isPersonalizationOn,
    });

    setSearchResult(result);
    pendingSearch.current = result;

    // A search replaces the browse context rather than narrowing it: carrying a
    // stale team filter into a query for a different club would silently return
    // nothing and blame the query for it.
    setActiveTeamOverride(null);
    setActiveDeptFilter(null);
    setActiveLeagueFilter(null);
    setNavigationTab('experience');
    setStorefrontPage('plp');

    const TEACH_FLOOR = 0.6;
    const strongest = (kind: string) =>
      result.interpretation.nodes
        .filter((n) => n.kind === kind && n.confidence >= TEACH_FLOOR)
        .sort((a, b) => b.confidence - a.confidence)[0]?.value;

    // The rescue is a dead end that did not happen. It is the only search entry
    // the ledger takes, and it is taken only when the un-personalized store
    // would genuinely have shown an empty page - not on every search.
    if (isPersonalizationOn && result.rescue) {
      recordEffort(
        saving({
          id: `search:rescue:${query.toLowerCase()}`,
          eventId: null,
          page: 'plp',
          surface: 'Search results',
          kind: 'dead_end',
          count: 1,
          label: `Zero-result page avoided for "${query}"`,
          detail:
            result.rescue.kind === 'profile'
              ? `nothing in the query mapped onto the catalog; ${result.matched.length} products ranked by profile affinity instead`
              : `${result.rescue.steps.length} constraint(s) relaxed to reach ${result.matched.length} products`,
        })
      );
    }

    recordEvent(`Searched: "${query}"`, {
      pageType: 'Search',
      team: strongest('team') as TeamId | undefined,
      department: strongest('department') as Department | undefined,
      league: strongest('league') as League | undefined,
      filterApplied: result.constraints.map((c) => c.label).join('; ') || undefined,
    });
  };

  /* ---------------------------------------------------------- suppression -- */

  /**
   * The profile, folded down to the handful of facts the gate actually reads.
   *
   * This exists to be a DEPENDENCY, not a convenience. Four surfaces need to
   * know what to withhold, and if each of them depended on the whole profile
   * object then every fold - including one that only moved a posterior by a
   * tenth of a point - would recompute four gates. This memo changes when a
   * suppression decision could change, and at no other time.
   *
   * With personalization off it is inert rather than absent. The control arm of
   * a comparison has to be a store with no gate, not a store with a gate that
   * happens to have nothing to say.
   */
  const suppressionCtx = React.useMemo<SuppressionContext>(
    () =>
      isPersonalizationOn
        ? suppressionContext(profileStore.profile, { personalized: true })
        : inertContext(),
    [profileStore.profile, isPersonalizationOn]
  );

  /**
   * Retrieval, deliberately over-fetching.
   *
   * These used to ask for exactly the four items the rail shows. A gate placed
   * after a retrieval that returns exactly enough has only one move available to
   * it - leave a hole - so every refusal would read on screen as a broken rail
   * rather than as a decision. Asking for twice the slots means the gate can put
   * the next-best thing in the gap, and the empty slots that remain are the ones
   * where nothing behind the refusal was good enough either. Those are worth
   * showing.
   *
   * Deps are unchanged from before the gate: the expensive part is the co-order
   * sweep, and it must not re-run because a profile field moved.
   */
  const similarityPool = React.useMemo(
    () => runSimilarityEngine(selectedProduct, products, 8),
    [selectedProduct, products]
  );

  const complementPool = React.useMemo(
    () => runComplementEngine(selectedProduct, products, 8),
    [selectedProduct, products]
  );

  const similarityGate = React.useMemo(
    () =>
      applySuppression(
        similarityPool.map((m) => ({
          product: m.product,
          confidence: m.totalScore,
          source: 'Similarity',
        })),
        suppressionCtx,
        SURFACE_POLICIES.pdp_similar,
        // The shopper chose this product. If it is a rival's, they have
        // overridden the club read for this page and the rivalry rule stands
        // down - see the note above `applySuppression`.
        { anchor: selectedProduct }
      ),
    [similarityPool, suppressionCtx, selectedProduct]
  );

  const complementGate = React.useMemo(
    () =>
      applySuppression(
        complementPool.map((m) => ({
          product: m.product,
          confidence: m.complementScore,
          source: 'Complement',
        })),
        suppressionCtx,
        SURFACE_POLICIES.pdp_complement,
        { anchor: selectedProduct }
      ),
    [complementPool, suppressionCtx, selectedProduct]
  );

  // Back to the engines' own result objects, in the order the gate left them.
  // The gate deals in products and confidences because it has to work the same
  // way for every surface; the rails need the score breakdowns back, and a
  // lookup is the cheapest way to return them without teaching the gate about
  // four different result shapes.
  const similarityMatches = React.useMemo(() => {
    const by = new Map(similarityPool.map((m) => [m.product.id, m]));
    return similarityGate.kept.map((c) => by.get(c.product.id)!).filter(Boolean);
  }, [similarityPool, similarityGate]);

  const complementMatches = React.useMemo(() => {
    const by = new Map(complementPool.map((m) => [m.product.id, m]));
    return complementGate.kept.map((c) => by.get(c.product.id)!).filter(Boolean);
  }, [complementPool, complementGate]);

  /**
   * Every gate that ran this render, for the beat and the panel.
   *
   * The home and cart gates are not here: each runs on the page that owns it,
   * because their anchors are that page's own business - the basket, the hero
   * slot - and this provider has no reason to recompute either for a page that
   * is not open. They register through `reportSuppression` below.
   */
  const [pageGates, setPageGates] = useState<Record<string, SuppressionResult>>({});
  const reportSuppression = React.useCallback((r: SuppressionResult | null, slot?: string) => {
    // A page can own more than one gate - the home page runs the hero and the
    // trending rail - so registrations are keyed rather than overwriting each
    // other. The key defaults to the policy id, which is unique per surface;
    // the explicit `slot` exists for a caller that unregisters after its policy
    // is already gone from its own scope.
    const key = slot ?? r?.policy.id;
    if (!key) return;
    setPageGates((prev) => {
      // Identity check only. Each caller's memo returns a stable object until
      // its inputs change, so this is a cheap way to avoid a set-state loop
      // from a component that reports on every render.
      if (prev[key] === r) return prev;
      if (!r) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: r };
    });
  }, []);

  const suppressionResults = React.useMemo<SuppressionResult[]>(() => {
    if (storefrontPage === 'pdp') return [similarityGate, complementGate];
    return Object.values(pageGates).filter((g) => g.policy.page === storefrontPage);
  }, [storefrontPage, similarityGate, complementGate, pageGates]);

  /**
   * Refusal, written to the ledger.
   *
   * A withheld impression is the one saving in this demo that leaves nothing on
   * screen to point at, which is exactly why it has to be counted: the shopper's
   * evidence that the store did something for them is an absence. The entry ids
   * are keyed on the anchor and the surface, so a re-render re-offers an entry
   * the recorder already holds and it is dropped - see the note on `recordEffort`.
   */
  useEffect(() => {
    if (!isPersonalizationOn) return;
    const eventId = userEvents[0]?.id ?? null;
    for (const r of suppressionResults) {
      recordEffort(
        suppressionEffort(r, {
          // Keyed on the surface and its anchor, so a re-render re-offers an id
          // the recorder already holds. The hero has no anchor product - its
          // subject is the shopper - so it keys on the event instead.
          id: `${r.policy.page}:${r.policy.id}:${r.policy.slots > 1 ? selectedProduct.id : eventId ?? 'open'}`,
          eventId,
        })
      );
    }
  }, [isPersonalizationOn, suppressionResults, selectedProduct, userEvents, recordEffort]);

  /**
   * Fatigue, counted once per thing the shopper did.
   *
   * Not once per render. A render writes the profile, a profile write re-runs
   * the gate, and a re-run gate can return a different slate - which renders
   * again. Batching on the event id breaks that loop at the only point where
   * breaking it is also correct: an impression is one shopper looking at one
   * page once, however many times React decides to paint it.
   */
  const slateRef = useRef<string[]>([]);
  slateRef.current = suppressionResults.flatMap((r) => r.kept.map((c) => c.product.id));
  const impressedEventRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isPersonalizationOn) return;
    const key = userEvents[0]?.id ?? 'session-open';
    if (impressedEventRef.current === key) return;
    impressedEventRef.current = key;
    profileStore.noteImpressions(slateRef.current);
  }, [isPersonalizationOn, userEvents, profileStore.noteImpressions]);

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

  /* --------------------------------------------------------------- reset -- */

  const [resetNonce, setResetNonce] = useState(0);

  /**
   * Puts the demo back to the state a first-time viewer should see.
   *
   * `resetSessionFor` already existed and does the shopper half: history,
   * filters, search, journal, effort. It was never enough to show the demo
   * twice, because four things outlive a change of shopper and all four are
   * visible on the opening screen - the cart, the market world, whichever page
   * the last viewer left the storefront on, and the profile persisted in
   * localStorage under the visitor id.
   *
   * The persisted profile is the one that actually matters. Without dropping it
   * the second run opens with a visitor who already believes things, and the
   * arrival story - the whole first act - has nothing to show. `clearAllProfiles`
   * has been sitting in the profile store waiting for exactly this caller.
   *
   * Order is deliberate: clear storage first, then re-fold, so the store cannot
   * rehydrate from the profile it is about to replace.
   */
  const resetDemo = () => {
    clearAllProfiles();

    setPersonaPresetId(DEFAULT_PRESET.id);
    setPersonaDimensions(DEFAULT_PRESET.dimensions);
    pendingIdentity.current = DEFAULT_PRESET.identity;
    resetSessionFor(DEFAULT_PRESET, DEFAULT_PRESET.dimensions);
    profileStore.reset();

    // The storefront's own state. A cart carried over from the last viewer is
    // the single most obvious tell that the demo has been run before.
    setCart([]);
    setStorefrontPage('home');
    setShellView('storefront');
    setJourneyTab('arrival');
    setSelectedProduct(openingProduct);
    setActiveExplainedProduct(null);
    setExplainOn(false);
    setExplainFocus(null);
    setIsPersonalizationOn(true);
    setRailOpen(true);
    setLastModelFeedback(null);

    // The world clock and any market event fired into it.
    resetMarketWorld();

    // Local state living inside components that no setter here can reach.
    setResetNonce((n) => n + 1);
  };

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
    suppression: suppressionResults,
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
    suppression: suppressionResults,
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
      suppression: L.suppression,
      page: L.page,
      anchor: L.anchor,
      personalizationOn: L.personalizationOn,
      // Consumed, not read: a search explains exactly one beat, and leaving it
      // set would attach the query to whatever the shopper clicked next.
      search: pendingSearch.current ?? undefined,
    });
    pendingSearch.current = null;

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
      suppression: L.suppression,
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
      suppression: L.suppression,
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
        personaPresets: PERSONA_PRESETS,
        personaPresetId,
        personaDimensions,
        isCustomPersona,
        selectPersona,
        setPersonaDimension,
        visitorModel,
        shellView,
        setShellView,
        modelsTab,
        setModelsTab,
        journeyTab,
        setJourneyTab,
        railOpen,
        toggleRail: () => setRailOpen((v) => !v),
        explainOn,
        toggleExplain: () =>
          setExplainOn((v) => {
            // Turning the overlay off drops the focus with it. A highlight that
            // survives its own overlay would reappear, still lit, the next time
            // someone opened it.
            if (v) setExplainFocus(null);
            return !v;
          }),
        explainFocus,
        setExplainFocus,
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
        suppressionCtx,
        similarityGate,
        complementGate,
        suppressionResults,
        reportSuppression,
        recordPurchase: profileStore.recordPurchase,
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
        clientSignals,
        captureLedger,
        eventCaptures,
        facetModel,
        resetDemo,
        resetNonce,
        deltaLog: profileStore.deltaLog,
        lastDeltas: profileStore.lastDeltas,
        decisions,
        effortLedger,
        recordEffort,
        searchResult,
        runSearch,
        clearSearch,
        lastRanking,
        publishRanking,
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
