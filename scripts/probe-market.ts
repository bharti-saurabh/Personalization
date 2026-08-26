/**
 * MARKET EVENT PROBE - what a fired event actually does to the world.
 *
 * The claim attached to the TRADE event is specific: the player moves club,
 * jersey demand transfers with him, co-order priors for the affected items
 * recompute, and the touched products flag as hot market. Those are four
 * measurable statements, and this script measures them rather than restating
 * them. Every figure quoted for the market layer in WHAT-WE-BUILT.md comes
 * out of here, so a reader who doubts one can re-run it:
 *
 *   npm run sim:market
 *
 * Method is two independent worlds - `buildWorld(quiet)` and
 * `buildWorld(withEvent(quiet, trade))` - built from the same seed and diffed.
 * Same seed matters: every difference below is caused by the event and by
 * nothing else. Note that this also doubles as a live isolation check, since
 * the two worlds are built back to back in one process; `src/sim/clock.test.ts`
 * is where that property is actually asserted.
 *
 * Runs two full 14,000-shopper simulations, so budget ~10s.
 */
import { DEFAULT_CLOCK, EVENT_DECK, describeEvent, fireTemplate, teamDemand, withEvent } from '../src/sim/clock';
import { buildWorld, Dataset } from '../src/sim/dataset';
import type { Product } from '../src/types';

const trade = fireTemplate(EVENT_DECK[0], DEFAULT_CLOCK, 1);
const quiet = DEFAULT_CLOCK;
const after = withEvent(quiet, trade);

const started = Date.now();
const A = buildWorld(quiet);
const B = buildWorld(after);

const pct = (a: number, b: number) => `${b > a ? '+' : ''}${(((b - a) / Math.max(1, a)) * 100).toFixed(0)}%`;
const head = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);

console.log(`\n\x1b[1mMARKET PROBE\x1b[0m  -  ${describeEvent(trade).headline}`);
console.log(`${describeEvent(trade).detail}`);
console.log(`clock ${quiet.month + 1}/${quiet.year}, ${quiet.events.length} event(s) -> ${after.events.length} event(s)`);

// ---------------------------------------------------------------- population
head('1. POPULATION  -  does the event reach the shoppers, not just the shelf?');
console.log(`  teamDemand  Cowboys ${teamDemand('Cowboys', after).toFixed(2)}x   Eagles ${teamDemand('Eagles', after).toFixed(2)}x`);

const focusShare = (d: Dataset) => {
  const by = new Map<string, number>();
  let n = 0;
  for (const c of d.customers) for (const s of c.sessions) { by.set(s.focusTeam, (by.get(s.focusTeam) ?? 0) + 1); n++; }
  return by.size ? new Map([...by].map(([t, v]) => [t, (v / n) * 100])) : by;
};
const fa = focusShare(A), fb = focusShare(B);
for (const t of [...fa.keys()].sort()) {
  const a = fa.get(t) ?? 0, b = fb.get(t) ?? 0;
  const mark = Math.abs(b - a) >= 1 ? '  <-' : '';
  console.log(`  session focus  ${t.padEnd(9)} ${a.toFixed(1)}% -> ${b.toFixed(1)}%${mark}`);
}

// ------------------------------------------------------------------- catalog
head('2. CATALOG  -  what got rewritten, and what merely got re-weighted?');
const flagged = B.products.filter((p) => p.marketFlag?.eventId === trade.id);
const moved = flagged.filter((p) => p.movedFrom);
console.log(`  catalog size   ${A.products.length} -> ${B.products.length} (ids are stable; a cart survives the event)`);
console.log(`  flagged        ${flagged.length} products carry a marketFlag`);
console.log(`    moved club   ${moved.length}   (rewritten: club, league, name, colourway, number)`);
console.log(`    lifted       ${flagged.filter((p) => p.marketFlag!.lift > 1).length}`);
console.log(`    damped       ${flagged.filter((p) => p.marketFlag!.lift < 1).length}`);

