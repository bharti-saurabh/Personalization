import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Sparkles, ArrowLeftRight, Check, X } from 'lucide-react';

export const PersonalizationComparison: React.FC = () => {
  const { topazPrediction } = useApp();
  const [sliderPos, setSliderPos] = useState<number>(50);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 bg-slate-50 min-h-screen text-slate-900">
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-red-400 font-bold uppercase tracking-wider mb-1">
            EXPERIENCE COMPARISON
          </div>
          <h1 className="text-2xl font-black font-serif uppercase tracking-tight">
            STANDARD VS ML-PERSONALIZED EXPERIENCE
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Visual side-by-side audit of storefront modules
          </p>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Standard Experience */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="bg-slate-100 p-2.5 rounded-xl font-bold text-slate-800 text-xs flex justify-between items-center border border-slate-200">
            <span>STANDARD EXPERIENCE (OFF)</span>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono">
              Static Merchandising
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-700 block text-[10px] uppercase">Hero Banner</span>
              <span className="font-extrabold text-slate-900">Generic "Ultimate Fan Shop" Banner</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-700 block text-[10px] uppercase">Team Widget Order</span>
              <span className="font-extrabold text-slate-900">Static National Popularity List</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-700 block text-[10px] uppercase">Department Ordering</span>
              <span className="font-extrabold text-slate-900">Alphabetical Default (Accessories → T-shirts)</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-700 block text-[10px] uppercase">Recommendations</span>
              <span className="font-extrabold text-slate-900">Global Best Sellers (Unpersonalized)</span>
            </div>
          </div>
        </div>

        {/* Right: ML-Personalized Experience */}
        <div className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-xs space-y-4 ring-1 ring-indigo-500/20">
          <div className="bg-indigo-900 text-white p-2.5 rounded-xl font-bold text-xs flex justify-between items-center shadow-xs">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>ML-PERSONALIZED EXPERIENCE (ON)</span>
            </span>
            <span className="text-[10px] bg-emerald-500 text-slate-950 px-2 py-0.5 rounded font-mono font-extrabold">
              Intent & Recommendation Engine
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950">
              <span className="font-bold text-emerald-800 block text-[10px] uppercase">Hero Banner</span>
              <span className="font-extrabold text-slate-900">
                Eagles Season Hero (72% predicted intent)
              </span>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950">
              <span className="font-bold text-emerald-800 block text-[10px] uppercase">Team Widget Order</span>
              <span className="font-extrabold text-slate-900">Eagles (72%) → 76ers (18%) → Phillies (6%)</span>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950">
              <span className="font-bold text-emerald-800 block text-[10px] uppercase">Department Ordering</span>
              <span className="font-extrabold text-slate-900">Jerseys → Hats → Hoodies → Collectibles</span>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950">
              <span className="font-bold text-emerald-800 block text-[10px] uppercase">Recommendations</span>
              <span className="font-extrabold text-slate-900">Substitutes + Directional Complements</span>
            </div>
          </div>
        </div>
      </div>

      {/* Simulated Funnel Metrics */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h3 className="text-base font-extrabold text-slate-900">Simulated Funnel Metrics</h3>
          <span className="text-xs text-slate-500 font-mono italic">Illustrative impact simulation</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs text-center">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[10px]">Module CTR</span>
            <span className="text-base font-black text-slate-900">4.2% → 8.9%</span>
            <span className="text-[10px] text-emerald-600 font-bold block">+111%</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[10px]">PDP Views</span>
            <span className="text-base font-black text-slate-900">1.8 → 3.4 / sess</span>
            <span className="text-[10px] text-emerald-600 font-bold block">+88%</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[10px]">Add-to-Cart Rate</span>
            <span className="text-base font-black text-slate-900">8.4% → 12.6%</span>
            <span className="text-[10px] text-emerald-600 font-bold block">+50%</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[10px]">Conversion Rate</span>
            <span className="text-base font-black text-slate-900">2.8% → 3.2%</span>
            <span className="text-[10px] text-emerald-600 font-bold block">+14.2%</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[10px]">Units Per Order</span>
            <span className="text-base font-black text-slate-900">1.2 → 1.6 units</span>
            <span className="text-[10px] text-emerald-600 font-bold block">+33%</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[10px]">Average Order Value</span>
            <span className="text-base font-black text-slate-900">$88 → $104</span>
            <span className="text-[10px] text-emerald-600 font-bold block">+18.2%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
