/**
 * The identity control.
 *
 * Five rungs, and the shopper can be moved between them mid-session. This is the
 * single most important control in the demo, because the question it answers -
 * "what could you actually do for someone who has not told you who they are?" -
 * is the question the room is really asking.
 *
 * Promotion re-folds rather than patching. The session's clicks are replayed
 * against the richer seed, so behaviour that contradicts a newly-arrived CRM
 * fact stays visible as a contested distribution instead of being silently
 * overwritten. That is why signing in can make a field LESS certain, which looks
 * wrong for a second and is the honest answer.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { IDENTITY_LADDER, IDENTITY_RUNGS, rungIndex } from '../../ml/engine';
import type { IdentityState } from '../../ml/engine';
import { EyeOff, Globe, Cookie, Mail, BadgeCheck, ArrowUp } from 'lucide-react';

const RUNG_ICON: Record<IdentityState, React.ElementType> = {
  anonymous: EyeOff,
  contextual: Globe,
  returning: Cookie,
  identified: Mail,
  member: BadgeCheck,
};

export const IdentityLadder: React.FC = () => {
  const { identityState, promoteTo, promotionDeltas, contextReading, contextIsSimulated } = useApp();
  const currentIndex = rungIndex(identityState);

  return (
    <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-none">
      {/* Same label column width as the Shopper and Storefront rows, so all
          three share one left edge. */}
      <span className="w-16 shrink-0 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
        Identity
      </span>

      <div className="flex items-center">
        {IDENTITY_LADDER.map((rung, i) => {
          const meta = IDENTITY_RUNGS[rung];
          const Icon = RUNG_ICON[rung];
          const isCurrent = rung === identityState;
          const isBelow = i < currentIndex;

          return (
            <React.Fragment key={rung}>
              {i > 0 && (
                <span
                  className={`h-px w-4 sm:w-6 shrink-0 transition-colors duration-500 ${
                    i <= currentIndex ? 'bg-straive-300' : 'bg-slate-200'
                  }`}
                />
              )}
              <button
                onClick={() => promoteTo(rung)}
                title={`${meta.label} — ${meta.basis}. Adds: ${meta.adds}.`}
                className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                  isCurrent
                    ? 'bg-straive-500 text-white shadow-sm'
                    : isBelow
                      ? 'text-straive-700 hover:bg-straive-50'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span
                  className={`grid place-items-center h-5 w-5 rounded-full ${
                    isCurrent ? 'bg-white/20' : isBelow ? 'bg-straive-100' : 'bg-slate-100'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <span className="hidden sm:inline">{meta.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* What the last promotion moved. Transient by design - it is a receipt for
          something that just happened, not a permanent readout. */}
      {promotionDeltas.length > 0 && (
        <span
          key={promotionDeltas[0]?.path}
          className="hidden xl:flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 shrink-0 ml-1.5"
          title={promotionDeltas.map((d) => `${d.label}: ${d.before} → ${d.after}`).join('\n')}
        >
          <ArrowUp className="h-3 w-3" />
          {promotionDeltas.length} field{promotionDeltas.length === 1 ? '' : 's'} re-sourced
        </span>
      )}

      {/* What context alone established, before a single click. The demo has to
          open with the model already having said something; this is it. */}
      {currentIndex >= 1 && contextReading.notes.length > 0 && (
        <span
          className="hidden 2xl:block text-[10px] text-slate-400 truncate max-w-[240px] shrink"
          title={contextReading.notes.join('\n') + (contextIsSimulated ? '\n\n(Arrival context simulated.)' : '')}
        >
          {contextReading.notes[0]}
        </span>
      )}
    </div>
  );
};
