/**
 * The delta stream: one card per moment the system did something.
 *
 * Each card answers four questions in a fixed order, because the order is the
 * argument. What happened. What ran. What it wrote. What moved on screen.
 *
 * The reading at the top of every card is a mechanism, then a consequence, then
 * a number, and never a posterior. That rule is enforced upstream in
 * decisions.ts - DecisionReading is an ordered triple of three required fields
 * and numberOf() is built only from countable things - so this component cannot
 * render an entry that breaks it even by accident. What is left here is the
 * typography that makes the order legible: mechanism in grey, consequence in
 * black, number set apart on its own line.
 *
 * The full feature vector is behind a disclosure rather than on the card. A
 * client who wants it will ask; a client who does not should never see 40 rows
 * of floats.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { fieldLabel } from '../../ml/decisions';
import type { DecisionEntry, FeatureRow } from '../../ml/decisions';
import type { ProfileDelta } from '../../ml/engine';
import { ChevronDown, ChevronRight, Cpu, Layers, PenLine, Check, X as XIcon } from 'lucide-react';

/* ------------------------------------------------------------------ atoms -- */

const KIND_STYLE: Record<string, string> = {
  observation: 'bg-sky-50 border-sky-200 text-sky-800',
  propagation: 'bg-violet-50 border-violet-200 text-violet-800',
  state: 'bg-slate-50 border-slate-200 text-slate-700',
  seed: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  promotion: 'bg-amber-50 border-amber-200 text-amber-800',
};

/**
 * A written field.
 *
 * before/after are `number | string | null` because not every tracked field is
 * a posterior - region is a string, and an unset field is genuinely null rather
 * than zero. Numeric writes get the arithmetic; categorical writes get the
 * transition and no invented delta, because "Unplaced -> Northeast" has no
 * magnitude and printing one would be a fabrication.
 */
