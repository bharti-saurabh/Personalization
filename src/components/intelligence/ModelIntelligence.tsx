/**
 * Architecture view for the three recommendation engines.
 *
 * Every card used to end in a hand-written "Offline Proof Point" claim. Those
 * are gone. Each card now ends in the number the harness actually produced for
 * that engine, computed live on this screen at the same sample size the Model
 * Evidence tab defaults to, so the two screens can never drift apart or quietly
 * disagree. Where the measurement is unflattering - department intent trails
 * popularity at Recall@3 - the card says so.
 */

import React, { useEffect, useState } from 'react';
import { BrainCircuit, Sparkles, ShieldCheck, Cpu, ArrowRight, BarChart2, AlertTriangle } from 'lucide-react';
import { runEvaluation, EvaluationReport } from '../../ml/evaluate';
import { useApp } from '../../context/AppContext';

/** Matches the Model Evidence default so the two screens report the same run. */
const SAMPLE_SIZE = 2000;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const lift = (model: number, baseline: number) => (baseline > 0 ? `${(model / baseline).toFixed(2)}x` : 'n/a');

/** One measured metric next to the popularity baseline it has to beat. */
const Measured: React.FC<{ label: string; model: number; baseline: number }> = ({ label, model, baseline }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-[11px] text-slate-500 font-sans">{label}</span>
    <span className="font-mono text-[11px]">
      <b className="text-slate-900">{pct(model)}</b>
      <span className="text-slate-400"> vs {pct(baseline)} base</span>
      <span className="text-slate-700 font-bold"> · {lift(model, baseline)}</span>
    </span>
  </div>
);

const MetricBlock: React.FC<{
  tone: 'red' | 'indigo' | 'amber';
  report: EvaluationReport | null;
  children: React.ReactNode;
  note: string;
}> = ({ tone, report, children, note }) => {
  const ring = {
    red: 'bg-red-50 border-red-200',
    indigo: 'bg-indigo-50 border-indigo-200',
    amber: 'bg-amber-50 border-amber-200',
  }[tone];

  return (
    <div className={`${ring} p-3 rounded-xl border text-xs space-y-1.5`}>
      <div className="font-bold uppercase tracking-wider text-[10px] text-slate-600 font-sans">
        Measured offline · n = {SAMPLE_SIZE.toLocaleString()}
      </div>
      {report ? (
        <>
          <div className="space-y-1">{children}</div>
          <div className="text-[11px] text-slate-600 leading-snug pt-0.5">{note}</div>
        </>
      ) : (
        <div className="text-[11px] text-slate-500 italic py-2">Running held-out evaluation…</div>
      )}
    </div>
  );
};

