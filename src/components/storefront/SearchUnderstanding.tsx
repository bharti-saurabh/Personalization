/**
 * What the search box decided the shopper meant, shown on the results page.
 *
 * A storefront search bar normally tells you nothing: you type, and products
 * appear, and if the wrong products appear you have no idea which word was
 * misread. This strip is the whole argument for query understanding made
 * visible - every node the engine resolved, what phrase produced it, how
 * certain it is, and which nodes were never typed at all but inferred from the
 * ones that were.
 *
 * TWO KINDS OF NODE, DRAWN DIFFERENTLY ON PURPOSE.
 *
 *   RESOLVED    a span of the shopper's own text matched a taxonomy value.
 *               Green, with the phrase quoted, because this is something the
 *               shopper said and can check.
 *   INFERRED    nobody typed it. "Hurts" implies the Eagles implies the NFL,
 *               each step damped. Grey and labelled as inferred, because
 *               drawing it the same as a typed node would quietly claim the
 *               shopper asked for something they did not.
 *
 * THE RESCUE BANNER is the part worth pausing on in a demo. A zero-result page
 * is the most expensive screen in retail and the easiest one to avoid, and the
 * ladder below shows exactly what was given up to avoid it: constraints come
 * off least-certain-first, each rung states how many products it reached, and
 * nothing that came off is silently forgotten - a dropped constraint stays on
 * as a ranking credit, which is why the results still lean toward the query.
 *
 * Nothing here is a claim about revenue. It is a claim about what the shopper
 * would otherwise have had to do next, which is the only thing this build
 * measures.
 */

import React from 'react';
import { Search, X, AlertTriangle, ChevronRight, Gift, Sparkles } from 'lucide-react';
import type { SearchResult } from '../../ml/query';

const KIND_LABEL: Record<string, string> = {
  player: 'Player',
  team: 'Team',
  league: 'League',
  department: 'Department',
  subdepartment: 'Category',
  brand: 'Brand',
  gender: 'Gender',
  ageGroup: 'Age',
  size: 'Size',
  priceCeiling: 'Max price',
  giftIntent: 'Gift',
};

export const SearchUnderstanding: React.FC<{
  result: SearchResult;
  onClear: () => void;
}> = ({ result, onClear }) => {
  const { interpretation: q } = result;
  const resolved = q.nodes.filter((n) => n.via !== 'propagated');
  const inferred = q.nodes.filter((n) => n.via === 'propagated');

  return (
    <div className="max-w-[1400px] mx-auto px-5 pt-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
        {/* The query itself, and the way out of it. */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-200 bg-white">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
              Search results
            </div>
            <div className="text-[15px] font-black font-display text-slate-900 truncate">“{q.raw}”</div>
          </div>
          <div className="shrink-0 text-right hidden sm:block">
            <div className="text-[17px] font-black font-mono leading-none tabular-nums">
              {result.matched.length.toLocaleString()}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-slate-400">results</div>
          </div>
          <button
            onClick={onClear}
            className="shrink-0 ml-1 flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear search
          </button>
        </div>

        {/* The interpretation. */}
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400 mb-1.5">
            <Sparkles className="h-3 w-3" />
            Mapped onto the catalog taxonomy
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {q.nodes.length === 0 && (
              <span className="text-[11px] text-slate-500">
                No word in this query names a team, player, department or brand in this catalog.
              </span>
            )}

            {resolved.map((n, i) => (
              <span
                key={`r-${n.kind}-${n.value}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 pl-2 pr-2.5 py-1"
                title={n.note}
              >
                {n.kind === 'giftIntent' && <Gift className="h-3 w-3 text-emerald-700" />}
                <span className="text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-emerald-600">
                  {KIND_LABEL[n.kind] ?? n.kind}
                </span>
                <span className="text-[11.5px] font-bold text-emerald-900">{n.value}</span>
                {n.span && <span className="text-[10px] text-emerald-700/70 font-mono">“{n.span}”</span>}
                <span className="text-[10px] font-mono tabular-nums text-emerald-700/70">
                  {Math.round(n.confidence * 100)}%
                </span>
              </span>
            ))}

            {inferred.map((n, i) => (
              <span
                key={`i-${n.kind}-${n.value}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white pl-2 pr-2.5 py-1"
                title={n.note}
              >
                <span className="text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-slate-400">
                  {KIND_LABEL[n.kind] ?? n.kind} · inferred
                </span>
                <span className="text-[11.5px] font-bold text-slate-700">{n.value}</span>
                <span className="text-[10px] font-mono tabular-nums text-slate-400">
                  {Math.round(n.confidence * 100)}%
                </span>
              </span>
            ))}

            {q.unmatched.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1">
                <span className="text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-slate-400">
                  Unmapped
                </span>
                <span className="text-[11px] font-mono text-slate-500">{q.unmatched.join(' · ')}</span>
              </span>
            )}
          </div>

          {inferred.length > 0 && (
            <p className="mt-1.5 text-[10px] text-slate-500 leading-snug">
              Inferred nodes were never typed. A player implies their club and a club implies its
              league, each step damped, so they steer the ranking without being treated as something
              the shopper asked for.
            </p>
          )}

          {q.nodes.some((n) => n.kind === 'giftIntent') && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[10px] text-slate-600 leading-snug">
              <Gift className="h-3 w-3 shrink-0 mt-0.5 text-slate-400" />
              <span>
                Read as a gift, so this shopper's own player affinity and saved size are switched off
                for this search. Personalizing a purchase towards the person buying it is the wrong
                answer when they have said it is for somebody else.
              </span>
            </p>
          )}
        </div>

        {/* The rescue, when one fired. */}
        {result.rescue && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[12px] font-black text-amber-900">{result.rescue.headline}</p>
                <p className="text-[10.5px] text-amber-800 leading-snug mt-0.5">{result.rescue.detail}</p>
              </div>
            </div>

            {result.rescue.steps.length > 0 && (
              <div className="mt-2 pl-5.5 space-y-1">
                <div className="text-[8.5px] font-extrabold uppercase tracking-[0.14em] text-amber-600">
                  Relaxed least-certain first
                </div>
                {result.rescue.steps.map((step, i) => (
                  <div key={`${step.label}-${i}`} className="flex items-center gap-1.5 text-[10.5px]">
                    <span className="font-mono text-amber-500 tabular-nums shrink-0">{i + 1}</span>
                    <span className="line-through text-amber-800 font-semibold">{step.label}</span>
                    <ChevronRight className="h-3 w-3 text-amber-400 shrink-0" />
                    <span className="text-amber-700 font-mono tabular-nums shrink-0">
                      {step.matchesAfter} result{step.matchesAfter === 1 ? '' : 's'}
                    </span>
                    <span className="text-amber-600/70 truncate hidden md:inline">· {step.reason}</span>
                  </div>
                ))}
                <p className="text-[10px] text-amber-700/80 leading-snug pt-0.5">
                  Nothing that came off was forgotten: each dropped constraint stays on as a ranking
                  credit, so products that still match it are ordered first.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