const WriteChip: React.FC<{ delta: ProfileDelta }> = ({ delta }) => {
  const numeric = typeof delta.before === 'number' && typeof delta.after === 'number';
  const moved = numeric ? (delta.after as number) - (delta.before as number) : null;
  const show = (v: number | string | null) =>
    v === null ? '—' : typeof v === 'number' ? v.toFixed(2) : v;

  return (
    <div
      className={`rounded-md border px-2 py-1 text-[10px] leading-tight ${
        KIND_STYLE[delta.kind] ?? KIND_STYLE.state
      }`}
      title={delta.label}
    >
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="font-bold">{fieldLabel(delta.path)}</span>
        <span className="font-mono tabular-nums opacity-80">
          {show(delta.before)} → {show(delta.after)}
        </span>
        {moved !== null && (
          <span className={`font-mono font-bold ${moved >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {moved >= 0 ? '+' : ''}
            {moved.toFixed(2)}
          </span>
        )}
      </div>
      <div className="opacity-70">
        {delta.kind} · confidence now {(delta.confidenceAfter * 100).toFixed(0)}%
      </div>
    </div>
  );
};

const FeatureVector: React.FC<{ rows: FeatureRow[] }> = ({ rows }) => {
  const groups = useMemo(() => {
    const out = new Map<string, FeatureRow[]>();
    for (const r of rows) {
      const bucket = out.get(r.group);
      if (bucket) bucket.push(r);
      else out.set(r.group, [r]);
    }
    return [...out.entries()];
  }, [rows]);

  if (!rows.length) {
    return <p className="text-[10px] text-slate-400 italic">No feature vector recorded for this beat.</p>;
  }

  return (
    <div className="space-y-2">
      {groups.map(([group, items]) => (
        <div key={group}>
          <div className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400 mb-1">{group}</div>
          <div className="rounded-md border border-slate-200 overflow-hidden">
            {items.map((r, i) => (
              <div
                key={`${r.label}-${i}`}
                className={`flex items-baseline gap-2 px-2 py-1 text-[10px] ${
                  i % 2 ? 'bg-slate-50' : 'bg-white'
                }`}
              >
                <span className="flex-1 min-w-0 truncate text-slate-600">{r.label}</span>
                {r.weight !== undefined && (
                  <span className="shrink-0 font-mono text-[9px] text-slate-400 tabular-nums">
                    w {r.weight.toFixed(2)}
                  </span>
                )}
                <span className="shrink-0 font-mono font-bold text-slate-900 tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------- card -- */

const DecisionCard: React.FC<{ entry: DecisionEntry; defaultOpen: boolean }> = ({ entry, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [vector, setVector] = useState(false);

  return (
    <article className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Trigger. */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-slate-50 transition-colors"
      >
        <span className="mt-0.5 shrink-0 h-5 w-5 rounded-md bg-slate-900 text-white grid place-items-center text-[9px] font-mono font-bold">
          {entry.seq}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-bold text-slate-900 leading-snug">{entry.trigger.headline}</span>
          <span className="block text-[9.5px] font-mono text-slate-400 mt-0.5">
            {entry.at} · {entry.trigger.page}
            {entry.trigger.weight !== undefined ? ` · weight ${entry.trigger.weight.toFixed(2)}` : ''}
            {!entry.personalizationOn && ' · personalization off'}
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        )}
      </button>

      {/* The reading. Mechanism, consequence, number - in that order, always. */}
      <div className="px-3 pb-2.5 -mt-0.5">
        <p className="text-[10.5px] text-slate-500 leading-snug">{entry.reading.mechanism}</p>
        <p className="text-[12px] font-semibold text-slate-900 leading-snug mt-0.5">{entry.reading.consequence}</p>
        <p className="mt-1 inline-block rounded-md bg-slate-900 text-white px-2 py-0.5 text-[10px] font-mono font-bold tabular-nums">
          {entry.reading.number}
        </p>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-2.5">
          {/* Models that ran. */}
          {entry.models.length > 0 && (
            <section>
              <h4 className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
                <Cpu className="h-3 w-3" /> Models that ran
              </h4>
              <div className="space-y-1.5">
                {entry.models.map((m, i) => (
                  <div key={`${m.engine}-${i}`} className="rounded-lg border border-slate-200 px-2 py-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] font-mono font-bold text-straive-700 uppercase">{m.engine}</span>
                      <span className="flex-1 min-w-0 truncate text-[10.5px] text-slate-600">{m.question}</span>
                      {m.latencyMs !== undefined && (
                        <span className="shrink-0 text-[9px] font-mono text-slate-400">{m.latencyMs}ms</span>
                      )}
                    </div>
                    {m.scores.slice(0, 3).map((s) => (
                      <div key={s.label} className="mt-1 flex items-center gap-1.5">
                        <span className="w-24 shrink-0 truncate text-[9.5px] text-slate-500">{s.label}</span>
                        <span className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                          <span
                            className="block h-full rounded-full bg-straive-400"
                            style={{ width: `${Math.round(Math.min(1, Math.max(0, s.score)) * 100)}%` }}
                          />
                        </span>
                        <span className="shrink-0 w-8 text-right text-[9px] font-mono tabular-nums text-slate-600">
                          {s.score.toFixed(2)}
                        </span>
                      </div>
                    ))}
                    <p className="mt-1 text-[10px] text-slate-500 leading-snug">{m.verdict}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Fields written. */}
          <section>
            <h4 className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
              <PenLine className="h-3 w-3" /> Fields written
            </h4>
            {entry.writes.length ? (
              <div className="grid grid-cols-1 gap-1">
                {entry.writes.map((d, i) => (
                  <WriteChip key={`${d.path}-${i}`} delta={d} />
                ))}
              </div>
            ) : (
              // A beat that wrote nothing is a real outcome, not a gap. Saying so
              // is more honest than hiding the beat and implying every click moves
              // the model.
              <p className="text-[10px] text-slate-400 italic">
                Nothing written — this event was already consistent with what the profile held.
              </p>
            )}
          </section>

          {/* Surfaces re-ranked. */}
          {entry.surfaces.length > 0 && (
            <section>
              <h4 className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
                <Layers className="h-3 w-3" /> Surfaces re-ranked
              </h4>
              <div className="space-y-1">
                {entry.surfaces.map((s, i) => (
                  <div key={`${s.surface}-${i}`} className="rounded-md bg-slate-50 border border-slate-200 px-2 py-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[10.5px] font-bold text-slate-800">{s.surface}</span>
                      {s.isFallback && (
                        <span className="text-[8.5px] font-bold uppercase tracking-wide rounded px-1 bg-slate-200 text-slate-600">
                          default
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug">{s.detail}</p>
                    {s.items && s.items.length > 0 && (
                      <p className="text-[9.5px] text-slate-400 truncate mt-0.5">{s.items.join(' · ')}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Rules fired. */}
          {entry.rules.length > 0 && (
            <section>
              <h4 className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
                Rules fired
              </h4>
              <div className="space-y-1">
                {entry.rules.map((r, i) => (
                  <div key={`${r.label}-${i}`} className="flex items-start gap-1.5">
                    {r.passed ? (
                      <Check className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XIcon className="h-3 w-3 text-rose-500 shrink-0 mt-0.5" />
                    )}
                    <span className="min-w-0 text-[10px] leading-snug">
                      <span className="font-bold text-slate-800">{r.label}</span>
                      <span className="text-slate-500"> — {r.detail}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Full feature vector, behind a second disclosure. */}
          <div>
            <button
              onClick={() => setVector((v) => !v)}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1"
            >
              {vector ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {vector ? 'Hide' : 'Show'} full feature vector ({entry.features.length} rows)
            </button>
            {vector && (
              <div className="mt-2">
                <FeatureVector rows={entry.features} />
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
};

/* -------------------------------------------------------------------- tab -- */

export const DecisionsTab: React.FC = () => {
  const { decisions } = useApp();
  const scroller = useRef<HTMLDivElement>(null);

  // Newest first, and pinned to the top on arrival of a new decision. A stream
  // that scrolls away from the thing that just happened is a stream nobody reads.
  const ordered = useMemo(() => [...decisions].reverse(), [decisions]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [decisions.length]);

  if (!ordered.length) {
    return (
      <div className="h-full grid place-items-center px-6 text-center">
        <div>
          <p className="text-[12px] font-bold text-slate-700">No decisions yet this session.</p>
          <p className="mt-1 text-[10.5px] text-slate-500 leading-snug">
            The Profile tab is not empty because it arrived seeded — prior sessions, orders and CRM
            were folded before you got here. Those were not decided in front of you, so they are not
            listed here.
          </p>
          <p className="mt-1.5 text-[10.5px] text-slate-500 leading-snug">
            Click anything in the storefront. Every event from here lands as an entry, with the
            models that ran, the fields it wrote and the surfaces it moved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scroller} className="h-full overflow-y-auto px-3 py-3 space-y-2">
      {ordered.map((entry, i) => (
        <DecisionCard key={entry.id} entry={entry} defaultOpen={i === 0} />
      ))}
      <p className="text-[9.5px] text-slate-400 leading-snug px-0.5 pb-1">
        Every entry reads mechanism, then consequence, then number. Posteriors appear as causes
        inside the mechanism line and never as the conclusion — a probability is the least useful
        true thing a model can hand a merchandiser.
      </p>
    </div>
  );
};
