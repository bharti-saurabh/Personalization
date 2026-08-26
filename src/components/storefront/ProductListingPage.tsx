/**
 * Category page, modelled on how a large licensed-sports retailer actually
 * merchandises a team shop: a team hero band, a breadcrumb, a left facet rail
 * of multi-select checkbox filters with live result counts, applied-filter
 * chips, a result count and a sort control, then a dense product grid with
 * incremental loading.
 *
 * The facet counts are genuinely faceted. The count shown next to a value is
 * the number of products that would remain if you ticked it, which means every
 * facet is counted with all OTHER facets applied but its own selections
 * ignored. That is the behaviour shoppers are used to, and it is the reason a
 * count never reads zero for an option you can actually pick.
 *
 * The personalization layer sits on top of that, and only on top: when it is
 * on, the facet groups are ordered by predicted intent, team and department
 * values carry their predicted probability, and the default "Recommended" sort
 * is intent-weighted. Turn it off and this becomes an ordinary popularity-sorted
 * category page - which is the comparison the demo exists to make.
 *
 * THIS PAGE IS ALSO THE SEARCH RESULTS PAGE. A typed query lands here rather
 * than jumping straight to a product, because the interesting thing about a
 * query is not which product it finds - it is what the system decided the words
 * meant, what it did when the catalog could not satisfy them, and what it asks
 * the shopper next. All three of those are on this page, and the third one is
 * the facet rail below.
 *
 * "FEATURED" IS NOW "RECOMMENDED", and the arithmetic behind it moved out to
 * ml/ranking.ts unchanged. Featured was the wrong word: on a real storefront it
 * names a shelf a merchandiser ordered by hand, and this one was a model output
 * with no explanation attached to it. Same order, named honestly, with the
 * scorer, its weights and its displaced positions now published to the panel.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductCard } from './ProductCard';
import { rankMove, saving } from '../../ml/effort';
import { rankRecommended, RECOMMENDED_FORMULA } from '../../ml/ranking';
import { SearchUnderstanding } from './SearchUnderstanding';
import { CONFIDENCE_THRESHOLD } from '../../ml/intent';
import { Department, League, Product, TeamId } from '../../types';
import { TEAM_BY_ID } from '../../sim/taxonomy';
import { TeamCrest, DeptGlyph } from '../brand/Identity';
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  X,
  SlidersHorizontal,
  Home,
  Check,
  Info,
} from 'lucide-react';

/** Effective shelf price - the sale price when there is one. */
const effPrice = (p: Product) => p.salePrice ?? p.price;

const PRICE_BANDS: { id: string; label: string; test: (p: Product) => boolean }[] = [
  { id: 'u25', label: 'Under $25', test: (p) => effPrice(p) < 25 },
  { id: '25-50', label: '$25 - $50', test: (p) => effPrice(p) >= 25 && effPrice(p) < 50 },
  { id: '50-100', label: '$50 - $100', test: (p) => effPrice(p) >= 50 && effPrice(p) < 100 },
  { id: '100-150', label: '$100 - $150', test: (p) => effPrice(p) >= 100 && effPrice(p) < 150 },
  { id: '150+', label: '$150 & Above', test: (p) => effPrice(p) >= 150 },
];

type FacetKey = 'league' | 'department' | 'team' | 'player' | 'brand' | 'gender' | 'size' | 'colorway' | 'price';

type Selections = Record<FacetKey, string[]>;

const EMPTY: Selections = {
  league: [],
  department: [],
  team: [],
  player: [],
  brand: [],
  gender: [],
  size: [],
  colorway: [],
  price: [],
};

/**
 * One facet definition. `values` returns every value a product belongs to,
 * which is a list rather than a scalar because a garment sits in several size
 * buckets at once.
 */
interface FacetDef {
  key: FacetKey;
  label: string;
  values: (p: Product) => string[];
  /** Fixed display order; anything else falls back to descending count. */
  order?: string[];
  initiallyOpen?: boolean;
}

const FACETS: FacetDef[] = [
  { key: 'league', label: 'League', values: (p) => [p.league], order: ['NFL', 'NBA', 'MLB'], initiallyOpen: true },
  { key: 'department', label: 'Category', values: (p) => [p.department], initiallyOpen: true },
  { key: 'team', label: 'Team', values: (p) => [p.team], initiallyOpen: true },
  { key: 'player', label: 'Player', values: (p) => (p.player ? [p.player] : []), initiallyOpen: true },
  { key: 'brand', label: 'Brand', values: (p) => [p.brand] },
  { key: 'gender', label: 'Gender', values: (p) => [p.gender], order: ['Men', 'Women', 'Unisex', 'Kids'] },
  { key: 'size', label: 'Size', values: (p) => p.sizes ?? [] },
  { key: 'colorway', label: 'Color', values: (p) => (p.colorway ? [p.colorway] : []) },
  {
    key: 'price',
    label: 'Price',
    values: (p) => PRICE_BANDS.filter((b) => b.test(p)).map((b) => b.id),
    order: PRICE_BANDS.map((b) => b.id),
  },
];

const FACET_BY_KEY = Object.fromEntries(FACETS.map((f) => [f.key, f])) as Record<FacetKey, FacetDef>;

/** Facet keys keyed by the filter names the intent model ranks. */
const INTENT_FILTER_TO_FACET: Record<string, FacetKey> = {
  League: 'league',
  Team: 'team',
  Department: 'department',
  Player: 'player',
  Size: 'size',
  Price: 'price',
  Brand: 'brand',
  Color: 'colorway',
  Gender: 'gender',
};

