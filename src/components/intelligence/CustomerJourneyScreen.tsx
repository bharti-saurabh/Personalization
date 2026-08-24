import React from 'react';
import { useApp } from '../../context/AppContext';
import { ScenarioId } from '../../types';
import {
  Clock,
  User,
  ShieldAlert,
  Sparkles,
  Flame,
  HelpCircle,
  CheckCircle2,
  Cpu,
  Database,
  BarChart2,
  Zap,
  Layout,
  Layers,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

export const CustomerJourneyScreen: React.FC = () => {
  const {
    scenarios,
    selectedScenario,
    selectScenarioById,
    userEvents,
    intentPrediction,
    isPersonalizationOn,
  } = useApp();

  const getScenarioIcon = (id: ScenarioId) => {
    switch (id) {
      case 'returning_eagles':
        return <Sparkles className="h-4 w-4 text-emerald-500" />;
      case 'multi_team':
        return <User className="h-4 w-4 text-blue-500" />;
      case 'anonymous':
        return <HelpCircle className="h-4 w-4 text-amber-500" />;
      case 'hot_market':
        return <Flame className="h-4 w-4 text-orange-500 animate-pulse" />;
      case 'low_confidence':
        return <ShieldAlert className="h-4 w-4 text-rose-500" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const topTeam = intentPrediction.teams[0];
  const topDept = intentPrediction.departments[0];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 bg-slate-50 min-h-screen text-slate-900">
      {/* Demo Scenario Selector Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest font-mono">
              Select Demo Scenario
            </h2>
            <p className="text-xs text-slate-500">
              Simulate different customer intent archetypes, devices, and session signal states
            </p>
          </div>
          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
            {scenarios.length} Scenarios Available
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {scenarios.map((sc) => {
            const isSelected = selectedScenario.id === sc.id;
            const shortName = sc.name.split(':')[1]?.trim() || sc.name;

            return (
              <button
                key={sc.id}
                onClick={() => selectScenarioById(sc.id)}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/20'
                    : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-1.5 font-extrabold text-xs">
                      {getScenarioIcon(sc.id)}
                      <span className="truncate">{shortName}</span>
                    </div>
                    {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                  </div>
                  <p className={`text-[10px] line-clamp-2 leading-tight ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                    {sc.subtitle}
                  </p>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-200/40 flex items-center justify-between text-[10px] font-mono">
                  <span className={isSelected ? 'text-slate-400' : 'text-slate-500'}>{sc.profileType}</span>
                  <span
                    className={`font-bold px-1.5 py-0.2 rounded ${
                      sc.conversionPropensity === 'High'
                        ? isSelected ? 'bg-emerald-950 text-emerald-400' : 'bg-emerald-100 text-emerald-800'
                        : sc.conversionPropensity === 'Medium'
                        ? isSelected ? 'bg-amber-950 text-amber-400' : 'bg-amber-100 text-amber-800'
                        : isSelected ? 'bg-rose-950 text-rose-400' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {sc.conversionPropensity}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Header */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-red-400 font-bold uppercase tracking-wider mb-1">
            ACTIVE CUSTOMER JOURNEY TELEMETRY
          </div>
          <h1 className="text-2xl font-black font-serif uppercase tracking-tight">
            {selectedScenario.name}
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">{selectedScenario.description}</p>
        </div>

        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-xs flex items-center space-x-4 shrink-0">
          <div>
            <span className="text-slate-400 block text-[10px]">Historical Orders</span>
            <span className="font-bold text-white text-sm">{selectedScenario.historicalOrdersCount} orders</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Device & Channel</span>
            <span className="font-bold text-white text-sm capitalize">
              {selectedScenario.device} ({selectedScenario.channel})
            </span>
          </div>
        </div>
      </div>

      {/* Main 2-Column Split View: Left = Event Stream Timeline, Right = ML Features & Model Decision Explanation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Timeline Event Stream (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 font-mono uppercase tracking-wider">
              <Clock className="h-4 w-4 text-red-600" />
              <span>Session Event Stream</span>
            </h2>
            <span className="text-[11px] font-mono text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {userEvents.length} events
            </span>
          </div>

          <div className="relative border-l-2 border-slate-200 pl-5 space-y-4 ml-2.5">
            {userEvents.map((ev, idx) => (
              <div key={ev.id} className="relative group">
                {/* Dot */}
                <div
                  className={`absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs ${
                    idx === 0 ? 'bg-red-600 ring-4 ring-red-100' : 'bg-slate-800'
                  }`}
                />

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1 hover:border-slate-300 transition-all">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                    <span className="flex items-center space-x-1.5">
                      <span className="bg-slate-900 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                        {ev.pageType}
                      </span>
                      <span className="text-xs font-bold text-slate-800 leading-tight">{ev.action}</span>
                    </span>
                  </div>

                  <div className="text-[10px] font-mono text-slate-400 pt-0.5">
                    Timestamp: {ev.timestamp}
                  </div>

                  {(ev.team || ev.department || ev.productName) && (
                    <div className="text-[11px] text-slate-600 pt-2 border-t border-slate-200/60 mt-2 flex flex-wrap gap-1.5">
                      {ev.team && (
                        <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded font-bold border border-emerald-200 text-[10px]">
                          Team: {ev.team}
                        </span>
                      )}
                      {ev.department && (
                        <span className="bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded font-bold border border-indigo-200 text-[10px]">
                          Dept: {ev.department}
                        </span>
                      )}
                      {ev.productName && (
                        <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-semibold text-[10px] truncate max-w-[200px]">
                          Product: {ev.productName}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: ML Features Used + Statistical Model + Probability Assignment + Storefront Page Impact (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Section 1: Features ML Used (Historical + Current Session) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider font-mono flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-600" />
                <span>1. ML Features Used (Batch + Real-Time Stream)</span>
              </h3>
              <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 font-bold">
                Feature Store Ingested
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Historical Features */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                  <span>Historical Batch Features</span>
                </div>
                <ul className="text-xs text-slate-600 space-y-1 font-mono text-[11px]">
                  <li className="flex justify-between border-b border-slate-200/50 pb-1">
                    <span className="text-slate-400">Profile ID:</span>
                    <span className="font-bold text-slate-900">
                      {selectedScenario.profileType === 'Recognized' ? 'FANKEY_PHL_9402' : 'ANON_GUEST_SESSION'}
                    </span>
                  </li>
                  <li className="flex justify-between border-b border-slate-200/50 pb-1">
                    <span className="text-slate-400">Order History:</span>
                    <span className="font-bold text-slate-900">{selectedScenario.historicalOrdersCount} orders</span>
                  </li>
                  <li className="flex justify-between border-b border-slate-200/50 pb-1">
                    <span className="text-slate-400">Team Affinity Vector:</span>
                    <span className="font-bold text-slate-900">
                      {selectedScenario.favTeams.length > 0 ? selectedScenario.favTeams.join(', ') : 'Cold Start (None)'}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-400">Channel / Device:</span>
                    <span className="font-bold text-slate-900 capitalize">
                      {selectedScenario.channel} / {selectedScenario.device}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Current Session Features */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  <span>Current Session Real-Time Features</span>
                </div>
                <ul className="text-xs text-slate-600 space-y-1 font-mono text-[11px]">
                  <li className="flex justify-between border-b border-slate-200/50 pb-1">
                    <span className="text-slate-400">Sequence Tokens:</span>
                    <span className="font-bold text-slate-900">{userEvents.length} event tokens ($\lambda=0.85$)</span>
                  </li>
                  <li className="flex justify-between border-b border-slate-200/50 pb-1">
                    <span className="text-slate-400">Last Active Context:</span>
                    <span className="font-bold text-slate-900">
                      {userEvents[userEvents.length - 1]?.team || 'Home / All'} ({userEvents[userEvents.length - 1]?.department || 'General'})
                    </span>
                  </li>
                  <li className="flex justify-between border-b border-slate-200/50 pb-1">
                    <span className="text-slate-400">Recency Decay Weight:</span>
                    <span className="font-bold text-emerald-700">Highest on latest click</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-400">Session Propensity:</span>
                    <span className="font-bold text-slate-900">{selectedScenario.conversionPropensity} Intent</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Section 2: Statistical Model Architecture & Inference Execution */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider font-mono flex items-center gap-2">
                <Cpu className="h-4 w-4 text-emerald-600" />
                <span>2. Statistical Model Architecture & Inference Execution</span>
              </h3>
              <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                Intent Engine v2.4-prod
              </span>
            </div>

            <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 text-xs font-mono border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1.5 text-[11px]">
                <span>Model Type: <b className="text-emerald-400">Transformer Sequential Intent Encoder + Softmax</b></span>
                <span>Latency: <b className="text-amber-400">{intentPrediction.inferenceTimeMs}ms</b></span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                The model processes historical batch embeddings and real-time clickstream event vectors through a multi-head self-attention layer. A softmax activation assigns probability logits across teams and product departments.
              </p>
              <div className="flex items-center justify-between text-[10px] pt-1 text-slate-400">
                <span>Model Confidence Threshold: <b className="text-white">50%</b></span>
                <span>Current Confidence: <b className={intentPrediction.confidence >= 0.5 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{(intentPrediction.confidence * 100).toFixed(0)}%</b></span>
              </div>
            </div>
          </div>

          {/* Section 3: How Probabilities Were Assigned */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider font-mono flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-blue-600" />
                <span>3. Probability Assignment Breakdown</span>
              </h3>
              <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 font-bold">
                Softmax Logits Output
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Team Probabilities */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                  Team Intent Probabilities
                </div>
                <div className="space-y-1.5">
                  {intentPrediction.teams.map((t, idx) => {
                    const pct = Math.round(t.probability * 100);
                    return (
                      <div key={t.team} className="space-y-0.5">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className={idx === 0 ? 'font-bold text-slate-900' : 'text-slate-600'}>
                            {idx + 1}. {t.team}
                          </span>
                          <span className="font-bold text-slate-900">{pct}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              idx === 0 ? 'bg-red-600' : 'bg-slate-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Department Probabilities */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                  Department Intent Probabilities
                </div>
                <div className="space-y-1.5">
                  {intentPrediction.departments.slice(0, 4).map((d, idx) => {
                    const pct = Math.round(d.probability * 100);
                    return (
                      <div key={d.department} className="space-y-0.5">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className={idx === 0 ? 'font-bold text-slate-900' : 'text-slate-600'}>
                            {idx + 1}. {d.department}
                          </span>
                          <span className="font-bold text-slate-900">{pct}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              idx === 0 ? 'bg-indigo-600' : 'bg-slate-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: What Change on the Page Happened for the User */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider font-mono flex items-center gap-2">
                <Layout className="h-4 w-4 text-red-600" />
                <span>4. Storefront Page Impact & Rendered Changes</span>
              </h3>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                  isPersonalizationOn
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-slate-100 text-slate-600 border border-slate-300'
                }`}
              >
                Personalization: {isPersonalizationOn ? 'ACTIVE (ON)' : 'DISABLED (OFF)'}
              </span>
            </div>

            {isPersonalizationOn ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans text-xs">
                <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 space-y-1">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5 font-serif text-sm">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Hero A-Spot Banner</span>
                  </div>
                  <p className="text-slate-700 text-[11px] leading-snug">
                    Dynamically rendered tailored hero graphics and CTA for <b>{topTeam?.team}</b> with <b>{Math.round((topTeam?.probability || 0) * 100)}% predicted intent</b>.
                  </p>
                </div>

                <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 space-y-1">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5 font-serif text-sm">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Favorite Teams & Departments</span>
                  </div>
                  <p className="text-slate-700 text-[11px] leading-snug">
                    Re-ordered team bar with <b>{topTeam?.team}</b> leading, and re-prioritized <b>{topDept?.department}</b> department chip first.
                  </p>
                </div>

                <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 space-y-1">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5 font-serif text-sm">
                    <Layers className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Product Carousel Retrieval</span>
                  </div>
                  <p className="text-slate-700 text-[11px] leading-snug">
                    Filtered vector similarity retrieval conditioned on <b>Team: {topTeam?.team}</b> & <b>Dept: {topDept?.department}</b>.
                  </p>
                </div>

                <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 space-y-1">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5 font-serif text-sm">
                    <ArrowRight className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Catalog PLP Sorting</span>
                  </div>
                  <p className="text-slate-700 text-[11px] leading-snug">
                    Default sorting on PLP set to <b>"Predicted Intent Relevance"</b> scoring vector.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                <div className="font-bold text-slate-900 font-serif text-sm">
                  Standard Global Catalog Experience (Personalization OFF)
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Personalization is turned off in the header. The storefront displays static generic hero banners, default alphabetical league sorting, unweighted merchandise listings, and "Most Popular" generic catalog sorting.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

