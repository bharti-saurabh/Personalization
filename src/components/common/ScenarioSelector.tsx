import React from 'react';
import { useApp } from '../../context/AppContext';
import { ScenarioId } from '../../types';
import { User, ShieldAlert, Sparkles, Flame, HelpCircle } from 'lucide-react';

export const ScenarioSelector: React.FC = () => {
  const { scenarios, selectedScenario, selectScenarioById } = useApp();

  const getScenarioIcon = (id: ScenarioId) => {
    switch (id) {
      case 'returning_eagles':
        return <Sparkles className="h-3.5 w-3.5 text-emerald-500" />;
      case 'multi_team':
        return <User className="h-3.5 w-3.5 text-blue-500" />;
      case 'anonymous':
        return <HelpCircle className="h-3.5 w-3.5 text-amber-500" />;
      case 'hot_market':
        return <Flame className="h-3.5 w-3.5 text-orange-500 animate-pulse" />;
      case 'low_confidence':
        return <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />;
      default:
        return <User className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div className="bg-white text-slate-800 px-4 py-2 border-b border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
      {/* Left: Scenario Segmented Selector */}
      <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none py-0.5">
        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest shrink-0 font-mono">
          Demo Scenario:
        </span>
        <div className="flex items-center space-x-1 shrink-0 bg-slate-100 p-1 rounded-lg border border-slate-200">
          {scenarios.map((sc) => {
            const isSelected = selectedScenario.id === sc.id;
            const shortName = sc.name.split(':')[1]?.trim() || sc.name;
            return (
              <button
                key={sc.id}
                onClick={() => selectScenarioById(sc.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                }`}
                title={sc.subtitle}
              >
                {getScenarioIcon(sc.id)}
                <span>{shortName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Active Profile Pill */}
      <div className="flex items-center space-x-2 shrink-0 text-[11px]">
        <div className="bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 flex items-center space-x-2 font-mono">
          <span className="text-slate-400">Profile:</span>
          <span className="font-bold text-slate-900">{selectedScenario.profileType}</span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-400">Propensity:</span>
          <span
            className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
              selectedScenario.conversionPropensity === 'High'
                ? 'bg-emerald-100 text-emerald-800'
                : selectedScenario.conversionPropensity === 'Medium'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-800'
            }`}
          >
            {selectedScenario.conversionPropensity}
          </span>
        </div>
      </div>
    </div>
  );
};

