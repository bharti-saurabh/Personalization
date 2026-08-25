import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductCard } from './ProductCard';
import { Sparkles, Trophy, ArrowRight, ShieldAlert, Check } from 'lucide-react';
import { TeamId, Department } from '../../types';
import { TEAM_IDS, TEAM_BY_ID, DEPARTMENT_IDS } from '../../sim/taxonomy';

export const StorefrontHome: React.FC = () => {
  const {
    isPersonalizationOn,
    intentPrediction,
    products,
    setSelectedProduct,
    setStorefrontPage,
    setActiveTeamOverride,
    activeTeamOverride,
    activeDeptFilter,
    setActiveDeptFilter,
    recordEvent,
    selectedScenario,
  } = useApp();

  // Primary predicted team or fallback
  const primaryTeam = isPersonalizationOn ? activeTeamOverride || intentPrediction.teams[0]?.team || 'Eagles' : 'All Teams';
  const primaryTeamProb = Math.round((intentPrediction.teams[0]?.probability || 0.7) * 100);

  // --- The unpersonalized storefront ---------------------------------------
  // These orderings have to be genuinely different from the model's, or the OFF
  // state is just the ON state with the probability badges hidden - which is
  // exactly what a sceptical audience will accuse a demo of doing. So each one
  // is derived from something the model plays no part in:
  //   teams       -> national market size, the same list for every visitor
  //   departments -> alphabetical, the default any catalog falls back to
  //   products    -> global bestsellers across all six clubs, not one team's
  const popularTeams = useMemo(
    () => [...TEAM_IDS].sort((a, b) => (TEAM_BY_ID[b]?.marketSize ?? 0) - (TEAM_BY_ID[a]?.marketSize ?? 0)),
    []
  );
  const alphabeticalDepartments = useMemo(
    () => [...DEPARTMENT_IDS].sort((a, b) => a.localeCompare(b)),
    []
  );
  const globalBestSellers = useMemo(
    () => [...products].sort((a, b) => b.popularity - a.popularity),
    [products]
  );

  // Rows rendered by the team and department widgets. Personalized rows carry a
  // probability; unpersonalized ones deliberately do not have one to carry.
  const teamRows: { team: TeamId; probability: number | null }[] = isPersonalizationOn
    ? intentPrediction.teams.map((t) => ({ team: t.team, probability: t.probability }))
    : popularTeams.map((team) => ({ team, probability: null }));

  const departmentRows: { department: Department; probability: number | null }[] = isPersonalizationOn
    ? intentPrediction.departments.map((d) => ({ department: d.department, probability: d.probability }))
    : alphabeticalDepartments.map((department) => ({ department, probability: null }));

  // Filter products by team or popularity
  const heroTeamProducts = products.filter((p) => p.team === primaryTeam);
  const personalizedCarouselProducts = isPersonalizationOn && heroTeamProducts.length >= 1
    ? heroTeamProducts
    : globalBestSellers;

  const handleTeamClick = (team: TeamId) => {
    setActiveTeamOverride(team);
    // The team has to travel on the event, not just into the override, or the
    // journal shows a click that visibly changed the page while claiming the
    // model saw no signal.
    recordEvent(`Clicked predicted team: ${team}`, { team });
  };

  const handleProductSelect = (p: typeof products[0]) => {
    setSelectedProduct(p);
    setStorefrontPage('pdp');
    recordEvent(`Selected Homepage Product: ${p.name}`, {
      productId: p.id,
      team: p.team,
      department: p.department,
    });
  };

  return (
    <div className="space-y-6 pb-12 bg-slate-50 text-slate-900 min-h-screen">
      {/* Announcement Strip */}
      <div className="bg-slate-900 text-white py-1.5 px-4 text-center text-xs font-semibold tracking-wide flex items-center justify-center space-x-2 border-b border-slate-800">
        <Trophy className="h-3.5 w-3.5 text-amber-400" />
        <span>OFFICIAL MERCHANDISE • FREE SHIPPING ON ORDERS $75+ WITH CODE: <b>SPORTS2026</b></span>
      </div>

      {/* Hero Header Banner */}
      <div className="px-4 sm:px-6">
        {isPersonalizationOn ? (
          /* PERSONALIZED HERO */
          <div className="relative overflow-hidden rounded-2xl bg-slate-950 text-white p-6 sm:p-8 shadow-md border border-slate-800">
            {/* Background Gradient & Glow */}
            <div className="absolute -right-16 -bottom-16 w-96 h-96 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
              <div className="max-w-xl">
                <div className="inline-flex items-center space-x-1.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 text-[11px] px-2.5 py-0.5 rounded-full mb-3 font-semibold">
                  <Sparkles className="h-3 w-3 text-emerald-400" />
                  <span>Personalized ({primaryTeamProb}% Predicted Intent)</span>
                </div>

                <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-tight leading-none mb-2 font-serif">
                  GEAR UP FOR <span className="text-emerald-400">{primaryTeam.toUpperCase()}</span> SEASON
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm font-sans">
                  Official {primaryTeam} jerseys, sideline hats, locker room hoodies, and authentic gear tailored for you.
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-3">
                <button
                  onClick={() => {
                    setActiveTeamOverride(primaryTeam as TeamId);
                    setStorefrontPage('plp');
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md flex items-center space-x-2 transition-all active:scale-95"
                >
                  <span>Shop Official {primaryTeam} Shop</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* STANDARD GENERIC HERO */
          <div className="relative overflow-hidden rounded-2xl bg-slate-950 text-white p-6 sm:p-8 shadow-md border border-slate-800">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="max-w-xl">
                <div className="inline-flex items-center space-x-1.5 bg-slate-800 text-slate-300 text-[11px] px-2.5 py-0.5 rounded-full mb-3 font-semibold">
                  <span>Standard Experience (Personalization OFF)</span>
                </div>

                <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-tight leading-none mb-2 font-serif">
                  THE ULTIMATE FAN SHOP
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm">
                  Shop bestselling jerseys, hats, and gear across all major leagues (NFL, NBA, MLB).
                </p>
              </div>

              <button
                onClick={() => setStorefrontPage('plp')}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md flex items-center space-x-2"
              >
                <span>Browse All Merchandise</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Favorite Teams Widget */}
      <section className="px-4 sm:px-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider font-mono flex items-center gap-1.5">
            <Trophy className="h-4 w-4 text-red-600" />
            <span>{isPersonalizationOn ? 'Predicted Favorite Teams' : 'Popular Teams'}</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {teamRows.map((tItem, idx) => {
            const isSelected = activeTeamOverride ? activeTeamOverride === tItem.team : (idx === 0 && isPersonalizationOn);
            return (
              <button
                key={tItem.team}
                onClick={() => handleTeamClick(tItem.team)}
                className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-slate-900 text-white border-red-500 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-100/80'
                }`}
              >
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-wider block">{tItem.team}</span>
                  <span className="text-[10px] opacity-70 block">
                    {TEAM_BY_ID[tItem.team]?.league ?? ''}
                  </span>
                </div>
                {tItem.probability !== null && (
                  <span
                    className={`text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded ${
                      isSelected ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {Math.round(tItem.probability * 100)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Recommended Departments Section */}
      <section className="px-4 sm:px-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
            {isPersonalizationOn ? 'Recommended Departments' : 'Departments'}
          </h2>
        </div>

        <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
          {departmentRows.map((deptItem, idx) => {
            const isDeptSelected = activeDeptFilter
              ? activeDeptFilter === deptItem.department
              : (idx === 0 && isPersonalizationOn);
            return (
              <button
                key={deptItem.department}
                onClick={() => {
                  setActiveDeptFilter(deptItem.department);
                  setStorefrontPage('plp');
                  recordEvent(`Selected recommended department: ${deptItem.department}`, {
                    pageType: 'PLP',
                    department: deptItem.department,
                  });
                }}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs shrink-0 flex items-center space-x-1.5 transition-all ${
                  isDeptSelected
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{deptItem.department}</span>
                {deptItem.probability !== null && (
                  <span className="text-[10px] opacity-80 font-mono">
                    ({Math.round(deptItem.probability * 100)}%)
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Personalized Product Carousel */}
      <section className="px-4 sm:px-6">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900 font-serif">
              {isPersonalizationOn ? `Recommended Gear for ${primaryTeam}` : 'Bestselling Gear'}
            </h2>

            <button
              onClick={() => setStorefrontPage('plp')}
              className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {personalizedCarouselProducts.map((prod) => (
              <ProductCard key={prod.id} product={prod} onSelect={handleProductSelect} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

