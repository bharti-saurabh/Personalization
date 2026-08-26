# What We Built

**ProSports Commerce Personalization Intelligence** — a working prototype of an
e-commerce personalization platform for a sports-merchandise retailer.

Live: <https://bharti-saurabh.github.io/Personalization/>
Source: <https://github.com/bharti-saurabh/Personalization>

This document is the walkthrough. `README.md` is the engineering reference — how to run
it, what each module does, how the evaluation harness works. Read this one first.

---

## 1. The honest claim

Most personalization demos are a slide deck with a picture of a funnel, or a storefront
with hard-coded "recommended for you" tiles. This is neither.

**There are no trained models and no real shoppers here.** What exists instead is a
simulated data-generating process — a synthetic catalog, a synthetic population, a
synthetic behaviour model — and *genuine algorithms* running live over it, in the
browser, per interaction.

That distinction cuts both ways, and the demo says so on every screen that shows a
number:

| What is real | What is not |
| --- | --- |
| Recency-weighted log-odds with Bayesian pseudo-counts | Any trained model weights |
| Cosine k-NN over a 73-dimensional hybrid embedding | Any real shopper, order or click |
| A directional co-order graph with empirical-Bayes shrinkage | Production accuracy figures |
| Confidence gating, inventory checks, diversity rules | A forecast of revenue lift |

The offline evaluation measures how well each engine **recovers a process we wrote
ourselves**. Treat it as an upper bound and as evidence the pipeline is wired correctly.
It is not a forecast of performance on real retail data, and the app never claims it is.

Why build it this way? Because models are only as good as the dataset underneath them.
Without the client's data there is no honest way to show accuracy — but there *is* an
honest way to show the art of the possible: build the whole machine, simulate the world
it runs in, and let the client see every decision it makes and why.

---

## 2. What is on screen

Nine screens, reachable from one collapsible left rail.

### The storefront (4 pages)

The shopping experience a customer would actually see. It is the default view and takes
70% of the stage.

| Page | What it demonstrates |
| --- | --- |
| **Home** | Personalized hero bound to the predicted club, a predicted-teams widget ordered by posterior probability, a department strip ordered by department intent, and a "Picked for you" carousel ranked by the intent model and filtered to what is in stock |
| **Catalog** | A faceted listing page whose **filter order re-sequences as you shop** — see §4 |
| **Product** | Similarity ("You may also like") and complement ("Complete the look") rails, each with the engine that produced them named and the score explained in words |
| **Cart** | "Fans Also Add" cross-sell driven by the complement engine, with basket value attributed to recommendations rather than an asserted lift |

A **Personalization ON/OFF** switch in the app bar is not cosmetic — with it off, the
storefront genuinely falls back to popularity ordering and generic merchandising, so the
difference is a real A/B rather than a re-labelled rail.

Five **shopper scenarios** can be swapped at any moment: Returning Eagles Fan,
Multi-Team Sports Shopper, Anonymous First-Time Visitor, Hot-Market Event Shopper, and a
Low-Confidence Customer who deliberately *fails* the confidence gate — because a demo
that only shows the happy path is not showing the system.

A **Market deck** sits on the same control strip: seven buttons that fire a real market
event into the simulated world — a trade, an injury, a championship, a kit launch. Pressing
one rebuilds the catalog, the population and the co-order graphs, re-ranks every open
surface, and writes an entry into the decision stream. See §7.

### The intelligence panel (always on the right)

A running account of the session, not a static readout. For every decision it shows:
which models ran, what went in, what the posterior was, which rule fired, what got put
on screen, and what changed since the last event. Three tabs — **Profile** (what the
system currently believes about this shopper, every field with its confidence, source and
decay constant), **Decisions** (the delta stream: triggering event, models that ran, fields
written, surfaces re-ranked, expandable to the full feature vector), and **Experience**
(the per-session effort ledger, §8.3). Every Decisions entry reads mechanism, then consequence, then number —
no entry ends on a posterior.

### The deep dives (7 screens)

| Screen | What it holds |
| --- | --- |
| **Twin Store Race** | Two grids, same shopper, same seed, same target — stepped side by side (§8.1) |
| **Customer Journey** | The session as a timeline: every event, every re-scoring, every shift in the posterior |
| **Model Intelligence** | The three engines opened up — features, weights, decay constants, thresholds |
| **Model Evidence** | The offline evaluation results, labelled as recovery of the simulated process |
| **Recommendation Lab** | A live sandbox: change the anchor, the engine, the constraints and the confidence gate, and watch the candidate pipeline move |
| **System Architecture** | How this would be built for real — services, stores, latency budget, failure modes |
| **Straive Partnership** | What the delivery team owns |

---

