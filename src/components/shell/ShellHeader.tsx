/**
 * The app header, and the only navigator in the build.
 *
 * WHAT THIS REPLACED, AND WHY
 * ---------------------------
 * A persistent left rail of eleven destinations, grouped into three headings.
 * It was accurate and it was unreadable: eleven peers is more than anyone will
 * scan, so viewers stopped reading it and simply followed whoever was driving
 * the demo. Five items in a segmented control can be taken in at a glance, and
 * the five model screens lost nothing by becoming tabs inside Models - they
 * were always variations on one question.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * The completeness meter and the personalization switch used to sit up here.
 * Both are engine state, and engine state belongs in the engine rail. Leaving
 * them in the header meant the top of the screen was half Straive console and
 * half shop, which is the confusion this whole rework exists to end.
 *
 * What stays is the frame: who made this, that the data is synthetic, which
 * view is open, and whether the rail is showing.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { StraiveLogo } from '../brand/StraiveLogo';
import { ShellView } from '../../types';
import {
  Store,
  Route,
  Columns2,
  Boxes,
  Workflow,
  FlaskConical,
  PanelRightOpen,
  PanelRightClose,
  MoreHorizontal,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

interface ViewMeta {
  id: ShellView;
  label: string;
  icon: React.ElementType;
  /** Engineering voice: what the view answers, not what it contains. */
  hint: string;
}

const VIEWS: ViewMeta[] = [
  { id: 'storefront', label: 'Storefront', icon: Store, hint: 'The shop, exactly as a customer would see it' },
  { id: 'journey', label: 'Customer journey', icon: Route, hint: 'The session end to end, and what would be sent afterwards' },
  { id: 'race', label: 'Twin store race', icon: Columns2, hint: 'Same shopper, same target, two orderings, counted' },
  { id: 'models', label: 'Models', icon: Boxes, hint: 'Every model, its evidence, its trace and its registry entry' },
  { id: 'architecture', label: 'Architecture', icon: Workflow, hint: 'How this would be built for production' },
];

/**
 * The reset, with one step of friction in front of it.
 *
 * It drops the cart, the stored profile and the whole session, and it is next
 * to a button people press constantly during a demo. A confirm that arms for
 * four seconds and disarms itself costs a presenter one extra click and saves
 * them the one moment they cannot recover from mid-sentence.
 */
const ResetControl: React.FC = () => {
  const { resetDemo } = useApp();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        resetDemo();
      }}
      title={
        armed
          ? 'Press again to reset. Clears the cart, the session, the stored profile and the market clock'
          : 'Start over: put the storefront, the journey and the engine rail back to a first-time visitor'
      }
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
        armed
          ? 'bg-straive-500 text-white border-straive-400 shadow-[0_0_0_3px_rgba(255,88,0,0.18)]'
          : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/10 hover:text-white'
      }`}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{armed ? 'Confirm reset' : 'Reset demo'}</span>
    </button>
  );
};

export const ShellHeader: React.FC = () => {
  const { shellView, setShellView, railOpen, toggleRail, setNavigationTab } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Overflow menus that only close on their own button are a well-known way to
  // leave a panel hanging over the stage while someone is presenting.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  return (
    <header className="shrink-0 bg-ink-950 text-white border-b border-white/10">
      <div className="h-14 px-3 sm:px-4 flex items-center gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <StraiveLogo className="h-[18px]" />
          <span className="hidden lg:block h-4 w-px bg-white/15" />
          <span className="hidden lg:block text-[11px] font-semibold tracking-wide text-slate-400 font-display">
            Commerce personalization
          </span>
        </div>

        {/* The navigator. Centre of the header because it is the only thing here
            a viewer is ever asked to act on. */}
        <nav className="flex-1 min-w-0 flex justify-center">
          <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-full p-0.5 overflow-x-auto scrollbar-none max-w-full">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const active = shellView === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setShellView(v.id)}
                  title={v.hint}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-straive-500 text-white shadow-[0_0_0_3px_rgba(255,88,0,0.16)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/8'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className={active ? '' : 'hidden md:inline'}>{v.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {/* The storefront below is convincing enough that a viewer who never
              opens the rail could take it for a live site. Say so, always. */}
          <span
            className="hidden xl:flex items-center gap-1.5 text-[10px] font-semibold text-straive-200 bg-straive-950/60 border border-straive-800/70 rounded-full px-2.5 py-1"
            title="Catalog, shoppers and order history are generated by a seeded simulator. No real customer data is used anywhere in this prototype."
          >
            <FlaskConical className="h-3 w-3" />
            Synthetic data · simulated models
          </span>

          <ResetControl />

          <button
            onClick={toggleRail}
            title={railOpen ? 'Collapse the engine rail' : 'Open the engine rail'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border bg-white/5 text-slate-300 border-white/15 hover:bg-white/10 hover:text-white transition-colors"
          >
            {railOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Engine rail</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="More"
              className="grid place-items-center h-8 w-8 rounded-full border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-white/10 bg-ink-900 shadow-2xl p-1.5">
                <button
                  onClick={() => {
                    // Delivery content, not a view of the engine. It earns a
                    // place in the build and not a place in the navigator.
                    setNavigationTab('straive_contribution');
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/8 transition-colors"
                >
                  <span className="flex items-center gap-2 text-[12px] font-semibold text-white">
                    <Sparkles className="h-3.5 w-3.5 text-straive-400" />
                    Straive partnership
                  </span>
                  <span className="block text-[10.5px] text-slate-500 mt-0.5">
                    Where the delivery team plugs into the programme
                  </span>
                </button>
                <div className="mt-1 px-3 py-2 border-t border-white/10 text-[10px] text-slate-500 leading-relaxed">
                  Every figure in this build is measured against a seeded simulation. Nothing here is a claim about a
                  real catalog or a real customer.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
