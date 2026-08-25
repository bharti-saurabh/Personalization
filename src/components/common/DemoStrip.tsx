/**
 * The one row of demo scaffolding.
 *
 * This used to be two full-width strips stacked on each other - a scenario
 * selector and a page tracker - which together with the promo ticker, the
 * store header and the category nav put five bands of chrome above the fold.
 * They are one row now because they answer one question between them: WHO are
 * we simulating, and WHERE are they.
 *
 * The profile and propensity readout that used to sit on the right was dropped
 * rather than merged. It restated what the intelligence panel already says with
 * more context, and the panel is on screen at the same time.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { ScenarioId, StorefrontPage } from '../../types';
import { User, ShieldAlert, Sparkles, Flame, HelpCircle, House, LayoutGrid, Package, ShoppingCart } from 'lucide-react';

const SCENARIO_ICON: Record<ScenarioId, React.ReactNode> = {
  returning_eagles: <Sparkles className="h-3.5 w-3.5" />,
  multi_team: <User className="h-3.5 w-3.5" />,
  anonymous: <HelpCircle className="h-3.5 w-3.5" />,
  hot_market: <Flame className="h-3.5 w-3.5" />,
  low_confidence: <ShieldAlert className="h-3.5 w-3.5" />,
};

const STEPS: { id: StorefrontPage; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <House className="h-3.5 w-3.5" /> },
  { id: 'plp', label: 'Catalog', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { id: 'pdp', label: 'Product', icon: <Package className="h-3.5 w-3.5" /> },
  { id: 'cart', label: 'Cart', icon: <ShoppingCart className="h-3.5 w-3.5" /> },
];

export const DemoStrip: React.FC = () => {
  const { scenarios, selectedScenario, selectScenarioById, storefrontPage, setStorefrontPage, setNavigationTab } =
    useApp();

  const stepIndex = STEPS.findIndex((s) => s.id === storefrontPage);

  const goto = (page: StorefrontPage) => {
    setNavigationTab('experience');
    setStorefrontPage(page);
  };

  return (
    <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-4 overflow-x-auto scrollbar-none">
      {/* WHO */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400 shrink-0">Shopper</span>
        <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-full border border-slate-200">
          {scenarios.map((sc) => {
            const isSelected = selectedScenario.id === sc.id;
            const shortName = sc.name.split(':')[1]?.trim() || sc.name;
            return (
              <button
                key={sc.id}
                onClick={() => selectScenarioById(sc.id)}
                title={sc.subtitle}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  isSelected
                    ? 'bg-ink-950 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <span className={isSelected ? 'text-straive-400' : 'text-slate-400'}>{SCENARIO_ICON[sc.id]}</span>
                <span className={isSelected ? '' : 'hidden xl:inline'}>{shortName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* WHERE. Steps completed so far are filled, which turns the row into a
          progress indicator rather than four equally-weighted buttons. */}
      <div className="flex items-center shrink-0">
        {STEPS.map((step, idx) => {
          const isActive = storefrontPage === step.id;
          const isPast = idx < stepIndex;
          return (
            <React.Fragment key={step.id}>
              {idx > 0 && (
                <span className={`h-px w-4 sm:w-6 ${idx <= stepIndex ? 'bg-red-300' : 'bg-slate-200'}`} />
              )}
              <button
                onClick={() => goto(step.id)}
                title={`Jump to ${step.label}`}
                className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                  isActive
                    ? 'bg-red-600 text-white shadow-sm'
                    : isPast
                      ? 'text-red-700 hover:bg-red-50'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span
                  className={`grid place-items-center h-5 w-5 rounded-full ${
                    isActive ? 'bg-white/20' : isPast ? 'bg-red-100' : 'bg-slate-100'
                  }`}
                >
                  {step.icon}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
