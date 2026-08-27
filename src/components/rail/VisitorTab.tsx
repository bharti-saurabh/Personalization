/**
 * What the engine believes, slot by slot.
 *
 * WHY LADDERS AND NOT A FLAT LIST OF FIELDS
 * -----------------------------------------
 * The old profile panel printed one line per field: "team: Eagles, 90%". That
 * is a claim with no visible alternative, and a claim with no alternative
 * cannot be argued with - which is exactly the objection a data science
 * audience raises about personalization in the first place. Every slot here
 * shows its top three with the scores that separate them, so the runner-up is
 * always on screen and the margin is always readable.
 *
 * FOUR NUMBERS PER SLOT, AND EACH EARNS ITS PLACE
 * -----------------------------------------------
 *   score       what the posterior says
 *   movement    what changed since the last event, arrow and amount
 *   confidence  how much the fold trusts the whole field
 *   evidence    how many observations are behind it
 *
 * Score without confidence is the classic personalization lie: 92% of nothing
 * is still nothing. Confidence without evidence hides that a strong number can
 * rest on two clicks. And the decay constant sits on the row rather than in a
 * footnote because it is what says how quickly the belief will be given up.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { SLOT_IDS, SLOT_LABEL, SLOT_PURPOSE, DELTA_FLOOR } from '../../state/visitorModel';
import type { Slot, SlotId } from '../../state/visitorModel';
import { ArrowDown, ArrowUp, Minus, TrendingUp } from 'lucide-react';

const SOURCE_TONE: Record<string, string> = {
  session: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  history: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
  crm: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
  inferred: 'text-straive-300 bg-straive-500/10 border-straive-500/25',
  prior: 'text-slate-500 bg-white/5 border-white/10',
};

/** Half-life in events, which is what a decay constant actually means to a reader. */
function halfLife(lambda: number): string {
  if (lambda <= 0) return 'never decays';
  return `half-life ${(Math.log(2) / lambda).toFixed(1)} events`;
}

