/**
 * The one thing allowed to put model information over the storefront.
 *
 * Off by default, driven from the rail, and it draws a numbered marker rather
 * than a caption: the number is meaningless on its own, which is the point. It
 * says "this module was a decision, and row 4 in the rail is that decision"
 * without putting a score, a probability or the word "predicted" on a shop
 * front. The explaining happens in the rail, where engineering voice belongs.
 *
 * This is a deliberate reveal, not permanent chrome. Turn it off and the store
 * is a store again, with no residue.
 *
 * WHY IT IS AN INLINE COMPONENT AND NOT AN OVERLAY LAYER
 * ------------------------------------------------------
 * The obvious build is a single absolutely-positioned layer that measures every
 * `[data-module]` node and draws badges at their rectangles. That layer has to
 * re-measure on scroll, on resize, on every carousel page and on every re-render
 * that changes a module's height, and it is wrong for one frame every time it
 * misses one. A marker rendered inside the module it marks is positioned by the
 * same layout pass as the module, so it cannot drift. It costs each module one
 * `relative` and one line of JSX.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { stageModules, markerFor } from '../../state/stageModules';
import { SURFACE_POLICIES } from '../../ml/engine';

export const ExplainMarker: React.FC<{ id: string; className?: string }> = ({
  id,
  className = 'top-2 right-2',
}) => {
  const {
    explainOn,
    explainFocus,
    setExplainFocus,
    storefrontPage,
    visitorModel,
    isPersonalizationOn,
    similarityMatches,
    complementMatches,
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

  if (!explainOn) return null;

  const n = markerFor(modules, id);
  if (n === null) return null;

  const module = modules.find((m) => m.id === id);
  const focused = explainFocus === id;
  const stoodDown = module ? !module.active : false;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setExplainFocus(focused ? null : id);
      }}
      title={module?.name}
      className={`absolute z-20 grid place-items-center h-6 w-6 rounded-full font-mono text-[11px] font-black shadow-lg ring-2 transition-all ${className} ${
        focused
          ? 'bg-white text-straive-600 ring-white scale-110'
          : stoodDown
            ? 'bg-amber-400 text-amber-950 ring-amber-200/60 hover:scale-110'
            : 'bg-straive-500 text-white ring-straive-300/60 hover:scale-110'
      }`}
    >
      {n}
    </button>
  );
};
