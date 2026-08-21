/**
 * Dev tool: renders the procedural product imagery to a static contact sheet, so
 * a change to ProductImage.tsx can be eyeballed across the whole catalog rather
 * than one PDP at a time.
 *
 *   npm run sim:imagery                       # every team x subdept x colourway
 *   BY_SUB=1 npm run sim:imagery              # one cell per subdepartment
 *   DEPTS="Hats,Collectibles" npm run sim:imagery
 *
 * Writes /tmp/contact-sheet.html. Not imported by the app.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'fs';
import { getDataset } from '../src/sim/dataset';
import { ProductImage } from '../src/components/storefront/ProductImage';

const products = getDataset().products;
const seen = new Set<string>();
const DEPT_FILTER = process.env.DEPTS?.split(',');
const picks = products.filter((p) => {
  if (DEPT_FILTER && !DEPT_FILTER.includes(p.department)) return false;
  const k = process.env.BY_SUB ? p.subdepartment : `${p.team}|${p.subdepartment}|${p.colorway}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

// Interleave by team so one sheet shows every colourway family side by side.
const byTeam = new Map<string, typeof picks>();
picks.forEach((p) => {
  if (!byTeam.has(p.team)) byTeam.set(p.team, []);
  byTeam.get(p.team)!.push(p);
});
const teams = [...byTeam.values()];
const interleaved: typeof picks = [];
for (let i = 0; i < Math.max(...teams.map((t) => t.length)); i++) {
  teams.forEach((t) => t[i] && interleaved.push(t[i]));
}

const cells = interleaved
  .slice(0, 240)
  .map(
    (p) =>
      `<figure><div class="sq">${renderToStaticMarkup(
        React.createElement(ProductImage, { product: p })
      )}</div><figcaption>${p.subdepartment} · ${p.colorway} · ${p.team}</figcaption></figure>`
  )
  .join('');

writeFileSync(
  '/tmp/contact-sheet.html',
  `<style>body{font:11px system-ui;background:#0f172a;color:#cbd5e1;margin:16px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.sq{aspect-ratio:1;border-radius:8px;overflow:hidden}svg{width:100%;height:100%;display:block}
figcaption{margin-top:4px;font-size:10px;opacity:.75}figure{margin:0}</style><main>${cells}</main>`
);
console.log(`${picks.length} distinct combos, wrote ${Math.min(400, picks.length)} cells`);
