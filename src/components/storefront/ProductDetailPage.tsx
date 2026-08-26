import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductCard } from './ProductCard';
import { ProductImage } from './ProductImage';
import {
  Star,
  ShoppingBag,
  ShieldCheck,
  Truck,
  RotateCcw,
  Sparkles,
  Info,
  ChevronRight,
  Home,
  X,
  ArrowLeftRight,
  Flame,
  TrendingDown,
} from 'lucide-react';
import { SimilarityMatch, ComplementMatch } from '../../types';
import { TEAM_BY_ID } from '../../sim/taxonomy';
import { TeamCrest, LeagueBadge } from '../brand/Identity';
import { saving } from '../../ml/effort';

export const ProductDetailPage: React.FC = () => {
  const {
    products,
    selectedProduct,
    similarityMatches,
    complementMatches,
    addToCart,
    setSelectedProduct,
    setStorefrontPage,
    recordEvent,
    activeExplainedProduct,
    setActiveExplainedProduct,
    isPersonalizationOn,
    recordEffort,
    userEvents,
  } = useApp();

  const [selectedSize, setSelectedSize] = useState<string>('L');
  const [explainSimilarityModal, setExplainSimilarityModal] = useState<SimilarityMatch | null>(null);

  // Compute displayed Similarity Matches depending on Personalization state
  const displayedSimilarityMatches: SimilarityMatch[] = React.useMemo(() => {
    if (isPersonalizationOn) {
      return similarityMatches;
    }
    // Personalization OFF: Standard unweighted catalog list sorted by default price ascending
    const defaultCatalogList = products
      .filter((p) => p.id !== selectedProduct.id)
      .slice()
      .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
      .slice(0, 4);

    return defaultCatalogList.map((prod) => ({
      product: prod,
      totalScore: 0,
      breakdown: {
        teamMatch: 0,
        playerMatch: 0,
        deptMatch: 0,
        styleMatch: 0,
        priceProximity: 0,
        coViewStrength: 0,
      },
      explanation: 'Standard unweighted catalog product listing.',
    }));
  }, [isPersonalizationOn, similarityMatches, products, selectedProduct]);

  // Compute displayed Complement Matches depending on Personalization state
  const displayedComplementMatches: ComplementMatch[] = React.useMemo(() => {
    if (isPersonalizationOn) {
      return complementMatches;
    }
    // Personalization OFF: Standard generic cross-sell items across other teams & departments
    const genericCrossSells = products
      .filter((p) => p.id !== selectedProduct.id && p.team !== selectedProduct.team)
      .slice()
      .sort((a, b) => b.price - a.price || b.name.localeCompare(a.name))
      .slice(0, 4);

    return genericCrossSells.map((prod) => ({
      product: prod,
      complementScore: 0,
      relationshipType: 'Cart Accessory' as const,
      supportingSignal: 'Standard catalog cross-sell',
      breakdown: {
        coOrder: 0,
        coCart: 0,
        deptCompatibility: 0,
        teamMatch: 0,
      },
      explanation: 'Generic storewide featured catalog item.',
    }));
  }, [isPersonalizationOn, complementMatches, products, selectedProduct]);

  /**
   * The slots the complement engine refused to fill.
   *
   * This is the one surface where suppression genuinely removes impressions
   * rather than swapping them. The un-personalized rail always serves four -
   * it is a price sort over the catalog and it can always find four. The
   * personalized rail serves only what survives cross-department, in-stock,
   * team-consistency and a co-order probability above zero, and when the graph
   * has nothing to say it comes back with two, or one, and renders that many.
   *
   * The difference is countable off the same screen, against the same anchor,
   * in the same render - the pairing ml/effort.ts asks for. What is being
   * claimed is narrow and worth stating: not that the withheld slots would have
   * been bad, but that no evidence stood behind them, which is why they are
   * priced at three seconds of attention and no click.
   */
  const RAIL_SLOTS = 4;
  useEffect(() => {
    if (!isPersonalizationOn) return;
    const withheld = RAIL_SLOTS - complementMatches.length;
    if (withheld <= 0) return;
    recordEffort(
      saving({
        // Keyed on the ANCHOR alone, not on the beat. The rail for one product
        // is one decision, and it does not become a second one because an
        // unrelated event elsewhere on the page bumped the event count.
        id: `pdp:complement-gate:${selectedProduct.id}`,
        eventId: userEvents[0]?.id ?? null,
        page: 'pdp',
        surface: 'Complete the look',
        kind: 'suppressed_impression',
        count: withheld,
        label: `Withheld ${withheld} of ${RAIL_SLOTS} complement slots`,
        detail:
          `the co-order graph had evidence for ${complementMatches.length}; ` +
          `the un-personalized rail fills all ${RAIL_SLOTS} from a price sort regardless`,
      })
    );
  }, [isPersonalizationOn, complementMatches, selectedProduct, userEvents, recordEffort]);

  const handleProductSelect = (p: typeof selectedProduct) => {
    setSelectedProduct(p);
    recordEvent(`Viewed PDP: ${p.name}`, {
      productId: p.id,
      team: p.team,
      department: p.department,
    });
  };

  const handleExplainSimilarityClick = (match: SimilarityMatch, e: React.MouseEvent) => {
    e.stopPropagation();
    setExplainSimilarityModal(match);
    recordEvent(`Opened Explain Match Modal for: ${match.product.name}`);
  };

  return (
    <div className="space-y-8 pb-12 bg-slate-50 min-h-screen">
      {/* Breadcrumb. The listing page has one and this page did not, so arriving
          on a product felt like being teleported - there was no visible trail
          back to the shop you came from. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-0">
        <nav className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <button onClick={() => setStorefrontPage('home')} className="hover:text-red-600 flex items-center gap-1">
            <Home className="h-3 w-3" />
            Home
          </button>
          <ChevronRight className="h-3 w-3 text-slate-300" />
          <button onClick={() => setStorefrontPage('plp')} className="hover:text-red-600">
            {TEAM_BY_ID[selectedProduct.team].fullName}
          </button>
          <ChevronRight className="h-3 w-3 text-slate-300" />
          <span className="font-bold text-slate-800">{selectedProduct.department}</span>
        </nav>
      </div>

      {/*
        Market notice.

        Full width, above the fold, and written in the second person. When a
        trade fires while a shopper is standing on this page, the product they
        clicked silently becomes a different club's product. Re-ranking the
        carousels below without saying that would be the single most confusing
        thing the demo could do - so the page says what happened, names the old
        club, and labels itself simulated.
      */}
      {selectedProduct.marketFlag && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-3">
          <div className="rounded-xl border border-straive-300 bg-straive-50 px-4 py-2.5 flex items-start gap-3">
            <span className="mt-0.5 shrink-0 grid place-items-center h-6 w-6 rounded-full bg-straive-500 text-white">
              {selectedProduct.movedFrom ? (
                <ArrowLeftRight className="h-3.5 w-3.5" />
              ) : selectedProduct.marketFlag.lift < 1 ? (
                <TrendingDown className="h-3.5 w-3.5" />
              ) : (
                <Flame className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold text-slate-900 leading-snug">
                {selectedProduct.marketFlag.headline}
                <span className="ml-2 align-middle text-[8.5px] font-bold uppercase tracking-wide rounded px-1 py-px bg-white border border-straive-200 text-straive-700">
                  Simulated market event
                </span>
              </p>
              <p className="text-[11px] text-slate-600 leading-snug mt-0.5">
                {selectedProduct.movedFrom
                  ? `This item moved with the player. It kept its product id and its place in your cart, and it now carries ${TEAM_BY_ID[selectedProduct.team].fullName} colours instead of ${TEAM_BY_ID[selectedProduct.movedFrom.team].fullName}.`
                  : selectedProduct.marketFlag.lift < 1
                    ? `Demand for this item was cut ${Math.round((1 - selectedProduct.marketFlag.lift) * 100)}% by the event, and it has fallen in every ranking below.`
                    : `Demand for this item was lifted ${Math.round((selectedProduct.marketFlag.lift - 1) * 100)}% by the event, and it has risen in every ranking below.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main PDP Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column: Product Visual Banner */}
          <div className="space-y-4">
            <div className="relative h-96 rounded-xl p-5 border border-slate-200 overflow-hidden">
              {/* Procedurally drawn merchandise render - see ProductImage.tsx */}
              <ProductImage
                product={selectedProduct}
                className="absolute inset-0 h-full w-full"
              />
              <div className="relative flex justify-between items-start z-10">
                {/* Club identity, drawn rather than spelled out. "NFL • EAGLES" in
                    small caps was the only thing on this page that told you whose
                    shop you were in, and it read as a tag rather than as a crest. */}
                <span className="flex items-center gap-2 bg-white/95 backdrop-blur-sm pl-1.5 pr-2.5 py-1.5 rounded-full border border-slate-200 shadow-sm">
                  <TeamCrest team={selectedProduct.team} size="sm" />
                  <span className="flex flex-col leading-none gap-0.5">
                    <span className="text-[11px] font-extrabold text-slate-900 uppercase tracking-wider">
                      {selectedProduct.team}
                    </span>
                    <LeagueBadge league={selectedProduct.league} />
                  </span>
                </span>
                <span className="bg-emerald-500 text-slate-950 font-black text-xs px-3 py-1 rounded-full shadow-xs">
                  {selectedProduct.inventoryStatus}
                </span>
              </div>
            </div>

            {/* Caption strip. Kept below the image rather than overlaid on it -
                the garment is drawn to fill the frame, so an overlay landed on
                the hem. */}
            <div className="flex items-baseline justify-between gap-3 px-1">
              <div>
                <div className="text-sm font-extrabold uppercase tracking-widest text-slate-700">
                  {/* Style families that already carry the brand would otherwise
                      read "Nike • Nike Vapor F.U.S.E." */}
                  {selectedProduct.styleFamily.startsWith(selectedProduct.brand)
                    ? selectedProduct.styleFamily
                    : `${selectedProduct.brand} • ${selectedProduct.styleFamily}`}
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">
                  {selectedProduct.colorway} • {selectedProduct.gender}
                </div>
              </div>
              <span className="text-[11px] text-slate-400 font-semibold whitespace-nowrap">
                Authentic Licensed Merchandise
              </span>
            </div>
          </div>

          {/* Right Column: Product Info & Actions */}
          <div className="space-y-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-xs font-extrabold text-red-600 uppercase tracking-widest">
                <span>{selectedProduct.team}</span>
                <span>•</span>
                <span>{selectedProduct.department}</span>
              </div>

              <h1 className="text-2xl font-black text-slate-900 font-display leading-snug mt-1">
                {selectedProduct.name}
              </h1>

              {/* Rating */}
              <div className="flex items-center space-x-2 my-2 text-xs">
                <div className="flex text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <span className="font-extrabold text-slate-900">{selectedProduct.rating}</span>
                <span className="text-slate-400">({selectedProduct.reviewCount} customer reviews)</span>
              </div>

              {/* Price */}
              <div className="my-4">
                {selectedProduct.salePrice ? (
                  <div className="flex items-baseline space-x-2">
                    <span className="text-3xl font-black text-red-600">${selectedProduct.salePrice}</span>
                    <span className="text-base text-slate-400 line-through">${selectedProduct.price}</span>
                    <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded">
                      SAVE ${(selectedProduct.price - selectedProduct.salePrice).toFixed(2)}
                    </span>
                  </div>
                ) : (
                  <span className="text-3xl font-black text-slate-900">${selectedProduct.price}</span>
                )}
              </div>

              {/* Size Selector */}
              {selectedProduct.department !== 'Collectibles' && (
                <div className="space-y-2 my-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-800">Select Size:</span>
                    <span className="text-red-600 font-semibold cursor-pointer">Size Chart</span>
                  </div>
                  <div className="flex space-x-2">
                    {['S', 'M', 'L', 'XL', '2XL'].map((size) => (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`w-11 h-10 rounded-lg text-xs font-bold transition-all border ${
                          selectedSize === size
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                            : 'bg-white text-slate-800 border-slate-300 hover:border-slate-400'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Add to Cart Button */}
              <button
                onClick={() => {
                  addToCart(selectedProduct, selectedSize);
                  setStorefrontPage('cart');
                }}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold py-3.5 rounded-xl text-sm shadow-md flex items-center justify-center space-x-2 transition-transform active:scale-98"
              >
                <ShoppingBag className="h-5 w-5" />
                <span>ADD TO CART — ${(selectedProduct.salePrice || selectedProduct.price).toFixed(2)}</span>
              </button>
            </div>

            {/* Value Props Badges */}
            <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-100 text-[11px] text-slate-600 font-medium">
              <div className="flex items-center space-x-1.5">
                <Truck className="h-4 w-4 text-emerald-600" />
                <span>Ships Next Day</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <RotateCcw className="h-4 w-4 text-emerald-600" />
                <span>90-Day Returns</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>100% Guaranteed</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Banner if Personalization is OFF */}
      {!isPersonalizationOn && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-600 font-medium gap-2 shadow-2xs">
            <div className="flex items-center space-x-2">
              <Info className="h-4 w-4 text-slate-500 shrink-0" />
              <span>
                Personalization is <b>OFF</b> — Showing standard unweighted catalog recommendations without vector similarity models or ML decision explanations.
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold border border-slate-300">
              Standard Catalog
            </span>
          </div>
        </div>
      )}

      {/* --- CAROUSEL 1: YOU MAY ALSO LIKE (Similarity Match Engine) --- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-extrabold text-slate-900 font-display">
                  {isPersonalizationOn ? 'You May Also Like' : 'Similar Products'}
                </h2>
                {isPersonalizationOn && (
                  <span className="bg-indigo-100 text-indigo-900 text-xs font-bold px-2.5 py-0.5 rounded-full border border-indigo-300 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-indigo-600" />
                    Vector Similarity Engine
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {isPersonalizationOn
                  ? `Substitutes matching team (${selectedProduct.team}), department, style family & price band.`
                  : `Explore popular products matching ${selectedProduct.team} and ${selectedProduct.department}.`}
              </p>
            </div>

            {/* Only when personalization is OFF. With it on, the badge beside the
                heading already names the engine, and two chips saying the same
                thing a hand apart is noise rather than emphasis. */}
            {!isPersonalizationOn && (
              <div className="text-[11px] font-mono px-2.5 py-1 rounded border text-slate-600 bg-slate-100 border-slate-200">
                Standard Catalog Match
              </div>
            )}
          </div>

          {/* Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {displayedSimilarityMatches.map((match) => (
              <div key={match.product.id} className="relative flex flex-col justify-between">
                <ProductCard
                  product={match.product}
                  onSelect={handleProductSelect}
                  badgeText={isPersonalizationOn ? `${Math.round(match.totalScore * 100)}% Similar` : undefined}
                  badgeType={isPersonalizationOn ? 'similarity' : undefined}
                />

                {/* Explain Match Trigger Action Button - ONLY when Personalization is ON */}
                {isPersonalizationOn && (
                  <button
                    onClick={(e) => handleExplainSimilarityClick(match, e)}
                    className="mt-2 w-full bg-slate-100 hover:bg-indigo-50 text-indigo-900 font-bold text-xs py-1.5 rounded-lg border border-indigo-200 transition-colors flex items-center justify-center space-x-1"
                  >
                    <Info className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Explain Match Score</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- CAROUSEL 2: COMPLETE THE LOOK (Cross-Sell Complement) --- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-extrabold text-slate-900 font-display">
                  {isPersonalizationOn ? 'Complete the Look' : 'Frequently Bought Together'}
                </h2>
                {isPersonalizationOn && (
                  <span className="bg-amber-100 text-amber-900 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-300 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-600" />
                    Cross-Sell Complement Engine
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {isPersonalizationOn
                  ? 'Directional cross-department recommendations (Hat, Hoodie, Accessories, Collectibles).'
                  : 'Popular cross-department items frequently purchased by fans.'}
              </p>
            </div>

            {!isPersonalizationOn && (
              <div className="text-[11px] font-mono px-2.5 py-1 rounded border text-slate-600 bg-slate-100 border-slate-200">
                Standard Cross-Sell Catalog
              </div>
            )}
          </div>

          {/* Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {displayedComplementMatches.map((comp) => (
              <div key={comp.product.id} className="relative flex flex-col justify-between">
                <ProductCard
                  product={comp.product}
                  onSelect={handleProductSelect}
                  badgeText={isPersonalizationOn ? `${Math.round(comp.complementScore * 100)}% Complement` : undefined}
                  badgeType={isPersonalizationOn ? 'complement' : undefined}
                />

                {/* ML Relationship & Explanation Box - ONLY when Personalization is ON */}
                {isPersonalizationOn && (
                  <div className="mt-2 bg-amber-50 p-2 rounded-lg border border-amber-200 text-[11px] text-amber-900 space-y-0.5">
                    <div className="font-bold flex items-center justify-between">
                      <span>{comp.relationshipType}</span>
                      <span className="font-mono text-[10px] text-amber-700 font-extrabold">
                        Score: {comp.complementScore}
                      </span>
                    </div>
                    <div className="text-[10px] text-amber-800 line-clamp-2">{comp.explanation}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EXPLAIN MATCH MODAL */}
      {explainSimilarityModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative space-y-4 animate-scaleUp">
            <button
              onClick={() => setExplainSimilarityModal(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-800 rounded-lg bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-2 text-indigo-900 font-extrabold text-sm">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <span>Similarity Match Rationale</span>
            </div>

            <div>
              <h3 className="font-extrabold text-slate-900 text-base">{explainSimilarityModal.product.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Anchor Product: <b>{selectedProduct.name}</b>
              </p>
            </div>

            {/* Score Breakdown Bars */}
            <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <div className="flex justify-between font-bold text-slate-900 pb-1 border-b border-slate-200">
                <span>Signal Component</span>
                <span>Weighted Score Contribution</span>
              </div>

              <div className="flex justify-between items-center text-slate-700">
                <span>Team Match ({selectedProduct.team})</span>
                <span className="font-mono font-bold text-emerald-700">
                  +{explainSimilarityModal.breakdown.teamMatch} pts
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-700">
                <span>Department ({selectedProduct.department})</span>
                <span className="font-mono font-bold text-emerald-700">
                  +{explainSimilarityModal.breakdown.deptMatch} pts
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-700">
                <span>Player Match</span>
                <span className="font-mono font-bold text-emerald-700">
                  +{explainSimilarityModal.breakdown.playerMatch} pts
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-700">
                <span>Price Proximity</span>
                <span className="font-mono font-bold text-emerald-700">
                  +{explainSimilarityModal.breakdown.priceProximity} pts
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-700">
                <span>Co-View Behavior Strength</span>
                <span className="font-mono font-bold text-emerald-700">
                  +{explainSimilarityModal.breakdown.coViewStrength} pts
                </span>
              </div>
            </div>

            {/* Final Text Explanation */}
            <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl text-xs text-indigo-950 font-medium">
              <div className="font-bold text-indigo-900 mb-1">Generated Model Explanation:</div>
              {explainSimilarityModal.explanation}
            </div>

            <button
              onClick={() => setExplainSimilarityModal(null)}
              className="w-full bg-slate-900 text-white font-bold py-2.5 rounded-xl text-xs"
            >
              Close Explanation
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
