/**
 * Director controls: everything that decides what is being simulated.
 *
 * WHY THESE FOUR THINGS SIT TOGETHER AT THE TOP OF THE RAIL
 * --------------------------------------------------------
 * They used to be a strip above the storefront, which put four operator
 * controls inside the customer's field of view and made the shop look like an
 * admin console. They are not part of the shop. They are the demo's stage
 * directions - who the shopper is, how well we know them, where they are
 * standing, and what the world is doing - and every one of them is an INPUT to
 * the engine. Inputs belong on the engine side of the frame.
 *
 * THE TWO-AXIS CONTROL
 * --------------------
 * Persona runs down one axis, identity stage across the other, and the cell is
 * the crossing point. This is the whole argument of section seven made visible:
 * identity is not a step that happens after you pick a persona, it is a second
 * dimension. The same die-hard loyalist is a different problem at Anonymous
 * than at Member - the beliefs we want are identical and the evidence
 * available to support them is not - and a control shaped as one list after
 * another would hide that. Moving across a row changes confidence without
 * changing who the shopper is, and you can watch it happen.
 *
 * THE SLIDERS
 * -----------
 * They exist to answer "why these sixteen personas". They are examples; the
 * space is continuous. Moving a slider re-synthesises the browsing history the
 * shopper arrived with and re-folds the profile, so the storefront genuinely
 * follows rather than switching between authored states.
 */

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { DIMENSIONS, PERSONA_GROUPS, PersonaDimensions } from '../../state/personas';
import { IdentityState } from '../../ml/engine';
import { StorefrontPage } from '../../types';
import { describeEvent, fireTemplate, DEFAULT_CLOCK, MarketEventTemplate } from '../../sim/clock';
import { MarketEventKind } from '../../types';
import {
  ChevronDown,
  House,
  LayoutGrid,
  Package,
  ShoppingCart,
  Loader2,
  RotateCcw,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';

const IDENTITY_AXIS: { id: IdentityState; short: string; label: string }[] = [
  { id: 'anonymous', short: 'An', label: 'Anonymous. Nothing but the request itself' },
  { id: 'contextual', short: 'Cx', label: 'Contextual. Region, campaign and device, no identity' },
  { id: 'returning', short: 'Rt', label: 'Returning. A cookie we have seen before' },
  { id: 'identified', short: 'Id', label: 'Identified. Signed in, order history readable' },
  { id: 'member', short: 'Mb', label: 'Member. Loyalty tier and consent on file' },
];

const KIND_LABEL: Record<MarketEventKind, string> = {
  TRADE: 'Trade',
  INJURY: 'Injury',
  PLAYOFF_WIN: 'Playoff win',
  CHAMPIONSHIP: 'Championship',
  NEW_SIGNING: 'Signing',
  RETIREMENT: 'Retirement',
  KIT_LAUNCH: 'Kit launch',
};

const PAGES: { id: StorefrontPage; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'plp', label: 'Catalog', icon: LayoutGrid },
  { id: 'pdp', label: 'Product', icon: Package },
  { id: 'cart', label: 'Cart', icon: ShoppingCart },
];

/* ---------------------------------------------------------------- pieces -- */

const Label: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between gap-2 mb-1.5">
    <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</span>
    {right}
  </div>
);

