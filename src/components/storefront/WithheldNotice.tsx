/**
 * The refusal, on the storefront, where the shopper can see it.
 *
 * Every other trace of what the models did in this build lives in the side
 * panel, and that is the right home for a score. This one component breaks the
 * rule on purpose, because a refusal has a property no recommendation has: it
 * leaves nothing behind. A rail that showed six things and a rail that refused
 * two and showed four look identical from the shopper's chair, and a store whose
 * only account of what it withheld is a developer panel has not actually told
 * anyone anything.
 *
 * WHAT IT WILL NOT DO. It does not list the products it refused. Naming them on
 * the storefront would undo the refusal - "we did not show you the Cowboys
 * jersey" is showing you the Cowboys jersey - and for the ownership rule it
 * would be worse than that, because the one case where a person is buying the
 * same thing twice is usually the case where they did not want the first one
 * mentioned out loud. The panel lists them, because the panel is for the
 * merchandiser. This is for the shopper, and it names the RULE.
 *
 * The rule name is the whole payload. "3 items hidden" is a statistic and reads
 * as a machine being coy about something. "We left out rival club merchandise -
 * NFC East, the oldest grudge in the division" is a store that can be argued
 * with, which is the only kind worth trusting.
 */

import React from 'react';
import { EyeOff, Info } from 'lucide-react';
import type { SuppressionResult } from '../../ml/engine';
import { RULE_LABEL } from '../../ml/engine';

/** Shopper-facing wording per rule. The panel gets the mechanical version. */
const SHOPPER_COPY: Record<string, string> = {
  rivalry: 'rival club merchandise',
  recent_purchase: 'things you bought recently',
  fatigue: 'things you have already scrolled past',
  confidence_floor: 'things we were not confident enough to put here',
};

interface Props {
  result: SuppressionResult | null | undefined;
  /** Hidden entirely when personalization is off - the control arm has no gate. */
  active: boolean;
  className?: string;
}

export const WithheldNotice: React.FC<Props> = ({ result, active, className = '' }) => {
  if (!active || !result) return null;

  /*
   * A rule that declined to fire is still a decision, and this is the only one
   * in the gate that declines. When the shopper has opened a rival's own page,
   * the rivalry rule stands down for that club - and if it says nothing, the
   * shopper sees a page full of a club the store elsewhere refuses to show
   * them, with no explanation for either behaviour. So the stand-down renders
   * even on a surface where nothing was withheld at all.
   */
  if (!result.fired) {
    const stood = result.rivalryStoodDown;
    if (!stood) return null;
    return (
      <div
        className={`rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 ${className}`}
        data-testid="withheld-notice"
      >
        <div className="flex items-start gap-2.5">
          <Info className="h-3.5 w-3.5 text-straive-600 shrink-0 mt-0.5" />
          <p className="text-[12px] text-slate-700 leading-snug">
            <span className="font-bold text-slate-900">Showing {stood.team} anyway.</span> We usually
            keep {stood.team} out of your rows because you shop {stood.loyalTo}, but
            you opened this one, so that rule is off for {stood.team} on this page.
          </p>
        </div>
      </div>
    );
  }

  const rivalry = result.suppressed.find((d) => d.rule === 'rivalry');
  const phrases = result.byRule.map((r) => SHOPPER_COPY[r.rule] ?? RULE_LABEL[r.rule]);
  const list =
    phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 ${className}`}
      data-testid="withheld-notice"
    >
      <div className="flex items-start gap-2.5">
        <EyeOff className="h-3.5 w-3.5 text-straive-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[12px] text-slate-700 leading-snug">
            <span className="font-bold text-slate-900">
              {result.suppressed.length} item{result.suppressed.length === 1 ? '' : 's'} left out
            </span>{' '}
            of this row: {list}.
            {result.withheld > 0 && (
              <>
                {' '}
                <span className="text-slate-500">
                  {result.withheld} slot{result.withheld === 1 ? '' : 's'} stayed empty rather than
                  being filled with something worse.
                </span>
              </>
            )}
          </p>

          {/* The rivalry rule gets its own line. It is the only rule here whose
              justification is a stated fact about the sport rather than a score,
              and it is the one a fan will either recognise instantly or want to
              argue with. Both reactions are better than silence. */}
          {rivalry && (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-straive-50 border border-straive-200 px-2 py-0.5 text-[10.5px] font-semibold text-straive-800">
              <Info className="h-3 w-3 shrink-0" />
              {RULE_LABEL.rivalry}: {rivalry.reason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
