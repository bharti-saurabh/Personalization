# A choice model for the simulator, and a session-level department intent

Two changes to `src/sim` that belong together, because both touch
`simulateSession` and doing them in one pass means republishing the metrics once
instead of twice.

---

## Part 1 — the choice model (`src/sim/choice.ts`)

`productAffinityScore` was the right seed: it already reads the latent ground
truth that every ranker in this repo is denied, and that asymmetry is what the
whole comparison rests on. But it was a **sampling weight, not a probability** —
no calibration, no notion of a surfaced set, no position bias.

`src/sim/choice.ts` is a calibrated link function over that latent utility, and
nothing else. It does not know what a `Product` is, does not walk a session, and
does not draw random numbers. `behavior.ts` owns the mechanics.

| Quantity | Form |
|---|---|
| `examinationProbability(position)` | `(1/(r+1))^γ`, with a fold multiplier past rank 12 |
| `relevanceProbability(affinity)` | `σ(β₀ + β₁·ln a)` |
| `clickProbability(affinity, position)` | examination × relevance |
| `scrollPastProbability(affinity, position)` | examination × (1 − relevance) |
| `addProbability(affinity)` | `σ(α₀ + α₁·ln a)` — P(add \| click) |
| `abandonProbability(state)` | `σ(δ₀ + miss·streak + fatigue·slots − relief·clicks − relief·adds)` |
| `orderProbability(cart)` | `σ(γ₀ + γ₁·ln ā − γ₂·priceSensitivity·relativeValue)` |

The three slot outcomes partition exhaustively — examined-and-clicked,
examined-and-rejected, never-seen — which is what lets a later effort ledger tell
**indifference apart from invisibility**. Those are different failures with
different fixes, and a simulator that collapses them cannot support the
distinction. `scrollPast` and `abandon` are in this PR rather than deferred for
exactly that reason.

### Fitted vs assumed

This distinction is in the type system rather than in a comment. `ChoiceShape`
holds what was **assumed** — the slopes and the examination curve, chosen from
published e-commerce curve shapes, with no data here to fit them against.
`ChoiceModel` adds the three intercepts that are **fitted**, by deterministic
bisection, against explicit volume targets recorded in `calibration`.

Fitting a discrimination slope needs observed clicks with known relevance, which
is precisely what a synthetic world does not have. Claiming those were fitted
would be the dishonest part, so they are stated as assumptions.

### Why the volume targets are what they are

The three intercepts are fitted to reproduce **the aggregate volumes the flat
constants they replace already produced** — mean session depth 6.6157, add rate
0.14, conversion 0.55, all measured off the previous generator rather than
chosen.

That is the experimental design, not a coincidence. Holding volume fixed means
any movement in the evaluation metrics is attributable to a change in
*composition* — which items get clicked and carted, and in what order — rather
than to the population simply generating more or fewer events. A choice model
that also moved the event counts would confound the two and there would be no
way to tell which one moved the number.

### What this fixes downstream

- Cart adds were `rng.chance(0.2 * recencyBoost)` — a uniform coin over viewed
  items, blind to the shopper.
- Conversion was a flat `rng.chance(0.55)` — a cart full of things the shopper
  wanted converted at exactly the rate of a cart full of things they did not.

Both now read the affinity of what is actually in the cart. And `simulateSession`
now **surfaces a ranked grid and walks it**, rather than sampling views from an
affinity-weighted pool. That was the deeper problem: with no surfaced set, the
shopper found what they wanted regardless of what the store showed them, so
ranking could not help and could not hurt, and a paired A/B over this simulator
would have measured exactly zero by construction. The default `SurfacePolicy`
knows nothing about the shopper — it sorts by sales rank, softened. A
personalised arm supplies a different ordering over the same candidates.

---

## Part 2 — session-level department intent

`DEPT_RECENCY_LAMBDA` is **not** retuned. The comment that shipped with it
records that it was already moved from 0.35 to 0.08 for this exact symptom —
"at the team rate, department prediction scored below a plain popularity
baseline." Iterating on a constant until the model wins is the first thing a
client data scientist will look for, and doing it twice to the same constant
would be indefensible.

The generative story changes instead. Every click used to sample independently
from the shopper's lifetime department affinity, so one session could wander
from a jersey to a mug to a pair of socks with nothing tying them together.
Nobody shops like that. People arrive with a mission, and the mission is a
property of the visit rather than of the click.

So `focusDept` is drawn once at session start, enters `productAffinityScore`
exactly where `focusTeam` does and with the same coefficients, and whatever
number falls out gets published.

---

## Predictions, written before the run

Recorded here before executing, so they can be checked against what actually
happened rather than reconstructed afterwards. Baseline is the currently
published table (population 14,000, catalog 798, n = 2,000).

### Volumes — held fixed by construction

Depth ≈ 6.62, add rate ≈ 0.14, conversion ≈ 0.55, to within the calibration
sample's error. If these move materially, the fit failed and nothing below is
interpretable.

### 1. Intent — team: **R@1 up**