## 3. The three engines

All three are in `src/ml/`. None of them has a React or DOM dependency, so they run from
the command line under `tsx` — which is how the evaluation harness works.

### Intent — *which club and which department is this shopper in the market for?*

Recency-weighted log-odds over the session's events, with Bayesian pseudo-counts so a
first-time visitor gets a sensible prior rather than a divide-by-zero.

Two decay constants, deliberately different: **team decay is fast** (λ 0.35) and
**department decay is slow** (λ 0.08). A shopper who looks at a Cowboys hat after five
Eagles jerseys has probably switched clubs; a shopper who looks at a hat after five
jerseys has probably not stopped wanting jerseys. The demo shows both constants on
screen, because that asymmetry *is* the modelling insight.

A softmax at temperature 0.62 turns the scores into a posterior. An evidence-sufficiency
term damps confidence when there is little to go on, and a **confidence threshold of
0.50** gates activation — below it, personalization does not fire and the panel says
why.

### Similarity — *what else is like this?*

Cosine k-NN over a 73-dimensional hybrid embedding assembled from ten blocks:

| Block | Dims | Weight | | Block | Dims | Weight |
| --- | --- | --- | --- | --- | --- | --- |
| team | 6 | 1.00 | | price band | 3 | 0.35 |
| league | 3 | 0.30 | | brand/style | 8 | 0.35 |
| department | 8 | 0.90 | | title text | 16 | 0.50 |
| player | 6 | 0.80 | | image colour | 6 | 0.30 |
| gender/age | 7 | 0.25 | | co-view behaviour | 10 | 0.60 |

Each block is L2-normalised on its own and then scaled by its weight, so the cosine
between two products **decomposes exactly** into a weighted sum of per-block agreements.
That is what lets the UI show a real score breakdown instead of an invented one: when
the app says "recommended because it shares the same club and player", those two bars
are the arithmetic, not a caption.

A style-diversity rule caps how many near-identical colourways of one item can come
back, because four shades of the same cap is not a recommendation set.

### Complement — *what gets bought with this?*

Complements, not substitutes: a directional conditional probability estimated off the
simulated order graph.

```
P(b | a) = co-order(a, b) / occurrences(a)
lift     = P(b | a) / P(b)
```

Directionality is never asserted in the code — it falls out of the arithmetic. The joint
count is symmetric but the denominators are not, so P(hat | jersey) and P(jersey | hat)
differ whenever hats and jerseys sell at different rates. That is exactly the asymmetry a
real complement model finds.

Item-to-item co-order data is sparse, so the estimate shrinks toward the department-level
rate in proportion to how much support actually exists — empirical-Bayes smoothing with
α = 2.0:

```
λ        = support / (support + α)
P(b | a) = λ · P_item(b|a) + (1 − λ) · P_dept(b|a) · share(b)
```

With no observations the estimate *is* the department prior; as support accumulates it
slides continuously onto item-level evidence. No cliff, no discarded evidence, and a pair
with real co-order history always outranks an otherwise identical pair without any. The
UI reports which term dominated (`item` / `department` / `prior`) rather than pretending
there was only ever one.

Team consistency is a hard business rule, not a score — a Cowboys hat does not complete
an Eagles jersey. Price compatibility is a soft one: a $400 signed jersey is a poor add-on
to a $30 cap.

---

## 4. The catalog page re-sequences its own filters

This is the piece worth demoing slowly.

A conventional faceted listing has a fixed filter order — Department, Gender, Player,
Size, Price — and it never changes. That order is wrong twice over: it ignores what the
model knows about the shopper before they have clicked anything, and it ignores where in
the funnel they have got to after they have.

The rail here splits into two bands. **Answered facets rise to the top** in funnel order,
so what you have already decided reads as a summary. **Everything else is ranked** by:

```
score = informationGain(facet) × ( (1 − t)·intentRank + t·funnelRank )
where  t = min(1, answeredCount / 3)
```

- With **nothing selected**, `t = 0` and the order is purely the intent model's opinion.
  The badge on the top facet reads `ML RANKED`, because that is what it is.
- By the **third selection**, `t = 1` and the order is purely the shopping funnel from
  wherever the shopper has got to. The badge reads `NEXT BEST`, because the model has
  nothing useful left to say and claiming otherwise would be a lie.
- **Normalised Shannon entropy multiplies through**, so a facet with nothing left to
  split — Size once you have filtered to Hats, Team once you have picked one club —
  sinks on its own. No hide rules, no special cases.

Observed behaviour, Dallas Cowboys:

| Cowboys | + Jerseys | + Men |
| --- | --- | --- |
| Size `ML RANKED` | Size `ML RANKED` | **Size `NEXT BEST`** |
| Player `ML RANKED` | Player `ML RANKED` | Player |
| Category | Gender | Price |
| Price | Price | |

