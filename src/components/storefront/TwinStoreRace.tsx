/**
 * THE TWIN STORE RACE - the screen that makes the argument.
 *
 * Two storefronts, same shopper, same seed, same intent. The left grid is
 * ordered by the intent engine; the right by sales rank, which is what this
 * storefront genuinely does when personalization is switched off. A Step
 * control advances both by one shopper action, and the counters above each pane
 * move as it goes.
 *
 * IT MEASURES EFFORT, NOT MONEY. There is no currency figure on this screen, no
 * ROI and no revenue lift. The previous occupant of this slot had an
 * illustrative funnel ending in "$88 -> $104" and it was deleted rather than
 * moved, for the reason already recorded in WHAT-WE-BUILT: a made-up revenue
 * figure next to a screen of real arithmetic devalues the arithmetic. Steps,
 * items seen, dead ends and whether the shopper got there are all things the
 * simulator actually produced and a reader can actually check.
 *
 * WHY THERE IS A BRIEF BEFORE THE RACE. The screen used to open on two grids
 * and a Play button, and a viewer who had not built it could not say what was
 * being compared, what was held fixed, or what would count as a win. Those are
 * three separate questions and they now have three answer cards at the top,
 * stated before anything moves. An experiment that has to be explained after
 * the fact by the person driving the demo is not a result, it is a slideshow.
 *
 * WHY THE TARGET IS STATED BEFORE THE RACE STARTS. A grid filling up is
 * illegible unless you already know what you are looking for - the eye has
 * nothing to score against. Naming the target in plain words at the top turns
 * every tile into a hit or a miss, and it is the difference between a demo that
 * shows an animation and one that shows a result.
 *
 * WHY THE SLOT TRACK EXISTS. Two 8-column grids side by side show what each
 * shopper did, but not the thing actually under test, which is WHERE THE TARGET
 * SITS IN EACH ORDERING. The track collapses each arm to a single line of
 * slots with a flag on the target's position, so the difference between the two
 * stores - slot 4 against slot 37 - is one glance rather than an inference from
 * two grids. It is the same trace data as the grid below it, drawn along one
 * axis instead of two.
 *
 * WHY THE RACE IS NOT RIGGED. The five shoppers on the strip were selected to
 * span the outcomes, and two of them are races personalization LOSES - one it
 * loses outright, one where it never finds the target at all. They are labelled
 * as upsets, and the label is computed from the traces on screen rather than
 * written by hand - the whole field is raced on mount so that every chip in the
 * cast strip reports its own result before you click it. A race the
 * personalized side always wins is a race nobody believes, and the population
 * rate is on the record: `npm run sim:effort` reports the control arm reaching
 * the target first in about 5% of races.
 *
 * All the arithmetic lives in src/ml/counterfactual.ts. This file is a viewer.
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { getDataset } from '../../sim/dataset';
import { raceShopper, type ArmTrace, type RacePair } from '../../ml/counterfactual';
import { TEAM_BY_ID } from '../../sim/taxonomy';
import {
  Play,
  Pause,
  SkipForward,
  ChevronsRight,
  RotateCcw,
  Target as TargetIcon,
  Sparkles,
  BarChart3,
  AlertTriangle,
  Trophy,
  Eye,
  EyeOff,
  MousePointerClick,
  Users,
  Dices,
  Footprints,
  Flag,
} from 'lucide-react';

/**
 * Five shoppers drawn from the simulated population, chosen to span the
 * outcomes rather than to flatter the model.
 *
 * The ids are real and the races are recomputed live from the dataset - nothing
 * here is a recording. Selection is editorial and is disclosed on screen; the
 * unselected population is what `npm run sim:effort` reports over.
 */
