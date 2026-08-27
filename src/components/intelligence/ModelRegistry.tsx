/**
 * Model Registry.
 *
 * The question this screen answers is the one a client's data science team asks
 * about ninety seconds after the storefront demo lands: what is actually
 * running, what does each thing write, what bar does it have to clear, and how
 * would we know if it broke.
 *
 * Everything on a row is READ from the module that enforces it. No threshold is
 * typed twice: the activation column pulls `CONFIDENCE_THRESHOLD` out of
 * ml/intent, the surface bars out of `SURFACE_POLICIES`, the prefill floor out
 * of ml/fit. A registry that keeps its own copy of the numbers is a document,
 * and documents drift. This one cannot - if somebody changes a bar, this screen
 * changes with it or the build fails.
 *
 * FOUR COLUMNS THAT ARE USUALLY MISSING FROM A MODEL INVENTORY, and are here:
 *
 *   WRITES        the profile field this model owns. Several cards say "nothing"
 *                 and that is the point - a retrieval engine reads the profile
 *                 and writes none of it, and a registry that implies otherwise
 *                 is how two models end up fighting over one field.
 *   DECAY         the constant on that field, with its half-life in events. A
 *                 model that writes a field and does not state its decay has
 *                 not said how long its evidence is good for.
 *   METRIC        read live off the offline harness, on demand, not baked in.
 *                 Four cards have no metric and each says WHY - that column is
 *                 never blank, because "no number" and "we did not look" are
 *                 different admissions.
 *   LAST FIRED    in this session, from the decision journal for the engines and
 *                 from the effort ledger for the gates. One function, one
 *                 definition; see `lastFiredFor` in ml/registry.ts.
 *
 * Rows expand to the live feature vector - the actual values this model is
 * reading out of the profile right now, each with the path it came from.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ChevronRight,
  Database,
  FileCode2,
  Loader2,
  Play,
  Timer,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FAMILY_LABEL, MODEL_CARDS, featureVectorFor, lastFiredFor } from '../../ml/engine';
import type { FeatureRow, ModelCard, ModelFamily } from '../../ml/engine';
import { EvaluationReport, runEvaluation } from '../../ml/evaluate';

const FAMILY_STYLE: Record<ModelFamily, string> = {
  inference: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  retrieval: 'bg-sky-50 text-sky-800 border-sky-200',
  ranking: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  gate: 'bg-rose-50 text-rose-800 border-rose-200',
  interpretation: 'bg-amber-50 text-amber-900 border-amber-200',
  orchestration: 'bg-straive-50 text-straive-800 border-straive-200',
};

/** How many evaluation samples the on-demand run uses. */
const EVAL_SAMPLE = 400;