Pick Jerseys and Men, and the next filter offered is **Size**, not Player. The banner
above the rail changes text to say which of the two orderings is currently running.

---

## 5. The Recommendation Lab

A sandbox for the technical audience — the screen where a client data scientist can try
to break it.

Five controls: anchor product, engine, business constraints (same club / in stock),
confidence gate, and how many results to return. Every one is wired into a single
pipeline, and every stage counts the same candidates:

```
Catalog 797  →  After constraints 101  →  Above the gate 12  →  Returned 4
```

Underneath, the items the gate rejected are listed with their scores, so raising the
threshold does something visible rather than just shortening a list. Push it high enough
and the result set empties — and the screen says that suppression is a real production
outcome, not an error: this is where a rail gets hidden instead of filled with weak
matches.

The engines' own internal stock and diversity filters are switched **off** in this
screen, deliberately. They already ran in the storefront; here they would silently drop
candidates between two counters sitting a hand apart, which is precisely the unexplained
arithmetic this screen exists to eliminate.

Beside the engine output sits a **popularity baseline** — top sellers, ignoring the
anchor entirely. With an Eagles jersey as the anchor, the baseline returns Chiefs
merchandise and the engine returns Eagles caps, beanies and fleece. The contrast is the
argument.

---

## 6. The simulated world

`src/sim/` — deterministic, seeded, no React, no DOM.

| | |
| --- | --- |
| Catalog | **798 products** across 6 clubs (Eagles 138, Cowboys 151, Chiefs 142, Lakers 149, 76ers 112, Phillies 106) and 8 departments (Jerseys 191, Hats 136, T-shirts 128, Hoodies 112, Collectibles 80, Accessories 80, Kids 48, Home & Office 23) |
| Population | **14,000 synthetic shoppers** with club affinities, price sensitivity and category preferences |
| Behaviour | **36,879 sessions**, **222,426 view events**, **6,243 orders**, mean basket size 1.60 |
| Build time | ~2.7s, in the browser, on load |

### The choice model

Shoppers no longer sample what they look at from a weighted pool. The store **surfaces a
ranked grid and the shopper walks it**, and every step is a calibrated probability:

| Quantity | Form |
| --- | --- |
| `examinationProbability(position)` | `(1/(r+1))^γ`, with a fold multiplier past rank 12 |
| `relevanceProbability(affinity)` | `σ(β₀ + β₁·ln a)` |
| `clickProbability` | examination × relevance |
| `scrollPastProbability` | examination × (1 − relevance) |
| `addProbability` | `σ(α₀ + α₁·ln a)` — P(add \| click) |
| `abandonProbability` | rises with consecutive misses and fatigue, falls with clicks and adds |
| `orderProbability` | reads mean cart affinity and basket value against price sensitivity |

Three intercepts are **fitted** by deterministic bisection against explicit volume
targets; the slopes and the examination curve are **assumed**, and the distinction is
carried in the type system (`ChoiceShape` vs `ChoiceModel`) rather than in a comment.
Fitting a discrimination slope needs observed clicks of known relevance, which a synthetic
world does not have, so claiming those were fitted would be the dishonest part.

The intercepts are fitted to reproduce the volumes the flat constants they replaced already
produced — depth 6.62, add rate 0.14, conversion 0.55. That is the experimental design:
holding volume fixed means any movement in the metrics is attributable to *composition*
rather than to the population generating more or fewer events.

**Why this matters more than it sounds.** Before it, a paired A/B over this simulator would
have measured exactly zero, because the shopper found what they wanted regardless of what
the store showed them. `measureSurfacePolicy` runs two arms over the same seed — identical
shoppers, different grid order:

| arm | depth | add rate | conv\|cart | selectivity | abandon | adds/session |
| --- | --- | --- | --- | --- | --- | --- |
| organic (popularity) | 6.55 | 0.142 | 0.545 | 0.346 | 0.462 | 0.93 |
| oracle (latent truth) | 10.69 | 0.200 | 0.541 | 0.382 | 0.268 | **2.14** |
| adversarial (reversed) | 0.10 | 0.050 | 0.436 | 0.003 | 0.995 | 0.01 |

An oracle ranker more than doubles cart adds and cuts abandonment 42%. Note what does
*not* move: conversion **given** a cart is flat across arms. Better ranking does not make a
cart convert — it makes a cart happen. Any ROI story built on this simulator should
attribute to add rate and abandonment, not to checkout.

