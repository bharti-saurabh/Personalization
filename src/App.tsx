/**
 * The shell. Two zones, and the boundary between them is the whole argument.
 *
 * Left is the stage: a shop, inside browser chrome, and nothing in it is allowed
 * to look like model output. Right is the engine rail: everything the machine
 * believes, decided, saw and saved. A visitor should be able to point at the
 * screen and say which half is the product and which half is the explanation,
 * without being told.
 *
 * WHY THE BROWSER FRAME IS THERE
 * ------------------------------
 * The previous build put the storefront and the console side by side on the same
 * flat surface, and the result read as one application with an odd mix of retail
 * and engineering language. The frame fixes that in a way no amount of copy
 * could: a rounded container with an address bar is a universally understood
 * signal that what is inside it is a website. Everything outside it is then
 * obviously commentary.
 *
 * WHY THERE IS NO LEFT NAV
 * ------------------------
 * There were eleven destinations in a persistent left rail, which is a table of
 * contents, not a navigator - eleven equal-weight items give a visitor no idea
 * which one matters. They collapse to five views in a segmented control, and the
 * five are ordered the way the demo is told.
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ShellHeader } from './components/shell/ShellHeader';
import { BrowserFrame, storefrontUrl } from './components/shell/BrowserFrame';
import { Header } from './components/common/Header';
import { EngineRail } from './components/rail/EngineRail';
import { ModelsView } from './components/shell/ModelsView';
import { JourneyView } from './components/shell/JourneyView';
import { StorefrontHome } from './components/storefront/StorefrontHome';
import { ProductListingPage } from './components/storefront/ProductListingPage';
import { ProductDetailPage } from './components/storefront/ProductDetailPage';
import { CartPage } from './components/storefront/CartPage';
import { leaderOf } from './state/visitorModel';

const TwinStoreRace = React.lazy(() =>
  import('./components/storefront/TwinStoreRace').then((m) => ({ default: m.TwinStoreRace }))
);
const ModelArchitecture = React.lazy(() =>
  import('./components/intelligence/ModelArchitecture').then((m) => ({ default: m.ModelArchitecture }))
);
const StraiveContribution = React.lazy(() =>
  import('./components/intelligence/StraiveContribution').then((m) => ({ default: m.StraiveContribution }))
);

const Fallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-50 text-xs text-slate-500 font-mono">
    Loading module...
  </div>
);

/**
 * The shop, in its frame.
 *
 * The address is composed from the same state the pages render from, so it can
 * never describe a page that is not on screen. It is static text: a field that
 * looked typable but did nothing would be a worse lie than no field at all.
 */
function StorefrontStage() {
  const {
    storefrontPage,
    selectedProduct,
    searchResult,
    activeTeamOverride,
    activeLeagueFilter,
    visitorModel,
  } = useApp();

  const team = activeTeamOverride ?? leaderOf(visitorModel.topTeam)?.id ?? null;
  const league = activeLeagueFilter ?? leaderOf(visitorModel.topLeague)?.id ?? null;

  const url = storefrontUrl(storefrontPage, {
    team,
    league,
    product: storefrontPage === 'pdp' ? selectedProduct?.name : null,
    query: searchResult?.interpretation.raw ?? null,
  });

  return (
    <BrowserFrame url={url} siteHeader={<Header />}>
      {storefrontPage === 'home' && <StorefrontHome />}
      {storefrontPage === 'plp' && <ProductListingPage />}
      {storefrontPage === 'pdp' && <ProductDetailPage />}
      {storefrontPage === 'cart' && <CartPage />}
    </BrowserFrame>
  );
}

/** Everything that is not the shop. No browser frame: these are consoles, and
 *  putting them in a frame would say they were part of the site. */
function ConsoleStage() {
  const { shellView } = useApp();
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-100">
      <React.Suspense fallback={<Fallback />}>
        {shellView === 'journey' && <JourneyView />}
        {shellView === 'models' && <ModelsView />}
        {shellView === 'race' && (
          <div className="flex-1 overflow-y-auto">
            <TwinStoreRace />
          </div>
        )}
        {shellView === 'architecture' && (
          <div className="flex-1 overflow-y-auto">
            <ModelArchitecture />
          </div>
        )}
        {shellView === 'partnership' && (
          <div className="flex-1 overflow-y-auto">
            <StraiveContribution />
          </div>
        )}
      </React.Suspense>
    </div>
  );
}

function Shell() {
  const { shellView } = useApp();
  const onStage = shellView === 'storefront';

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-ink-950 font-sans antialiased text-slate-100">
      <ShellHeader />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {onStage ? <StorefrontStage /> : <ConsoleStage />}
        </main>
        {/* The rail stays on every view rather than appearing only over the
            shop. The director controls drive all five, and a console that
            vanishes when you change screens is a console you stop trusting.
            It collapses to an edge when a wide table needs the room. */}
        <EngineRail />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
