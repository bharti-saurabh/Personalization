/**
 * Side-by-side audit of the personalised and unpersonalised storefront.
 *
 * The right-hand column reads from the live intent prediction rather than
 * quoting fixed numbers, so it always agrees with what the storefront is
 * actually rendering for the selected scenario. The funnel strip at the bottom
 * is the one block on this screen with no measurement behind it, and it says so
 * in its own header rather than in a footnote.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { Sparkles, PencilRuler } from 'lucide-react';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Placeholder funnel shape for the "art of the possible" conversation. These
 * are not outputs of this prototype and not benchmarks: the simulator has no
 * click-through or conversion process to measure, and the offline evaluation
 * scores ranking quality, which is a different question. They are here to show
 * which metrics a real programme would move, at magnitudes a reader should
 * argue with rather than accept.
 */
const ILLUSTRATIVE_FUNNEL = [
  { label: 'Module CTR', value: '4.2% -> 8.9%' },
  { label: 'PDP Views', value: '1.8 -> 3.4 / sess' },
  { label: 'Add-to-Cart Rate', value: '8.4% -> 12.6%' },
  { label: 'Conversion Rate', value: '2.8% -> 3.2%' },
  { label: 'Units Per Order', value: '1.2 -> 1.6 units' },
  { label: 'Average Order Value', value: '$88 -> $104' },
];

export const PersonalizationComparison: React.FC = () => {
  const { intentPrediction } = useApp();

  const [t1, t2, t3] = intentPrediction.teams;
  const topDepts = intentPrediction.departments.slice(0, 4).map((d) => d.department);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 bg-slate-50 min-h-screen text-slate-900">
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-red-400 font-bold uppercase tracking-wider mb-1">
            EXPERIENCE COMPARISON
          </div>
          <h1 className="text-2xl font-black font-display uppercase tracking-tight">
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
                {t1 ? `${t1.team} Season Hero (${pct(t1.probability)} predicted intent)` : 'Awaiting prediction'}
              </span>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950">
              <span className="font-bold text-emerald-800 block text-[10px] uppercase">Team Widget Order</span>
              <span className="font-extrabold text-slate-900">
                {[t1, t2, t3]
                  .filter(Boolean)
                  .map((t) => `${t.team} (${pct(t.probability)})`)
                  .join(' → ')}
              </span>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950">
              <span className="font-bold text-emerald-800 block text-[10px] uppercase">Department Ordering</span>
              <span className="font-extrabold text-slate-900">{topDepts.join(' → ')}</span>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950">
              <span className="font-bold text-emerald-800 block text-[10px] uppercase">Recommendations</span>
              <span className="font-extrabold text-slate-900">Substitutes + Directional Complements</span>
            </div>
          </div>
        </div>
      </div>

      {/* Illustrative funnel - explicitly not a measurement */}
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 shadow-none space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <h3 className="text-base font-extrabold text-slate-500 flex items-center gap-2">
            <PencilRuler className="h-4 w-4 text-slate-400" />
            <span>Illustrative Funnel - Hypothetical, Not Measured</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">no measurement behind these figures</span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed max-w-4xl">
          These are placeholder magnitudes showing <b>which</b> metrics a personalisation programme moves, not what
          this prototype achieved. The simulator has no click-through or checkout process to observe, and the offline
          evaluation on the Model Evidence tab scores ranking quality, which is a different question from revenue. The
          only way to fill this table with real numbers is a controlled online A/B test.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs text-center">
          {ILLUSTRATIVE_FUNNEL.map((m) => (
            <div key={m.label} className="bg-slate-50/70 p-3 rounded-xl border border-dashed border-slate-300">
              <span className="text-slate-500 block text-[10px]">{m.label}</span>
              <span className="text-sm font-bold text-slate-600 font-mono">{m.value}</span>
              <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">hypothetical</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