`sim:eval` also reports **selectivity**, the share of clicks landing in the top affinity
quartile of the grid actually shown, where about 0.25 is a shopper indifferent to what
they are shown. It is there because the first version of the choice model scored **0.27** —
it was calibrated into the flat top of the sigmoid and clicked almost anything it examined —
and nothing else in the output revealed it. It now reads 0.34, and the remaining gap to the
oracle's 0.38 is reported as headroom rather than tuned away.

Every product image is **drawn procedurally as SVG** from the taxonomy's team colours —
jerseys, caps, beanies, helmets, crests, league badges. Nothing is fetched. The demo has
no external asset dependency and works with the network unplugged.

---

## 7. The world has a clock

Until now the simulated world was a still photograph. It had a date baked into it —
September, mid-NFL-season — but that date was a frozen constant in the taxonomy, and
nothing could move it. `src/sim/clock.ts` makes time an **injectable parameter** instead,
and then uses that to let the demo do the thing sports commerce actually has to survive:
**the market changes under you, mid-session.**

### A clock, and what hangs off it

```ts
interface SimClock { month: number; year: number; events: readonly MarketEvent[] }
```

Three things, all frozen. `SIM_MONTH` and `LEAGUE_SEASONALITY` moved out of
`taxonomy.ts` — taxonomy is the register of what the world is made *of*, not what time
it is. Every function that used to read those constants now takes a trailing
`clock: SimClock = activeClock()` parameter, so **the ambient clock is a default, never a
dependency**. An evaluation arm that passes its own clock shares nothing with the app.

The calendar drives a per-league seasonality curve — NFL peaks in September while the NBA
is still in preseason and MLB is in its pennant race — and a `phaseOf()` reading that is
relative to each league's *own* curve, because merchandising decisions are made per league.

### Seven market events

Each has a defined effect on **both** the catalog and the population, decaying
exponentially toward neutral on its own half-life:

| Event | Player | Club | Departments | Half-life |
| --- | --- | --- | --- | --- |
| `TRADE` | ×2.4 | ×1.3 new, ×0.9 old | Jerseys ×1.55, T-shirts ×1.15 | 2 mo |
| `INJURY` | ×0.5 | ×0.93 | — | weeks out ÷ 4.3 |
| `PLAYOFF_WIN` | — | ×1.4 | Hats ×1.5, T-shirts ×1.35, Jerseys ×1.15 | 1.5 mo |
| `CHAMPIONSHIP` | — | ×1.95 | Hats ×1.8, T-shirts ×1.6, Collectibles ×1.5 | 6 mo |
| `NEW_SIGNING` | ×1 + 1.6·draw | ×1.2 | Jerseys ×1.4 | 3 mo |
| `RETIREMENT` | ×1.7 | ×1.05 | Collectibles ×1.6, Jerseys ×1.2 | 2 mo |
| `KIT_LAUNCH` | — | ×1.25 | Jerseys ×1.6 | 4 mo |

Firing one moves the clock, drops the `getDataset()` memo, bumps the world version — which
`getModels()` already keys off — and notifies the React tree. That is the invalidation path
built in the previous PR, used for the first time by something that actually needs it.

### The trade, measured

`TRADE` is built properly rather than sketched. One keystroke on the Market deck, and —
these are measured figures, not asserted ones; run `npm run sim:market` to reproduce them:

**The player moves.** 12 products are rewritten in place — club, league, title, colourway,
shirt number — while **keeping their product ids**, so a shopper holding the traded jersey
in their cart still holds a product the catalog contains. That constraint is why the event
is a post-generation rewrite rather than the cleaner roster-fold-then-generate design.

**Jersey demand transfers with him.**

| | Before | After | |
| --- | --- | --- | --- |
| Jalen Hurts orders | 187 | 228 | **+22%** |
| …booked under Eagles | 187 | **0** | |
| …booked under Cowboys | **0** | 228 | |
| Cowboys jersey orders | 382 | 653 | **+71%** |
| Eagles jersey orders | 415 | 368 | −11% |

**The population moves too, not just the shelf.** Session focus shifts Cowboys
20.4% → 23.3% and Eagles 20.9% → 19.8%. This is the half of the effect that is easy to
skip: `teamDemand` enters the shopper's focus draw, so the event changes *who shops for
what*, not merely how things are labelled.

**Co-order priors recompute.** For the sample moved jersey, the co-order mass flips from
100% Eagles neighbours to 100% Cowboys neighbours. The graph is rebuilt from re-simulated
behaviour, so this is a genuine recomputation and not a relabelling.

**Everything else re-ranks.** 289 products carry a `marketFlag` (163 lifted, 126 damped),
open surfaces re-rank, the PDP and cart re-bind to the fresh objects, and a market entry
lands in the decision stream — marked *not shopper-caused*, since it is the one entry in
that stream that no shopper action produced. Cost: ~5.9s for a full world rebuild.

