/**
 * Experience: the effort ledger, live.
 *
 * The question this tab exists to answer is the one the other two cannot: not
 * "what does the model believe" or "what did it just do", but "what did the
 * shopper NOT have to do because it did". Rails not scrolled past, facets not
 * hunted for, a size not re-entered, slots the evidence would not fill.
 *
 * IT SHIPPED EMPTY AND SAYS SO WHEN IT IS. The tab used to be a stub with a
 * standing note that an effort-avoided figure is the single most quotable
 * number in this demo, and that a quotable number that was invented is worse
 * than no tab at all. That still holds - it is why the empty state below is a
 * statement about instrumentation rather than a row of zeros, and why the
 * per-action costs stay marked as benchmarks even now that the counts are real.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT, stated plainly because the distinction is
 * the whole value of the tab:
 *
 *   REAL        the counts. Every row was emitted by a surface that computed
 *               both orderings - the personalized one and the merchandised
 *               default - from the same inputs in the same render, and every
 *               position in the detail line can be counted off the screen.
 *   BENCHMARK   the conversion from a count to seconds. A click is countable;
 *               the seconds it costs a person are not, and this demo has no
 *               shoppers to time. Those constants are stated per row rather
 *               than folded silently into one number.
 *
 * The session-end reading is the paired total, not a re-simulation. See the
 * header of ml/effort.ts for why a replayed session would be the weaker claim.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { EFFORT_KINDS } from '../../ml/effort';
import type { EffortKind } from '../../ml/effort';
import { Timer, MousePointerClick, ArrowDown, ArrowUp, Scale } from 'lucide-react';

const ORDER: EffortKind[] = [
  'search',
  'filter',
  'sort',
  'pagination',
  'backtrack',
  'dead_end',
  'size_hunt',
  'scroll_depth',
  'suppressed_impression',
];

export const ExperienceTab: React.FC = () => {
  const { effortLedger: ledger } = useApp();
  const empty = ledger.entries.length === 0;
  const { replay } = ledger;

  // Newest first: the shopper's most recent decision is the one they can still
  // remember making, and it is the one worth pointing at in a demo.
  const entries = [...ledger.entries].reverse();

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

      {/* The session against itself. */}
      {!empty && (
        <div className="rounded-xl border border-straive-200 bg-straive-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-straive-700">
            <Scale className="h-3 w-3" /> This session, replayed unpersonalized
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-slate-400">As it ran</div>
              <div className="text-[17px] font-display font-extrabold text-slate-900 tabular-nums leading-none mt-0.5">
                {replay.personalizedSeconds}s
              </div>
            </div>
            <div>
              <div className="text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-slate-400">
                Same decisions, off
              </div>
              <div className="text-[17px] font-display font-extrabold text-slate-900 tabular-nums leading-none mt-0.5">
                {replay.unpersonalizedSeconds}s
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 border-t border-straive-200 pt-1.5">
            {replay.savedSeconds >= 0 ? (
              <ArrowDown className="h-3 w-3 text-emerald-600 shrink-0" />
            ) : (
              <ArrowUp className="h-3 w-3 text-amber-600 shrink-0" />
            )}
            <span
              className={`text-[11.5px] font-extrabold tabular-nums ${
                replay.savedSeconds >= 0 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {replay.savedSeconds >= 0 ? '-' : '+'}
              {Math.abs(replay.savedSeconds)}s
            </span>
            <span className="text-[10px] text-slate-500">
              across {replay.decisions} paired decision{replay.decisions === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-1.5 text-[9.5px] text-slate-500 leading-snug">
            Not a second simulation. Each decision was paired against its own merchandised default at
            the moment it was made, so this counts only decisions the shopper actually reached — and
            it can go the other way when the model reads them wrong.
          </p>
        </div>
      )}

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
          <p className="text-[11px] font-bold text-amber-900">Nothing recorded yet this session</p>
          <p className="mt-0.5 text-[10.5px] text-amber-800 leading-snug">
            The ledger is written by the storefront's own surfaces, and only when personalization is
            on. Click a category, a team or a product and the first paired decision lands here.
          </p>
        </div>
      )}

      {/* The ledger itself. */}
      {!empty && (
        <section className="space-y-1.5">
          <h3 className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400 px-0.5">
            What each decision saved
          </h3>
          {entries.map((e) => {
            const meta = EFFORT_KINDS[e.kind];
            const seconds = meta.secondsEach * e.count;
            const clicks = meta.clicksEach * e.count;
            return (
              <div
                key={e.id}
                className={`rounded-lg border px-2.5 py-2 ${
                  e.avoided ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-slate-400 shrink-0">
                    {e.surface}
                  </span>
                  <span className="flex-1" />
                  <span
                    className={`shrink-0 font-mono text-[9.5px] font-bold tabular-nums ${
                      e.avoided ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {e.avoided ? '-' : '+'}
                    {seconds}s{clicks > 0 ? ` · ${e.avoided ? '-' : '+'}${clicks} click${clicks === 1 ? '' : 's'}` : ''}
                  </span>
                </div>
                <p className="text-[11.5px] font-bold text-slate-900 leading-snug mt-0.5">{e.label}</p>
                {e.detail && (
                  <p className="text-[10px] text-slate-500 leading-snug mt-0.5 font-mono">{e.detail}</p>
                )}
              </div>
            );
          })}
        </section>
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
        The counts are real: every one was emitted by the surface that made the decision, paired
        against the default it replaced. The per-action costs above are simulated benchmarks and stay
        that way — a click is countable, and the seconds it costs a person are not something this
        demo has measured. Nothing on this tab converts to money.
      </p>
    </div>
  );
};
