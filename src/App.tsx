import React, { Suspense, lazy } from 'react';
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

// The storefront is what the demo opens on and it draws no charts. Everything
// behind the other nav tabs is lazy so Recharts - by itself half the bundle -
// stays off the first-paint path and loads when a tab is actually opened.
const CustomerJourneyScreen = lazy(() =>
  import('./components/intelligence/CustomerJourneyScreen').then((m) => ({ default: m.CustomerJourneyScreen }))
);
const ModelIntelligence = lazy(() =>
  import('./components/intelligence/ModelIntelligence').then((m) => ({ default: m.ModelIntelligence }))
);
const ModelEvidence = lazy(() =>
  import('./components/intelligence/ModelEvidence').then((m) => ({ default: m.ModelEvidence }))
);
const RecommendationLab = lazy(() =>
  import('./components/intelligence/RecommendationLab').then((m) => ({ default: m.RecommendationLab }))
);
const BusinessImpactCalculator = lazy(() =>
  import('./components/intelligence/BusinessImpactCalculator').then((m) => ({ default: m.BusinessImpactCalculator }))
);
const PersonalizationComparison = lazy(() =>
  import('./components/storefront/PersonalizationComparison').then((m) => ({ default: m.PersonalizationComparison }))
);
const ModelArchitecture = lazy(() =>
  import('./components/intelligence/ModelArchitecture').then((m) => ({ default: m.ModelArchitecture }))
);
const StraiveContribution = lazy(() =>
  import('./components/intelligence/StraiveContribution').then((m) => ({ default: m.StraiveContribution }))
);

/** Brief hold while a lazy tab chunk arrives. */
const TabFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-50 text-xs text-slate-500 font-mono">
    Loading module...
  </div>
);

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

      {/* Other Navigation Screens - all lazily loaded */}
      <Suspense fallback={navigationTab === 'experience' ? null : <TabFallback />}>
      {navigationTab === 'journey' && (
        <main className="flex-1 overflow-y-auto">
          <CustomerJourneyScreen />
        </main>
      )}

      {navigationTab === 'comparison' && (
        <main className="flex-1 overflow-y-auto">
          <PersonalizationComparison />
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
      </Suspense>
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
