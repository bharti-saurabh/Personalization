/**
 * The session story.
 *
 * One card per thing the shopper did, newest first, each one answering the
 * questions a sceptic asks in the order they ask them: what happened, what ran,
 * what it scored, which rule fired, what got rendered, and why.
 *
 * Three deliberate choices about honesty:
 *
 *  - The "why" line is always visible, even collapsed. It is the only part of
 *    this panel a non-technical viewer will read, so it cannot be the part that
 *    is hidden behind a chevron.
 *
 *  - A beat that moved nothing says "no movement" in plain type rather than
 *    being dropped from the feed. The demo is more persuasive, not less, when
 *    it shows the model declining to react to a signal that carried no
 *    information.
 *
 *  - The arithmetic is still here, but it is folded away. Printing
 *    "logit 2.21 = prior -0.08 + evidence 2.30" under all four candidates of
 *    all three engines meant an exec saw a wall of symbols and read none of it,
 *    while an engineer had to hunt for the one line that mattered. It now sits
 *    behind a per-run toggle, which serves both: nothing is hidden, and nothing
 *    is shouted.
 */

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { JournalBeat, ModelRun, ScoreRow } from '../../ml/journal';
import { CONFIDENCE_THRESHOLD } from '../../ml/intent';
import { TEAM_BY_ID } from '../../sim/taxonomy';
import { TeamCrest } from '../brand/Identity';
import {
  MousePointerClick,
  ShieldCheck,
  ShieldAlert,
  LayoutTemplate,
  ChevronDown,
  ChevronRight,
  Settings2,
  PlayCircle,
  Target,
  Crosshair,
  Radar,
  Blocks,
  Sigma,
} from 'lucide-react';

const pct = (v: number) => Math.round(v * 100);
const signed = (d: number) => `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}pp`;
/** A sub-0.1ms call is real but rounds to "0ms", which reads as "nothing ran". */
const fmtMs = (ms: number) => (ms < 0.1 ? '<0.1ms' : `${ms.toFixed(ms < 10 ? 1 : 0)}ms`);

/**
 * One identity per engine, used everywhere the engine is named. Three engines
 * that all rendered as grey text were impossible to tell apart at a glance in a
 * feed where several of them run per beat.
 */
const ENGINE: Record<ModelRun['engine'], { icon: React.ReactNode; chip: string; bar: string; dot: string }> = {
  Intent: {
    icon: <Crosshair className="h-3.5 w-3.5" />,
    chip: 'bg-red-50 text-red-700 border-red-200',
    bar: 'bg-red-500',
    dot: 'bg-red-500',
  },
  Similarity: {
    icon: <Radar className="h-3.5 w-3.5" />,
    chip: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    bar: 'bg-indigo-500',
    dot: 'bg-indigo-500',
  },
  Complement: {
    icon: <Blocks className="h-3.5 w-3.5" />,
    chip: 'bg-amber-50 text-amber-800 border-amber-200',
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
  },
};

const KIND_ICON: Record<JournalBeat['kind'], React.ReactNode> = {
  session: <PlayCircle className="h-3.5 w-3.5" />,
  action: <MousePointerClick className="h-3.5 w-3.5" />,
  setting: <Settings2 className="h-3.5 w-3.5" />,
};

