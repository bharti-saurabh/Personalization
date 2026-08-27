/**
 * One row per personalized module on the stage right now.
 *
 * WHY THIS IS A LIST OF MODULES AND NOT A LIST OF EVENTS
 * -----------------------------------------------------
 * The event stream answers "what has happened", and it lives one tab across in
 * Signals. This tab answers a different and harder question: "what is on that
 * page because of a decision, and what would be there otherwise". Those are not
 * the same list, and merging them was the single biggest source of confusion in
 * the old panel - a reader watching decisions scroll past could never tell
 * which of them were still standing on the screen in front of them.
 *
 * INACTIVE ROWS ARE THE POINT
 * ---------------------------
 * A module renders here even when it is NOT personalized, marked stood down,
 * with the reason. A hero that refused to fire because the team posterior did
 * not clear its bar is a decision, and it is the decision most worth showing to
 * a client who is about to ask what happens when the model is wrong. A rail
 * that listed only the wins would be a brochure.
 *
 * Every row links to the Explain overlay, which is the only route by which any
 * of this is allowed to appear over the storefront.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { stageModules } from '../../state/stageModules';
import { SLOT_LABEL } from '../../state/visitorModel';
import { SURFACE_POLICIES } from '../../ml/engine';
import { Eye, EyeOff, Zap, CircleSlash } from 'lucide-react';

export const DecisionsTab: React.FC = () => {
  const {
    storefrontPage,
    visitorModel,
    isPersonalizationOn,
    similarityMatches,
    complementMatches,
    intentPrediction,
    explainOn,
    toggleExplain,
    explainFocus,
    setExplainFocus,
    shellView,
  } = useApp();

  const modules = React.useMemo(
    () =>
      stageModules({
        page: storefrontPage,
        model: visitorModel,
        personalizationOn: isPersonalizationOn,
        heroThreshold: SURFACE_POLICIES.hero.leadThreshold,
        similarCount: similarityMatches.length,
        complementCount: complementMatches.length,
      }),
    [storefrontPage, visitorModel, isPersonalizationOn, similarityMatches.length, complementMatches.length]
  );

  const ms = intentPrediction.inferenceTimeMs;
  const activeCount = modules.filter((m) => m.active).length;
  const onStorefront = shellView === 'storefront';

  return (
    <div className="h-full overflow-y-auto p-2.5 space-y-2.5">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
            On the {storefrontPage === 'plp' ? 'catalog' : storefrontPage} page
          </span>
          <span className="text-[9.5px] font-mono text-emerald-400">{ms < 0.1 ? '<0.1ms' : `${ms}ms`}</span>
        </div>
        <p className="mt-1 text-[10px] text-slate-400 leading-relaxed">
          <span className="text-white font-semibold">{activeCount}</span> of {modules.length} modules are personalized
          decisions. The rest are standing down, and each says why.
        </p>

        <button
          onClick={toggleExplain}
          disabled={!onStorefront}
          title={
            onStorefront
              ? 'Draw a numbered marker on each module on the stage'
              : 'Available while the storefront is on the stage'
          }
          className={`mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10.5px] font-bold transition-colors disabled:opacity-40 ${
            explainOn
              ? 'bg-straive-500 text-white'
              : 'bg-white/5 text-slate-300 border border-white/15 hover:bg-white/10'
          }`}
        >
          {explainOn ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {explainOn ? 'Hide explain overlay' : 'Explain this page'}
        </button>
      </div>

      {modules.map((mod, i) => (
        /* The row is a button. Clicking it lights the matching marker on the
           stage, and turns the overlay on if it was off - a row that pointed at
           a marker nobody could see would be pointing at nothing. */
        <div
          key={mod.id}
          role="button"
          tabIndex={0}
          onClick={() => {
            if (!onStorefront) return;
            if (!explainOn) toggleExplain();
            setExplainFocus(explainFocus === mod.id ? null : mod.id);
          }}
          className={`rounded-lg border overflow-hidden transition-colors ${
            explainFocus === mod.id
              ? 'border-straive-400 bg-straive-500/10 ring-1 ring-straive-400/40'
              : mod.active
                ? 'border-white/10 bg-white/[0.03] hover:border-white/25'
                : 'border-amber-500/25 bg-amber-500/[0.05] hover:border-amber-400/50'
          } ${onStorefront ? 'cursor-pointer' : ''}`}
        >
          <div className="px-2.5 pt-2 pb-1.5 flex items-start gap-2">
            <span
              className={`shrink-0 grid place-items-center h-5 w-5 rounded-full text-[10px] font-mono font-bold ${
                explainFocus === mod.id
                  ? 'bg-white text-straive-600'
                  : mod.active
                    ? 'bg-straive-500 text-white'
                    : 'bg-amber-500/25 text-amber-200'
              }`}
              title={explainOn ? 'Marker number drawn on the stage' : 'Turn on the explain overlay to see this on the page'}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-white truncate">{mod.name}</span>
                {!mod.active && (
                  <span className="shrink-0 flex items-center gap-0.5 text-[8.5px] font-bold text-amber-300">
                    <CircleSlash className="h-2.5 w-2.5" />
                    stood down
                  </span>
                )}
              </div>
              <span className="block text-[9px] text-slate-500 truncate">{mod.model}</span>
            </div>
          </div>

          <div className="px-2.5 pb-2 space-y-1">
            <Row label="Fed by" value={SLOT_LABEL[mod.slot]} mono={mod.slot} />
            <Row label="Chose" value={mod.chose} accent />
            <Row label="Score" value={`${(mod.score * 100).toFixed(0)}%`} />
            <Row label="Beat" value={mod.beat ?? 'nothing else was in contention'} dim={!mod.beat} />
          </div>

          <div
            className={`px-2.5 py-1.5 border-t text-[9.5px] leading-relaxed ${
              mod.active ? 'border-white/8 bg-black/20 text-slate-400' : 'border-amber-500/20 bg-amber-500/[0.06] text-amber-200/90'
            }`}
          >
            {mod.reason}
          </div>
        </div>
      ))}

      <p className="text-[9px] text-slate-600 leading-relaxed flex items-start gap-1 px-0.5">
        <Zap className="h-2.5 w-2.5 mt-0.5 shrink-0 text-straive-500" />
        Latency is the measured wall time of the intent inference in this browser, not a projected production figure.
      </p>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; mono?: string; accent?: boolean; dim?: boolean }> = ({
  label,
  value,
  mono,
  accent,
  dim,
}) => (
  <div className="flex items-baseline gap-2 text-[10px]">
    <span className="w-12 shrink-0 text-slate-600">{label}</span>
    <span className={`flex-1 min-w-0 truncate ${dim ? 'text-slate-600 italic' : accent ? 'text-white font-semibold' : 'text-slate-300'}`}>
      {value}
    </span>
    {mono && <span className="shrink-0 text-[8.5px] font-mono text-slate-600">{mono}</span>}
  </div>
);
