/**
 * Reference architecture for a production deployment.
 *
 * This diagram is a proposal, not a description of what this prototype runs.
 * The prototype executes entirely in the browser: there is no event stream, no
 * feature store and no serving tier. The banner below the title says so, so a
 * reader cannot mistake the topology for something already stood up.
 */

import React, { useState } from 'react';
import { Workflow, ArrowDown, Activity, Info } from 'lucide-react';

export const ModelArchitecture: React.FC = () => {
  const [activeSimulation, setActiveSimulation] = useState<boolean>(true);

  const layers = [
    {
      title: '1. Customer Interaction Layer',
      badge: 'Edge Ingress',
      color: 'border-blue-200 bg-blue-50/50 text-blue-900',
      items: ['Homepage Hero Spot', 'Product Listing Page (PLP)', 'Product Detail Page (PDP)', 'Cart & Checkout'],
    },
    {
      title: '2. Event & Identity Layer',
      badge: 'Real-Time Stream',
      color: 'border-indigo-200 bg-indigo-50/50 text-indigo-900',
      items: ['FanKey Customer ID', 'Session & Device Telemetry', 'Click / View Event Stream', 'Cart Addition Hooks'],
    },
    {
      title: '3. Feature Store & Graph Layer',
      badge: 'Feature Engine',
      color: 'border-purple-200 bg-purple-50/50 text-purple-900',
      items: ['Hot Session Recency Window', 'Cold Multi-Session Order History', 'Product Multimodal Vectors', 'Co-Order & Co-Cart Graphs'],
    },
    {
      title: '4. ML Inference Layer',
      badge: 'Core ML Engine',
      color: 'border-red-200 bg-red-50/50 text-red-900',
      items: ['Team Intent Sequence Model', 'Department Intent Model', 'Similarity Vector Encoder', 'Complement Cross-Sell Graph'],
    },
    {
      title: '5. Serving & Decision Layer',
      badge: 'Target < 20ms',
      color: 'border-emerald-200 bg-emerald-50/50 text-emerald-900',
      items: ['Vector Distance Search', 'Confidence Threshold Check', 'Inventory Availability Filter', 'Fallback Safety Rules'],
    },
    {
      title: '6. Storefront Activation Layer',
      badge: 'UI Render',
      color: 'border-amber-200 bg-amber-50/50 text-amber-900',
      items: ['Personalized Hero Banner', 'Ranked Team Widgets', 'Dynamic Filter Prioritization', 'Dual PDP Carousels'],
    },
  ];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 bg-slate-50 min-h-screen text-slate-900">
      {/* Title */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-red-600 text-white font-bold">
            <Workflow className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-display uppercase tracking-tight">
              END-TO-END ML SYSTEM ARCHITECTURE
            </h1>
            <p className="text-xs text-slate-400">
              Low-latency real-time inference & feature store activation topology
            </p>
          </div>
        </div>

        <button
          onClick={() => setActiveSimulation(!activeSimulation)}
          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center space-x-2 ${
            activeSimulation
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <Activity className="h-4 w-4 animate-spin" />
          <span>Simulation Mode: {activeSimulation ? 'ACTIVE' : 'PAUSED'}</span>
        </button>
      </div>

      {/* What this diagram is, and what it is not */}
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <span className="font-extrabold uppercase tracking-wider block mb-1">Proposed topology, not deployed infrastructure</span>
          This is the architecture a production build would target. The prototype you are clicking through runs the
          whole pipeline in the browser against a synthetic population - there is no event stream, feature store or
          serving tier behind it. Latency badges are design targets, not measurements; the one number here that is
          genuinely measured is the per-request inference time shown on the storefront's explanation layer.
        </div>
      </div>

      {/* Layer Pipeline Stack */}
      <div className="space-y-4">
        {layers.map((layer, idx) => (
          <React.Fragment key={layer.title}>
            <div className={`p-5 rounded-2xl border shadow-xs ${layer.color} relative overflow-hidden transition-all duration-300 hover:shadow-md bg-white`}>
              <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                <h3 className="font-extrabold text-sm uppercase tracking-wide flex items-center gap-2 text-slate-900">
                  <span className="w-2 h-2 rounded-full bg-red-600" />
                  <span>{layer.title}</span>
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700">
                  {layer.badge}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {layer.items.map((item) => (
                  <div key={item} className="bg-slate-50 text-slate-800 p-3 rounded-xl border border-slate-200 font-semibold text-center shadow-2xs">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {idx < layers.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowDown className={`h-5 w-5 text-red-500 ${activeSimulation ? 'animate-bounce' : ''}`} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
