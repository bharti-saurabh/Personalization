import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductCard } from './ProductCard';
import { ProductImage } from './ProductImage';
import { Sparkles, ArrowRight, TrendingUp } from 'lucide-react';
import { TeamId, Department } from '../../types';
import { TEAM_IDS, TEAM_BY_ID, DEPARTMENT_IDS } from '../../sim/taxonomy';
import { TeamCrest, LeagueBadge, DeptGlyph } from '../brand/Identity';

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
  } = useApp();

  // Primary predicted team or fallback
  const primaryTeam = (isPersonalizationOn ? activeTeamOverride || intentPrediction.teams[0]?.team || 'Eagles' : 'Eagles') as TeamId;
  const primaryTeamProb = Math.round((intentPrediction.teams[0]?.probability || 0.7) * 100);
  const heroConfig = TEAM_BY_ID[primaryTeam];

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
  const alphabeticalDepartments = useMemo(() => [...DEPARTMENT_IDS].sort((a, b) => a.localeCompare(b)), []);
  const globalBestSellers = useMemo(() => [...products].sort((a, b) => b.popularity - a.popularity), [products]);

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
  const personalizedCarouselProducts =
    isPersonalizationOn && heroTeamProducts.length >= 1 ? heroTeamProducts : globalBestSellers;

  /**
   * The single garment the hero shows off, so the banner is merchandise rather
   * than type. It follows the predicted DEPARTMENT as well as the club, which
   * is the point: a shopper the model reads as buying caps should not be shown
   * a jersey on the banner. If that department has nothing in stock for the
   * club, it falls back to the club's bestseller rather than showing nothing.
   */
  const heroProduct = useMemo(() => {
    const pool = isPersonalizationOn && heroTeamProducts.length ? heroTeamProducts : globalBestSellers;
    const topDept = isPersonalizationOn ? intentPrediction.departments[0]?.department : undefined;
    const onDept = topDept ? pool.filter((p) => p.department === topDept) : [];
    const from = onDept.length ? onDept : pool;
    return [...from].sort((a, b) => b.popularity - a.popularity)[0];
  }, [isPersonalizationOn, heroTeamProducts, globalBestSellers, intentPrediction]);

  const handleTeamClick = (team: TeamId) => {
    setActiveTeamOverride(team);
    // The team has to travel on the event, not just into the override, or the
    // journal shows a click that visibly changed the page while claiming the
    // model saw no signal.
    recordEvent(`Clicked predicted team: ${team}`, { team });
  };

  const handleProductSelect = (p: (typeof products)[0]) => {
    setSelectedProduct(p);
    setStorefrontPage('pdp');
    recordEvent(`Selected Homepage Product: ${p.name}`, {
      productId: p.id,
      team: p.team,
      department: p.department,
    });
  };

  return (
    <div className="pb-14 bg-slate-100 text-slate-900 min-h-full">
      {/* ------------------------------------------------------------------ */}
      {/* Hero. Personalized, it is dressed in the predicted club's own two    */}
      {/* colours and shows that club's bestselling piece - so the difference  */}
      {/* the model makes is visible before a single number is read.          */}
      {/* ------------------------------------------------------------------ */}
      <section className="px-4 sm:px-6 pt-4">
        <div
          className="relative overflow-hidden rounded-3xl text-white shadow-xl"
          style={{
            background: isPersonalizationOn && heroConfig
              ? `linear-gradient(115deg, ${heroConfig.primaryColor} 0%, #0f0e16 62%)`
              : 'linear-gradient(115deg, #262432 0%, #0f0e16 62%)',
          }}
        >
          {/* Oversized ghost crest, bled off the right edge. */}
          {isPersonalizationOn && (
            <div className="absolute -right-16 -top-16 opacity-[0.08] pointer-events-none select-none">
              <TeamCrest team={primaryTeam} size="lg" className="h-72! w-auto!" />
            </div>
          )}
          <div
            className="absolute -left-24 -bottom-32 h-80 w-80 rounded-full blur-3xl pointer-events-none"
            style={{ background: isPersonalizationOn && heroConfig ? `${heroConfig.secondaryColor}33` : '#ffffff10' }}
          />

          <div className="relative z-10 flex items-center gap-6 p-6 sm:p-8">
            <div className="min-w-0 flex-1">
              {isPersonalizationOn ? (
                <span className="inline-flex items-center gap-1.5 bg-white/12 backdrop-blur border border-white/20 text-[11px] font-bold px-3 py-1 rounded-full mb-3">
                  <Sparkles className="h-3 w-3 text-straive-300" />
                  Personalized for you · {primaryTeamProb}% predicted intent
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 bg-white/8 border border-white/15 text-slate-300 text-[11px] font-semibold px-3 py-1 rounded-full mb-3">
                  Standard experience · personalization off
                </span>
              )}

              <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight leading-[0.95] mb-2.5">
                {isPersonalizationOn ? (
                  <>
                    Gear up for
                    <br />
                    <span className="text-white">{heroConfig?.city ?? ''} </span>
                    <span style={{ color: heroConfig?.secondaryColor }}>{primaryTeam}</span>
                  </>
                ) : (
                  <>
                    The ultimate
                    <br />
                    fan shop
                  </>
                )}
              </h1>

              <p className="text-slate-300 text-[13px] max-w-md leading-relaxed">
                {isPersonalizationOn
                  ? `Authentic ${primaryTeam} jerseys, sideline caps and locker-room fleece, ranked for how you shop.`
                  : 'Bestselling jerseys, caps and gear across the NFL, NBA and MLB.'}
              </p>

              <div className="flex items-center gap-3 mt-5">
                <button
                  onClick={() => {
                    if (isPersonalizationOn) setActiveTeamOverride(primaryTeam);
                    setStorefrontPage('plp');
                  }}
                  className="bg-white text-slate-900 hover:bg-slate-100 font-bold px-5 py-2.5 rounded-full text-[13px] shadow-lg flex items-center gap-2 transition-all active:scale-95"
                >
                  {isPersonalizationOn ? `Shop the ${primaryTeam} store` : 'Browse all merchandise'}
                  <ArrowRight className="h-4 w-4" />
                </button>
                {isPersonalizationOn && heroConfig && <LeagueBadge league={heroConfig.league} className="py-1!" />}
              </div>
            </div>

            {/* The merchandise itself, drawn at hero scale. */}
            {heroProduct && (
              <button
                onClick={() => handleProductSelect(heroProduct)}
                className="hidden md:block shrink-0 relative group"
                title={heroProduct.name}
              >
                <span className="absolute inset-3 rounded-full bg-white/10 blur-2xl" />
                <span className="absolute inset-0 rounded-full ring-1 ring-white/15" />
                <ProductImage
                  product={heroProduct}
                  ground={false}
                  className="relative h-48 w-48 lg:h-56 lg:w-56 drop-shadow-2xl transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-2"
                />
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white/12 backdrop-blur border border-white/20 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">
                  {heroProduct.department} · ${heroProduct.salePrice?.toFixed(0) ?? heroProduct.price.toFixed(0)}
                </span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Clubs. A crest in the club's own colours, plus the posterior drawn   */}
      {/* as a bar - six rows of bold text all looked the same.                */}
      {/* ------------------------------------------------------------------ */}
      <section className="px-4 sm:px-6 mt-7">
        <SectionHead
          title={isPersonalizationOn ? 'Your teams' : 'Popular teams'}
          note={isPersonalizationOn ? 'Ranked by predicted club affinity' : 'Ranked by national market size'}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {teamRows.map((tItem, idx) => {
            const cfg = TEAM_BY_ID[tItem.team];
            const isSelected = activeTeamOverride ? activeTeamOverride === tItem.team : idx === 0 && isPersonalizationOn;
            return (
              <button
                key={tItem.team}
                onClick={() => handleTeamClick(tItem.team)}
                className={`group relative overflow-hidden rounded-2xl border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-transparent text-white shadow-lg'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
                }`}
                style={
                  isSelected && cfg
                    ? { background: `linear-gradient(140deg, ${cfg.primaryColor}, ${cfg.primaryColor}cc)` }
                    : undefined
                }
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`grid place-items-center h-9 w-9 rounded-xl shrink-0 ${
                      isSelected ? 'bg-white/90 shadow-inner' : 'bg-slate-50 border border-slate-100'
                    }`}
                  >
                    <TeamCrest team={tItem.team} size="sm" />
                  </span>
                  <div className="min-w-0">
                    <div className={`font-display text-[13px] font-extrabold leading-tight truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {tItem.team}
                    </div>
                    <div className={`text-[10px] truncate ${isSelected ? 'text-white/70' : 'text-slate-500'}`}>
                      {cfg?.city ?? ''}
                    </div>
                  </div>
                </div>

                {tItem.probability !== null ? (
                  <div className="mt-2.5">
                    <div className={`h-1 w-full rounded-full overflow-hidden ${isSelected ? 'bg-white/25' : 'bg-slate-100'}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isSelected ? 'bg-white' : 'bg-slate-400'}`}
                        style={{ width: `${Math.max(3, Math.round(tItem.probability * 100))}%` }}
                      />
                    </div>
                    <div className={`mt-1 text-[10px] font-mono font-bold ${isSelected ? 'text-white/90' : 'text-slate-500'}`}>
                      {Math.round(tItem.probability * 100)}% predicted
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 text-[10px] font-semibold text-slate-400">{cfg?.league}</div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Departments */}
      <section className="px-4 sm:px-6 mt-7">
        <SectionHead
          title={isPersonalizationOn ? 'Shop your categories' : 'Shop by category'}
          note={isPersonalizationOn ? 'Ranked by predicted department intent' : 'A – Z'}
        />

        <div
          className="flex gap-2.5 overflow-x-auto pb-1.5 scrollbar-none"
          style={{ maskImage: 'linear-gradient(to right, #000 92%, transparent 100%)' }}
        >
          {departmentRows.map((deptItem, idx) => {
            const isDeptSelected = activeDeptFilter
              ? activeDeptFilter === deptItem.department
              : idx === 0 && isPersonalizationOn;
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
                className={`shrink-0 flex items-center gap-2.5 pl-2.5 pr-4 py-2 rounded-2xl border transition-all ${
                  isDeptSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <span
                  className={`grid place-items-center h-8 w-8 rounded-xl ${
                    isDeptSelected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <DeptGlyph department={deptItem.department} className="h-[18px] w-[18px]" />
                </span>
                <span className="text-left leading-tight">
                  <span className="block text-[12px] font-bold whitespace-nowrap">{deptItem.department}</span>
                  {deptItem.probability !== null && (
                    <span className={`block text-[10px] font-mono ${isDeptSelected ? 'text-white/70' : 'text-slate-400'}`}>
                      {Math.round(deptItem.probability * 100)}% intent
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recommended grid */}
      <section className="px-4 sm:px-6 mt-7">
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              {isPersonalizationOn ? (
                <span className="grid place-items-center h-9 w-9 rounded-xl bg-straive-50 text-straive-600 border border-straive-200 shrink-0">
                  <Sparkles className="h-4 w-4" />
                </span>
              ) : (
                <span className="grid place-items-center h-9 w-9 rounded-xl bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                  <TrendingUp className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0">
                <h2 className="font-display text-[17px] font-extrabold text-slate-900 leading-tight truncate">
                  {/* "a Eagles fan" - two of the six club names start with a
                      vowel sound, so the article has to follow the name. */}
                  {isPersonalizationOn
                    ? `Picked for a${/^[AEIOU]/.test(primaryTeam) ? 'n' : ''} ${primaryTeam} fan`
                    : 'Bestselling gear'}
                </h2>
                <p className="text-[11px] text-slate-500 truncate">
                  {isPersonalizationOn
                    ? 'Ranked by the intent model, then filtered to what is in stock'
                    : 'The same list every visitor sees, ordered by sales volume'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setStorefrontPage('plp')}
              className="shrink-0 text-[12px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

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

/** Consistent section heading: title plus the one line that says how it was ordered. */
const SectionHead: React.FC<{ title: string; note: string }> = ({ title, note }) => (
  <div className="flex items-baseline justify-between gap-3 mb-2.5">
    <h2 className="font-display text-[15px] font-extrabold text-slate-900 tracking-tight">{title}</h2>
    <span className="text-[10.5px] text-slate-400 font-medium truncate">{note}</span>
  </div>
);
