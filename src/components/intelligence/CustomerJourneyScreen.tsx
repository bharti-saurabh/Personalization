/**
 * The session, step by step: what each action captured, what it moved, and what
 * the shopper saw as a result.
 *
 * WHAT THIS REPLACED
 * ------------------
 * A two-column screen with four numbered sections whose headings claimed a
 * "Transformer Sequential Intent Encoder", a feature store and a production
 * version number, none of which exist in this build. It described a plausible
 * architecture rather than the one running underneath it, and the numbers on it
 * were not read from anything. That is the single worst failure mode available
 * to a screen like this: an audience that later discovers one invented detail
 * discounts every real one next to it, and almost everything else in this build
 * is real.
 *
 * WHAT IT IS NOW
 * --------------
 * One spine, oldest step at the top, with the arrival ledger as step zero. Each
 * step carries four things and they are always in the same order, because the
 * order is the argument:
 *
 *   CAPTURED    the fields this action added to the record, named individually.
 *               "We track your behaviour" is a claim; a list of six fields is
 *               something a person can audit.
 *   INFERRED    what was derived from those fields without being asked for.
 *   MOVED       the profile writes, with before, after and the evidence weight,
 *               read from the fold's own delta log rather than recomputed.
 *   RENDERED    the surfaces that changed on the storefront, and what the gate
 *               refused while they were being built.
 *
 * Nothing on this screen is composed here. Every number comes from the decision
 * journal, the delta log, the capture ledger or the visitor model, all of which
 * are computed elsewhere and rendered by other panels too - so this screen and
 * the engine rail cannot disagree about what happened.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Ban,
  ChevronDown,
  ChevronUp,
  Database,
  Fingerprint,
  Layout,
  Radio,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fieldOf } from '../../ml/engine';
import type { DecisionEntry } from '../../ml/engine';
import { SLOT_LABEL, slotsMovedBy } from '../../state/visitorModel';
import type { SlotId } from '../../state/visitorModel';
import type { EventCapture } from '../../state/capture';

/* ------------------------------------------------------------- fragments -- */