const avgPop = (d: Dataset, team: string, dept?: string) => {
  const s = d.products.filter((p) => p.team === team && (!dept || p.department === dept));
  return [s.length, s.length ? s.reduce((t, p) => t + p.popularity, 0) / s.length : 0] as const;
};
for (const team of ['Cowboys', 'Eagles'] as const) {
  const [na, pa] = avgPop(A, team), [nb, pb] = avgPop(B, team);
  const [ja, jpa] = avgPop(A, team, 'Jerseys'), [jb, jpb] = avgPop(B, team, 'Jerseys');
  console.log(`  ${team.padEnd(8)} assortment ${na}->${nb}, avg popularity ${pa.toFixed(1)}->${pb.toFixed(1)}`);
  console.log(`  ${''.padEnd(8)} jerseys    ${ja}->${jb}, avg popularity ${jpa.toFixed(1)}->${jpb.toFixed(1)}`);
}

// --------------------------------------------------------------- the demand
head('3. DEMAND TRANSFER  -  did the jersey demand follow the player?');
const orders = (d: Dataset, pred: (p: Product) => boolean) => {
  const hit = new Set(d.products.map((p, i) => (pred(p) ? i : -1)).filter((i) => i >= 0));
  let u = 0;
  for (const c of d.customers) for (const s of c.sessions) for (const i of s.ordered) if (hit.has(i)) u++;
  return u;
};
const player = trade.kind === 'TRADE' ? trade.player : '';
const isPlayer = (p: Product) => p.name.includes(player);
console.log(`  ${player} orders            ${orders(A, isPlayer)} -> ${orders(B, isPlayer)}   (${pct(orders(A, isPlayer), orders(B, isPlayer))})`);
console.log(`    ...booked under Eagles     ${orders(A, (p) => isPlayer(p) && p.team === 'Eagles')} -> ${orders(B, (p) => isPlayer(p) && p.team === 'Eagles')}`);
console.log(`    ...booked under Cowboys    ${orders(A, (p) => isPlayer(p) && p.team === 'Cowboys')} -> ${orders(B, (p) => isPlayer(p) && p.team === 'Cowboys')}`);
const cj = [orders(A, (p) => p.team === 'Cowboys' && p.department === 'Jerseys'), orders(B, (p) => p.team === 'Cowboys' && p.department === 'Jerseys')];
const ej = [orders(A, (p) => p.team === 'Eagles' && p.department === 'Jerseys'), orders(B, (p) => p.team === 'Eagles' && p.department === 'Jerseys')];
console.log(`  Cowboys jersey orders        ${cj[0]} -> ${cj[1]}   (${pct(cj[0], cj[1])})`);
console.log(`  Eagles  jersey orders        ${ej[0]} -> ${ej[1]}   (${pct(ej[0], ej[1])})`);

// ------------------------------------------------------------- co-order graph
head('4. CO-ORDER PRIORS  -  did the graph recompute, or just the labels?');
const sample = B.products.find((p) => p.movedFrom && p.department === 'Jerseys')!;
const idx = B.products.findIndex((p) => p.id === sample.id);
const clubMass = (d: Dataset) => {
  const row = d.graphs.coOrder.get(idx) ?? new Map<number, number>();
  let cow = 0, eag = 0, tot = 0;
  for (const [j, w] of row) { tot += w; if (d.products[j].team === 'Cowboys') cow += w; if (d.products[j].team === 'Eagles') eag += w; }
  return `${String(tot).padStart(3)} co-orders  |  Cowboys ${((cow / Math.max(1, tot)) * 100).toFixed(0)}%  Eagles ${((eag / Math.max(1, tot)) * 100).toFixed(0)}%`;
};
console.log(`  sample: ${sample.id}  (${A.products[idx].team} -> ${sample.team})`);
console.log(`    before  ${clubMass(A)}`);
console.log(`    after   ${clubMass(B)}`);

let changed = 0;
for (const p of A.products) {
  if (Math.abs((A.graphScores.get(p.id)?.coOrder ?? 0) - (B.graphScores.get(p.id)?.coOrder ?? 0)) > 1e-9) changed++;
}
console.log(`  co-order degree moved for ${changed}/${A.products.length} products`);
console.log(`    (the whole population re-shops under the new demand, so this is expected to be near-total;`);
console.log(`     the club-share flip above is the claim that the priors genuinely recomputed)`);

head('5. COST');
console.log(`  world rebuild   ${B.stats.buildMs}ms   (catalog + 14,000 shoppers + three co-graphs)`);
console.log(`  probe total     ${Date.now() - started}ms for both worlds\n`);
