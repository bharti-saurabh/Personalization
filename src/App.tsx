import React, { Suspense, lazy, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AppBar } from './components/common/AppBar';
import { Header } from './components/common/Header';
import { DemoStrip } from './components/common/DemoStrip';
import { DeepDiveRail, DEEP_DIVE_BY_ID } from './components/common/DeepDiveRail';
import { StorefrontHome } from './components/storefront/StorefrontHome';
import { ProductListingPage } from './components/storefront/ProductListingPage';
import { ProductDetailPage } from './components/storefront/ProductDetailPage';
import { CartPage } from './components/storefront/CartPage';
import { IntelligencePanel } from './components/intelligence/IntelligencePanel';

// The storefront is what the demo opens on and it draws no charts. Everything
// behind the deep-dive launcher is lazy so Recharts - by itself half the bundle -
// stays off the first-paint path and loads when a screen is actually opened.
const CustomerJourneyScreen = lazy(() =>
  import('./components/intelligence/CustomerJourneyScreen').then((m) => ({ default: m.CustomerJourneyScreen }))
);
const ModelIntelligence = lazy(() =>
  import('./components/intelligence/ModelIntelligence').then((m) => ({ default: m.ModelIntelligence }))
);
const ModelEvidence = lazy(() =>
  import('./components/intelligence/ModelEvidence').then((m) => ({ default: m.ModelEvidence }))
);
const PipelineTrace = lazy(() =>
  import('./components/intelligence/PipelineTrace').then((m) => ({ default: m.PipelineTrace }))
);
const RecommendationLab = lazy(() =>
  import('./components/intelligence/RecommendationLab').then((m) => ({ default: m.RecommendationLab }))
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

/** Brief hold while a lazy deep-dive chunk arrives. */
const TabFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-50 text-xs text-slate-500 font-mono">
    Loading module...
  </div>
);

/** The storefront itself - the only thing on the stage by default. */
function StorefrontStage() {
  const { storefrontPage } = useApp();
  return (
    <>
      {storefrontPage === 'home' && <StorefrontHome />}
      {storefrontPage === 'plp' && <ProductListingPage />}
      {storefrontPage === 'pdp' && <ProductDetailPage />}
      {storefrontPage === 'cart' && <CartPage />}
    </>
  );
}

/**
 * A deep-dive screen takes over the stage rather than opening in the narrow
 * side panel: every one of these is chart- or table-heavy and unreadable at
 * 30% width. The bar above it is the only way back that does not depend on the
 * side panel being visible.
 */
function DeepDiveStage() {
  const { navigationTab } = useApp();
  const meta = DEEP_DIVE_BY_ID[navigationTab];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Title only. The way back used to be a button here as well; the left
          rail carries it now, in the same place on every screen. */}
      <div className="shrink-0 bg-slate-900 text-white px-4 py-2 border-b border-slate-800">
        <div className="text-xs font-extrabold uppercase tracking-wider truncate">{meta?.label ?? 'Deep Dive'}</div>
        {meta?.blurb && <div className="text-[10px] text-slate-400 truncate">{meta.blurb}</div>}
      </div>

      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<TabFallback />}>
          {navigationTab === 'journey' && <CustomerJourneyScreen />}
          {navigationTab === 'comparison' && <PersonalizationComparison />}
          {navigationTab === 'model_intelligence' && <ModelIntelligence />}
          {navigationTab === 'model_evidence' && <ModelEvidence />}
          {navigationTab === 'pipeline' && <PipelineTrace />}
          {navigationTab === 'lab' && <RecommendationLab />}
          {navigationTab === 'architecture' && <ModelArchitecture />}
          {navigationTab === 'straive_contribution' && <StraiveContribution />}
        </Suspense>
      </div>
    </div>
  );
}

function MainContent() {
  const { navigationTab, showMLPanel, toggleMLPanel } = useApp();
  const isStorefront = navigationTab === 'experience';

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-100">
      {/* Demo chrome: which shopper we are simulating, and where they are. Kept
          above the split so it reads as a control strip for the whole stage. */}
      {isStorefront && <DemoStrip />}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Shopping stage. Takes the full width when the trace panel is hidden. */}
        <main
          className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${
            showMLPanel ? 'lg:w-[70%]' : 'w-full'
          }`}
        >
          {isStorefront ? (
            <div className="flex-1 overflow-y-auto">
              <StorefrontStage />
            </div>
          ) : (
            <DeepDiveStage />
          )}
        </main>

        {/* Behind-the-scenes panel: what the models just did, and the launcher
            for the deeper screens. */}
        {showMLPanel && (
          <aside className="hidden lg:block w-[30%] shrink-0 h-full overflow-hidden">
            <IntelligencePanel />
          </aside>
        )}
      </div>

      {/* Way back in when the panel is hidden. */}
      {!showMLPanel && (
        <button
          onClick={toggleMLPanel}
          className="fixed bottom-4 right-4 z-50 bg-slate-950 text-white hover:bg-indigo-900 px-4 py-2.5 rounded-full shadow-2xl border border-slate-700 flex items-center space-x-2.5 transition-all hover:scale-105 active:scale-95 group font-sans"
          title="Show what the models are doing"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold font-mono tracking-wide text-slate-200 group-hover:text-white">
            Behind the Scenes
          </span>
        </button>
      )}
    </div>
  );
}

export default function App() {
  // The rail starts open. It is how you reach seven of the nine screens, and a
  // navigator you have to discover is not a navigator.
  const [railOpen, setRailOpen] = useState(true);

  return (
    <AppProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-ink-950 font-sans antialiased text-slate-100">
        <AppBar />
        <Header />
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <DeepDiveRail open={railOpen} onToggle={() => setRailOpen((v) => !v)} />
          <MainContent />
        </div>
      </div>
    </AppProvider>
  );
}
