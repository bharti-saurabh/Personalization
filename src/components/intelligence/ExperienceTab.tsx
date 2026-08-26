/**
 * Experience: the effort ledger. A stub, deliberately and visibly.
 *
 * The question this tab exists to answer is the one the other two cannot: not
 * "what does the model believe" or "what did it just do", but "what did the
 * shopper NOT have to do because it did". Searches not typed, filters not set,
 * pages not paged through, dead ends not walked into.
 *
 * Nothing writes to the ledger yet, so it reads zero, and it says zero rather
 * than showing a plausible number. This is the whole reason the tab ships empty
 * instead of ships fake: an effort-avoided figure is the single most quotable
 * number in this demo, and a quotable number that was invented is worse than no
 * tab at all - it is the one thing a client will repeat to someone who will
 * check it.
 *
 * The instrumentation contract is on screen so the shape of the real thing is
 * legible from the stub: these are the kinds it will count, and this is what
 * each one costs. Wiring it is storefront work - the storefront has to emit an
 * effort event when a filter is set or a search is typed - and that is a
 * separate change to a separate layer.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { EFFORT_KINDS } from '../../ml/effort';
import type { EffortKind } from '../../ml/effort';
import { Timer, MousePointerClick } from 'lucide-react';

const ORDER: EffortKind[] = [
  'search',
  'filter',
  'sort',
  'pagination',
  'backtrack',
  'dead_end',
  'size_hunt',
  'scroll_depth',
];

export const ExperienceTab: React.FC = () => {
  const { effortLedger: ledger } = useApp();
  const empty = ledger.entries.length === 0;

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
      {/* Totals. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
            <MousePointerClick className="h-3 w-3" /> Clicks avoided
          </div>
          <div className="mt-0.5 text-[20px] font-display font-extrabold text-slate-900 tabular-nums">
            {ledger.incurred.avoidedClicks}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
            <Timer className="h-3 w-3" /> Seconds avoided
          </div>
          <div className="mt-0.5 text-[20px] font-display font-extrabold text-slate-900 tabular-nums">
            {ledger.incurred.avoidedSeconds}
          </div>
        </div>
      </div>

      {/* The share. Null is not zero, and it is not rendered as zero. */}
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <div className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
          Share of effort avoided
        </div>
        {ledger.avoidedShare === null ? (
          <>
            <div className="mt-0.5 text-[15px] font-display font-extrabold text-slate-400">Not measured</div>
            <p className="mt-0.5 text-[10.5px] text-slate-500 leading-snug">
              No effort has been recorded, so this ratio has no denominator. It is undefined, not
              zero — showing 0% would claim a measurement that was never taken.
            </p>
          </>
        ) : (
          <div className="mt-0.5 text-[20px] font-display font-extrabold text-slate-900 tabular-nums">
            {Math.round(ledger.avoidedShare * 100)}%
          </div>
        )}
      </div>

      {/* Status. */}
      {empty && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[11px] font-bold text-amber-900">Ledger not yet instrumented</p>
          <p className="mt-0.5 text-[10.5px] text-amber-800 leading-snug">
            The storefront does not emit effort events yet, so this tab reads empty by design. The
            counters below are the contract it will be wired to, not results.
          </p>
        </div>
      )}

      {/* The contract. */}
      <section className="space-y-1.5">
        <h3 className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400 px-0.5">
          What gets counted
        </h3>
        {ORDER.map((kind) => {
          const meta = EFFORT_KINDS[kind];
          const row = ledger.byKind.find((b) => b.kind === kind);
          return (
            <div key={kind} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[11.5px] font-bold text-slate-900">{meta.label}</span>
                <span className="flex-1" />
                <span className="shrink-0 font-mono text-[9.5px] text-slate-400 tabular-nums">
                  {meta.clicksEach} click{meta.clicksEach === 1 ? '' : 's'} · {meta.secondsEach}s each
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-snug mt-0.5">{meta.intent}</p>
              <div className="mt-1 flex items-center gap-3 text-[9.5px] font-mono text-slate-400">
                <span>incurred {row?.incurred ?? 0}</span>
                <span>avoided {row?.avoided ?? 0}</span>
              </div>
            </div>
          );
        })}
      </section>

      <p className="text-[9.5px] leading-snug text-slate-400 px-0.5 pb-1">
        Per-action costs are simulated benchmarks, not measurements from this session. When the
        ledger is wired, the counts become real and these stay as the conversion rate — which is
        the honest split, since a click is countable and the seconds it costs a person are not.
      </p>
    </div>
  );
};
