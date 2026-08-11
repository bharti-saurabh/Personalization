import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductCard } from './ProductCard';
import { Sparkles, SlidersHorizontal, Info, HelpCircle, ChevronDown, Filter } from 'lucide-react';
import { TeamId, Department } from '../../types';

export const ProductListingPage: React.FC = () => {
  const {
    products,
    isPersonalizationOn,
    topazPrediction,
    setSelectedProduct,
    setStorefrontPage,
    recordEvent,
    toggleMLPanel,
    showMLPanel,
    activeTeamOverride,
    setActiveTeamOverride,
    activeDeptFilter,
    setActiveDeptFilter,
  } = useApp();

  const selectedTeamFilter = activeTeamOverride || 'All';
  const selectedDeptFilter = activeDeptFilter || 'All';
  const [sortBy, setSortBy] = useState<'popular' | 'price_low' | 'price_high'>('popular');

  const topTeam = topazPrediction.teams[0]?.team || 'Eagles';

  // Dynamic or static lists
  const defaultTeams = ['Eagles', '76ers', 'Phillies', 'Cowboys', 'Chiefs', 'Lakers'];
  const defaultDepts = ['Jerseys', 'Hats', 'Hoodies', 'T-shirts', 'Collectibles', 'Accessories', 'Kids'];
  const defaultPlayers = ['Jalen Hurts', 'A.J. Brown', 'Joel Embiid', 'Bryce Harper', 'Patrick Mahomes', 'LeBron James'];

  const teamsList = isPersonalizationOn
    ? ['All', ...Array.from(new Set(topazPrediction.teams.map((t) => t.team)))]
    : ['All', ...defaultTeams.slice().sort()];

  const departmentsList = isPersonalizationOn
    ? ['All', ...Array.from(new Set(topazPrediction.departments.map((d) => d.department)))]
    : ['All', ...defaultDepts.slice().sort()];

  const playersList = defaultPlayers;

  // Determine filter section sequence dynamically
  const filterSequence = isPersonalizationOn
    ? topazPrediction.topFilters
    : ['Team', 'Department', 'Player', 'Size', 'Price'];

  const renderFilterSection = (filterKey: string) => {
    if (filterKey === 'Team') {
      return (
        <div key="Team" className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase">Team</label>
            {isPersonalizationOn && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                ML Ranked
              </span>
            )}
          </div>
          <div className="space-y-1">
            {teamsList.map((team) => {
              const teamProbObj = topazPrediction.teams.find((t) => t.team === team);
              const probPct = teamProbObj ? Math.round(teamProbObj.probability * 100) : 0;
              return (
                <button
                  key={team}
                  onClick={() => {
                    setActiveTeamOverride(team === 'All' ? null : (team as TeamId));
                    recordEvent(`Filtered PLP by Team: ${team}`);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs font-semibold flex justify-between items-center transition-all ${
                    selectedTeamFilter === team
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{team}</span>
                  {team !== 'All' && isPersonalizationOn && probPct > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                        selectedTeamFilter === team
                          ? 'bg-red-600 text-white'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {probPct}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (filterKey === 'Department') {
      return (
        <div key="Department" className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase">Department</label>
            {isPersonalizationOn && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                ML Ranked
              </span>
            )}
          </div>
          <div className="space-y-1">
            {departmentsList.map((dept) => {
              const deptProbObj = topazPrediction.departments.find((d) => d.department === dept);
              const probPct = deptProbObj ? Math.round(deptProbObj.probability * 100) : 0;
              return (
                <button
                  key={dept}
                  onClick={() => {
                    setActiveDeptFilter(dept === 'All' ? null : dept);
                    recordEvent(`Filtered PLP by Department: ${dept}`);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs font-semibold flex justify-between items-center transition-all ${
                    selectedDeptFilter === dept
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{dept}</span>
                  {dept !== 'All' && isPersonalizationOn && probPct > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                        selectedDeptFilter === dept
                          ? 'bg-red-600 text-white'
                          : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                      }`}
                    >
                      {probPct}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (filterKey === 'Player') {
      return (
        <div key="Player" className="space-y-2">
          <label className="block text-xs font-bold text-slate-700 uppercase">Player Filter</label>
          <div className="flex flex-wrap gap-1">
            {playersList.map((player) => (
              <button
                key={player}
                onClick={() => recordEvent(`Applied Player Filter: ${player}`)}
                className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1 rounded-md font-medium"
              >
                {player}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Auxiliary filters (Size, Price, Hat Style, Jersey Type, Kids Age Segment, etc.)
    return (
      <div key={filterKey} className="space-y-2">
        <label className="block text-xs font-bold text-slate-700 uppercase">{filterKey}</label>
        <div className="flex flex-wrap gap-1">
          {filterKey.includes('Size')
            ? ['S', 'M', 'L', 'XL', '2XL'].map((s) => (
                <button
                  key={s}
                  onClick={() => recordEvent(`Applied ${filterKey}: ${s}`)}
                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono font-semibold"
                >
                  {s}
                </button>
              ))
            : filterKey.includes('Price')
            ? ['Under $50', '$50-$100', '$100-$200', '$200+'].map((p) => (
                <button
                  key={p}
                  onClick={() => recordEvent(`Applied ${filterKey}: ${p}`)}
                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono"
                >
                  {p}
                </button>
              ))
            : ['Fitted', 'Snapback', 'Flex Fit', 'Adjustable'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => recordEvent(`Applied ${filterKey}: ${opt}`)}
                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded"
                >
                  {opt}
                </button>
              ))}
        </div>
      </div>
    );
  };

  // Filter products
  let filteredProducts = products.filter((p) => {
    if (selectedTeamFilter !== 'All' && p.team !== selectedTeamFilter) return false;
    if (selectedDeptFilter !== 'All' && p.department !== selectedDeptFilter) return false;
    return true;
  });

  if (sortBy === 'price_low') {
    filteredProducts.sort((a, b) => a.price - b.price);
  } else if (sortBy === 'price_high') {
    filteredProducts.sort((a, b) => b.price - a.price);
  } else {
    filteredProducts.sort((a, b) => b.popularity - a.popularity);
  }

  const handleProductSelect = (p: typeof products[0]) => {
    setSelectedProduct(p);
    setStorefrontPage('pdp');
    recordEvent(`Selected PLP Product: ${p.name}`, {
      productId: p.id,
      team: p.team,
      department: p.department,
    });
  };

  const handleWhyFilterOrderClick = () => {
    if (!showMLPanel) toggleMLPanel();
    recordEvent('Clicked "Why this filter order?" button');
  };

  return (
    <div className="space-y-6 pb-12 bg-slate-50 min-h-screen">
      {/* Team Header Banner */}
      <div className="bg-slate-900 text-white p-6 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-red-400 font-extrabold uppercase tracking-widest mb-1">
              OFFICIAL MERCHANDISE SHOP
            </div>
            <h1 className="text-3xl font-black font-serif uppercase tracking-tight">
              {selectedTeamFilter === 'All' ? 'ALL FAN MERCHANDISE' : `${selectedTeamFilter} OFFICIAL SHOP`}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Showing {filteredProducts.length} items • Authentic Nike, New Era, '47 Brand & Mitchell & Ness
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <label className="text-xs text-slate-300 font-semibold">Sort By:</label>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-red-500"
            >
              <option value="popular">
                {isPersonalizationOn ? 'Predicted Intent Relevance' : 'Most Popular'}
              </option>
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Filter Sidebar with Dynamic Filter Prioritization */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2 font-bold text-sm text-slate-900">
                <Filter className="h-4 w-4 text-red-600" />
                <span>Filter Products</span>
              </div>
              {isPersonalizationOn && (
                <button
                  onClick={handleWhyFilterOrderClick}
                  className="text-[10px] bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-1 rounded font-semibold border border-indigo-200 flex items-center space-x-1"
                  title="Inspect ML rationale for filter sequence"
                >
                  <Sparkles className="h-3 w-3 text-indigo-600" />
                  <span>Why this filter order?</span>
                </button>
              )}
            </div>

            {/* Dynamic Filter Notice */}
            {isPersonalizationOn && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-2.5 rounded-lg text-xs space-y-1">
                <div className="font-bold flex items-center space-x-1">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Dynamic Filter Order</span>
                </div>
                <div className="text-[11px] text-emerald-800">
                  Filters reordered for active fan profile: <b>{topazPrediction.topFilters.join(' → ')}</b>
                </div>
              </div>
            )}

            {/* Dynamic Filter Sections Sequence */}
            <div className="space-y-4 divide-y divide-slate-100 pt-1">
              {filterSequence.map((filterKey, idx) => (
                <div key={filterKey} className={idx > 0 ? 'pt-3' : ''}>
                  {renderFilterSection(filterKey)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Product Grid Main Area */}
        <div className="lg:col-span-3 space-y-4">
          {filteredProducts.length === 0 ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center space-y-3">
              <Info className="h-8 w-8 text-slate-400 mx-auto" />
              <h3 className="font-bold text-slate-800 text-sm">No products found matching current filters</h3>
              <p className="text-xs text-slate-500">Try clearing or adjusting your team or department filters.</p>
              <button
                onClick={() => {
                  setActiveTeamOverride(null);
                  setActiveDeptFilter(null);
                }}
                className="bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-lg"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((p) => (
                <ProductCard key={p.id} product={p} onSelect={handleProductSelect} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
