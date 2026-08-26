/**
 * The live profile: what the system currently believes about this shopper.
 *
 * This is the panel's front door, and that is a deliberate choice made against
 * one real objection. The tab that MOVES is Decisions - the profile can sit
 * unchanged through several clicks, and a default view that looks the same after
 * ten minutes as it did on arrival undercuts the claim the demo exists to make.
 * That objection is why the panel stopped opening on the pipeline walkthrough.
 *
 * It is still the default, because the first question a client asks is not "how
 * does it work" but "do you have a picture of me". Answering that in the first
 * second is worth more than animation. The static-looking risk is mitigated
 * rather than accepted: every field flashes when it is written, and the first
 * write after any event surfaces a one-line summary at the top with a way
 * across to Decisions, so the movement is visible from here and the detail is
 * one click away.
 *
 * Every row carries three things beyond the value: how confident, from what
 * source, and at what decay constant. The last is the one usually left out and
 * the one that explains the other two - it is why a league affinity and a gift
 * intent built from the same number of clicks disagree about how sure they are.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { fieldOf, summariseWrite } from '../../ml/decisions';
import type { Confidence, ProfileDelta } from '../../ml/engine';
import { ArrowRight, X } from 'lucide-react';

/* ------------------------------------------------------------------ atoms -- */

const SOURCE_STYLE: Record<string, string> = {
  prior: 'bg-slate-100 text-slate-500 border-slate-200',
  inferred: 'bg-violet-50 text-violet-700 border-violet-200',
  session: 'bg-sky-50 text-sky-700 border-sky-200',
  history: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  crm: 'bg-amber-50 text-amber-700 border-amber-200',
};

const SOURCE_LABEL: Record<string, string> = {
  prior: 'prior',
  inferred: 'inferred',
  session: 'session',
  history: 'orders',
  crm: 'CRM',
};

const SourceBadge: React.FC<{ source: string }> = ({ source }) => (
  <span
    className={`shrink-0 text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-px border ${
      SOURCE_STYLE[source] ?? SOURCE_STYLE.prior
    }`}
  >
    {SOURCE_LABEL[source] ?? source}
  </span>
);

function toneFor(v: number): string {
  if (v < 0.3) return 'bg-slate-400';
  if (v < 0.55) return 'bg-amber-400';
  if (v < 0.8) return 'bg-lime-500';
  return 'bg-emerald-500';
}

/**
 * A half-life is what a decay constant means, and months are what a merchandiser
 * thinks in. Lambda is kept alongside rather than replaced: the data science
 * team in the room wants the constant, everyone else wants the half-life.
 */
function halfLife(lambda: number): string {
  if (lambda <= 0) return 'does not decay';
  return `half-life ${(Math.LN2 / lambda).toFixed(1)} events`;
}

interface FieldRowProps {
  field: string;
  label: string;
  value: string;
  runnerUp?: string;
  margin?: number;
  confidence: Confidence;
  /** Set while this field is flashing from a recent write. */
  hot: boolean;
}

const FieldRow: React.FC<FieldRowProps> = ({ field, label, value, runnerUp, margin, confidence, hot }) => (
  <div
    className={`rounded-lg border px-2.5 py-2 transition-all duration-500 ${
      hot ? 'border-straive-400 bg-straive-50 shadow-[0_0_0_3px_rgba(255,88,0,0.10)]' : 'border-slate-200 bg-white'
    }`}
    data-field={field}
  >
    <div className="flex items-baseline gap-2 mb-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">{label}</span>
      <span className="flex-1 min-w-0 text-[12.5px] font-extrabold text-slate-900 truncate">{value}</span>
      <SourceBadge source={confidence.source} />
    </div>

    <div className="flex items-center gap-2">
      <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <span
          className={`block h-full rounded-full transition-all duration-700 ease-out ${toneFor(confidence.value)}`}
          style={{ width: `${Math.round(confidence.value * 100)}%` }}
        />
      </span>
      <span className="w-8 shrink-0 text-right text-[10px] font-mono font-bold tabular-nums text-slate-600">
        {Math.round(confidence.value * 100)}%
      </span>
    </div>

    <div className="mt-1 flex items-center justify-between gap-2 text-[9.5px] text-slate-400 font-mono">
      <span className="truncate">
        λ {confidence.decayLambda} · {halfLife(confidence.decayLambda)}
      </span>
      <span className="shrink-0">
        {confidence.evidenceCount.toFixed(2)} ev
        {runnerUp && margin !== undefined ? ` · over ${runnerUp} by ${(margin * 100).toFixed(0)}pp` : ''}
      </span>
    </div>
  </div>
);

