/**
 * The demo scaffolding: WHO we are simulating, and WHERE they are.
 *
 * The two questions sit on two lines rather than at opposite ends of one. The
 * four page buttons are the storefront itself - home, catalog, product, cart -
 * so they belong under the shopper they describe, reading left to right as the
 * journey they represent. Pushed to the right-hand end of the shopper row they
 * looked like an unrelated toolbar that happened to share the strip.
 *
 * The profile and propensity readout that used to sit on the right was dropped
 * rather than merged. It restated what the intelligence panel already says with
 * more context, and the panel is on screen at the same time.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { ScenarioId, StorefrontPage } from '../../types';
import { IdentityLadder } from './IdentityLadder';
import { MarketDeck } from './MarketDeck';
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
    <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-2 space-y-1.5">
      {/* WHO */}
      <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-none">
        <span className="w-16 shrink-0 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
          Shopper
        </span>
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

      {/* HOW MUCH WE KNOW. Between the shopper and the page because it changes
          what every page below it renders, and because promoting mid-journey is
          the thing worth watching. */}
      <IdentityLadder />

      {/* WHERE. Steps completed so far are filled, which turns the row into a
          progress indicator rather than four equally-weighted buttons. The
          label column is the same width as the one above it, so the two rows
          line up on a single left edge. */}
      <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-none">
        <span className="w-16 shrink-0 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
          Storefront
        </span>
        <div className="flex items-center">
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

      {/* WHAT THE WORLD IS DOING. Last, because it is the only row that is not
          about the shopper - and directly above the storefront it changes. */}
      <MarketDeck />
    </div>
  );
};
