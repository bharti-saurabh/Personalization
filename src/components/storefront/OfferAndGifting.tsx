/**
 * The two storefront surfaces fed by the scalar traits: price framing and the
 * gifting rail.
 *
 * These are the modules that make the point that personalization is not only
 * recommendation. Nothing here reorders a list. The price band decides whether
 * an offer surface appears at all and which end of the assortment leads it; the
 * gift scalar decides whether a whole rail exists. A shopper reading as
 * premium and self-buying sees a store with no discount messaging on the front
 * page, which is a real merchandising decision and not one a recommender makes.
 *
 * Both stand down rather than guess. A mid-market reading gets no offer band,
 * because "we are not sure how price sensitive you are" is not a reason to shout
 * about a sale, and gift intent that is not leading closes the rail rather than
 * offering a kids' section to someone shopping for themselves.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import type { Product } from '../../types';
import { ExplainMarker } from './ExplainMarker';
import { ProductImage } from './ProductImage';
import { Tag, Gift, ArrowRight } from 'lucide-react';

const RAIL = 6;

/**
 * The offer surface.
 *
 * Value-led: the discounted end, led by the deepest markdowns. Premium: the
 * authentic end, and no mention of price cuts at all. Mid market: nothing,
 * which is the honest answer to a flat posterior.
 */
export const PriceFraming: React.FC<{ onSelect: (p: Product) => void }> = ({ onSelect }) => {
  const { products, visitorModel, isPersonalizationOn } = useApp();
  const band = isPersonalizationOn ? visitorModel.priceBand.ranked[0]?.id ?? 'mid' : 'mid';

  const items = React.useMemo(() => {
    if (band === 'value') {
      return products
        .filter((p) => p.salePrice && p.salePrice < p.price)
        .sort((a, b) => (b.price - (b.salePrice ?? b.price)) - (a.price - (a.salePrice ?? a.price)))
        .slice(0, RAIL);
    }
    if (band === 'premium') {
      return products
        .filter((p) => p.priceBand === '$$$' || p.priceBand === '$$$$')
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, RAIL);
    }
    return [];
  }, [products, band]);

  if (items.length < 3) return null;

  const valueLed = band === 'value';

  return (
    <section className="px-4 sm:px-6 mt-7" data-module="price-framing">
      <div
        className={`relative rounded-3xl border p-4 sm:p-5 ${
          valueLed ? 'bg-amber-50 border-amber-200' : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        <ExplainMarker id="price-framing" className="top-3 right-3" />

        <div className="flex items-center gap-2.5 mb-3.5 min-w-0">
          <span
            className={`grid place-items-center h-9 w-9 rounded-xl shrink-0 ${
              valueLed ? 'bg-amber-500 text-white' : 'bg-white/10 text-white border border-white/20'
            }`}
          >
            <Tag className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2
              className={`font-display text-[17px] font-extrabold leading-tight truncate ${
                valueLed ? 'text-amber-950' : 'text-white'
              }`}
            >
              {valueLed ? 'Deals on your teams' : 'The authentic collection'}
            </h2>
            <p className={`text-[11px] truncate ${valueLed ? 'text-amber-800/80' : 'text-slate-400'}`}>
              {valueLed ? 'Marked down while stock lasts' : 'On-field quality, made to last'}
            </p>
          </div>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
          {items.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className={`group w-[136px] shrink-0 rounded-2xl border p-2.5 text-left transition-all ${
                valueLed
                  ? 'bg-white border-amber-200 hover:border-amber-400'
                  : 'bg-white/5 border-white/10 hover:border-white/30'
              }`}
            >
              <div
                className={`h-20 grid place-items-center rounded-xl overflow-hidden ${
                  valueLed ? 'bg-amber-50/60' : 'bg-white/5'
                }`}
              >
                <ProductImage
                  product={p}
                  detail={false}
                  ground={false}
                  className="h-[74px] w-auto transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div
                className={`mt-1.5 text-[11px] font-semibold truncate ${
                  valueLed ? 'text-slate-800' : 'text-slate-200'
                }`}
              >
                {p.name}
              </div>
              {valueLed && p.salePrice ? (
                <div className="text-[11px] font-mono">
                  <span className="font-bold text-red-600">${p.salePrice.toFixed(0)}</span>{' '}
                  <span className="text-slate-400 line-through">${p.price.toFixed(0)}</span>
                </div>
              ) : (
                <div className="text-[11px] font-mono font-bold text-white/90">${p.price.toFixed(0)}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

/**
 * The gifting rail. Opens only when the gift scalar is leading.
 *
 * The same reading also withholds the size prefill on every product page, which
 * is the cross-surface consequence worth watching: one scalar, two surfaces,
 * opposite directions. Guessing a size for a shopper buying for someone else is
 * the single most annoying thing a personalized store can do.
 */
export const GiftingRail: React.FC<{ onSelect: (p: Product) => void }> = ({ onSelect }) => {
  const { products, visitorModel, isPersonalizationOn, setStorefrontPage, recordEvent } = useApp();
  const leading = isPersonalizationOn && visitorModel.giftingPropensity.ranked[0]?.id === 'gift';

  const items = React.useMemo(() => {
    if (!leading) return [];
    const topTeam = visitorModel.topTeam.ranked[0]?.id;
    return products
      .filter((p) => p.ageGroup !== 'Adult' || p.gender === 'Kids' || p.department === 'Accessories')
      .sort((a, b) => {
        const clubBonus = (p: Product) => (topTeam && p.team === topTeam ? 40 : 0);
        return b.popularity + clubBonus(b) - (a.popularity + clubBonus(a));
      })
      .slice(0, RAIL);
  }, [leading, products, visitorModel.topTeam]);

  if (!leading || items.length < 3) return null;

  return (
    <section className="px-4 sm:px-6 mt-7" data-module="gifting">
      <div className="relative rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <ExplainMarker id="gifting" className="top-3 right-3" />

        <div className="flex items-center gap-2.5 mb-3.5 min-w-0">
          <span className="grid place-items-center h-9 w-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 shrink-0">
            <Gift className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[17px] font-extrabold text-slate-900 leading-tight truncate">
              Gifts and kids
            </h2>
            <p className="text-[11px] text-slate-500 truncate">Easy sizes, gift receipts included</p>
          </div>
          <button
            onClick={() => {
              setStorefrontPage('plp');
              recordEvent('Opened gift guide', { pageType: 'PLP' });
            }}
            className="shrink-0 text-[12px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
          >
            Gift guide
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
          {items.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="group w-[136px] shrink-0 rounded-2xl border border-slate-200 bg-white p-2.5 text-left hover:border-slate-300 hover:shadow-md transition-all"
            >
              <div className="h-20 grid place-items-center rounded-xl bg-slate-50 overflow-hidden">
                <ProductImage
                  product={p}
                  detail={false}
                  className="h-[74px] w-auto transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="mt-1.5 text-[11px] font-semibold text-slate-800 truncate">{p.name}</div>
              <div className="text-[11px] font-mono font-bold text-slate-900">
                ${(p.salePrice ?? p.price).toFixed(0)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
