import React from 'react';
import { useApp } from '../../context/AppContext';
import { Trash2, ShoppingBag, Plus, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { runComplementEngine } from '../../ml/engine';

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

  const subtotal = cart.reduce((acc, item) => {
    const pPrice = item.product.salePrice || item.product.price;
    return acc + pPrice * item.quantity;
  }, 0);

  const shippingCost = subtotal > 75 || subtotal === 0 ? 0 : 7.99;
  const grandTotal = subtotal + shippingCost;

  // Derive cart cross-sell complement items based on first cart item anchor
  const anchorProduct = cart[0]?.product || products[0];
  const cartComplements = runComplementEngine(anchorProduct, products, 3);

  const handleAddCrossSell = (compProduct: typeof products[0]) => {
    addToCart(compProduct, 'L', 'Complement Engine');
  };

  return (
    <div className="space-y-6 pb-12 bg-slate-50 min-h-screen">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black font-serif uppercase tracking-tight">YOUR SHOPPING CART</h1>
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
                      <div
                        className={`w-20 h-20 rounded-xl bg-gradient-to-br ${p.imageBg} flex items-center justify-center text-white font-black text-sm shrink-0 shadow-xs`}
                      >
                        {p.jerseyNumber ? `#${p.jerseyNumber}` : p.department.substring(0, 3).toUpperCase()}
                      </div>

                      <div>
                        <div className="text-[10px] font-extrabold text-red-600 uppercase tracking-wider">
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
                  <span>Fans Also Add (Complement Cross-Sell Engine)</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Directional high co-order complement items selected for your cart items.
                </p>
              </div>

              <span className="text-[10px] bg-amber-50 text-amber-900 px-2.5 py-1 rounded border border-amber-200 font-mono font-bold">
                Cross-Sell Engine
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
                    <div>
                      <div className="text-[10px] font-bold text-amber-800 uppercase">
                        {comp.relationshipType}
                      </div>
                      <div className="text-xs font-bold text-slate-900 line-clamp-1">{cp.name}</div>
                      <div className="text-[11px] font-black text-slate-800 mt-0.5">${price}</div>
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

            <button
              onClick={() => {
                alert('Demo Checkout Completed! Simulated order telemetry captured.');
                clearCart();
                recordEvent('Completed Checkout Event');
              }}
              disabled={cart.length === 0}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-md transition-transform active:scale-98"
            >
              PROCEED TO CHECKOUT
            </button>

            {/* Simulated Impact Metrics Box */}
            <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl text-xs text-indigo-950 space-y-1">
              <div className="font-bold text-indigo-900 flex items-center justify-between">
                <span>Simulated Order Impact:</span>
                <span className="font-mono text-[10px] text-indigo-700 font-bold">Real-time</span>
              </div>
              <div className="text-[11px] space-y-0.5">
                <div className="flex justify-between">
                  <span>Current Cart Subtotal:</span>
                  <span className="font-bold">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Incremental Recommendation Lift:</span>
                  <span className="font-bold text-emerald-700">+$28.40 / session</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
