/**
 * The behind-the-scenes panel.
 *
 * Three readings of the same engines, because the demo has three audiences and
 * they ask different questions:
 *
 *   PROFILE    - "do you have a picture of me?" The live profile: every field
 *                with its confidence, its source and its decay constant.
 *   DECISIONS  - "what did you just do, and why?" The delta stream: one entry
 *                per event, with the models that ran, the fields written, the
 *                surfaces re-ranked and the rules fired.
 *   EXPERIENCE - "what did the shopper not have to do?" The effort ledger.
 *                A stub for now, and honest about being one.
 *
 * PROFILE is the default. That is a decision made against a real objection:
 * Decisions is the tab that MOVES, and a default view that can sit unchanged
 * through several clicks is exactly the failure that got the pipeline
 * walkthrough demoted from the front door. Profile still wins it, because the
 * first question a client asks is not how the machinery works but whether it
 * knows who they are, and that has to be answered in the first second. The
 * static-looking risk is mitigated rather than accepted: fields flash on write,
 * and the first write after any event surfaces a one-line summary inside the
 * Profile tab with a link straight across to Decisions.
 *
 * `view` is lifted to the panel precisely so that link can exist.
 *
 * The Straive mark sits at the top of this panel and nowhere inside the
 * storefront. That is the whole branding rule: the shop is the client's, the
 * machinery reading it is ours.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { User, Activity, Gauge } from 'lucide-react';
import { StraiveMark } from '../brand/StraiveLogo';
import { ProfileTab } from './ProfileTab';
import { DecisionsTab } from './DecisionsTab';
import { ExperienceTab } from './ExperienceTab';

type PanelView = 'profile' | 'decisions' | 'experience';

const VIEWS: { id: PanelView; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'profile', label: 'Profile', icon: <User className="h-3.5 w-3.5" />, hint: 'What the system believes about this shopper' },
  { id: 'decisions', label: 'Decisions', icon: <Activity className="h-3.5 w-3.5" />, hint: 'Every event, what ran and what it changed' },
  { id: 'experience', label: 'Experience', icon: <Gauge className="h-3.5 w-3.5" />, hint: 'Effort the shopper did not have to spend' },
];

export const IntelligencePanel: React.FC = () => {
  const { intentPrediction, decisions } = useApp();
  const [view, setView] = useState<PanelView>('profile');

  // An unread marker on Decisions, so the tab that moves can say so while the
  // tab that answers "who am I" holds the front door.
  const [unread, setUnread] = useState(0);
  const seenCount = useRef(decisions.length);

  useEffect(() => {
    if (view === 'decisions') {
      seenCount.current = decisions.length;
      setUnread(0);
      return;
    }
    setUnread(Math.max(0, decisions.length - seenCount.current));
  }, [decisions.length, view]);

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
                {decisions.length} decision{decisions.length === 1 ? '' : 's'} this session ·{' '}
                <span className="text-emerald-600 font-semibold">{ms < 0.1 ? '<0.1ms' : `${ms}ms`}</span> last inference
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              title={v.hint}
              className={`relative py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                view === v.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {v.icon}
              {v.label}
              {v.id === 'decisions' && unread > 0 && (
                <span className="absolute top-0.5 right-1.5 min-w-[14px] h-[14px] px-1 rounded-full bg-straive-500 text-white text-[8.5px] font-mono font-bold grid place-items-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'profile' && <ProfileTab onSeeDecisions={() => setView('decisions')} />}
        {view === 'decisions' && <DecisionsTab />}
        {view === 'experience' && <ExperienceTab />}
      </div>
    </div>
  );
};