export const ModelIntelligence: React.FC = () => {
  const { setNavigationTab } = useApp();
  const [report, setReport] = useState<EvaluationReport | null>(null);

  useEffect(() => {
    // runEvaluation is synchronous and takes about a second. Yield a frame so
    // the architecture cards paint first and the metric blocks fill in after,
    // instead of the tab appearing to hang on navigation.
    const id = setTimeout(() => setReport(runEvaluation(SAMPLE_SIZE)), 30);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 bg-slate-50 min-h-screen text-slate-900">
      {/* Title Header */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2 rounded-xl bg-red-600 text-white font-bold">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-serif uppercase tracking-tight">
              MODEL INTELLIGENCE ARCHITECTURE
            </h1>
            <p className="text-xs text-slate-400">
              Technical deep dive into Customer Intent, Similarity Encoder & Complement Cross-Sell Engines
            </p>
          </div>
        </div>
      </div>

      {/* Provenance of every number on this page */}
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <div className="font-extrabold uppercase tracking-wider mb-1">These are simulator-recovery figures</div>
          The metrics on each card are computed live, on this page, from a held-out session per shopper in a{' '}
          <b>synthetic</b> population. They measure how well each engine recovers a data-generating process we wrote -
          not how it would perform on real retail data. Treat them as an upper bound and as evidence the pipeline is
          wired correctly.{' '}
          <button
            onClick={() => setNavigationTab('model_evidence')}
            className="underline font-bold hover:text-amber-700 inline-flex items-center gap-1"
          >
            Full evaluation, baselines and caveats <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 3 Engines Detailed Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Intent Engine */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-red-600 font-extrabold text-sm uppercase tracking-wider">
              <Sparkles className="h-4 w-4" />
              <span>A. Intent Prediction Engine</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Customer Intent Prediction</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Predicts customer-level team and department intent from real-time sequential interaction logs and multi-session historical behavior.
            </p>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1 font-mono">
              <div className="text-slate-500 font-bold font-sans">Model Outputs:</div>
              <div className="text-slate-800">• Next likely purchase team</div>
              <div className="text-slate-800">• Next likely department</div>
              <div className="text-slate-800">• Conversion propensity</div>
              <div className="text-slate-800">• Dynamic grid filter sequence</div>
            </div>
          </div>
          <MetricBlock
            tone="red"
            report={report}
            note="Team intent clearly beats popularity. Department intent does not: it wins narrowly at Recall@1 but trails the popularity baseline at Recall@3, because department mix is far less person-specific than team allegiance."
          >
            {report && (
              <>
                <Measured label="Team · Recall@1" model={report.intentTeam.recallAt1} baseline={report.intentTeamBaseline.recallAt1} />
                <Measured label="Team · NDCG@10" model={report.intentTeam.ndcgAt10} baseline={report.intentTeamBaseline.ndcgAt10} />
                <Measured label="Dept · Recall@3" model={report.intentDept.recallAt3} baseline={report.intentDeptBaseline.recallAt3} />
              </>
            )}
          </MetricBlock>
        </div>

        {/* Similarity Engine */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-indigo-600 font-extrabold text-sm uppercase tracking-wider">
              <Cpu className="h-4 w-4" />
              <span>B. Similarity Encoder Engine</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Substitute Recommendations</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Powers "You May Also Like" by computing hybrid multimodal product representations (Metadata + Image + Co-view embeddings).
            </p>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1 font-mono">
              <div className="text-slate-500 font-bold font-sans">Signals Combined:</div>
              <div className="text-slate-800">• Team & League compatibility</div>
              <div className="text-slate-800">• Player & Style line match</div>
              <div className="text-slate-800">• Price band proximity</div>
              <div className="text-slate-800">• Co-view product neighborhood</div>
            </div>
          </div>
          <MetricBlock
            tone="indigo"
            report={report}
            note="The strongest result, and the most meaningful one: the target is held-out co-view behaviour, not the metadata the embedding was built from, so the encoder is not being scored on its own inputs."
          >
            {report && (
              <>
                <Measured label="Recall@1" model={report.similarity.recallAt1} baseline={report.similarityBaseline.recallAt1} />
                <Measured label="Recall@10" model={report.similarity.recallAt10} baseline={report.similarityBaseline.recallAt10} />
                <Measured label="NDCG@10" model={report.similarity.ndcgAt10} baseline={report.similarityBaseline.ndcgAt10} />
              </>
            )}
          </MetricBlock>
        </div>

        {/* Complement Engine */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-amber-600 font-extrabold text-sm uppercase tracking-wider">
              <BarChart2 className="h-4 w-4" />
              <span>C. Complement Cross-Sell Engine</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Cross-Sell & Complete the Look</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Powers directional cross-department recommendations (e.g., Jersey → Hat, Jersey → Collectible, Hat → T-shirt).
            </p>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1 font-mono">
              <div className="text-slate-500 font-bold font-sans">Signals Combined:</div>
              <div className="text-slate-800">• Co-order affinity graph</div>
              <div className="text-slate-800">• Co-cart relationship strength</div>
              <div className="text-slate-800">• Department compatibility matrix</div>
              <div className="text-slate-800">• Team consistency rules</div>
            </div>
          </div>
          <MetricBlock
            tone="amber"
            report={report}
            note="A mixed result, and the smallest sample on the page. The engine ties popularity on the single first pick but ranks the rest of the basket materially better, which is what NDCG is picking up."
          >
            {report && (
              <>
                <Measured label="Recall@1" model={report.complement.recallAt1} baseline={report.complementBaseline.recallAt1} />
                <Measured label="NDCG@10" model={report.complement.ndcgAt10} baseline={report.complementBaseline.ndcgAt10} />
                <div className="flex items-baseline justify-between gap-2 pt-0.5">
                  <span className="text-[11px] text-slate-500 font-sans">Held-out baskets</span>
                  <span className="font-mono text-[11px] text-slate-700">n = {report.complement.n.toLocaleString()}</span>
                </div>
              </>
            )}
          </MetricBlock>
        </div>
      </div>

      {/* What holds this together */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <span className="font-bold text-slate-900">Shared evaluation contract.</span> All three engines are scored by
          the same harness, against the same held-out split, with the same popularity baselines - so the cards above are
          directly comparable to each other and reproducible from the command line with{' '}
          <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">npm run sim:eval</code>.
        </div>
      </div>
    </div>
  );
};
