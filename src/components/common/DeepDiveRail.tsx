/**
 * Navigation for the storefront and the seven screens behind it.
 *
 * This started as a permanent left rail, was cut back to a dropdown inside the
 * intelligence panel, and is a left rail again - deliberately, and differently.
 * The original rail was a list of eight equal-weight tabs that made the demo
 * look like an admin console. This one is app chrome: it is dark, so it reads
 * as part of the Straive frame rather than as part of the shop; it collapses to
 * a strip of icons that costs the storefront 56px; and the storefront is the
 * first entry rather than one of nine, so the way back is always in the same
 * place as the way out.
 *
 * There is exactly one navigator now. The dropdown it replaced used to sit in
 * the intelligence panel header, and two ways to reach the same eight screens
 * is one more than anybody needs.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { NavigationTab } from '../../types';
import {
  UserCheck,
  BrainCircuit,
  TestTube2,
  FlaskConical,
  Workflow,
  GitBranch,
  Sparkles,
  Columns2,
  Store,
  PanelLeftClose,
  PanelLeftOpen,
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
        // Moved here from the side panel when the panel went to three tabs. It
        // is a walkthrough of one inference rather than a live reading, so it
        // belongs with the explanatory screens, not with the ones that move.
        id: 'pipeline',
        label: 'Inference Pipeline',
        blurb: 'One prediction, walked end to end through all seven stages',
        icon: <GitBranch className="h-4 w-4" />,
        badge: 'Trace',
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
    title: 'Architecture & Delivery',
    items: [
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

const STOREFRONT: DeepDive = {
  id: 'experience',
  label: 'Storefront',
  blurb: 'The shopping demo itself',
  icon: <Store className="h-4 w-4" />,
};

export const DeepDiveRail: React.FC<{ open: boolean; onToggle: () => void }> = ({ open, onToggle }) => {
  const { navigationTab, setNavigationTab } = useApp();

  const Item: React.FC<{ item: DeepDive; accent: 'red' | 'straive' }> = ({ item, accent }) => {
    const isActive = navigationTab === item.id;
    const activeBg = accent === 'red' ? 'bg-red-600 text-white' : 'bg-straive-500 text-white';
    return (
      <button
        onClick={() => setNavigationTab(item.id)}
        title={open ? item.blurb : `${item.label} - ${item.blurb}`}
        className={`w-full flex items-center gap-2.5 rounded-lg text-left transition-colors ${
          open ? 'px-2.5 py-2' : 'px-0 py-2 justify-center'
        } ${isActive ? activeBg : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
      >
        <span className="shrink-0">{item.icon}</span>
        {open && (
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="text-[11.5px] font-bold truncate">{item.label}</span>
              {item.badge && (
                <span
                  className={`text-[8.5px] px-1 py-px rounded font-mono shrink-0 ${
                    isActive ? 'bg-white/25 text-white font-bold' : 'bg-white/10 text-slate-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </span>
          </span>
        )}
      </button>
    );
  };

  return (
    <nav
      className={`shrink-0 bg-ink-900 border-r border-white/10 flex flex-col transition-all duration-200 ${
        open ? 'w-60' : 'w-14'
      }`}
    >
      <div className="flex-1 overflow-y-auto scrollbar-none p-2 space-y-3">
        {/* The way back sits above everything else and never moves, so it is in
            the same place whichever screen you are on. */}
        <Item item={STOREFRONT} accent="red" />

        {GROUPS.map((group) => (
          <div key={group.title} className="space-y-0.5">
            {open ? (
              <div className="px-2.5 pt-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
                {group.title}
              </div>
            ) : (
              /* Collapsed, the group titles have nowhere to go, so a hairline
                 keeps the grouping visible instead of losing it. */
              <div className="mx-3 border-t border-white/10" />
            )}
            {group.items.map((item) => (
              <Item key={item.id} item={item} accent="straive" />
            ))}
          </div>
        ))}
      </div>

      <button
        onClick={onToggle}
        title={open ? 'Collapse navigation' : 'Expand navigation'}
        className={`shrink-0 flex items-center gap-2 border-t border-white/10 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-white hover:bg-white/5 transition-colors ${
          open ? '' : 'justify-center px-0'
        }`}
      >
        {open ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        {open && <span>Collapse</span>}
      </button>
    </nav>
  );
};
