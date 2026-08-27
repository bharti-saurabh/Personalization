/**
 * What personalization did to the shopper's behaviour. No money on this screen.
 *
 * WHY REVENUE AND ROI ARE DELIBERATELY ABSENT
 * -------------------------------------------
 * Every figure in this build is measured against a seeded simulation. Steps and
 * seconds measured against a simulated catalog are a real measurement of a
 * simulated world - anyone can check the arithmetic, and the claim is bounded
 * by the thing being simulated. The moment those are multiplied by a conversion
 * rate and an average order value, the number stops being a measurement and
 * becomes a forecast about a business nobody in the room has data for. A demo
 * that shows a revenue figure invites the audience to argue about the multiplier
 * instead of the mechanism, and the mechanism is the only thing here that is
 * actually true.
 *
 * So: steps to a decision, time to the first relevant item, how far down the
 * page the shopper had to go. Stated as behaviour, with the same figures for
 * the un-personalized control beside them.
 *
 * THE CONTROL IS NOT A SECOND SIMULATION
 * --------------------------------------
 * Every avoided step was paired against its own merchandised default at the
 * moment it was recorded - where the thing the shopper took actually sat in the
 * alphabetical or bestseller ordering. The control column is the sum of those
 * pairs, which is why it can be worse than the personalized column and
 * occasionally is, for a shopper the model reads wrong.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { EFFORT_KINDS } from '../../ml/effort';
import { ArrowRight, MousePointerClick, Timer, ScrollText, Info } from 'lucide-react';

const Measure: React.FC<{
  icon: React.ElementType;
  label: string;
  personalized: string;
  control: string;
  delta: number;
  unit: string;
  note: string;
}> = ({ icon: Icon, label, personalized, control, delta, unit, note }) => {
  const better = delta > 0;
  const moved = Math.abs(delta) > 0.01;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5" title={note}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3 w-3 text-slate-500" />
        <span className="text-[10px] font-bold text-white">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="text-[15px] font-mono font-bold text-straive-400 leading-none">{personalized}</div>
          <div className="text-[8.5px] text-slate-600 mt-0.5">personalized</div>
        </div>
        <ArrowRight className="h-3 w-3 text-slate-700 rotate-180 shrink-0" />
        <div className="flex-1">
          <div className="text-[15px] font-mono font-bold text-slate-400 leading-none">{control}</div>
          <div className="text-[8.5px] text-slate-600 mt-0.5">control</div>
        </div>
      </div>
      <div
        className={`mt-1.5 pt-1.5 border-t border-white/8 text-[9.5px] font-mono ${
          !moved ? 'text-slate-600' : better ? 'text-emerald-400' : 'text-rose-400'
        }`}
      >
        {!moved
          ? 'no measurable difference yet'
          : `${better ? '−' : '+'}${Math.abs(delta).toFixed(1)} ${unit} ${better ? 'saved' : 'cost'}`}
      </div>
    </div>
  );
};

export const ValueTab: React.FC = () => {
  const { effortLedger, isPersonalizationOn } = useApp();
  const r = effortLedger.replay;

  const scroll = effortLedger.byKind.find((k) => k.kind === 'scroll_depth');
  const scrollAvoided = scroll?.avoided ?? 0;
  const scrollIncurred = scroll?.incurred ?? 0;

  if (r.decisions === 0) {
    return (
      <div className="h-full overflow-y-auto p-2.5">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10.5px] text-slate-300 leading-relaxed">
            Nothing measured yet. This tab fills as the shopper acts: every time they take something, where it sat in
            the personalized ordering is compared against where the same thing sits in the merchandised default.
          </p>
          <p className="mt-2 text-[9.5px] text-slate-500 leading-relaxed">
            Nothing is recorded on render. A saving needs a subject, and until the shopper takes something the only
            claim available is that the model put its own prediction first, which is true by construction and worth
            nothing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2.5 space-y-2.5">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Built from {r.decisions} paired decision{r.decisions === 1 ? '' : 's'}
        </span>
        <p className="mt-1 text-[9.5px] text-slate-500 leading-relaxed">
          Behaviour only. No revenue figure appears anywhere in this build, because a step count measured against a
          simulated catalog is a measurement and a revenue figure derived from it would be a forecast.
        </p>
      </div>

      <Measure
        icon={MousePointerClick}
        label="Steps to a decision"
        personalized={r.personalizedClicks.toFixed(0)}
        control={r.unpersonalizedClicks.toFixed(0)}
        delta={r.savedClicks}
        unit="steps"
        note="Clicks, filter applications, sort changes and pagination the shopper had to make to reach what they took."
      />

      <Measure
        icon={Timer}
        label="Time to the first relevant item"
        personalized={`${r.personalizedSeconds.toFixed(0)}s`}
        control={`${r.unpersonalizedSeconds.toFixed(0)}s`}
        delta={r.savedSeconds}
        unit="seconds"
        note="Each step priced at a fixed per-kind duration. The durations are constants in ml/effort.ts, not measured from this session."
      />

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <ScrollText className="h-3 w-3 text-slate-500" />
          <span className="text-[10px] font-bold text-white">Scroll depth before the first add to cart</span>
        </div>
        {scrollIncurred + scrollAvoided === 0 ? (
          <p className="text-[9.5px] text-slate-600 leading-relaxed">
            Nothing added to the basket yet, so there is no depth to report. This stays empty rather than showing a
            zero.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-mono font-bold text-straive-400">{scrollIncurred.toFixed(0)}</span>
              <span className="text-[9.5px] text-slate-500">rows scrolled</span>
              <span className="ml-auto text-[9.5px] font-mono text-emerald-400">
                {scrollAvoided.toFixed(0)} avoided
              </span>
            </div>
            <p className="mt-1 text-[9px] text-slate-600 leading-relaxed">
              Rows the shopper passed before taking something, against the rows the same item sat behind in the
              merchandised ordering.
            </p>
          </>
        )}
      </div>

      {/* Per-kind breakdown. Kept last because it is the audit trail rather than
          the argument, and an audience that accepts the three measures above
          does not need it. */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="px-2.5 py-1.5 border-b border-white/8 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Where the steps went
        </div>
        {effortLedger.byKind.map((k) => (
          <div key={k.kind} className="px-2.5 py-1 flex items-baseline gap-2 text-[9.5px] border-b border-white/5 last:border-0">
            <span className="flex-1 min-w-0 truncate text-slate-400" title={EFFORT_KINDS[k.kind]?.intent}>
              {EFFORT_KINDS[k.kind]?.label ?? k.kind}
            </span>
            <span className="font-mono text-slate-300 w-7 text-right">{k.incurred}</span>
            <span className="font-mono text-emerald-400 w-9 text-right" title="Avoided">
              −{k.avoided}
            </span>
          </div>
        ))}
      </div>

      {!isPersonalizationOn && (
        <p className="text-[9px] text-amber-300/90 leading-relaxed flex items-start gap-1 px-0.5">
          <Info className="h-2.5 w-2.5 mt-0.5 shrink-0" />
          Personalization is off, so nothing new is being recorded. The two orderings are the same list and the
          difference is structurally zero.
        </p>
      )}
    </div>
  );
};
