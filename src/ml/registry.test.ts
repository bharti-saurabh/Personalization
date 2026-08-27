/**
 * Properties of the model registry.
 *
 * A registry is documentation, and documentation drifts. Every test here exists
 * to make a specific kind of drift fail the build rather than quietly become
 * untrue on a screen a client is reading:
 *
 *   - a card whose threshold is copied rather than read from the module that
 *     enforces it, so recalibrating a gate leaves the registry stating the old
 *     number;
 *   - a card with no offline metric AND no stated reason for not having one,
 *     which reads on screen as an oversight rather than as a position;
 *   - a threshold with no scale, which is the exact defect ml/suppression.ts
 *     grew a `ScoreScale` type to prevent, reintroduced one level up;
 *   - a feature vector that returns constants dressed as observations.
 *
 * Run with `npm test`. No DOM, no React.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CARD_BY_ID, MODEL_CARDS, featureVectorFor, halfLife, lastFiredFor } from './registry';
import { DECAY } from './profile';
import { createProfile } from './profile';
import { CONFIDENCE_THRESHOLD } from './intent';
import { SCALE_RANGE, SURFACE_POLICIES } from './suppression';
import { FIT_PREFILL_FLOOR } from './fit';

test('the registry does not collide with the artefact cache that is also called a registry', async () => {
  // ml/models.ts exports an interface named ModelRegistry. Two different things
  // by one name in one directory is how a codebase starts lying to its readers.
  const registry = await import('./registry');
  assert.equal('ModelRegistry' in registry, false);
});

test('every card is complete - no blank purpose, inputs, source or note', () => {
  for (const c of MODEL_CARDS) {
    assert.ok(c.purpose.length > 20, `${c.id}: no purpose`);
    assert.ok(c.inputs.length > 0, `${c.id}: no inputs`);
    assert.ok(c.version.length > 0, `${c.id}: no version`);
    assert.ok(c.source.startsWith('src/'), `${c.id}: source is not a path`);
    assert.ok(c.note.length > 20, `${c.id}: no note`);
  }
  const ids = MODEL_CARDS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate card id');
  assert.equal(Object.keys(CARD_BY_ID).length, MODEL_CARDS.length);
});

test('a card without an offline metric says why, every time', () => {
  // THE ONE THAT MATTERS MOST. Six of these models have no recall number and
  // each has a different reason - no held-out truth, no labelled set, measured
  // on-screen instead, or measured as an empty-rail rate. A blank cell reads as
  // "we did not get to it"; a stated reason is the position this build takes.
  for (const c of MODEL_CARDS) {
    const hasMetric = c.metric !== null;
    const hasReason = c.metricAbsentReason !== null;
    assert.notEqual(hasMetric, hasReason, `${c.id}: needs exactly one of a metric and a reason for not having one`);
    if (hasReason) assert.ok(c.metricAbsentReason!.length > 40, `${c.id}: the reason is too thin to be one`);
  }
  assert.ok(MODEL_CARDS.some((c) => c.metric), 'at least the four evaluated engines carry real metrics');
});

test('every threshold names the distribution it is denominated in', () => {
  for (const c of MODEL_CARDS) {
    if (!c.activation) continue;
    assert.ok(c.activation.scale, `${c.id}: a threshold with no scale`);
    assert.ok(c.activation.note.length > 20, `${c.id}: a threshold with no explanation`);
    // A bar denominated in one of the engine scales must sit inside that
    // engine's measured range, exactly as the surface policies must.
    if (c.activation.scale in SCALE_RANGE) {
      const { lo, hi } = SCALE_RANGE[c.activation.scale as keyof typeof SCALE_RANGE];
      assert.ok(
        c.activation.threshold > lo && c.activation.threshold < hi,
        `${c.id}: ${c.activation.threshold} is outside the ${c.activation.scale} range ${lo}-${hi}`
      );
    }
  }
});

test('the numbers on the cards are read from the modules that enforce them', () => {
  // Not "match today" - READ FROM. These assertions fail if someone recalibrates
  // a gate and the registry keeps quoting the old bar, which is the single most
  // likely way this screen becomes untrue.
  assert.equal(CARD_BY_ID.intent.activation?.threshold, CONFIDENCE_THRESHOLD);
  assert.equal(CARD_BY_ID.similarity.activation?.threshold, SURFACE_POLICIES.pdp_similar.leadThreshold);
  assert.equal(CARD_BY_ID.complement.activation?.threshold, SURFACE_POLICIES.pdp_complement.leadThreshold);
  assert.equal(CARD_BY_ID.lifecycle.activation?.threshold, SURFACE_POLICIES.lifecycle_sms.leadThreshold);
  assert.equal(CARD_BY_ID.fit.activation?.threshold, FIT_PREFILL_FLOOR);
  assert.equal(CARD_BY_ID.intent.decay?.lambda, DECAY.team);
  assert.equal(CARD_BY_ID.suppression.decay?.lambda, DECAY.impression);
  assert.equal(CARD_BY_ID.fit.decay?.lambda, DECAY.size);
});

test('a half-life is events, and a field that does not decay has none', () => {
  assert.equal(halfLife(0), null);
  assert.equal(halfLife(DECAY.region), null);
  const team = halfLife(DECAY.team)!;
  assert.ok(Math.abs(Math.exp(-DECAY.team * team) - 0.5) < 1e-9, 'half of the evidence is gone after a half-life');
  // Club interest fades faster than department interest. If this inverts,
  // something has been changed without its comment being reread.
  assert.ok(halfLife(DECAY.team)! < halfLife(DECAY.department)!);
});

test('a card that writes nothing says so rather than inventing a field', () => {
  const retrieval = MODEL_CARDS.filter((c) => c.family === 'retrieval');
  assert.ok(retrieval.length > 0);
  for (const c of retrieval) assert.equal(c.writes, null);
  // And a card that does write names a path a reader can go and find.
  for (const c of MODEL_CARDS) {
    if (c.writes && c.writes.includes('.')) {
      assert.ok(/^[a-z][A-Za-z.\[\]]+$/.test(c.writes), `${c.id}: "${c.writes}" is not a dotted path`);
    }
  }
});

/* --------------------------------------------------- the live feature vector -- */

