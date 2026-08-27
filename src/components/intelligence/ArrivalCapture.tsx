/**
 * What the store knew before the shopper did anything.
 *
 * WHY THIS SCREEN EXISTS
 * ----------------------
 * The engine has read the arriving request since the identity ladder landed:
 * a timezone becomes a market, a referrer becomes a channel, a campaign tag
 * becomes a stated intent, and all three are folded into the profile as evidence
 * before the first click. None of it was ever on screen. The demo opened with a
 * visitor who already believed things and no account of where those beliefs came
 * from, which leaves the first question any audience asks unanswered: what do
 * you actually know about me, right now, before I have done anything?
 *
 * THE ANSWER IS A LEDGER, NOT A PARAGRAPH
 * ---------------------------------------
 * Every row names the field, how it was obtained, what was inferred from it and
 * which slot that inference moved. Rows with no inference are kept and shown as
 * such: a field collected and unused is the honest state of most fields in most
 * real stacks, and hiding those would make this a marketing page.
 *
 * THE FOUR BADGES ARE THE WHOLE ARGUMENT
 * --------------------------------------
 * Read is genuinely read from this browser and can be checked in the console.
 * Derived is computed from a read field by a named function in this build.
 * Simulated is invented, deterministically, because the prototype makes no
 * network call and therefore has no IP lookup, no identity graph and no CRM.
 * Withheld is available one rung up the ladder and deliberately not held here.
 *
 * The withheld count is the number worth quoting in a privacy conversation, and
 * it is why the rung selector sits at the top of this screen: promoting the
 * shopper turns greyed rows into live ones in front of the viewer, which argues
 * for the ladder better than any diagram of it.
 */

import React, { useMemo, useState } from 'react';
import {
  Antenna,
  Check,
  Cookie,
  Database,
  Eye,
  EyeOff,
  Fingerprint,
  Globe,
  Link2,
  Lock,
  Monitor,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CAPTURE_GROUPS, BASIS_NOTE } from '../../state/capture';
import type { CaptureBasis, CaptureGroup, CapturedField } from '../../state/capture';
import { IDENTITY_LADDER, IDENTITY_RUNGS } from '../../ml/engine';
import { SLOT_LABEL } from '../../state/visitorModel';
import type { SlotId } from '../../state/visitorModel';

const GROUP_ICON: Record<CaptureGroup, React.ElementType> = {
  referral: Link2,
  network: Globe,
  device: Monitor,
  timing: Timer,
  storage: Cookie,
  account: Database,
};

