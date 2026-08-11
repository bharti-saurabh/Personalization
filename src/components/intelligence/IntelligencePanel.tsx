import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  BrainCircuit,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Code2,
  Sparkles,
  Zap,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Clock,
  Layers,
  Activity,
  CheckCircle2,
  RotateCw,
  Play,
  Check,
} from 'lucide-react';

export const IntelligencePanel: React.FC = () => {
  const {
    selectedScenario,
    topazPrediction,
    similarityMatches,
    complementMatches,
    activeDecisionTrace,
    storefrontPage,
    selectedProduct,
    userEvents,
    activeTeamOverride,
  } = useApp();

  const [isJsonOpen, setIsJsonOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'topaz' | 'kepler_sim' | 'kepler_comp'>('topaz');

  // Step-by-step ML pipeline animation state
  const [visibleStep, setVisibleStep] = useState<number>(7);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  const runTraceSequence = () => {
    setIsAnalyzing(true);
    setVisibleStep(1);
  };

  // Re-run pipeline step trace whenever scenario changes
  useEffect(() => {
    runTraceSequence();
  }, [selectedScenario.id]);

  // Sequentially increment visible step
  useEffect(() => {
    if (!isAnalyzing) return;

    if (visibleStep < 7) {
      const timer = setTimeout(() => {
        setVisibleStep((prev) => prev + 1);
      }, 350);
      return () => clearTimeout(timer);
    } else {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing, visibleStep]);

  // Formatted Synthetic Payload JSON string
  const samplePayload = {
    customer_context: {
      recognized: selectedScenario.profileType === 'Recognized',
      device: selectedScenario.device,
      channel: selectedScenario.channel,
      geo_country_code: 'US',
      customer_id: selectedScenario.profileType === 'Recognized' ? 'FANKEY_PHL_9402' : 'ANON_GUEST_SESSION',
    },
    recent_events: userEvents.slice(0, 4).map((ev) => ({
      page_type: ev.pageType,
      league: ev.league || 'NFL',
      team: ev.team || 'Philadelphia Eagles',
      department: ev.department || 'Jerseys',
      timestamp: ev.timestamp,
      action: ev.action,
    })),
    active_overrides: {
      active_team_override: activeTeamOverride,
      confidence_score: topazPrediction.confidence,
    },
    candidate_teams: topazPrediction.teams.map((t) => t.team),
  };

  const stepDescriptions = [
    { num: 1, title: 'Context Signals', desc: 'Ingesting profile, FanKey ID, device telemetry, and location metadata...' },
    { num: 2, title: 'Behavioral Sequence', desc: 'Vectorizing clickstream events & temporal order tokens across leagues...' },
    { num: 3, title: 'Feature Engineering', desc: 'Building LSTM sequence token embeddings & co-order affinity vectors...' },
    { num: 4, title: 'Model Inference', desc: 'Executing Transformer attention layer logits & vector similarity calculations...' },
    { num: 5, title: 'Prediction Probabilities', desc: 'Calculating softmax confidence distribution across team & product candidates...' },
    { num: 6, title: 'Decision Layer', desc: 'Evaluating inventory availability, confidence thresholds, and fallback safety rules...' },
    { num: 7, title: 'Storefront Activation', desc: 'Binding ML parameters to live storefront layout & recommendation carousels...' },
  ];

  return (
    <div className="bg-slate-50 text-slate-800 border-l border-slate-200 h-full flex flex-col justify-between overflow-y-auto text-xs font-sans relative">
      {/* Top Animated Progress Bar */}
      <div className="h-1 bg-slate-200 w-full sticky top-0 z-30 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            isAnalyzing ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${(visibleStep / 7) * 100}%` }}
        />
      </div>

      {/* Panel Top Bar Header */}
      <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between sticky top-1 z-20 shadow-xs">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
            <BrainCircuit className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm text-slate-900 tracking-tight flex items-center gap-1.5">
              ML Intelligence Trace
              {isAnalyzing ? (
                <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded border border-amber-300 font-mono font-bold flex items-center gap-1 animate-pulse">
                  <RotateCw className="h-3 w-3 animate-spin text-amber-600" />
                  EXECUTING {visibleStep}/7
                </span>
              ) : (
                <span className="bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 font-mono font-bold flex items-center gap-1">
                  <Check className="h-3 w-3 text-emerald-600" />
                  COMPLETE 7/7
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-500">7-Step Model Decision Sequence</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={runTraceSequence}
            disabled={isAnalyzing}
            title="Re-run trace sequence animation"
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 border border-slate-300 transition-all disabled:opacity-50"
          >
            <RotateCw className={`h-3 w-3 ${isAnalyzing ? 'animate-spin text-amber-600' : 'text-slate-600'}`} />
            <span className="hidden sm:inline">Re-trace</span>
          </button>
          <div className="flex items-center space-x-1 text-[11px] text-emerald-800 font-mono bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 font-bold">
            <Zap className="h-3 w-3 text-emerald-600" />
            <span>{topazPrediction.inferenceTimeMs}ms</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Scenario execution notification badge */}
        {isAnalyzing && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center justify-between animate-pulse">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
              <div>
                <span className="font-bold">Evaluating Scenario:</span>{' '}
                <span className="font-semibold">{selectedScenario.name.split(':')[1]?.trim() || selectedScenario.name}</span>
              </div>
            </div>
            <span className="font-mono text-[10px] bg-amber-200/80 px-1.5 py-0.5 rounded font-bold">
              Step {visibleStep}/7
            </span>
          </div>
        )}

        {/* Model Switcher Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-1 rounded-xl border border-slate-300">
          <button
            onClick={() => setActiveTab('topaz')}
            className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              activeTab === 'topaz'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Intent Model
          </button>
          <button
            onClick={() => setActiveTab('kepler_sim')}
            className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              activeTab === 'kepler_sim'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Similarity
          </button>
          <button
            onClick={() => setActiveTab('kepler_comp')}
            className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              activeTab === 'kepler_comp'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Complement
          </button>
        </div>

        {/* STEP 1: CUSTOMER & CONTEXT SIGNALS */}
        {visibleStep < 1 ? (
          <div className="bg-slate-100/70 rounded-xl p-3 border border-slate-200/80 text-slate-400 space-y-1 opacity-60">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span>STEP 1: Context Signals</span>
              <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-bold">Queued</span>
            </div>
            <p className="text-[10px] text-slate-500 italic">Waiting for scenario context tokens...</p>
          </div>
        ) : visibleStep === 1 && isAnalyzing ? (
          <div className="bg-amber-50 rounded-xl p-3 border-2 border-amber-400 shadow-xs space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-amber-900 font-bold border-b border-amber-200 pb-1.5">
              <span className="text-[11px] font-mono text-amber-800 flex items-center gap-1.5">
                <RotateCw className="h-3.5 w-3.5 text-amber-600 animate-spin" />
                STEP 1: Context Signals
              </span>
              <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-mono font-extrabold">
                INGESTING
              </span>
            </div>
            <p className="text-[11px] text-amber-900 font-mono">{stepDescriptions[0].desc}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-2 transition-all">
            <div className="flex items-center justify-between text-slate-700 font-bold border-b border-slate-100 pb-1.5">
              <span className="text-[11px] font-mono text-indigo-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                STEP 1: Context Signals
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                {selectedScenario.profileType}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <span className="text-slate-500 block text-[10px]">Device & Channel</span>
                <span className="font-semibold text-slate-800 capitalize">
                  {selectedScenario.device} • {selectedScenario.channel}
                </span>
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <span className="text-slate-500 block text-[10px]">FanKey ID</span>
                <span className="font-mono text-emerald-700 font-bold">
                  {selectedScenario.profileType === 'Recognized' ? 'FK_89402_PHL' : 'ANONYMOUS'}
                </span>
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200 col-span-2">
                <span className="text-slate-500 block text-[10px]">Current Active Context</span>
                <span className="font-semibold text-slate-800">
                  Page: <b>{storefrontPage.toUpperCase()}</b> • Team: <b>{selectedProduct.team}</b> • Dept: <b>{selectedProduct.department}</b>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: BEHAVIORAL SEQUENCE TIMELINE */}
        {visibleStep < 2 ? (
          <div className="bg-slate-100/70 rounded-xl p-3 border border-slate-200/80 text-slate-400 space-y-1 opacity-60">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span>STEP 2: Behavioral Sequence</span>
              <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-bold">Queued</span>
            </div>
            <p className="text-[10px] text-slate-500 italic">Waiting for Step 1 context...</p>
          </div>
        ) : visibleStep === 2 && isAnalyzing ? (
          <div className="bg-amber-50 rounded-xl p-3 border-2 border-amber-400 shadow-xs space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-amber-900 font-bold border-b border-amber-200 pb-1.5">
              <span className="text-[11px] font-mono text-amber-800 flex items-center gap-1.5">
                <RotateCw className="h-3.5 w-3.5 text-amber-600 animate-spin" />
                STEP 2: Behavioral Sequence
              </span>
              <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-mono font-extrabold">
                VECTORIZING
              </span>
            </div>
            <p className="text-[11px] text-amber-900 font-mono">{stepDescriptions[1].desc}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-2 transition-all">
            <div className="flex items-center justify-between text-slate-700 font-bold border-b border-slate-100 pb-1.5">
              <span className="text-[11px] font-mono text-indigo-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                STEP 2: Behavioral Sequence
              </span>
              <span className="text-[10px] text-slate-500">{userEvents.length} events logged</span>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {userEvents.slice(0, 4).map((ev, idx) => (
                <div
                  key={ev.id}
                  className={`p-2 rounded border text-[11px] flex items-start space-x-2 ${
                    idx === 0
                      ? 'bg-red-50 border-red-200 text-slate-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <Clock className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-bold flex justify-between">
                      <span>{ev.action}</span>
                      <span className="text-[9px] text-slate-500 font-mono">{ev.timestamp}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: FEATURE GENERATION & JSON PAYLOAD */}
        {visibleStep < 3 ? (
          <div className="bg-slate-100/70 rounded-xl p-3 border border-slate-200/80 text-slate-400 space-y-1 opacity-60">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span>STEP 3: Feature Engineering</span>
              <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-bold">Queued</span>
            </div>
            <p className="text-[10px] text-slate-500 italic">Waiting for sequence tokens...</p>
          </div>
        ) : visibleStep === 3 && isAnalyzing ? (
          <div className="bg-amber-50 rounded-xl p-3 border-2 border-amber-400 shadow-xs space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-amber-900 font-bold border-b border-amber-200 pb-1.5">
              <span className="text-[11px] font-mono text-amber-800 flex items-center gap-1.5">
                <RotateCw className="h-3.5 w-3.5 text-amber-600 animate-spin" />
                STEP 3: Feature Engineering
              </span>
              <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-mono font-extrabold">
                TRANSFORMING
              </span>
            </div>
            <p className="text-[11px] text-amber-900 font-mono">{stepDescriptions[2].desc}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-2 transition-all">
            <div className="flex items-center justify-between text-slate-700 font-bold border-b border-slate-100 pb-1.5">
              <span className="text-[11px] font-mono text-indigo-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                STEP 3: Feature Engineering
              </span>
              <button
                onClick={() => setIsJsonOpen(!isJsonOpen)}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded flex items-center gap-1 font-mono"
              >
                <Code2 className="h-3 w-3 text-indigo-600" />
                <span>{isJsonOpen ? 'Hide Payload' : 'View Payload JSON'}</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-700 space-y-1">
              <div className="flex items-center justify-between bg-slate-50 p-2 rounded border border-slate-200">
                <span>Sequence Features</span>
                <span className="font-mono text-emerald-700 font-bold">LSTM / Transformer Tokenized</span>
              </div>
            </div>

            {/* Expanded JSON Inspector */}
            {isJsonOpen && (
              <pre className="p-3 bg-slate-900 rounded-lg border border-slate-700 text-[10px] font-mono text-indigo-300 overflow-x-auto max-h-48 leading-tight">
                {JSON.stringify(samplePayload, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* STEP 4: MODEL INFERENCE */}
        {visibleStep < 4 ? (
          <div className="bg-slate-100/70 rounded-xl p-3 border border-slate-200/80 text-slate-400 space-y-1 opacity-60">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span>STEP 4: Model Inference</span>
              <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-bold">Queued</span>
            </div>
            <p className="text-[10px] text-slate-500 italic">Waiting for feature vector tensor...</p>
          </div>
        ) : visibleStep === 4 && isAnalyzing ? (
          <div className="bg-amber-50 rounded-xl p-3 border-2 border-amber-400 shadow-xs space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-amber-900 font-bold border-b border-amber-200 pb-1.5">
              <span className="text-[11px] font-mono text-amber-800 flex items-center gap-1.5">
                <RotateCw className="h-3.5 w-3.5 text-amber-600 animate-spin" />
                STEP 4: Model Inference
              </span>
              <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-mono font-extrabold">
                INFERRING LOGITS
              </span>
            </div>
            <p className="text-[11px] text-amber-900 font-mono">{stepDescriptions[3].desc}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-2 transition-all">
            <div className="flex items-center justify-between text-slate-700 font-bold border-b border-slate-100 pb-1.5">
              <span className="text-[11px] font-mono text-indigo-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                STEP 4: Model Inference
              </span>
              <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">
                v2.4-prod
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <span className="text-slate-500 block text-[10px]">Engine Purpose</span>
                <span className="font-bold text-slate-900">
                  {activeTab === 'topaz'
                    ? 'Intent Prediction Engine'
                    : activeTab === 'kepler_sim'
                    ? 'Similarity Encoder'
                    : 'Complement Engine'}
                </span>
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <span className="text-slate-500 block text-[10px]">Model Confidence</span>
                <span className="font-extrabold text-emerald-700 font-mono">
                  {Math.round(topazPrediction.confidence * 100)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: PREDICTION OUTPUT (Horizontal Probability Bars) */}
        {visibleStep < 5 ? (
          <div className="bg-slate-100/70 rounded-xl p-3 border border-slate-200/80 text-slate-400 space-y-1 opacity-60">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span>STEP 5: Prediction Probabilities</span>
              <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-bold">Queued</span>
            </div>
            <p className="text-[10px] text-slate-500 italic">Waiting for logits calculation...</p>
          </div>
        ) : visibleStep === 5 && isAnalyzing ? (
          <div className="bg-amber-50 rounded-xl p-3 border-2 border-amber-400 shadow-xs space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-amber-900 font-bold border-b border-amber-200 pb-1.5">
              <span className="text-[11px] font-mono text-amber-800 flex items-center gap-1.5">
                <RotateCw className="h-3.5 w-3.5 text-amber-600 animate-spin" />
                STEP 5: Prediction Probabilities
              </span>
              <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-mono font-extrabold">
                CALCULATING PROBS
              </span>
            </div>
            <p className="text-[11px] text-amber-900 font-mono">{stepDescriptions[4].desc}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-2 transition-all">
            <div className="flex items-center justify-between text-slate-700 font-bold border-b border-slate-100 pb-1.5">
              <span className="text-[11px] font-mono text-indigo-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                STEP 5: Prediction Probabilities
              </span>
              <span className="text-[10px] text-slate-500">Ranked Outputs</span>
            </div>

            {activeTab === 'topaz' ? (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Next Team Probabilities</div>
                {topazPrediction.teams.map((tItem, i) => (
                  <div key={tItem.team} className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold">
                      <span className={i === 0 ? 'text-red-600 font-bold' : 'text-slate-700'}>{tItem.team}</span>
                      <span className="font-mono text-slate-500">{Math.round(tItem.probability * 100)}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          i === 0 ? 'bg-red-600' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${Math.round(tItem.probability * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : activeTab === 'kepler_sim' ? (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Similarity Candidates</div>
                {similarityMatches.slice(0, 3).map((match) => (
                  <div key={match.product.id} className="p-2 bg-slate-50 rounded border border-slate-200 text-[11px]">
                    <div className="font-bold text-slate-800 truncate">{match.product.name}</div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span>Similarity Score:</span>
                      <span className="font-mono text-indigo-700 font-bold">{Math.round(match.totalScore * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Complement Candidates</div>
                {complementMatches.slice(0, 3).map((comp) => (
                  <div key={comp.product.id} className="p-2 bg-slate-50 rounded border border-slate-200 text-[11px]">
                    <div className="font-bold text-slate-800 truncate">{comp.product.name}</div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span>Complement Score:</span>
                      <span className="font-mono text-amber-700 font-bold">{Math.round(comp.complementScore * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 6: DECISION & BUSINESS RULES */}
        {visibleStep < 6 ? (
          <div className="bg-slate-100/70 rounded-xl p-3 border border-slate-200/80 text-slate-400 space-y-1 opacity-60">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span>STEP 6: Decision Layer</span>
              <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-bold">Queued</span>
            </div>
            <p className="text-[10px] text-slate-500 italic">Waiting for softmax probabilities...</p>
          </div>
        ) : visibleStep === 6 && isAnalyzing ? (
          <div className="bg-amber-50 rounded-xl p-3 border-2 border-amber-400 shadow-xs space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-amber-900 font-bold border-b border-amber-200 pb-1.5">
              <span className="text-[11px] font-mono text-amber-800 flex items-center gap-1.5">
                <RotateCw className="h-3.5 w-3.5 text-amber-600 animate-spin" />
                STEP 6: Decision Layer
              </span>
              <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-mono font-extrabold">
                EVALUATING RULES
              </span>
            </div>
            <p className="text-[11px] text-amber-900 font-mono">{stepDescriptions[5].desc}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-2 transition-all">
            <div className="flex items-center justify-between text-slate-700 font-bold border-b border-slate-100 pb-1.5">
              <span className="text-[11px] font-mono text-indigo-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                STEP 6: Decision Layer
              </span>
              {activeDecisionTrace.fallbackTriggered ? (
                <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-mono border border-rose-200">
                  Fallback Triggered
                </span>
              ) : (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono border border-emerald-200">
                  Passed Safety Rules
                </span>
              )}
            </div>

            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] leading-relaxed text-slate-700 font-sans">
              {activeDecisionTrace.finalDecisionReason}
            </div>
          </div>
        )}

        {/* STEP 7: EXPERIENCE ACTIVATION VISUAL CONNECTION */}
        {visibleStep < 7 ? (
          <div className="bg-slate-100/70 rounded-xl p-3 border border-slate-200/80 text-slate-400 space-y-1 opacity-60">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span>STEP 7: Storefront Activation</span>
              <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-bold">Queued</span>
            </div>
            <p className="text-[10px] text-slate-500 italic">Waiting for decision layer output...</p>
          </div>
        ) : visibleStep === 7 && isAnalyzing ? (
          <div className="bg-amber-50 rounded-xl p-3 border-2 border-amber-400 shadow-xs space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-amber-900 font-bold border-b border-amber-200 pb-1.5">
              <span className="text-[11px] font-mono text-amber-800 flex items-center gap-1.5">
                <RotateCw className="h-3.5 w-3.5 text-amber-600 animate-spin" />
                STEP 7: Storefront Activation
              </span>
              <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-mono font-extrabold">
                BINDING UI
              </span>
            </div>
            <p className="text-[11px] text-amber-900 font-mono">{stepDescriptions[6].desc}</p>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-red-50 to-indigo-50 rounded-xl p-3 border border-red-200 space-y-2 transition-all">
            <div className="flex items-center justify-between text-slate-800 font-bold border-b border-red-200/60 pb-1.5">
              <span className="text-[11px] font-mono text-red-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                STEP 7: Storefront Activation
              </span>
              <Activity className="h-3.5 w-3.5 text-red-600 animate-pulse" />
            </div>

            <div className="text-[11px] text-slate-800 flex items-center space-x-2">
              <div className="p-1 rounded bg-red-600 text-white font-bold">
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Active Page Target:</span>
                <span className="font-extrabold text-slate-900">{activeDecisionTrace.targetComponent}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

