/**
 * How much of the shopper the model currently holds.
 *
 * Lives in the Straive bar rather than the storefront header because it is a
 * delivery instrument, not a retail one, and because it has to be visible on
 * every screen - the number's whole job is to move while you watch it, and a
 * meter you have to navigate to is a meter nobody sees move.
 *
 * The figure is coverage, not confidence. A shopper who genuinely splits
 * between two clubs has a complete team profile and an uncertain prediction;
 * reading confidence here would report them as barely known and send an
 * operator hunting for data already in hand. Each field is scored on how much
 * evidence stands behind it, capped by a ceiling set by the quality of the
 * source - a device skew can never reach "complete" however much accumulates,
 * a declared CRM fact can.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { CompletenessField } from '../../ml/engine';
import { IDENTITY_RUNGS } from '../../ml/engine';
import { ChevronDown, Gauge } from 'lucide-react';

/** Field keys are terse because they are code. These are for people. */
const FIELD_LABELS: Record<string, string> = {
  team: 'Team affinity',
  department: 'Category affinity',
  league: 'League affinity',
  player: 'Player affinity',
  gender: 'Gender skew',
  ageBand: 'Age band',
  region: 'Region',
  priceSensitivity: 'Price sensitivity',
  giftIntent: 'Gift intent',
  size: 'Size profile',
  history: 'Purchase history',
  loyalty: 'Loyalty tier',
};

const SOURCE_LABELS: Record<string, string> = {
  prior: 'population prior',
  inferred: 'inferred',
  session: 'this session',
  history: 'order history',
  crm: 'CRM record',
};

/** Warm at the bottom, confident at the top. Same ramp as the panel's gauges. */
function barTone(score: number): string {
  if (score < 0.3) return 'bg-slate-500';
  if (score < 0.6) return 'bg-amber-400';
  if (score < 0.85) return 'bg-lime-400';
  return 'bg-emerald-400';
}

const FieldRow: React.FC<{ field: CompletenessField }> = ({ field }) => (
  <div className="flex items-center gap-2 py-[3px]">
    <span className="w-[104px] shrink-0 text-[10px] text-slate-300 truncate">
      {FIELD_LABELS[field.field] ?? field.field}
    </span>
    <span className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
      <span
        className={`block h-full rounded-full transition-all duration-700 ease-out ${barTone(field.score)}`}
        style={{ width: `${Math.round(field.score * 100)}%` }}
      />
    </span>
    <span className="w-[68px] shrink-0 text-right text-[9px] font-mono text-slate-500 truncate">
      {SOURCE_LABELS[field.source] ?? field.source}
    </span>
    <span className="w-[26px] shrink-0 text-right text-[10px] font-mono tabular-nums text-slate-400">
      {Math.round(field.score * 100)}
    </span>
  </div>
);

export const CompletenessMeter: React.FC = () => {
  const { completeness, identityState, contextIsSimulated } = useApp();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const percent = Math.round(completeness.percent);
  const rung = IDENTITY_RUNGS[identityState];

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="What the model knows about this shopper, weighted by how much each field is worth"
        className="flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition-colors"
      >
        <Gauge className="h-3.5 w-3.5 text-straive-300 shrink-0" />
        <span className="hidden sm:block text-[10px] font-semibold text-slate-300 leading-none">Profile</span>
        <span className="w-16 h-1.5 rounded-full bg-white/12 overflow-hidden shrink-0">
          {/* The transition is the point: on promotion this bar visibly travels
              rather than snapping, which is what makes the jump legible. */}
          <span
            className="block h-full rounded-full bg-gradient-to-r from-straive-500 to-straive-300 transition-all duration-1000 ease-out"
            style={{ width: `${percent}%` }}
          />
        </span>
        <span className="text-[11px] font-mono font-extrabold tabular-nums text-white leading-none w-[30px] text-right">
          {percent}%
        </span>
        <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[360px] rounded-2xl border border-white/12 bg-ink-950/98 backdrop-blur shadow-2xl p-3.5">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[11px] font-extrabold text-white uppercase tracking-wide">Profile completeness</span>
            <span className="text-[10px] font-mono text-straive-300">{rung.label}</span>
          </div>
          <p className="text-[10px] leading-snug text-slate-400 mb-3">
            Coverage weighted by how much each field is worth to a decision — not how confident the
            prediction is. {rung.basis}.
          </p>

          <div className="space-y-px mb-3">
            {completeness.fields.map((f) => (
              <FieldRow key={f.field} field={f} />
            ))}
          </div>

          <div className="border-t border-white/10 pt-2.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Biggest gaps — where the next point comes cheapest
            </div>
            <div className="flex flex-wrap gap-1.5">
              {completeness.biggestGaps.map((f) => (
                <span
                  key={f.field}
                  className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-amber-400/10 border border-amber-400/25 text-amber-200"
                >
                  {FIELD_LABELS[f.field] ?? f.field}
                  <span className="ml-1 font-mono text-amber-400/70">
                    +{((f.weight - f.weight * f.score) * 100).toFixed(1)}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {contextIsSimulated && (
            <p className="mt-3 pt-2.5 border-t border-white/10 text-[9px] leading-snug text-slate-500">
              This browser sent no referrer or campaign, so the arrival context is simulated — a paid
              social click on a Philadelphia campaign from a handset. Everything downstream of it is
              computed for real.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
