import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductCard } from './ProductCard';
import { ProductImage } from './ProductImage';
import { PlayersRail } from './PlayersRail';
import { PriceFraming, GiftingRail } from './OfferAndGifting';
import { ExplainMarker } from './ExplainMarker';
import { Sparkles, ArrowRight, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { TeamId, Department } from '../../types';
import { TEAM_IDS, TEAM_BY_ID, DEPARTMENT_IDS } from '../../sim/taxonomy';
import { TeamCrest, LeagueBadge, DeptGlyph } from '../brand/Identity';
import { rankMove } from '../../ml/effort';
import { SURFACE_POLICIES, applySuppression } from '../../ml/engine';
import { WithheldNotice } from './WithheldNotice';

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
    recordEffort,
    userEvents,
    suppressionCtx,
    reportSuppression,
  } = useApp();

  // Primary predicted team or fallback
  const primaryTeam = (isPersonalizationOn ? activeTeamOverride || intentPrediction.teams[0]?.team || 'Eagles' : 'Eagles') as TeamId;
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

  /**
   * The rail under "Picked for ...".
   *
   * This used to be every product the predicted club sells, in catalog order,
   * rendered as an open-ended grid - roughly a hundred and forty cards down the
   * page, under a caption claiming they were ranked and in stock. They were
   * neither. It is a real ranking now, and the caption is true:
   *
   *   in stock   pre-orders are dropped, because a rail that leads with
   *              something you cannot have yet is a bad first impression
   *   ranked     by the department posterior the intent model just produced,
   *              broken by catalog popularity within a department
   *   capped     at twelve, which is a rail rather than a page
   *
   * With personalization off it is the global bestseller list instead: the
   * same twelve for every visitor, which is the comparison being made.
   */
  const RAIL_SIZE = 12;
  const personalizedCarouselProducts = useMemo(() => {
    if (!isPersonalizationOn || heroTeamProducts.length === 0) {
      return globalBestSellers.filter((p) => p.inventoryStatus !== 'Pre-Order').slice(0, RAIL_SIZE);
    }
    const deptRank = new Map(intentPrediction.departments.map((d, i) => [d.department as string, i]));
    return heroTeamProducts
      .filter((p) => p.inventoryStatus !== 'Pre-Order')
      .sort(
        (a, b) =>
          (deptRank.get(a.department) ?? 99) - (deptRank.get(b.department) ?? 99) ||
          b.popularity - a.popularity
      )
      .slice(0, RAIL_SIZE);
  }, [isPersonalizationOn, heroTeamProducts, globalBestSellers, intentPrediction]);

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

  /**
   * The hero has to earn the hero slot.
   *
   * This is the clearest case for per-surface thresholds in the whole build. The
   * banner is one slot, it is the first thing on the page, and it makes a
   * categorical claim - "you are an Eagles fan" - in a club's colours across the
   * full width of the screen. Getting that wrong is not a slightly worse
   * recommendation; it is the store telling a Cowboys fan who they are. The
   * fourth tile of a carousel makes no such claim and can be wrong quietly, so
   * it is allowed to be a guess.
   *
   * The bar is `SURFACE_POLICIES.hero.leadThreshold`, read from the same table
   * every other surface reads. A local constant here would drift from the panel
   * that documents it within a fortnight.
   */
  const heroGate = useMemo(() => {
    if (!heroProduct) return null;
    return applySuppression(
      [
        {
          product: heroProduct,
          // The hero's confidence is the CLUB read, not the product's score.
          // What the banner is betting on is the identity, and the merchandise
          // is only how it says so.
          confidence: intentPrediction.teams[0]?.probability ?? 0,
          source: 'Intent',
        },
      ],
      suppressionCtx,
      SURFACE_POLICIES.hero
    );
  }, [heroProduct, intentPrediction, suppressionCtx]);

  // The banner is only dressed in a club's colours when the gate let it through.
  const heroPersonalized = isPersonalizationOn && !!heroGate && heroGate.kept.length > 0;

  useEffect(() => {
    reportSuppression(heroGate);
    return () => reportSuppression(null, SURFACE_POLICIES.hero.id);
  }, [heroGate, reportSuppression]);

  /**
   * The trending rail, and the only place on this storefront where the rivalry
   * rule has anything to do.
   *
   * WHY THIS RAIL HAD TO EXIST FOR THE RULE TO BE REAL. Every other rail here
   * is filtered to the club the model predicted, and the two on the product
   * page are neighbours of an anchor the shopper chose. All three are
   * single-club pools by construction, so a rival cannot reach them and
   * "never surface a rival's merchandise to a loyalist" was true only in the
   * way that a rule about a thing that cannot happen is true. Trending is
   * different: it is the store's own bestseller list, cross-club by definition,
   * and it is exactly the surface a real merchandiser has to defend. For a
   * confident Eagles fan, twenty-one of the store's top twenty-four sellers are
   * Cowboys and Chiefs merchandise. Ungated, this rail hands a loyalist a wall
   * of the two clubs they will not buy.
   *
   * IT IS FETCHED FIFTY DEEP FOR EIGHT SLOTS. A gate placed after a retrieval
   * that returns exactly enough can only leave a hole, and on this rail the
   * hole is most of the rail - so the over-fetch here is far larger than the
   * 8-for-4 the product page uses.
   *
   * The confidence is popularity on a 0..1 scale, which is what
   * `SURFACE_POLICIES.home_carousel.scale` names. Dividing by a hundred here
   * rather than storing it that way keeps the catalog's own field readable.
   */
  const TRENDING_DEPTH = 50;
  const trendingCandidates = useMemo(
    () =>
      globalBestSellers
        .filter((p) => p.inventoryStatus !== 'Pre-Order')
        .slice(0, TRENDING_DEPTH)
        .map((product) => ({
          product,
          confidence: product.popularity / 100,
          source: 'Bestsellers',
        })),
    [globalBestSellers]
  );

  const trendingGate = useMemo(
    () => applySuppression(trendingCandidates, suppressionCtx, SURFACE_POLICIES.home_carousel),
    [trendingCandidates, suppressionCtx]
  );

  useEffect(() => {
    reportSuppression(trendingGate);
    return () => reportSuppression(null, SURFACE_POLICIES.home_carousel.id);
  }, [trendingGate, reportSuppression]);

  /*
   * THE EFFORT LEDGER IS WRITTEN ON CLICK, NOT ON RENDER, and the reason is
   * that a saving needs a subject.
   *
   * On render, all this page knows is that it re-ordered three rails. It does
   * not know what the shopper came for, so any saving it claimed would be a
   * claim about the model's own prediction - "we put what we predicted at the
   * top", which is true by construction and worth nothing.
   *
   * On click it knows exactly what they came for, because they just took it.
   * Where that thing sat in the personalized ordering is on screen; where the
   * same thing sits in the merchandised default is computed right here from the
   * same catalog. The difference is a fact about this shopper, and it can be
   * checked by anyone who wants to count the alphabetical list themselves.
   *
   * Nothing is recorded with personalization off: the two orderings are the
   * same list and the diff is structurally zero.
   */
  const beat = userEvents.length;
  const lastEventId = userEvents[0]?.id ?? null;

  const logRankMove = (surface: string, subject: string, personalized: number, dflt: number, perRow = 1) => {
    if (!isPersonalizationOn) return;
    recordEffort(
      rankMove({
        id: `home:${surface}:${beat}:${subject}`,
        eventId: lastEventId,
        page: 'home',
        surface,
        subject,
        personalizedPosition: personalized,
        defaultPosition: dflt,
        perRow,
      })
    );
  };

  const handleTeamClick = (team: TeamId) => {
    logRankMove(
      'Your teams rail',
      `${team} shop`,
      teamRows.findIndex((r) => r.team === team) + 1,
      popularTeams.indexOf(team) + 1
    );
    setActiveTeamOverride(team);
    // The team has to travel on the event, not just into the override, or the
    // journal shows a click that visibly changed the page while claiming the
    // model saw no signal.
    recordEvent(`Clicked predicted team: ${team}`, { team });
  };

  const handleProductSelect = (p: (typeof products)[0]) => {
    // Four cards fit across the rail, so positions are read as rail-flicks
    // rather than as raw slots. Against the bestseller list the same product is
    // usually a long way down, which is the whole point of the row.
    logRankMove(
      'Picked-for-you rail',
      p.name,
      personalizedCarouselProducts.findIndex((x) => x.id === p.id) + 1,
      globalBestSellers.findIndex((x) => x.id === p.id) + 1,
      4
    );
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
      <section className="px-4 sm:px-6 pt-4" data-module="hero">
        <div
          className="relative overflow-hidden rounded-3xl text-white shadow-xl"
          style={{
            background: heroPersonalized && heroConfig
              ? `linear-gradient(115deg, ${heroConfig.primaryColor} 0%, #0f0e16 62%)`
              : 'linear-gradient(115deg, #262432 0%, #0f0e16 62%)',
          }}
        >
          <ExplainMarker id="hero" className="top-3 right-3" />

          {/* Oversized ghost crest, bled off the right edge. */}
          {heroPersonalized && (
            <div className="absolute -right-16 -top-16 opacity-[0.08] pointer-events-none select-none">
              <TeamCrest team={primaryTeam} size="lg" className="h-72! w-auto!" />
            </div>
          )}
          <div
            className="absolute -left-24 -bottom-32 h-80 w-80 rounded-full blur-3xl pointer-events-none"
            style={{ background: heroPersonalized && heroConfig ? `${heroConfig.secondaryColor}33` : '#ffffff10' }}
          />

          <div className="relative z-10 flex items-center gap-6 p-6 sm:p-8">
            <div className="min-w-0 flex-1">
              {/* Retail voice only. This ribbon used to read "Personalized for
                  you · 90% predicted intent", which is the site telling the
                  shopper its own posterior. A store says which shop you are in;
                  it does not publish how sure it is that you belong there. The
                  three states still differ, they just differ the way a real
                  banner would: the club's own shop, the season's shop, or the
                  standard front page. The confidence, the threshold and the
                  stand-down all still exist and are all in the rail. */}
              {heroPersonalized ? (
                <span className="inline-flex items-center gap-1.5 bg-white/12 backdrop-blur border border-white/20 text-[11px] font-bold px-3 py-1 rounded-full mb-3">
                  <Sparkles className="h-3 w-3 text-straive-300" />
                  Your team shop
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 bg-white/8 border border-white/15 text-slate-300 text-[11px] font-semibold px-3 py-1 rounded-full mb-3">
                  New season, new kits
                </span>
              )}

              <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight leading-[0.95] mb-2.5">
                {heroPersonalized ? (
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
                {heroPersonalized
                  ? `Authentic ${primaryTeam} jerseys, sideline caps and locker-room fleece, ranked for how you shop.`
                  : 'Bestselling jerseys, caps and gear across the NFL, NBA and MLB.'}
              </p>

              <div className="flex items-center gap-3 mt-5">
                <button
                  onClick={() => {
                    if (heroPersonalized) setActiveTeamOverride(primaryTeam);
                    setStorefrontPage('plp');
                  }}
                  className="bg-white text-slate-900 hover:bg-slate-100 font-bold px-5 py-2.5 rounded-full text-[13px] shadow-lg flex items-center gap-2 transition-all active:scale-95"
                >
                  {heroPersonalized ? `Shop the ${primaryTeam} store` : 'Browse all merchandise'}
                  <ArrowRight className="h-4 w-4" />
                </button>
                {heroPersonalized && heroConfig && <LeagueBadge league={heroConfig.league} className="py-1!" />}
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
      {/* Clubs. A crest in the club's own colours. The posterior used to be   */}
      {/* drawn as a bar under each card with "90% predicted" beneath it,      */}
      {/* which is a scoring readout on a shop front. The ORDER is the model    */}
      {/* output; a shopper reads order without being told it is a ranking, and */}
      {/* the numbers behind it are one tab away in the rail.                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative px-4 sm:px-6 mt-7" data-module="teams-ladder">
        <ExplainMarker id="teams-ladder" className="top-0 right-5" />
        <SectionHead title={isPersonalizationOn ? 'Your teams' : 'Popular teams'} />

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

                <div className={`mt-2.5 text-[10px] font-semibold ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                  {cfg?.league}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Players. New in this layout: the topPlayer slot had no surface at all,
          which meant the highest-decay signal in the profile was being folded
          and never spent. */}
      <PlayersRail />

      {/* Departments */}
      <section className="relative px-4 sm:px-6 mt-7" data-module="categories">
        <ExplainMarker id="categories" className="top-0 right-5" />
        <SectionHead title={isPersonalizationOn ? 'Shop your categories' : 'Shop by category'} />

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
                  // The ledger's cleanest row. Ten departments, alphabetical by
                  // default; the shopper takes one, and the two positions are
                  // both countable off the screen.
                  logRankMove(
                    'Category rail',
                    deptItem.department,
                    idx + 1,
                    alphabeticalDepartments.indexOf(deptItem.department) + 1
                  );
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
      <section className="px-4 sm:px-6 mt-7" data-module="picked-for-you">
        <div className="relative bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
          <ExplainMarker id="picked-for-you" className="top-3 right-3" />
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
                  {/* "Picked for an Eagles fan" named the segment the model had
                      put the shopper in, which is the site reading its own notes
                      out loud. "Picked for you" is what a store says. */}
                  {isPersonalizationOn ? 'Picked for you' : 'Bestselling gear'}
                </h2>
                <p className="text-[11px] text-slate-500 truncate">
                  {isPersonalizationOn
                    ? 'In stock and ready to ship'
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

          <Carousel>
            {personalizedCarouselProducts.map((prod) => (
              <div key={prod.id} className="w-[196px] shrink-0 snap-start">
                <ProductCard product={prod} onSelect={handleProductSelect} />
              </div>
            ))}
          </Carousel>
        </div>
      </section>

      {/* Trending, gated. The rail above is the club the model picked; this one
          is the whole store, which is why it is the one that can hand a
          loyalist their rival's shirt. The notice under it names the rule that
          stopped that - never the products, because naming them would undo the
          refusal. */}
      {/* The two scalar-trait surfaces. Both stand down rather than guess, so on
          a mid-market self-buying shopper neither of these renders at all and
          the page below the carousel simply ends. */}
      <GiftingRail onSelect={handleProductSelect} />
      <PriceFraming onSelect={handleProductSelect} />

      <section className="px-4 sm:px-6 mt-7 pb-2">
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0 mb-4">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
              <TrendingUp className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[17px] font-extrabold text-slate-900 leading-tight truncate">
                Trending across the leagues
              </h2>
              <p className="text-[11px] text-slate-500 truncate">
                {trendingGate.suppressed.length > 0
                  ? `The store's bestsellers, ${trendingGate.suppressed.length} of them held back for you`
                  : "The store's bestsellers, every club"}
              </p>
            </div>
          </div>

          <Carousel>
            {trendingGate.kept.map((c) => (
              <div key={c.product.id} className="w-[196px] shrink-0 snap-start">
                <ProductCard product={c.product} onSelect={handleProductSelect} />
              </div>
            ))}
          </Carousel>

          <WithheldNotice result={trendingGate} active={isPersonalizationOn} className="mt-3" />
        </div>
      </section>
    </div>
  );
};

/**
 * A horizontal product rail.
 *
 * A rail rather than a grid because a grid of recommendations makes an implicit
 * claim that the grid is the whole answer, and invites the eye to read down the
 * page. A rail says "here is the top of a ranked list, in order" - which is what
 * the intent model actually produced - and it costs one screen of height rather
 * than five.
 *
 * The arrows page by the visible width and disable themselves at the ends, so a
 * greyed-out arrow is an honest signal that there is nothing more that way. The
 * track is still a plain scroll container underneath, so a trackpad, a touch
 * screen and the keyboard all work without the arrows.
 */
/**
 * How far from a hard edge still counts as being at it.
 *
 * Mandatory snapping does not settle the track at zero: the first card's snap
 * point sits at the track's own left padding, so a rail that has never been
 * touched reports scrollLeft 4. At a two-pixel tolerance that read as scrolled,
 * and the left fade painted a white wash over the first card on load.
 */
const EDGE_SLACK = 8;

const Carousel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= EDGE_SLACK);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - EDGE_SLACK);
  }, []);

  // Run once on mount as well as on scroll: a rail whose contents fit has no
  // scroll event to wait for, and both arrows should read as disabled.
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      trackRef.current = el;
      if (el) requestAnimationFrame(sync);
    },
    [sync]
  );

  const page = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(200, el.clientWidth - 80), behavior: 'smooth' });
  };

  const arrow = (disabled: boolean) =>
    `grid place-items-center h-8 w-8 rounded-full border transition-colors ${
      disabled
        ? 'border-slate-200 text-slate-300 cursor-default'
        : 'border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900'
    }`;

  return (
    <div className="relative">
      <div
        ref={attach}
        onScroll={sync}
        className="flex gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-1 -mx-1 px-1"
      >
        {children}
      </div>

      {/* Edge fade, so a half-visible card reads as "scrolls on" rather than as
          a card that got cut off. Pointer events off or it would eat clicks on
          the card underneath it. */}
      {!atEnd && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-white to-transparent" />
      )}
      {!atStart && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-linear-to-r from-white to-transparent" />
      )}

      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => page(-1)} disabled={atStart} aria-label="Previous" className={arrow(atStart)}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button onClick={() => page(1)} disabled={atEnd} aria-label="Next" className={arrow(atEnd)}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

/** Consistent section heading: title plus the one line that says how it was ordered. */
/**
 * A section heading, and optionally an ordinary retail line under it.
 *
 * `note` is optional now because most of these captions used to explain the
 * model - "Ranked by predicted club affinity" - and a shop does not caption its
 * own merchandising. Where a note survives it is the kind of line a merchandiser
 * would write. Where none is right, the heading stands alone.
 */
const SectionHead: React.FC<{ title: string; note?: string }> = ({ title, note }) => (
  <div className="flex items-baseline justify-between gap-3 mb-2.5">
    <h2 className="font-display text-[15px] font-extrabold text-slate-900 tracking-tight">{title}</h2>
    {note && <span className="text-[10.5px] text-slate-400 font-medium truncate">{note}</span>}
  </div>
);