### One thing the probe caught

The first version applied lifts as `min(100, popularity × lift)`. Measuring it showed a
trade collapsing **all 163 Dallas products to exactly 100** — one distinct popularity value
across the whole club. The assortment the event had just made interesting became the one
with no internal ranking signal at all.

Upward lifts now compress the **headroom** instead: a product at 87 with a 2× lift closes
half its gap to 93.5, one at 95 closes to 97.5. Strictly order-preserving, never reaches
the ceiling, identical to the old form at lift = 1. Distinct values across the club went
1 → 17, and the demand transfer strengthened as a result (Cowboys jerseys +58% → +71%).
This is the argument for the probe existing at all — the bug was invisible on screen and
obvious in one column of numbers.

### Events cannot leak between simulation arms

Asserted as a runnable check, not a paragraph — `src/sim/clock.test.ts`, 9 tests. There
were three routes by which a fired event could contaminate a second arm, and each is closed
structurally rather than by discipline:

| Leak route | Closed by |
| --- | --- |
| Mutable catalog array shared between arms | `applyMarketEvents` clones every product it touches |
| Roster mutated in place by a trade | `rosterAt` folds into a fresh table; `TEAMS` is never written |
| Seasonality curve written through | `LEAGUE_SEASONALITY` frozen at both levels — the test asserts a `TypeError` |

The end-to-end test builds two complete worlds from two clocks and asserts they disagree
down to the co-order graph while `activeClock()` is untouched by either. `npm test` is
29/29 green; `npm run sim:eval` is byte-identical to before this work, because on a quiet
clock the demand multipliers are exactly 1 and the event pass returns its input untouched.

---

## 8. Effort, not money

Every claim in the previous seven sections is about accuracy. Accuracy is not the argument
a shopper cares about, and it is not the argument a room full of executives can check. So
there is one screen and one harness that measure something else entirely: **how much work
the shopper had to do**.

Nothing in this section produces a currency figure, an ROI number or a revenue lift. That
is a deliberate deletion, not an omission. The screen that now holds the twin store race
used to hold an illustrative funnel that ended on `Average Order Value $88 → $104`, and it
was removed rather than relocated. A made-up revenue figure sitting next to a page of real
arithmetic devalues the arithmetic — it is the number a client repeats to someone who will
check it, and it is the one number here nobody could.

### 8.1 The twin store race

**Deep Dive → Twin Store Race.** Two storefronts side by side. Left is ranked by the intent
engine. Right is ranked by sales volume, which is genuinely what this storefront serves with
personalization switched off. Same shopper, same seed, same 798-product catalog.

The shopper's true intent is stated in plain words before anything moves — *"wants a men's
Eagles jersey, size XL, under $170"* — and it is read off their **held-out purchase**, which
no engine on either side can see. Naming the target first is what makes the race legible: a
grid filling up means nothing until you already know what you are looking for.

A **Step** control advances both grids by one shopper action, driven by the choice model
from `src/sim/choice.ts`. At each slot the shopper examines or does not, clicks or scrolls
past, and eventually adds or abandons. Both arms walk the same **pre-drawn random numbers**,
so the shopper's luck is identical on both sides and the only variable in the whole race is
the ordering.

Live counters above each pane: steps taken, items seen before the first genuinely relevant
one, dead ends, scroll depth, and whether the target was reached and on which step. They are
derived from the trace rather than accumulated, so scrubbing back gives the same numbers as
stepping forward.

**The race is not rigged.** Five shoppers are on the strip, chosen to span the outcomes, and
two of them are races personalization loses:

| Shopper | Confidence | Personalized | Popularity | Reading |
|---|---|---|---|---|
| `cust-3859` | 78% | step 3 | step 20 | Confident and correct — the case it is built for |
| `cust-1474` | 84% | step 45 | **step 1** | **Upset.** Confident and wrong; the target was a bestseller |
| `cust-82` | 79% | never | **step 3** | **Upset.** The personalized grid never surfaces it at all |
| `cust-2260` | 28% | step 1 | step 39 | Below the gate, and the ranking was right anyway |
| `cust-10` | 22% | step 2 | never | Below the gate; only the personalized grid ever finds it |

The upset label is computed from the traces on screen, not written by hand, and the
population rate is on the record below: the control arm reaches the target first in about
5% of races. A race the personalized side always wins is a race nobody believes.

### 8.2 Population effort metrics

`npm run sim:effort`. Its own script, deliberately separate from `sim:eval` so the accuracy
harness does not get slower. Paired arms, same shoppers and same seeds in both, over 6,000
simulated shoppers of whom 3,040 have a held-out purchase to aim at. Bootstrap 95%
intervals, 2,000 iterations, resampled **over shoppers rather than sessions** because the
shopper is the pairing unit.

