/**
 * The ProSports storefront header.
 *
 * This is now a retail header and nothing else. The personalization switch, the
 * panel switch and the synthetic-data disclosure moved up into the Straive app
 * bar, and the promotional ticker folded into the right-hand end of the utility
 * row. What is left is what a shopper would recognise: mark, search, account,
 * cart, categories.
 *
 * ProSports is fictional. Its mark is drawn here rather than fetched, both to
 * keep the prototype self-contained and to keep the demo de-branded.
 *
 * THE SEARCH BOX IS A MODEL SURFACE. It used to be a substring filter over
 * product names: type "something for my son" and it returned nothing, because no
 * product is called that. It now runs the query engine in src/ml/query.ts, which
 * maps the words onto taxonomy nodes, ranks the completions by the visitor
 * profile, and shows the shopper where each row would have sat without them.
 *
 * The dropdown renders whenever the box has text in it. That is deliberate:
 * this component has no empty state any more, because the point being made is
 * that a query the catalog cannot satisfy should still produce somewhere to go.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, Heart, User, ShoppingBag, Truck, CornerDownLeft, ArrowUp, Sparkles, Tag } from 'lucide-react';
import { Department, League } from '../../types';
import { TeamCrest, LeagueBadge } from '../brand/Identity';
import { ProductImage } from '../storefront/ProductImage';
import { ExplainMarker } from '../storefront/ExplainMarker';
import { suggest } from '../../ml/query';
import { saving } from '../../ml/effort';
import type { Suggestion } from '../../ml/query';

/** ProSports mark: a chevron pair inside a rounded field. */
const ProSportsMark: React.FC<{ className?: string }> = ({ className = 'h-8 w-8' }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <rect x="0" y="0" width="32" height="32" rx="9" fill="#dc2626" />
    <path d="M8 22 L14.5 10 L18 10 L11.5 22 Z" fill="#fff" />
    <path d="M15 22 L21.5 10 L25 10 L18.5 22 Z" fill="#fff" opacity="0.72" />
  </svg>
);

const NAV_DEPTS: Department[] = ['Jerseys', 'Hats', 'Hoodies', 'T-shirts', 'Collectibles', 'Accessories'];
const NAV_LEAGUES: League[] = ['NFL', 'NBA', 'MLB'];

