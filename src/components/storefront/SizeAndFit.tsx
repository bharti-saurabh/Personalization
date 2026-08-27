/**
 * The size facet, prefilled - and honest about what the prefill is worth.
 *
 * A hard-coded `useState('L')` used to sit behind this control. That is the
 * ordinary way to build a size selector and it quietly makes two claims that
 * are not true: that the store knows the shopper's size, and that every product
 * ships in the same ladder. Both are now decisions rather than defaults.
 *
 * WHAT IS ON SCREEN AND WHY
 *
 *   THE LADDER      comes from the product's own department scale, so a hat
 *                   offers S/M through OSFA and a kids tee offers 2T through
 *                   YL. Sizes that cannot be had are struck through and cannot
 *                   be clicked - availability is a gate here exactly as it is
 *                   in the substitution ranker.
 *   THE PREFILL     happens only when `predictFit` clears its own bar. Below
 *                   the bar the control opens empty and says why, which is the
 *                   whole point: a store that guesses your size and is wrong
 *                   has cost you a return, not saved you a click.
 *   THE CONFIDENCE  is printed as a number next to the size, not implied by the
 *                   fact that something was selected.
 *   THE WHY         is one disclosure away and lists the evidence in the order
 *                   the model applied it, including the transfers it refused.
 *
 * The effort ledger is written once per product, and only when the prefill
 * actually fired. A size the shopper had to pick themselves saved nobody
 * anything and does not get a row.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Product } from '../../types';
import { useApp } from '../../context/AppContext';
import { predictFit, readsAsGift, sizeAvailability } from '../../ml/engine';
import type { FitPrediction } from '../../ml/engine';
import { saving } from '../../ml/effort';
import { ChevronDown, Gift, Ruler, ShieldAlert } from 'lucide-react';

/**
 * The live fit reading for a product.
 *
 * Recomputed when the profile moves, because it should: two clicks into a
 * session the shopper's size can go from a population guess to a reading, and
 * the control is supposed to show that happening.
 */
export function useFitPrediction(product: Product): FitPrediction {
  const { visitorProfile, isPersonalizationOn } = useApp();
  return useMemo(
    () =>
      predictFit(product, visitorProfile, {
        personalized: isPersonalizationOn,
        giftIntent: isPersonalizationOn && readsAsGift(visitorProfile),
      }),
    [product, visitorProfile, isPersonalizationOn]
  );
}

/** Which sizes this product can actually be bought in. */
export function useSizeAvailability(product: Product): Record<string, boolean> {
  return useMemo(() => sizeAvailability(product), [product]);
}

const SOURCE_LABEL: Record<FitPrediction['source'], string> = {
  observed: 'Your own picks',
  transferred: 'Carried across departments',
  population: 'Population default',
  universal: 'One size',
  none: 'No reading',
};

interface Props {
  product: Product;
  fit: FitPrediction;
  selected: string | null;
  onSelect: (size: string) => void;
  /** Where this rendered, for the effort ledger. */
  surface: string;
}