```
metric                                  person.  popular.     diff        95% interval      n
Steps to first relevant item                1.0       5.0     -4.0        -5.0 to -3.0    129  <-
Steps to target reached                     7.5       5.5     +2.0       -3.0 to +13.0     40   ~
Sessions reaching the target              13.6%      5.9%    +7.7%      +6.4% to +9.2%   3040  <-
Dead ends per session                      0.92      1.09    -0.17      -0.20 to -0.14   3040  <-
Items seen before first relevant            0.0       3.0     -3.0        -4.0 to -2.0    129  <-
Catalog surfaced across population        96.2%    100.0%    -3.8%      -4.9% to -3.8%   3040  !!

relevant seen at all: personalized 17.5%   popularity 18.6%   both 4.2%
impression concentration: personalized 36.1%   popularity 14.6%
gate: withheld 480/3040 (15.8%); correctly withheld 340 (11.2% of all, 70.8% of withheld)
upsets: control arm reached the target sooner in 5.3% of races
```

`<-` personalized ahead · `!!` **control ahead** · `~` not separated from zero.

**These are counts of shopper effort in a simulated world**, labelled exactly as the offline
accuracy metrics in §9 are labelled. They are not measurements of human beings.

Three rows need reading together rather than quoting alone, and the CLI says so on screen:

- **Steps to target (`~`)** conditions on *both* arms reaching, which selects the easy
  targets. n falls to 40, the interval is wide, and the control looks level — while
  reaching the target far less often, which is the row above it.
- **Catalog surfaced (`!!`)** goes against personalization and stays in the table. It is
  also a metric that saturates at population scale: union-of-everything-shown reaches 100%
  for any ranker given enough shoppers. **Impression concentration** is published beside it
  as the reading that carries the actual cost — personalization concentrates 36% of
  impressions on its top decile against popularity's 15%.
- **The confidence gate** row is a single-arm diagnostic, not a paired comparison. It
  withheld on 15.8% of sessions and was right to withhold on 70.8% of those.

### 8.3 The per-session effort ledger

**Intelligence panel → Experience.** The tab shipped empty and said so. It is instrumented
now, and every row in it was emitted by a storefront surface that actually made the decision
it describes:

| Surface | What it records |
|---|---|
| Home category rail | `Jerseys` — position 9 unpersonalized → position 2 personalized |
| Home team rail, picked-for-you rail | the same, against market size and against sales rank |
| PLP facet rail | where a facet sat, against where the funnel alone would have put it |
| PLP result grid | where the clicked product sat, against sales rank, counted in rows |
| PLP size facet | prefilled size L from the profile — one facet interaction avoided |
| PDP *Complete the look* | withheld 2 of 4 slots — the co-order graph had evidence for two |

Two design decisions are what make the ledger checkable rather than assertable.

**Rank moves are recorded on click, not on render.** On render the page only knows it
re-ordered a rail, so any saving it claimed would be a claim about its own prediction —
"we put what we predicted at the top" — which is true by construction and worth nothing. On
click it knows what the shopper actually came for, because they just took it.

**The session-end total is paired, not replayed.** The obvious way to answer *"what did
personalization save this session"* is to re-run the session with the switch off and diff
the two. We do not, and not because it is hard: a replayed session diverges at the first
click, and by step four the two sessions are not comparable. Instead every entry is paired
**at the moment of the decision** — both orderings computed from the same inputs in the same
render. Summed, those pairs *are* the session replayed unpersonalized, decision by decision,
with nothing to hand-wave over. The honest cost of that choice: it counts only decisions the
shopper actually reached, so a session that ended on the home page reports one decision, not
an extrapolated ten.

**Entries can go the other way.** When the model reads a shopper wrong it pushes their
target *down* the rail, and `rankMove` returns that as effort **incurred**, in the same
units, on the same ledger. A ledger that can only count savings is an advert.

What is real and what is not, stated on the tab itself: the **counts** are real; the
**conversion to seconds** is a simulated benchmark and stays marked as one, because a click
is countable and the seconds it costs a person are not something this demo has measured.

`src/ml/effort.test.ts` asserts the four properties the surfaces depend on: a decision that
moved nothing produces no row, a decision that went the wrong way produces a cost, positions
are counted as rows of scrolling rather than raw slots, and the un-personalized column is
exactly the sum of the paired diffs.

### 8.4 What building it caught

The first version of the harness had the control arm winning almost every row. That is a
signal to audit the setup, not a finding to publish, and three separate methodological bugs
came out of the audit — each now documented in-code at the site of the decision:

