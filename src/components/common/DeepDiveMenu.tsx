/**
 * Launcher for the eight non-storefront screens.
 *
 * These used to be a permanent left rail. They are demo scaffolding rather than
 * part of the shopping experience, so they now live behind one button in the
 * intelligence panel: the stage stays a storefront until someone deliberately
 * asks to look behind it.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { NavigationTab } from '../../types';
import {
  UserCheck,
  BrainCircuit,
  TestTube2,
  FlaskConical,
  TrendingUp,
  Workflow,
  Sparkles,
  Columns2,
  Layers,
  Store,
  ChevronDown,
} from 'lucide-react';

interface DeepDive {
  id: NavigationTab;
  label: string;
  blurb: string;
  icon: React.ReactNode;
  badge?: string;
}

const GROUPS: { title: string; items: DeepDive[] }[] = [
  {
    title: 'Storefront Demo',
    items: [
      {
        id: 'comparison',
        label: 'ON vs OFF Comparison',
        blurb: 'Same shopper, same catalog, personalization disabled on one side',
        icon: <Columns2 className="h-4 w-4" />,
        badge: 'A/B',
      },
      {
        id: 'journey',
        label: 'Customer Journey',
        blurb: 'Session timeline and how each event moved the prediction',
        icon: <UserCheck className="h-4 w-4" />,
      },
    ],
  },
  {
    title: 'ML Intelligence',
    items: [
      {
        id: 'model_intelligence',
        label: 'Model Intelligence',
        blurb: 'Architecture of the three engines, with live measured metrics',
        icon: <BrainCircuit className="h-4 w-4" />,
        badge: 'Engine',
      },
      {
        id: 'model_evidence',
        label: 'Model Evidence',
        blurb: 'Held-out evaluation, popularity baselines and caveats',
        icon: <FlaskConical className="h-4 w-4" />,
        badge: 'Offline',
      },
      {
        id: 'lab',
        label: 'Recommendation Lab',
        blurb: 'Change the inputs and watch the ranking move',
        icon: <TestTube2 className="h-4 w-4" />,
        badge: 'Sandbox',
      },
    ],
  },
  {
    title: 'Business & Architecture',
    items: [
      {
        id: 'business_impact',
        label: 'Business Impact ROI',
        blurb: 'Assumption-driven revenue model - not a forecast',
        icon: <TrendingUp className="h-4 w-4" />,
      },
      {
        id: 'architecture',
        label: 'System Architecture',
        blurb: 'How the pipeline would be built for production',
        icon: <Workflow className="h-4 w-4" />,
      },
      {
        id: 'straive_contribution',
        label: 'Straive Partnership',
        blurb: 'Where the delivery team plugs into the programme',
        icon: <Sparkles className="h-4 w-4" />,
      },
    ],
  },
];

/** Flat lookup so the main stage can title whichever screen is open. */
export const DEEP_DIVE_BY_ID: Record<string, DeepDive> = Object.fromEntries(
  GROUPS.flatMap((g) => g.items).map((i) => [i.id, i])
);

export const DeepDiveMenu: React.FC = () => {
  const { navigationTab, setNavigationTab } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape - the menu floats over the storefront,
  // so leaving it open after a mis-click is worse than the extra listeners.
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const isDeepDiveOpen = navigationTab !== 'experience';

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        title="Open a deep-dive screen"
        className={`px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 border transition-all ${
          isDeepDiveOpen
            ? 'bg-indigo-600 text-white border-indigo-500'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
        }`}
      >
        <Layers className="h-3 w-3" />
        <span className="hidden sm:inline">Deep Dives</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-9 z-50 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-2 bg-slate-900 text-white">
            <div className="text-[11px] font-extrabold uppercase tracking-widest">Behind the Storefront</div>
            <div className="text-[10px] text-slate-400">Evidence, architecture and business framing</div>
          </div>

          <div className="max-h-[26rem] overflow-y-auto p-2 space-y-3">
            {/* Always offer the way back, so the menu is a full navigator rather
                than a one-way door out of the shopping experience. */}
            <button
              onClick={() => {
                setNavigationTab('experience');
                setIsOpen(false);
              }}
              className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                !isDeepDiveOpen ? 'bg-red-600 text-white' : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <span className={`shrink-0 mt-0.5 ${!isDeepDiveOpen ? 'text-white' : 'text-slate-500'}`}>
                <Store className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold">Storefront Experience</span>
                <span className={`block text-[10px] ${!isDeepDiveOpen ? 'text-red-100' : 'text-slate-500'}`}>
                  The shopping demo itself
                </span>
              </span>
            </button>

            {GROUPS.map((group) => (
              <div key={group.title} className="space-y-1">
                <div className="px-2.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  {group.title}
                </div>
                {group.items.map((item) => {
                  const isActive = navigationTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setNavigationTab(item.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                        isActive ? 'bg-red-600 text-white' : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className={`shrink-0 mt-0.5 ${isActive ? 'text-white' : 'text-slate-500'}`}>
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs font-bold">{item.label}</span>
                          {item.badge && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                                isActive
                                  ? 'bg-white/20 text-white font-bold'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </span>
                        <span className={`block text-[10px] leading-snug ${isActive ? 'text-red-100' : 'text-slate-500'}`}>
                          {item.blurb}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