const Movement: React.FC<{ delta: number }> = ({ delta }) => {
  if (Math.abs(delta) < DELTA_FLOOR) {
    return (
      <span className="flex items-center gap-0.5 text-[9px] font-mono text-slate-600 w-11 justify-end" title="Held">
        <Minus className="h-2.5 w-2.5" />
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-[9px] font-mono w-11 justify-end ${
        up ? 'text-emerald-400' : 'text-rose-400'
      }`}
      title={`${up ? 'Up' : 'Down'} ${(Math.abs(delta) * 100).toFixed(1)} points since the last event`}
    >
      {up ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
      {(Math.abs(delta) * 100).toFixed(1)}
    </span>
  );
};

const SlotCard: React.FC<{ id: SlotId; slot: Slot }> = ({ id, slot }) => {
  const pct = Math.round(slot.confidence * 100);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="px-2.5 pt-2 pb-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-bold text-white">{SLOT_LABEL[id]}</span>
          <span className="text-[9px] font-mono text-slate-500">{id}</span>
        </div>
        <p className="text-[9px] text-slate-500 leading-snug mt-0.5">{SLOT_PURPOSE[id]}</p>
      </div>

      <div className="px-2.5 pb-1.5 space-y-1">
        {slot.ranked.length === 0 && (
          <div className="text-[10px] text-slate-600 py-1">Nothing separated from the prior yet.</div>
        )}
        {slot.ranked.map((entry, i) => (
          <div key={entry.id} className="flex items-center gap-2">
            <span className={`text-[10px] w-3 font-mono ${i === 0 ? 'text-straive-400' : 'text-slate-600'}`}>
              {i + 1}
            </span>
            <span className={`flex-1 min-w-0 truncate text-[10.5px] ${i === 0 ? 'text-white font-semibold' : 'text-slate-400'}`}>
              {entry.label}
            </span>
            <div className="w-14 h-1 rounded-full bg-white/8 overflow-hidden shrink-0">
              <div
                className={`h-full rounded-full ${i === 0 ? 'bg-straive-500' : 'bg-white/25'}`}
                style={{ width: `${Math.max(2, entry.score * 100)}%` }}
              />
            </div>
            <span className="text-[9.5px] font-mono text-slate-400 w-8 text-right shrink-0">
              {(entry.score * 100).toFixed(0)}%
            </span>
            <Movement delta={entry.delta} />
          </div>
        ))}
      </div>

      {/* The qualifiers. Same row every time, so a reader learns where to look. */}
      <div className="px-2.5 py-1.5 border-t border-white/8 bg-black/20 flex items-center gap-2 flex-wrap">
        <span
          className="text-[9px] font-mono text-slate-400"
          title="How much the fold trusts this field as a whole, independent of which value leads"
        >
          conf {pct}%
        </span>
        <span className="text-[9px] font-mono text-slate-500" title="Observations behind this field">
          n={slot.evidenceCount.toFixed(1)}
        </span>
        <span
          className="text-[9px] font-mono text-slate-500"
          title={`Decay constant lambda = ${slot.decayLambda}. ${halfLife(slot.decayLambda)}`}
        >
          λ {slot.decayLambda}
        </span>
        <span
          className={`text-[8.5px] font-semibold px-1.5 py-px rounded border ml-auto ${
            SOURCE_TONE[slot.source] ?? SOURCE_TONE.prior
          }`}
          title="Where this belief came from"
        >
          {slot.source}
        </span>
      </div>
    </div>
  );
};

export const VisitorTab: React.FC = () => {
  const { visitorModel, isCustomPersona, personaPresets, personaPresetId } = useApp();
  const m = visitorModel;
  const preset = personaPresets.find((p) => p.id === personaPresetId);

  return (
    <div className="h-full overflow-y-auto p-2.5 space-y-2.5">
      {/* -------------------------------------------------------- completeness -- */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Profile completeness</span>
          <span className="text-[15px] font-mono font-bold text-straive-400">{Math.round(m.completeness)}%</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-white/8 overflow-hidden">
          <div
            className="h-full rounded-full bg-straive-500 transition-all duration-500"
            style={{ width: `${m.completeness}%` }}
          />
        </div>
        <p className="mt-1.5 text-[9px] text-slate-500 leading-relaxed">
          Weighted across every slot below, discounted by how the evidence was obtained. {m.observedEvents} event
          {m.observedEvents === 1 ? '' : 's'} folded in at the {m.identityStage} rung.
        </p>
      </div>

      {/* ------------------------------------------------------------- persona -- */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Derived persona</span>
          <TrendingUp className="h-3 w-3 text-slate-600" />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[13px] font-bold text-white">{m.persona.label}</span>
          <span className="text-[9.5px] font-mono text-slate-500">
            conf {Math.round(m.persona.confidence * 100)}%
          </span>
        </div>
        <p className="mt-1 text-[9.5px] text-slate-400 leading-relaxed">
          Runner-up <span className="text-slate-200">{m.persona.runnerUp}</span>, margin{' '}
          <span className="font-mono text-straive-300">{(m.persona.margin * 100).toFixed(1)}</span> points.
        </p>
        <p className="mt-1.5 pt-1.5 border-t border-white/8 text-[9px] text-slate-500 leading-relaxed">
          {/* The disagreement is the interesting case, so it gets said out loud. */}
          Read from behaviour, not from the picker. The director is simulating{' '}
          <span className="text-slate-300">{preset?.label ?? 'a custom shopper'}</span>
          {isCustomPersona && ' off preset'}
          {preset && preset.label.toLowerCase() !== m.persona.label.toLowerCase() && (
            <span className="text-straive-300"> and the engine has read them differently</span>
          )}
          .
        </p>
      </div>

      {/* --------------------------------------------------------------- slots -- */}
      {SLOT_IDS.map((id) => (
        <SlotCard key={id} id={id} slot={m[id]} />
      ))}
    </div>
  );
};
