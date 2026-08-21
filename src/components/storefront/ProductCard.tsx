import React from 'react';
import { Product } from '../../types';
import { Star, ShoppingBag, Sparkles, Truck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ProductImage } from './ProductImage';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  badgeText?: string;
  badgeType?: 'personalized' | 'similarity' | 'complement';
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
  badgeText,
  badgeType,
}) => {
  const { addToCart } = useApp();

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-xs hover:shadow-lg hover:border-slate-300 transition-all duration-200 flex flex-col justify-between overflow-hidden group font-sans">
      <div>
        {/* Merchandise Visual Thumbnail */}
        <div
          onClick={() => onSelect(product)}
          className="relative h-48 p-3.5 flex flex-col justify-between cursor-pointer overflow-hidden"
        >
          {/* Procedurally drawn merchandise render - see ProductImage.tsx */}
          <ProductImage
            product={product}
            className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-105"
          />

          {/* Top Badges Row */}
          {/* Wraps rather than clips: on a narrow grid "EAGLES" + "BEST SELLER"
              cannot share a line, and a cut-off badge looks like a bug. */}
          <div className="flex flex-wrap justify-between items-start z-10 w-full gap-1">
            <span className="bg-slate-950/90 backdrop-blur text-white font-extrabold text-[10px] px-2 py-0.5 rounded tracking-wide border border-slate-700/60 uppercase whitespace-nowrap shrink-0">
              {product.team}
            </span>

            {badgeText ? (
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded shadow-sm flex items-center gap-1 whitespace-nowrap shrink-0 ${
                  badgeType === 'complement'
                    ? 'bg-amber-500 text-slate-950 font-mono'
                    : badgeType === 'similarity'
                    ? 'bg-indigo-600 text-white font-mono'
                    : 'bg-emerald-600 text-white font-mono'
                }`}
              >
                <Sparkles className="h-3 w-3" />
                {badgeText}
              </span>
            ) : product.badge ? (
              <span className="bg-red-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded uppercase tracking-wider shadow-sm whitespace-nowrap shrink-0">
                {product.badge}
              </span>
            ) : (
              <span className="bg-slate-800/80 text-slate-200 font-bold text-[9px] px-1.5 py-0.5 rounded uppercase">
                OFFICIAL
              </span>
            )}
          </div>

          {/* Bottom Stock Badge */}
          <div className="flex justify-between items-center z-10 text-[10px] font-medium">
            <span className="bg-white/85 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-slate-300/70">
              {product.gender}
            </span>
            <span className="bg-emerald-50/95 text-emerald-800 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold border border-emerald-600/40">
              {product.inventoryStatus}
            </span>
          </div>
        </div>

        {/* Product Meta Body */}
        <div className="p-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            {product.league} • {product.subdepartment}
          </div>

          <h3
            onClick={() => onSelect(product)}
            className="text-xs font-bold text-slate-900 line-clamp-2 hover:text-red-600 transition-colors cursor-pointer leading-snug h-8"
            title={product.name}
          >
            {product.name}
          </h3>

          {/* Rating & Shipping Tag */}
          <div className="flex items-center justify-between my-2 text-xs">
            <div className="flex items-center space-x-1">
              <div className="flex text-amber-400">
                <Star className="h-3 w-3 fill-current" />
              </div>
              <span className="font-bold text-slate-800 text-[11px]">{product.rating}</span>
              <span className="text-[10px] text-slate-400">({product.reviewCount})</span>
            </div>
            <div className="flex items-center text-[10px] text-emerald-700 font-bold gap-0.5">
              <Truck className="h-3 w-3 text-emerald-600" />
              <span>Ships Fast</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Price & Actions */}
      {/* The controls are fixed-width and the price is not, so the price is the
          side that gives: a discounted item shows two prices and would otherwise
          push the ADD button off the edge of a narrow card. */}
      <div className="p-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 mt-1 bg-slate-50/50">
        {/* Two prices stack rather than sit side by side: on a four-up grid the
            was-price loses its last digits if the pair has to share a line with
            the ADD button, and a truncated price reads as a rendering bug. */}
        <div className="min-w-0">
          {product.salePrice ? (
            <div className="leading-tight">
              <div className="text-[10px] text-slate-400 line-through whitespace-nowrap">${product.price.toFixed(2)}</div>
              <div className="text-sm font-black text-red-600 whitespace-nowrap">${product.salePrice.toFixed(2)}</div>
            </div>
          ) : (
            <span className="text-sm font-black text-slate-900 whitespace-nowrap">${product.price.toFixed(2)}</span>
          )}
        </div>

        {/* No separate "view details" control: the whole thumbnail above is
            already that button, and dropping it buys the width a discounted
            price needs. */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => addToCart(product, 'L')}
            className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-2.5 py-1.5 rounded-md transition-colors flex items-center space-x-1 uppercase tracking-wider"
            title="Add to Cart"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>ADD</span>
          </button>
        </div>
      </div>
    </div>
  );
};

