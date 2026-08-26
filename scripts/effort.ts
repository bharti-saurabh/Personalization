/**
 * CLI wrapper for the paired effort harness.
 *
 *   npm run sim:effort
 *
 * Separate from `sim:eval` on purpose: this runs the intent engine once per
 * shopper on top of two full grid walks and a 2000-iteration bootstrap, and
 * folding it in would roughly double the time of the command that gates every
 * commit.
 *
 * Every number below is a count of shopper effort in a simulated world. There
 * is no currency figure here, no ROI and no revenue lift, and that is not an
 * omission - see the header of src/ml/counterfactual.ts.
 */

import { runEffortEvaluation } from '../src/ml/counterfactual';
import { getDataset } from '../src/sim/dataset';
import { clockLabel } from '../src/sim/clock';

const { products, customers, choice, clock } = getDataset();
const report = runEffortEvaluation(customers, products, choice, clockLabel(clock));

const fmt = (v: number, unit: string) =>
  unit === 'share' ? `${(v * 100).toFixed(1)}%` : v.toFixed(unit === 'steps' || unit === 'items' ? 1 : 2);

const signed = (v: number, unit: string) => (v > 0 ? '+' : '') + fmt(v, unit);

console.log('\nSHOPPER EFFORT - paired counterfactual, personalized vs popularity');
console.log('Counts of shopper effort in a simulated world. Not production figures,');
console.log('and deliberately not money. See src/ml/counterfactual.ts.\n');

console.log(
  `${'metric'.padEnd(38)}${'person.'.padStart(9)}${'popular.'.padStart(10)}${'diff'.padStart(9)}${'95% interval'.padStart(20)}${'n'.padStart(7)}`
);
console.log('-'.repeat(93));

for (const s of report.stats) {
  const interval = `${signed(s.ciLow, s.unit)} to ${signed(s.ciHigh, s.unit)}`;
  // A difference whose interval spans zero is not separated from no difference,
  // and is marked rather than left for the reader to work out from the numbers.
  const mark = s.separated ? (s.difference < 0 === s.lowerIsBetter ? '  <-' : '  !!') : '   ~';
  console.log(
    `${s.name.padEnd(38)}${fmt(s.personalized, s.unit).padStart(9)}${fmt(s.popularity, s.unit).padStart(10)}` +
      `${signed(s.difference, s.unit).padStart(9)}${interval.padStart(20)}${String(s.n).padStart(7)}${mark}`
  );
}

console.log('\n  <-  personalized arm ahead, interval excludes zero');
console.log('  !!  CONTROL arm ahead, interval excludes zero');
console.log('   ~  interval spans zero - not separated from no difference at this n');

console.log(
  `\nREADING THE TARGET ROWS TOGETHER. "Steps to target reached" is conditioned on\n` +
    `BOTH arms getting there, and on that subset the control arm is level or ahead.\n` +
    `That is a selection effect, not a contradiction: the control only reaches the\n` +
    `target when the target happens to be a bestseller, which it puts in the first\n` +
    `few slots. Conditioning therefore selects the easy targets and throws away the\n` +
    `hard ones - which is the whole of the gap in the row above it. Neither row is\n` +
    `interpretable alone.`
);

const rs = report.relevantSeenRate;
console.log(
  `\nCONDITIONING - the two steps-to-first-relevant rows are computed only over\n` +
    `sessions where BOTH arms surfaced a relevant item, so they compare like with\n` +
    `like. The denominators:\n` +
    `  a relevant item was seen at all: personalized ${(rs.personalized * 100).toFixed(1)}%   ` +
    `popularity ${(rs.popularity * 100).toFixed(1)}%   both ${(rs.both * 100).toFixed(1)}%`
);

const c = report.concentration;
console.log(
  `\nIMPRESSION CONCENTRATION - share of all impressions taken by the most-shown\n` +
    `tenth of the catalog. The coverage row above saturates at population scale;\n` +
    `this is where the difference in shop window actually shows up.\n` +
    `  personalized ${(c.personalized * 100).toFixed(1)}%   popularity ${(c.popularity * 100).toFixed(1)}%`
);

const g = report.gate;
console.log('\nCONFIDENCE GATE - single-arm diagnostic');
console.log('The control storefront withholds nothing, so this has no paired counterpart.');
console.log(
  `  withheld              ${g.withheldSessions} of ${g.totalSessions} sessions (${((g.withheldSessions / Math.max(1, g.totalSessions)) * 100).toFixed(1)}%)`
);
console.log(
  `  correctly withheld    ${g.correctlyWithheld} (${(g.shareOfAllSessions * 100).toFixed(1)}% of all sessions, ${(g.precision * 100).toFixed(1)}% of withheld)`
);
console.log(`  wrongly activated     ${g.wronglyActivated} sessions personalized to the wrong club\n`);

console.log(
  `UPSETS - the control arm reached the target sooner in ${(report.upsetRate * 100).toFixed(1)}% of races.`
);
console.log('Reported because a comparison the treatment always wins is a comparison');
console.log('nobody should believe.\n');

const m = report.meta;
console.log(
  `shoppers ${m.shoppers}  with a held-out target ${m.withTarget}  catalog ${m.catalogSize}  ` +
    `bootstrap ${m.bootstrapIterations}  clock ${m.clockLabel}  ${m.elapsedMs}ms\n`
);