export const ModelRegistry: React.FC = () => {
  const { visitorProfile, journal, effortLedger, isPersonalizationOn, facetModel, captureLedger } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [running, setRunning] = useState(false);

  /*
   * "Last fired" from two sources, joined on the event.
   *
   * The journal numbers its beats; the effort ledger records the event id that
   * caused each row but not the step. Joining them on the event id means a
   * ledger-reported model shows the same step number as a journal-reported one,
   * so the column is comparable down its whole length rather than being two
   * different scales sharing a heading.
   */
  const fired = useMemo(() => {
    const stepOfEvent = new Map<string, number>();
    for (const b of journal) if (b.eventId) stepOfEvent.set(b.eventId, b.seq);

    const journalRows = journal.flatMap((b) =>
      b.runs.map((r) => ({ engine: r.engine as string, step: b.seq, label: b.headline }))
    );

    // Two models leave no journal beat of their own. The facet model records the
    // event that last moved it, and the context reader runs exactly once, at
    // arrival - so both are turned into rows here rather than being left as
    // permanently unfired cards on a screen whose whole point is observation.
    if (facetModel.lastUpdatedByEvent) {
      const step = stepOfEvent.get(facetModel.lastUpdatedByEvent);
      const beat = journal.find((b) => b.eventId === facetModel.lastUpdatedByEvent);
      if (step !== undefined) journalRows.push({ engine: 'facet', step, label: beat?.headline ?? 'filter applied' });
    }
    if (captureLedger.actingCount > 0) {
      journalRows.push({ engine: 'context', step: 0, label: 'read on arrival, before the first click' });
    }
    const ledgerRows = effortLedger.entries.map((e) => ({
      kind: e.kind as string,
      surface: e.surface,
      step: (e.eventId ? stepOfEvent.get(e.eventId) : undefined) ?? 0,
      label: e.label,
    }));
    return lastFiredFor(journalRows, ledgerRows);
  }, [journal, effortLedger, facetModel, captureLedger]);

  const run = useCallback(async () => {
    setRunning(true);
    // Yield once so the spinner paints before the harness blocks the thread.
    await new Promise((r) => setTimeout(r, 30));
    try {
      setReport(runEvaluation(EVAL_SAMPLE));
    } finally {
      setRunning(false);
    }
  }, []);

  const withMetric = MODEL_CARDS.filter((c) => c.metric).length;

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6 space-y-4">
      {/* Header. */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-lg font-black tracking-tight">Model Registry</h1>
            <p className="mt-1 max-w-3xl text-[11.5px] leading-snug text-slate-300">
              Every model in the build, with the profile field it owns, the decay on that field, the bar it must
              clear, its current offline number, and when it last ran in this session. Thresholds are read from the
              modules that enforce them. Nothing on this screen is a second copy of a number.
            </p>
          </div>
          <button
            onClick={run}
            disabled={running}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-straive-500 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-white hover:bg-straive-600 disabled:opacity-60"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {running ? 'Running harness' : report ? 'Re-run harness' : 'Run offline harness'}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Models registered" value={String(MODEL_CARDS.length)} />
          <Stat label="With an offline metric" value={`${withMetric} of ${MODEL_CARDS.length}`} />
          <Stat label="Fired this session" value={String(Object.keys(fired).length)} />
          <Stat
            label="Personalization"
            value={isPersonalizationOn ? 'ON' : 'OFF'}
            tone={isPersonalizationOn ? 'good' : 'warn'}
          />
        </div>

        {!report && (
          <p className="mt-2.5 text-[10px] leading-snug text-slate-400">
            The metric column is empty until the harness runs. It is not baked in at build time. A table of numbers
            shipped in a file is not evidence, and one that a reviewer can re-run at a different sample size is.
          </p>
        )}
      </div>

      {/* Column key, once, so the rows can stay dense. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ['Writes', 'The profile field this model owns'],
          ['Decay', 'λ on that field, and its half-life in events'],
          ['Activation', 'The bar, and the distribution it lives in'],
          ['Metric', 'Live from the offline harness, or why there is none'],
          ['Last fired', 'Step in this session, from journal or ledger'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
            <div className="text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-400">{k}</div>
            <div className="text-[9.5px] leading-snug text-slate-600">{v}</div>
          </div>
        ))}
      </div>

      {/* The registry. */}
      <div className="space-y-2">
        {MODEL_CARDS.map((card) => (
          <RegistryRow
            key={card.id}
            card={card}
            open={openId === card.id}
            onToggle={() => setOpenId((v) => (v === card.id ? null : card.id))}
            report={report}
            fired={fired[card.id] ?? null}
            vector={featureVectorFor(card, visitorProfile)}
          />
        ))}
      </div>

      <p className="px-1 pb-2 text-[9.5px] leading-snug text-slate-400">
        Every model here is trained on, or defined over, a synthetic catalog and a simulated population. The
        architecture, the thresholds and the arithmetic are real and runnable; the data underneath is invented, and
        no number on this screen should be quoted as a market figure.
      </p>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; tone?: 'good' | 'warn' }> = ({ label, value, tone }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5">
    <div className="text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
    <div
      className={`font-display text-[15px] font-extrabold tabular-nums ${
        tone === 'warn' ? 'text-amber-400' : tone === 'good' ? 'text-emerald-400' : 'text-white'
      }`}
    >
      {value}
    </div>
  </div>
);

interface RowProps {
  card: ModelCard;
  open: boolean;
  onToggle: () => void;
  report: EvaluationReport | null;
  fired: { step: number; label: string } | null;
  vector: FeatureRow[];
}

const RegistryRow: React.FC<RowProps> = ({ card, open, onToggle, report, fired, vector }) => {
  const metricRow = report && card.metric ? card.metric.read(report) : null;
  const baselineRow = report && card.metric?.baseline ? card.metric.baseline(report) : null;
  const headline = card.metric?.headline ?? 'recallAt3';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button onClick={onToggle} className="w-full px-3 py-2.5 text-left hover:bg-slate-50">
        <div className="flex items-start gap-2.5">
          <ChevronRight
            className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] font-extrabold text-slate-900">{card.name}</span>
              <span
                className={`rounded border px-1 py-px text-[8.5px] font-black uppercase tracking-wider ${FAMILY_STYLE[card.family]}`}
              >
                {FAMILY_LABEL[card.family]}
              </span>
              <span className="rounded border border-slate-200 bg-slate-50 px-1 py-px font-mono text-[9px] font-bold text-slate-500">
                {card.version}
              </span>
            </div>
            <p className="mt-0.5 text-[10.5px] leading-snug text-slate-600">{card.purpose}</p>

            {/* The five columns, on one line at width and stacked below it. */}
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-5">
              <Cell label="Writes">
                {card.writes ? (
                  <span className="font-mono text-[9.5px] text-slate-800">{card.writes}</span>
                ) : (
                  <span className="text-[9.5px] italic text-slate-400">nothing</span>
                )}
              </Cell>

              <Cell label="Decay">
                {card.decay ? (
                  <span className="font-mono text-[9.5px] tabular-nums text-slate-800">
                    λ {card.decay.lambda}
                    {card.decay.halfLifeEvents !== null && (
                      <span className="text-slate-400"> · t½ {card.decay.halfLifeEvents.toFixed(1)}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-[9.5px] italic text-slate-400">no state</span>
                )}
              </Cell>

              <Cell label="Activation">
                {card.activation ? (
                  <span className="font-mono text-[9.5px] tabular-nums text-slate-800">
                    ≥ {card.activation.threshold}
                    <span className="text-slate-400"> {card.activation.scale}</span>
                  </span>
                ) : (
                  <span className="text-[9.5px] italic text-slate-400">always on</span>
                )}
              </Cell>

              <Cell label="Metric">
                {metricRow ? (
                  <span className="font-mono text-[9.5px] tabular-nums text-slate-800">
                    {(metricRow[headline] * 100).toFixed(1)}%
                    {baselineRow && (
                      <span className="text-slate-400"> vs {(baselineRow[headline] * 100).toFixed(1)}%</span>
                    )}
                  </span>
                ) : card.metric ? (
                  <span className="text-[9.5px] italic text-slate-400">run the harness</span>
                ) : (
                  <span className="flex items-center gap-1 text-[9.5px] text-amber-700">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    none, see below
                  </span>
                )}
              </Cell>

              <Cell label="Last fired">
                {fired ? (
                  <span className="flex items-center gap-1 font-mono text-[9.5px] tabular-nums text-emerald-700">
                    <Activity className="h-3 w-3 shrink-0" />
                    step {fired.step}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[9.5px] text-slate-400">
                    <Timer className="h-3 w-3 shrink-0" />
                    not yet
                  </span>
                )}
              </Cell>
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-3 py-3">
          {/* Inputs. */}
          <Section title="Inputs">
            <div className="flex flex-wrap gap-1">
              {card.inputs.map((i) => (
                <span
                  key={i}
                  className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[9.5px] text-slate-700"
                >
                  {i}
                </span>
              ))}
            </div>
          </Section>

          {/* The live feature vector - the point of the expansion. */}
          <Section title="Live feature vector">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              {vector.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className={`flex items-baseline gap-2 px-2 py-1 ${i > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  <span className="w-40 shrink-0 truncate font-mono text-[10px] font-bold text-slate-700">
                    {f.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-900">
                    {f.value === null
                      ? 'n/a'
                      : typeof f.value === 'number'
                        ? f.unit === 'probability'
                          ? f.value.toFixed(4)
                          : f.unit === 'lambda'
                            ? f.value.toFixed(3)
                            : String(f.value)
                        : f.value}
                  </span>
                  {f.unit && f.unit !== 'text' && (
                    <span className="shrink-0 rounded bg-slate-100 px-1 text-[8.5px] font-bold uppercase tracking-wide text-slate-500">
                      {f.unit}
                    </span>
                  )}
                  <span className="ml-auto min-w-0 truncate text-right font-mono text-[9px] text-slate-400">
                    {f.source}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[9px] leading-snug text-slate-400">
              Read from the live profile at this instant. Click through the storefront with this screen open in a
              second window and these move.
            </p>
          </Section>

          {/* Thresholds and metrics, in words. */}
          {card.activation && (
            <Section title="Activation">
              <p className="text-[10.5px] leading-snug text-slate-600">{card.activation.note}</p>
            </Section>
          )}

          <Section title={card.metric ? 'Offline metric' : 'Why there is no offline metric'}>
            {card.metric && metricRow ? (
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10.5px] font-bold text-slate-800">{card.metric.label}</span>
                  <span className="font-mono text-[11px] font-black tabular-nums text-slate-900">
                    {(metricRow[headline] * 100).toFixed(1)}%
                  </span>
                  {baselineRow && (
                    <span className="font-mono text-[10px] tabular-nums text-slate-500">
                      baseline {(baselineRow[headline] * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="text-[9.5px] leading-snug text-slate-400">
                  Measured now, over {EVAL_SAMPLE} held-out samples, against the same synthetic population every
                  other screen reads. See Model Evidence for the full table and its caveats.
                </p>
              </div>
            ) : card.metric ? (
              <p className="text-[10.5px] leading-snug text-slate-500">
                {card.metric.label}. Run the harness above to fill this in.
              </p>
            ) : (
              <p className="text-[10.5px] leading-snug text-slate-600">{card.metricAbsentReason}</p>
            )}
          </Section>

          {/* Where it fired, and where it lives. */}
          <Section title="This session">
            {fired ? (
              <p className="text-[10.5px] leading-snug text-slate-600">
                Last ran at step <span className="font-mono font-bold">{fired.step}</span> · {fired.label}.{' '}
                {card.engine ? 'Traced in the decision journal.' : 'Reported through the effort ledger.'}
              </p>
            ) : (
              <p className="text-[10.5px] leading-snug text-slate-500">
                Has not run yet this session.{' '}
                {card.engine
                  ? 'It appears in the decision journal as its own step when it does.'
                  : 'It reports through the surface it acts on, and writes a row to the effort ledger when it fires.'}
              </p>
            )}
          </Section>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
            <span className="flex items-center gap-1 font-mono text-[9.5px] text-slate-500">
              <FileCode2 className="h-3 w-3 shrink-0" />
              {card.source}
            </span>
            {card.writes && (
              <span className="flex items-center gap-1 font-mono text-[9.5px] text-slate-500">
                <Database className="h-3 w-3 shrink-0" />
                {card.writes}
              </span>
            )}
          </div>

          <p className="text-[10px] leading-snug text-slate-500">{card.note}</p>
        </div>
      )}
    </div>
  );
};

const Cell: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <div className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
    <div className="truncate">{children}</div>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="mb-1 text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-400">{title}</div>
    {children}
  </div>
);
