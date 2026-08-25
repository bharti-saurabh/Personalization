/**
 * The session story.
 *
 * One card per thing the shopper did, newest first, each one answering the
 * questions a sceptic asks in the order they ask them: what happened, what ran,
 * what it scored, which rule fired, what got rendered, and why.
 *
 * Two deliberate choices about honesty:
 *
 *  - The "why" line is always visible, even collapsed. It is the only part of
 *    this panel a non-technical viewer will read, so it cannot be the part that
 *    is hidden behind a chevron.
 *
 *  - A beat that moved nothing says "no movement" in plain type rather than
 *    being dropped from the feed. The demo is more persuasive, not less, when
 *    it shows the model declining to react to a signal that carried no
 *    information.
 */

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { JournalBeat, ModelRun, ScoreRow } from '../../ml/journal';
import { CONFIDENCE_THRESHOLD } from '../../ml/intent';
import {
  MousePointerClick,
  Cpu,
  ShieldCheck,
  ShieldAlert,
  LayoutTemplate,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Settings2,
  PlayCircle,
  Gauge,
  Target,
} from 'lucide-react';

const pct = (v: number) => Math.round(v * 100);
const signed = (d: number) => `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}pp`;
/** A sub-0.1ms call is real but rounds to "0ms", which reads as "nothing ran". */
const fmtMs = (ms: number) => (ms < 0.1 ? '<0.1ms' : `${ms.toFixed(ms < 10 ? 1 : 0)}ms`);

const ENGINE_STYLE: Record<ModelRun['engine'], string> = {
  Intent: 'bg-red-50 text-red-700 border-red-200',
  Similarity: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Complement: 'bg-amber-50 text-amber-800 border-amber-200',
};

const KIND_ICON: Record<JournalBeat['kind'], React.ReactNode> = {
  session: <PlayCircle className="h-3.5 w-3.5" />,
  action: <MousePointerClick className="h-3.5 w-3.5" />,
  setting: <Settings2 className="h-3.5 w-3.5" />,
};