/** One scored candidate: bar, value, movement against the previous beat. */
const ScoreBar: React.FC<{ row: ScoreRow; rank: number; tone: string; showMath: boolean }> = ({
  row,
  rank,
  tone,
  showMath,
}) => (
  <div className="space-y-1">
    <div className="flex items-baseline justify-between gap-2">
      <span
        className={`text-[11.5px] truncate ${rank === 0 ? 'font-bold text-slate-900' : 'text-slate-600'}`}
        title={row.label}
      >
        {row.label}
      </span>
      <span className="flex items-baseline gap-1.5 shrink-0">
        <span className={`tabular-nums text-[11.5px] ${rank === 0 ? 'font-extrabold text-slate-900' : 'text-slate-500'}`}>
          {pct(row.score)}%
        </span>
        {row.delta !== undefined && Math.abs(row.delta) >= 0.005 && (
          <span
            className={`text-[10px] font-bold tabular-nums ${row.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}
          >
            {signed(row.delta)}
          </span>
        )}
      </span>
    </div>
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${rank === 0 ? tone : 'bg-slate-300'}`}
        style={{ width: `${Math.max(2, pct(row.score))}%` }}
      />
    </div>
    {showMath && row.hint && (
      <div className="text-[9.5px] font-mono text-slate-400 leading-snug">{row.hint}</div>
    )}
  </div>
);

const RunCard: React.FC<{ run: ModelRun }> = ({ run }) => {
  const [showMath, setShowMath] = useState(false);
  const [showAllInputs, setShowAllInputs] = useState(false);
  const e = ENGINE[run.engine];

  const hasMath = run.scores.some((s) => s.hint);
  const INPUT_CAP = 3;
  const inputs = showAllInputs ? run.inputs : run.inputs.slice(0, INPUT_CAP);
  const hiddenInputs = run.inputs.length - inputs.length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 pt-2.5 pb-2 flex items-start gap-2">
        <span className={`shrink-0 grid place-items-center h-6 w-6 rounded-lg border ${e.chip}`}>{e.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold text-slate-800 leading-snug">{run.question}</div>
          <div className="text-[9.5px] font-semibold uppercase tracking-widest text-slate-400 mt-0.5">
            {run.engine} engine
            {run.latencyMs !== undefined && <span className="normal-case tracking-normal"> · {fmtMs(run.latencyMs)}</span>}
          </div>
        </div>
        {hasMath && (
          <button
            onClick={() => setShowMath((v) => !v)}
            title={showMath ? 'Hide the arithmetic' : 'Show the arithmetic behind each score'}
            className={`shrink-0 grid place-items-center h-6 w-6 rounded-lg border transition-colors ${
              showMath
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-400 border-slate-200 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Sigma className="h-3 w-3" />
          </button>
        )}
      </div>

      {run.inputs.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {inputs.map((inp) => (
            <span
              key={inp.label}
              className="text-[9.5px] bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5 text-slate-500"
            >
              {inp.label} <b className="text-slate-700 font-mono">{inp.value}</b>
            </span>
          ))}
          {hiddenInputs > 0 && (
            <button
              onClick={() => setShowAllInputs(true)}
              className="text-[9.5px] rounded-md px-1.5 py-0.5 text-slate-400 hover:text-slate-700 font-semibold"
            >
              +{hiddenInputs} more input{hiddenInputs === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}

      <div className="px-3 pb-2.5 space-y-2">
        <div className="text-[9px] uppercase tracking-widest font-bold text-slate-400">{run.scoreLabel}</div>
        {run.scores.map((row, idx) => (
          <ScoreBar key={row.label} row={row} rank={idx} tone={e.bar} showMath={showMath} />
        ))}
      </div>

      <div className="flex items-start gap-1.5 text-[11px] text-slate-700 bg-slate-50 border-t border-slate-100 px-3 py-2">
        <Target className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
        <span className="leading-snug">{run.verdict}</span>
      </div>
    </div>
  );
};

const BeatCard: React.FC<{ beat: JournalBeat; defaultOpen: boolean }> = ({ beat, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);

  const moved = beat.shift ? beat.shift.to - beat.shift.from : 0;
  const movedEnough = Math.abs(moved) >= 0.005;

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-shadow ${
        beat.gate.passed ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50/50'
      } ${open ? 'shadow-sm' : ''}`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 pt-2.5 pb-2 flex items-start gap-2.5 hover:bg-slate-50/70 transition-colors"
      >
        <span
          className={`shrink-0 grid place-items-center h-6 w-6 rounded-lg ${
            beat.kind === 'setting'
              ? 'bg-slate-200 text-slate-700'
              : beat.gate.passed
                ? 'bg-slate-900 text-white'
                : 'bg-amber-500 text-white'
          }`}
        >
          {KIND_ICON[beat.kind]}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-bold text-slate-900 leading-snug">{beat.headline}</span>
            <span className="text-[9px] font-mono text-slate-300 shrink-0">#{beat.seq}</span>
          </span>

          {/* Two chips at most in the collapsed state: what moved, and whether
              the result was allowed on screen. Everything else - page, decayed
              weight - is inside, where there is room to explain it. */}
          <span className="flex flex-wrap items-center gap-1 mt-1.5">
            {beat.shift &&
              (movedEnough ? (
                <span
                  className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 tabular-nums ${
                    moved > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {beat.shift.label} {pct(beat.shift.from)}% → {pct(beat.shift.to)}%
                </span>
              ) : (
                <span className="text-[10px] rounded-md px-1.5 py-0.5 bg-slate-100 text-slate-400 font-semibold">
                  no movement
                </span>
              ))}
            <span
              className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 flex items-center gap-1 ${
                beat.gate.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {beat.gate.passed ? <ShieldCheck className="h-2.5 w-2.5" /> : <ShieldAlert className="h-2.5 w-2.5" />}
              {beat.gate.passed ? 'activated' : 'fallback'}
            </span>
          </span>
        </span>

        <span className="shrink-0 mt-0.5 text-slate-300">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {/* The payoff line. Always visible - see the module comment. */}
      <div className="px-3 pb-2.5">
        <p className={`text-[11.5px] leading-relaxed text-slate-600 ${open ? '' : 'line-clamp-3'}`}>{beat.why}</p>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3 bg-slate-50/50">
          <div className="flex items-center gap-1.5 text-[9.5px] text-slate-400 font-medium">
            <span className="uppercase tracking-widest font-bold">{beat.page}</span>
            {beat.signalWeight !== undefined && (
              <>
                <span className="text-slate-300">·</span>
                <span>
                  recency weight <b className="font-mono text-slate-600">{beat.signalWeight.toFixed(2)}</b>
                </span>
              </>
            )}
          </div>

          {/* 2. What ran and what it scored */}
          <div className="space-y-2">
            <SectionLabel text={beat.runs.length === 1 ? '1 model ran' : `${beat.runs.length} models ran`}>
              <span className="flex items-center gap-1">
                {beat.runs.map((r, i) => (
                  <span key={i} className={`h-1.5 w-1.5 rounded-full ${ENGINE[r.engine].dot}`} />
                ))}
              </span>
            </SectionLabel>
            {beat.runs.map((run, i) => (
              <RunCard key={`${run.engine}-${i}`} run={run} />
            ))}
          </div>

          {/* 3. Which rule decided */}
          <div className="space-y-1.5">
            <SectionLabel text="Decision rule" />
            <div
              className={`rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
                beat.gate.passed
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}
            >
              <div className="font-bold mb-0.5 flex items-center gap-1.5">
                {beat.gate.passed ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                {beat.gate.label}
              </div>
              {beat.gate.detail}
            </div>
          </div>

          {/* 4. What the shopper actually saw as a result */}
          <div className="space-y-1.5">
            <SectionLabel text="Presented on screen" />
            {beat.presented.map((s) => (
              <div
                key={s.surface}
                className={`rounded-xl border px-3 py-2 ${
                  s.isFallback ? 'bg-white border-slate-200' : 'bg-white border-slate-200'
                }`}
              >
                <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                  <LayoutTemplate className="h-3 w-3 text-slate-400 shrink-0" />
                  {s.surface}
                  {s.isFallback && (
                    <span className="text-[8.5px] font-bold uppercase bg-slate-100 text-slate-500 rounded px-1 py-px">
                      default
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-600 leading-snug mt-1">{s.detail}</div>
                {s.items && s.items.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {s.items.map((it) => (
                      <li key={it} className="text-[10px] text-slate-500 truncate flex items-center gap-1.5" title={it}>
                        <span className="h-1 w-1 rounded-full bg-slate-300 shrink-0" />
                        {it}
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

const SectionLabel: React.FC<{ text: string; children?: React.ReactNode }> = ({ text, children }) => (
  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
    {text}
    {children}
  </div>
);

export const JourneyNarrative: React.FC = () => {
  const { journal, intentPrediction, activeDecisionTrace, isPersonalizationOn } = useApp();

  const top = intentPrediction.teams[0];
  const topDept = intentPrediction.departments[0];
  const passed = !activeDecisionTrace.fallbackTriggered;
  const cfg = TEAM_BY_ID[top.team];

  // Oldest first for the timeline: a session reads left to right even though the
  // feed below it reads newest first.
  const timeline = [...journal].reverse();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-100">
      {/* Standing read on this shopper, independent of any one beat. */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-3.5 py-3 space-y-2.5">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center h-11 w-11 rounded-2xl bg-slate-50 border border-slate-100 shrink-0">
            <TeamCrest team={top.team} size="sm" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Reading this shopper as</div>
            <div className="font-display text-xl font-extrabold text-slate-900 leading-tight truncate">{top.team}</div>
            <div className="text-[11px] text-slate-500 truncate">
              {cfg?.city} · shopping <b className="text-slate-700">{topDept.department}</b>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`font-display text-2xl font-extrabold leading-none tabular-nums ${passed ? 'text-emerald-600' : 'text-amber-600'}`}>
              {pct(intentPrediction.confidence)}%
            </div>
            <div className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mt-0.5">confidence</div>
          </div>
        </div>

        {/* Confidence against the activation gate, drawn to scale. */}
        <div>
          <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${passed ? 'bg-emerald-500' : 'bg-amber-500'} transition-all duration-500`}
              style={{ width: `${Math.max(2, pct(intentPrediction.confidence))}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-slate-900"
              style={{ left: `${pct(CONFIDENCE_THRESHOLD)}%` }}
              title={`Activation gate at ${pct(CONFIDENCE_THRESHOLD)}%`}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 gap-2">
            <span className="text-[10px] text-slate-400 truncate">
              gate {pct(CONFIDENCE_THRESHOLD)}% · serving {activeDecisionTrace.targetComponent}
            </span>
            <span
              className={`shrink-0 text-[9.5px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${
                !isPersonalizationOn
                  ? 'bg-slate-100 text-slate-500'
                  : passed
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-100 text-amber-800'
              }`}
            >
              {!isPersonalizationOn ? 'off' : passed ? 'activated' : 'fallback'}
            </span>
          </div>
        </div>

        {/* Session shape: one bar per beat, height = confidence at that point. */}
        {timeline.length > 1 && (
          <div>
            <div className="flex items-baseline justify-between text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1">
              <span>Confidence across the session</span>
              <span className="normal-case tracking-normal font-medium text-slate-300">
                dashes = {pct(CONFIDENCE_THRESHOLD)}% gate
              </span>
            </div>
            <div className="relative flex items-end gap-px h-11 bg-slate-50 border border-slate-100 rounded-lg px-1 pb-px">
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
                    className={`w-full rounded-t transition-all ${b.gate.passed ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ height: `${Math.max(6, pct(b.confidence.to))}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* The feed */}
      <div className="flex-1 overflow-y-auto scrollbar-slim p-2.5 space-y-2">
        {journal.length === 0 ? (
          <div className="text-[11px] text-slate-400 text-center py-10">Waiting for the first signal…</div>
        ) : (
          journal.map((beat, idx) => <BeatCard key={beat.id} beat={beat} defaultOpen={idx === 0} />)
        )}

        <p className="pt-2 pb-4 px-1 text-[10px] text-slate-400 leading-relaxed">
          Every probability, delta and rule outcome above is read back from the engine call made for that action.
          The catalog and shopper population underneath are simulated, so treat the numbers as a demonstration of
          the mechanism rather than production accuracy.
        </p>
      </div>
    </div>
  );
};
