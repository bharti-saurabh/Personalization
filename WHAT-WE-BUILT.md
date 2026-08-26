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

### The intelligence panel (always on the right)

A running account of the session, not a static readout. For every decision it shows:
which models ran, what went in, what the posterior was, which rule fired, what got put
on screen, and what changed since the last event. Two tabs — **Session Story** (the
narrative) and **Pipeline** (the trace).

### The deep dives (7 screens)

| Screen | What it holds |
| --- | --- |
| **ON vs OFF Comparison** | The same storefront side by side, personalization on and off |
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

## 7. Offline results

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

## 8. How it is built

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

## 9. Who this is for

| Audience | What to show them |
| --- | --- |
| **Client leadership** | The storefront with the ON/OFF switch, the shopper-scenario pills, and the ON vs OFF Comparison screen. Five minutes, no jargon. |
| **Client data science / engineering** | Model Intelligence, the Recommendation Lab, Model Evidence, and System Architecture. Invite them to try to break the Lab. |
| **Internal (Straive)** | A reusable capability asset. The `sim/` and `ml/` layers are client-agnostic; the taxonomy is one file. |

The client name is fictional throughout — ProSports — and the engines are named for what
they do (Intent, Similarity, Complement) rather than for any product.

---

## 10. What it deliberately does not do

- **No ROI calculator.** There was one; it was deleted. It was the only screen with no
  model behind it, and a made-up revenue figure next to nine screens of real arithmetic
  devalues all nine.
- **No claimed accuracy.** Every figure on screen is labelled as simulated.
- **No hidden filtering.** Where a rule removes candidates, the count that changes is
  shown, with the reason.
- **No stock imagery, no external fonts-as-images, no API keys.** Unplug the network and
  it still runs.

---

## 11. Where it goes next

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
