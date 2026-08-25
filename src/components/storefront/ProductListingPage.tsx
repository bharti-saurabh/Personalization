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
 * values carry their predicted probability, and the default "Featured" sort is
 * intent-weighted. Turn it off and this becomes an ordinary popularity-sorted
 * category page - which is the comparison the demo exists to make.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductCard } from './ProductCard';
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

const priceLabel = (id: string) => PRICE_BANDS.find((b) => b.id === id)?.label ?? id;

const SORTS = [
  { id: 'featured', label: 'Featured' },
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
  } = useApp();

  const [sel, setSel] = useState<Selections>(() => ({
    ...EMPTY,
    team: activeTeamOverride ? [activeTeamOverride] : [],
    department: activeDeptFilter ? [activeDeptFilter] : [],
    league: activeLeagueFilter ? [activeLeagueFilter] : [],
  }));
  const [sortBy, setSortBy] = useState<SortId>('featured');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
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

  const filtered = useMemo(() => products.filter((p) => passes(p, sel)), [products, sel]);

  /** Per-facet value counts, each computed with that facet's own picks ignored. */
  const facetCounts = useMemo(() => {
    const out: Record<FacetKey, Map<string, number>> = {} as any;
    for (const f of FACETS) {
      const tally = new Map<string, number>();
      for (const p of products) {
        if (!passes(p, sel, f.key)) continue;
        for (const v of f.values(p)) tally.set(v, (tally.get(v) ?? 0) + 1);
      }
      out[f.key] = tally;
    }
    return out;
  }, [products, sel]);

  const teamProb = useMemo(
    () => new Map(intentPrediction.teams.map((t) => [t.team as string, t.probability])),
    [intentPrediction]
  );
  const deptProb = useMemo(
    () => new Map(intentPrediction.departments.map((d) => [d.department as string, d.probability])),
    [intentPrediction]
  );

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
      case 'featured':
      default:
        // With personalization off this is plain popularity, which is exactly
        // what an un-personalized "Featured" shelf is. With it on, popularity is
        // reweighted by how likely this shopper is to want that team and
        // department - the same two distributions the panel is displaying.
        if (!isPersonalizationOn) return arr.sort((a, b) => b.popularity - a.popularity);
        return arr.sort((a, b) => {
          const score = (p: Product) =>
            (p.popularity / 100) * (1 + 2.0 * (teamProb.get(p.team) ?? 0) + 1.2 * (deptProb.get(p.department) ?? 0));
          return score(b) - score(a);
        });
    }
  }, [filtered, sortBy, isPersonalizationOn, teamProb, deptProb]);

  // A narrower result set should start from the top, not halfway down a long
  // scroll of a previous, larger result set.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sel, sortBy]);

  /** Facet rail order. Intent decides it when personalization is on. */
  const orderedFacets = useMemo(() => {
    if (!isPersonalizationOn) return FACETS;
    const ranked = intentPrediction.topFilters
      .map((f) => INTENT_FILTER_TO_FACET[f])
      .filter((k): k is FacetKey => !!k);
    const seen = new Set<FacetKey>();
    const out: FacetDef[] = [];
    for (const k of ranked) {
      if (!seen.has(k)) {
        seen.add(k);
        out.push(FACET_BY_KEY[k]);
      }
    }
    for (const f of FACETS) if (!seen.has(f.key)) out.push(f);
    return out;
  }, [isPersonalizationOn, intentPrediction]);

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

  const renderFacet = (f: FacetDef, rankIdx: number) => {
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
          <span className="flex items-center gap-1.5">
            <span className="text-[11px] font-extrabold text-slate-900 uppercase tracking-wide">{f.label}</span>
            {isPersonalizationOn && rankIdx < 2 && (
              <span
                className="text-[9px] bg-emerald-100 text-emerald-800 font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-200"
                title="This filter was promoted up the rail by the intent model"
              >
                ML RANKED
              </span>
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
          {selectedLeague || shopTeamId ? (
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

      {/* Team hero band, dressed in the team's own colours */}
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

          {isPersonalizationOn && (
            <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5 flex items-start gap-1.5">
              <Sparkles className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />
              <span className="text-[10px] text-emerald-900 leading-snug">
                Filter order and the values inside them are ranked by predicted intent.
              </span>
            </div>
          )}

          <div className="mt-1">{orderedFacets.map((f, i) => renderFacet(f, i))}</div>
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
                    {s.id === 'featured' && isPersonalizationOn ? ' (personalized)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
                      isPersonalizationOn && sortBy === 'featured' && i < 3 ? 'PICKED FOR YOU' : undefined
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
