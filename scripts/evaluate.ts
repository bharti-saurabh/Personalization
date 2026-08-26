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
import { getDataset } from '../src/sim/dataset';

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

// The choice model behind the numbers above. Printed with the metrics rather
// than in a separate command because a metric table without the generative
// parameters that produced it invites the reader to treat it as a measurement
// of the world instead of a recovery test against a known process.
const { choice, stats } = getDataset();
const rel = (a: number, t: number) => `${(((a - t) / t) * 100).toFixed(1)}%`.padStart(7);

console.log('CHOICE MODEL - fitted intercepts and their calibration targets');
console.log(`${'parameter'.padEnd(22)}${'value'.padStart(9)}${'target'.padStart(10)}${'achieved'.padStart(10)}${'error'.padStart(8)}${'iters'.padStart(7)}`);
console.log('-'.repeat(66));
const fits: [string, number, { target: number; achieved: number; iterations: number }][] = [
  ['clickIntercept', choice.clickIntercept, choice.calibration.depth],
  ['addIntercept', choice.addIntercept, choice.calibration.addRate],
  ['orderIntercept', choice.orderIntercept, choice.calibration.conversion],
];
for (const [name, value, c] of fits) {
  console.log(
    `${name.padEnd(22)}${value.toFixed(4).padStart(9)}${c.target.toFixed(4).padStart(10)}${c.achieved.toFixed(4).padStart(10)}${rel(c.achieved, c.target)}${String(c.iterations).padStart(7)}`
  );
}
console.log('\nEverything else in the choice model is assumed, not fitted - the slopes and');
console.log('the examination curve. Fitting a discrimination slope needs observed clicks');
console.log('with known relevance, which a synthetic world does not have.\n');

const r = stats.realised;
console.log('REALISED VOLUMES - over every generated session, held-out included');
console.log(
  `  depth ${r.depth}  addRate ${r.addRate}  conversion ${r.conversion}\n` +
    `  slotsWalked ${r.slotsWalked}  scrolledPast ${r.scrolledPast}  abandonRate ${r.abandonRate}\n`
);
console.log(
  `  selectivity ${r.discrimination}  (share of clicks in the grid's top affinity quartile;\n` +
    `               about 0.25 is a shopper indifferent to what they are shown)\n`
);