test('a feature vector with no profile says there is no profile', () => {
  const rows = featureVectorFor(CARD_BY_ID.intent, null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, null);
});

test('every card returns a feature vector, and every row names where its value came from', () => {
  const profile = createProfile('registry-test');
  for (const c of MODEL_CARDS) {
    const rows = featureVectorFor(c, profile);
    assert.ok(rows.length > 0, `${c.id}: no feature vector`);
    for (const r of rows) {
      assert.ok(r.name.length > 0, `${c.id}: an unnamed row`);
      assert.ok(r.source.length > 3, `${c.id}/${r.name}: no source - a value with no provenance is a claim`);
      assert.notEqual(r.source, 'the model');
    }
  }
});

test('the vector moves when the profile moves', () => {
  // The point of expanding a row is to watch a description stop being one. If
  // every value is a constant, the screen is documentation with a chevron on it.
  const cold = createProfile('cold');
  const warm = { ...cold, observedEvents: 12, state: { ...cold.state, lifetimeOrders: 4 } };

  const a = featureVectorFor(CARD_BY_ID.profile_fold, cold);
  const b = featureVectorFor(CARD_BY_ID.profile_fold, warm);
  assert.notDeepEqual(
    a.map((r) => r.value),
    b.map((r) => r.value)
  );
});

/* -------------------------------------------------------------- last fired -- */

test('last-fired takes the most recent step and ignores engines no card claims', () => {
  const marks = lastFiredFor([
    { engine: 'intent', step: 1, label: 'landed' },
    { engine: 'intent', step: 5, label: 'opened a jersey' },
    { engine: 'similarity', step: 4, label: 'similar rail' },
    { engine: 'not-a-model', step: 9, label: 'noise' },
    { engine: null, step: 10, label: 'no engine' },
  ]);
  assert.equal(marks.intent.step, 5);
  assert.equal(marks.intent.label, 'opened a jersey');
  assert.equal(marks.similarity.step, 4);
  assert.equal('not-a-model' in marks, false);
  // Both intent heads run on the same engine, so both are marked.
  assert.equal(marks.intent_department.step, 5);
});

test('a card with no engine never claims to have fired on the journal alone', () => {
  const gates = MODEL_CARDS.filter((c) => c.engine === null);
  assert.ok(gates.length > 0, 'the gates are reported through the surfaces they gate');
  const marks = lastFiredFor([{ engine: 'intent', step: 1, label: 'x' }]);
  for (const g of gates) assert.equal(g.id in marks, false);
});

test('every card is reachable by exactly one door', () => {
  // A card matched by both an engine and a ledger probe would be two writers
  // for one number, and the two would eventually disagree about when it ran.
  for (const c of MODEL_CARDS) {
    const doors = (c.engine ? 1 : 0) + (c.ledger ? 1 : 0);
    assert.equal(doors, 1, `${c.id}: ${doors} ways to mark it as fired`);
  }
});

test('the gates report through the effort ledger, and the shared kind is disambiguated', () => {
  // Suppression and lifecycle both write `suppressed_impression`. They are told
  // apart by surface - and if that ever stops working, both cards light up on
  // one event and the screen quietly lies about which model ran.
  const marks = lastFiredFor(
    [],
    [
      { kind: 'suppressed_impression', surface: 'Complete the look', step: 3, label: 'viewed a jersey' },
      { kind: 'suppressed_impression', surface: 'Lifecycle triggers', step: 7, label: 'left with a full cart' },
      { kind: 'size_hunt', surface: 'Size selector', step: 4, label: 'opened a hoodie' },
      { kind: 'dead_end', surface: 'Out of stock', step: 5, label: 'asked for 2XL' },
    ]
  );
  assert.equal(marks.suppression.step, 3);
  assert.equal(marks.lifecycle.step, 7);
  assert.equal(marks.fit.step, 4);
  assert.equal(marks.substitution.step, 5);
  // And the journal-matched cards stay out of it.
  assert.equal('intent' in marks, false);
});
