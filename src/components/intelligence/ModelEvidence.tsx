/**
 * Model Evidence screen.
 *
 * Every other screen in this prototype asserts that the engines work. This one
 * is where that assertion gets checked, live, in the browser: it runs the
 * offline harness in src/ml/evaluate.ts against held-out data and prints what
 * comes back - including the result that is not flattering.
 *
 * Two deliberate choices:
 *
 *  - The evaluation runs on demand rather than shipping a table of numbers
 *    baked in at build time. A reviewer can change the sample size and watch
 *    the figures move, which is much harder to fake than a screenshot.
 *  - Each engine's caveat sits in the same card as its numbers, not in a
 *    footnote. The complement engine lost ground to its own baseline, and the
 *    card says so next to the bar that shows it.
 *
 * The Harness A / Harness B section is the third choice and the least
 * comfortable one. When the simulator gained a choice model and a session-level
 * department intent, the harness code did not change but the meaning of the
 * label it scores against did. The obvious move was to re-run and replace the
 * table. That would have shown department improving from 1.12x to 1.50x and
 * invited everyone to read it as the model getting better, when the model was
 * never touched. So both tables stay, both task definitions are stated, and the
 * retired one is labelled as a measurement of a world that no longer exists.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BadgeCheck,
  FlaskConical,
  Loader2,
  Play,
  ShieldAlert,
  SplitSquareHorizontal,
} from 'lucide-react';
import { EvaluationReport, MetricRow, runEvaluation } from '../../ml/evaluate';

type Accent = 'red' | 'indigo' | 'amber' | 'slate';

interface EnginePanel {
  key: string;
  title: string;
  engine: string;
  accent: Accent;
  /** What the model was asked to retrieve, and what it was scored against. */
  task: string;
  model: (r: EvaluationReport) => MetricRow;
  baseline: (r: EvaluationReport) => MetricRow;
  /** The honest read, written before the numbers were tuned - not after. */
  verdict: (r: EvaluationReport) => { tone: 'strong' | 'fair' | 'weak'; text: string };
}

const ACCENT: Record<Accent, { bar: string; text: string; chip: string; rule: string }> = {
  red: { bar: '#dc2626', text: 'text-red-600', chip: 'bg-red-50 text-red-900 border-red-200', rule: 'border-red-500' },
  indigo: {
    bar: '#4f46e5',
    text: 'text-indigo-600',
    chip: 'bg-indigo-50 text-indigo-900 border-indigo-200',
    rule: 'border-indigo-500',
  },
  amber: {
    bar: '#d97706',
    text: 'text-amber-600',
    chip: 'bg-amber-50 text-amber-900 border-amber-200',
    rule: 'border-amber-500',
  },
  slate: {
    bar: '#475569',
    text: 'text-slate-600',
    chip: 'bg-slate-100 text-slate-800 border-slate-300',
    rule: 'border-slate-400',
  },
};

const BASELINE_BAR = '#cbd5e1';

const PANELS: EnginePanel[] = [
  {
    key: 'team',
    title: 'Team Intent',
    engine: 'Intent Prediction Engine',
    accent: 'red',
    task: 'Predict which team a shopper buys from in their held-out session, using only their earlier sessions. Baseline: rank teams by global popularity.',
    model: (r) => r.intentTeam,
    baseline: (r) => r.intentTeamBaseline,
    verdict: () => ({
      tone: 'strong',
      text: 'Clearly ahead of popularity, and the recency-weighted sequence model is doing real work. The lift is lower than the retired harness reported (1.66x against 1.93x) and that is the baseline improving rather than the engine degrading - orders concentrate harder on the focus team now, which a rank-by-order-volume baseline collects more of than the model does.',
    }),
  },
  {
    key: 'similarity',
    title: 'Similarity',
    engine: 'Similarity Encoder',
    accent: 'indigo',
    task: 'Given one item viewed in the held-out session, retrieve the other items viewed alongside it. Baseline: popularity.',
    model: (r) => r.similarity,
    baseline: (r) => r.similarityBaseline,
    verdict: () => ({
      tone: 'strong',
      text: 'The strongest result, and the most meaningful, because the target is held-out behaviour rather than the metadata the embedding was built from. One caveat belongs next to it: absolute Recall@1 nearly doubled when the simulator gained session-level department intent, because sessions became homogeneous on both team and department - the two axes this embedding encodes. Part of that gain is the encoder re-reading structure the simulator made more obvious, not the encoder getting better.',
    }),
  },
  {
    key: 'complement',
    title: 'Complement',
    engine: 'Complement Cross-Sell',
    accent: 'amber',
    task: "Given the held-out basket's anchor item, retrieve the rest of that basket. Baseline: the most popular same-team item.",
    model: (r) => r.complement,
    baseline: (r) => r.complementBaseline,
    verdict: () => ({
      tone: 'weak',
      text: 'The weak one, and it got weaker: NDCG@10 lift fell from 1.37x to 1.11x when the choice model landed. The engine barely moved; its baseline improved. Cart adds are now driven by affinity, which concentrates purchase anchors on more popular items - exactly what a popularity baseline feeds on - while basket construction was left untouched, so the co-order graph gained little in exchange. This is the honest negative result on this screen and it is left standing rather than tuned away.',
    }),
  },
  {
    key: 'department',
    title: 'Department Intent',
    engine: 'Intent Prediction Engine',
    accent: 'slate',
    task: 'Predict which department a shopper buys from in their held-out session. Baseline: rank departments by global popularity.',
    model: (r) => r.intentDept,
    baseline: (r) => r.intentDeptBaseline,
    verdict: (r) => ({
      tone: 'strong',
      text: `Now the second-strongest engine at ${(r.intentDept.recallAt1 / Math.max(1e-9, r.intentDeptBaseline.recallAt1)).toFixed(2)}x Recall@1, having been the weakest at 1.12x under the retired harness. Nothing in the engine changed. The TARGET became learnable: a purchase anchor used to be drawn near-arbitrarily from the catalog's department mix and matched the shopper's own preferred department only 18.3% of the time, against 43.3% now that shoppers choose what they cart. The old number was measuring a broken question, not a broken model - and this one must not be reported as a modelling improvement. See the harness note below.`,
    }),
  },
];

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

