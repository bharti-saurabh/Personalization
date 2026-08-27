/**
 * Properties of the badge statistics.
 *
 * A badge is a claim, and the two ways a claim goes wrong here are that the
 * number behind it is not the number the rule used, and that the cohort is so
 * large the claim is meaningless. The tests below pin the first directly and
 * make the second observable: `cohortShare` is computed off the real catalog
 * and rendered on hover, so a store where a third of the grid says Best Seller
 * shows a third on every one of those tiles.
 *
 * Run with `npm test`. No DOM, no React.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { Product } from '../types';
import { BADGE_BASIS_NOTE, badgeStatsFor, buildBadgeIndex } from './badges';
import { getDataset } from '../sim/dataset';

function product(partial: Partial<Product> = {}): Product {
  return {
    id: 'b1',
    name: 'Badge Product',
    team: 'Eagles',
    league: 'NFL',
    department: 'Jerseys',
    subdepartment: 'Game Jersey',
    brand: 'Nike',
    gender: 'Men',
    ageGroup: 'Adult',
    price: 120,
    priceBand: '$$$',
    rating: 4.5,
    reviewCount: 100,
    inventoryStatus: 'In Stock',
    imageBg: '',
    styleFamily: 'Nike Game',
    popularity: 50,
    primaryColor: '#004C54',
    secondaryColor: '#A5ACAF',
    ...partial,
  };
}

const catalog = getDataset().products;
const index = buildBadgeIndex(catalog);

test('the percentile is a percentile of the field the rule actually reads', () => {
  const seller = catalog.find((p) => p.badge === 'Best Seller');
  assert.ok(seller, 'the catalog has best sellers');
  const stat = badgeStatsFor(seller!, index).find((s) => s.badge === 'Best Seller');
  assert.ok(stat);

  // Computed independently of the module, off the same catalog.
  const share = catalog.filter((p) => p.popularity <= seller!.popularity).length / catalog.length;
  assert.ok(Math.abs((stat!.percentile ?? 0) - share) < 0.001);
});

test('the cohort is the real count and the share is derived from it', () => {
  const seller = catalog.find((p) => p.badge === 'Best Seller')!;
  const stat = badgeStatsFor(seller, index).find((s) => s.badge === 'Best Seller')!;
  assert.equal(stat.cohort, catalog.filter((p) => p.badge === 'Best Seller').length);
  assert.ok(Math.abs(stat.cohortShare - stat.cohort / catalog.length) < 1e-9);
  assert.ok(stat.stat.includes(String(stat.cohort)), 'the count is in the sentence, not only in the field');
});

test('a Best Seller really does out-rank every Popular in the same catalog', () => {
  // The two badges are assigned off one field by two thresholds, so this is a
  // property of the assignment rule and it is worth pinning: a "Popular" tile
  // that outsells a "Best Seller" tile would make both badges noise.
  const sellers = catalog.filter((p) => p.badge === 'Best Seller');
  const populars = catalog.filter((p) => p.badge === 'Popular');
  if (sellers.length && populars.length) {
    assert.ok(Math.min(...sellers.map((p) => p.popularity)) > Math.max(...populars.map((p) => p.popularity)));
  }
});

test('every badge carries a rule, a statistic and a cohort - none of them blank', () => {
  for (const p of catalog.slice(0, 400)) {
    for (const s of badgeStatsFor(p, index)) {
      assert.ok(s.rule.length > 5, `${p.id} ${s.badge}: no rule`);
      assert.ok(s.stat.length > 5, `${p.id} ${s.badge}: no statistic`);
      assert.ok(s.claim.length > 5, `${p.id} ${s.badge}: no claim`);
      assert.ok(s.cohort > 0, `${p.id} ${s.badge}: a badge nothing else carries is a cohort of one, not zero`);
      assert.ok(s.cohortShare > 0 && s.cohortShare <= 1);
    }
  }
});

test('everything derived from a synthetic field says so', () => {
  // The disclosure is the reason the numbers above are safe to quote. If a badge
  // ever stops being marked simulated, this build has started claiming a
  // measurement it did not take.
  for (const p of catalog.slice(0, 200)) {
    for (const s of badgeStatsFor(p, index)) assert.equal(s.simulated, true);
  }
  assert.ok(BADGE_BASIS_NOTE.includes('simulated'));
});

test('a discount reports its own size against the catalog median', () => {
  const p = product({ price: 100, salePrice: 60 });
  const stat = badgeStatsFor(p, index).find((s) => s.badge.includes('OFF'));
  assert.ok(stat);
  assert.ok(stat!.stat.includes('40%'));
  assert.ok(stat!.stat.includes('median'));
});

test('a product with no badge and nothing remarkable reports nothing', () => {
  // Silence is the correct output. A tooltip that appears with "no badge" in it
  // is a tooltip on every tile in the grid.
  const plain = product({ popularity: 40, inventoryStatus: 'In Stock', releaseRecency: 0.9 });
  assert.equal(badgeStatsFor(plain, index).length, 0);
});

test('a product can carry more than one claim, each with its own number', () => {
  const p = product({ badge: 'Best Seller', popularity: 95, salePrice: 90, inventoryStatus: 'Low Stock' });
  const stats = badgeStatsFor(p, index);
  const badges = stats.map((s) => s.badge);
  assert.ok(badges.some((b) => b === 'Best Seller'));
  assert.ok(badges.some((b) => b.includes('OFF')));
  assert.ok(badges.some((b) => b === 'Almost gone'));
  // Each is a separate cohort, not one number reused.
  assert.ok(new Set(stats.map((s) => s.cohort)).size > 1);
});
