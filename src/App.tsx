import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/common/Header';
import { LeftNav } from './components/common/LeftNav';
import { ScenarioSelector } from './components/common/ScenarioSelector';
import { JourneyTracker } from './components/common/JourneyTracker';
import { StorefrontHome } from './components/storefront/StorefrontHome';
import { ProductListingPage } from './components/storefront/ProductListingPage';
import { ProductDetailPage } from './components/storefront/ProductDetailPage';
import { CartPage } from './components/storefront/CartPage';
import { IntelligencePanel } from './components/intelligence/IntelligencePanel';
import { CustomerJourneyScreen } from './components/intelligence/CustomerJourneyScreen';
import { ModelIntelligence } from './components/intelligence/ModelIntelligence';
import { ModelEvidence } from './components/intelligence/ModelEvidence';
import { RecommendationLab } from './components/intelligence/RecommendationLab';
import { BusinessImpactCalculator } from './components/intelligence/BusinessImpactCalculator';
import { ModelArchitecture } from './components/intelligence/ModelArchitecture';
import { StraiveContribution } from './components/intelligence/StraiveContribution';

function MainContent() {
  const { navigationTab, storefrontPage, showMLPanel, toggleMLPanel } = useApp();

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-100">
      {/* Experience Demo Tab Main Layout */}
      {navigationTab === 'experience' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Top Scenario Selector */}
          <ScenarioSelector />

          {/* Horizontal Journey Stepper */}
          <JourneyTracker />

          {/* Two-Pane Main Split */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left Storefront Canvas */}
            <main
              className={`flex-1 overflow-y-auto transition-all duration-300 ${
                showMLPanel ? 'w-full lg:w-[68%]' : 'w-full'
              }`}
            >
              {storefrontPage === 'home' && <StorefrontHome />}
              {storefrontPage === 'plp' && <ProductListingPage />}
              {storefrontPage === 'pdp' && <ProductDetailPage />}
              {storefrontPage === 'cart' && <CartPage />}
            </main>

            {/* Right ML Intelligence Trace Panel */}
            {showMLPanel && (
              <aside className="hidden lg:block w-[32%] shrink-0 h-full overflow-hidden">
                <IntelligencePanel />
              </aside>
            )}
          </div>

          {/* Floating AI Explanation Layer Pill Button (when ML Panel is closed) */}
          {!showMLPanel && (
            <button
              onClick={toggleMLPanel}
              className="fixed bottom-4 right-4 z-50 bg-slate-950 text-white hover:bg-indigo-900 px-4 py-2.5 rounded-full shadow-2xl border border-slate-700 flex items-center space-x-2.5 transition-all hover:scale-105 active:scale-95 group font-sans"
              title="Open AI Explanation Layer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold font-mono tracking-wide text-slate-200 group-hover:text-white">
                💡 AI Explanation Layer
              </span>
            </button>
          )}
        </div>
      )}

      {/* Other Navigation Screens */}
      {navigationTab === 'journey' && (
        <main className="flex-1 overflow-y-auto">
          <CustomerJourneyScreen />
        </main>
      )}

      {navigationTab === 'model_intelligence' && (
        <main className="flex-1 overflow-y-auto">
          <ModelIntelligence />
        </main>
      )}

      {navigationTab === 'model_evidence' && (
        <main className="flex-1 overflow-y-auto">
          <ModelEvidence />
        </main>
      )}

      {navigationTab === 'lab' && (
        <main className="flex-1 overflow-y-auto">
          <RecommendationLab />
        </main>
      )}

      {navigationTab === 'business_impact' && (
        <main className="flex-1 overflow-y-auto">
          <BusinessImpactCalculator />
        </main>
      )}

      {navigationTab === 'architecture' && (
        <main className="flex-1 overflow-y-auto">
          <ModelArchitecture />
        </main>
      )}

      {navigationTab === 'straive_contribution' && (
        <main className="flex-1 overflow-y-auto">
          <StraiveContribution />
        </main>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-950 font-sans antialiased text-slate-100">
        <Header />
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <LeftNav />
          <MainContent />
        </div>
      </div>
    </AppProvider>
  );
}
