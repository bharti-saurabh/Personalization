import React from 'react';
import { useApp } from '../../context/AppContext';
import { StorefrontPage } from '../../types';
import { Home, Grid, Package, ShoppingCart, ChevronRight } from 'lucide-react';

export const JourneyTracker: React.FC = () => {
  const { storefrontPage, setStorefrontPage, setNavigationTab } = useApp();

  const steps: { id: StorefrontPage; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: '1. Home', icon: <Home className="h-3.5 w-3.5" /> },
    { id: 'plp', label: '2. Catalog (PLP)', icon: <Grid className="h-3.5 w-3.5" /> },
    { id: 'pdp', label: '3. Product (PDP)', icon: <Package className="h-3.5 w-3.5" /> },
    { id: 'cart', label: '4. Cart', icon: <ShoppingCart className="h-3.5 w-3.5" /> },
  ];

  const handleStepClick = (page: StorefrontPage) => {
    setNavigationTab('experience');
    setStorefrontPage(page);
  };

  return (
    <div className="bg-slate-50 text-slate-700 px-4 py-1.5 border-b border-slate-200 flex items-center justify-between text-xs overflow-x-auto scrollbar-none">
      <div className="flex items-center space-x-1 shrink-0">
        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono mr-2">
          Page Journey:
        </span>
        <div className="flex items-center space-x-1">
          {steps.map((step, idx) => {
            const isActive = storefrontPage === step.id;
            return (
              <React.Fragment key={step.id}>
                <button
                  onClick={() => handleStepClick(step.id)}
                  className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                    isActive
                      ? 'bg-red-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {step.icon}
                  <span>{step.label}</span>
                </button>
                {idx < steps.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="hidden lg:flex items-center space-x-2 text-[10px] text-slate-400 shrink-0 font-mono">
        <span>Click step to simulate fan navigation</span>
      </div>
    </div>
  );
};