/**
 * The order a shopper narrows down in when nothing else is known: which sport,
 * which club, what kind of garment, then the questions that only make sense
 * once those are answered. It is the fallback ordering with personalization
 * off, and it is what the rail converges on as selections accumulate.
 */
const FUNNEL: FacetKey[] = ['league', 'team', 'department', 'gender', 'size', 'player', 'price', 'brand', 'colorway'];
const FUNNEL_POS = new Map(FUNNEL.map((k, i) => [k, i]));

/**
 * How much answering this facet would actually narrow the current results,
 * as normalised Shannon entropy over its value distribution.
 *
 * This is the piece that kills dead questions. Filter down to Hats and every
 * remaining product is One Size: the Size facet has one value, no entropy, and
 * it drops off the top of the rail on its own rather than needing a rule that
 * says "hide size for hats". Filter to one club and the Team facet does the
 * same. A facet that splits the results many ways scores near 1.
 *
 * Normalised against eight values rather than against the facet's own value
 * count, deliberately: a question with eight balanced answers really is more
 * useful than a coin flip, and dividing by log2(n) would rate them equal.
 */
const informationGain = (tally: Map<string, number>): number => {
  const counts = [...tally.values()].filter((n) => n > 0);
  if (counts.length < 2) return 0;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const n of counts) {
    const pr = n / total;
    h -= pr * Math.log2(pr);
  }
  return Math.min(1, h / Math.log2(8));
};

const priceLabel = (id: string) => PRICE_BANDS.find((b) => b.id === id)?.label ?? id;

const SORTS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'best', label: 'Best Sellers' },
  { id: 'new', label: 'Newest Arrivals' },
  { id: 'price_low', label: 'Price: Low to High' },
  { id: 'price_high', label: 'Price: High to Low' },
  { id: 'rating', label: 'Top Rated' },
] as const;

type SortId = (typeof SORTS)[number]['id'];

const PAGE_SIZE = 24;