const TONE_STYLE: Record<'strong' | 'fair' | 'weak', { label: string; className: string; Icon: typeof BadgeCheck }> = {
  strong: {
    label: 'Beats baseline',
    className: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    Icon: BadgeCheck,
  },
  fair: {
    label: 'Mixed - wins on depth',
    className: 'bg-amber-50 text-amber-900 border-amber-200',
    Icon: SplitSquareHorizontal,
  },
  weak: {
    label: 'Marginal - trails at R@3',
    className: 'bg-rose-50 text-rose-900 border-rose-200',
    Icon: AlertTriangle,
  },
};

const SAMPLE_SIZES = [500, 2000, 5000];

const EngineCard: React.FC<{ panel: EnginePanel; report: EvaluationReport }> = ({ panel, report }) => {
  const model = panel.model(report);
  const baseline = panel.baseline(report);
  const accent = ACCENT[panel.accent];
  const verdict = panel.verdict(report);
  const tone = TONE_STYLE[verdict.tone];

  // Recall@10 is omitted for the intent engines: with six teams and eight
  // departments the top ten is the whole list, so it is 100% by construction
  // for the model and the baseline alike and tells a reader nothing.
  const isSmallLabelSpace = panel.key === 'team' || panel.key === 'department';
  const data = [
    { metric: 'Recall@1', model: model.recallAt1, baseline: baseline.recallAt1 },
    { metric: 'Recall@3', model: model.recallAt3, baseline: baseline.recallAt3 },
    ...(isSmallLabelSpace ? [] : [{ metric: 'Recall@10', model: model.recallAt10, baseline: baseline.recallAt10 }]),
    { metric: 'NDCG@10', model: model.ndcgAt10, baseline: baseline.ndcgAt10 },
  ];

  const lift = (m: number, b: number) => (b > 0 ? m / b : 0);
  const liftChips = [
    { label: 'R@1', value: lift(model.recallAt1, baseline.recallAt1) },
    { label: 'NDCG@10', value: lift(model.ndcgAt10, baseline.ndcgAt10) },
  ];

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden border-t-4 ${accent.rule}`}>
      <div className="p-5 pb-3">
        <div className={`text-[11px] font-extrabold uppercase tracking-widest ${accent.text}`}>{panel.engine}</div>
        <h3 className="text-lg font-bold text-slate-900 mt-0.5">{panel.title}</h3>
        <p className="text-xs text-slate-600 leading-relaxed mt-2">{panel.task}</p>
      </div>

      <div className="px-2 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 4 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="metric" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              domain={[0, (max: number) => Math.min(1, Math.max(0.1, max * 1.2))]}
            />
            <Tooltip
              formatter={(v, name) => [pct(Number(v ?? 0)), name === 'model' ? 'Engine' : 'Baseline']}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend
              formatter={(value) => (
                <span className="text-[10px] text-slate-600">{value === 'model' ? 'Engine' : 'Baseline'}</span>
              )}
              iconSize={8}
              wrapperStyle={{ paddingTop: 4 }}
            />
            <Bar dataKey="baseline" fill={BASELINE_BAR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="model" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.metric} fill={accent.bar} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="px-5 pt-2 pb-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {liftChips.map((c) => (
            <span
              key={c.label}
              className={`text-[11px] font-mono font-bold px-2 py-1 rounded border ${
                c.value >= 1.15
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : c.value > 1.0
                    ? 'bg-slate-50 text-slate-700 border-slate-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {c.label} lift {c.value.toFixed(2)}x
            </span>
          ))}
          <span className="text-[11px] font-mono text-slate-400 ml-auto">n = {model.n.toLocaleString()}</span>
        </div>

        <div className={`p-3 rounded-xl border text-xs leading-relaxed ${tone.className}`}>
          <div className="flex items-center gap-1.5 font-extrabold uppercase tracking-wider text-[10px] mb-1">
            <tone.Icon className="h-3.5 w-3.5" />
            {tone.label}
          </div>
          {verdict.text}
        </div>
      </div>
    </div>
  );
};