const Dimension: React.FC<{
  id: keyof PersonaDimensions;
  label: string;
  low: string;
  high: string;
  effect: string;
  value: number;
}> = ({ id, label, low, high, effect, value }) => {
  const { setPersonaDimension } = useApp();
  return (
    <div title={effect}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold text-slate-300">{label}</span>
        <span className="text-[9.5px] font-mono text-straive-300">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.02}
        value={value}
        onChange={(e) => setPersonaDimension(id, Number(e.target.value))}
        className="w-full mt-0.5 accent-straive-500 h-1 cursor-pointer"
        aria-label={label}
      />
      <div className="flex items-center justify-between text-[8.5px] text-slate-600 -mt-0.5">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------- panel -- */

export const DirectorControls: React.FC = () => {
  const {
    personaPresets,
    personaPresetId,
    personaDimensions,
    isCustomPersona,
    selectPersona,
    identityState,
    promoteTo,
    storefrontPage,
    setStorefrontPage,
    setNavigationTab,
    eventDeck,
    fireEvent,
    marketRebuilding,
    firedEvents,
    marketClockLabel,
    resetMarket,
    isPersonalizationOn,
    togglePersonalization,
  } = useApp();

  const [open, setOpen] = useState(true);
  const [showSliders, setShowSliders] = useState(false);

  const current = personaPresets.find((p) => p.id === personaPresetId);

  const goto = (page: StorefrontPage) => {
    setNavigationTab('experience');
    setStorefrontPage(page);
  };

  return (
    <div className="shrink-0 border-b border-white/10 bg-ink-950">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <span className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Director controls
          </span>
          <span className="block text-[11px] font-semibold text-white truncate">
            {current?.label ?? 'Custom'}
            {isCustomPersona && <span className="text-straive-400"> · off preset</span>}
            <span className="text-slate-500"> · {identityState}</span>
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-500 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3.5 max-h-[52vh] overflow-y-auto scrollbar-none">
          {/* ------------------------------------------------ the master switch --
              This was a pill in the app bar, over the storefront, which put the
              single most consequential control of the demo inside the thing it
              controls. It is a director control: it belongs with the persona and
              the market events, not on the shop. Off, every ranking on the stage
              falls back to popularity and alphabetical order, and every tab in
              this rail says so rather than going blank. */}
          <button
            onClick={togglePersonalization}
            className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
              isPersonalizationOn
                ? 'border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/15'
                : 'border-white/15 bg-white/5 hover:bg-white/10'
            }`}
          >
            <span
              className={`shrink-0 relative h-3.5 w-6 rounded-full transition-colors ${
                isPersonalizationOn ? 'bg-emerald-400' : 'bg-slate-600'
              }`}
            >
              <span
                className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${
                  isPersonalizationOn ? 'left-3' : 'left-0.5'
                }`}
              />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[10.5px] font-bold text-white">
                Personalization {isPersonalizationOn ? 'on' : 'off'}
              </span>
              <span className="block text-[9px] text-slate-500 truncate">
                {isPersonalizationOn
                  ? 'Every surface is reading the visitor model'
                  : 'Popularity and alphabetical order only'}
              </span>
            </span>
          </button>

          {/* ---------------------------------------------- persona x identity -- */}
          <div>
            <Label
              right={
                <span className="text-[8.5px] text-slate-600">persona ↓ · identity →</span>
              }
            >
              Who, and how well we know them
            </Label>

            <div className="rounded-lg border border-white/10 overflow-hidden">
              <div className="grid grid-cols-[1fr_repeat(5,20px)] items-center gap-x-1 px-2 py-1 bg-white/5 sticky top-0">
                <span className="text-[8.5px] text-slate-600" />
                {IDENTITY_AXIS.map((i) => (
                  <span
                    key={i.id}
                    title={i.label}
                    className={`text-[8px] font-mono text-center ${
                      identityState === i.id ? 'text-straive-300 font-bold' : 'text-slate-600'
                    }`}
                  >
                    {i.short}
                  </span>
                ))}
              </div>

              <div className="max-h-56 overflow-y-auto scrollbar-none">
                {PERSONA_GROUPS.map((group) => (
                  <div key={group}>
                    <div className="px-2 pt-1.5 pb-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-slate-600">
                      {group}
                    </div>
                    {personaPresets
                      .filter((p) => p.group === group)
                      .map((p) => {
                        const isRow = p.id === personaPresetId;
                        return (
                          <div
                            key={p.id}
                            className={`grid grid-cols-[1fr_repeat(5,20px)] items-center gap-x-1 px-2 py-0.5 ${
                              isRow ? 'bg-straive-500/12' : 'hover:bg-white/5'
                            }`}
                          >
                            <button
                              onClick={() => selectPersona(p.id)}
                              title={p.blurb}
                              className={`text-left text-[10px] truncate py-0.5 ${
                                isRow ? 'text-white font-semibold' : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {p.label}
                            </button>
                            {IDENTITY_AXIS.map((i) => {
                              const here = isRow && identityState === i.id;
                              return (
                                <button
                                  key={i.id}
                                  title={`${p.label} at ${i.id}`}
                                  onClick={() => {
                                    // Setting the persona and the rung in one
                                    // click. Selecting a row already lands it on
                                    // its natural rung, so the promotion runs
                                    // afterwards and wins.
                                    if (!isRow) selectPersona(p.id);
                                    promoteTo(i.id);
                                  }}
                                  className="grid place-items-center h-4"
                                >
                                  <span
                                    className={`rounded-full transition-all ${
                                      here
                                        ? 'h-2.5 w-2.5 bg-straive-500 ring-2 ring-straive-500/30'
                                        : isRow
                                          ? 'h-1.5 w-1.5 bg-white/30 hover:bg-white/60'
                                          : 'h-1 w-1 bg-white/10 hover:bg-white/40'
                                    }`}
                                  />
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-1 text-[9px] text-slate-600 leading-relaxed">
              Moving along a row changes what evidence is available without changing who the shopper is. Watch the slot
              confidences move and the beliefs stay.
            </p>
          </div>

          {/* --------------------------------------------------------- sliders -- */}
          <div>
            <Label
              right={
                <button
                  onClick={() => setShowSliders((v) => !v)}
                  className="flex items-center gap-1 text-[9px] font-semibold text-straive-400 hover:text-straive-300"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  {showSliders ? 'Hide' : 'Show'}
                </button>
              }
            >
              Persona dimensions
            </Label>
            {showSliders ? (
              <div className="space-y-2.5 rounded-lg border border-white/10 p-2.5">
                {DIMENSIONS.map((dm) => (
                  <Dimension
                    key={dm.id}
                    id={dm.id}
                    label={dm.label}
                    low={dm.low}
                    high={dm.high}
                    effect={dm.effect}
                    value={personaDimensions[dm.id]}
                  />
                ))}
                <p className="text-[9px] text-slate-600 leading-relaxed pt-0.5">
                  The presets are points, not categories. Move off one and the history is re-synthesised and the profile
                  re-folded, so the storefront follows a shopper who does not have a name.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-1">
                {DIMENSIONS.map((dm) => (
                  <div key={dm.id} title={`${dm.label}: ${dm.effect}`} className="text-center">
                    <div className="h-8 w-full rounded bg-white/5 relative overflow-hidden">
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-straive-500/70"
                        style={{ height: `${Math.max(4, personaDimensions[dm.id] * 100)}%` }}
                      />
                    </div>
                    <span className="block mt-0.5 text-[7.5px] text-slate-600 leading-tight truncate">
                      {dm.label.split(' ')[0]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ------------------------------------------------------------ page -- */}
          <div>
            <Label>Simulated page</Label>
            <div className="grid grid-cols-4 gap-1">
              {PAGES.map((p) => {
                const Icon = p.icon;
                const active = storefrontPage === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => goto(p.id)}
                    className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[9.5px] font-semibold transition-colors ${
                      active ? 'bg-straive-500 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------------------------------------------------------- market -- */}
          <div>
            <Label
              right={
                <span className="text-[9px] font-mono text-slate-500">{marketClockLabel}</span>
              }
            >
              Market events
            </Label>
            <div className="grid grid-cols-2 gap-1">
              {eventDeck.map((template: MarketEventTemplate, idx) => {
                const preview = describeEvent(fireTemplate(template, DEFAULT_CLOCK, idx));
                const primary = idx === 0;
                // The button carries the kind, not the headline: seven headlines
                // at rail width all truncate to the same first three words.
                return (
                  <button
                    key={idx}
                    disabled={marketRebuilding}
                    onClick={() => fireEvent(template)}
                    title={preview.headline}
                    className={`px-2 py-1.5 rounded-lg text-[9.5px] font-semibold text-left truncate transition-colors disabled:opacity-40 ${
                      primary
                        ? 'bg-straive-500/20 text-straive-200 border border-straive-500/40 hover:bg-straive-500/30'
                        : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {KIND_LABEL[template.kind]}
                  </button>
                );
              })}
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-600 truncate">
                {marketRebuilding ? (
                  <span className="flex items-center gap-1 text-straive-300">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Re-simulating the population
                  </span>
                ) : firedEvents.length ? (
                  `${firedEvents.length} event${firedEvents.length === 1 ? '' : 's'} fired this session`
                ) : (
                  'Quiet world. Every published metric was measured here'
                )}
              </span>
              {firedEvents.length > 0 && (
                <button
                  onClick={resetMarket}
                  disabled={marketRebuilding}
                  className="flex items-center gap-1 text-[9px] font-semibold text-slate-400 hover:text-white disabled:opacity-40 shrink-0"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              )}
            </div>

            <p className="mt-1 text-[9px] text-slate-600 leading-relaxed flex items-start gap-1">
              <Sparkles className="h-2.5 w-2.5 mt-0.5 shrink-0 text-straive-500" />
              Firing an event rebuilds the catalog and re-simulates the shopper population. It takes a couple of
              seconds because it is a re-estimate, not a re-weighting.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