const BASIS_STYLE: Record<CaptureBasis, { label: string; cls: string }> = {
  read: { label: 'Read', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  derived: { label: 'Derived', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  simulated: { label: 'Simulated', cls: 'bg-straive-50 text-straive-700 border-straive-200' },
  withheld: { label: 'Withheld', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const BasisChip: React.FC<{ basis: CaptureBasis }> = ({ basis }) => {
  const s = BASIS_STYLE[basis];
  return (
    <span
      title={BASIS_NOTE[basis]}
      className={`shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${s.cls}`}
    >
      {s.label}
    </span>
  );
};

const SlotChip: React.FC<{ id: string }> = ({ id }) => (
  <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-straive-700 bg-straive-50 border border-straive-200 rounded px-1.5 py-0.5">
    <TrendingUp className="h-2.5 w-2.5" />
    {SLOT_LABEL[id as SlotId] ?? id}
  </span>
);

const Row: React.FC<{ field: CapturedField }> = ({ field }) => {
  const dim = field.basis === 'withheld';
  return (
    <div
      className={`px-3 py-2.5 border-t border-slate-100 first:border-t-0 ${
        dim ? 'bg-slate-50/60' : 'bg-white'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-bold ${dim ? 'text-slate-400' : 'text-slate-700'}`}>
              {field.label}
            </span>
            <BasisChip basis={field.basis} />
          </div>
          <p
            className={`mt-0.5 text-[12px] font-mono break-words ${
              dim ? 'text-slate-400 italic' : 'text-ink-900'
            }`}
          >
            {field.value}
          </p>
        </div>
      </div>

      {field.inference ? (
        <div className="mt-1.5 pl-3 border-l-2 border-straive-200 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] text-slate-600 leading-snug">{field.inference}</span>
          {field.weight !== null && (
            <span className="text-[9.5px] font-mono font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1 py-px">
              worth {field.weight} event{field.weight === 1 ? '' : 's'}
            </span>
          )}
          {field.slots.map((s) => (
            <SlotChip key={s} id={s} />
          ))}
        </div>
      ) : (
        <div className="mt-1.5 pl-3 border-l-2 border-slate-200">
          <span className="text-[10.5px] text-slate-400 italic">
            Held, and nothing is inferred from it
          </span>
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ n: number; label: string; note: string; tone: string }> = ({ n, label, note, tone }) => (
  <div className="flex-1 min-w-[130px] bg-white border border-slate-200 rounded-lg px-3 py-2">
    <div className={`text-[20px] font-bold leading-none font-display ${tone}`}>{n}</div>
    <div className="text-[10.5px] font-bold text-slate-700 mt-1">{label}</div>
    <div className="text-[9.5px] text-slate-500 leading-snug mt-0.5">{note}</div>
  </div>
);

export const ArrivalCapture: React.FC = () => {
  const {
    captureLedger,
    identityState,
    promoteTo,
    contextIsSimulated,
    visitorProfile,
    completeness,
  } = useApp();
  const [showWithheld, setShowWithheld] = useState(true);

  const grouped = useMemo(() => {
    const out = new Map<CaptureGroup, CapturedField[]>();
    for (const f of captureLedger.fields) {
      if (!showWithheld && f.basis === 'withheld') continue;
      const list = out.get(f.group) ?? [];
      list.push(f);
      out.set(f.group, list);
    }
    return out;
  }, [captureLedger, showWithheld]);

  return (
    <div className="p-4 sm:p-5 bg-slate-50 min-h-full">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* ------------------------------------------------------ heading -- */}
        <div>
          <h2 className="text-[17px] font-bold text-ink-900 font-display flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-straive-500" />
            What was known on arrival
          </h2>
          <p className="text-[12px] text-slate-600 mt-1 leading-relaxed max-w-3xl">
            The shopper has not clicked anything yet. Everything below was captured from the request
            itself, and every row says how it was obtained and what the engine did with it. The
            profile is already {completeness.percent}% complete before the first interaction, and
            these {captureLedger.fields.length} fields are the reason.
          </p>
        </div>

        {/* -------------------------------------------------------- counts -- */}
        <div className="flex flex-wrap gap-2">
          <Stat
            n={captureLedger.readCount}
            label="Read from the browser"
            note="Verifiable in the console right now"
            tone="text-emerald-600"
          />
          <Stat
            n={captureLedger.actingCount}
            label="Fields that acted"
            note="Moved a slot or changed what rendered"
            tone="text-straive-600"
          />
          <Stat
            n={captureLedger.simulatedCount}
            label="Simulated"
            note="No network call, so no lookup exists"
            tone="text-slate-600"
          />
          <Stat
            n={captureLedger.withheldCount}
            label="Withheld at this rung"
            note="Available higher up, deliberately not held"
            tone="text-slate-400"
          />
        </div>

        {/* ---------------------------------------------------------- rung -- */}
        <div className="bg-ink-950 rounded-xl p-3.5 text-white">
          <div className="flex items-start gap-2">
            <Lock className="h-3.5 w-3.5 text-straive-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-[12px] font-bold">The rung decides which rows exist</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Move the shopper up the ladder and watch the greyed rows below become live ones. This
                is the honest version of the privacy conversation: not what a store could technically
                collect, but what it is holding on this visitor at this moment.
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {IDENTITY_LADDER.map((rung) => {
              const meta = IDENTITY_RUNGS[rung];
              const on = identityState === rung;
              return (
                <button
                  key={rung}
                  onClick={() => promoteTo(rung)}
                  title={`${meta.basis}. Adds: ${meta.adds}`}
                  className={`px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                    on
                      ? 'bg-straive-500 border-straive-400 text-white'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="block text-[10.5px] font-bold">{meta.label}</span>
                  <span className={`block text-[9px] ${on ? 'text-white/80' : 'text-slate-500'}`}>
                    {meta.basis}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* -------------------------------------------------- the disclaimer -- */}
        {contextIsSimulated && (
          <div className="flex items-start gap-2 bg-straive-50 border border-straive-200 rounded-lg px-3 py-2">
            <Antenna className="h-3.5 w-3.5 text-straive-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-straive-900 leading-relaxed">
              This machine arrived with no referrer and no campaign, which is the honest reading of
              most laptops in most rooms and makes a poor demonstration of a rung whose whole subject
              is context. The referral block below is therefore a worked arrival, marked simulated.
              Open this build with{' '}
              <code className="font-mono bg-white border border-straive-200 rounded px-1">
                ?utm_campaign=eagles-playoff-jersey-drop
              </code>{' '}
              to see the real thing read instead.
            </p>
          </div>
        )}

        {/* ------------------------------------------------------ the toggle -- */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            The capture ledger
          </span>
          <button
            onClick={() => setShowWithheld((v) => !v)}
            className="flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-full px-2.5 py-1 hover:bg-slate-100 transition-colors"
          >
            {showWithheld ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showWithheld ? 'Hide withheld fields' : `Show ${captureLedger.withheldCount} withheld fields`}
          </button>
        </div>

        {/* ------------------------------------------------------ the ledger -- */}
        <div className="space-y-3">
          {CAPTURE_GROUPS.map((g) => {
            const rows = grouped.get(g.id);
            if (!rows?.length) return null;
            const Icon = GROUP_ICON[g.id];
            const acting = rows.filter((r) => r.inference && r.basis !== 'withheld').length;
            return (
              <section key={g.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <header className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[11.5px] font-bold text-ink-900">{g.label}</h3>
                    <p className="text-[10px] text-slate-500 leading-snug">{g.note}</p>
                  </div>
                  <span className="shrink-0 text-[9.5px] font-mono text-slate-500 bg-white border border-slate-200 rounded px-1.5 py-0.5">
                    {acting} of {rows.length} acting
                  </span>
                </header>
                <div>
                  {rows.map((f) => (
                    <Row key={f.id} field={f} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* -------------------------------------------------- what it bought -- */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <h3 className="text-[12px] font-bold text-ink-900 flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            What the arrival bought, in the profile
          </h3>
          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
            The fold has seen {visitorProfile.observedEvents} events. Everything above arrived before
            the first one of them, which is why the storefront can open on something other than
            global popularity.
          </p>
          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Club</div>
              <div className="text-[12px] font-bold text-ink-900 mt-0.5">
                {visitorProfile.affinities.team.top}
              </div>
              <div className="text-[9.5px] font-mono text-slate-500">
                {(visitorProfile.affinities.team.confidence.value * 100).toFixed(0)}% confident
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Category</div>
              <div className="text-[12px] font-bold text-ink-900 mt-0.5">
                {visitorProfile.affinities.department.top}
              </div>
              <div className="text-[9.5px] font-mono text-slate-500">
                {(visitorProfile.affinities.department.confidence.value * 100).toFixed(0)}% confident
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Region seed</div>
              <div className="text-[12px] font-bold text-ink-900 mt-0.5">
                {visitorProfile.traits.region.value ?? 'none'}
              </div>
              <div className="text-[9.5px] font-mono text-slate-500">does not decay</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Completeness</div>
              <div className="text-[12px] font-bold text-straive-600 mt-0.5">{completeness.percent}%</div>
              <div className="text-[9.5px] font-mono text-slate-500">weighted, {completeness.fields.length} fields</div>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed">
          No fingerprint is assembled anywhere in this build. Read individually the device fields are
          coarse; hashed together they would identify a device across sites, and a store with a
          first-party cookie has no use for that. Simulated values are seeded from the visitor id, so
          they are stable across a reload and are not real addresses.
        </p>
      </div>
    </div>
  );
};
