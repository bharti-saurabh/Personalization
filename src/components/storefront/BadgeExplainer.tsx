/**
 * A merchandising badge, and the population statistic behind it.
 *
 * Badges are the most-read and least-explained thing on a commerce page. "Best
 * Seller" is a claim about a distribution, and the shopper is shown the claim
 * and never the distribution. Nothing here changes what the badge says - the
 * rules live in the catalog generator and are quoted, not re-derived - it only
 * makes the arithmetic legible on hover.
 *
 * Every tooltip carries the same four lines, in the same order, because a
 * badge that explains itself differently in two places has not been explained:
 *
 *   RULE     the arithmetic, quoted from where it is enforced
 *   STAT     where this product sits in the field that rule reads
 *   COHORT   how many other products clear the same bar - the number that
 *            decides whether a badge is informative or wallpaper
 *   BASIS    measured over the catalog, and the catalog is synthetic
 *
 * The panel is positioned `fixed` off the trigger's own rect rather than
 * absolutely inside it. Every card on this storefront clips its own overflow,
 * and a tooltip that gets cut off by the tile it belongs to is worse than no
 * tooltip - it looks broken rather than absent.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Product } from '../../types';
import { BADGE_BASIS_NOTE, badgeStatsFor, buildBadgeIndex } from '../../ml/engine';
import type { BadgeIndex, BadgeStat } from '../../ml/engine';

/**
 * One index per catalog array, computed once.
 *
 * `buildBadgeIndex` sorts three arrays the length of the catalog. A listing
 * page renders two dozen tiles and every one of them wants the same index, so
 * it is cached on the identity of the products array - which is exactly the
 * thing that changes when a market event rebuilds the world, and nothing else.
 */
const INDEX_CACHE = new WeakMap<Product[], BadgeIndex>();

export function badgeIndexFor(products: Product[]): BadgeIndex {
  let hit = INDEX_CACHE.get(products);
  if (!hit) {
    hit = buildBadgeIndex(products);
    INDEX_CACHE.set(products, hit);
  }
  return hit;
}

/** Every badge this product carries, with the statistic behind each. */
export function useBadgeStats(product: Product, products: Product[]): BadgeStat[] {
  return useMemo(() => badgeStatsFor(product, badgeIndexFor(products)), [product, products]);
}

/** Find the stat for a badge the caller has already decided to render. */
export function pickStat(stats: BadgeStat[], badge: string): BadgeStat | undefined {
  return stats.find((s) => s.badge === badge);
}

const PANEL_W = 292;

interface ExplainerProps {
  stat: BadgeStat | undefined;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps a rendered badge. Renders the child untouched when there is no stat -
 * a badge with no statistic behind it should not grow a cursor that promises
 * one.
 */
export const BadgeExplainer: React.FC<ExplainerProps> = ({ stat, children, className }) => {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const open = useCallback((e: React.SyntheticEvent<HTMLElement>) => {
    setRect(e.currentTarget.getBoundingClientRect());
  }, []);
  const close = useCallback(() => setRect(null), []);

  if (!stat) return <>{children}</>;

  // Keep the panel on screen horizontally, and flip it above the trigger when
  // the badge is low enough that below would run off the bottom.
  let left = 8;
  let top = 0;
  let above = false;
  if (rect) {
    left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_W - 8));
    above = rect.bottom + 240 > window.innerHeight;
    top = above ? rect.top - 8 : rect.bottom + 8;
  }

  return (
    <span
      className={`relative inline-flex cursor-help ${className ?? ''}`}
      tabIndex={0}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      {children}
      {rect && (
        <span
          role="tooltip"
          className="fixed z-[90] block rounded-xl border border-slate-700 bg-slate-950/97 px-3 py-2.5 text-left shadow-2xl backdrop-blur-sm"
          style={{
            width: PANEL_W,
            left,
            top,
            transform: above ? 'translateY(-100%)' : undefined,
          }}
        >
          <span className="flex items-baseline gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-straive-400">{stat.badge}</span>
            {stat.percentile !== null && (
              <span className="ml-auto shrink-0 font-mono text-[9.5px] font-bold tabular-nums text-slate-400">
                p{Math.round(stat.percentile * 100)}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[11.5px] font-bold leading-snug text-slate-100">{stat.claim}</span>

          <span className="mt-2 block space-y-1.5">
            <span className="block">
              <span className="block text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-500">Rule</span>
              <span className="block font-mono text-[10px] leading-snug text-slate-300">{stat.rule}</span>
            </span>
            <span className="block">
              <span className="block text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-500">Stat</span>
              <span className="block text-[10.5px] leading-snug text-slate-200">{stat.stat}</span>
            </span>
            <span className="block">
              <span className="block text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-500">Cohort</span>
              {/* The bar is the cohort share. A badge worn by a third of the
                  catalog is decoration, and the bar is how you see that at a
                  glance rather than reading a percentage. */}
              <span className="mt-0.5 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <span
                    className="block h-full rounded-full bg-straive-500"
                    style={{ width: `${Math.max(1, Math.min(100, stat.cohortShare * 100))}%` }}
                  />
                </span>
                <span className="shrink-0 font-mono text-[9.5px] tabular-nums text-slate-400">
                  {stat.cohort} · {(stat.cohortShare * 100).toFixed(1)}%
                </span>
              </span>
            </span>
          </span>

          <span className="mt-2 block border-t border-slate-800 pt-1.5 text-[9px] leading-snug text-slate-500">
            {BADGE_BASIS_NOTE}
          </span>
        </span>
      )}
    </span>
  );
};