const CAST: { id: string; note: string }[] = [
  { id: 'cust-3859', note: 'Confident and correct - the case personalization is built for' },
  { id: 'cust-1474', note: 'UPSET - confident and wrong; the popularity grid wins outright' },
  { id: 'cust-82', note: 'UPSET - the personalized grid never surfaces the target at all' },
  { id: 'cust-2260', note: 'Held back by the confidence gate, and the ranking was right anyway' },
  { id: 'cust-10', note: 'Held back by the gate; only the personalized grid ever finds it' },
];

const ARM_LABEL = {
  personalized: 'Personalized',
  popularity: 'Popularity ranked',
} as const;

/* --------------------------------------------------------------- brief -- */

/**
 * What this screen is, said before it moves.
 *
 * Three cards, because a controlled comparison is three facts: what varies,
 * what is held fixed, and what counts as winning. Leave any one of them out and
 * the viewer supplies their own, which is usually revenue.
 */
const BRIEF: { icon: React.ReactNode; head: string; body: string }[] = [
  {
    icon: <Users className="h-3.5 w-3.5" />,
    head: 'One shopper, two stores',
    body:
      'The same simulated shopper walks the same 798-product catalog twice. On the left the grid is ordered by the intent engine, on the right by sales rank, which is what this storefront does when personalization is off. The ordering is the only thing that differs.',
  },
  {
    icon: <Dices className="h-3.5 w-3.5" />,
    head: 'Everything else is pinned',
    body:
      'Same shopper, same patience, same held-out target, and the same pre-drawn random numbers on both sides. Luck is identical, so a difference in the result cannot be luck. Neither store is ever shown the target.',
  },
  {
    icon: <Footprints className="h-3.5 w-3.5" />,
    head: 'Scored in effort, not money',
    body:
      'Steps taken, items seen before the first relevant one, dead ends, and whether the shopper found it at all. There is no revenue number anywhere on this screen, deliberately. It is a simulated world and every count here comes out of it.',
  },
];

