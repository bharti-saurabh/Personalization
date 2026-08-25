import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Trash2, ShoppingBag, Plus, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { runComplementEngine } from '../../ml/engine';
import { ProductImage } from './ProductImage';
import { TeamCrest } from '../brand/Identity';

export const CartPage: React.FC = () => {
  const {
    cart,
    addToCart,
    removeFromCart,
    clearCart,
    products,
    setStorefrontPage,
    recordEvent,
  } = useApp();

  // An inline confirmation rather than window.alert: a native dialog in the
  // middle of a leadership demo reads as an unfinished prototype, and it also
  // blocks the screenshot harness.
  const [checkoutDone, setCheckoutDone] = useState(false);

  const lineValue = (item: (typeof cart)[number]) =>
    (item.product.salePrice || item.product.price) * item.quantity;

  const subtotal = cart.reduce((acc, item) => acc + lineValue(item), 0);

  // Attribution, not forecast. Every line the shopper added from a
  // recommendation rail is tagged at the moment it enters the cart, so the
  // incremental value below is a fact about this basket rather than an
  // assumption about a population. It moves the instant a complement is
  // accepted, which is the whole point of showing it here.
  const recommendedItems = cart.filter((item) => item.addedByRecommendation);
  const recommendedValue = recommendedItems.reduce((acc, item) => acc + lineValue(item), 0);
  const organicValue = subtotal - recommendedValue;
  const basketShare = subtotal > 0 ? recommendedValue / subtotal : 0;

  const shippingCost = subtotal > 75 || subtotal === 0 ? 0 : 7.99;
  const grandTotal = subtotal + shippingCost;

  // Derive cart cross-sell complement items based on first cart item anchor
  const anchorProduct = cart[0]?.product || products[0];
  const cartComplements = runComplementEngine(anchorProduct, products, 3);

  const handleAddCrossSell = (compProduct: typeof products[0]) => {
    addToCart(compProduct, 'L', 'Cross-Sell Complement');
  };

  return (
    <div className="space-y-6 pb-12 bg-slate-50 min-h-screen">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black font-display uppercase tracking-tight">YOUR SHOPPING CART</h1>
            <p className="text-xs text-slate-400 mt-1">
              {cart.length} item(s) selected • Free shipping on orders over $75
            </p>
          </div>
          <button
            onClick={() => setStorefrontPage('plp')}
            className="text-xs text-red-400 hover:text-red-300 font-bold flex items-center gap-1"
          >
            <span>Continue Shopping</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Line Items (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          {cart.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-4">
              <ShoppingBag className="h-12 w-12 text-slate-300 mx-auto" />
              <h2 className="text-base font-bold text-slate-800">Your Shopping Cart is Empty</h2>
              <p className="text-xs text-slate-500">
                Explore official jerseys, hats, and collectibles personalized for your favorite team.
              </p>
              <button
                onClick={() => setStorefrontPage('plp')}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-xs"
              >
                Start Shopping Now
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
              {cart.map((item) => {
                const p = item.product;
                const unitPrice = p.salePrice || p.price;
                return (
                  <div key={`${p.id}-${item.selectedSize}`} className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      {/* Product Visual Box */}
                      <ProductImage
                        product={p}
                        detail={false}
                        className="w-20 h-20 rounded-xl shrink-0 shadow-xs"
                      />

                      <div>
                        <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-red-600 uppercase tracking-wider">
                          <TeamCrest team={p.team} size="xs" />
                          {p.team} • {p.department}
                        </div>
                        <h3 className="text-xs font-bold text-slate-900 line-clamp-1">{p.name}</h3>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center space-x-3">
                          <span>Size: <b>{item.selectedSize}</b></span>
                          <span>Unit Price: <b>${unitPrice}</b></span>
                        </div>

                        {item.addedByRecommendation && (
                          <div className="mt-1 inline-flex items-center space-x-1 text-[10px] bg-amber-50 text-amber-900 px-2 py-0.5 rounded border border-amber-200 font-bold">
                            <Sparkles className="h-3 w-3 text-amber-600" />
                            <span>Added via {item.recommendationSource}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-6 self-end sm:self-auto">
                      <div className="text-sm font-black text-slate-900">
                        ${(unitPrice * item.quantity).toFixed(2)}
                      </div>

                      <button
                        onClick={() => removeFromCart(p.id)}
                        className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                        title="Remove Item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CROSS-SELL COMPLEMENT SECTION: "FANS ALSO ADD" */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center space-x-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>Fans Also Add</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Directional high co-order complement items selected for your cart items.
                </p>
              </div>

              {/* The engine is named once. The heading used to carry it in
                  parentheses and this chip repeated it verbatim beside it. */}
              <span className="text-[10px] bg-amber-50 text-amber-900 px-2.5 py-1 rounded border border-amber-200 font-mono font-bold whitespace-nowrap">
                Complement Cross-Sell Engine
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {cartComplements.map((comp) => {
                const cp = comp.product;
                const price = cp.salePrice || cp.price;
                return (
                  <div
                    key={cp.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2 hover:border-amber-300 transition-colors"
                  >
                    {/* These cards used to be text and a price. Every other
                        surface in the demo shows the garment, so three
                        unillustrated tiles at the bottom of the cart read as
                        placeholder rather than as merchandise.

                        The render sits above the copy rather than beside it:
                        these columns are a third of an already narrow stage, and
                        a side-by-side thumbnail left the product name with about
                        two words per line. */}
                    <div className="space-y-2">
                      <div className="relative h-24 rounded-lg overflow-hidden bg-white border border-slate-200">
                        <ProductImage product={cp} detail={false} className="absolute inset-0 h-full w-full" />
                        <span className="absolute top-1 left-1 grid place-items-center h-5 w-5 rounded-md bg-white/90 border border-slate-200">
                          <TeamCrest team={cp.team} size="xs" />
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[9px] font-bold text-amber-800 uppercase tracking-wide truncate">
                          {comp.relationshipType}
                        </div>
                        <div className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">{cp.name}</div>
                        <div className="text-[11px] font-black text-slate-800 mt-0.5">${price}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAddCrossSell(cp)}
                      className="w-full bg-slate-900 hover:bg-amber-600 text-white font-bold text-xs py-1.5 rounded-lg transition-colors flex items-center justify-center space-x-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add to Order</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Summary Column */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 pb-3 border-b border-slate-100">
              Order Summary
            </h2>

            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Items Subtotal:</span>
                <span className="font-bold text-slate-900">${subtotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between">
                <span>Estimated Shipping:</span>
                <span className="font-bold text-slate-900">
                  {shippingCost === 0 ? 'FREE' : `$${shippingCost.toFixed(2)}`}
                </span>
              </div>

              <div className="flex justify-between pt-2 border-t border-slate-100 text-sm font-black text-slate-900">
                <span>Order Total:</span>
                <span className="text-red-600">${grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {checkoutDone ? (
              <div className="w-full bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold py-3 px-3 rounded-xl text-[11px] flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-px" />
                <span className="leading-snug">
                  Simulated order placed. Checkout telemetry was written to the event stream and is
                  visible in the Customer Journey tab.
                </span>
              </div>
            ) : (
              <button
                onClick={() => {
                  recordEvent('Completed Checkout Event');
                  clearCart();
                  setCheckoutDone(true);
                }}
                disabled={cart.length === 0}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-md transition-transform active:scale-98"
              >
                PROCEED TO CHECKOUT
              </button>
            )}

            {/* Recommendation attribution for this basket. Measured from the
                cart itself - no assumed lift, no session average. */}
            <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl text-xs text-indigo-950 space-y-1.5">
              <div className="font-bold text-indigo-900 flex items-center justify-between gap-2">
                <span>Recommendation Attribution</span>
                <span className="font-mono text-[10px] text-indigo-700 font-bold shrink-0">This basket</span>
              </div>
              <div className="text-[11px] space-y-0.5">
                <div className="flex justify-between gap-2">
                  <span className="text-indigo-900/70">Shopper-initiated:</span>
                  <span className="font-bold">${organicValue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-indigo-900/70">
                    Added from recommendations ({recommendedItems.length}):
                  </span>
                  <span className="font-bold text-emerald-700">
                    {recommendedValue > 0 ? `+$${recommendedValue.toFixed(2)}` : '$0.00'}
                  </span>
                </div>
                <div className="flex justify-between gap-2 pt-1 border-t border-indigo-200">
                  <span className="text-indigo-900/70">Share of basket value:</span>
                  <span className="font-bold font-mono">{(basketShare * 100).toFixed(0)}%</span>
                </div>
              </div>
              {recommendedValue === 0 ? (
                <div className="text-[10px] text-indigo-900/60 leading-snug pt-0.5">
                  Nothing in this cart came from a recommendation yet. Accept one below and this
                  block updates.
                </div>
              ) : (
                <div className="text-[10px] text-indigo-900/60 leading-snug pt-0.5">
                  Value the engines put in this basket, tagged at add-to-cart. Basket attribution -
                  not a conversion-lift claim, which only an online A/B test can establish.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