1. **The candidate pool was the focus club's assortment.** That models a shopper who has
   *already* navigated to their club's page, which hands the control arm the single hardest
   thing personalization has to guess. The pool is the whole catalog now.
2. **First-relevant required a click**, which collapsed n to 54 and turned a question about
   the grid into a question about the click model. It fires on examination now; the target
   still requires a click, and the asymmetry is documented.
3. **`seenBeforeFirstRelevant` fell back to total seen** when nothing relevant was found,
   silently mixing "seen before finding it" with "seen, never found it" — which made that
   row contradict the row above it. It is `number | null` now, and the denominators are
   published so the conditioning is visible.

---

## 9. Offline results

Run `npm run sim:eval`.

> ### ⚠️ Two generators. These numbers are not comparable to the previously published table.
>
> The harness code is unchanged. What the label it scores against **means** changed, when
> the simulator gained a choice model and a session-level department intent. Both task
> definitions are stated below and both tables are kept. The old one has **not** been
> quietly re-run and replaced.
>
> **Harness A (retired).** Each click sampled independently from the shopper's stable
> lifetime department affinity; a cart add was a uniform coin over what had been viewed.
> The held-out target was the department of an anchor drawn near-arbitrarily from the
> catalog's department mix. Predicting it meant *estimating a per-view multinomial* from
> many draws of that same multinomial. Measured: the held-out anchor matched the shopper's
> own modal department **18.3%** of the time.
>
> **Harness B (current).** A session draws one department intent at its start, the shopper
> walks a surfaced grid, and clicks and cart adds run through the choice model. The
> held-out target is the department of something the shopper actually *chose*. Predicting
> it means *forecasting the next session's mission*. Measured: **43.3%**.

### Harness B — current

| Metric | R@1 | R@3 | R@10 | NDCG@10 | n |
| --- | --- | --- | --- | --- | --- |
| Intent — team | 40.0% | 72.5% | 100.0% | 69.7% | 2000 |
| *popularity baseline* | *24.1%* | *68.0%* | *100.0%* | *62.0%* | *2000* |
| **lift** | **1.66×** | | | **1.12×** | |
| Intent — department | 27.7% | 64.4% | 100.0% | 62.5% | 2000 |
| *popularity baseline* | *18.5%* | *65.8%* | *100.0%* | *58.2%* | *2000* |
| **lift** | **1.50×** | | | **1.07×** | |
| Complement — next item in basket | 2.9% | 6.8% | 20.8% | 8.8% | 954 |
| *popular same-team baseline* | *2.7%* | *6.5%* | *18.8%* | *7.9%* | *954* |
| **lift** | **1.08×** | | | **1.11×** | |
| Similarity — held-out co-view | 7.8% | 20.7% | 50.5% | 8.2% | 1959 |
| *popularity baseline* | *2.1%* | *5.0%* | *14.0%* | *2.0%* | *1959* |
| **lift** | **3.63×** | | | **4.11×** | |

### Harness A — retired, kept as a historical record

Measured against a generator that no longer exists. Not re-run.

| Metric | R@1 | R@3 | R@10 | NDCG@10 | n |
| --- | --- | --- | --- | --- | --- |
| Intent — team | 41.1% | 70.2% | 100.0% | 69.7% | 2000 |
| *popularity baseline* | *21.3%* | *60.3%* | *100.0%* | *59.3%* | *2000* |
| **lift** | **1.93×** | | | **1.18×** | |
| Intent — department | 19.7% | 54.6% | 100.0% | 56.9% | 2000 |
| *popularity baseline* | *17.5%* | *57.9%* | *100.0%* | *56.0%* | *2000* |
| **lift** | **1.12×** | | | **1.02×** | |
| Complement — next item in basket | 2.9% | 8.0% | 21.9% | 9.4% | 904 |
| *popular same-team baseline* | *2.9%* | *6.3%* | *15.7%* | *6.9%* | *904* |
| **lift** | **1.00×** | | | **1.37×** | |
| Similarity — held-out co-view | 4.5% | 13.7% | 36.9% | 6.2% | 2000 |
| *popularity baseline* | *1.1%* | *3.2%* | *8.9%* | *1.4%* | *2000* |
| **lift** | **4.09×** | | | **4.43×** | |

### How to read the difference

Standard error on R@1 at n=2000 is about **1.1 points**, and the two tables come from
different random worlds, so the comparison is unpaired and the error on a difference is
larger again. **Movements under about 2 points are not resolvable.** The team result
(1.1 points) does not clear that bar; the department result (8 points) and the similarity
result (3.3 points) do.

