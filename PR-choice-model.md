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

Four predictions right, five wrong, and the one I argued hardest for was wrong
in direction by eight points. The reasoning is below rather than quietly
rewritten.

### A bug the predictions did not survive contact with

Running the department change first produced almost nothing: department R@1
moved 19.7% -> 20.0%, and within-session department concentration - the share of
a session's views landing in its most-viewed department - moved **0.3907 ->
0.3807**, measured over 30,000 sessions. The generative change did not change the
generative story. Sweeping the intent strength from 0.05 to 0.45 moved that
number by less than a point in either direction.

The cause was in Part 1, not Part 2. With the original position curve the whole
48-slot grid contributed only **10.5 expected examinations**, so calibrating to a
mean depth of 6.6 clicks forced a click-given-examination rate of 63%. That drove
the fitted intercept to +2.64, deep into the flat top of the sigmoid. The
resulting shopper clicked an item it barely wanted 69% of the time and one it
loved 92%: it was **indifferent to what it was shown**, and nothing else in the
output revealed it. Every downstream signal was washed out, which is why the
department change had nothing to act through.

The fix is structural: a shopper must examine far more than they click, or
selectivity has nowhere to live. Examination is now broad and shallow-decaying
(21.3 expected examinations), and the click decision is where discrimination
happens.

`sim:eval` now reports **selectivity** - the share of clicks landing in the top
affinity quartile of the grid actually shown, where about 0.25 is indifference -
so this class of failure is visible on every run instead of requiring someone to
go looking. Pre-fix: **0.27**. Post-fix: **0.34**.

### The surfacing seam, which is the point of Part 1

`measureSurfacePolicy` runs two arms over the same seed, so the populations are
identical shopper for shopper and the only difference is the order of the grid.

| arm | depth | add rate | conv\|cart | selectivity | abandon | adds/session |
|---|---|---|---|---|---|---|
| organic (popularity) | 6.55 | 0.142 | 0.545 | 0.346 | 0.462 | 0.93 |
| oracle (latent truth) | 10.69 | 0.200 | 0.541 | 0.382 | 0.268 | **2.14** |
| adversarial (reversed) | 0.10 | 0.050 | 0.436 | 0.003 | 0.995 | 0.01 |

An oracle ranker more than doubles cart adds per session and cuts abandonment by
42%. An adversarial one destroys the world. **Before this PR both arms would have
returned the same numbers to four decimal places**, because the shopper sampled
from an affinity-weighted pool rather than walking a grid, so ranking could not
help and could not hurt. The seam now measures something.

One result worth flagging because it is not the obvious one: conversion *given a
cart* barely moves between arms (0.545 vs 0.541). Better ranking does not make a
cart convert better - it makes a cart happen at all. Any ROI story built on this
simulator should attribute to add rate and abandonment, not to checkout.

### Scored against the predictions

Standard error on R@1 at n=2000 is about 1.1 points, and about 0.5 points at
n=950 for the near-zero complement rates. The two runs are different random
worlds, so comparisons across them are unpaired and the error on a difference is
larger again. Movements under ~2 points are not resolvable and are marked as
such rather than claimed.

| metric | before (A) | predicted | after (B) | verdict |
|---|---|---|---|---|
| depth / add / conv | 6.616 / .140 / .550 | held fixed | 6.479 / .141 / .548 | **right** |
| Intent-team R@1 | 41.1% | up | 40.0% | **wrong**, though within noise |
| Intent-team baseline | 21.3% | flat to slightly up | 24.1% | **right** |
| Intent-team lift R@1 | 1.93x | above 1.7x | 1.66x | **wrong** |
| **Intent-dept R@1** | **19.7%** | **falls to 15-19%** | **27.7%** | **wrong by 8 points** |
| Intent-dept baseline | 17.5% | 17-19% | 18.5% | **right** |
| Intent-dept lift R@1 | 1.12x | at or below 1.0x | 1.50x | **wrong** |
| Complement R@1 | 2.9% | up | 2.9% | **wrong**, flat |
| Complement R@1 tie | tied | tie holds | 2.9% vs 2.7% | right, unresolvable |
| Complement NDCG lift | 1.37x | 1.2-1.6x | 1.11x | **wrong**, below range |
| Complement n | 904 | 880-950 | 954 | right, just outside |
| Similarity R@1 | 4.5% | 6-12% | 7.8% | **right** |
| Similarity lift R@1 | 4.09x | above 4.1x | 3.63x | **wrong** |
| selectivity | not measured | - | 0.344 | new |
| slots walked / scrolled past / abandon | not measured | - | 30.7 / 8.0 / 0.471 | new |

