/**
 * Firing a market event, from the storefront, mid-session.
 *
 * WHY THIS CONTROL SITS ON THE DEMO STRIP AND NOT ON A DEEP-DIVE SCREEN
 *
 * The claim being demonstrated is that the world can move while the shopper is
 * standing in it. That is only legible if the shopper is visibly standing in it
 * when the button is pressed - on a product page, with the affected jersey on
 * screen and something in the cart. Put this behind a deep-dive tab and the
 * audience sees a catalog change on a screen that has no catalog on it.
 *
 * The trade is first and styled as the primary action because it is the one
 * built end to end: it moves a player, transfers the demand, re-estimates the
 * co-order priors, re-badges the products in place and lands an entry in the
 * decision stream. The other six run through the same effect table and are real,
 * but the trade is the one worth pressing in front of a client.
 *
 * The rebuild is a couple of seconds of synchronous work and the button says so
 * before it starts. That is deliberate: the honest version of this feature
 * re-simulates 14,000 shoppers and re-estimates three co-occurrence graphs, and
 * a version fast enough to feel instant would be re-weighting numbers rather
 * than re-estimating them.
 */

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { describeEvent, fireTemplate, DEFAULT_CLOCK, MarketEventTemplate } from '../../sim/clock';
import { MarketEventKind } from '../../types';
import {
  ArrowLeftRight,
  BadgeCheck,
  CalendarDays,
  Loader2,
  PenLine,
  RotateCcw,
  Shirt,
  Trophy,
  Undo2,
  UserMinus,
} from 'lucide-react';

const KIND_ICON: Record<MarketEventKind, React.ReactNode> = {
  TRADE: <ArrowLeftRight className="h-3.5 w-3.5" />,
  INJURY: <BadgeCheck className="h-3.5 w-3.5 rotate-180" />,
  PLAYOFF_WIN: <Trophy className="h-3.5 w-3.5" />,
  CHAMPIONSHIP: <Trophy className="h-3.5 w-3.5" />,
  NEW_SIGNING: <PenLine className="h-3.5 w-3.5" />,
  RETIREMENT: <UserMinus className="h-3.5 w-3.5" />,
  KIT_LAUNCH: <Shirt className="h-3.5 w-3.5" />,
};

const KIND_LABEL: Record<MarketEventKind, string> = {
  TRADE: 'Trade',
  INJURY: 'Injury',
  PLAYOFF_WIN: 'Playoff win',
  CHAMPIONSHIP: 'Championship',
  NEW_SIGNING: 'Signing',
  RETIREMENT: 'Retirement',
  KIT_LAUNCH: 'Kit launch',
};

/** Reads the deck entry's headline without firing it, for the button tooltip. */
function previewOf(template: MarketEventTemplate): { headline: string; detail: string } {
  return describeEvent(fireTemplate(template, DEFAULT_CLOCK, 0));
}

export const MarketDeck: React.FC = () => {
  const { eventDeck, fireEvent, marketRebuilding, firedEvents, marketClockLabel, resetMarket } = useApp();
  const [hovered, setHovered] = useState<string | null>(null);

  const preview = hovered ? eventDeck.find((t) => t.kind === hovered) : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-none">
        <span className="w-16 shrink-0 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
          Market
        </span>

        {/* The clock. Present even on a quiet world, because a metric with no
            date on it is not reproducible once the world can move. */}
        <span
          className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600 font-mono"
          title="The simulated calendar the catalog, the population and the priors are all built against."
        >
          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
          {marketClockLabel}
        </span>

        <div className="flex items-center gap-1">
          {eventDeck.map((template, idx) => {
            const isPrimary = idx === 0;
            const { headline, detail } = previewOf(template);
            return (
              <button
                key={template.kind}
                onClick={() => fireEvent(template)}
                onMouseEnter={() => setHovered(template.kind)}
                onMouseLeave={() => setHovered(null)}
                disabled={marketRebuilding}
                title={`${headline}\n\n${detail}`}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap border disabled:opacity-40 disabled:cursor-wait ${
                  isPrimary
                    ? 'bg-straive-500 border-straive-500 text-white hover:bg-straive-600 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <span className={isPrimary ? 'text-white/80' : 'text-slate-400'}>{KIND_ICON[template.kind]}</span>
                <span className={isPrimary ? '' : 'hidden xl:inline'}>{KIND_LABEL[template.kind]}</span>
              </button>
            );
          })}
        </div>

        {marketRebuilding && (
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold text-straive-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Rebuilding catalog, population and co-order graphs...
          </span>
        )}

        {!marketRebuilding && firedEvents.length > 0 && (
          <button
            onClick={resetMarket}
            title="Return to the baseline world every published metric was measured under."
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-white text-[11px] font-bold text-slate-500 hover:text-slate-900 hover:border-slate-300"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
            Reset market
          </button>
        )}
      </div>

      {/* One line of context under the row: either what the hovered button will
          do, or what the last fired event did. Never both, and never nothing -
          a row of seven unlabelled verbs is not a demonstration. */}
      <div className="flex items-start gap-2.5">
        <span className="w-16 shrink-0" />
        <p className="text-[10px] leading-snug text-slate-500 min-h-[13px]">
          {preview ? (
            <>
              <span className="font-bold text-slate-700">{previewOf(preview).headline}.</span>{' '}
              {previewOf(preview).detail}
            </>
          ) : firedEvents.length > 0 ? (
            <>
              <Undo2 className="inline h-3 w-3 mr-1 -mt-0.5 text-straive-500" />
              <span className="font-bold text-slate-700">
                {describeEvent(firedEvents[0]).headline}
              </span>{' '}
              - the world was rebuilt from the event log. Open the Decisions tab for what it cost and what moved.
            </>
          ) : (
            <>
              Simulated market. Firing an event rebuilds the catalog, re-simulates the shopper population and
              re-estimates the co-order graphs - nothing here is scripted playback.
            </>
          )}
        </p>
      </div>
    </div>
  );
};
