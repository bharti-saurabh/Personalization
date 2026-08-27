/**
 * The engine rail. Everything the machine does lives here, and nothing that
 * lives here appears on the stage.
 *
 * The rail has two halves and the split is deliberate. The top is the director
 * console - who the shopper is, where they are, what the world just did. Those
 * are inputs. The bottom four tabs are outputs: what the model now believes,
 * what it decided on the current page, what it saw, and what that did to the
 * shopper's effort. Inputs above outputs, always in the same place, so an
 * operator changing a slider can watch the tab below it move.
 *
 * WHY THE DIRECTOR CONSOLE COLLAPSES BUT NEVER SCROLLS AWAY
 * ---------------------------------------------------------
 * It is sticky because the demo's whole rhythm is "change one thing, look at
 * what moved". If the persona picker scrolls off while you are reading the
 * Visitor tab, every comparison needs a scroll up, a change, and a scroll back,
 * and by the time you are back you have forgotten the number you were comparing
 * against. It collapses because once the persona is set the console is dead
 * weight and the tabs want the height.
 */

import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { DirectorControls } from './DirectorControls';
import { VisitorTab } from './VisitorTab';
import { DecisionsTab } from './DecisionsTab';
import { SignalsTab } from './SignalsTab';
import { ValueTab } from './ValueTab';
import { ChevronRight, ChevronLeft, User, ListChecks, Activity, Gauge } from 'lucide-react';

type RailTab = 'visitor' | 'decisions' | 'signals' | 'value';

const TABS: { id: RailTab; label: string; icon: React.ElementType; hint: string }[] = [
  { id: 'visitor', label: 'Visitor', icon: User, hint: 'What the model currently believes about this shopper' },
  { id: 'decisions', label: 'Decisions', icon: ListChecks, hint: 'Every personalized module on the page right now' },
  { id: 'signals', label: 'Signals', icon: Activity, hint: 'The raw event stream, and which slots each event moved' },
  { id: 'value', label: 'Value', icon: Gauge, hint: 'What personalization did to the shopper effort' },
];

/** The slim edge the rail collapses to. Wide enough to be a target, narrow
 *  enough that the stage gets effectively the whole window. */
const CollapsedEdge: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <button
    onClick={onOpen}
    className="w-9 shrink-0 h-full bg-ink-900 border-l border-white/10 flex flex-col items-center gap-3 pt-3 hover:bg-ink-800 transition-colors group"
    title="Show the engine rail"
  >
    <ChevronLeft className="h-4 w-4 text-slate-500 group-hover:text-straive-400" />
    <span
      className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 group-hover:text-slate-300"
      style={{ writingMode: 'vertical-rl' }}
    >
      Engine
    </span>
    <span className="mt-auto mb-3 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
  </button>
);

export const EngineRail: React.FC = () => {
  const { railOpen, toggleRail, resetNonce } = useApp();
  const [tab, setTab] = useState<RailTab>('visitor');

  // The tab is local state, so a reset that put everything else back to the
  // opening screen would still leave the rail on whichever tab the last viewer
  // had open. The nonce is the only thing the reset can reach in here.
  useEffect(() => {
    setTab('visitor');
  }, [resetNonce]);

  if (!railOpen) return <CollapsedEdge onOpen={toggleRail} />;

  return (
    <aside className="w-[34%] min-w-[340px] max-w-[460px] shrink-0 h-full flex flex-col bg-ink-900 border-l border-white/10 overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 border-b border-white/10 bg-ink-950">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-300">Engine</span>
        <span className="text-[9px] text-slate-600 truncate">simulated models, synthetic data</span>
        <button
          onClick={toggleRail}
          className="ml-auto p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
          title="Hide the engine rail"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Inputs. */}
      <div className="shrink-0 border-b border-white/10">
        <DirectorControls />
      </div>

      {/* Outputs. */}
      <div className="shrink-0 flex border-b border-white/10 bg-ink-950">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.hint}
              className={`flex-1 min-w-0 px-1 py-1.5 flex flex-col items-center gap-0.5 border-b-2 transition-colors ${
                on
                  ? 'border-straive-500 text-white bg-white/[0.04]'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]'
              }`}
            >
              <Icon className="h-3 w-3" />
              <span className="text-[9px] font-bold tracking-wide">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'visitor' && <VisitorTab />}
        {tab === 'decisions' && <DecisionsTab />}
        {tab === 'signals' && <SignalsTab />}
        {tab === 'value' && <ValueTab />}
      </div>
    </aside>
  );
};
