/**
 * Developer utility: build the synthetic dataset and print a health report.
 * Run with `npm run sim:inspect`. Not part of the browser bundle.
 */

import { getDataset } from '../src/sim/dataset';
import { DEPARTMENT_IDS, TEAM_IDS } from '../src/sim/taxonomy';

const ds = getDataset();

console.log('=== CATALOG ===');
console.log(`products: ${ds.products.length}`);
for (const t of TEAM_IDS) {
  const n = ds.products.filter((p) => p.team === t).length;
  console.log(`  ${t.padEnd(10)} ${n}`);
}
console.log('by department:');
for (const d of DEPARTMENT_IDS) {
  const n = ds.products.filter((p) => p.department === d).length;
  console.log(`  ${d.padEnd(14)} ${n}`);
}

console.log('\n=== SAMPLE PRODUCTS ===');
for (const p of ds.products.slice(0, 5)) {
  console.log(
    `  [${p.priceBand}] $${(p.salePrice ?? p.price).toFixed(2)} pop=${p.popularity} :: ${p.name}`
  );
}

console.log('\n=== SIMULATION ===');
console.log(ds.stats);

console.log('\n=== GRAPH DENSITY ===');
const nnz = (m: Map<number, Map<number, number>>) => {
  let c = 0;
  for (const row of m.values()) c += row.size;
  return c;
};
console.log(`coView  non-zero pairs: ${nnz(ds.graphs.coView)}`);
console.log(`coCart  non-zero pairs: ${nnz(ds.graphs.coCart)}`);
console.log(`coOrder non-zero pairs: ${nnz(ds.graphs.coOrder)}`);
console.log(`products with zero order co-occurrence: ${ds.products.filter((_, i) => !ds.graphs.coOrder.get(i)).length}`);

console.log('\n=== DIRECTIONALITY CHECK (ground truth recovery) ===');
// P(hat | jersey) should materially exceed P(jersey | hat).
const deptOrders = new Map<string, number>();
const deptPairOrders = new Map<string, number>();
for (const c of ds.customers) {
  for (const s of c.sessions) {
    if (s.ordered.length === 0) continue;
    const depts = new Set(s.ordered.map((i) => ds.products[i].department));
    for (const d of depts) deptOrders.set(d, (deptOrders.get(d) ?? 0) + 1);
    for (const a of depts) {
      for (const b of depts) {
        if (a === b) continue;
        deptPairOrders.set(`${a}->${b}`, (deptPairOrders.get(`${a}->${b}`) ?? 0) + 1);
      }
    }
  }
}
const cond = (a: string, b: string) => {
  const joint = deptPairOrders.get(`${a}->${b}`) ?? 0;
  const base = deptOrders.get(a) ?? 0;
  return base > 0 ? joint / base : 0;
};
console.log(`  P(Hats    | Jerseys) = ${cond('Jerseys', 'Hats').toFixed(3)}`);
console.log(`  P(Jerseys | Hats)    = ${cond('Hats', 'Jerseys').toFixed(3)}   <- must be lower`);
console.log(`  P(Hoodies | Jerseys) = ${cond('Jerseys', 'Hoodies').toFixed(3)}`);
console.log(`  P(T-shirts| Hats)    = ${cond('Hats', 'T-shirts').toFixed(3)}`);

console.log('\n=== HELD-OUT LABELS ===');
const labelled = ds.customers.filter((c) => c.heldOut);
console.log(`customers with a held-out next basket: ${labelled.length} / ${ds.customers.length}`);
const withHistory = labelled.filter((c) => c.sessions.length > 0);
console.log(`  of those, with at least one prior session: ${withHistory.length}`);
