/**
 * The strip of internal tabs a top-level view uses when it holds more than one
 * screen.
 *
 * Five ML screens used to be five peers in a left rail, which made the rail long
 * and made every screen look equally important. They are not peers of the
 * storefront - they are five readings of the same set of models, so they belong
 * under one heading with a tab strip. This is that strip, extracted because
 * Models and Customer journey both need it and two copies would drift.
 */

import React from 'react';

export interface ViewTab<T extends string> {
  id: T;
  label: string;
  hint: string;
}

export function ViewTabs<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: ViewTab<T>[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-ink-950 border-b border-white/10 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          title={t.hint}
          className={`shrink-0 px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-colors ${
            active === t.id
              ? 'bg-straive-500 text-white'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
