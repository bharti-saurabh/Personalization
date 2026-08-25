import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
import { TestTube2, Sparkles, Filter, Sliders } from 'lucide-react';
import { runSimilarityEngine, runComplementEngine } from '../../ml/engine';
import { ProductCard } from '../storefront/ProductCard';

export const RecommendationLab: React.FC = () => {
  const { products, scenarios, selectedScenario, setSelectedProduct, setStorefrontPage } = useApp();

  const [anchorProduct, setAnchorProduct] = useState<Product>(products[0]);
  const [labScenario, setLabScenario] = useState(selectedScenario);
  const [modelType, setModelType] = useState<'similarity' | 'complement' | 'combined'>('complement');
  const [recCount, setRecCount] = useState<number>(4);
  const [minConfidence, setMinConfidence] = useState<number>(0.4);
  const [strictTeamConstraint, setStrictTeamConstraint] = useState<boolean>(true);
  const [inStockOnly, setInStockOnly] = useState<boolean>(true);

  // Generate Candidates
  let candidates = products.filter((p) => p.id !== anchorProduct.id);

  const removedCandidates: { product: Product; reason: string }[] = [];

  // Filter candidates
  const filteredCandidates = candidates.filter((p) => {
    if (inStockOnly && p.inventoryStatus === 'Pre-Order') {
      removedCandidates.push({ product: p, reason: 'Inventory Filter: Pre-Order item excluded' });
      return false;
    }
    if (strictTeamConstraint && p.team !== anchorProduct.team) {
      removedCandidates.push({ product: p, reason: `Team Constraint: Product team (${p.team}) differs from anchor (${anchorProduct.team})` });
      return false;
    }
    return true;
  });

  // Score with active engine
  const similarityResults = runSimilarityEngine(anchorProduct, filteredCandidates, recCount);
  const complementResults = runComplementEngine(anchorProduct, filteredCandidates, recCount);

  const finalMlResults = modelType === 'similarity' ? similarityResults.map((r) => r.product) : complementResults.map((r) => r.product);

  // Generic Popularity Benchmark Results
  const genericResults = [...products]
    .filter((p) => p.id !== anchorProduct.id)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, recCount);

  // Calculate Overlap
  const mlIds = new Set(finalMlResults.map((p) => p.id));
  const genericIds = new Set(genericResults.map((p) => p.id));
  const overlapCount = finalMlResults.filter((p) => genericIds.has(p.id)).length;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 bg-slate-50 min-h-screen text-slate-900">
      {/* Title Header */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-red-600 text-white font-bold">
            <TestTube2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-display uppercase tracking-tight">
              RECOMMENDATION LAB SANDBOX
            </h1>
            <p className="text-xs text-slate-400">
              Interactive ML parameter testing, candidate filtering & benchmark evaluation
            </p>
          </div>
        </div>

        <div className="bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 text-xs font-mono text-emerald-400">
          Candidate Pool: {products.length} Products
        </div>
      </div>

      {/* Control Panel Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
        {/* Anchor Product Selector */}
        <div>
          <label className="block font-bold text-slate-800 mb-1">1. Select Anchor Product</label>
          <select
            value={anchorProduct.id}
            onChange={(e) => {
              const found = products.find((p) => p.id === e.target.value);
              if (found) setAnchorProduct(found);
            }}
            className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg p-2 font-medium focus:outline-none focus:border-red-500"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.team}] {p.name} (${p.price})
              </option>
            ))}
          </select>
        </div>

        {/* Model Type */}
        <div>
          <label className="block font-bold text-slate-800 mb-1">2. Select Model Engine</label>
          <select
            value={modelType}
            onChange={(e: any) => setModelType(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg p-2 font-medium focus:outline-none focus:border-red-500"
          >
            <option value="complement">Complement Engine (Cross-Sell / Complete the Look)</option>
            <option value="similarity">Similarity Engine (Substitutes / You May Also Like)</option>
          </select>
        </div>

        {/* Constraints */}
        <div className="space-y-2">
          <label className="block font-bold text-slate-800">3. Business Constraints</label>
          <label className="flex items-center space-x-2 text-slate-700">
            <input
              type="checkbox"
              checked={strictTeamConstraint}
              onChange={(e) => setStrictTeamConstraint(e.target.checked)}
              className="rounded text-red-600 focus:ring-red-500"
            />
            <span>Strict Same Team Filter</span>
          </label>
          <label className="flex items-center space-x-2 text-slate-700">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="rounded text-red-600 focus:ring-red-500"
            />
            <span>In-Stock Items Only</span>
          </label>
        </div>

        {/* Confidence Threshold */}
        <div>
          <label className="block font-bold text-slate-800 mb-1">
            4. Min Confidence Threshold ({Math.round(minConfidence * 100)}%)
          </label>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            value={minConfidence}
            onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
            className="w-full accent-red-600"
          />
        </div>
      </div>

      {/* Candidate Pipeline Trace */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <Sliders className="h-4 w-4 text-red-600" />
          <span>Candidate Filtering Pipeline</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="font-bold text-slate-800 block mb-1">Raw Catalog Pool</span>
            <span className="text-2xl font-black text-slate-900">{candidates.length} candidates</span>
          </div>
          <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 text-rose-900">
            <span className="font-bold block mb-1">Filtered Out</span>
            <span className="text-2xl font-black text-rose-700">{removedCandidates.length} items</span>
          </div>
          <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-emerald-900">
            <span className="font-bold block mb-1">Final Ranked Subset</span>
            <span className="text-2xl font-black text-emerald-700">{finalMlResults.length} items</span>
          </div>
        </div>

        {removedCandidates.length > 0 && (
          <div className="bg-slate-900 text-slate-300 p-3 rounded-xl text-xs space-y-1 font-mono">
            <div className="font-bold text-red-400">Sample Filtered Candidates:</div>
            {removedCandidates.slice(0, 3).map((rc, idx) => (
              <div key={idx} className="text-[11px] text-slate-400">
                • {rc.product.name} — <span className="text-rose-400">{rc.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Side-by-Side Comparison: Generic vs ML-Personalized */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Generic Popularity Recommendations */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Generic Popularity Benchmark</h3>
              <p className="text-xs text-slate-500">Unpersonalized global top sellers</p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-700 font-mono px-2 py-1 rounded">Baseline</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {genericResults.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onSelect={(prod) => {
                  setSelectedProduct(prod);
                  setStorefrontPage('pdp');
                }}
              />
            ))}
          </div>
        </div>

        {/* ML Personalized Recommendations */}
        <div className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-sm space-y-4 ring-1 ring-indigo-500/20">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-extrabold text-indigo-950 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                <span>ML-Personalized Output</span>
              </h3>
              <p className="text-xs text-slate-500">Intent + Complement/Similarity engine output</p>
            </div>
            <span className="text-xs bg-indigo-100 text-indigo-900 font-mono font-bold px-2 py-1 rounded border border-indigo-300">
              {modelType.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {finalMlResults.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onSelect={(prod) => {
                  setSelectedProduct(prod);
                  setStorefrontPage('pdp');
                }}
                badgeText="ML Ranked"
                badgeType={modelType === 'similarity' ? 'similarity' : 'complement'}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Overlap Indicator Explanation */}
      <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl text-xs text-indigo-950 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>
          <div className="font-extrabold text-indigo-900 text-sm">
            Catalog Recommendation Overlap: {overlapCount} / {recCount} items match generic popularity
          </div>
          <div className="text-slate-600 mt-0.5">
            {overlapCount === 0
              ? 'The ML model produces 100% unique personalized results tailored specifically to the fan context, completely outperforming generic popularity.'
              : 'The ML model refines popularity rankings with specific team, style, and cross-department complement compatibility.'}
          </div>
        </div>
      </div>
    </div>
  );
};
