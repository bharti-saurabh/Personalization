import React from 'react';
import { Product } from '../../types';
import { Star, Sparkles, Flame, TrendingDown, ArrowLeftRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ProductImage } from './ProductImage';
import { BadgeExplainer, pickStat, useBadgeStats } from './BadgeExplainer';
import { useFitPrediction } from './SizeAndFit';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  badgeText?: string;
  badgeType?: 'personalized' | 'similarity' | 'complement';
}

/**
 * Five-star rating strip. The catalog stores a fractional rating, so the last
 * lit star is clipped to the remainder rather than rounded - rounding 4.2 up to
 * five full stars would overstate a number that is printed right next to it.
 */
const Stars: React.FC<{ rating: number }> = ({ rating }) => {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span className="relative inline-flex shrink-0" aria-label={`${rating} out of 5`}>
      <span className="flex text-slate-300">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="h-3 w-3 fill-current" />
        ))}
      </span>
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
        <span className="flex text-amber-400">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className="h-3 w-3 fill-current" />
          ))}
        </span>
      </span>
    </span>
  );
};

export const ProductCard: React.FC<ProductCardProps> = ({ product, onSelect, badgeText, badgeType }) => {
  const { addToCart, products } = useApp();

  const sale = product.salePrice;
  const pctOff = sale ? Math.round(((product.price - sale) / product.price) * 100) : 0;

  // Every badge on this tile, with the population statistic behind it. The
  // index is shared across all tiles rendered against the same catalog.
  const badgeStats = useBadgeStats(product, products);

  /*
   * QUICK ADD IS A SIZE DECISION, and it used to be `addToCart(product, 'L')`.
   *
   * That is wrong twice over. It puts an adult apparel size on a hat, on a
   * toddler tee and on a pennant, and it commits the shopper to a size the
   * store has no reason to believe is theirs - on a tile that shows no size
   * control at all, so there is nothing to correct.
   *
   * The tile now adds only what the fit model will defend: a prefill that
   * cleared its own bar, in a size this product actually has. Everything else
   * routes to the product page, where the ladder, the confidence and the
   * reasons are on screen and the choice is the shopper's.
   */
  const fit = useFitPrediction(product);
  const quickSize = fit.prefill && fit.size && fit.available ? fit.size : null;

  // The market flag's own wording, kept identical to the label ml/badges.ts
  // computes so the tooltip and the chip can never disagree. A demand CUT used
  // to render as "Hot market", which was the wrong word for the event.
  const marketLabel = product.movedFrom
    ? `From ${product.movedFrom.team}`
    : product.marketFlag && product.marketFlag.lift < 1
      ? 'Demand cut'
      : 'Hot market';

  return (
    <div className="bg-white rounded-lg border border-slate-200 hover:border-slate-400 hover:shadow-lg transition-all duration-200 flex flex-col overflow-hidden group font-sans">
      {/* Merchandise visual */}
      <div
        onClick={() => onSelect(product)}
        className="relative aspect-square bg-slate-50 cursor-pointer overflow-hidden"
      >
        {/* Procedurally drawn merchandise render - see ProductImage.tsx */}
        <ProductImage
          product={product}
          className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-105"
        />

        {/* Promo flag, top-left. A percentage beats the word "Sale": it is the
            thing a shopper is actually scanning for. */}
        <div className="absolute top-0 left-0 z-10 flex flex-col items-start gap-1 p-2">
          {/*
            Market flag, above everything else.

            It sits first because it is the only badge on this tile that is
            about the world rather than about the product, and because after a
            trade fires it is the answer to the question the shopper is actually
            asking - why does this jersey say Dallas when I clicked on it in
            Philadelphia. A cut is flagged as loudly as a lift; a merchandiser
            who only sees the upside will over-buy.
          */}
          {product.marketFlag && (
            <BadgeExplainer stat={pickStat(badgeStats, marketLabel)}>
              <span
                className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide flex items-center gap-1 max-w-[9.5rem] ${
                  product.marketFlag.lift < 1
                    ? 'bg-slate-700 text-white'
                    : 'bg-straive-500 text-white'
                }`}
              >
                {product.movedFrom ? (
                  <ArrowLeftRight className="h-2.5 w-2.5 shrink-0" />
                ) : product.marketFlag.lift < 1 ? (
                  <TrendingDown className="h-2.5 w-2.5 shrink-0" />
                ) : (
                  <Flame className="h-2.5 w-2.5 shrink-0" />
                )}
                <span className="truncate">{marketLabel}</span>
              </span>
            </BadgeExplainer>
          )}

          {sale ? (
            <BadgeExplainer stat={pickStat(badgeStats, `${pctOff}% OFF`)}>
              <span className="bg-red-600 text-white font-black text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide">
                {pctOff}% OFF
              </span>
            </BadgeExplainer>
          ) : product.badge ? (
            <BadgeExplainer stat={pickStat(badgeStats, product.badge)}>
              <span className="bg-slate-900 text-white font-black text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide">
                {product.badge}
              </span>
            </BadgeExplainer>
          ) : null}

          {badgeText && (
            <span
              className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide flex items-center gap-1 font-mono ${
                badgeType === 'complement'
                  ? 'bg-amber-400 text-slate-950'
                  : badgeType === 'similarity'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-emerald-600 text-white'
              }`}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {badgeText}
            </span>
          )}
        </div>

        {product.inventoryStatus === 'Low Stock' && (
          <span className="absolute bottom-2 left-2 z-10">
            <BadgeExplainer stat={pickStat(badgeStats, 'Almost gone')}>
              <span className="bg-amber-100 text-amber-900 border border-amber-400 font-bold text-[9px] px-1.5 py-0.5 rounded uppercase">
                Almost gone
              </span>
            </BadgeExplainer>
          </span>
        )}
        {product.inventoryStatus === 'Pre-Order' && (
          <span className="absolute bottom-2 left-2 z-10">
            <BadgeExplainer stat={pickStat(badgeStats, 'Pre-Order')}>
              <span className="bg-slate-900 text-white font-bold text-[9px] px-1.5 py-0.5 rounded uppercase">
                Pre-Order
              </span>
            </BadgeExplainer>
          </span>
        )}
      </div>

      {/* Copy block */}
      <div className="p-2.5 flex flex-col flex-1">
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{product.brand}</div>

        <h3
          onClick={() => onSelect(product)}
          className="text-[11px] font-semibold text-slate-800 leading-snug line-clamp-2 hover:text-red-600 cursor-pointer mt-0.5 min-h-[2rem]"
          title={product.name}
        >
          {product.name}
        </h3>

        <div className="flex items-center gap-1 mt-1">
          <Stars rating={product.rating} />
          <span className="text-[10px] text-slate-500 font-mono">({product.reviewCount.toLocaleString()})</span>
        </div>

        {/* Price. Sale prices lead in red with the original struck through
            beside them, which is the convention shoppers already read. */}
        <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
          {sale ? (
            <>
              <span className="text-sm font-black text-red-600">${sale.toFixed(2)}</span>
              <span className="text-[10px] text-slate-400 line-through">${product.price.toFixed(2)}</span>
            </>
          ) : (
            <span className="text-sm font-black text-slate-900">${product.price.toFixed(2)}</span>
          )}
        </div>

        <button
          onClick={() => (quickSize ? addToCart(product, quickSize) : onSelect(product))}
          title={
            quickSize
              ? `Adds size ${quickSize}, prefilled at ${(fit.confidence * 100).toFixed(0)}% confidence`
              : 'No size we can defend for you yet. Pick one on the product page'
          }
          className="mt-2 w-full bg-slate-900 hover:bg-red-600 text-white font-black text-[10px] uppercase tracking-widest py-2 rounded transition-colors"
        >
          {quickSize ? `Add ${quickSize === 'One Size' ? 'to Cart' : quickSize} to Cart` : 'Choose Size'}
        </button>
      </div>
    </div>
  );
};