/** One scored candidate: bar, value, movement against the previous beat. */
const ScoreBar: React.FC<{ row: ScoreRow; rank: number; tone: string }> = ({ row, rank, tone }) => (
  <div className="space-y-0.5">
    <div className="flex items-baseline justify-between gap-2">
      <span
        className={`text-[11px] truncate ${rank === 0 ? 'font-bold text-slate-900' : 'text-slate-600'}`}
        title={row.label}
      >
        {row.label}
      </span>
      <span className="flex items-baseline gap-1 shrink-0 font-mono text-[10px]">
        <span className={rank === 0 ? 'font-bold text-slate-900' : 'text-slate-500'}>{pct(row.score)}%</span>
        {row.delta !== undefined && Math.abs(row.delta) >= 0.005 && (
          <span className={row.delta > 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
            {signed(row.delta)}
          </span>
        )}
      </span>
    </div>
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
      <div
        className={`h-full rounded-full transition-all duration-500 ${rank === 0 ? tone : 'bg-slate-400'}`}
        style={{ width: `${Math.max(2, pct(row.score))}%` }}
      />
    </div>
    {row.hint && (
      <div className="text-[9px] font-mono text-slate-400 leading-snug line-clamp-2" title={row.hint}>
        {row.hint}
      </div>
    )}
  </div>
);

const RunCard: React.FC<{ run: ModelRun }> = ({ run }) => {
  const tone =
    run.engine === 'Intent' ? 'bg-red-600' : run.engine === 'Similarity' ? 'bg-indigo-600' : 'bg-amber-500';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-bold text-slate-800 leading-snug">{run.question}</div>
        <span
          className={`shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${ENGINE_STYLE[run.engine]}`}
        >
          {run.engine}
        </span>
      </div>

      {run.inputs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {run.inputs.map((inp) => (
            <span
              key={inp.label}
              className="text-[9px] font-mono bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600"
            >
              <span className="text-slate-400">{inp.label}:</span> <b className="text-slate-700">{inp.value}</b>
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <div className="text-[9px] uppercase tracking-widest font-bold text-slate-400">{run.scoreLabel}</div>
        {run.scores.map((row, idx) => (
          <ScoreBar key={row.label} row={row} rank={idx} tone={tone} />
        ))}
      </div>

      <div className="flex items-start gap-1.5 text-[10px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
        <Target className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
        <span className="leading-snug">{run.verdict}</span>
      </div>

      {run.latencyMs !== undefined && (
        <div className="text-[9px] font-mono text-slate-400 text-right">{fmtMs(run.latencyMs)}</div>
      )}
    </div>
  );
};

const BeatCard: React.FC<{ beat: JournalBeat; defaultOpen: boolean }> = ({ beat, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);

  const moved = beat.shift ? beat.shift.to - beat.shift.from : 0;
  const movedEnough = Math.abs(moved) >= 0.005;

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        beat.gate.passed ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50/40'
      }`}
    >
      {/* Header: what the shopper did */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-slate-50 transition-colors"
      >
        <span
          className={`shrink-0 mt-0.5 p-1 rounded ${
            beat.kind === 'setting'
              ? 'bg-slate-200 text-slate-700'
              : beat.gate.passed
                ? 'bg-red-600 text-white'
                : 'bg-amber-500 text-white'
          }`}
        >
          {KIND_ICON[beat.kind]}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-900 leading-snug">{beat.headline}</span>
            <span className="text-[9px] font-mono text-slate-400 shrink-0">#{beat.seq}</span>
          </span>

          <span className="flex flex-wrap items-center gap-1 mt-1">
            <span className="text-[9px] font-mono uppercase bg-slate-100 border border-slate-200 text-slate-500 rounded px-1 py-0.5">
              {beat.page}
            </span>
            {beat.signalWeight !== undefined && (
              <span className="text-[9px] font-mono bg-slate-100 border border-slate-200 text-slate-500 rounded px-1 py-0.5">
                weight {beat.signalWeight.toFixed(2)}
              </span>
            )}
            {beat.shift &&
              (movedEnough ? (
                <span
                  className={`text-[9px] font-mono font-bold rounded px-1 py-0.5 border ${
                    moved > 0
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {beat.shift.label} {pct(beat.shift.from)}% → {pct(beat.shift.to)}%
                </span>
              ) : (
                <span className="text-[9px] font-mono bg-slate-100 border border-slate-200 text-slate-400 rounded px-1 py-0.5">
                  no movement
                </span>
              ))}
            <span
              className={`text-[9px] font-mono font-bold rounded px-1 py-0.5 border flex items-center gap-1 ${
                beat.gate.passed
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border-amber-300'
              }`}
            >
              {beat.gate.passed ? <ShieldCheck className="h-2.5 w-2.5" /> : <ShieldAlert className="h-2.5 w-2.5" />}
              {beat.gate.passed ? 'activated' : 'fallback'}
            </span>
          </span>
        </span>

        <span className="shrink-0 mt-0.5 text-slate-400">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>

      {/* The payoff line. Always visible - see the module comment. */}
      <div className="px-3 pb-2">
        <p className={`text-[10.5px] leading-relaxed text-slate-600 ${open ? '' : 'line-clamp-3'}`}>{beat.why}</p>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-slate-100 pt-2.5">
          {/* 2. What ran and what it scored */}
          <div className="space-y-2">
            <SectionLabel
              icon={<Cpu className="h-3 w-3" />}
              text={beat.runs.length === 1 ? '1 model ran' : `${beat.runs.length} models ran`}
            />
            {beat.runs.map((run, i) => (
              <RunCard key={`${run.engine}-${i}`} run={run} />
            ))}
          </div>

          {/* 3. Which rule decided */}
          <div className="space-y-1">
            <SectionLabel
              icon={beat.gate.passed ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
              text="Decision rule"
            />
            <div
              className={`rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed ${
                beat.gate.passed
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}
            >
              <div className="font-bold mb-0.5">{beat.gate.label}</div>
              {beat.gate.detail}
            </div>
          </div>

          {/* 4. What the shopper actually saw as a result */}
          <div className="space-y-1">
            <SectionLabel icon={<LayoutTemplate className="h-3 w-3" />} text="Presented on screen" />
            {beat.presented.map((s) => (
              <div
                key={s.surface}
                className={`rounded-lg border px-2.5 py-1.5 ${
                  s.isFallback ? 'bg-slate-50 border-slate-300' : 'bg-white border-slate-200'
                }`}
              >
                <div className="text-[10px] font-bold text-slate-800 flex items-center gap-1.5">
                  {s.surface}
                  {s.isFallback && (
                    <span className="text-[8px] font-mono uppercase bg-slate-200 text-slate-600 rounded px-1">
                      default
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-600 leading-snug mt-0.5">{s.detail}</div>
                {s.items && s.items.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {s.items.map((it) => (
                      <li key={it} className="text-[9.5px] font-mono text-slate-500 truncate" title={it}>
                        • {it}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const SectionLabel: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
    {icon}
    {text}
  </div>
);

export const JourneyNarrative: React.FC = () => {
  const { journal, intentPrediction, activeDecisionTrace, isPersonalizationOn } = useApp();

  const top = intentPrediction.teams[0];
  const topDept = intentPrediction.departments[0];
  const passed = !activeDecisionTrace.fallbackTriggered;

  // Oldest first for the timeline: a session reads left to right even though the
  // feed below it reads newest first.
  const timeline = [...journal].reverse();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Standing read on this shopper, independent of any one beat. */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Current read</div>
          <span
            className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${
              !isPersonalizationOn
                ? 'bg-slate-100 text-slate-500 border-slate-300'
                : passed
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border-amber-300'
            }`}
          >
            {!isPersonalizationOn ? 'PERSONALIZATION OFF' : passed ? 'ACTIVATED' : 'FALLBACK'}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-black text-slate-900 leading-none truncate">{top.team}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              shopping <b className="text-slate-700">{topDept.department}</b> · {pct(top.probability)}% predicted
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Confidence</div>
            <div
              className={`text-base font-black font-mono leading-none ${passed ? 'text-emerald-600' : 'text-amber-600'}`}
            >
              {pct(intentPrediction.confidence)}%
            </div>
          </div>
        </div>

        {/* Confidence against the activation gate, drawn to scale. */}
        <div className="relative h-2 w-full bg-slate-100 rounded-full border border-slate-200 overflow-hidden">
          <div
            className={`h-full rounded-full ${passed ? 'bg-emerald-500' : 'bg-amber-500'} transition-all duration-500`}
            style={{ width: `${Math.max(2, pct(intentPrediction.confidence))}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-px bg-slate-900"
            style={{ left: `${pct(CONFIDENCE_THRESHOLD)}%` }}
            title={`Activation gate at ${pct(CONFIDENCE_THRESHOLD)}%`}
          />
        </div>
        <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono">
          <Gauge className="h-2.5 w-2.5" />
          activation gate {pct(CONFIDENCE_THRESHOLD)}% · now serving {activeDecisionTrace.targetComponent}
        </div>

        {/* Session shape: one bar per beat, height = confidence at that point. */}
        {timeline.length > 1 && (
          <div className="pt-1">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
              Confidence across the session
            </div>
            <div className="relative flex items-end gap-px h-12 bg-slate-50 border border-slate-200 rounded px-1 pb-px">
              <div
                className="absolute left-0 right-0 border-t border-dashed border-slate-400/70 z-10"
                style={{ bottom: `${pct(CONFIDENCE_THRESHOLD)}%` }}
                title={`Activation gate ${pct(CONFIDENCE_THRESHOLD)}%`}
              />
              {timeline.map((b) => (
                <div
                  key={b.id}
                  className="flex-1 min-w-[3px] h-full flex items-end"
                  title={`#${b.seq} ${b.headline} - ${pct(b.confidence.to)}% confidence`}
                >
                  <div
                    className={`w-full rounded-t-sm transition-all ${b.gate.passed ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ height: `${Math.max(6, pct(b.confidence.to))}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-0.5">
              <span>session start</span>
              <span>dashed line = {pct(CONFIDENCE_THRESHOLD)}% gate</span>
              <span>now</span>
            </div>
          </div>
        )}
      </div>

      {/* The feed */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {journal.length === 0 ? (
          <div className="text-[11px] text-slate-500 text-center py-8 font-mono">Waiting for the first signal...</div>
        ) : (
          journal.map((beat, idx) => <BeatCard key={beat.id} beat={beat} defaultOpen={idx === 0} />)
        )}

        <div className="pt-2 pb-4 flex items-start gap-1.5 text-[9px] text-slate-400 leading-relaxed">
          <Sparkles className="h-3 w-3 shrink-0 mt-0.5" />
          <span>
            Every probability, delta and rule outcome above is read back from the engine call made for that
            action. The catalog and shopper population underneath are simulated, so treat the numbers as a
            demonstration of the mechanism rather than production accuracy.
          </span>
        </div>
      </div>
    </div>
  );
};
