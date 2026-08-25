import React from 'react';
import { Product } from '../../types';
import { Star, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ProductImage } from './ProductImage';

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
  const { addToCart } = useApp();

  const sale = product.salePrice;
  const pctOff = sale ? Math.round(((product.price - sale) / product.price) * 100) : 0;

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
          {sale ? (
            <span className="bg-red-600 text-white font-black text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide">
              {pctOff}% OFF
            </span>
          ) : product.badge ? (
            <span className="bg-slate-900 text-white font-black text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide">
              {product.badge}
            </span>
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
          <span className="absolute bottom-2 left-2 z-10 bg-amber-100 text-amber-900 border border-amber-400 font-bold text-[9px] px-1.5 py-0.5 rounded uppercase">
            Almost gone
          </span>
        )}
        {product.inventoryStatus === 'Pre-Order' && (
          <span className="absolute bottom-2 left-2 z-10 bg-slate-900 text-white font-bold text-[9px] px-1.5 py-0.5 rounded uppercase">
            Pre-Order
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
          onClick={() => addToCart(product, 'L')}
          className="mt-2 w-full bg-slate-900 hover:bg-red-600 text-white font-black text-[10px] uppercase tracking-widest py-2 rounded transition-colors"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
};
