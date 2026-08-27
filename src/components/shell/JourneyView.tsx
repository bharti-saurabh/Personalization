/**
 * The session end to end, and what would be sent after it.
 *
 * Three acts, in the order the story is told: what was known before the shopper
 * touched anything, what each step of the session added, and what would be sent
 * afterwards as a result.
 *
 * Lifecycle triggers used to be their own destination, which put the messages a
 * shopper receives after leaving in a different place from the session that
 * decided to send them. They are the same story: this is what happened, and this
 * is what happens next as a result.
 */

import React, { Suspense, lazy } from 'react';
import { useApp } from '../../context/AppContext';
import { ViewTabs } from './ViewTabs';
import type { ViewTab } from './ViewTabs';
import type { JourneyTab } from '../../types';

const CustomerJourneyScreen = lazy(() =>
  import('../intelligence/CustomerJourneyScreen').then((m) => ({ default: m.CustomerJourneyScreen }))
);
const ArrivalCapture = lazy(() =>
  import('../intelligence/ArrivalCapture').then((m) => ({ default: m.ArrivalCapture }))
);
const LifecycleTriggers = lazy(() =>
  import('../intelligence/LifecycleTriggers').then((m) => ({ default: m.LifecycleTriggers }))
);

const TABS: ViewTab<JourneyTab>[] = [
  { id: 'arrival', label: 'On arrival', hint: 'What was known before the shopper did anything, and where each field came from' },
  { id: 'timeline', label: 'This session', hint: 'Every step the shopper took, what it captured, and what it changed' },
  { id: 'lifecycle', label: 'After the session', hint: 'What would be sent, when, and what would hold it back' },
];

const Fallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-50 text-xs text-slate-500 font-mono">
    Loading module...
  </div>
);

export const JourneyView: React.FC = () => {
  const { journeyTab, setJourneyTab } = useApp();
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <ViewTabs tabs={TABS} active={journeyTab} onSelect={setJourneyTab} />
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<Fallback />}>
          {journeyTab === 'arrival' && <ArrivalCapture />}
          {journeyTab === 'timeline' && <CustomerJourneyScreen />}
          {journeyTab === 'lifecycle' && <LifecycleTriggers />}
        </Suspense>
      </div>
    </div>
  );
};