const Brief: React.FC = () => (
  <div className="bg-white border-b border-slate-200 px-4 py-3">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
      {BRIEF.map((b) => (
        <div key={b.head} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-straive-600">
            {b.icon}
            <span className="text-[10px] font-extrabold uppercase tracking-[0.1em]">{b.head}</span>
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-slate-600">{b.body}</p>
        </div>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------- counters -- */

interface Counters {
  steps: number;
  seenBeforeFirstRelevant: number | null;
  seenSoFar: number;
  deadEnds: number;
  scrollDepth: number;
  reachedAt: number | null;
  abandonedAt: number | null;
}

/**
 * Replays a trace up to `step` and reports what the counters read at that
 * moment.
 *
 * Derived from the trace rather than accumulated in state, so scrubbing
 * backwards gives exactly the same numbers as stepping forwards. A counter that
 * only counts up cannot be stepped back through, and a Step control the user
 * cannot reverse is a control they will not trust.
 */
function countersAt(trace: ArmTrace, step: number): Counters {
  const taken = trace.steps.slice(0, step);
  let seen = 0;
  let deadEnds = 0;
  let run = 0;
  let counted = false;
  let seenBeforeFirstRelevant: number | null = null;
  let reachedAt: number | null = null;
  let abandonedAt: number | null = null;

  taken.forEach((s, i) => {
    if (s.examined) {
      seen++;
      if (s.relevant && seenBeforeFirstRelevant === null) seenBeforeFirstRelevant = seen - 1;
      if (s.clicked) {
        run = 0;
        counted = false;
        if (s.target && reachedAt === null) reachedAt = i + 1;
      } else {
        run++;
        if (run >= 3 && !counted) {
          deadEnds++;
          counted = true;
        }
      }
    }
    if (s.abandonedHere && abandonedAt === null) abandonedAt = i + 1;
  });

  return {
    steps: taken.length,
    seenBeforeFirstRelevant,
    seenSoFar: seen,
    deadEnds,
    scrollDepth: taken.length,
    reachedAt,
    abandonedAt,
  };
}

/** Slot the target occupies in this arm's ordering, or null when it is absent. */
function targetSlot(trace: ArmTrace): number | null {
  const i = trace.steps.findIndex((s) => s.target);
  return i === -1 ? null : i + 1;
}

const Counter: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'good' | 'bad';
  icon?: React.ReactNode;
}> = ({ label, value, tone = 'default', icon }) => (
  <div
    className={`rounded-lg border px-2 py-1.5 ${
      tone === 'good'
        ? 'border-emerald-200 bg-emerald-50'
        : tone === 'bad'
          ? 'border-amber-200 bg-amber-50'
          : 'border-slate-200 bg-white'
    }`}
  >
    <div className="flex items-center gap-1 text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-slate-400">
      {icon}
      <span className="truncate">{label}</span>
    </div>
    <div
      className={`mt-0.5 text-[15px] font-display font-extrabold tabular-nums leading-none ${
        tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-amber-700' : 'text-slate-900'
      }`}
    >
      {value}
    </div>
  </div>
);

/* ---------------------------------------------------------------- track -- */

/**
 * One arm's whole walk on a single axis.
 *
 * Each cell is one slot of grid in the order that store presented it, coloured
 * by what the shopper did with it, with a flag on the slot the target occupies.
 * The two tracks stacked share an x-axis, so "the personalized store put it at
 * slot 4 and the popularity grid at slot 37" is a thing you see rather than a
 * thing you are told.
 */
const Track: React.FC<{ trace: ArmTrace; step: number }> = ({ trace, step }) => {
  const c = countersAt(trace, step);
  const slot = targetSlot(trace);
  const len = trace.steps.length;
  const personalized = trace.arm === 'personalized';

  const result =
    c.reachedAt !== null
      ? { text: `found at slot ${c.reachedAt}`, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
      : c.abandonedAt !== null
        ? { text: `left at slot ${c.abandonedAt}`, tone: 'text-amber-700 bg-amber-50 border-amber-200' }
        : { text: 'still walking', tone: 'text-slate-500 bg-slate-50 border-slate-200' };

  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[104px] shrink-0 flex items-center gap-1.5">
        {personalized ? (
          <Sparkles className="h-3 w-3 text-straive-500" />
        ) : (
          <BarChart3 className="h-3 w-3 text-slate-500" />
        )}
        <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-600 truncate">
          {ARM_LABEL[trace.arm]}
        </span>
      </div>

      <div className="relative flex-1 min-w-0 pt-3">
        {/* Where the target sits in this ordering. The point of the whole track. */}
        {slot !== null && len > 0 && (
          <div
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
            style={{ left: `${((slot - 0.5) / len) * 100}%` }}
          >
            <span className="text-[8px] font-extrabold text-amber-600 tabular-nums leading-none">{slot}</span>
          </div>
        )}

        <div className="flex gap-[1.5px] h-4 items-stretch">
          {trace.steps.map((s, i) => {
            const walked = i < step;
            const cls = !walked
              ? 'bg-slate-200'
              : s.target && s.clicked
                ? 'bg-amber-400'
                : s.clicked
                  ? 'bg-emerald-500'
                  : s.examined
                    ? 'bg-slate-500'
                    : 'bg-slate-300';
            return (
              <div
                key={i}
                className={`flex-1 min-w-[2px] rounded-[1px] ${cls} ${
                  s.target ? 'ring-1 ring-amber-500' : ''
                } ${i === step ? 'ring-2 ring-slate-900' : ''}`}
                title={`slot ${i + 1}${s.target ? ' - target' : s.relevant ? ' - relevant' : ''}`}
              />
            );
          })}
        </div>
      </div>

      <div
        className={`w-[104px] shrink-0 rounded-md border px-1.5 py-1 text-[9px] font-bold text-center tabular-nums ${result.tone}`}
      >
        {result.text}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- legend -- */

const Legend: React.FC = () => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9.5px] text-slate-500">
    <span className="font-extrabold uppercase tracking-[0.1em] text-slate-400">Read the grid</span>
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-sm bg-slate-200 border border-slate-300" /> not walked yet
    </span>
    <span className="flex items-center gap-1">
      <EyeOff className="h-3 w-3 text-slate-500" /> walked past, never looked at
    </span>
    <span className="flex items-center gap-1">
      <Eye className="h-3 w-3 text-slate-500" /> examined and rejected
    </span>
    <span className="flex items-center gap-1">
      <MousePointerClick className="h-3 w-3 text-slate-500" /> clicked
    </span>
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-sm ring-2 ring-emerald-400" /> right club and department
    </span>
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-sm ring-2 ring-amber-400" /> the target itself
    </span>
  </div>
);

/* ----------------------------------------------------------------- tile -- */

/**
 * One slot of grid.
 *
 * The state vocabulary is the same three outcomes the choice model partitions
 * into - never looked at, looked at and rejected, clicked - because collapsing
 * "not seen" into "not wanted" is the exact confusion this screen exists to
 * clear up. A grid full of the right items nobody examined has not worked, and
 * it should not look like a grid that was examined and refused.
 */
const Tile: React.FC<{
  step: ArmTrace['steps'][number];
  products: ReturnType<typeof getDataset>['products'];
  state: 'future' | 'current' | 'past';
}> = ({ step, products, state }) => {
  const p = products[step.productIndex];
  const cfg = TEAM_BY_ID[p.team];
  const dim = state === 'future';

  const ring = step.target
    ? 'ring-2 ring-amber-400'
    : step.relevant
      ? 'ring-2 ring-emerald-400'
      : 'ring-1 ring-slate-200';

  return (
    <div
      className={`relative aspect-square rounded-md overflow-hidden ${ring} ${
        state === 'current' ? 'scale-110 z-10 shadow-lg' : ''
      } transition-all duration-200`}
      style={{
        background: dim ? '#f1f5f9' : `linear-gradient(135deg, ${p.primaryColor}, ${p.secondaryColor})`,
        opacity: dim ? 0.35 : 1,
      }}
      title={`${p.name} - $${(p.salePrice ?? p.price).toFixed(0)}`}
    >
      {!dim && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
          <span className="text-[8px] font-extrabold uppercase leading-none drop-shadow">{cfg.city.slice(0, 3)}</span>
          <span className="text-[6.5px] font-bold uppercase opacity-80 leading-tight mt-0.5 px-0.5 text-center">
            {p.department.slice(0, 6)}
          </span>
        </div>
      )}

      {/* Outcome overlay. Only meaningful once the step has been walked. */}
      {state !== 'future' && (
        <div className="absolute inset-0 flex items-center justify-center">
          {!step.examined ? (
            <div className="absolute inset-0 bg-slate-900/55 flex items-center justify-center">
              <EyeOff className="h-3 w-3 text-slate-300" />
            </div>
          ) : step.clicked ? (
            <div className="absolute inset-0 bg-white/25 flex items-center justify-center">
              <MousePointerClick className="h-3.5 w-3.5 text-white drop-shadow" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-slate-900/30 flex items-center justify-center">
              <Eye className="h-3 w-3 text-white/80" />
            </div>
          )}
        </div>
      )}

      {step.target && (
        <div className="absolute top-0 right-0 bg-amber-400 text-slate-900 text-[7px] font-extrabold px-1 rounded-bl">
          TARGET
        </div>
      )}
    </div>
  );
};

/* ----------------------------------------------------------------- pane -- */

const Pane: React.FC<{
  trace: ArmTrace;
  step: number;
  products: ReturnType<typeof getDataset>['products'];
  won: boolean;
  blurb: string;
}> = ({ trace, step, products, won, blurb }) => {
  const c = countersAt(trace, step);
  const personalized = trace.arm === 'personalized';

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div
        className={`px-3 py-2 rounded-t-xl border border-b-0 ${
          personalized ? 'bg-straive-500 border-straive-500' : 'bg-slate-800 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-white">
            {personalized ? <Sparkles className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
            <span className="text-[11px] font-extrabold uppercase tracking-wider">{ARM_LABEL[trace.arm]}</span>
          </div>
          {won && (
            <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5">
              <Trophy className="h-3 w-3 text-amber-300" />
              <span className="text-[9px] font-extrabold uppercase text-white">Reached first</span>
            </div>
          )}
        </div>
        {/* What ordered this grid, on the grid it ordered. */}
        <div className="text-[9.5px] text-white/70 mt-0.5 leading-snug">{blurb}</div>
      </div>

      <div className="border border-slate-200 bg-slate-50 px-2.5 py-2 grid grid-cols-5 gap-1.5">
        <Counter label="Steps" value={c.steps} />
        <Counter
          label="Seen b/4 relevant"
          value={c.seenBeforeFirstRelevant === null ? `${c.seenSoFar}+` : c.seenBeforeFirstRelevant}
          tone={c.seenBeforeFirstRelevant === null && c.steps > 0 ? 'bad' : 'default'}
        />
        <Counter label="Dead ends" value={c.deadEnds} tone={c.deadEnds > 0 ? 'bad' : 'default'} />
        <Counter label="Scroll depth" value={c.scrollDepth} />
        <Counter
          label="Target"
          value={c.reachedAt !== null ? `step ${c.reachedAt}` : c.abandonedAt !== null ? 'left' : '--'}
          tone={c.reachedAt !== null ? 'good' : c.abandonedAt !== null ? 'bad' : 'default'}
        />
      </div>

      <div className="flex-1 border border-t-0 border-slate-200 rounded-b-xl bg-white p-2.5">
        <div className="grid grid-cols-8 gap-1.5">
          {trace.steps.map((s, i) => (
            <Tile
              key={i}
              step={s}
              products={products}
              state={i < step ? 'past' : i === step ? 'current' : 'future'}
            />
          ))}
        </div>
        {c.abandonedAt !== null && c.abandonedAt <= step && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
            <span className="text-[10px] font-semibold text-amber-800">
              Shopper left at step {c.abandonedAt}
              {c.reachedAt === null ? ' without finding it.' : '.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- screen -- */

/** The one-line result of a race, computed from the pair rather than asserted. */
function outcomeOf(race: RacePair | null): { chip: string; tone: string } {
  if (!race) return { chip: 'absent', tone: 'bg-slate-200 text-slate-500' };
  if (race.upset) return { chip: 'upset', tone: 'bg-amber-100 text-amber-800' };
  if (race.winner === 'personalized') return { chip: 'engine wins', tone: 'bg-emerald-100 text-emerald-800' };
  if (race.personalized.targetStep === null && race.popularity.targetStep === null)
    return { chip: 'neither finds it', tone: 'bg-slate-200 text-slate-600' };
  return { chip: 'tie', tone: 'bg-slate-200 text-slate-600' };
}

export const TwinStoreRace: React.FC = () => {
  const { products } = useApp();
  const [castIndex, setCastIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * The whole field, raced on mount.
   *
   * Five races rather than one, so every chip in the cast strip can report its
   * own outcome before it is clicked. It is the honest version of the strip:
   * the two losses are visible as losses without the viewer having to take the
   * driver's word that they exist.
   */
  const field = useMemo<(RacePair | null)[]>(() => {
    const { customers, choice } = getDataset();
    return CAST.map((entry) => {
      const customer = customers.find((c) => c.id === entry.id);
      if (!customer) return null;
      return raceShopper(customer, products, choice, { seed: `effort-v1:${customer.id}` });
    });
  }, [products]);

  const race = field[castIndex];
  const maxStep = race ? Math.max(race.personalized.steps.length, race.popularity.steps.length) : 0;

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [castIndex]);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setStep((s) => {
        if (s >= maxStep) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 220);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, maxStep]);

  if (!race) {
    return <div className="p-6 text-sm text-slate-500">This shopper is not in the current world.</div>;
  }

  const pReach = countersAt(race.personalized, step).reachedAt;
  const oReach = countersAt(race.popularity, step).reachedAt;
  const pSlot = targetSlot(race.personalized);
  const oSlot = targetSlot(race.popularity);
  const finished = step >= maxStep;

  return (
    <div className="bg-slate-100 min-h-full">
      {/* What this screen is. */}
      <div className="bg-slate-900 text-white px-4 py-3">
        <div className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
          Twin store race - a controlled comparison in a simulated world
        </div>
        <div className="text-[15px] font-display font-extrabold leading-snug mt-0.5">
          Does ordering the grid by predicted intent get this shopper to the thing they came for in less work
          than ordering it by what sells?
        </div>
        <div className="text-[10px] text-slate-400 mt-1">
          Run the race and watch both stores walk. The counters are the answer, and one of the five shoppers on
          the strip below is a race the engine loses outright.
        </div>
      </div>

      <Brief />

      {/* The target, before anything moves. */}
      <div className="bg-slate-800 text-white px-4 py-2.5">
        <div className="flex items-start gap-2.5">
          <TargetIcon className="h-4 w-4 text-straive-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
              This shopper's true intent - held out from both stores
            </div>
            <div className="text-[14px] font-display font-extrabold leading-snug mt-0.5">
              {race.target.description}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Read off the shopper's held-out purchase, which no engine on either side can see. Both stores
              are shown the same 798-product catalog and must find it.
            </div>
          </div>
        </div>
      </div>

      {/* Cast, each chip carrying its own computed result. */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400 mr-1">
            Shopper
          </span>
          {CAST.map((c, i) => {
            const o = outcomeOf(field[i]);
            const active = i === castIndex;
            return (
              <button
                key={c.id}
                onClick={() => setCastIndex(i)}
                className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                  active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {c.id}
                <span className={`rounded-full px-1.5 py-[1px] text-[8.5px] font-extrabold uppercase ${o.tone}`}>
                  {o.chip}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-600">
          <span className="font-semibold">{CAST[castIndex].note}.</span>
          <span className="text-slate-400">
            Intent confidence {(race.confidence * 100).toFixed(0)}%
            {race.gateWithheld && ' - below the activation gate'}
          </span>
        </div>
        <div className="mt-1 text-[9.5px] text-slate-400">
          Five shoppers, chosen to span the outcomes rather than to flatter the model. The chips are computed
          from the traces on this screen, not written by hand.
        </div>
      </div>

      {/* Transport. */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2">
        <button
          onClick={() => setStep((s) => Math.min(maxStep, s + 1))}
          disabled={step >= maxStep}
          className="flex items-center gap-1.5 rounded-lg bg-straive-500 hover:bg-straive-600 disabled:bg-slate-200 disabled:text-slate-400 text-white px-3 py-1.5 text-[11px] font-extrabold transition-colors"
        >
          <SkipForward className="h-3.5 w-3.5" /> Step
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={step >= maxStep}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40 px-3 py-1.5 text-[11px] font-bold text-slate-700 transition-colors"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setStep(maxStep);
          }}
          disabled={step >= maxStep}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40 px-3 py-1.5 text-[11px] font-bold text-slate-700 transition-colors"
        >
          <ChevronsRight className="h-3.5 w-3.5" /> Skip to result
        </button>
        <button
          onClick={() => {
            setStep(0);
            setPlaying(false);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-700 transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>

        <div className="flex-1 mx-2">
          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-slate-900 transition-all duration-200"
              style={{ width: `${maxStep > 0 ? (step / maxStep) * 100 : 0}%` }}
            />
          </div>
        </div>
        <span className="text-[10px] font-mono font-bold text-slate-500 tabular-nums">
          step {step} / {maxStep}
        </span>
      </div>

      {/* Both walks on one axis. The comparison the two grids cannot make. */}
      <div className="px-4 pt-3.5">
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Flag className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500">
                Where each store put the target
              </span>
            </div>
            <span className="text-[10px] text-slate-500 tabular-nums">
              personalized slot {pSlot ?? 'not in grid'} - popularity slot {oSlot ?? 'not in grid'}
            </span>
          </div>

          <div className="mt-2.5 space-y-1.5">
            <Track trace={race.personalized} step={step} />
            <Track trace={race.popularity} step={step} />
          </div>

          <div className="mt-2 text-[9.5px] text-slate-500 leading-relaxed">
            One cell per slot, in the order that store presented it. Grey is not walked yet, light grey is
            walked past unseen, dark is examined and rejected, green is a click and amber is the target. The
            number above the track is the slot the target occupies in that ordering, which is the thing the two
            stores actually disagree about.
          </div>
        </div>
      </div>

      {/* The race. */}
      <div className="px-4 pt-3">
        <Legend />
      </div>
      <div className="p-4 pt-2 flex flex-col lg:flex-row gap-4">
        <Pane
          trace={race.personalized}
          step={step}
          products={products}
          won={pReach !== null && (oReach === null || pReach < oReach)}
          blurb="Ordered by the intent engine's posterior over club, department and price"
        />
        <Pane
          trace={race.popularity}
          step={step}
          products={products}
          won={oReach !== null && (pReach === null || oReach < pReach)}
          blurb="Ordered by sales rank, the same grid everyone gets with personalization off"
        />
      </div>

      {/* Verdict, computed - never asserted. */}
      <div className="px-4 pb-5">
        {finished ? (
          <div
            className={`rounded-xl border px-4 py-3 ${
              race.upset ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-start gap-2">
              {race.upset ? (
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              ) : (
                <Trophy className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              )}
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                  {race.upset
                    ? 'Upset - the unpersonalized store won this race'
                    : race.winner === 'personalized'
                      ? 'The personalized store reached the target first'
                      : 'Neither store reached the target'}
                </div>
                <div className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  {race.upset
                    ? `The intent engine was ${(race.confidence * 100).toFixed(0)}% confident and ranked the wrong ` +
                      `assortment to the top, while the target happened to be a bestseller the popularity grid ` +
                      `surfaces to everybody. This is a real outcome of the model, not a staged one - ` +
                      `npm run sim:effort reports the control arm winning about 5% of races across the population.`
                    : race.winner === 'personalized'
                      ? `Target reached at step ${race.personalized.targetStep} against ` +
                        `${race.popularity.targetStep === null ? 'never' : `step ${race.popularity.targetStep}`}. ` +
                        `Both stores walked the same catalog with the same shopper and the same random draws; ` +
                        `the only difference between them is the order.`
                      : `Both shoppers walked the grid and left without finding it. This is the most common ` +
                        `outcome in the population for both arms, and the reach-rate row in npm run sim:effort ` +
                        `is where it is counted.`}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              Race in progress - {maxStep - step} slots to go
            </div>
            <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              The verdict appears once both shoppers have finished walking. Nothing is asserted before then;
              this screen only reports what the traces did. Skip to result if you would rather not wait.
            </div>
          </div>
        )}

        <div className="mt-3 text-[10px] text-slate-500 leading-relaxed">
          <span className="font-bold text-slate-600">Where these numbers come from.</span> Both grids hold the
          same 798 products and are walked with the same pre-drawn random numbers, so the shopper's luck is
          identical on both sides and the only variable is the ordering. The walk itself is the choice model in
          src/ml/counterfactual.ts, the same one npm run sim:effort runs over the whole population; this screen
          is a viewer and does no arithmetic of its own. Every count here is shopper effort in a simulated
          world - there is no revenue figure on this screen, deliberately.
        </div>
      </div>
    </div>
  );
};