export const ProductListingPage: React.FC = () => {
  const {
    products,
    isPersonalizationOn,
    intentPrediction,
    setSelectedProduct,
    setStorefrontPage,
    recordEvent,
    activeTeamOverride,
    setActiveTeamOverride,
    activeDeptFilter,
    setActiveDeptFilter,
    activeLeagueFilter,
    setActiveLeagueFilter,
    visitorProfile,
    recordEffort,
    userEvents,
    searchResult,
    clearSearch,
    publishRanking,
  } = useApp();

  const [sel, setSel] = useState<Selections>(() => ({
    ...EMPTY,
    team: activeTeamOverride ? [activeTeamOverride] : [],
    department: activeDeptFilter ? [activeDeptFilter] : [],
    league: activeLeagueFilter ? [activeLeagueFilter] : [],
  }));
  const [sortBy, setSortBy] = useState<SortId>('recommended');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [whyOpen, setWhyOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // The header's category links and the intelligence panel both drive the two
  // legacy single-value filters in context. Mirror them into the facet state,
  // but only when they changed somewhere else - otherwise our own writes below
  // would immediately collapse a multi-select back down to one value.
  const prevTeam = useRef(activeTeamOverride);
  const prevDept = useRef(activeDeptFilter);
  const prevLeague = useRef(activeLeagueFilter);

  useEffect(() => {
    if (activeTeamOverride !== prevTeam.current) {
      prevTeam.current = activeTeamOverride;
      setSel((s) => ({ ...s, team: activeTeamOverride ? [activeTeamOverride] : [] }));
    }
  }, [activeTeamOverride]);

  useEffect(() => {
    if (activeDeptFilter !== prevDept.current) {
      prevDept.current = activeDeptFilter;
      setSel((s) => ({ ...s, department: activeDeptFilter ? [activeDeptFilter] : [] }));
    }
  }, [activeDeptFilter]);

  useEffect(() => {
    if (activeLeagueFilter !== prevLeague.current) {
      prevLeague.current = activeLeagueFilter;
      setSel((s) => ({ ...s, league: activeLeagueFilter ? [activeLeagueFilter] : [] }));
    }
  }, [activeLeagueFilter]);

  /** A product passes when every facet either has no selection or matches one. */
  const passes = (p: Product, s: Selections, skip?: FacetKey) =>
    FACETS.every((f) => {
      if (f.key === skip) return true;
      const chosen = s[f.key];
      if (chosen.length === 0) return true;
      return f.values(p).some((v) => chosen.includes(v));
    });

  /**
   * What this page is a page OF.
   *
   * Browsing, that is the whole catalog and the facets narrow it. Searching, it
   * is the query's result set and the facets narrow that instead. The
   * distinction matters for the counts: faceting a search against the full
   * catalog would offer the shopper a Size XL with 90 next to it and then show
   * them four products, because 86 of those ninety were never in the result set.
   */
  const pool = searchResult ? searchResult.matched : products;

  /**
   * The same result set with the profile taken out.
   *
   * For a search that is the relevance-only order the engine computed in the
   * same pass; for a browse it is sales rank, which is what an un-personalized
   * Recommended shelf collapses to. Either way it is the control arm, and it is
   * computed from the same inputs at the same moment as the order on screen.
   */
  const defaultPool = searchResult ? searchResult.defaultOrder : products;

  const filtered = useMemo(() => pool.filter((p) => passes(p, sel)), [pool, sel]);

  /** Per-facet value counts, each computed with that facet's own picks ignored. */
  const facetCounts = useMemo(() => {
    const out: Record<FacetKey, Map<string, number>> = {} as any;
    for (const f of FACETS) {
      const tally = new Map<string, number>();
      for (const p of pool) {
        if (!passes(p, sel, f.key)) continue;
        for (const v of f.values(p)) tally.set(v, (tally.get(v) ?? 0) + 1);
      }
      out[f.key] = tally;
    }
    return out;
  }, [pool, sel]);

  const teamProb = useMemo(
    () => new Map(intentPrediction.teams.map((t) => [t.team as string, t.probability])),
    [intentPrediction]
  );
  const deptProb = useMemo(
    () => new Map(intentPrediction.departments.map((d) => [d.department as string, d.probability])),
    [intentPrediction]
  );

  /**
   * The Recommended order, as an explicit model output.
   *
   * Only computed when the shopper is browsing. On a search the query engine
   * has already ranked the pool - by relevance times profile affinity, which is
   * a strictly better-informed ranking than popularity times intent posterior,
   * because the shopper has just told it what they want in words. Running a
   * second ranker over the first one's output would throw that away.
   */
  const recommended = useMemo(
    () =>
      searchResult
        ? null
        : rankRecommended(filtered, {
            teamProb,
            deptProb,
            personalizationOn: isPersonalizationOn,
            surface: 'Category page grid',
          }),
    [searchResult, filtered, teamProb, deptProb, isPersonalizationOn]
  );

  /**
   * Position in the un-personalized order, for every product in the result set.
   *
   * Only ever read by the effort ledger - nothing renders from it - so the
   * shopper's grid is unaffected by its existence. Computed here rather than at
   * click time so it is provably the same result set the shopper was looking at.
   */
  const defaultPosition = useMemo(() => {
    const m = new Map<string, number>();
    const inSet = new Set(filtered.map((p) => p.id));
    defaultPool.filter((p) => inSet.has(p.id)).forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [filtered, defaultPool]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    switch (sortBy) {
      case 'best':
        return arr.sort((a, b) => b.popularity - a.popularity);
      case 'new':
        return arr.sort((a, b) => (a.releaseRecency ?? 1) - (b.releaseRecency ?? 1));
      case 'price_low':
        return arr.sort((a, b) => effPrice(a) - effPrice(b));
      case 'price_high':
        return arr.sort((a, b) => effPrice(b) - effPrice(a));
      case 'rating':
        return arr.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
      case 'recommended':
      default:
        if (searchResult) {
          // `filtered` already carries the engine's order, because `pool` did.
          // With the switch off, fall back to the relevance-only order the same
          // pass computed - so flipping personalization re-orders a search
          // result exactly the way it re-orders everything else on this page.
          if (isPersonalizationOn) return arr;
          const rank = defaultPosition;
          return arr.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
        }
        return recommended!.ordered.slice();
    }
  }, [filtered, sortBy, isPersonalizationOn, searchResult, defaultPosition, recommended]);

  /*
   * Publish the Recommended explanation to the panel.
   *
   * One-way: the panel reads it and cannot write back. An explanation that can
   * change the outcome it explains is not an explanation, and this is the only
   * wire between the grid and the trace.
   */
  useEffect(() => {
    if (recommended && sortBy === 'recommended') publishRanking(recommended);
  }, [recommended, sortBy, publishRanking]);

  // A narrower result set should start from the top, not halfway down a long
  // scroll of a previous, larger result set.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sel, sortBy]);

  /**
   * Facet rail order, recomputed on every selection.
   *
   * The rail used to be ordered once, by the intent model, and then sat still
   * however much you refined. That is wrong in a way anyone shopping notices:
   * on a Cowboys page, having ticked Jerseys and Men, the most useful next
   * question is Size - and the rail was still leading with Player, because
   * Player was where the intent model had put it on arrival.
   *
   * So the rail has two bands.
   *
   *   ANSWERED   facets you have ticked something in, in funnel order. They
   *              stay at the top and stay open: these are the decisions you
   *              have made, and the place you go to undo one.
   *
   *   REMAINING  everything else, sorted by how useful it is to answer NEXT:
   *
   *                 score = informationGain x base
   *
   *              informationGain drops a facet that cannot narrow anything
   *              (see above). `base` is where intent and the funnel trade off:
   *
   *                 base = (1 - t) x intent + t x funnel,   t = min(1, answered/3)
   *
   *              With nothing selected t is 0 and the order is purely the
   *              intent model's - which is the claim this demo makes, and the
   *              green badge that goes with it. Each selection moves t, and by
   *              the third the order is the shopping funnel from wherever you
   *              now are. Both inputs are honest at their own end: the model is
   *              good at guessing where to START, and it has nothing to say
   *              about what follows Jerseys + Men that the funnel does not say
   *              better.
   *
   * With personalization off, t is pinned at 1: no intent term, funnel only.
   */
  const answeredCount = useMemo(() => FACETS.filter((f) => sel[f.key].length > 0).length, [sel]);

  /*
   * Both orderings, every render.
   *
   * The rail used to compute one order and render it. It computes two now: the
   * one on screen, and the one the same rail would have had with the intent
   * term removed - funnel only, t pinned at 1, which is exactly what the
   * un-personalized store serves. The second costs a sort of six items and it
   * is what lets the effort ledger say where a facet WOULD have been when the
   * shopper picks one. Paired at the moment of the decision, per ml/effort.ts.
   */
  const { railFacets, defaultRailKeys, railMix, railMoved } = useMemo(() => {
    const answered: FacetDef[] = [];
    const remaining: FacetDef[] = [];
    for (const f of FACETS) (sel[f.key].length > 0 ? answered : remaining).push(f);

    answered.sort((a, b) => (FUNNEL_POS.get(a.key) ?? 99) - (FUNNEL_POS.get(b.key) ?? 99));

    const intentRank = new Map<FacetKey, number>();
    intentPrediction.topFilters.forEach((name, i) => {
      const k = INTENT_FILTER_TO_FACET[name];
      if (k && !intentRank.has(k)) intentRank.set(k, i);
    });
    const nIntent = Math.max(1, intentPrediction.topFilters.length);

    const t = isPersonalizationOn ? Math.min(1, answered.length / 3) : 1;

    const intentOf = (k: FacetKey) => {
      const r = intentRank.get(k);
      return r === undefined ? 0 : 1 - r / nIntent;
    };
    const funnelOf = (k: FacetKey) => 1 - (FUNNEL_POS.get(k) ?? FUNNEL.length) / FUNNEL.length;

    const orderAt = (mix: number) => {
      const scoreOf = (f: FacetDef) =>
        informationGain(facetCounts[f.key]) * ((1 - mix) * intentOf(f.key) + mix * funnelOf(f.key));
      const scores = new Map(remaining.map((f) => [f.key, scoreOf(f)]));
      return [...remaining].sort(
        (a, b) =>
          (scores.get(b.key) ?? 0) - (scores.get(a.key) ?? 0) ||
          (FUNNEL_POS.get(a.key) ?? 99) - (FUNNEL_POS.get(b.key) ?? 99)
      );
    };

    const ordered = orderAt(t);

    // The badge only claims what is true at this moment: the model is still
    // shaping the order while t < 1, and after that the rail is following the
    // funnel from where the shopper has got to.
    const intentStillLeading = isPersonalizationOn && t < 1;
    const defaultOrdered = orderAt(1);
    const defaultKeys = [...answered.map((f) => f.key), ...defaultOrdered.map((f) => f.key)];

    // How many questions the rail is asking in a different order than the
    // un-personalized store would. Counted, not asserted: both orderings exist
    // in this memo, computed from the same facet counts in the same pass.
    const moved = ordered.filter((f, i) => defaultOrdered[i]?.key !== f.key).length;

    return {
      railFacets: [
        ...answered.map((facet) => ({ facet, answered: true, badge: null as string | null })),
        ...ordered.map((facet, i) => ({
          facet,
          answered: false,
          badge:
            i === 0 ? (intentStillLeading ? 'ML RANKED' : 'NEXT BEST') : i === 1 && intentStillLeading ? 'ML RANKED' : null,
        })),
      ],
      defaultRailKeys: defaultKeys,
      railMix: t,
      railMoved: moved,
    };
  }, [sel, isPersonalizationOn, intentPrediction, facetCounts]);

  /** The question the rail has decided to ask next, if there is one left. */
  const nextQuestion = railFacets.find((r) => !r.answered)?.facet.label ?? null;

  /* ------------------------------------------------- the effort ledger -- */

  const beat = userEvents.length;
  const lastEventId = userEvents[0]?.id ?? null;

  /**
   * SIZE PREFILL - the one place personalization removes a click outright.
   *
   * Everything else on this page changes an ORDER, and a shopper in a hurry can
   * always beat a good order by scrolling fast. A prefilled size is different:
   * the interaction does not happen at all.
   *
   * Three guards, and each one is there because the prefill is otherwise a way
   * to make a shopper's own choice disappear:
   *
   *   - it only fires when the profile's size for this department clears the
   *     same activation gate every other surface uses, so a size guessed from
   *     one glance at one product does not get applied to the whole grid;
   *   - it only fires when that size actually exists in the current result set,
   *     because prefilling a facet into zero results manufactures the exact
   *     dead end the ledger claims to remove;
   *   - it fires once per department, tracked in a ref, so clearing the chip
   *     clears it for good. A filter that reapplies itself is not a
   *     convenience, it is a fight.
   *
   * A fourth guard arrived with search: gift intent. "Something for my son" is
   * the shopper telling you the purchase is not for them, and prefilling their
   * own size onto it is the exact failure that makes personalization feel
   * creepy rather than useful. The query engine emits the gift trait as its own
   * node for precisely this reason - so a surface can switch a piece of
   * personalization OFF on the strength of it.
   */
  const prefilledFor = useRef<Set<string>>(new Set());

  const giftIntent = searchResult?.interpretation.giftIntent ?? false;

  useEffect(() => {
    if (!isPersonalizationOn) return;
    if (giftIntent) return;
    const dept = sel.department.length === 1 ? sel.department[0] : null;
    if (!dept || prefilledFor.current.has(dept)) return;
    if (sel.size.length > 0) return;

    const est = visitorProfile.traits.sizeProfile[dept as Department];
    if (!est || est.confidence.value < CONFIDENCE_THRESHOLD) return;
    if ((facetCounts.size.get(est.size) ?? 0) === 0) return;

    prefilledFor.current.add(dept);
    setSel((s) => ({ ...s, size: [est.size] }));
    recordEffort(
      saving({
        id: `plp:size-prefill:${dept}:${beat}`,
        eventId: lastEventId,
        page: 'plp',
        surface: 'Size facet',
        kind: 'size_hunt',
        count: 1,
        label: `Prefilled size ${est.size} for ${dept}`,
        detail:
          `held at ${(est.confidence.value * 100).toFixed(0)}% confidence from earlier sessions; ` +
          `one facet interaction the shopper did not have to make`,
      })
    );
    recordEvent(`Size ${est.size} prefilled from profile`, { pageType: 'Filter', filterApplied: `size=${est.size}` });
  }, [isPersonalizationOn, giftIntent, sel.department, sel.size, visitorProfile, facetCounts, beat, lastEventId]);

  const toggleValue = (key: FacetKey, value: string) => {
    setSel((s) => {
      const chosen = s[key];
      const next = chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value];

      // Keep the two context-level filters in step so the header badge and the
      // trace panel agree with the rail. A multi-select has no single value to
      // publish, so it publishes none.
      if (key === 'team') {
        const single = next.length === 1 ? (next[0] as TeamId) : null;
        prevTeam.current = single;
        setActiveTeamOverride(single);
      }
      if (key === 'department') {
        const single = next.length === 1 ? next[0] : null;
        prevDept.current = single;
        setActiveDeptFilter(single);
      }
      if (key === 'league') {
        const single = next.length === 1 ? (next[0] as League) : null;
        prevLeague.current = single;
        setActiveLeagueFilter(single);
      }

      return { ...s, [key]: next };
    });

    // Where that facet sat, against where the funnel alone would have put it.
    // Only on the way IN - unticking a value is the shopper undoing something,
    // and crediting personalization for a position in that case would be
    // counting the same rail twice.
    if (isPersonalizationOn && !sel[key].includes(value)) {
      recordEffort(
        rankMove({
          id: `plp:facet-rail:${beat}:${key}`,
          eventId: lastEventId,
          page: 'plp',
          surface: 'Facet rail',
          subject: `${FACET_BY_KEY[key].label} filter`,
          personalizedPosition: railFacets.findIndex((r) => r.facet.key === key) + 1,
          defaultPosition: defaultRailKeys.indexOf(key) + 1,
        })
      );
    }

    // Ticking a team or department box is the strongest in-session statement a
    // shopper makes, so the event has to carry that value on the field the intent
    // model actually reads. Recording it only as an opaque `filterApplied` string
    // left the model blind to the one action the demo most wants it to react to.
    recordEvent(`Filtered by ${FACET_BY_KEY[key].label}: ${key === 'price' ? priceLabel(value) : value}`, {
      pageType: 'Filter',
      filterApplied: `${key}=${value}`,
      team: key === 'team' ? (value as TeamId) : undefined,
      department: key === 'department' ? (value as Department) : undefined,
      league: key === 'league' ? (value as League) : undefined,
    });
  };

  const clearAll = () => {
    setSel(EMPTY);
    prevTeam.current = null;
    prevDept.current = null;
    prevLeague.current = null;
    setActiveTeamOverride(null);
    setActiveDeptFilter(null);
    setActiveLeagueFilter(null);
    recordEvent('Cleared all filters', { pageType: 'Filter' });
  };

  const appliedChips = FACETS.flatMap((f) =>
    sel[f.key].map((v) => ({ key: f.key, value: v, label: f.key === 'price' ? priceLabel(v) : v }))
  );

  // Are we actually standing in one team's shop, or on an all-gear page that
  // merely happens to be sorted for a predicted favourite? The banner has to
  // tell the truth about which: dressing an unfiltered 800-item result set as
  // "Philadelphia Eagles" would put a team name and a catalog-wide count side
  // by side and invite the viewer to read the count as the team's assortment.
  const shopTeamId: TeamId | null = sel.team.length === 1 ? (sel.team[0] as TeamId) : null;
  const predictedTeamId = (intentPrediction.teams[0]?.team as TeamId) || 'Eagles';
  const predictedPct = Math.round((intentPrediction.teams[0]?.probability ?? 0) * 100);

  // The colour dressing follows the predicted team even on the all-gear view -
  // that part is genuine personalization - but the wording never claims a
  // filter that is not applied.
  const dressTeam = TEAM_BY_ID[shopTeamId ?? (isPersonalizationOn ? predictedTeamId : 'Eagles')];
  const selectedLeague = sel.league.length === 1 ? (sel.league[0] as League) : null;

  const openProduct = (p: Product) => {
    // Four cards across, twenty-four to a page. The saving worth having here is
    // the one that crosses a page boundary, and rows are the unit that makes
    // that visible without claiming a shopper feels every slot.
    if (isPersonalizationOn && sortBy === 'recommended') {
      recordEffort(
        rankMove({
          id: `plp:grid:${beat}:${p.id}`,
          eventId: lastEventId,
          page: 'plp',
          surface: 'Result grid',
          subject: p.name,
          personalizedPosition: sorted.findIndex((x) => x.id === p.id) + 1,
          defaultPosition: defaultPosition.get(p.id) ?? sorted.length,
          perRow: 4,
        })
      );
    }
    setSelectedProduct(p);
    setStorefrontPage('pdp');
    recordEvent(`Viewed PDP: ${p.name}`, {
      productId: p.id,
      productName: p.name,
      team: p.team,
      department: p.department,
      league: p.league,
    });
  };

  const renderFacet = (f: FacetDef, badge: string | null, isAnswered: boolean) => {
    const tally = facetCounts[f.key];
    let values = Array.from(tally.entries()).filter(([, n]) => n > 0);

    if (f.order) {
      const pos = new Map(f.order.map((v, i) => [v, i]));
      values.sort((a, b) => (pos.get(a[0]) ?? 999) - (pos.get(b[0]) ?? 999));
    } else if (isPersonalizationOn && f.key === 'team') {
      values.sort((a, b) => (teamProb.get(b[0]) ?? 0) - (teamProb.get(a[0]) ?? 0) || b[1] - a[1]);
    } else if (isPersonalizationOn && f.key === 'department') {
      values.sort((a, b) => (deptProb.get(b[0]) ?? 0) - (deptProb.get(a[0]) ?? 0) || b[1] - a[1]);
    } else {
      values.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }

    // Always keep a ticked value on screen, even if it has slid down the list.
    const chosen = sel[f.key];
    const isOpen = !collapsed[f.key];
    const showAll = expanded[f.key];
    const LIMIT = 8;
    const shown = showAll ? values : values.slice(0, LIMIT);
    for (const c of chosen) {
      if (!shown.some(([v]) => v === c)) {
        const found = values.find(([v]) => v === c);
        shown.push(found ?? [c, 0]);
      }
    }

    if (values.length === 0) return null;

    const probFor = (v: string) =>
      f.key === 'team' ? teamProb.get(v) : f.key === 'department' ? deptProb.get(v) : undefined;

    return (
      <div key={f.key} className="border-b border-slate-200 py-3">
        <button
          onClick={() => setCollapsed((c) => ({ ...c, [f.key]: !c[f.key] }))}
          className="w-full flex items-center justify-between text-left group"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-extrabold text-slate-900 uppercase tracking-wide truncate">
              {f.label}
            </span>
            {isAnswered ? (
              <span className="text-[9px] bg-red-50 text-red-700 font-mono font-bold px-1.5 py-0.5 rounded border border-red-200 shrink-0">
                {chosen.length}
              </span>
            ) : (
              badge && (
                <span
                  className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                    badge === 'ML RANKED'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                  title={
                    badge === 'ML RANKED'
                      ? 'The intent model put this filter at the top of the rail'
                      : 'The filter that would narrow these results most from here'
                  }
                >
                  {badge}
                </span>
              )
            )}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-400 group-hover:text-slate-700 transition-transform ${
              isOpen ? '' : '-rotate-90'
            }`}
          />
        </button>

        {isOpen && (
          <div className="mt-2 space-y-0.5">
            {shown.map(([value, count]) => {
              const checked = chosen.includes(value);
              const prob = probFor(value);
              return (
                <label
                  key={value}
                  className={`flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer transition-colors ${
                    checked ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                      checked ? 'bg-red-600 border-red-600' : 'bg-white border-slate-300'
                    }`}
                  >
                    {checked && <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(f.key, value)}
                    className="sr-only"
                  />
                  {/* Club and department rows carry their mark. Twelve
                      identical checkbox rows are read one word at a time; a
                      crest or a glyph is read at a glance. The other facets
                      (price, size, colour) have nothing to draw, so they get
                      nothing rather than a filler icon. */}
                  {f.key === 'team' && <TeamCrest team={value as TeamId} size="xs" className="shrink-0" />}
                  {f.key === 'department' && (
                    <DeptGlyph
                      department={value as Department}
                      className={`h-3.5 w-3.5 shrink-0 ${checked ? 'text-slate-900' : 'text-slate-400'}`}
                    />
                  )}
                  <span className={`text-[11px] flex-1 truncate ${checked ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                    {f.key === 'price' ? priceLabel(value) : value}
                  </span>
                  {isPersonalizationOn && prob !== undefined && prob > 0.01 && (
                    <span className="text-[9px] font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1 rounded shrink-0">
                      {Math.round(prob * 100)}%
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">({count})</span>
                </label>
              );
            })}

            {values.length > LIMIT && (
              <button
                onClick={() => setExpanded((x) => ({ ...x, [f.key]: !x[f.key] }))}
                className="text-[10px] font-bold text-red-600 hover:text-red-700 hover:underline pt-1 pl-1.5"
              >
                {showAll ? 'Show less' : `+ ${values.length - LIMIT} more`}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white min-h-full text-slate-900 font-sans">
      {/* Breadcrumb */}
      <div className="max-w-[1400px] mx-auto px-5 pt-3">
        <nav className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <button onClick={() => setStorefrontPage('home')} className="hover:text-red-600 flex items-center gap-1">
            <Home className="h-3 w-3" />
            Home
          </button>
          <ChevronRight className="h-3 w-3 text-slate-300" />
          {searchResult ? (
            <span className="font-bold text-slate-800 truncate max-w-[18rem]">
              Search · “{searchResult.interpretation.raw}”
            </span>
          ) : selectedLeague || shopTeamId ? (
            <span className="cursor-default">{selectedLeague ?? TEAM_BY_ID[shopTeamId!].league}</span>
          ) : (
            <span className="font-bold text-slate-800">All Gear</span>
          )}
          {shopTeamId && (
            <>
              <ChevronRight className="h-3 w-3 text-slate-300" />
              <span className="font-bold text-slate-800">{TEAM_BY_ID[shopTeamId].fullName}</span>
            </>
          )}
          {sel.department.length === 1 && (
            <>
              <ChevronRight className="h-3 w-3 text-slate-300" />
              <span className="font-bold text-slate-800">{sel.department[0]}</span>
            </>
          )}
        </nav>
      </div>

      {/* A search replaces the team hero band. Dressing a query result in a club's
          colours and headline would name a team the shopper did not ask for and
          put a catalog-wide count beside it. */}
      {searchResult && (
        <SearchUnderstanding
          result={searchResult}
          onClear={() => {
            clearSearch();
            recordEvent('Cleared search', { pageType: 'Search' });
          }}
        />
      )}

      {/* Team hero band, dressed in the team's own colours */}
      {!searchResult && (
      <div className="max-w-[1400px] mx-auto px-5 pt-3">
        <div
          className="rounded-xl px-5 py-4 text-white flex items-center justify-between gap-4 shadow-sm"
          style={{ background: `linear-gradient(100deg, ${dressTeam.primaryColor} 0%, #0f172a 85%)` }}
        >
          {/* The crest, at the one size on this page where it can carry the band.
              A team shop headed by nothing but type looked the same whichever
              club you were in.

              Shown only when there is a club to show. With a team filter applied
              it is that club; with none but personalization on it is the
              predicted one, which is the same club the band is already dressed
              in and which the line underneath names. With personalization off
              and no filter, `dressTeam` falls back to Eagles for the gradient -
              a crest on that would be asserting something the page does not
              know. */}
          {(shopTeamId || isPersonalizationOn) && (
            <div className="shrink-0 hidden sm:grid place-items-center h-16 w-16 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm">
              <TeamCrest team={dressTeam.id} size="lg" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono uppercase tracking-widest text-white/60">
              {shopTeamId
                ? `Official Team Shop · ${TEAM_BY_ID[shopTeamId].league}`
                : selectedLeague
                  ? `${selectedLeague} Shop · All Teams`
                  : 'All Gear · Every League'}
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight truncate font-display">
              {shopTeamId
                ? TEAM_BY_ID[shopTeamId].fullName
                : selectedLeague
                  ? `${selectedLeague} Fan Shop`
                  : 'Shop All Team Gear'}
            </h1>
            {shopTeamId || !isPersonalizationOn ? (
              <div className="text-[11px] text-white/70">
                Jerseys, hats, hoodies and collectibles · Officially licensed
              </div>
            ) : (
              <div className="text-[11px] text-white/80 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-emerald-300 shrink-0" />
                <span>
                  No team filter applied — results are ranked for your predicted favourite,{' '}
                  <b>{predictedTeamId}</b> ({predictedPct}%)
                </span>
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-black font-mono leading-none">{filtered.length.toLocaleString()}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/60">
              {shopTeamId || selectedLeague || appliedChips.length > 0 ? 'Matching Items' : 'Items In Catalog'}
            </div>
          </div>
        </div>
      </div>
      )}

      <div className="max-w-[1400px] mx-auto px-5 py-4 flex gap-6 items-start">
        {/* ---------------- Facet rail ---------------- */}
        <aside className="w-56 shrink-0 hidden md:block">
          <div className="flex items-center justify-between pb-2 border-b-2 border-slate-900">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide">
              <SlidersHorizontal className="h-3.5 w-3.5 text-red-600" />
              Filters
            </span>
            {appliedChips.length > 0 && (
              <button onClick={clearAll} className="text-[10px] font-bold text-red-600 hover:underline">
                Clear all
              </button>
            )}
          </div>

          {/* THE RAIL RE-SEQUENCES ITSELF, and this caption is where it says so.
              Early on the order really is the intent model's; three answers in
              it is the shopping funnel's, and a banner still crediting the model
              at that point would be claiming something the code stopped doing.
              The mix bar below is that handover, drawn rather than described. */}
          {isPersonalizationOn && (
            <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-2">
              <div className="flex items-start gap-1.5">
                <Sparkles className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-emerald-900 leading-snug">
                    {nextQuestion
                      ? `Next best question: ${nextQuestion}`
                      : 'Every question has been answered.'}
                  </p>
                  <p className="text-[9.5px] text-emerald-800/90 leading-snug mt-0.5">
                    {answeredCount === 0
                      ? 'Order and the values inside each group are ranked by predicted intent.'
                      : answeredCount < 3
                        ? 'Re-sequenced around your selections. Values are still ranked by predicted intent.'
                        : 'Enough is known about this basket that the order now follows the funnel, not the model.'}
                  </p>
                </div>
              </div>

              {/* Who is deciding the order, right now. */}
              <div className="mt-1.5 pt-1.5 border-t border-emerald-200">
                <div className="flex items-center justify-between text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-emerald-700">
                  <span>Model</span>
                  <span>Funnel</span>
                </div>
                <div className="mt-0.5 h-1 w-full rounded-full bg-emerald-200 overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((1 - railMix) * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[9px] font-mono text-emerald-700/80 tabular-nums">
                  t = {railMix.toFixed(2)} · {answeredCount} answered
                  {railMoved > 0 && ` · ${railMoved} group${railMoved === 1 ? '' : 's'} re-sequenced`}
                </p>
              </div>
            </div>
          )}

          <div className="mt-1">
            {railFacets.map((r, i) => (
              <React.Fragment key={r.facet.key}>
                {/* The line where answered questions end and the next one
                    begins. Without it the rail is one undifferentiated list
                    and the reordering below looks arbitrary. */}
                {!r.answered && i > 0 && railFacets[i - 1].answered && (
                  <div className="pt-3 pb-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                    Refine further
                  </div>
                )}
                {renderFacet(r.facet, r.badge, r.answered)}
              </React.Fragment>
            ))}
          </div>
        </aside>

        {/* ---------------- Results ---------------- */}
        <section className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 pb-2 border-b-2 border-slate-900 flex-wrap">
            <div className="text-xs">
              <b className="text-base font-black">{filtered.length.toLocaleString()}</b>
              <span className="text-slate-500 font-semibold"> Results</span>
              {filtered.length > visibleCount && (
                <span className="text-slate-400 ml-2 font-mono text-[10px]">
                  showing {Math.min(visibleCount, filtered.length)}
                </span>
              )}
            </div>

            <label className="flex items-center gap-2 text-[11px]">
              <span className="font-bold text-slate-600 uppercase tracking-wide">Sort</span>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortId);
                  recordEvent(`Sorted results by ${SORTS.find((s) => s.id === e.target.value)?.label}`);
                }}
                className="border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-semibold bg-white hover:border-slate-400 focus:outline-none focus:border-red-500"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {s.id === 'recommended' && isPersonalizationOn ? ' (model-ranked)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* -------- Why this order. The sort control names a model output, so
                       the model output has to be inspectable from where it is
                       named rather than only from the panel. -------- */}
          {sortBy === 'recommended' && (
            <div className="pt-2.5">
              <button
                onClick={() => setWhyOpen((v) => !v)}
                className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                  isPersonalizationOn
                    ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100/70'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                {isPersonalizationOn ? (
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                )}
                <span
                  className={`text-[11px] font-bold ${isPersonalizationOn ? 'text-emerald-900' : 'text-slate-700'}`}
                >
                  {!isPersonalizationOn
                    ? 'Recommended is plain popularity right now — personalization is off'
                    : searchResult
                      ? 'This order is relevance times profile affinity'
                      : recommended && recommended.moved.length > 0
                        ? `${recommended.moved.length} of the top ${recommended.items.length} moved from where popularity alone would have put them`
                        : 'Popularity, reweighted by predicted intent'}
                </span>
                <span className="flex-1" />
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${whyOpen ? 'rotate-180' : ''} ${
                    isPersonalizationOn ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                />
              </button>

              {whyOpen && (
                <div className="mt-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                    Scorer
                  </div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-slate-700 break-words">
                    {searchResult
                      ? 'score = (relevance + soft credit for relaxed constraints) x (1 + 1.4 x P(team) + 0.8 x P(department) + 1.6 x P(player))'
                      : RECOMMENDED_FORMULA}
                  </div>

                  {!searchResult && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {recommended?.weights.map((w) => (
                        <div key={w.label} className="text-[10px]">
                          <span className="font-mono font-bold tabular-nums text-slate-900">
                            {w.weight.toFixed(1)}
                          </span>{' '}
                          <span className="font-semibold text-slate-700">{w.label}</span>
                          <span className="text-slate-400"> — {w.note}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* The paired measurement. Not "we personalized this" - the
                      positions each product would have held either way. */}
                  {!searchResult && isPersonalizationOn && recommended && recommended.moved.length > 0 && (
                    <>
                      <div className="mt-2.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                        Moved against the popularity default
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {recommended.moved.slice(0, 5).map((m) => (
                          <div key={m.productId} className="flex items-center gap-1.5 text-[10.5px]">
                            <span
                              className={`font-mono font-bold tabular-nums shrink-0 ${
                                m.delta > 0 ? 'text-emerald-600' : 'text-slate-400'
                              }`}
                            >
                              {m.from}→{m.to}
                            </span>
                            <span className="truncate text-slate-700">{m.name}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {searchResult && (
                    <p className="mt-2 text-[10px] text-slate-500 leading-snug">
                      Relevance comes from the query, affinity from the profile, and the two multiply
                      rather than add — so a product the shopper would love that does not answer the
                      question still cannot outrank one that does.
                      {searchResult.interpretation.giftIntent &&
                        ' The player term is dropped entirely here, because this was read as a gift.'}
                    </p>
                  )}

                  <p className="mt-2 text-[9.5px] text-slate-400 leading-snug border-t border-slate-100 pt-1.5">
                    Ranking only. Nothing on this page filters a product out on the model's say-so —
                    membership in the result set is decided by the shopper's filters and their query,
                    and by nothing else.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Applied filter chips */}
          {appliedChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 py-2.5">
              {appliedChips.map((c) => (
                <button
                  key={`${c.key}:${c.value}`}
                  onClick={() => toggleValue(c.key, c.value)}
                  className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-full pl-2.5 pr-1.5 py-0.5 text-[10px] font-bold text-slate-700 transition-colors"
                  title="Remove this filter"
                >
                  <span className="text-slate-400 uppercase font-mono">{FACET_BY_KEY[c.key].label}:</span>
                  {c.label}
                  <X className="h-3 w-3 text-slate-500" />
                </button>
              ))}
              <button onClick={clearAll} className="text-[10px] font-bold text-red-600 hover:underline ml-1">
                Clear all
              </button>
            </div>
          )}

          {/* Grid */}
          {sorted.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-sm font-bold text-slate-700">No products match these filters.</div>
              <button onClick={clearAll} className="mt-2 text-xs font-bold text-red-600 hover:underline">
                Clear all filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 pt-3">
                {sorted.slice(0, visibleCount).map((p, i) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onSelect={openProduct}
                    // Only the genuinely intent-driven ordering earns the badge,
                    // and only at the top of the first page where the claim is
                    // actually true.
                    badgeText={
                      isPersonalizationOn && sortBy === 'recommended' && i < 3 ? 'PICKED FOR YOU' : undefined
                    }
                    badgeType="personalized"
                  />
                ))}
              </div>

              {visibleCount < sorted.length && (
                <div className="flex flex-col items-center gap-2 py-6">
                  <div className="text-[11px] text-slate-500 font-mono">
                    {Math.min(visibleCount, sorted.length)} of {sorted.length.toLocaleString()}
                  </div>
                  <div className="h-1 w-48 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-600 rounded-full transition-all"
                      style={{ width: `${(visibleCount / sorted.length) * 100}%` }}
                    />
                  </div>
                  <button
                    onClick={() => {
                      setVisibleCount((c) => c + PAGE_SIZE);
                      recordEvent('Loaded more results');
                    }}
                    className="mt-1 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider px-8 py-2.5 rounded-lg transition-colors"
                  >
                    Load More
                  </button>
                </div>
              )}
            </>
          )}

          <div className="flex items-start gap-2 text-[10px] text-slate-500 border-t border-slate-200 pt-3 mt-2">
            <Info className="h-3 w-3 shrink-0 mt-0.5" />
            <span>
              Catalog, pricing, ratings and review counts are generated by a seeded simulator. Facet counts are computed
              live over the {products.length.toLocaleString()}-item synthetic catalog.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};
