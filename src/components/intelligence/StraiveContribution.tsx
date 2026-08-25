import React from 'react';
import { Sparkles, CheckCircle2, Award } from 'lucide-react';

export const StraiveContribution: React.FC = () => {
  const stages = [
    { num: '01', title: 'Business Use-Case Definition', desc: 'Framing intent & cross-sell personalization objectives into concrete ML tasks.' },
    { num: '02', title: 'Data Exploration & Feature Engineering', desc: 'Designing hot session window features, cold order history & multimodal product vectors.' },
    { num: '03', title: 'Behavioral Label & Graph Creation', desc: 'Building co-order and co-cart affinity graphs across leagues and departments.' },
    { num: '04', title: 'ML Model Development & Evaluation', desc: 'Training LSTM sequential models and similarity/complement contrastive rankers.' },
    { num: '05', title: 'Production Inference Integration', desc: 'Engineering low-latency serving contracts and fallback decision rule frameworks.' },
    { num: '06', title: 'Measurement & Optimization', desc: 'Setting up continuous behavioral telemetry loops and A/B test evaluation specs.' },
  ];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 bg-slate-50 min-h-screen text-slate-900">
      {/* Title Header */}
      <div className="bg-slate-900 text-white p-8 rounded-2xl border border-slate-800 shadow-xl space-y-3">
        <div className="inline-flex items-center space-x-2 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
          <Sparkles className="h-3.5 w-3.5" />
          <span>STRAIVE MACHINE LEARNING PARTNERSHIP</span>
        </div>
        <h1 className="text-3xl font-black font-display uppercase tracking-tight">
          FROM DATA TO CUSTOMER EXPERIENCE
        </h1>
        <p className="text-slate-300 text-sm max-w-3xl font-sans">
          Connecting data science, ML engineering, and customer-experience activation so that model output becomes a measurable commerce decision.
        </p>
      </div>

      {/* 6 Lifecycle Stages */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stages.map((st) => (
          <div key={st.num} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2 hover:border-red-300 transition-colors">
            <div className="text-2xl font-black font-mono text-red-600">{st.num}</div>
            <h3 className="font-extrabold text-sm text-slate-900">{st.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{st.desc}</p>
          </div>
        ))}
      </div>

      {/* Model Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Intent Engine Highlights */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
            <Award className="h-5 w-5 text-red-600" />
            <span>Intent Prediction Engine</span>
          </h3>

          <ul className="space-y-2 text-xs text-slate-700">
            <li className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Sequential customer behavior modeling across multi-session visits.</span>
            </li>
            <li className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Next-team & next-department intent probability forecasting.</span>
            </li>
            <li className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Real-time session feature engineering pipeline, engineered to a sub-20ms inference budget.</span>
            </li>
          </ul>
        </div>

        {/* Similarity & Complement Highlights */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
            <Award className="h-5 w-5 text-indigo-600" />
            <span>Similarity & Complement Engine</span>
          </h3>

          <ul className="space-y-2 text-xs text-slate-700">
            <li className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Multimodal product representations combining text, metadata, and visual features.</span>
            </li>
            <li className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Directional complement graph construction for cart cross-sell & complete the look.</span>
            </li>
            <li className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Model explainability wrappers generating human-readable match score rationale.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Summary Banner Statement */}
      <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white p-6 rounded-2xl shadow-lg text-center space-y-2">
        <div className="text-lg font-black font-display italic">
          "Straive helps connect data science, ML engineering and customer-experience activation so that model output becomes a measurable commerce decision."
        </div>
      </div>
    </div>
  );
};
