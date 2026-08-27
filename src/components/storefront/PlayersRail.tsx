/**
 * "Players you follow" - the storefront module fed by the topPlayer slot.
 *
 * WHY A PLAYER RAIL AND NOT ANOTHER PRODUCT GRID
 * ----------------------------------------------
 * Player affinity is the highest-decay signal in the profile: lambda 0.45,
 * against 0.35 for a club and 0.03 for a league. That is the model saying a
 * shopper's club is close to permanent and the player they are currently
 * following is close to a mood. A rail is the right shape for that - it is the
 * module that is allowed to be different on the shopper's next visit, and it is
 * the one that moves when a trade or a signing fires.
 *
 * It is also the module that most needs the stand-down. Player mass is thin
 * early on, and a rail confidently headed "Players you follow" over one weak
 * posterior would be the site inventing a relationship. So when nothing has
 * separated from the field, the rail keeps the same shape and quietly falls back
 * to the club roster in popularity order, with a heading that promises less.
 * Nothing on the stage announces which of the two just happened; the Decisions
 * tab says, and the Explain overlay points at it.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import type { Product } from '../../types';
import { TeamCrest } from '../brand/Identity';
import { ProductImage } from './ProductImage';
import { ExplainMarker } from './ExplainMarker';

const SHOWN = 5;

export const PlayersRail: React.FC = () => {
  const {
    products,
    visitorModel,
    isPersonalizationOn,
    setSelectedProduct,
    setStorefrontPage,
    recordEvent,
  } = useApp();

  /**
   * One representative product per player: their most popular attributed item.
   *
   * Built from the catalog rather than the roster tables so the rail can never
   * offer a player nothing is in stock for, and so a trade that re-badges a
   * player's jerseys moves this rail with the same rebuild that moves the grid.
   */
  const byPlayer = React.useMemo(() => {
    const best = new Map<string, Product>();
    for (const p of products) {
      if (!p.player) continue;
      const held = best.get(p.player);
      if (!held || p.popularity > held.popularity) best.set(p.player, p);
    }
    return best;
  }, [products]);

  const leadScore = visitorModel.topPlayer.ranked[0]?.score ?? 0;
  const personalized = isPersonalizationOn && leadScore > 0.12;

  const shown = React.useMemo(() => {
    if (personalized) {
      const ranked = visitorModel.topPlayer.ranked
        .map((entry) => ({ name: entry.label, product: byPlayer.get(entry.label) }))
        .filter((r): r is { name: string; product: Product } => Boolean(r.product));
      if (ranked.length >= 3) return ranked.slice(0, SHOWN);
      // Thin ranking. Top the list up from popularity rather than rendering a
      // rail with two cards in it.
      const seen = new Set(ranked.map((r) => r.name));
      const filler = [...byPlayer.entries()]
        .filter(([name]) => !seen.has(name))
        .sort((a, b) => b[1].popularity - a[1].popularity)
        .map(([name, product]) => ({ name, product }));
      return [...ranked, ...filler].slice(0, SHOWN);
    }
    return [...byPlayer.entries()]
      .sort((a, b) => b[1].popularity - a[1].popularity)
      .map(([name, product]) => ({ name, product }))
      .slice(0, SHOWN);
  }, [personalized, visitorModel.topPlayer, byPlayer]);

  if (shown.length < 3) return null;

  const open = (product: Product, name: string) => {
    setSelectedProduct(product);
    setStorefrontPage('pdp');
    recordEvent(`Opened player: ${name}`, {
      productId: product.id,
      team: product.team,
      department: product.department,
      pageType: 'PDP',
    });
  };

  return (
    <section className="relative px-4 sm:px-6 mt-7" data-module="players-rail">
      <ExplainMarker id="players-rail" className="top-0 right-5" />
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <h2 className="font-display text-[15px] font-extrabold text-slate-900 tracking-tight">
          {personalized ? 'Players you follow' : 'Shop by player'}
        </h2>
      </div>

      <div
        className="flex gap-2.5 overflow-x-auto pb-1.5 scrollbar-none"
        style={{ maskImage: 'linear-gradient(to right, #000 94%, transparent 100%)' }}
      >
        {shown.map(({ name, product }) => (
          <button
            key={name}
            onClick={() => open(product, name)}
            className="group w-[148px] shrink-0 rounded-2xl border border-slate-200 bg-white p-2.5 text-left hover:border-slate-300 hover:shadow-md transition-all"
          >
            <div className="relative h-24 grid place-items-center overflow-hidden rounded-xl bg-slate-50">
              <ProductImage
                product={product}
                detail={false}
                className="h-[86px] w-auto transition-transform duration-300 group-hover:scale-105"
              />
              {product.jerseyNumber && (
                <span className="absolute top-1 left-1 font-display text-[11px] font-black text-slate-400 tabular-nums">
                  #{product.jerseyNumber}
                </span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              <TeamCrest team={product.team} size="xs" />
              <span className="min-w-0 flex-1 font-display text-[12px] font-extrabold text-slate-900 truncate">
                {name}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              {product.team} · {product.department}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};
