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
 *
 * The Straive mark sits at the top of this panel and nowhere inside the
 * storefront. That is the whole branding rule: the shop is the client's, the
 * machinery reading it is ours.
 */

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Route, GitBranch } from 'lucide-react';
import { DeepDiveMenu } from '../common/DeepDiveMenu';
import { StraiveMark } from '../brand/StraiveLogo';
import { JourneyNarrative } from './JourneyNarrative';
import { PipelineTrace } from './PipelineTrace';

type PanelView = 'story' | 'pipeline';

const VIEWS: { id: PanelView; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'story', label: 'Session Story', icon: <Route className="h-3.5 w-3.5" />, hint: 'Why this shopper sees this' },
  { id: 'pipeline', label: 'Pipeline', icon: <GitBranch className="h-3.5 w-3.5" />, hint: 'How one prediction is made' },
];

export const IntelligencePanel: React.FC = () => {
  const { intentPrediction, journal } = useApp();
  const [view, setView] = useState<PanelView>('story');

  const ms = intentPrediction.inferenceTimeMs;

  return (
    <div className="bg-slate-100 text-slate-800 border-l border-slate-200 h-full flex flex-col overflow-hidden font-sans">
      <div className="shrink-0 bg-white border-b border-slate-200 px-3.5 pt-3 pb-2.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <StraiveMark className="h-6 w-6" />
            <div className="min-w-0">
              <h2 className="font-display font-extrabold text-[14px] text-slate-900 tracking-tight leading-tight truncate">
                Personalization Intelligence
              </h2>
              <p className="text-[10.5px] text-slate-500 truncate">
                {journal.length} decision{journal.length === 1 ? '' : 's'} this session ·{' '}
                <span className="text-emerald-600 font-semibold">{ms < 0.1 ? '<0.1ms' : `${ms}ms`}</span> last inference
              </p>
            </div>
          </div>
          <DeepDiveMenu />
        </div>

        <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              title={v.hint}
              className={`py-1.5 rounded-lg text-[11.5px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                view === v.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
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
