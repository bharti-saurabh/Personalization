/**
 * The sandbox: change an input, watch the ranking move.
 *
 * The controls on this screen used to be decorative. The confidence slider was
 * read into state and never consulted; the result-count had no control at all;
 * the "filtered out" tally counted every product the constraints rejected
 * rather than anything the engine had scored. So the page looked interactive
 * and was not, which is the worst thing a demo can be in front of an audience
 * that came to poke at it.
 *
 * Every control now feeds the pipeline that is printed underneath it:
 *
 *   catalog -> constraints -> engine scoring -> confidence gate -> top N
 *
 * and each stage prints what it received and what it passed on. The engine is
 * asked for a deep pool rather than exactly N, so the gate has something to
 * reject; otherwise raising the threshold would silently shorten the list
 * instead of showing you what fell below the line.
 */

import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
import { TestTube2, Sparkles, Sliders, ArrowDown } from 'lucide-react';
import { SURFACE_POLICIES, applySuppression, inertContext, runComplementEngine, runSimilarityEngine } from '../../ml/engine';
import { ProductCard } from '../storefront/ProductCard';
import { TeamCrest } from '../brand/Identity';

type Engine = 'similarity' | 'complement';

/** One scored candidate, flattened so both engines can share the rendering. */
interface Scored {
  product: Product;
  score: number;
  note: string;
}

