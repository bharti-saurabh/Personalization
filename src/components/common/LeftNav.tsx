import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { NavigationTab } from '../../types';
import {
  Store,
  UserCheck,
  BrainCircuit,
  TestTube2,
  TrendingUp,
  Workflow,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react';

export const LeftNav: React.FC = () => {
  const { navigationTab, setNavigationTab } = useApp();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const sections: {
    title: string;
    items: { id: NavigationTab; label: string; icon: React.ReactNode; badge?: string }[];
  }[] = [
    {
      title: 'Storefront Demo',
      items: [
        {
          id: 'experience',
          label: 'Storefront Experience',
          icon: <Store className="h-4 w-4" />,
          badge: 'Live',
        },
        {
          id: 'journey',
          label: 'Customer Journey',
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
          icon: <BrainCircuit className="h-4 w-4" />,
          badge: 'Engine',
        },
        {
          id: 'lab',
          label: 'Recommendation Lab',
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
          icon: <TrendingUp className="h-4 w-4" />,
        },
        {
          id: 'architecture',
          label: 'System Architecture',
          icon: <Workflow className="h-4 w-4" />,
        },
        {
          id: 'straive_contribution',
          label: 'Straive Partnership',
          icon: <Sparkles className="h-4 w-4" />,
        },
      ],
    },
  ];

  return (
    <aside
      className={`bg-white text-slate-700 border-r border-slate-200 transition-all duration-300 flex flex-col justify-between z-30 shadow-xs ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div>
        {/* Header / Collapse Toggle */}
        <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          {!isCollapsed && (
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Layers className="h-3.5 w-3.5 text-red-600" />
              <span>Platform Sections</span>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors mx-auto"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="p-2 space-y-4">
          {sections.map((sec, secIdx) => (
            <div key={secIdx} className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 pt-1 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  {sec.title}
                </div>
              )}
              {sec.items.map((item) => {
                const isActive = navigationTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setNavigationTab(item.id)}
                    className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    } ${isCollapsed ? 'justify-center' : 'justify-between'}`}
                    title={item.label}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`}>{item.icon}</span>
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </div>
                    {!isCollapsed && item.badge && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ml-1.5 ${
                          isActive ? 'bg-white/20 text-white font-bold' : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Footer Info in Sidebar */}
      {!isCollapsed && (
        <div className="p-3 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500">
          <div className="font-bold text-slate-800 mb-0.5">Intent & Recommendation Engines</div>
          <div className="text-[10px] text-slate-500">Real-time ML personalization pipeline</div>
        </div>
      )}
    </aside>
  );
};