**Department went from the weakest engine to the second-strongest without a single line of
the model changing.** Do not read that as the model improving. Harness A's department task
was close to unlearnable — the thing being predicted barely depended on the shopper — so a
popularity prior sat near the ceiling and there was nothing for personalisation to win.
That is a broken question producing a flattering-looking baseline, not a weak model.

**Complement is the honest negative result** and it is left standing. Its NDCG@10 lift fell
from 1.37× to 1.11×: the engine barely moved, its baseline improved. Affinity-driven cart
adds concentrate purchase anchors on more popular items — exactly what a popularity
baseline feeds on — while basket construction was untouched, so the co-order graph gained
little in exchange.

**Similarity's absolute gain deserves a caveat.** R@1 nearly doubled partly because sessions
are now homogeneous on *both* team and department, and the embedding encodes exactly those
two axes. Part of that is the encoder re-reading structure the simulator made more obvious,
not the encoder getting better. Its lift fell anyway, 4.09× to 3.63×, because the
popularity baseline also nearly doubled.

Every engine is measured against a popularity baseline, because "better than showing the
best sellers" is the only bar that matters.

**Again: this is recovery of a data-generating process we wrote. It is not production
accuracy.**

---

## 10. How it is built

React 19 + TypeScript (strict) + Tailwind CSS 4 + Vite 6. ~11,300 lines. No backend, no
API key, no network call at runtime.

```
src/
  sim/           The simulated world: taxonomy, catalog generator, population
                 and behaviour model, seeded RNG. Deterministic.
  ml/            The engines: intent, similarity, complement, shared embeddings,
                 the session journal, and the offline evaluation harness.
  components/
    storefront/    The shopping experience
    intelligence/  Explanation, evidence, architecture and partnership screens
    brand/         Straive lockup and mark; team crests, league badges and
                   department glyphs, all drawn rather than fetched
    common/        Chrome: app bar, storefront header and nav, demo strip,
                   and the collapsible deep-dive rail
  context/       Single app store; engine calls are memoised on their inputs.
```

`src/sim` and `src/ml` have **no React and no DOM dependency**. That is not tidiness for
its own sake — it is what makes the evaluation harness possible and what would make these
modules liftable into a real service.

Recharts is lazy-loaded, so the storefront's first paint does not carry half the bundle.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run lint` | `tsc --noEmit` |
| `npm run sim:inspect` | Print catalog and simulation statistics |
| `npm run sim:eval` | Run the offline evaluation harness |
| `npm run build:single` | Single-file build, for handing the demo off on a USB stick |

### Design system

Two palettes, used as an information-design device rather than decoration:

- **Straive orange `#FF5800`** — every surface the delivery team owns: the app bar, the
  intelligence panel, the deep dives, the left rail.
- **ProSports red** — the fictional storefront.

At any moment it is visually obvious whether you are looking at the client's shop or at
our instrumentation of it.

---

## 11. Who this is for

| Audience | What to show them |
| --- | --- |
| **Client leadership** | The storefront with the ON/OFF switch, the shopper-scenario pills, and and the Twin Store Race. Five minutes, no jargon, no ROI slide. |
| **Client data science / engineering** | Model Intelligence, the Recommendation Lab, Model Evidence, and System Architecture. Invite them to try to break the Lab. |
| **Internal (Straive)** | A reusable capability asset. The `sim/` and `ml/` layers are client-agnostic; the taxonomy is one file. |

The client name is fictional throughout — ProSports — and the engines are named for what
they do (Intent, Similarity, Complement) rather than for any product.

---

## 12. What it deliberately does not do

- **No ROI calculator.** There was one; it was deleted. It was the only screen with no
  model behind it, and a made-up revenue figure next to nine screens of real arithmetic
  devalues all nine.
- **No claimed accuracy.** Every figure on screen is labelled as simulated.
- **No hidden filtering.** Where a rule removes candidates, the count that changes is
  shown, with the reason.
- **No stock imagery, no external fonts-as-images, no API keys.** Unplug the network and
  it still runs.

---

## 13. Where it goes next

The prototype is complete as a prototype. Turning it into a system means, in rough order:

1. **Replace the simulator with a data contract** — the catalog, event stream and order
   history the engines already expect. `src/sim` is the spec.
2. **Lift `src/ml` into a service.** It has no browser dependency today, which is the
   whole point.
3. **Train, and re-run the same harness.** The evaluation code does not change; only the
   dataset underneath it does. That is the moment the numbers stop being recovery figures
   and start being accuracy.
4. **Instrument for online measurement** — the confidence gate and the decision trace are
   already the natural place to log from.
5. **Extend the taxonomy.** Six clubs and eight departments is a demo; the generator is
   parameterised.

---

*Prototype. Synthetic data, simulated models. Not production accuracy.*