const SectionLabel: React.FC<{ children: React.ReactNode; icon: React.ElementType; tone?: string }> = ({
  children,
  icon: Icon,
  tone = 'text-slate-500',
}) => (
  <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] ${tone}`}>
    <Icon className="h-2.5 w-2.5" />
    {children}
  </div>
);

/** A captured field, as a key-value pill. Deliberately dense: the count is part
 *  of the point, and a list of six one-line rows would bury it. */
const Pill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span className="inline-flex items-baseline gap-1 bg-white border border-slate-200 rounded px-1.5 py-0.5 max-w-full">
    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 shrink-0">{label}</span>
    <span className="text-[10.5px] font-mono text-ink-900 truncate">{value}</span>
  </span>
);

/**
 * One profile write.
 *
 * Shows before, after and the evidence weight together, because a movement
 * without its weight is unfalsifiable - a posterior that went up 4 points on a
 * contribution of 0.35 is a different claim from the same movement on a
 * contribution of 6.
 */
const Write: React.FC<{
  path: string;
  before: number | string | null;
  after: number | string | null;
  contribution: number;
  label: string;
}> = ({ path, before, after, contribution, label }) => {
  const numeric = typeof before === 'number' && typeof after === 'number';
  const up = numeric && (after as number) > (before as number);
  const leaf = path.split('.').slice(-1)[0];
  const fmt = (v: number | string | null) =>
    v === null ? '—' : typeof v === 'number' ? (Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(2)) : v;

  return (
    <div className="flex items-center gap-2 py-1 border-t border-slate-100 first:border-t-0">
      <span className="w-1 h-1 rounded-full bg-straive-400 shrink-0" />
      <span className="text-[10.5px] font-semibold text-slate-700 truncate min-w-0 flex-1" title={path}>
        {fieldOf(path)} <span className="text-slate-400 font-mono">{leaf}</span>
      </span>
      <span className="shrink-0 flex items-center gap-1 font-mono text-[10px]">
        <span className="text-slate-400">{fmt(before)}</span>
        <ArrowRight className="h-2.5 w-2.5 text-slate-300" />
        <span className={up ? 'text-emerald-600 font-bold' : 'text-slate-700 font-bold'}>{fmt(after)}</span>
        {numeric &&
          (up ? (
            <TrendingUp className="h-2.5 w-2.5 text-emerald-500" />
          ) : (
            <TrendingDown className="h-2.5 w-2.5 text-slate-400" />
          ))}
      </span>
      <span
        className="shrink-0 text-[9px] font-mono text-slate-500 bg-slate-100 border border-slate-200 rounded px-1"
        title={label}
      >
        +{contribution.toFixed(2)}
      </span>
    </div>
  );
};

/* ------------------------------------------------------------------ step -- */

interface StepProps {
  decision: DecisionEntry;
  capture: EventCapture | undefined;
  slots: SlotId[];
  open: boolean;
  onToggle: () => void;
  isLast: boolean;
}

const Step: React.FC<StepProps> = ({ decision, capture, slots, open, onToggle, isLast }) => {
  const captured = capture?.captured ?? [];
  const derived = capture?.derived ?? [];
  const writes = decision.writes;
  const withheldCount = decision.withheld?.count ?? 0;

  return (
    <div className="relative pl-8">
      {/* The spine. Drawn per step rather than as one border so the last step
          can stop the line instead of trailing off past the final card. */}
      {!isLast && <span className="absolute left-[11px] top-6 bottom-[-14px] w-px bg-slate-200" />}
      <span
        className={`absolute left-[5px] top-3 h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm ${
          isLast ? 'bg-straive-500 ring-4 ring-straive-100' : 'bg-slate-700'
        }`}
      />

      <div
        className={`bg-white border rounded-xl overflow-hidden transition-colors ${
          open ? 'border-straive-300 shadow-sm' : 'border-slate-200'
        }`}
      >
        {/* ------------------------------------------------------- header -- */}
        <button onClick={onToggle} className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-slate-50 transition-colors">
          <span className="shrink-0 mt-0.5 text-[9px] font-mono font-bold text-white bg-ink-900 rounded px-1.5 py-0.5">
            {decision.seq}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-bold text-ink-900 leading-snug">
              {decision.trigger.headline}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-px">
                {decision.trigger.page}
              </span>
              <span className="text-[10px] text-slate-500">
                {captured.length} field{captured.length === 1 ? '' : 's'} captured
              </span>
              {writes.length > 0 && (
                <span className="text-[10px] text-straive-600 font-semibold">
                  {writes.length} write{writes.length === 1 ? '' : 's'}
                </span>
              )}
              {slots.length > 0 && (
                <span className="text-[10px] text-emerald-700 font-semibold">
                  {slots.length} slot{slots.length === 1 ? '' : 's'} moved
                </span>
              )}
              {withheldCount > 0 && (
                <span className="text-[10px] text-rose-700 font-semibold">{withheldCount} withheld</span>
              )}
              {!decision.personalizationOn && (
                <span className="text-[9px] font-bold uppercase text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-px">
                  control arm
                </span>
              )}
            </span>
          </span>
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-1" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-1" />
          )}
        </button>

        {/* -------------------------------------------------- the reading -- */}
        <div className="px-3 pb-2.5 -mt-1">
          <p className="text-[11px] text-slate-600 leading-relaxed">
            {decision.reading.mechanism}{' '}
            <span className="text-slate-700">{decision.reading.consequence}</span>{' '}
            <span className="font-mono font-bold text-ink-900">{decision.reading.number}</span>
          </p>
        </div>

        {/* ------------------------------------------------------ expanded -- */}
        {open && (
          <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-3 space-y-3">
            {/* CAPTURED */}
            <div>
              <SectionLabel icon={Database}>Captured by this action</SectionLabel>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {captured.length ? (
                  captured.map((c) => <Pill key={c.label} label={c.label} value={c.value} />)
                ) : (
                  <span className="text-[10.5px] text-slate-400 italic">Nothing beyond the event itself</span>
                )}
              </div>
            </div>

            {/* INFERRED */}
            {derived.length > 0 && (
              <div>
                <SectionLabel icon={Sparkles} tone="text-sky-600">
                  Derived without being asked
                </SectionLabel>
                <ul className="mt-1.5 space-y-0.5">
                  {derived.map((d) => (
                    <li key={d} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-sky-400 shrink-0" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* MOVED */}
            <div>
              <SectionLabel icon={TrendingUp} tone="text-straive-600">
                Moved in the profile
              </SectionLabel>
              <div className="mt-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1">
                {writes.length ? (
                  writes
                    .slice(0, 8)
                    .map((w) => (
                      <Write
                        key={w.path}
                        path={w.path}
                        before={w.before}
                        after={w.after}
                        contribution={w.contribution}
                        label={w.label}
                      />
                    ))
                ) : (
                  <p className="text-[10.5px] text-slate-400 italic py-1">
                    No field moved. The evidence agreed with what was already believed, which is a
                    result and not an absence of one.
                  </p>
                )}
                {writes.length > 8 && (
                  <p className="text-[9.5px] text-slate-400 py-1 border-t border-slate-100">
                    and {writes.length - 8} more, all in the Signals tab
                  </p>
                )}
              </div>
              {slots.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {slots.map((s) => (
                    <span
                      key={s}
                      className="text-[9.5px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5"
                    >
                      {SLOT_LABEL[s]}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* RENDERED */}
            <div>
              <SectionLabel icon={Layout} tone="text-emerald-600">
                Rendered on the storefront
              </SectionLabel>
              <div className="mt-1.5 space-y-1">
                {decision.surfaces.length ? (
                  decision.surfaces.map((s) => (
                    <div
                      key={s.surface}
                      className={`px-2 py-1.5 rounded-lg border ${
                        s.isFallback ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
                      }`}
                    >
                      <span className="text-[10.5px] font-bold text-ink-900">{s.surface}</span>
                      <span className="text-[10.5px] text-slate-600"> — {s.detail}</span>
                      {s.isFallback && (
                        <span className="ml-1 text-[9px] font-bold uppercase text-amber-700">default order</span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-[10.5px] text-slate-400 italic">
                    Nothing re-rendered. Not every action changes the page.
                  </p>
                )}
              </div>
            </div>

            {/* REFUSED */}
            {decision.withheld && decision.withheld.count > 0 && (
              <div>
                <SectionLabel icon={Ban} tone="text-rose-600">
                  Refused by the gate
                </SectionLabel>
                <div className="mt-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
                  <p className="text-[10.5px] text-rose-900">
                    {decision.withheld.count} product{decision.withheld.count === 1 ? '' : 's'} withheld
                    {decision.withheld.emptied > 0
                      ? `, and ${decision.withheld.emptied} slot${decision.withheld.emptied === 1 ? '' : 's'} left empty rather than filled with something worse`
                      : ''}
                    .
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {decision.withheld.rules.map((r) => (
                      <span
                        key={r.rule}
                        className="text-[9.5px] font-semibold text-rose-800 bg-white border border-rose-200 rounded px-1.5 py-0.5"
                      >
                        {r.label} · {r.count}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* WHAT RAN */}
            {decision.models.length > 0 && (
              <div>
                <SectionLabel icon={Zap} tone="text-slate-500">
                  Models that re-scored
                </SectionLabel>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {decision.models.map((m) => (
                    <span
                      key={m.engine + m.question}
                      title={m.verdict}
                      className="text-[9.5px] font-semibold text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-0.5"
                    >
                      {m.engine}
                      {m.latencyMs !== undefined && (
                        <span className="ml-1 font-mono text-slate-400">{m.latencyMs}ms</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------- screen -- */

export const CustomerJourneyScreen: React.FC = () => {
  const {
    decisions,
    eventCaptures,
    visitorModel,
    captureLedger,
    completeness,
    identityState,
    selectedScenario,
    setJourneyTab,
    resetNonce,
    visitorProfile,
  } = useApp();

  // Oldest first. A journey read newest-first is a log; read oldest-first it is
  // a story, and the arrival block at the top is where the story starts.
  const ordered = useMemo(() => [...decisions].sort((a, b) => a.seq - b.seq), [decisions]);

  const captureByEvent = useMemo(() => {
    const m = new Map<string, EventCapture>();
    for (const c of eventCaptures) m.set(c.eventId, c);
    return m;
  }, [eventCaptures]);

  const [openId, setOpenId] = useState<string | null>(null);

  // The newest step opens itself, so the screen always shows the thing that just
  // happened rather than making the presenter click for it.
  const newestId = ordered[ordered.length - 1]?.id ?? null;
  useEffect(() => setOpenId(newestId), [newestId]);
  useEffect(() => setOpenId(null), [resetNonce]);

  const totals = useMemo(() => {
    let fields = captureLedger.fields.filter((f) => f.basis !== 'withheld').length;
    let writes = 0;
    for (const d of ordered) {
      fields += captureByEvent.get(d.eventId ?? '')?.captured.length ?? 0;
      writes += d.writes.length;
    }
    return { fields, writes };
  }, [ordered, captureByEvent, captureLedger]);

  return (
    <div className="p-4 sm:p-5 bg-slate-50 min-h-full">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* ------------------------------------------------------ heading -- */}
        <div>
          <h2 className="text-[17px] font-bold text-ink-900 font-display">
            {selectedScenario.name}, step by step
          </h2>
          <p className="text-[12px] text-slate-600 mt-1 leading-relaxed max-w-3xl">
            What each action added to the record, what it moved in the profile, and what the shopper
            saw because of it. Every number here is read from the decision journal and the fold's own
            delta log, so this screen and the engine rail cannot disagree.
          </p>
        </div>

        {/* -------------------------------------------------------- totals -- */}
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[120px] bg-white border border-slate-200 rounded-lg px-3 py-2">
            <div className="text-[20px] font-bold text-ink-900 leading-none font-display">{totals.fields}</div>
            <div className="text-[10.5px] font-bold text-slate-700 mt-1">Fields captured</div>
            <div className="text-[9.5px] text-slate-500">arrival plus every action since</div>
          </div>
          <div className="flex-1 min-w-[120px] bg-white border border-slate-200 rounded-lg px-3 py-2">
            <div className="text-[20px] font-bold text-straive-600 leading-none font-display">{totals.writes}</div>
            <div className="text-[10.5px] font-bold text-slate-700 mt-1">Profile writes</div>
            <div className="text-[9.5px] text-slate-500">every one reversible and logged</div>
          </div>
          <div className="flex-1 min-w-[120px] bg-white border border-slate-200 rounded-lg px-3 py-2">
            <div className="text-[20px] font-bold text-emerald-600 leading-none font-display">
              {completeness.percent}%
            </div>
            <div className="text-[10.5px] font-bold text-slate-700 mt-1">Profile complete</div>
            <div className="text-[9.5px] text-slate-500">weighted, not a field count</div>
          </div>
          <div className="flex-1 min-w-[120px] bg-white border border-slate-200 rounded-lg px-3 py-2">
            <div className="text-[20px] font-bold text-ink-900 leading-none font-display capitalize">
              {identityState}
            </div>
            <div className="text-[10.5px] font-bold text-slate-700 mt-1">Identity rung</div>
            <div className="text-[9.5px] text-slate-500">{visitorProfile.observedEvents} events folded</div>
          </div>
        </div>

        {/* ------------------------------------------------------- step nil -- */}
        <div className="relative pl-8">
          <span className="absolute left-[11px] top-6 bottom-[-14px] w-px bg-slate-200" />
          <span className="absolute left-[5px] top-3 h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm bg-straive-300" />
          <button
            onClick={() => setJourneyTab('arrival')}
            className="w-full text-left bg-white border border-slate-200 rounded-xl px-3 py-2.5 hover:border-straive-300 hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Fingerprint className="h-3.5 w-3.5 text-straive-500 shrink-0" />
              <span className="text-[12px] font-bold text-ink-900">Before the first click</span>
              <span className="text-[10px] text-slate-500">
                {captureLedger.actingCount} of {captureLedger.fields.length} arrival fields acted
              </span>
            </span>
            <span className="block text-[11px] text-slate-600 mt-1 leading-relaxed">
              The request itself was read and folded as evidence: the market from the timezone, the
              channel from the referrer, the intent from the campaign tag. Open the arrival ledger to
              see every field and where it came from.
            </span>
          </button>
        </div>

        {/* --------------------------------------------------------- steps -- */}
        <div className="space-y-3.5">
          {ordered.length === 0 && (
            <div className="relative pl-8">
              <span className="absolute left-[5px] top-3 h-3.5 w-3.5 rounded-full border-2 border-white bg-slate-300" />
              <div className="bg-white border border-dashed border-slate-300 rounded-xl px-3 py-4">
                <p className="text-[11.5px] text-slate-500 leading-relaxed">
                  Nothing has happened yet in this session. Open the storefront and click something -
                  a category, a product, a filter - and each action will appear here with the fields
                  it captured and the beliefs it moved.
                </p>
              </div>
            </div>
          )}
          {ordered.map((d, i) => (
            <Step
              key={d.id}
              decision={d}
              capture={d.eventId ? captureByEvent.get(d.eventId) : undefined}
              slots={d.eventId ? slotsMovedBy(visitorModel, d.eventId) : []}
              open={openId === d.id}
              onToggle={() => setOpenId((cur) => (cur === d.id ? null : d.id))}
              isLast={i === ordered.length - 1}
            />
          ))}
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed flex items-start gap-1.5">
          <Radio className="h-3 w-3 mt-0.5 shrink-0" />
          The journal keeps the last forty beats. Slots are marked as moved by reading the field the
          fold stamped with the event id, not by re-deriving the movement here - so a step that shows
          no movement genuinely caused none.
        </p>
      </div>
    </div>
  );
};
