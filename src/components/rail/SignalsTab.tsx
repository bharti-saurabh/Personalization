/**
 * The raw event stream, newest first, with the slots each event moved.
 *
 * WHY THE SLOTS COLUMN MATTERS MORE THAN THE EVENTS
 * -------------------------------------------------
 * Any analytics tool can print a click stream. The claim this build makes is
 * that each of those clicks changed a specific belief by a specific amount, and
 * the only way to make that claim checkable is to put the writes next to the
 * event that caused them. An event with no writes is as informative as one with
 * three: it means the fold saw the action and decided it carried no signal,
 * which is a decision, not a gap.
 *
 * MARKET EVENTS SIT IN THE SAME STREAM
 * ------------------------------------
 * They are not user actions and they write no profile fields, but they change
 * what every model below is reading, and separating them into their own list
 * would break the one property this tab has that no other screen does: the
 * order things actually happened in.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { describeEvent } from '../../sim/clock';
import { MousePointerClick, Search, ShoppingCart, Filter, Package, LayoutGrid, House, Globe2 } from 'lucide-react';

const PAGE_ICON: Record<string, React.ElementType> = {
  Home: House,
  PLP: LayoutGrid,
  PDP: Package,
  Cart: ShoppingCart,
  Search: Search,
  Filter: Filter,
};

/** Field paths are engine vocabulary; the rail is allowed engine vocabulary. */
function shortPath(path: string): string {
  return path.replace(/^affinities\./, '').replace(/^traits\./, '').replace(/^state\./, '');
}

export const SignalsTab: React.FC = () => {
  const { userEvents, deltaLog, firedEvents } = useApp();

  // Writes, indexed by the event that caused them. Built once per render rather
  // than filtered per row: the delta log is capped but still long enough that
  // a filter inside the map would be quadratic on a busy session.
  const writesByEvent = React.useMemo(() => {
    const map = new Map<string, { path: string; contribution: number; label: string }[]>();
    for (const d of deltaLog) {
      if (!d.eventId) continue;
      const list = map.get(d.eventId) ?? [];
      if (list.length < 6) list.push({ path: shortPath(d.path), contribution: d.contribution, label: d.label });
      map.set(d.eventId, list);
    }
    return map;
  }, [deltaLog]);

  return (
    <div className="h-full overflow-y-auto p-2.5 space-y-1.5">
      {firedEvents.length > 0 && (
        <div className="rounded-lg border border-straive-500/30 bg-straive-500/[0.07] px-2.5 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Globe2 className="h-3 w-3 text-straive-400" />
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-straive-300">World events</span>
          </div>
          {firedEvents.slice(0, 3).map((e) => (
            <p key={e.id} className="text-[10px] text-slate-300 leading-relaxed">
              {describeEvent(e).headline}
            </p>
          ))}
          <p className="mt-1 text-[9px] text-slate-500 leading-relaxed">
            These write no profile fields. They change the catalog and the co-order priors underneath every model.
          </p>
        </div>
      )}

      {userEvents.length === 0 && (
        <div className="text-[10px] text-slate-600 p-3 text-center">Nothing observed yet this session.</div>
      )}

      {userEvents.map((e) => {
        const Icon = PAGE_ICON[e.pageType] ?? MousePointerClick;
        const writes = writesByEvent.get(e.id) ?? [];
        return (
          <div key={e.id} className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="px-2.5 py-1.5 flex items-start gap-2">
              <span className="shrink-0 grid place-items-center h-5 w-5 rounded bg-white/8 text-slate-400 mt-px">
                <Icon className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] text-slate-200 leading-snug">{e.action}</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-slate-600 font-mono">
                  <span>{e.timestamp}</span>
                  <span>·</span>
                  <span>{e.pageType}</span>
                  {e.team && (
                    <>
                      <span>·</span>
                      <span className="text-slate-500">{e.team}</span>
                    </>
                  )}
                  {e.filterApplied && (
                    <>
                      <span>·</span>
                      <span className="text-slate-500 truncate">{e.filterApplied}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {writes.length > 0 ? (
              <div className="px-2.5 py-1.5 border-t border-white/8 bg-black/20 space-y-0.5">
                {writes.map((w, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-[9.5px]">
                    <span className="font-mono text-slate-400 truncate flex-1 min-w-0">{w.path}</span>
                    <span
                      className={`font-mono shrink-0 ${w.contribution >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                      title={w.label}
                    >
                      {w.contribution >= 0 ? '+' : ''}
                      {w.contribution.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-2.5 py-1 border-t border-white/8 bg-black/20 text-[9px] text-slate-600">
                No slot moved. The fold saw this and read no signal in it.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
