/**
 * Browser chrome around the stage.
 *
 * This is the single strongest signal in the rework, and it is almost free.
 * Every argument about what belongs on the storefront and what belongs in the
 * rail becomes obvious the moment there is a window frame: things inside the
 * frame are the customer's experience, things outside it are ours. A viewer
 * does not have to be told the rule, they can see it.
 *
 * THE URL IS NOT DECORATION
 * ------------------------
 * It changes with the simulated page, and it carries the team when the shopper
 * is inside a club shop, which makes it the cheapest possible answer to "is
 * this personalization or is it just a filtered page?" A merchandised URL that
 * does not move while the merchandising does is a real thing worth noticing.
 *
 * It is static text, not an input. Nothing here navigates, and a field that
 * looks typable but is not would be a worse lie than no field at all.
 */

import React from 'react';
import { Lock, RotateCw } from 'lucide-react';

export const BrowserFrame: React.FC<{
  url: string;
  /**
   * The site's own header. Sits below the chrome and above the scroll region,
   * because a nav bar that scrolls away takes the search box with it and the
   * search box is a model surface the demo needs reachable from every page.
   */
  siteHeader?: React.ReactNode;
  children: React.ReactNode;
}> = ({ url, siteHeader, children }) => (
  <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-4">
    <div className="flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden bg-white shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)] ring-1 ring-black/40">
      {/* Chrome. Deliberately quiet: it has to read as a frame at a glance and
          then stop competing with the shop inside it. */}
      <div className="shrink-0 h-9 bg-slate-200/90 border-b border-slate-300 flex items-center gap-2 px-3">
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>
        <div className="flex-1 min-w-0 mx-1">
          <div className="mx-auto max-w-md flex items-center gap-1.5 bg-white/90 border border-slate-300/80 rounded-md px-2 py-0.5">
            <Lock className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
            <span className="text-[10.5px] text-slate-600 font-mono truncate">{url}</span>
          </div>
        </div>
        <RotateCw className="h-3 w-3 text-slate-400 shrink-0" />
      </div>

      {siteHeader && <div className="shrink-0">{siteHeader}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto bg-white">{children}</div>
    </div>
  </div>
);

/**
 * The address the simulated page would have.
 *
 * Built from the storefront's own state rather than stored, so it cannot get
 * out of step with the page. Slugs are lowercased and hyphenated the way a real
 * commerce site would render them.
 */
export function storefrontUrl(
  page: string,
  opts: { team?: string | null; league?: string | null; product?: string | null; query?: string | null }
): string {
  const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const club = opts.team ? `${opts.league ? slug(opts.league) + '-' : ''}${slug(opts.team)}` : null;

  switch (page) {
    case 'plp':
      if (opts.query) return `prosports.com/search?q=${encodeURIComponent(opts.query)}`;
      return club ? `prosports.com/${club}` : 'prosports.com/shop/all';
    case 'pdp':
      return `prosports.com/${club ?? 'shop'}/${opts.product ? slug(opts.product) : 'product'}`;
    case 'cart':
      return 'prosports.com/cart';
    default:
      return 'prosports.com';
  }
}