export const RecommendationLab: React.FC = () => {
  const { products, setSelectedProduct, setStorefrontPage, suppressionCtx } = useApp();

  const [anchorId, setAnchorId] = useState<string>(products[0]?.id ?? '');
  const [engine, setEngine] = useState<Engine>('complement');
  /**
   * The gate, switchable.
   *
   * Suppression is the one stage here whose value is only visible by removing
   * it. Every other control makes the list shorter in a way you can reason
   * about from the score; this one removes things that scored WELL, for reasons
   * that live outside the score entirely. A viewer who cannot toggle it has to
   * take on trust that anything was removed at all.
   */
  const [suppressionOn, setSuppressionOn] = useState(true);
  const [recCount, setRecCount] = useState<number>(4);
  // 0.25 rather than 0.5. Complement scores are conditional probabilities on a
  // display scale, and their distribution is one strong pair well clear of a
  // long tail near 0.33 - so a half-way default would open the screen on a
  // single result and look broken. At 0.25 the page opens full and the slider
  // visibly starves it, which is the motion worth showing.
  const [minConfidence, setMinConfidence] = useState<number>(0.25);
  const [strictTeamConstraint, setStrictTeamConstraint] = useState<boolean>(true);
  const [inStockOnly, setInStockOnly] = useState<boolean>(true);

  const anchorProduct = products.find((p) => p.id === anchorId) ?? products[0];

  /**
   * The whole pipeline, recomputed from the controls. Deriving it in one memo
   * keeps the stage counters and the cards below from disagreeing, which they
   * would if each was computed where it is displayed.
   */
  const run = useMemo(() => {
    if (!anchorProduct) {
      return {
        pool: 0,
        rejected: [] as { product: Product; reason: string }[],
        scored: [] as Scored[],
        above: [] as Scored[],
        kept: [] as Scored[],
        cut: [] as Scored[],
        gate: applySuppression([], inertContext(), SURFACE_POLICIES.pdp_similar),
      };
    }

    const rejected: { product: Product; reason: string }[] = [];
    const candidates = products.filter((p) => {
      if (p.id === anchorProduct.id) return false;
      if (inStockOnly && p.inventoryStatus === 'Pre-Order') {
        rejected.push({ product: p, reason: 'Inventory constraint: pre-order' });
        return false;
      }
      if (strictTeamConstraint && p.team !== anchorProduct.team) {
        rejected.push({ product: p, reason: `Team constraint: ${p.team} is not ${anchorProduct.team}` });
        return false;
      }
      // The complement engine only ever scores across departments - a jersey is
      // not a companion to another jersey. That rule normally lives inside the
      // engine, but here it has to be visible: if it stayed hidden, the pool
      // counter would promise 131 candidates and the gate would report on 14.
      if (engine === 'complement' && p.department === anchorProduct.department) {
        rejected.push({ product: p, reason: `Complement rule: ${p.department} is the anchor's own department` });
        return false;
      }
      return true;
    });

    // Score the whole constrained pool, not a top-N slice of it. A limit here
    // would put a second, invisible cut between "after constraints" and the
    // gate, so the gate would report on 40 candidates while the counter beside
    // it promised 101. Both engines are a linear pass over the pool, so asking
    // for all of it costs nothing worth saving.
    //
    // The engines' own filters are switched off here rather than left on their
    // defaults. Stock and department rules have already been applied above,
    // where the shopper can see the count move, and the diversity caps
    // (two per style, two per department) would silently drop candidates
    // between "after constraints" and "scored" - which is exactly the kind of
    // unexplained arithmetic this screen exists to eliminate.
    const DEPTH = candidates.length;
    const scored: Scored[] =
      engine === 'similarity'
        ? runSimilarityEngine(anchorProduct, candidates, DEPTH, {
            inStockOnly: false,
            maxPerStyle: 99,
            minScore: 0,
          }).map((r) => ({
            product: r.product,
            score: r.totalScore,
            note: r.explanation,
          }))
        : runComplementEngine(anchorProduct, candidates, DEPTH, {
            inStockOnly: false,
            crossDepartmentOnly: false,
            maxPerDepartment: 99,
          }).map((r) => ({
            product: r.product,
            score: r.complementScore,
            note: r.relationshipType,
          }));

    const above = scored.filter((s) => s.score >= minConfidence);
    const cut = scored.filter((s) => s.score < minConfidence);

    /*
     * The suppression gate, run on the Lab's OWN policy rather than on one of
     * the storefront's.
     *
     * `leadThreshold` and `tailThreshold` are both the slider's value, which
     * flattens the per-slot ramp to nothing. That is deliberate: the slider is
     * this screen's confidence control, and a surface policy that quietly
     * imposed a second, different threshold would make the funnel's arithmetic
     * stop adding up - which is the one thing this screen may not do. What is
     * left is exactly the three rules that have nothing to do with the score:
     * ownership, rivalry, fatigue.
     */
    const gate = applySuppression(
      above.map((s) => ({ product: s.product, confidence: s.score, source: engine })),
      suppressionOn ? suppressionCtx : inertContext(),
      {
        id: 'lab',
        label: 'Lab bench',
        page: 'pdp',
        slots: recCount,
        leadThreshold: minConfidence,
        tailThreshold: minConfidence,
        // The bench's scale is whichever engine the dropdown is on, and the
        // slider is read in those terms - which is why its range is the range
        // of the engine, not a fixed 0..1.
        scale: engine === 'similarity' ? ('similarity' as const) : ('complement' as const),
        rationale:
          'The bench uses one flat threshold - the slider above - so the only candidates removed here are the ones removed by a rule rather than by a score.',
      },
      { anchor: anchorProduct }
    );

    const byId = new Map(above.map((s) => [s.product.id, s]));
    const kept = gate.kept.map((c) => byId.get(c.product.id)!).filter(Boolean);

    return { pool: candidates.length, rejected, scored, above, kept, cut, gate };
  }, [
    anchorProduct,
    products,
    engine,
    recCount,
    minConfidence,
    strictTeamConstraint,
    inStockOnly,
    suppressionOn,
    suppressionCtx,
  ]);

  /** The baseline this is being compared against: no model, just sales volume. */
  const genericResults = useMemo(
    () =>
      [...products]
        .filter((p) => p.id !== anchorProduct?.id)
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, recCount),
    [products, anchorProduct, recCount]
  );

  const genericIds = new Set(genericResults.map((p) => p.id));
  const overlapCount = run.kept.filter((s) => genericIds.has(s.product.id)).length;

  const openProduct = (prod: Product) => {
    setSelectedProduct(prod);
    setStorefrontPage('pdp');
  };

  if (!anchorProduct) return null;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 bg-slate-50 min-h-screen text-slate-900">
      {/* Title */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-red-600 text-white">
            <TestTube2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-display uppercase tracking-tight">Recommendation Lab</h1>
            <p className="text-xs text-slate-400">
              Every control below feeds the pipeline underneath it. Move one and the numbers move.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 bg-slate-800 px-3 py-2 rounded-xl border border-slate-700">
          <TeamCrest team={anchorProduct.team} size="sm" />
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-widest text-slate-400">Anchor</div>
            <div className="text-[11px] font-bold truncate max-w-[15rem]">{anchorProduct.name}</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 text-xs">
        <div>
          <label className="block font-bold text-slate-800 mb-1.5">1 · Anchor product</label>
          <select
            value={anchorProduct.id}
            onChange={(e) => setAnchorId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg p-2 font-medium focus:outline-hidden focus:border-red-500"
          >
            {products.slice(0, 200).map((p) => (
              <option key={p.id} value={p.id}>
                [{p.team}] {p.name} (${p.price})
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-400 mt-1">
            First 200 of {products.length.toLocaleString()} - a select with the whole catalog in it is unusable.
          </p>
        </div>

        <div>
          <label className="block font-bold text-slate-800 mb-1.5">2 · Engine</label>
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as Engine)}
            className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg p-2 font-medium focus:outline-hidden focus:border-red-500"
          >
            <option value="complement">Complement: cross-sell, complete the look</option>
            <option value="similarity">Similarity: substitutes, you may also like</option>
          </select>
          <p className="text-[10px] text-slate-400 mt-1">
            {engine === 'complement'
              ? 'Scores co-order and co-cart strength across departments.'
              : 'Scores embedding distance within department and style family.'}
          </p>
        </div>

        <div className="space-y-2.5">
          <label className="block font-bold text-slate-800">3 · Business constraints</label>
          <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={strictTeamConstraint}
              onChange={(e) => setStrictTeamConstraint(e.target.checked)}
              className="rounded-sm accent-red-600"
            />
            <span>Same club only</span>
          </label>
          <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="rounded-sm accent-red-600"
            />
            <span>In stock only</span>
          </label>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              4 · Confidence gate · <span className="font-mono">{minConfidence.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0.05"
              max="0.95"
              step="0.05"
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="w-full accent-red-600"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              5 · Results returned · <span className="font-mono">{recCount}</span>
            </label>
            <input
              type="range"
              min="2"
              max="8"
              step="1"
              value={recCount}
              onChange={(e) => setRecCount(parseInt(e.target.value, 10))}
              className="w-full accent-red-600"
            />
          </div>
        </div>
      </div>

      {/* Pipeline trace */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <Sliders className="h-4 w-4 text-red-600" />
          Candidate pipeline
        </h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <Stage label="Catalog" value={products.length - 1} tone="slate" note="Everything but the anchor" />
          <Stage
            label="After constraints"
            value={run.pool}
            tone="slate"
            note={`${run.rejected.length.toLocaleString()} rejected before scoring`}
          />
          <Stage
            label="Above the gate"
            value={run.scored.length - run.cut.length}
            tone="amber"
            note={`${run.cut.length} of ${run.scored.length} scored below ${minConfidence.toFixed(2)}`}
          />
          <Stage
            label="After suppression"
            value={run.gate.unsuppressed.length - run.gate.suppressed.length}
            tone={run.gate.fired ? 'rose' : 'slate'}
            note={
              suppressionOn
                ? run.gate.fired
                  ? `${run.gate.suppressed.length} removed by rule, not by score`
                  : 'No rule fired on this pool'
                : 'Gate switched off'
            }
          />
          <Stage label="Returned" value={run.kept.length} tone="emerald" note={`Top ${recCount} of what survived`} />
        </div>

        {/* The toggle belongs beside the funnel, not up in the control block:
            it is the only control here whose effect you read by comparing two
            states of this diagram. */}
        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={suppressionOn}
            onChange={(e) => setSuppressionOn(e.target.checked)}
            className="h-3.5 w-3.5 accent-rose-600"
          />
          Apply the suppression gate
          <span className="font-normal text-slate-500">
            : ownership, rivalry and fatigue rules. Untick it to see what they were removing.
          </span>
        </label>

        {/* What the RULES rejected, kept visually distinct from what the score
            rejected. They are different kinds of refusal: one is the model
            saying "not sure", the other is the store saying "not this, ever". */}
        {run.gate.fired && (
          <div className="bg-rose-950 text-rose-100 p-3 rounded-xl text-[11px] space-y-1 font-mono">
            <div className="font-bold text-rose-300 flex items-center gap-1.5">
              <ArrowDown className="h-3 w-3" />
              Scored well, refused anyway
            </div>
            {run.gate.suppressed.slice(0, 5).map((d) => (
              <div key={d.product.id} className="text-rose-200/80 flex justify-between gap-3">
                <span className="truncate">{d.product.name}</span>
                <span className="text-rose-400 shrink-0">{d.ruleLabel}</span>
              </div>
            ))}
            <div className="text-rose-300/60 pt-1 font-sans text-[10px] leading-snug">
              {run.gate.suppressed[0]?.reason}
            </div>
          </div>
        )}

        {/* What the gate rejected. This is the part that makes the slider
            legible: without it, raising the threshold just shortens a list. */}
        {run.cut.length > 0 && (
          <div className="bg-slate-900 text-slate-300 p-3 rounded-xl text-[11px] space-y-1 font-mono">
            <div className="font-bold text-amber-400 flex items-center gap-1.5">
              <ArrowDown className="h-3 w-3" />
              Scored but rejected by the confidence gate
            </div>
            {run.cut.slice(0, 4).map((c) => (
              <div key={c.product.id} className="text-slate-400 flex justify-between gap-3">
                <span className="truncate">{c.product.name}</span>
                <span className="text-rose-400 shrink-0">{c.score.toFixed(3)} &lt; {minConfidence.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {run.kept.length === 0 && (
          <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-3 text-xs">
            Nothing cleared the gate at {minConfidence.toFixed(2)}. That is a real outcome rather than an error. In
            production this is where a rail is suppressed instead of filled with weak matches. Lower the threshold or
            relax a constraint.
          </div>
        )}
      </div>

      {/* Baseline vs engine */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Popularity baseline</h3>
              <p className="text-xs text-slate-500">Top sellers, ignoring the anchor entirely</p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-700 font-mono px-2 py-1 rounded-sm">Baseline</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {genericResults.map((p) => (
              <ProductCard key={p.id} product={p} onSelect={openProduct} />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-sm space-y-4 ring-1 ring-indigo-500/20">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-extrabold text-indigo-950 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                Engine output
              </h3>
              <p className="text-xs text-slate-500">Scored against the anchor, then gated</p>
            </div>
            <span className="text-xs bg-indigo-100 text-indigo-900 font-mono font-bold px-2 py-1 rounded-sm border border-indigo-300">
              {engine.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {run.kept.map((s) => (
              <div key={s.product.id} className="space-y-1">
                <ProductCard
                  product={s.product}
                  onSelect={openProduct}
                  badgeText={`${Math.round(s.score * 100)}%`}
                  badgeType={engine === 'similarity' ? 'similarity' : 'complement'}
                />
                <div className="text-[10px] text-slate-500 leading-snug line-clamp-2 px-0.5">{s.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl text-xs text-indigo-950">
        <div className="font-extrabold text-indigo-900 text-sm">
          Overlap with the baseline: {overlapCount} of {run.kept.length}
        </div>
        <div className="text-slate-600 mt-0.5">
          {overlapCount === 0
            ? 'None of the returned items are simply the catalog bestsellers, so the ranking is coming from the anchor rather than from sales volume. Whether that is better is what the Model Evidence screen measures. This screen only shows that it is different.'
            : 'Some of the returned items are also global bestsellers. That is expected: a popular product is popular partly because it goes with things.'}
        </div>
      </div>
    </div>
  );
};

const TONE = {
  slate: 'bg-slate-50 border-slate-200 text-slate-900',
  amber: 'bg-amber-50 border-amber-200 text-amber-900',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  // Refusal reads red everywhere else in this build, and the funnel is not the
  // place to invent a second visual language for it.
  rose: 'bg-rose-50 border-rose-200 text-rose-900',
} as const;

const Stage: React.FC<{ label: string; value: number; note: string; tone: keyof typeof TONE }> = ({
  label,
  value,
  note,
  tone,
}) => (
  <div className={`p-3 rounded-xl border ${TONE[tone]}`}>
    <span className="font-bold block mb-0.5">{label}</span>
    <span className="text-2xl font-black font-mono">{value.toLocaleString()}</span>
    <span className="block text-[10px] opacity-70 mt-0.5 leading-snug">{note}</span>
  </div>
);