export const SizeAndFit: React.FC<Props> = ({ product, fit, selected, onSelect, surface }) => {
  const { recordEffort, userEvents, isPersonalizationOn } = useApp();
  const [open, setOpen] = useState(false);
  const avail = useSizeAvailability(product);

  // One row per product, not per render and not per click. `saving` returns an
  // entry the provider dedupes by id, so an effect is the safe place for it.
  useEffect(() => {
    if (!isPersonalizationOn || !fit.prefill || !fit.size) return;
    recordEffort(
      saving({
        id: `fit:prefill:${product.id}`,
        eventId: userEvents[0]?.id ?? null,
        page: 'pdp',
        surface,
        kind: 'size_hunt',
        count: 1,
        label: `Size ${fit.size} prefilled at ${(fit.confidence * 100).toFixed(0)}%`,
        detail:
          `${SOURCE_LABEL[fit.source].toLowerCase()}; the un-personalized control opens on no selection and ` +
          `${fit.ladder.length} sizes to read`,
      })
    );
  }, [isPersonalizationOn, fit, product, surface, recordEffort, userEvents]);

  const one = fit.scale === 'onesize';

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-bold text-slate-800">{one ? 'Size' : 'Select Size:'}</span>
        <span className="text-red-600 font-semibold cursor-pointer">Size Chart</span>
      </div>

      {/* The ladder. Unavailable sizes stay on screen struck through rather than
          being dropped: a shopper who wants 2XL needs to learn that this product
          does not have it, not that it never existed. */}
      <div className="flex flex-wrap gap-2">
        {fit.ladder.map((size) => {
          const can = avail[size] ?? true;
          const on = selected === size;
          const suggested = fit.prefill && fit.size === size;
          return (
            <button
              key={size}
              type="button"
              disabled={!can}
              onClick={() => can && onSelect(size)}
              title={can ? undefined : `${size} is out of stock on this product`}
              className={`relative h-10 min-w-11 px-2.5 rounded-lg text-xs font-bold transition-all border ${
                !can
                  ? 'bg-slate-50 text-slate-300 border-slate-200 line-through cursor-not-allowed'
                  : on
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : suggested
                      ? 'bg-white text-slate-900 border-straive-400 ring-1 ring-straive-200 hover:border-straive-500'
                      : 'bg-white text-slate-800 border-slate-300 hover:border-slate-400'
              }`}
            >
              {size}
              {suggested && !on && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-straive-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* The reading itself. Three shapes: prefilled, blocked, or one size. */}
      {!one && (
        <div
          className={`rounded-lg border px-2.5 py-2 ${
            fit.prefill ? 'border-straive-200 bg-straive-50' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {fit.prefill ? (
              <Ruler className="h-3.5 w-3.5 shrink-0 text-straive-600" />
            ) : fit.blocked?.startsWith('This is being bought') ? (
              <Gift className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            )}
            <span className="text-[11.5px] font-extrabold text-slate-900 leading-snug">
              {fit.prefill
                ? `We put you in ${fit.size}`
                : fit.size
                  ? `Nothing prefilled. ${fit.size} is only a starting point`
                  : 'No size read'}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[10px] font-bold tabular-nums text-slate-500">
              {(fit.confidence * 100).toFixed(0)}%
            </span>
          </div>

          <p className="mt-0.5 text-[10.5px] leading-snug text-slate-600">
            {fit.blocked ?? `${SOURCE_LABEL[fit.source]}. You can change it and we will follow.`}
          </p>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1.5 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500 hover:text-slate-800"
          >
            Why this size
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
              {/* Evidence, in the order the model applied it. */}
              <ol className="space-y-1">
                {fit.reasons.map((r, i) => (
                  <li key={i} className="flex gap-1.5 text-[10.5px] leading-snug text-slate-600">
                    <span className="mt-px shrink-0 font-mono text-[9px] font-bold text-slate-400">{i + 1}</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ol>

              {fit.adjustments.length > 0 && (
                <div className="space-y-0.5">
                  <div className="text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Ladder adjustments
                  </div>
                  {fit.adjustments.map((a, i) => (
                    <div key={i} className="flex items-baseline gap-1.5 text-[10px] text-slate-600">
                      <span className="font-mono font-bold text-slate-500">
                        {a.steps > 0 ? `+${a.steps}` : a.steps}
                      </span>
                      <span className="font-bold text-slate-700">{a.label}</span>
                      <span className="text-slate-500">· {a.detail}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* The distribution. A single recommended size hides how wide the
                  belief is, and the width is the interesting part. */}
              <div className="space-y-0.5">
                <div className="text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Where the belief sits
                </div>
                {fit.distribution.map((d) => (
                  <div key={d.size} className="flex items-center gap-1.5">
                    <span
                      className={`w-9 shrink-0 font-mono text-[9.5px] font-bold ${
                        d.available ? 'text-slate-600' : 'text-slate-300 line-through'
                      }`}
                    >
                      {d.size}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <span
                        className={`block h-full rounded-full ${
                          d.size === fit.size ? 'bg-straive-500' : 'bg-slate-400'
                        }`}
                        style={{ width: `${Math.max(1, d.p * 100)}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right font-mono text-[9px] tabular-nums text-slate-400">
                      {(d.p * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[9px] leading-snug text-slate-400">
                Per-size stock is derived from the product id, so it is identical in every arm of every comparison
                on this demo. Sizes, cut bias and the population curve are simulated.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
