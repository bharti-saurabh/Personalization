import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Trash2, ShoppingBag, Plus, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { SURFACE_POLICIES, applySuppression, needsSubstitute, runComplementEngine } from '../../ml/engine';
import { SubstitutionPanel } from './SubstitutionPanel';
import { WithheldNotice } from './WithheldNotice';
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
    isPersonalizationOn,
    suppressionCtx,
    reportSuppression,
    recordPurchase,
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
  //
  // A SUBSTITUTED LINE IS NOT INCREMENTAL. It is tagged as recommendation-driven
  // because an engine chose it, and it is deliberately left out of the figure
  // below: the shopper had already decided to buy something, and the ranker
  // changed WHICH product rather than adding one. Counting a swap as incremental
  // revenue is the easiest way to make a personalization number look good and
  // the fastest way to lose the room when somebody checks.
  const recommendedItems = cart.filter(
    (item) => item.addedByRecommendation && item.recommendationSource !== 'Availability Substitution'
  );
  const substitutedItems = cart.filter((item) => item.recommendationSource === 'Availability Substitution');
  const recommendedValue = recommendedItems.reduce((acc, item) => acc + lineValue(item), 0);
  const substitutedValue = substitutedItems.reduce((acc, item) => acc + lineValue(item), 0);
  const organicValue = subtotal - recommendedValue;
  const basketShare = subtotal > 0 ? recommendedValue / subtotal : 0;

  const shippingCost = subtotal > 75 || subtotal === 0 ? 0 : 7.99;
  const grandTotal = subtotal + shippingCost;

  // Derive cart cross-sell complement items based on first cart item anchor.
  //
  // Memoised on the two things the retrieval actually depends on. Unmemoised,
  // this ran a full co-order sweep of the catalog on every render of the cart -
  // including every quantity tick, every hover that moved state, and the
  // checkout confirmation - to produce the same three products each time.
  //
  // The retrieval was already memoised on `[anchorProduct, products]` before the
  // suppression gate existed, and it stays that way. Adding the profile to these
  // deps would have undone the fix: the co-order sweep is the expensive half,
  // the profile moves on every click, and the sweep does not depend on it. So
  // the profile read lives in a SECOND memo below, over the handful of
  // candidates this one already returned.
  //
  // The limit went from 3 to 8 for the same reason it did on the PDP: a gate
  // placed after a retrieval that returns exactly enough can only ever leave a
  // hole.
  const anchorProduct = cart[0]?.product || products[0];
  const cartCandidates = useMemo(
    () => runComplementEngine(anchorProduct, products, 8),
    [anchorProduct, products]
  );

  // The cheap half. Runs on every profile fold, and all it does is filter and
  // re-sort at most eight things it was handed.
  const cartGate = useMemo(
    () =>
      applySuppression(
        cartCandidates.map((m) => ({
          product: m.product,
          confidence: m.complementScore,
          source: 'Complement',
        })),
        suppressionCtx,
        SURFACE_POLICIES.cart_crosssell,
        // The basket is the shopper's own choice, so a rival already in it
        // stands the rivalry rule down for this rail.
        { anchor: anchorProduct }
      ),
    [cartCandidates, suppressionCtx, anchorProduct]
  );

  const cartComplements = useMemo(() => {
    const by = new Map(cartCandidates.map((m) => [m.product.id, m]));
    return cartGate.kept.map((c) => by.get(c.product.id)!).filter(Boolean);
  }, [cartCandidates, cartGate]);

  // The provider owns the ledger and the beat, and it cannot see this gate -
  // running it there would mean a co-order sweep on every render of a page that
  // is usually closed. So the page hands its result up. The memo above returns a
  // stable object until its inputs change, so this fires once per real change.
  useEffect(() => {
    reportSuppression(cartGate);
    // The slot key is passed explicitly on teardown: the gate object is gone
    // by then, so the provider cannot read the policy id off it.
    return () => reportSuppression(null, SURFACE_POLICIES.cart_crosssell.id);
  }, [cartGate, reportSuppression]);

  const handleAddCrossSell = (compProduct: typeof products[0]) => {
    addToCart(compProduct, 'L', 'Cross-Sell Complement');
  };

  return (
    <div className="space-y-6 pb-12 bg-slate-50 min-h-screen">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black font-display uppercase tracking-tight">Your shopping cart</h1>
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
                /*
                 * A line that will not ship with the rest of the basket.
                 *
                 * The cart is the last place a store can afford to be quiet
                 * about this. A pre-order sitting silently between two
                 * in-stock lines turns one delayed item into a delayed order,
                 * and the shopper finds out from the confirmation email. The
                 * same ranker that runs on the product page runs here, over
                 * the same gate, offered rather than imposed - the line stays
                 * in the basket unless the shopper swaps it themselves.
                 */
                const late = needsSubstitute(p, item.selectedSize ?? null);
                return (
                  <div key={`${p.id}-${item.selectedSize}`} className="p-4 flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
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

                  {late && (
                    <SubstitutionPanel
                      anchor={p}
                      requestedSize={item.selectedSize ?? null}
                      variant={p.inventoryStatus === 'Pre-Order' ? 'offer' : 'block'}
                      onSelect={(sub, size) => {
                        addToCart(sub, size ?? undefined, 'Availability Substitution');
                        removeFromCart(p.id);
                        recordEvent(`Swapped ${p.name} for ${sub.name}`, {
                          productId: sub.id,
                          team: sub.team,
                          department: sub.department,
                        });
                      }}
                    />
                  )}
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

            <WithheldNotice result={cartGate} active={isPersonalizationOn} className="mt-3" />
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
                  // Written before the cart is emptied, and deliberately outside
                  // the affinity fold: the clicks that filled this basket were
                  // already counted as they happened. This records OWNERSHIP, so
                  // that the gate stops offering the shopper what they have just
                  // bought.
                  recordPurchase(cart.map((item) => ({ productId: item.product.id })));
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
                {substitutedItems.length > 0 && (
                  <div className="flex justify-between gap-2">
                    <span
                      className="text-indigo-900/70"
                      title="Revenue the store kept when what was asked for could not be had. Deliberately not counted as incremental."
                    >
                      Kept by substitution ({substitutedItems.length}):
                    </span>
                    <span className="font-bold text-slate-600">${substitutedValue.toFixed(2)}</span>
                  </div>
                )}
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