export const ModelEvidence: React.FC = () => {
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [running, setRunning] = useState(true);
  const [sampleSize, setSampleSize] = useState(2000);

  const run = useCallback((n: number) => {
    setRunning(true);
    // runEvaluation is synchronous and takes about a second. Yield a frame first
    // so the running state actually paints instead of the tab locking silently.
    setTimeout(() => {
      setReport(runEvaluation(n));
      setRunning(false);
    }, 30);
  }, []);

  useEffect(() => {
    run(sampleSize);
  }, [run, sampleSize]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 bg-slate-50 min-h-screen text-slate-900">
      {/* Title */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-emerald-600 text-white">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-display uppercase tracking-tight">Model evidence</h1>
            <p className="text-xs text-slate-400">
              Held-out offline evaluation of all four engines, run live against the synthetic population
            </p>
          </div>
        </div>
      </div>

      {/* The disclaimer is the first thing on the page, not a footnote. */}
      <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 flex gap-4">
        <ShieldAlert className="h-6 w-6 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-2 text-sm text-amber-950">
          <div className="font-extrabold uppercase tracking-wide text-xs text-amber-800">
            Read this before reading the numbers
          </div>
          <p className="leading-relaxed">
            Every figure on this page measures how well the engines recover the data-generating process of a{' '}
            <b>simulator</b>. These are not production accuracy figures and they are not a forecast of performance on
            real retail data. A simulated world is tidier than a real one: preferences are stationary, and there is no
            out-of-stock churn, no returns, no bots and no mid-window seasonality shift. Recovering a known generator is
            a much easier problem than the real thing, so treat these as an <b>upper bound</b> and as evidence that the
            pipeline is wired up correctly - not as a promise.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Shoppers evaluated</span>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {SAMPLE_SIZES.map((n) => (
              <button
                key={n}
                onClick={() => setSampleSize(n)}
                disabled={running}
                className={`px-3 py-1.5 text-xs font-bold font-mono transition-colors disabled:opacity-50 ${
                  sampleSize === n ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {n.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => run(sampleSize)}
          disabled={running}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? 'Evaluating…' : 'Re-run evaluation'}
        </button>

        {report && (
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-500 ml-auto">
            <span>
              population <b className="text-slate-800">{report.meta.population.toLocaleString()}</b>
            </span>
            <span>
              catalog <b className="text-slate-800">{report.meta.catalogSize.toLocaleString()}</b>
            </span>
            <span>
              evaluated <b className="text-slate-800">{report.meta.evaluatedCustomers.toLocaleString()}</b>
            </span>
            <span title="Co-occurrence graphs and embeddings are built once and cached, so this is scoring time only.">
              scoring <b className="text-slate-800">{report.meta.elapsedMs} ms</b>
            </span>
          </div>
        )}
      </div>

      {/* Results */}
      {!report ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-500 text-sm">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-slate-400" />
          Building co-occurrence graphs and scoring held-out sessions…
        </div>
      ) : (
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 transition-opacity ${running ? 'opacity-40' : ''}`}>
          {PANELS.map((panel) => (
            <EngineCard key={panel.key} panel={panel} report={report} />
          ))}
        </div>
      )}

      {/* Harness comparability - see the file header for why this is here. */}
      <div className="bg-white rounded-2xl border border-amber-300 shadow-xs overflow-hidden">
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-widest text-amber-900">
              These numbers are not comparable to the previous published table
            </h2>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              The harness code is unchanged. What the label it scores against <i>means</i> changed, when the simulator
              gained a calibrated choice model and a session-level department intent. Both definitions are below.
              Neither table has been quietly replaced.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          <div className="p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                Harness A
              </span>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Retired generator</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every click sampled independently from the shopper's stable lifetime department affinity, and a cart add
              was a uniform coin over whatever had been viewed. The held-out target was the department of an anchor
              drawn near-arbitrarily from the catalog's department mix. Predicting it meant{' '}
              <b className="text-slate-800">estimating a per-view multinomial</b> from many draws of that same
              multinomial.
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] font-mono text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>held-out anchor matched shopper's modal dept</span>
                <b className="text-slate-900">18.3%</b>
              </div>
              <div className="flex justify-between">
                <span>department R@1 / baseline / lift</span>
                <b className="text-slate-900">19.7% / 17.5% / 1.12x</b>
              </div>
              <div className="flex justify-between">
                <span>team / similarity / complement lift (R@1)</span>
                <b className="text-slate-900">1.93x / 4.09x / 1.00x</b>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed italic">
              Recorded historical measurement of a generator that no longer exists. Not re-run.
            </p>
          </div>

          <div className="p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest bg-emerald-600 text-white px-2 py-0.5 rounded">
                Harness B
              </span>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                Current generator - the table above
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              A session draws one department intent at its start, the shopper walks a surfaced grid, and clicks and cart
              adds run through a calibrated choice model that reads affinity. The held-out target is the department of
              something the shopper actually chose. Predicting it means{' '}
              <b className="text-slate-800">forecasting the next session's mission</b>.
            </p>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-[11px] font-mono text-emerald-900 space-y-1">
              <div className="flex justify-between">
                <span>held-out anchor matched shopper's modal dept</span>
                <b>43.3%</b>
              </div>
              {report && (
                <>
                  <div className="flex justify-between">
                    <span>department R@1 / baseline / lift</span>
                    <b>
                      {pct(report.intentDept.recallAt1)} / {pct(report.intentDeptBaseline.recallAt1)} /{' '}
                      {(report.intentDept.recallAt1 / Math.max(1e-9, report.intentDeptBaseline.recallAt1)).toFixed(2)}x
                    </b>
                  </div>
                  <div className="flex justify-between">
                    <span>team / similarity / complement lift (R@1)</span>
                    <b>
                      {(report.intentTeam.recallAt1 / Math.max(1e-9, report.intentTeamBaseline.recallAt1)).toFixed(2)}x /{' '}
                      {(report.similarity.recallAt1 / Math.max(1e-9, report.similarityBaseline.recallAt1)).toFixed(2)}x /{' '}
                      {(report.complement.recallAt1 / Math.max(1e-9, report.complementBaseline.recallAt1)).toFixed(2)}x
                    </b>
                  </div>
                </>
              )}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed italic">
              Live, from the run above. Sample size is whatever is set at the top of this screen.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            <b className="text-slate-800">The one conclusion to take from the pair.</b> Department prediction went from
            the weakest engine to the second-strongest without a single line of the model changing. Harness A's
            department task was close to unlearnable - the thing being predicted barely depended on the shopper - so a
            popularity prior was already near the ceiling and there was nothing for personalisation to win. That is a
            broken question producing a flattering-looking baseline, not a weak model. It is also the reason this
            screen shows both: a lift number is a statement about a task and a baseline as much as about an engine, and
            a table that silently changes its task underneath a stable-looking metric is the most common way an
            evaluation misleads without anyone lying.
          </p>
        </div>
      </div>

      {/* Protocol */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-3">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-slate-800">
            Why this evaluation is not circular
          </h2>
          <ul className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
            <li className="flex gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <b className="text-slate-800">No latent variables leak.</b> The engines never read the simulator's
                hidden state - the true team affinities and the department outfit affinity table. They see only the
                observable graphs a real system would have: events, baskets and co-views.
              </span>
            </li>
            <li className="flex gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <b className="text-slate-800">No temporal leakage.</b> Each shopper's final purchasing session is
                withheld from their observable history <i>and</i> from the co-occurrence graphs the models are built on,
                then used as the prediction target.
              </span>
            </li>
            <li className="flex gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <b className="text-slate-800">Every engine is scored against a baseline.</b> A recommender that cannot
                beat "show the most popular thing" is not earning its keep, and that is a real failure mode of real
                systems. Beating popularity is the bar, not accuracy in the abstract.
              </span>
            </li>
          </ul>
        </div>

        <div className="bg-slate-900 text-slate-300 rounded-2xl border border-slate-800 shadow-xs p-6 space-y-3">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-white">What this does not establish</h2>
          <ul className="space-y-2.5 text-xs leading-relaxed">
            <li className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                That these lifts transfer to production. Nothing here has met a real shopper, a real assortment or a
                real seasonality shift.
              </span>
            </li>
            <li className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                That offline lift becomes revenue. Offline ranking gains and online conversion gains are related but not
                the same measurement; only an A/B test settles that.
              </span>
            </li>
            <li className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                That these are the right model families for real data. The simulator was written to be recoverable;
                choosing architectures is a job for the real dataset, not this one.
              </span>
            </li>
          </ul>
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500 leading-relaxed">
            The figures above are reported as measured, including the ones that are unflattering. Tuning them until they
            looked better would have defeated the purpose of running them.
          </div>
        </div>
      </div>
    </div>
  );
};
