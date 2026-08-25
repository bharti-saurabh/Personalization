/**
 * The behind-the-scenes panel.
 *
 * It carries two readings of the same engines, because the demo has two
 * audiences and they ask different questions:
 *
 *   STORY    - "why is this shopper seeing this?" A running account of the
 *              session: one card per action, with what ran, what it scored, what
 *              rule fired and what got rendered. This is the default, because it
 *              is the only view that changes as someone actually shops.
 *
 *   PIPELINE - "how is one prediction made?" The seven-step walkthrough of a
 *              single inference, animated end to end.
 *
 * The panel used to open on the pipeline. That was the wrong front door: it
 * looked identical after ten minutes of browsing as it did on arrival, which
 * undercut the one claim the demo exists to make.
 */

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BrainCircuit, Zap, Route, GitBranch } from 'lucide-react';
import { DeepDiveMenu } from '../common/DeepDiveMenu';
import { JourneyNarrative } from './JourneyNarrative';
import { PipelineTrace } from './PipelineTrace';

type PanelView = 'story' | 'pipeline';

const VIEWS: { id: PanelView; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'story', label: 'Session Story', icon: <Route className="h-3 w-3" />, hint: 'Why this shopper sees this' },
  { id: 'pipeline', label: 'Pipeline', icon: <GitBranch className="h-3 w-3" />, hint: 'How one prediction is made' },
];

export const IntelligencePanel: React.FC = () => {
  const { intentPrediction, journal } = useApp();
  const [view, setView] = useState<PanelView>('story');

  return (
    <div className="bg-slate-50 text-slate-800 border-l border-slate-200 h-full flex flex-col overflow-hidden text-xs font-sans">
      <div className="shrink-0 p-3 bg-white border-b border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
              <BrainCircuit className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-sm text-slate-900 tracking-tight truncate">Behind the Scenes</h2>
              <p className="text-[10px] text-slate-500 truncate">
                {journal.length} decision{journal.length === 1 ? '' : 's'} logged this session
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <DeepDiveMenu />
            <div className="flex items-center space-x-1 text-[10px] text-emerald-800 font-mono bg-emerald-50 px-1.5 py-1 rounded-lg border border-emerald-200 font-bold">
              <Zap className="h-3 w-3 text-emerald-600" />
              <span>{intentPrediction.inferenceTimeMs < 0.1 ? '<0.1ms' : `${intentPrediction.inferenceTimeMs}ms`}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              title={v.hint}
              className={`py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                view === v.id ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {v.icon}
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'story' ? <JourneyNarrative /> : <PipelineTrace />}
      </div>
    </div>
  );
};
