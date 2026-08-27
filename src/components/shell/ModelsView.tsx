/**
 * Every model, under one heading.
 *
 * Model intelligence, evidence, the inference trace, the lab and the registry
 * were five separate destinations. They are five views of the same handful of
 * models, and separating them made a visitor navigate between them to answer a
 * single question. One view, five tabs, and the tab strip makes the relationship
 * legible: what the models are, what they learned from, what they just did, what
 * happens if you change them, and what would be deployed.
 */

import React, { Suspense, lazy } from 'react';
import { useApp } from '../../context/AppContext';
import { ViewTabs } from './ViewTabs';
import type { ViewTab } from './ViewTabs';
import type { ModelsTab } from '../../types';

const ModelIntelligence = lazy(() =>
  import('../intelligence/ModelIntelligence').then((m) => ({ default: m.ModelIntelligence }))
);
const ModelEvidence = lazy(() =>
  import('../intelligence/ModelEvidence').then((m) => ({ default: m.ModelEvidence }))
);
const PipelineTrace = lazy(() =>
  import('../intelligence/PipelineTrace').then((m) => ({ default: m.PipelineTrace }))
);
const RecommendationLab = lazy(() =>
  import('../intelligence/RecommendationLab').then((m) => ({ default: m.RecommendationLab }))
);
const ModelRegistry = lazy(() =>
  import('../intelligence/ModelRegistry').then((m) => ({ default: m.ModelRegistry }))
);

const TABS: ViewTab<ModelsTab>[] = [
  { id: 'intelligence', label: 'Model intelligence', hint: 'What each model is, and how it scores' },
  { id: 'evidence', label: 'Evidence', hint: 'The synthetic population the models were fitted on' },
  { id: 'pipeline', label: 'Inference trace', hint: 'The last request, stage by stage, with latencies' },
  { id: 'lab', label: 'Lab', hint: 'Move a parameter and watch the ranking change' },
  { id: 'registry', label: 'Registry', hint: 'Versions, owners and what would be promoted' },
];

const Fallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-50 text-xs text-slate-500 font-mono">
    Loading module...
  </div>
);

export const ModelsView: React.FC = () => {
  const { modelsTab, setModelsTab } = useApp();
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <ViewTabs tabs={TABS} active={modelsTab} onSelect={setModelsTab} />
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<Fallback />}>
          {modelsTab === 'intelligence' && <ModelIntelligence />}
          {modelsTab === 'evidence' && <ModelEvidence />}
          {modelsTab === 'pipeline' && <PipelineTrace />}
          {modelsTab === 'lab' && <RecommendationLab />}
          {modelsTab === 'registry' && <ModelRegistry />}
        </Suspense>
      </div>
    </div>
  );
};