/* ------------------------------------------------------------------- tab -- */

export const ProfileTab: React.FC<{ onSeeDecisions: () => void }> = ({ onSeeDecisions }) => {
  const { visitorProfile: p, lastDeltas, completeness } = useApp();

  /**
   * Which fields are flashing.
   *
   * Keyed off the delta batch rather than a timer per row, so a burst of writes
   * in one fold flashes together and clears together - a row-by-row fade reads
   * as a rendering glitch rather than as a signal landing.
   */
  const [hot, setHot] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<ProfileDelta | null>(null);
  const seenBatch = useRef<ProfileDelta[] | null>(null);

  useEffect(() => {
    if (!lastDeltas.length || seenBatch.current === lastDeltas) return;
    seenBatch.current = lastDeltas;

    setHot(new Set(lastDeltas.map((d) => fieldOf(d.path))));
    // The FIRST write of the batch, not the largest. The batch is ordered by the
    // fold, so the first one is the observation that caused the rest - a summary
    // that led with a propagation would name an effect as if it were a cause.
    setBanner(lastDeltas[0]);

    const clearHot = setTimeout(() => setHot(new Set()), 2200);
    const clearBanner = setTimeout(() => setBanner(null), 7000);
    return () => {
      clearTimeout(clearHot);
      clearTimeout(clearBanner);
    };
  }, [lastDeltas]);

  const isHot = (field: string) => hot.has(field);

  const sizes = useMemo(() => Object.entries(p.traits.sizeProfile), [p.traits.sizeProfile]);

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
      {/* The mitigation for opening on a view that can sit still: when a write
          lands, say so here and offer the way across to the detail. */}
      {banner && (
        <div className="rounded-xl border border-straive-300 bg-straive-50 px-3 py-2 flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-straive-500 shrink-0 animate-pulse" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-straive-900 leading-snug">{summariseWrite(banner)}</p>
            <button
              onClick={onSeeDecisions}
              className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-bold text-straive-700 hover:text-straive-900 transition-colors"
            >
              See what ran and what it changed
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <button
            onClick={() => setBanner(null)}
            className="shrink-0 text-straive-400 hover:text-straive-700 transition-colors"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Persona sits above the fields because it is the one line a merchandiser
          would actually repeat out loud. */}
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Persona</span>
          <span className="text-[10px] font-mono text-slate-400">
            {Math.round(completeness.percent)}% complete · {p.observedEvents} events folded
          </span>
        </div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-[15px] font-display font-extrabold text-slate-900">{p.persona.label}</span>
          <span className="text-[10px] text-slate-500 truncate">
            over {p.persona.runnerUp} by {(p.persona.margin * 100).toFixed(0)}pp
          </span>
        </div>
        {p.persona.drivers.length > 0 && (
          <p className="mt-1 text-[10.5px] text-slate-500 leading-snug">
            Driven by {p.persona.drivers.slice(0, 3).join(', ')}.
          </p>
        )}
      </div>

      <section className="space-y-1.5">
        <h3 className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400 px-0.5">Affinities</h3>
        <FieldRow
          field="team" label="Team" value={p.affinities.team.top}
          runnerUp={p.affinities.team.runnerUp} margin={p.affinities.team.margin}
          confidence={p.affinities.team.confidence} hot={isHot('team')}
        />
        <FieldRow
          field="department" label="Category" value={p.affinities.department.top}
          runnerUp={p.affinities.department.runnerUp} margin={p.affinities.department.margin}
          confidence={p.affinities.department.confidence} hot={isHot('department')}
        />
        <FieldRow
          field="league" label="League" value={p.affinities.league.top}
          runnerUp={p.affinities.league.runnerUp} margin={p.affinities.league.margin}
          confidence={p.affinities.league.confidence} hot={isHot('league')}
        />
        <FieldRow
          field="player" label="Player" value={p.affinities.player.top || '—'}
          runnerUp={p.affinities.player.runnerUp} margin={p.affinities.player.margin}
          confidence={p.affinities.player.confidence} hot={isHot('player')}
        />
      </section>

      <section className="space-y-1.5">
        <h3 className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400 px-0.5">Traits</h3>
        <FieldRow
          field="gender" label="Shopping for" value={p.traits.gender.top}
          runnerUp={p.traits.gender.runnerUp} margin={p.traits.gender.margin}
          confidence={p.traits.gender.confidence} hot={isHot('gender')}
        />
        <FieldRow
          field="ageBand" label="Age band" value={p.traits.ageBand.top}
          runnerUp={p.traits.ageBand.runnerUp} margin={p.traits.ageBand.margin}
          confidence={p.traits.ageBand.confidence} hot={isHot('ageBand')}
        />
        <FieldRow
          field="priceSensitivity" label="Price sensitivity"
          value={p.traits.priceSensitivity.value < 0.4 ? 'Premium-tolerant' : p.traits.priceSensitivity.value > 0.6 ? 'Deal-driven' : 'Mid-market'}
          confidence={p.traits.priceSensitivity.confidence} hot={isHot('priceSensitivity')}
        />
        <FieldRow
          field="giftIntent" label="Gift intent"
          value={p.traits.giftIntent.value > 0.6 ? 'Likely gifting' : p.traits.giftIntent.value < 0.35 ? 'Buying for self' : 'Unclear'}
          confidence={p.traits.giftIntent.confidence} hot={isHot('giftIntent')}
        />
        <FieldRow
          field="region" label="Region" value={p.traits.region.value ?? 'Unplaced'}
          confidence={p.traits.region.confidence} hot={isHot('region')}
        />
      </section>

      <section className="space-y-1.5">
        <h3 className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400 px-0.5">
          Account
        </h3>
        <div
          className={`rounded-lg border px-2.5 py-2 space-y-1.5 transition-all duration-500 ${
            isHot('loyaltyTier') || isHot('sizeProfile')
              ? 'border-straive-400 bg-straive-50'
              : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Loyalty</span>
            <span className="text-[12px] font-extrabold text-slate-900">{p.state.loyaltyTier ?? 'Not a member'}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lifetime orders</span>
            <span className="text-[12px] font-extrabold text-slate-900 tabular-nums">{p.state.lifetimeOrders}</span>
          </div>
          <div className="pt-1 border-t border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Size profile</span>
            {sizes.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {sizes.map(([dept, est]) => (
                  <span
                    key={dept}
                    className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800"
                    title={`From order history · ${Math.round(est!.confidence.value * 100)}% confident`}
                  >
                    {dept} {est!.size}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-0.5 text-[10.5px] text-slate-400">
                Nothing shipped and kept yet, so no size is known.
              </p>
            )}
          </div>
        </div>
      </section>

      <p className="text-[9.5px] leading-snug text-slate-400 px-0.5 pb-1">
        λ is the field's own decay constant, in evidence-weight per folded event. Fields with a
        low λ — league, gender, size — hold their value across sessions. Fields with a high λ —
        gift intent, player — are episodes, and are supposed to fade.
      </p>
    </div>
  );
};
