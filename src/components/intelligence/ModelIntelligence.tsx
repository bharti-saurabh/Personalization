import React from 'react';
import { BrainCircuit, Sparkles, ShieldCheck, Cpu, ArrowRight, BarChart2 } from 'lucide-react';

export const ModelIntelligence: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 bg-slate-50 min-h-screen text-slate-900">
      {/* Title Header */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2 rounded-xl bg-red-600 text-white font-bold">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-serif uppercase tracking-tight">
              MODEL INTELLIGENCE ARCHITECTURE
            </h1>
            <p className="text-xs text-slate-400">
              Technical deep dive into Customer Intent, Similarity Encoder & Complement Cross-Sell Engines
            </p>
          </div>
        </div>
      </div>

      {/* 3 Engines Detailed Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Intent Engine */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-red-600 font-extrabold text-sm uppercase tracking-wider">
              <Sparkles className="h-4 w-4" />
              <span>A. Intent Prediction Engine</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Customer Intent Prediction</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Predicts customer-level team and department intent from real-time sequential interaction logs and multi-session historical behavior.
            </p>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1 font-mono">
              <div className="text-slate-500 font-bold font-sans">Model Outputs:</div>
              <div className="text-slate-800">• Next likely purchase team</div>
              <div className="text-slate-800">• Next likely department</div>
              <div className="text-slate-800">• Conversion propensity</div>
              <div className="text-slate-800">• Dynamic grid filter sequence</div>
            </div>
          </div>
          <div className="bg-red-50 text-red-900 p-3 rounded-xl border border-red-200 text-xs font-semibold">
            Offline Proof Point: Materially higher Top-1 and Top-3 team prediction accuracy over baseline heuristic models.
          </div>
        </div>

        {/* Similarity Engine */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-indigo-600 font-extrabold text-sm uppercase tracking-wider">
              <Cpu className="h-4 w-4" />
              <span>B. Similarity Encoder Engine</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Substitute Recommendations</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Powers "You May Also Like" by computing hybrid multimodal product representations (Metadata + Image + Co-view embeddings).
            </p>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1 font-mono">
              <div className="text-slate-500 font-bold font-sans">Signals Combined:</div>
              <div className="text-slate-800">• Team & League compatibility</div>
              <div className="text-slate-800">• Player & Style line match</div>
              <div className="text-slate-800">• Price band proximity</div>
              <div className="text-slate-800">• Co-view product neighborhood</div>
            </div>
          </div>
          <div className="bg-indigo-50 text-indigo-900 p-3 rounded-xl border border-indigo-200 text-xs font-semibold">
            Offline Proof Point: Effectively solves cold-start for new merchandise via visual & text content embedding similarity.
          </div>
        </div>

        {/* Complement Engine */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-amber-600 font-extrabold text-sm uppercase tracking-wider">
              <BarChart2 className="h-4 w-4" />
              <span>C. Complement Cross-Sell Engine</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Cross-Sell & Complete the Look</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Powers directional cross-department recommendations (e.g., Jersey → Hat, Jersey → Collectible, Hat → T-shirt).
            </p>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1 font-mono">
              <div className="text-slate-500 font-bold font-sans">Signals Combined:</div>
              <div className="text-slate-800">• Co-order affinity graph</div>
              <div className="text-slate-800">• Co-cart relationship strength</div>
              <div className="text-slate-800">• Department compatibility matrix</div>
              <div className="text-slate-800">• Team consistency rules</div>
            </div>
          </div>
          <div className="bg-amber-50 text-amber-900 p-3 rounded-xl border border-amber-200 text-xs font-semibold">
            Offline Proof Point: High co-order precision increases multi-item basket conversion and Average Order Value (AOV).
          </div>
        </div>
      </div>
    </div>
  );
};
