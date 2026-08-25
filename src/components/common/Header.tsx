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
 */

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, Heart, User, ShoppingBag, Truck } from 'lucide-react';
import { Department, League } from '../../types';
import { TeamCrest, LeagueBadge } from '../brand/Identity';
import { ProductImage } from '../storefront/ProductImage';

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
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
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

  const filteredSearch = searchQuery.trim()
    ? products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.team.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.department.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice(0, 6)
    : [];

  const handleSelectSearchResult = (p: (typeof products)[0]) => {
    setSelectedProduct(p);
    setNavigationTab('experience');
    setStorefrontPage('pdp');
    setSearchQuery('');
    setIsSearchOpen(false);
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

  const handleCategoryClick = (dept?: Department) => {
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
    setNavigationTab('experience');
    setStorefrontPage('plp');
    setActiveDeptFilter(null);
    setActiveTeamOverride(null);
    setActiveLeagueFilter(league);
    recordEvent(`Browsed league: ${league}`, { pageType: 'PLP', league });
  };

  const predictedTeam = activeTeamOverride || intentPrediction.teams[0]?.team;
  const predictedPct = Math.round((intentPrediction.teams[0]?.probability ?? 0) * 100);

  return (
    <header className="shrink-0 bg-ink-900 text-white border-b border-white/10">
      {/* Primary row */}
      <div className="px-4 h-14 flex items-center justify-between gap-4">
        <button
          onClick={() => {
            setNavigationTab('experience');
            setStorefrontPage('home');
          }}
          className="flex items-center gap-2.5 group shrink-0 text-left"
        >
          <ProSportsMark className="h-9 w-9 shadow-lg shadow-red-900/30 rounded-[9px] group-hover:scale-105 transition-transform" />
          <span className="hidden sm:block leading-none">
            <span className="block font-display font-extrabold text-[17px] tracking-tight">ProSports</span>
            <span className="block text-[10px] text-slate-400 font-medium mt-0.5">Official Fan Shop</span>
          </span>
        </button>

        {/* Search */}
        <div className="relative flex-1 max-w-xl hidden md:block" ref={searchRef}>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search jerseys, hats, teams, players…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => setIsSearchOpen(true)}
            className="w-full bg-white/8 text-white pl-10 pr-4 py-2.5 rounded-full text-[13px] border border-white/12 focus:outline-none focus:border-red-500 focus:bg-white/12 placeholder-slate-400 transition-all"
          />

          {isSearchOpen && filteredSearch.length > 0 && (
            <div className="absolute left-0 right-0 top-12 bg-white text-slate-900 border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden p-1.5">
              {filteredSearch.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectSearchResult(p)}
                  className="w-full px-2 py-2 flex items-center gap-3 text-left rounded-xl hover:bg-slate-100 transition-colors group"
                >
                  <span className="h-11 w-11 rounded-lg bg-slate-100 overflow-hidden shrink-0 relative">
                    <ProductImage product={p} detail={false} className="absolute inset-0 h-full w-full" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold truncate group-hover:text-red-600">{p.name}</span>
                    <span className="flex items-center gap-1.5 mt-0.5">
                      <TeamCrest team={p.team} size="xs" />
                      <LeagueBadge league={p.league} />
                      <span className="text-[10px] text-slate-500 truncate">{p.department}</span>
                    </span>
                  </span>
                  <span className="text-[12px] font-bold shrink-0">${p.price.toFixed(0)}</span>
                </button>
              ))}
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

      {/* Utility row: categories on the left, shipping promise on the right. */}
      <div className="bg-ink-950/70 border-t border-white/8 px-4 h-9 flex items-center justify-between gap-6 text-[12px] overflow-x-auto scrollbar-none">
        <nav className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => handleCategoryClick()}
            className={`px-2.5 py-1 rounded-full font-bold transition-colors ${
              !activeDeptFilter && !activeLeagueFilter
                ? 'bg-white/12 text-white'
                : 'text-slate-300 hover:text-white hover:bg-white/8'
            }`}
          >
            All Gear
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
          {isPersonalizationOn && predictedTeam && (
            <span className="hidden lg:flex items-center gap-1.5 bg-emerald-500/12 border border-emerald-400/25 text-emerald-300 rounded-full pl-1 pr-2.5 py-0.5 font-semibold text-[11px]">
              <TeamCrest team={predictedTeam} size="xs" />
              <span>
                Shopping as an <b className="text-emerald-200">{predictedTeam}</b> fan · {predictedPct}%
              </span>
            </span>
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
