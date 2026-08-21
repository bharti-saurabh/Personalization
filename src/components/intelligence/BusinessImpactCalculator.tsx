import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  Percent,
  Sliders,
  Sparkles,
  Info,
  Award,
  Zap,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

export const BusinessImpactCalculator: React.FC = () => {
  // Every one of these is an operator-entered assumption, not a measurement.
  // Nothing on this screen is derived from the offline evaluation - the harness
  // scores ranking quality, which is a different question from revenue. The
  // defaults are placeholders chosen to make the sliders land in a plausible
  // range; they are not this client's numbers and are not a forecast.
  const [annualSessions, setAnnualSessions] = useState<number>(50000000);
  const [coveragePct, setCoveragePct] = useState<number>(68);
  const [baselineConversion, setBaselineConversion] = useState<number>(2.8);
  const [conversionLiftPct, setConversionLiftPct] = useState<number>(14.5);
  const [baselineAov, setBaselineAov] = useState<number>(88);
  const [complementAttachRate, setComplementAttachRate] = useState<number>(18.5);

  // Math calculations
  const personalizedSessions = annualSessions * (coveragePct / 100);
  const baselineOrders = personalizedSessions * (baselineConversion / 100);
  const newConversionRate = (baselineConversion / 100) * (1 + conversionLiftPct / 100);
  const newOrders = personalizedSessions * newConversionRate;
  const incrementalOrders = Math.round(newOrders - baselineOrders);

  // An attached complement is assumed to add 12% of basket value on average -
  // itself an assumption, and the one most worth replacing with a real figure
  // from the client's own order data before this screen is shown as anything
  // more than a shape.
  const newAov = baselineAov * (1 + (complementAttachRate / 100) * 0.12);
  const baselineRevenue = baselineOrders * baselineAov;
  const newRevenue = newOrders * newAov;
  const incrementalRevenue = Math.round(newRevenue - baselineRevenue);

  const chartData = [
    { name: 'Baseline Annual', revenue: Math.round(baselineRevenue / 1000000) },
    { name: 'ML Personalized', revenue: Math.round(newRevenue / 1000000) },
  ];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 bg-slate-50 min-h-screen text-slate-900">
      {/* Header */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-red-600 text-white font-bold">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-serif uppercase tracking-tight">
              EXECUTIVE BUSINESS IMPACT CALCULATOR
            </h1>
            <p className="text-xs text-slate-400">
              Interactive ROI model for Customer Intent & Recommendation Engines
            </p>
          </div>
        </div>

        <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700 text-xs text-slate-300">
          <span className="text-emerald-400 font-extrabold block">Scenario Output · Your Assumptions</span>
          <span className="text-xl font-black text-white font-mono">
            +${(incrementalRevenue / 1000000).toFixed(2)}M / yr
          </span>
        </div>
      </div>

      {/* Disclaimer Label */}
      <div className="bg-amber-50 border border-amber-300 p-3.5 rounded-xl text-xs text-amber-900 flex items-start space-x-2.5">
        <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          <b>This calculator measures nothing. It multiplies out the assumptions you set below.</b> The conversion lift
          and attach rate are inputs, not findings - this prototype has no way to observe either, because ranking
          quality and revenue are different questions. The offline evaluation on the Model Evidence tab does not feed
          this screen and should not be cited as support for the figure above. A real number comes from a controlled
          online A/B test on live traffic, and from nowhere else.
        </span>
      </div>

      {/* 4 Pillars Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="text-xs font-bold text-red-600 uppercase tracking-wider">1. Improve Relevance</div>
          <div className="text-sm font-black text-slate-900">Surface Most Likely Team</div>
          <div className="text-xs text-slate-500">
            Reorders heroes, department lists and team widgets according to real-time intent probability.
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider">2. Accelerate Discovery</div>
          <div className="text-sm font-black text-slate-900">Reduce Browsing Friction</div>
          <div className="text-xs text-slate-500">
            Helps fans navigate from broad intent to relevant player jerseys & substitute items via Similarity Engine.
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="text-xs font-bold text-amber-600 uppercase tracking-wider">3. Increase Basket Value</div>
          <div className="text-sm font-black text-slate-900">Cross-Sell & Complete Look</div>
          <div className="text-xs text-slate-500">
            Recommends directional complementary hats, hoodies & accessories to boost multi-item order attach rates.
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider">4. Learning System</div>
          <div className="text-sm font-black text-slate-900">Continuous Retraining</div>
          <div className="text-xs text-slate-500">
            Captures real-time clicks, views, and cart additions to feed continuous offline graph updates.
          </div>
        </div>
      </div>

      {/* Calculator Sliders & Output Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sliders Area (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5 text-xs">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center space-x-2 border-b border-slate-100 pb-3">
            <Sliders className="h-4 w-4 text-red-600" />
            <span>Interactive ROI Assumptions & Parameters</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Annual Sessions */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold text-slate-800">
                <span>Annual Fan Sessions</span>
                <span className="font-mono text-red-600 font-black">{(annualSessions / 1000000).toFixed(0)}M</span>
              </div>
              <input
                type="range"
                min="10000000"
                max="200000000"
                step="5000000"
                value={annualSessions}
                onChange={(e) => setAnnualSessions(parseInt(e.target.value))}
                className="w-full accent-red-600"
              />
            </div>

            {/* Coverage % */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold text-slate-800">
                <span>Personalization Coverage</span>
                <span className="font-mono text-red-600 font-black">{coveragePct}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="95"
                step="1"
                value={coveragePct}
                onChange={(e) => setCoveragePct(parseInt(e.target.value))}
                className="w-full accent-red-600"
              />
            </div>

            {/* Baseline Conversion Rate */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold text-slate-800">
                <span>Baseline Conversion Rate</span>
                <span className="font-mono text-red-600 font-black">{baselineConversion}%</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="6.0"
                step="0.1"
                value={baselineConversion}
                onChange={(e) => setBaselineConversion(parseFloat(e.target.value))}
                className="w-full accent-red-600"
              />
            </div>

            {/* Conversion Lift % */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold text-slate-800">
                <span>Assumed Conversion Lift</span>
                <span className="font-mono text-emerald-600 font-black">+{conversionLiftPct}%</span>
              </div>
              <input
                type="range"
                min="2.0"
                max="30.0"
                step="0.5"
                value={conversionLiftPct}
                onChange={(e) => setConversionLiftPct(parseFloat(e.target.value))}
                className="w-full accent-emerald-600"
              />
            </div>

            {/* Baseline AOV */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold text-slate-800">
                <span>Baseline Average Order Value (AOV)</span>
                <span className="font-mono text-red-600 font-black">${baselineAov}</span>
              </div>
              <input
                type="range"
                min="40"
                max="200"
                step="5"
                value={baselineAov}
                onChange={(e) => setBaselineAov(parseInt(e.target.value))}
                className="w-full accent-red-600"
              />
            </div>

            {/* Complement Attach Rate */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold text-slate-800">
                <span>Complement Cross-Sell Attach Rate</span>
                <span className="font-mono text-amber-600 font-black">{complementAttachRate}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="40"
                step="0.5"
                value={complementAttachRate}
                onChange={(e) => setComplementAttachRate(parseFloat(e.target.value))}
                className="w-full accent-amber-600"
              />
            </div>
          </div>
        </div>

        {/* Calculated Revenue Lift Summary */}
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 space-y-5 flex flex-col justify-between">
          <div>
            <div className="text-xs font-mono text-emerald-400 font-bold uppercase tracking-wider mb-2">
              SCENARIO OUTPUT · NOT A FORECAST
            </div>
            <h3 className="text-3xl font-black text-white font-mono leading-none">
              +${(incrementalRevenue / 1000000).toFixed(2)}M
            </h3>
            <p className="text-xs text-slate-400 mt-1">Incremental annual revenue implied by the assumptions above</p>

            <div className="space-y-3 pt-4 border-t border-slate-800 mt-4 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Incremental Orders:</span>
                <span className="font-mono font-bold text-emerald-400">
                  +{incrementalOrders.toLocaleString()} orders
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">New Effective AOV:</span>
                <span className="font-mono font-bold text-white">${newAov.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">AOV Lift:</span>
                <span className="font-mono font-bold text-amber-400">
                  +${(newAov - baselineAov).toFixed(2)} / order
                </span>
              </div>
            </div>
          </div>

          {/* Recharts Chart */}
          <div className="h-32 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} unit="M" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                  formatter={(value: any) => [`$${value}M Revenue`, 'Revenue']}
                />
                {/* Animation off: the grow-in leaves the bars unpainted in a
                    headless capture, and it adds nothing to a two-bar chart. */}
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  <Cell fill="#334155" />
                  <Cell fill="#10b981" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