### Where the department prediction went wrong

The argument was that session-level draws collapse the model's effective sample
size - twenty near-independent looks at a preference become about three - so a
recency-weighted vote degrades from naming the shopper's modal department to
naming their last session's, and `E[sum p^2] <= E[max p]` makes that a strict
decrease.

That reasoning about the **estimator** is still correct as far as it goes. The
error is that it analysed only the estimator's input and never asked what
happened to the **target**, which changed far more:

| | before (A) | after (B) |
|---|---|---|
| P(held-out anchor's dept == shopper's modal dept) | **0.183** | **0.433** |
| E[max_d p_d] - ceiling for any mode predictor | 0.494 | 0.496 |

The held-out target became **2.4x more predictable**. Cart adds are now
affinity-driven rather than a uniform coin over views, and affinity now carries
the session's department intent, so the anchor a shopper actually buys reflects
what they actually prefer. Before, it was close to an arbitrary draw from the
catalog's department mix - which is why the old 19.7% sat barely above its
popularity baseline and looked like a weak model. It was not a weak model. **It
was a nearly unlearnable target**, and I read a broken task as a broken engine.

The target gained far more than the estimator lost, and department is now the
second-strongest engine in the table at 1.50x rather than the weakest at 1.12x.
Note that both numbers are honest measurements of different questions - see the
comparability section - and neither is evidence that the intent model improved,
because the intent model was not touched in this PR.

### The other misses

**Team lift fell (1.93x -> 1.66x) because the baseline rose**, 21.3% -> 24.1%.
Predicted direction for the baseline was right; the magnitude was not. Greater
focus-team concentration in orders is a straightforward gift to a
rank-teams-by-order-volume baseline, and it collected more of it than the model
did. The model's own R@1 barely moved.

**Complement lost ground to its baseline** (NDCG lift 1.37x -> 1.11x), which was
predicted to hold or rise. The model fell slightly (9.4% -> 8.8%) while the
baseline rose (6.9% -> 7.9%). This is the honest negative result in the set. The
likely mechanism is that anchors now concentrate on higher-popularity items -
mean anchor popularity 80.4 -> 81.5 - and a popularity baseline is exactly the
thing that benefits from that, while the co-order graph gains little because
basket construction itself was untouched. `P(same dept)` within a basket stayed
near zero (0.034 -> 0.024) and `P(same team)` stayed at exactly 1.0, so the task
is unchanged; only the anchor distribution moved.

**Similarity absolute was predicted correctly** (4.5% -> 7.8%, inside the
predicted 6-12%) and for the stated reason - sessions are now homogeneous on two
metadata axes rather than one, and the embedding encodes both. But the lift still
fell, 4.09x -> 3.63x, because the popularity baseline also nearly doubled
(1.1% -> 2.1%). The caveat written before the run stands and should be repeated
next to the number on screen: **a good part of this gain is the encoder
re-reading structure the simulator was just made more blatant about, not the
encoder getting better.**

### What this says about the exercise

Writing the predictions down first was the part that paid. Without them the
department result would have been reported as a 1.12x -> 1.50x improvement and
read as the model getting better, when the model was never touched and what
actually happened is that a nearly unlearnable target became learnable. The
prediction being wrong is what forced the diagnostic that found the real story -
and, before that, the one that found the indifferent-shopper bug.