Cart adds are now affinity-driven rather than a uniform coin over views, so the
held-out anchor is far more likely to belong to the session's focus team, and
the observable order history is likewise more concentrated on the shopper's true
top teams. Signal and target both get cleaner. Position bias reinforces this: the
head of the focus team's grid absorbs most of the clicks.

Counter-pressure: abandonment truncates sessions for shoppers who get a bad grid,
which removes evidence disproportionately from low-loyalty shoppers. Those were
close to unpredictable anyway, so this should cost little.

*Predicted: R@1 above 41.1%. NDCG@10 up slightly.*

### 2. Intent — team baseline: **flat to slightly up**, so **lift compresses a little**

The baseline ranks teams by global order volume. If focus-team concentration
rises, the largest-market team's share of orders rises with it, so the baseline
gets a small free gain the model does not.

*Predicted: lift stays above 1.7x, i.e. down a little from 1.93x or flat.*

### 3. Intent — department: **R@1 falls, and likely lands at or below its baseline**

This is the number the change is really about, and the honest prediction is that
it gets worse.

The model's *effective sample size collapses*. Under per-view draws, a shopper's
~20 observable views were ~20 near-independent samples from their department
distribution, and a recency-weighted vote estimated the mode of that distribution
well. Under session-level draws those same 20 views are ~3 independent samples,
each repeated ~6 times. With `DEPT_RECENCY_LAMBDA = 0.08` — a half-life of about
8.7 events — the weighting is dominated by the most recent session or two, so the
prediction becomes approximately *"the department of the last session."*

The held-out session draws a **fresh** department from the shopper's
distribution, correlated with the last session's only through the shopper
distribution they share. So the old model was scoring roughly `E[max_d p_d]` —
name the shopper's modal department — and the new one scores roughly
`E[Σ_d p_d²]` — name the last session's department and hope the next draw
matches. `Σ p² ≤ max p` always, so this is a **strict decrease** in expectation,
not a coin flip.

*Predicted: R@1 falls from 19.7% into the 15–19% range, and the lift over
baseline drops to at or below 1.0x.*

That is a worse-looking table and it is the right change anyway: the previous
number was flattering because the generative process was unrealistically
generous, handing the model twenty independent looks at a preference a real
shopper reveals a handful of times.

### 4. Intent — department baseline: **essentially unchanged**

Moving the draw from per-view to per-session changes the *correlation structure*,
not the marginal — the department distribution over baskets is the same mixture
either way. Only the affinity-driven cart selection tilts it, and only slightly.

*Predicted: 17–19%, against 17.5% now.*

### 5. Complement: **absolute up, lift roughly flat**

Anchors are now drawn by affinity from carted items, and carted items concentrate
on the focus team and department, so the co-order graph gets materially more
support per pair — fewer estimates forced to back off to the department level.
But the same concentration is a gift to a head-weighted popularity baseline, so
most of the absolute gain should be shared.

The R@1 tie should persist, and for the same structural reason it exists now: the
single likeliest companion for an anchor genuinely is the team's bestseller, so
both methods name it first.

*Predicted: R@1 up for both, tie at rank 1 holds, NDCG@10 lift stays in
1.2–1.6x. n stays near 904.*

### 6. Similarity: **up substantially, and lift up**

Within-session views are now homogeneous on **both** team and department, where
before they were homogeneous only on team. The held-out co-view target therefore
shares two metadata axes with the query instead of one, and the similarity
embedding encodes exactly those axes. Position bias adds a third concentrating
force: co-viewed items are now neighbours in the same grid.

*Predicted: R@1 from 4.5% to somewhere in 6–12%; lift above 4.1x.*

**And this is the result to be most suspicious of.** A good part of any gain here
is the encoder re-reading structure the simulator was just made more blatant
about, not the encoder getting better. If similarity jumps a long way while
department falls, that asymmetry is evidence about the generator, not about the
models. It needs saying on the screen next to the number.

---

## Harness comparability — the before and after numbers are NOT directly comparable

The evaluation harness holds out the last purchasing session and scores against
the department of that basket's anchor. **The harness code is unchanged. What the
label means is not.**

- **Harness A (previous generator).** The held-out target is the department of an
  anchor drawn from a basket whose items were each sampled independently from the
  shopper's stable lifetime department affinity. Predicting it is *estimating a
  per-view multinomial* from many draws of that same multinomial.

- **Harness B (this generator).** The held-out target is the department of an
  anchor from a session that had a single drawn department intent. Predicting it
  is *forecasting the next session's mission* from a handful of previous
  missions.

These are different prediction tasks of different difficulty against a different
random variable. A single "department R@1 went from x% to y%" line would be a
false comparison, so both tables stay published, side by side and labelled, in
`WHAT-WE-BUILT.md` and on the Model Evidence screen. The Harness A numbers are
kept as a recorded historical measurement under a generator that no longer
exists, not re-run.

The team, complement and similarity targets are affected by Part 1 as well, so
the same caveat applies to them — with the difference that their *definitions*
were never department-dependent, and the change there is a change in the data
rather than in the question.

---

## Results

Filled in after the run, against the predictions above.
