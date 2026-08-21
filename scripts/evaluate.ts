/**
 * CLI wrapper for the offline evaluation harness.
 *
 *   npm run sim:eval
 *
 * Prints the metric table that backs the Model Evidence screen, including the
 * baselines. Read the header of src/ml/evaluate.ts for what these numbers do
 * and do not establish.
 */

import { runEvaluation, MetricRow } from '../src/ml/evaluate';

const report = runEvaluation();

const rows: [MetricRow, MetricRow][] = [
  [report.intentTeam, report.intentTeamBaseline],
  [report.intentDept, report.intentDeptBaseline],
  [report.complement, report.complementBaseline],
  [report.similarity, report.similarityBaseline],
];

const pct = (v: number) => `${(v * 100).toFixed(1)}%`.padStart(7);

console.log('\nOFFLINE EVALUATION - recovery of the simulated data-generating process');
console.log('These are not production accuracy figures. See src/ml/evaluate.ts.\n');
console.log(
  `${'metric'.padEnd(44)}${'R@1'.padStart(8)}${'R@3'.padStart(8)}${'R@10'.padStart(8)}${'NDCG@10'.padStart(9)}${'n'.padStart(7)}`
);
console.log('-'.repeat(84));

for (const [model, baseline] of rows) {
  for (const row of [model, baseline]) {
    console.log(
      `${row.name.padEnd(44)}${pct(row.recallAt1)}${pct(row.recallAt3)}${pct(row.recallAt10)}${pct(row.ndcgAt10).padStart(9)}${String(row.n).padStart(7)}`
    );
  }
  // Both are reported: R@1 alone misreads a multi-target task like basket
  // completion, where the model can rank the whole basket better while tying
  // on the single most obvious first pick.
  const r1Lift = baseline.recallAt1 > 0 ? model.recallAt1 / baseline.recallAt1 : 0;
  const ndcgLift = baseline.ndcgAt10 > 0 ? model.ndcgAt10 / baseline.ndcgAt10 : 0;
  console.log(
    `${''.padEnd(44)}-> lift over baseline: R@1 ${r1Lift.toFixed(2)}x, NDCG@10 ${ndcgLift.toFixed(2)}x\n`
  );
}

console.log(
  `population ${report.meta.population}  evaluated ${report.meta.evaluatedCustomers}  catalog ${report.meta.catalogSize}  ${report.meta.elapsedMs}ms\n`
);