export const Header: React.FC = () => {
  const {
    isPersonalizationOn,
    cart,
    setStorefrontPage,
    lastModelFeedback,
    recordEvent,
    products,
    setSelectedProduct,
    setNavigationTab,
    setActiveDeptFilter,
    setActiveTeamOverride,
    setActiveLeagueFilter,
    activeTeamOverride,
    activeDeptFilter,
    activeLeagueFilter,
    intentPrediction,
    visitorProfile,
    runSearch,
    clearSearch,
    recordEffort,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // The dropdown floats over the hero, so a stray click anywhere else should
  // dismiss it rather than leaving it covering the page.
  useEffect(() => {
    if (!isSearchOpen) return;
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setIsSearchOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isSearchOpen]);

  const typed = searchQuery.trim();

  /**
   * Completions, recomputed on every keystroke.
   *
   * `suggest` runs the full interpretation and a catalog pass, which sounds
   * expensive per keypress and is not: the catalog is 800 rows held in memory
   * and the pass is a filter plus a sort. Debouncing it would buy nothing and
   * cost the demo its most convincing property, which is that the dropdown
   * re-orders as the sentence is still being typed.
   */
  const suggestions = useMemo(
    () =>
      typed
        ? suggest(products, typed, {
            profile: visitorProfile,
            personalized: isPersonalizationOn,
          })
        : null,
    [typed, products, visitorProfile, isPersonalizationOn]
  );

  const rows: Suggestion[] = suggestions?.suggestions ?? [];
  const scopes = rows.filter((r) => r.kind === 'scope');
  const scopeProducts = rows.filter((r) => r.kind === 'product');

  // A query is only "mid-word" while it is short enough to plausibly still be
  // one. Warning that "eagl" matches nothing would be true and useless.
  const settled = typed.length >= 4;

  const closeSearch = () => {
    setIsSearchOpen(false);
    setCursor(-1);
  };

  const submitQuery = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setSearchQuery(q);
    closeSearch();
    runSearch(q);
  };

  const handleSelectSearchResult = (p: (typeof products)[0]) => {
    setSelectedProduct(p);
    setNavigationTab('experience');
    setStorefrontPage('pdp');
    setSearchQuery('');
    closeSearch();
    // Carry the product's own attributes: a search landing is one of the
    // strongest department signals in the session, and an event with no team or
    // department on it cannot move the posterior at all.
    recordEvent(`Searched & Selected Product: ${p.name}`, {
      pageType: 'Search',
      productId: p.id,
      productName: p.name,
      team: p.team,
      league: p.league,
      department: p.department,
    });
  };

  /**
   * Choosing a completion.
   *
   * The click emits its own paired measurement first. `rank` and `defaultRank`
   * were computed in the same pass from the same pool - one with the profile,
   * one without - so the difference between them is a count of the rows the
   * shopper did not have to read past, not an estimate of one.
   */
  const choose = (sug: Suggestion) => {
    if (isPersonalizationOn && sug.defaultRank > sug.rank) {
      recordEffort(
        saving({
          id: `suggest:${sug.id}`,
          eventId: null,
          page: 'home',
          surface: 'Search suggestions',
          kind: 'scroll_depth',
          count: sug.defaultRank - sug.rank,
          label: `"${sug.label}" surfaced at #${sug.rank} instead of #${sug.defaultRank}`,
          detail: sug.why,
        })
      );
    }
    if (sug.kind === 'product' && sug.product) {
      handleSelectSearchResult(sug.product);
      return;
    }
    submitQuery(sug.query);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      closeSearch();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (cursor >= 0 && rows[cursor]) choose(rows[cursor]);
      else submitQuery(searchQuery);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return;
      e.preventDefault();
      setIsSearchOpen(true);
      setCursor((c) => {
        const next = e.key === 'ArrowDown' ? c + 1 : c - 1;
        if (next < -1) return rows.length - 1;
        if (next >= rows.length) return -1;
        return next;
      });
    }
  };

  const handleCategoryClick = (dept?: Department) => {
    // Browsing is not searching. Leaving the query in place would let the
    // results page show a category the shopper picked filtered by a query they
    // have moved on from.
    clearSearch();
    setSearchQuery('');
    setNavigationTab('experience');
    setStorefrontPage('plp');
    setActiveDeptFilter(dept || null);
    if (!dept) {
      setActiveTeamOverride(null);
      setActiveLeagueFilter(null);
    }
    // pageType is passed explicitly: recordEvent derives it from storefrontPage,
    // which is still the previous page inside this same batch.
    recordEvent(dept ? `Browsed category: ${dept}` : 'Browsed all gear', {
      pageType: 'PLP',
      department: dept,
    });
  };

  // League links used to set a team override, and two of them named teams the
  // simulated catalog does not contain - so MLB and NHL browsed to an empty
  // grid. They now filter on the axis they actually describe.
  const handleLeagueClick = (league: League) => {
    clearSearch();
    setSearchQuery('');
    setNavigationTab('experience');
    setStorefrontPage('plp');
    setActiveDeptFilter(null);
    setActiveTeamOverride(null);
    setActiveLeagueFilter(league);
    recordEvent(`Browsed league: ${league}`, { pageType: 'PLP', league });
  };

  const predictedTeam = activeTeamOverride || intentPrediction.teams[0]?.team;

  return (
    <header className="shrink-0 bg-ink-900 text-white border-b border-white/10">
      {/* Primary row */}
      <div className="px-4 h-14 flex items-center justify-between gap-4">
        <button
          onClick={() => {
            clearSearch();
            setSearchQuery('');
            setNavigationTab('experience');
            setStorefrontPage('home');
          }}
          className="flex items-center gap-2.5 group shrink-0 text-left"
        >
          <ProSportsMark className="h-9 w-9 shadow-lg shadow-red-900/30 rounded-[9px] group-hover:scale-105 transition-transform" />
          <span className="hidden sm:block leading-none">
            <span className="block font-display font-extrabold text-[17px] tracking-tight">ProSports</span>
            <span className="block text-[10px] text-slate-400 font-medium mt-0.5">Official fan shop</span>
          </span>
        </button>

        {/* Search */}
        <div className="relative flex-1 max-w-xl hidden md:block" ref={searchRef}>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Try &quot;something for my son&quot; or &quot;hurts jersey under $80&quot;…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
              setCursor(-1);
            }}
            onFocus={() => setIsSearchOpen(true)}
            onKeyDown={onKeyDown}
            className="w-full bg-white/8 text-white pl-10 pr-4 py-2.5 rounded-full text-[13px] border border-white/12 focus:outline-none focus:border-red-500 focus:bg-white/12 placeholder-slate-400 transition-all"
          />

          {isSearchOpen && suggestions && (
            <div className="absolute left-0 right-0 top-12 bg-white text-slate-900 border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
              {/* What the query was understood to mean. Shown above the rows
                  because it is the thing that decided them. */}
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/80">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {suggestions.interpretation.nodes.length === 0 ? (
                    <span className="text-[10.5px] text-slate-500">
                      {settled
                        ? 'Nothing in that query maps onto the catalog yet. Enter falls back to your profile.'
                        : 'Reading the query…'}
                    </span>
                  ) : (
                    suggestions.interpretation.nodes.slice(0, 5).map((n, idx) => (
                      <span
                        key={`${n.kind}-${n.value}-${idx}`}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                          n.via === 'propagated'
                            ? 'border-slate-200 bg-white text-slate-500'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        }`}
                        title={n.note}
                      >
                        <span className="uppercase tracking-[0.08em] text-[8.5px] opacity-70">{n.kind}</span>
                        {n.value}
                        <span className="tabular-nums opacity-60">{Math.round(n.confidence * 100)}%</span>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="p-1.5 max-h-[22rem] overflow-y-auto">
                {scopes.length > 0 && (
                  <>
                    <div className="px-2 pt-1 pb-1 flex items-center gap-1.5 text-[8.5px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                      <Sparkles className="h-3 w-3" />
                      {suggestions.personalized ? 'Ranked for this shopper' : 'Most-shopped scopes'}
                    </div>
                    {scopes.map((sug) => {
                      const i = rows.indexOf(sug);
                      return (
                        <button
                          key={sug.id}
                          onMouseEnter={() => setCursor(i)}
                          onClick={() => choose(sug)}
                          className={`w-full px-2 py-1.5 flex items-center gap-2.5 text-left rounded-xl transition-colors ${
                            cursor === i ? 'bg-slate-100' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className="grid place-items-center h-8 w-8 rounded-lg bg-slate-100 shrink-0">
                            <Tag className="h-3.5 w-3.5 text-slate-500" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12px] font-semibold truncate">{sug.label}</span>
                            {sug.sublabel && (
                              <span className="block text-[10px] text-slate-500 truncate">{sug.sublabel}</span>
                            )}
                          </span>
                          {suggestions.personalized && sug.defaultRank !== sug.rank && (
                            <span
                              className={`shrink-0 inline-flex items-center gap-0.5 font-mono text-[9.5px] font-bold tabular-nums ${
                                sug.defaultRank > sug.rank ? 'text-emerald-600' : 'text-slate-400'
                              }`}
                              title={sug.why}
                            >
                              <ArrowUp
                                className={`h-3 w-3 ${sug.defaultRank > sug.rank ? '' : 'rotate-180'}`}
                              />
                              {sug.defaultRank}→{sug.rank}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </>
                )}

                {scopeProducts.length > 0 && (
                  <>
                    <div className="px-2 pt-2 pb-1 text-[8.5px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                      Products
                    </div>
                    {scopeProducts.map((sug) => {
                      const p = sug.product!;
                      const i = rows.indexOf(sug);
                      return (
                        <button
                          key={sug.id}
                          onMouseEnter={() => setCursor(i)}
                          onClick={() => choose(sug)}
                          className={`w-full px-2 py-2 flex items-center gap-3 text-left rounded-xl transition-colors group ${
                            cursor === i ? 'bg-slate-100' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className="h-11 w-11 rounded-lg bg-slate-100 overflow-hidden shrink-0 relative">
                            <ProductImage product={p} detail={false} className="absolute inset-0 h-full w-full" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12px] font-semibold truncate group-hover:text-red-600">
                              {p.name}
                            </span>
                            <span className="flex items-center gap-1.5 mt-0.5">
                              <TeamCrest team={p.team} size="xs" />
                              <LeagueBadge league={p.league} />
                              <span className="text-[10px] text-slate-500 truncate">{p.department}</span>
                            </span>
                          </span>
                          <span className="text-[12px] font-bold shrink-0">${p.price.toFixed(0)}</span>
                        </button>
                      );
                    })}
                  </>
                )}

                {/* No dead ends. Even a query that matches nothing gets a way
                    forward, and the row says plainly what it will do. */}
                {suggestions.rescue && settled && (
                  <div className="mt-1 mx-1 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2">
                    <p className="text-[10.5px] font-bold text-amber-900">{suggestions.rescue.headline}</p>
                    <p className="mt-0.5 text-[10px] text-amber-800 leading-snug">{suggestions.rescue.detail}</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => submitQuery(searchQuery)}
                className="w-full border-t border-slate-100 px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50 transition-colors"
              >
                <CornerDownLeft className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="text-[11.5px] text-slate-600 truncate">
                  Search for <b className="text-slate-900">{typed}</b>
                </span>
                <span className="flex-1" />
                <span className="shrink-0 font-mono text-[10px] text-slate-400 tabular-nums">
                  {suggestions.matches} match{suggestions.matches === 1 ? '' : 'es'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Account / wishlist / cart */}
        <div className="flex items-center gap-1 shrink-0">
          <button className="hidden sm:grid place-items-center h-10 w-10 rounded-full hover:bg-white/10 text-slate-300 transition-colors" title="Account">
            <User className="h-[18px] w-[18px]" />
          </button>
          <button className="hidden sm:grid place-items-center h-10 w-10 rounded-full hover:bg-white/10 text-slate-300 transition-colors" title="Wishlist">
            <Heart className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={() => {
              setNavigationTab('experience');
              setStorefrontPage('cart');
            }}
            className="relative ml-1 flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white pl-3 pr-3.5 py-2 rounded-full transition-colors shadow-lg shadow-red-900/30"
            title="Cart"
          >
            <ShoppingBag className="h-[18px] w-[18px]" />
            <span className="font-bold text-[13px] tabular-nums">{cartCount}</span>
          </button>
        </div>
      </div>

      {/* Utility row: categories on the left, shipping promise on the right.
          The league order in this nav is a model output - it is the first
          personalized thing a shopper meets, before a single pixel of the page
          below has loaded - so it carries a marker under the Explain reveal. */}
      <div
        className="relative bg-ink-950/70 border-t border-white/8 px-4 h-9 flex items-center justify-between gap-6 text-[12px] overflow-x-auto scrollbar-none"
        data-module="league-nav"
      >
        <ExplainMarker id="league-nav" className="top-1.5 right-2" />
        <nav className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => handleCategoryClick()}
            className={`px-2.5 py-1 rounded-full font-bold transition-colors ${
              !activeDeptFilter && !activeLeagueFilter
                ? 'bg-white/12 text-white'
                : 'text-slate-300 hover:text-white hover:bg-white/8'
            }`}
          >
            All gear
          </button>
          <span className="mx-1 h-4 w-px bg-white/12" />
          {NAV_LEAGUES.map((lg) => (
            <button
              key={lg}
              onClick={() => handleLeagueClick(lg)}
              className={`px-2.5 py-1 rounded-full font-semibold transition-colors ${
                activeLeagueFilter === lg ? 'bg-white/12 text-white' : 'text-slate-300 hover:text-white hover:bg-white/8'
              }`}
            >
              {lg}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-white/12" />
          {NAV_DEPTS.map((d) => (
            <button
              key={d}
              onClick={() => handleCategoryClick(d)}
              className={`px-2.5 py-1 rounded-full font-medium whitespace-nowrap transition-colors ${
                activeDeptFilter === d ? 'bg-white/12 text-white' : 'text-slate-300 hover:text-white hover:bg-white/8'
              }`}
            >
              {d}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {/* This used to read "Shopping as an Eagles fan · 90%", which told the
              shopper the site had scored them and put the number on the glass.
              A real store would put a shortcut to their club here and say
              nothing about how it knew. The shortcut is the personalization;
              the confidence behind it belongs in the rail. */}
          {isPersonalizationOn && predictedTeam && (
            <button
              onClick={() => {
                setActiveTeamOverride(predictedTeam);
                setActiveDeptFilter(null);
                setStorefrontPage('plp');
                recordEvent(`Opened team shop: ${predictedTeam}`, { team: predictedTeam, pageType: 'PLP' });
              }}
              className="hidden lg:flex items-center gap-1.5 bg-white/5 border border-white/15 hover:border-white/35 text-slate-200 hover:text-white rounded-full pl-1 pr-2.5 py-0.5 font-semibold text-[11px] transition-colors"
            >
              <TeamCrest team={predictedTeam} size="xs" />
              <span>{predictedTeam} shop</span>
            </button>
          )}
          <span className="hidden xl:flex items-center gap-1.5 text-slate-400 font-medium">
            <Truck className="h-3.5 w-3.5" />
            Free express shipping over $45
          </span>
        </div>
      </div>

      {/* Model feedback. A floating toast rather than a sixth band of chrome:
          it used to push the whole page down every time a signal landed. */}
      {lastModelFeedback && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-40 max-w-xs">
          <div className="flex items-start gap-2 bg-ink-950/95 text-slate-200 border border-straive-700/50 rounded-xl px-3 py-2 shadow-2xl backdrop-blur">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-straive-400 animate-pulse shrink-0" />
            <span className="text-[11px] leading-snug">{lastModelFeedback}</span>
          </div>
        </div>
      )}
    </header>
  );
};
