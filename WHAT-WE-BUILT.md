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
| A pure profile fold with per-field decay and cross-field propagation | Any real profile, address or consent record |
| Six lifecycle send gates, a hashed holdout arm and per-channel quiet hours | Any message actually sent |

The offline evaluation measures how well each engine **recovers a process we wrote
ourselves**. Treat it as an upper bound and as evidence the pipeline is wired correctly.
It is not a forecast of performance on real retail data, and the app never claims it is.

Why build it this way? Because models are only as good as the dataset underneath them.
Without the client's data there is no honest way to show accuracy — but there *is* an
honest way to show the art of the possible: build the whole machine, simulate the world
it runs in, and let the client see every decision it makes and why.

---

## 2. What is on screen

Eleven destinations, reachable from one collapsible left rail: the storefront, and ten
screens behind it.

### The storefront (4 pages)

The shopping experience a customer would actually see. It is the default view and takes
70% of the stage.

| Page | What it demonstrates |
| --- | --- |
| **Search** | A box that maps free text onto taxonomy nodes, completes it ranked by profile, and never returns an empty page — see §4.1–4.3 |
| **Home** | Personalized hero bound to the predicted club, a predicted-teams widget ordered by posterior probability, a department strip ordered by department intent, and a "Picked for you" carousel ranked by the intent model and filtered to what is in stock |
| **Catalog** | The search results page *and* the browse page. Query understanding, zero-result rescue, a filter rail whose **order re-sequences as you shop**, and a default sort that is an explicit model output — see §4 |
| **Product** | A **predicted, prefilled size** with its confidence and its reasons; **out-of-stock substitution** shown as its own ranking decision against its own objective; **merchandising badges that carry the population statistic behind them** on hover; and similarity ("You may also like") and complement ("Complete the look") rails, each naming the engine that produced it, explaining the score in words, and stating what was **withheld** and under which rule — see §5 and §10 |
| **Cart** | "Fans Also Add" cross-sell driven by the complement engine, with basket value attributed to recommendations rather than an asserted lift — and a **substituted line counted separately**, as revenue kept rather than revenue created. Checkout writes ownership, so the gate stops offering what was just bought |

A **Personalization ON/OFF** switch in the app bar is not cosmetic — with it off, the
storefront genuinely falls back to popularity ordering and generic merchandising, so the
difference is a real A/B rather than a re-labelled rail.

Five **shopper scenarios** can be swapped at any moment: Returning Eagles Fan,
Multi-Team Sports Shopper, Anonymous First-Time Visitor, Hot-Market Event Shopper, and a
Low-Confidence Customer who deliberately *fails* the confidence gate — because a demo
that only shows the happy path is not showing the system.

An **identity ladder** sits on the same strip — five rungs, switchable mid-session, from
anonymous through to authenticated member. It is the most important control in the demo,
because the question it answers is the one the room is really asking. Promotion re-folds
the whole session rather than patching the profile. See §3.

A **Market deck** sits on the same control strip: seven buttons that fire a real market
event into the simulated world — a trade, an injury, a championship, a kit launch. Pressing
one rebuilds the catalog, the population and the co-order graphs, re-ranks every open
surface, and writes an entry into the decision stream. See §9.

### The intelligence panel (always on the right)

A running account of the session, not a static readout. For every decision it shows:
which models ran, what went in, what the posterior was, which rule fired, what got put
on screen, and what changed since the last event. Three tabs — **Profile** (what the
system currently believes about this shopper, every field with its confidence, source and
decay constant), **Decisions** (the delta stream: triggering event, models that ran, fields
written, surfaces re-ranked, expandable to the full feature vector), and **Experience**
(the per-session effort ledger, §12.3). Every Decisions entry reads mechanism, then consequence, then number —
no entry ends on a posterior.

### The deep dives (10 screens)

| Screen | What it holds |
| --- | --- |
| **Twin Store Race** | Two grids, same shopper, same seed, same held-out target — stepped side by side (§12.1) |
| **Customer Journey** | The session as a timeline: every event, every re-scoring, every shift in the posterior |
| **Lifecycle Triggers** | Which email or SMS would fire from this session, every gate it passed and the rule that stopped the rest (§11) |
| **Model Intelligence** | The engines opened up — features, weights, decay constants, thresholds |
| **Model Evidence** | The offline evaluation results, labelled as recovery of the simulated process, with both harness definitions side by side (§14) |
| **Inference Pipeline** | One prediction walked end to end through all seven stages |
| **Recommendation Lab** | A live sandbox: change the anchor, the engine, the constraints and the confidence gate, and watch the candidate pipeline move (§7) |
| **Model Registry** | All eleven models: version, inputs, the profile field each writes, decay, activation bar, live offline metric, and when it last fired this session. Rows expand to the live feature vector (§13) |
| **System Architecture** | How this would be built for real — services, stores, latency budget, failure modes |
| **Straive Partnership** | What the delivery team owns |

---

## 3. The visitor profile, and the identity ladder

Everything downstream reads one object. It is built by a **pure fold** — events in,
profile out — and never patched in place.

### 3.1 Five rungs, and the demo can move between them mid-session

The question a room actually asks is *"what could you do for someone who has not told you
who they are?"* The identity control in the demo strip answers it by making the rung a
variable rather than an assumption:

| Rung | Basis | What it adds |
| --- | --- | --- |
| **Anonymous** | Nothing | Nothing. Popularity ordering and generic merchandising |
| **Contextual** | The arriving request — time, region, referrer | Enough to re-merchandise the front page without knowing anyone |
| **Returning** | A first-party cookie | Prior sessions, decayed |
| **Identified** | An address captured with consent | Order history, CRM facts, an email channel |
| **Member** | Authentication | Loyalty tier, a verified mobile number |

**Promotion re-folds rather than patches.** The session's clicks are replayed against the
richer seed, so behaviour that contradicts a newly-arrived CRM fact stays visible as a
contested distribution instead of being silently overwritten.

The consequence is worth stating because it looks like a bug for a second: **signing in
can make a field *less* certain.** The CRM says one thing and this session says another,
and the profile shows the argument rather than picking a winner. Patching would have hidden
that, which is exactly why it does not patch.

### 3.2 Every field carries its own confidence, source and decay constant

A profile field is not a value. It is a value, an evidence count, a source, a timestamp
and a decay constant — and the panel renders all five.

The decay constants are per field, and each one is an opinion the code states so it can be
argued with:

| Field | λ | Why |
| --- | --- | --- |
| League | 0.03 | Someone who follows the NFL follows it next year |
| Team | 0.35 | Volatile — swings with the fixture list, a result, a campaign email |
| Player | 0.45 | Faster than team. Players are traded, injured and retired; allegiance is not |
| Department | 0.08 | Slow. A jersey buyer stays a jersey buyer across visits |
| Gender / age band | 0.02 | Near-static. Who a shopper buys for changes on a timescale of years |
| Price sensitivity | 0.1 | Budget moves with circumstance, but not with a click |
| Gift intent | 0.2 | Fast, deliberately — gifting is an episode, not a trait |

Durable evidence — completed orders, CRM facts — is held in a **separate channel** from
session clicks. Folding the two together was the obvious first implementation and it is
wrong: order history would then fade at the click rate, so a shopper with ten years of
purchases behind them would have all of it discounted to nothing by twelve minutes of
browsing. **A purchase does not become less true because the shopper clicked again.**

### 3.3 Cross-field propagation, and a delta log

A click on a kids' Eagles jersey is not one observation. It is evidence about club, about
department, about age band and about gift intent, and the fold writes all four — each with
its own contribution weight and each appearing in the delta stream with a plain-language
cause.

Every field write since the profile was created is kept as a **delta**: the dotted path,
the value before, the value after, the event that caused it, the evidence weight it added,
and the confidence afterwards. The Profile tab renders those deltas rather than diffing two
snapshots, so what appears on screen is what actually happened rather than a reconstruction
of it.

---

## 4. The main demo path: search → catalog → product

This is the section to demo slowly. It is one continuous path, and each step is a
different kind of personalization: **understanding** what was asked, **ordering** what
came back, and **choosing what to ask next**.

### 4.1 The search box maps free text onto the taxonomy

A storefront search bar is usually a substring match over product names. This one was
too, and it failed the way they all fail: type *something for my son* and you get an
empty page, because no product is called that.

`src/ml/query.ts` runs four stages over the raw string — **interpret, propagate,
retrieve, rank** — and publishes every one of them to the screen.

| Typed | Interpreted as |
| --- | --- |
| `hurts jersey` | player **Jalen Hurts** 82% (surname), department **Jerseys** 95% (synonym), team **Eagles** 49% *(inferred)*, league **NFL** 25% *(inferred)* |
| `something for my son` | department **Kids** 85% (phrase), **gift intent** 85% |
| `philadelphia hoodie` | teams **Eagles / 76ers / Phillies**, all at 45% — a city that names three clubs is ambiguous, and the interpreter says so instead of guessing |
| `eagles cap under $40` | team **Eagles**, department **Hats**, price ceiling **$40** |
| `xyzzy plugh` | nothing — and that is the interesting case, see 3.3 |

Two properties are worth pointing at:

- **Inferred nodes are drawn differently from typed ones.** A player implies their club
  implies their league, damped at each step (×0.6, then ×0.5). Those inferences steer the
  ranking, but the chip that shows them says `inferred`, because rendering them like
  something the shopper typed would be a quiet fabrication. The same damping constants
  are the ones the visitor profile uses for cross-field propagation — one rule, one place.
- **Ambiguity survives to the ranking.** *Philadelphia* emits all three clubs at a
  reduced confidence rather than resolving to the biggest one. The rescue ladder below
  then drops the least-certain constraint first, which is only meaningful if confidence
  was recorded honestly in the first place.

**Gift intent is personalization deciding to switch itself off.** *For my son* emits two
separate nodes — the Kids department, and a gift trait — and the gift trait removes the
shopper's own player affinity from the ranking and suppresses the saved-size prefill on
the catalog page. Personalizing a present toward the person buying it is the single
fastest way to make a system feel like it is watching rather than helping.

What it deliberately does **not** do: spell correction, embeddings, learned synonyms.
None of those can be demonstrated honestly against a synthetic catalog with no query
logs, and a demo that fakes them is worse than one that says so.

### 4.2 Autocomplete ranked by profile

The dropdown has two bands — **scopes** (searches to run) and **products** — and each is
ordered by the visitor profile. Beside every scope row that moved sits the position it
would have held without the profile:

```
Jerseys · Eagles      2 → 1
Jerseys · Cowboys     1 → 2
Jerseys               3 → 3
```

Both orders are computed in the same pass over the same pool, one with the profile and
one without, so `2 → 1` is a **count of rows the shopper did not read past**, not an
estimate. With personalization off, the un-personalized band is not empty and not
arbitrary: it falls back to the busiest clubs by market size and the widest departments
by assortment weight — a genuine merchandised default.

Above the rows, a chip strip shows the interpretation updating **as the sentence is still
being typed**. That is the demo moment.

### 4.3 Zero-result rescue

A zero-result page is the most expensive screen in retail. This build does not have one.

Type `hurts beanie` — a real player and a real product type that never co-occur in the
catalog. Exact matches: **0**. What happens next is a ladder, and every rung is on screen:

| Dropped | Why | Results after |
| --- | --- | --- |
| league NFL (25%) | least certain of the remaining constraints | 0 |
| team Eagles (49%) | least certain of the remaining constraints | 0 |
| subdepartment Beanie (70%) | least certain of the remaining constraints | 0 |
| player Jalen Hurts (82%) | least certain of the remaining constraints | **136** |

Constraints come off **least-certain-first**, which is the only ordering that can be
defended, and nothing that comes off is forgotten: a dropped constraint is **degraded
into a ranking credit**, worth `0.4 × its confidence`. So the page that comes back is not
an arbitrary list of beanies — it is beanies with Eagles and Hurts-adjacent stock at the
top.

When *nothing* in the query maps onto the catalog at all (`xyzzy plugh`), the fallback is
the whole catalog ranked by profile affinity, with the page saying plainly that the query
matched nothing. An empty page tells the shopper to leave. A profile-ranked page tells
them the site still knows who they are.

The rescue is also the one search event that writes to the effort ledger, as a `dead_end`
avoided — and only when personalization is on, because that is the only condition under
which the un-personalized store would genuinely have shown the empty page.

### 4.4 The catalog page re-sequences its own filters

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

---

### 4.5 "Recommended" is a model output, and says so

The catalog's default sort used to be called **Featured**. That was the wrong word twice
over. On a real storefront, *Featured* names a shelf a merchandiser ordered by hand — so
calling a model output *Featured* hides the model. And it was the only ranked surface in
the build with no explanation attached to it.

The comparator moved out of the component into `src/ml/ranking.ts` **byte-identically**,
and a regression test re-implements the old inline lambda and asserts the two orders match
across 300 products. This was a relocation, not a re-tune: the order a client saw last
week is the order they see now.

```
score = (popularity / 100) × (1 + 2.0 × P(team) + 1.2 × P(department))
```

Now that it is a named model output, it publishes what a model output owes:

- the **scorer and its weights**, in full, so anyone can multiply the numbers themselves;
- **per-product drivers** — the multiplier is the sum of its own driver contributions by
  construction, so the breakdown adds up rather than being a plausible-looking attribution;
- the **displaced positions**: where each of the visible top six would have sat under
  popularity alone. Both orderings are computed in the same pass over the same pool, which
  is what makes those positions a measurement.

It appears twice: inline on the catalog page under the sort control, where the claim is
made, and as a pinned card in the **Decisions** tab. It is pinned rather than folded into
the stream because the Recommended order is not an event — it is the standing state of
the page, re-decided on every render.

With the switch off, or with confidence under the gate, the card says the order is plain
popularity and shows no movement, because there is none.

On a **search** results page this scorer stands down, and the query engine's own ranking
takes over: `(relevance + soft credit) × (1 + 1.4·P(team) + 0.8·P(dept) + 1.6·P(player))`.
The shopper has just said what they want in words, and popularity × intent posterior is a
strictly worse-informed guess than that. Relevance and affinity **multiply** rather than
add, so a product this shopper would love that does not answer the question still cannot
outrank one that does.

Across all of it, one invariant: **ranking only, never membership.** Nothing on the page
is filtered out on the model's say-so. What is in the result set is decided by the
shopper's filters and their query, and by nothing else.

---

## 5. Size, fit and availability

Three decisions the shopper makes on a product page that most personalization demos skip,
because none of them are a carousel.

### 5.1 The size is predicted, prefilled, and shows its working

The fit model reads the size profile the fold maintains per department and predicts a size
before the shopper touches the ladder. It prefills only above a stated floor
(`FIT_PREFILL_FLOOR = 0.55`); below it the ladder opens empty and the button says
**Choose a size** rather than guessing.

Four things about how it is shown:

- **The confidence is on screen as a number**, not implied by the prefill existing.
- **A "Why this size" disclosure** lists the numbered reasons, any adjustments applied,
  and the distribution across the ladder as bars.
- **Sizes that are unavailable stay visible, struck through and disabled.** Removing them
  would tell the shopper their size does not exist rather than that it is gone.
- **Transfer across departments is damped** (`FIT_TRANSFER_DAMPING = 0.6`) and the ceiling
  on a purely population-based read is low (`POPULATION_CONFIDENCE_CEILING = 0.3`) — a
  guess from the cohort is not allowed to look like knowledge of the person.

**Gift intent blocks the prefill without erasing what the model knew.** If the session
reads as buying for someone else — above `0.65` on the scalar, with at least `0.25`
confidence behind it — the size and its confidence stay on screen and only the *prefill*
is withheld, with the reason named. The threshold lives in `ml/fit.ts` and is read by both
surfaces that ask, because a threshold written down twice eventually gets written down two
different ways.

One trap worth recording: the gift-intent scalar starts at **0.5**, which means *"no idea"*
rather than *"no gift"*. Reading a neutral 0.5 as a gift would have blocked the prefill for
every shopper who had done nothing at all. There is a test named for it.

### 5.2 Out-of-stock substitution is a ranking decision, and is shown as one

When a size is gone the buy button is replaced; when a product is pre-order the buy button
stays and a substitution panel is offered *beside* it. **Same engine, same gate, same
divergence table — a different claim on the shopper.** A size that is gone blocks; a
pre-order is slow.

The substitution ranker optimises **continuity**, not similarity, and the weights are
stated:

| Signal | Weight |
| --- | --- |
| Same player | 0.30 |
| Same club | 0.24 |
| Same department | 0.18 |
| Same style | 0.10 |
| Price proximity | 0.10 |
| Same sub-department | 0.08 |

Beyond a 25% price gap it stops being a substitution and starts being an upsell, so the
price term goes to zero.

**Availability is a gate, not a feature.** Candidates that cannot be had in the requested
size are rejected before scoring rather than down-weighted after it, and the rejections are
grouped on screen by reason with counts and examples. The panel also prints the
**divergence table**: this product is #2 by substitution and #17 by similarity, and the two
rankings disagreeing is the whole point of having both.

Per-size stock is derived from a hash of `productId:size` taken *outside* the catalog RNG
stream, so it is stable across renders and across a market rebuild without being stored.

A substituted line in the cart is attributed separately from a recommended one:
**revenue the store *kept*, not revenue a recommendation *created*.** Counting a swap as
incremental is the easiest way to make a personalization number look good and the fastest
way to lose the room when somebody checks.

### 5.3 Every merchandising badge carries the statistic behind it

Hover any badge — Low Stock, Pre-Order, a sale chip, a market flag — and a panel gives four
lines: **the rule** that placed it, **the statistic** it rests on, **the cohort** that
statistic was measured over with its share as a bar, and **the basis** of the measurement.

A badge is otherwise a sticker. This makes each one a claim with a population behind it,
and it is the cheapest way to show a merchandising team that the flags on their grid could
be accountable.

---

## 6. The engines

Everything in `src/ml/` — the three scoring engines below, plus the query engine (§4.1)
and the Recommended ranker (§4.5). None of them has a React or DOM dependency, so they
run from the command line under `tsx`, which is how the evaluation harness works.

The three below are the ones the offline harness scores, because they are the three that
predict something the simulator also knows the answer to. The query engine is not in that
table and should not be: there are no query logs in a synthetic world, so there is no
held-out truth to recover. What it has instead are 13 unit tests asserting its behaviour
against the real generated catalog.

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

## 7. The Recommendation Lab

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

## 8. The simulated world

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

## 9. The world has a clock

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

## 10. Refusal, made as visible as recommendation

A recommender is usually judged on what it puts on the screen. The harder half of the job
is what it keeps off, and that half is invisible by construction: a rail that showed six
things and a rail that refused two and showed four look identical from the shopper's
chair. A store whose only account of what it withheld lives in a developer console has not
actually told anyone anything.

So suppression here is a **gate, not a ranker** — a separate module, `src/ml/suppression.ts`,
that runs after retrieval and before presentation, and every refusal it makes is written
down in three places at three levels of detail.

### The four rules, in the order they fire

| Rule | Fires when | What lifts it |
|---|---|---|
| **Already owned** | the product was bought inside a 120-day window | the subdepartment is consumable (socks, drinkware, lanyards) or outgrowable (youth and toddler sizes); or the order shipped to another address; or the shopper's gift intent is *observed* above 0.6 |
| **Rival club** | the shopper is a confident loyalist (posterior ≥ 0.75 **and** distribution confidence ≥ 0.35) and the product belongs to a club joined to theirs by an edge above the suppression floor | no score buys a rival past this gate. The one thing that does is the shopper themselves: open a rival's own product page and the rule stands down for that club, on that surface, and says so |
| **Shown and ignored** | the product has accumulated decayed impressions without a click | a single click clears the count outright. Below the exclusion bar the rule only *demotes*, at λ = 0.12 per prior impression |
| **Below this slot** | the candidate's confidence is under the threshold *for the position it would occupy* | a stronger candidate behind it gets promoted into the slot instead |

### The rivalry graph is stated, not learned

`RIVALRIES` in `src/sim/taxonomy.ts` is four hand-written edges with an intensity and a
label a fan would recognise — *"NFC East, the oldest grudge in the division"*. It is stated
rather than derived on purpose, and the doc comment records the specific error the list
exists to prevent: **the three Philadelphia clubs are affinity, not rivalry.** Any method
that inferred rivalry from co-purchase or co-view would find that Eagles buyers also buy
76ers gear and conclude the two are related, which they are — just not in the direction
that would justify hiding one from the other.

One edge, Cowboys/Chiefs at 0.24, sits deliberately **below** the 0.5 suppression floor and
is kept in the list so the Profile tab can show the rule declining to fire. A rivalry graph
whose every edge fires is not a graph; it is a list of other teams.

### The rule that declines is shown declining

The rivalry rule is the only one in the gate that can decide *not* to act, and the only one
whose absence a shopper would notice. Both facts argue for the same thing: it has to be
visible when it stands down.

It stands down when the shopper opens a rival's own product page. They asked for that club by
name, and a store that answers a direct request by hiding what was asked for is not being
careful, it is being obtuse. The stand-down is narrow — it releases *that* club on *that*
surface, and the rule keeps holding every other rival on every store-chosen slot — and it is
announced everywhere the gate is announced: on the storefront ("Showing Cowboys anyway. We
usually keep Cowboys out of your rows because you shop Eagles, but you opened this one"), in
the Decisions tab as its own row, and in the decision reading as a *passed* rule labelled
**Rival club — stood down**. A beat whose only decision was to stand down is still written to
the journal and still rendered — with the count suppressed, because "Withheld — 0 items"
would read as a rule that had nothing to say.

The measured effect: the empty-rail rate on the similar-items rail fell from 41.9% to 6.3%,
without weakening the rule anywhere the *store* chose what to show.

**The homepage trending rail exists so the rule has a surface at all.** Every other rail is
either filtered to the shopper's club or anchored on a product they opened, so before it there
was nowhere in the storefront a rival's merchandise could reach a loyalist. "Trending across
the leagues" draws the top 50 bestsellers across every club, and for the Eagles loyalist the
gate refuses 45 of them — 44 to the rivalry rule and one already owned — filling five of the
eight tiles and leaving three empty. That is the correct outcome and the rail says so: there
is no eighth cross-league bestseller a confident Eagles fan should be shown, and a backfill
that reached further down the popularity list to avoid an empty tile would be the gate
overruling itself to protect the layout.

### Both loyalist floors are pinned to named shoppers

The rivalry rule is gated on the shopper being a *confident* loyalist, which is a pair of
numbers, and the first draft picked both by eye — 0.55 posterior and 0.6 confidence. The
second was on the wrong scale entirely. `distConfidence` is a product of three sub-unit terms,
so 0.6 sits near its practical ceiling; no shopper in the demo ever reached it, and the
rivalry rule could not fire for anyone. Measured across all five identity rungs:

| Scenario | Posterior | Confidence | |
|---|---|---|---|
| Returning Eagles fan | 0.796 – 0.883 | 0.363 – 0.817 | admitted |
| Hot-market shopper | 0.920 – 0.983 | 0.595 – 0.925 | admitted |
| Anonymous visitor | 0.712 | 0.263 | refused |
| Multi-team shopper | 0.458 – 0.639 | 0.221 – 0.544 | refused |
| Low-confidence shopper | 0.415 – 0.565 | 0.169 – 0.369 | refused |

**0.75 / 0.35** is the only pair that admits the two loyalists and refuses the other three,
and a test asserts exactly that — scenario by scenario, at every rung of the identity ladder —
so moving either number fails against a named shopper rather than against a hunch.

The same discipline caught the fatigue constant. At λ = 0.45 a single prior impression
multiplied a candidate's score by 0.64, which dropped it under the slot threshold: the
*demotion* rule was silently doing the work of an *exclusion* rule, and fatigue's own
exclusion never got to be the thing that removed anything. λ = 0.12 keeps the demotion a
demotion.

### Thresholds belong to the slot, not to the candidate

`SURFACE_POLICIES` gives every surface a lead threshold, a tail threshold, **the engine whose
score those two numbers are denominated in**, and a written rationale that the panel renders
verbatim:

| Surface | Slots | Lead → tail | Scale |
|---|---|---|---|
| Homepage hero | 1 | 0.72 | intent posterior |
| Homepage carousel | 8 | 0.90 → 0.72 | catalog popularity |
| Similar items | 4 | 0.85 → 0.65 | cosine similarity |
| Complete the look | 4 | 0.25 → 0.08 | co-order conditional |
| Cart cross-sell | 3 | 0.35 → 0.15 | co-order conditional |

**Read every row through its own scale and never across rows.** A cosine, a co-order
conditional and a softmax posterior all live in [0,1] and have nothing else in common: 0.25
on the complement scale is a *stricter* ask than 0.85 on the cosine, because the co-order
conditional has a median of 0.24 and the cosine a median of 0.86. This is not a caveat added
after the fact — it is the defect that shipped in the first draft of this table. `pdp_similar`
at 0.45 sat below the floor of its own engine, a gate that could never fire; `pdp_complement`
at 0.50 sat above the 90th percentile of its own engine and refused every candidate it was
ever handed, an empty rail for every shopper on every product. Two opposite failures, both
invisible without measuring, both shipped in the same commit. The `scale` field and
`SCALE_RANGE` exist so the next person can check the numbers instead of trusting them, and a
test now refuses any policy that sets a bar its own engine cannot clear — or one it always
clears. The thresholds above are set from measured empty rates: 6.1% on the similar rail,
6.3% on complements, 15.3% in the cart.

The hero is one slot, first on the page, and it makes a categorical claim in a club's
colours across the full width of the screen: *you are an Eagles fan*. Getting that wrong is
not a slightly worse recommendation, it is the store telling a Cowboys fan who they are.
The fourth tile of a carousel makes no such claim and is allowed to be a guess. On the
Anonymous scenario the banner drops its colours and says so, naming the read and the bar it
missed, while the carousel underneath keeps personalizing.

A refusal **does not consume a slot**. The next candidate is promoted into it and has to
clear *that* slot's bar in turn, which is why retrieval over-fetches — the rails ask for
eight and show four. A gate placed after a retrieval that returns exactly enough has only
one move available to it, leaving a hole, so every refusal would read on screen as a broken
rail rather than as a decision.

### Three audiences, three amounts of detail

- **The shopper** gets a line under the rail naming the *rule*: "3 items left out of this
  row — rival club merchandise and things you bought recently." It never names the
  products. Naming them would undo the refusal — *"we did not show you the Cowboys jersey"*
  is showing you the Cowboys jersey — and for the ownership rule it is worse than that,
  because the one case where a person buys the same thing twice is usually the case where
  they did not want the first one mentioned out loud.
- **The merchandiser** gets the Decisions tab, which names the SKU, the rule, the reason and
  which slot went unfilled, because this is the screen where "why did you never show me
  that" gets an answer that can be argued with.
- **The evaluator** gets the Recommendation Lab, where the gate is a funnel stage with a
  tickbox. Untick it and the suppressed candidates come back — they scored well the whole
  time, which is the point. It is the only stage on that screen whose value is visible
  solely by removing it.

### Every refusal is an entry in the effort ledger

A withheld impression is the one saving in this build that leaves nothing on screen to
point at, which is exactly why it has to be counted. `suppressionEffort` writes each fired
gate to the ledger as `suppressed_impression` — priced, like everything else there, at a
stated benchmark of three seconds and no click, with the count real and the conversion
labelled. The entry distinguishes slots that were backfilled from slots left empty.

### One bug worth recording

The gift-intent exception originally read `giftIntent >= 0.45`. An unobserved scalar trait
in this codebase starts at the 0.5 midpoint, and `createProfile` is explicit that this means
*not yet observed* rather than *average shopper*. The effect was that every cold visitor
read as a gift buyer and the ownership rule could never fire for anyone the system had not
already watched. It took a failing test to surface, and the fix needed two changes rather
than one: gate the value behind `giftIntent.evidence > 0`, and raise the constant to 0.6 so
that even an *observed* midpoint does not lift the rule. This is the same "null is not zero"
discipline that makes the Experience tab print **Not measured** rather than 0%.

---

## 11. Lifecycle triggers — the same discipline, off-site

Everything up to here happens while the shopper is standing there. This screen is the half
that runs after they leave, into a channel they did not ask to be in, where a bad decision
costs a great deal more than a badly ordered carousel does.

Seven triggers are evaluated against the live session, each through six gates.

### 11.1 The held messages are the point

A CRM screen that lists what fired can be built in an afternoon and answers nothing. The
question a client asks is *"what stops it sending"*, so every trigger shows its **whole
gate walk** — in order, with verdicts, **including the rules that passed**. A rule you
cannot watch pass is a rule you cannot trust is there.

| Gate | What it enforces |
| --- | --- |
| **Condition** | The trigger's own rule, in the words a CRM manager would write it |
| **Consent / rung** | Email needs `identified`; SMS needs `member` |
| **Holdout** | A 10% control arm, assigned by hash of the visitor id |
| **Quiet hours** | Per channel, in the visitor's own local time |
| **Frequency cap** | Email 2 per 24h; SMS 1 per 72h |
| **Content** | The same suppression gate the on-site rails use |

**SMS is gated at `member`, not `identified`** — because that is the only rung where a
verified mobile number lives. A demo that texts a cookie is describing a compliance
incident.

The holdout is assigned by a hash of the id rather than a coin flip, for the same reason
per-size stock is: **a holdout that moves between two paints is not a holdout.**

Quiet hours are per channel and deliberately asymmetric — email 06:00–23:00, SMS
09:00–20:00. Email waits in an inbox; SMS makes a noise.

### 11.2 The content bar is the highest in the build

The two off-site surfaces run through `applySuppression` at their own policies, and both
sit above every on-site rail. The email policy asks its lead slot for a top-decile seller —
a harder ask than any carousel makes of the same engine.

The rationale is written into the policy and rendered verbatim: four product slots in a
message the shopper did not ask for, opened hours after the session that triggered it. The
evidence has aged, and **the shopper cannot scroll past a bad pick to a good one.**

Where the bar cannot be met, **slots are left empty rather than backfilled**. Backfilling
below the bar would be the gate quietly disagreeing with itself.

### 11.3 What is session, what is CRM, and the screen says which

The cart, the views, the size the shopper could not have and the club they read as are all
folded out of the live session and are not editable.

Three facts are **not things a browser holds** — the visitor's local hour, how many
messages the programme has already sent in the current window, and when the last session
ended. Those are presented as controls, explicitly labelled as CRM state, so the gates can
be *demonstrated* rather than described. Move the hour slider into the small hours and the
verdicts change live.

One derivation worth naming: the "your size is back" trigger reads its size from the same
`predictFit` the product page prefilled with, and its availability from the same
`needsSubstitute` the product page refused with. It could have kept its own list. It does
not, because a second list is a list that will eventually disagree with the page.

Held messages are written to the effort ledger as **impressions the shopper did not have to
sort through** — priced at the same rate as a suppressed on-site impression, because the
alternative is to invent a number for what an unwanted message costs a person.

**Nothing is sent.** There is no CRM behind this build and no address to send to.

---

## 12. Effort, not money

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

### 12.1 The twin store race

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

### 12.2 Population effort metrics

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
accuracy metrics in §14 are labelled. They are not measurements of human beings.

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

### 12.3 The per-session effort ledger

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

### 12.4 What building it caught

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

## 13. The model registry

Eleven models, one table, and four columns that are usually missing from a model inventory.

| Column | What it holds |
| --- | --- |
| **Writes** | The profile field this model *owns* |
| **Decay** | The λ on that field, with its half-life in events |
| **Activation** | The bar it must clear, and the distribution that bar lives in |
| **Metric** | Read live from the offline harness — or why there is none |
| **Last fired** | The step in *this* session where it last ran |

Each earns its place:

**Writes.** Several cards say *nothing*, and that is the point. A retrieval engine reads
the profile and writes none of it. A registry that implies otherwise is how two models end
up fighting over one field.

**Decay.** A model that writes a field and does not state its decay has not said how long
its evidence is good for.

**Metric.** Read on demand rather than baked in at build time. **A table of numbers shipped
in a file is not evidence; one a reviewer can re-run at a different sample size is.** Four
cards have no metric, and each states *why* — because "no number" and "we did not look" are
different admissions and the column must not blur them.

**Last fired.** Six models appear in the decision journal as their own beat. The four
gate-family models do not, by design — they are reported through the surface they acted on.
They still leave a trace: each writes to the effort ledger when it fires. So `lastFiredFor`
reads **two sources and returns one shape**, joined on the event id so both report the same
step number. One definition, one function — rather than a journal answer for six cards and
an improvised answer for the other four. Two of the four write the same ledger kind and are
disambiguated by surface, and there is a test pinning it.

**Nothing on this screen is a second copy of a number.** The activation column pulls
`CONFIDENCE_THRESHOLD` out of `ml/intent`, the surface bars out of `SURFACE_POLICIES`, the
prefill floor out of `ml/fit`. A registry that keeps its own copy of the thresholds is a
document, and documents drift. If somebody moves a bar, this screen moves with it or the
build fails.

**Rows expand to the live feature vector** — the actual values the model is reading out of
the profile at that instant, each with the dotted path it came from. Not a schema. The
values. Open the screen in a second window, click through the storefront in the first, and
they move.

---

## 14. Offline results

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

## 15. How it is built

React 19 + TypeScript (strict) + Tailwind CSS 4 + Vite 6. ~32,600 lines, of which ~15,300
are engine and simulator code with no browser dependency at all. No backend, no API key, no
network call at runtime.

```
src/
  sim/           The simulated world: taxonomy, catalog generator, population
                 and behaviour model, seeded RNG. Deterministic.
  ml/            22 modules behind one facade (engine.ts): the profile fold and
                 identity ladder, intent, similarity, complement, ranking, query
                 interpretation, suppression, fit, substitution, badges, lifecycle,
                 the effort ledger, the model registry, the decision journal, and
                 the offline evaluation harness.
  components/
    storefront/    The shopping experience
    intelligence/  Explanation, evidence, architecture and partnership screens
    brand/         Straive lockup and mark; team crests, league badges and
                   department glyphs, all drawn rather than fetched
    common/        Chrome: app bar, storefront header and nav, demo strip,
                   and the collapsible deep-dive rail
  context/       Single app store; engine calls are memoised on their inputs.
```

**React imports from `engine.ts` and nowhere else.** One facade means a component cannot
reach past it into a module's internals, and the boundary that makes `src/ml` liftable is
enforced by the import graph rather than by convention.

`src/sim` and `src/ml` have **no React and no DOM dependency**. That is not tidiness for
its own sake — it is what makes the evaluation harness possible and what would make these
modules liftable into a real service.

Recharts is lazy-loaded, so the storefront's first paint does not carry half the bundle.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run lint` | `tsc --noEmit` |
| `npm test` | 153 unit tests across 12 files, under `tsx` — no browser |
| `npm run sim:inspect` | Print catalog and simulation statistics |
| `npm run sim:eval` | Run the offline evaluation harness |
| `npm run sim:effort` | Population-level effort metrics with bootstrap intervals |
| `npm run sim:market` | Measure a market event's effect on the simulated world |
| `npm run sim:imagery` | Check every product resolves to a drawn asset |
| `npm run build:single` | Single-file build, for handing the demo off on a USB stick |

### Design system

Two palettes, used as an information-design device rather than decoration:

- **Straive orange `#FF5800`** — every surface the delivery team owns: the app bar, the
  intelligence panel, the deep dives, the left rail.
- **ProSports red** — the fictional storefront.

At any moment it is visually obvious whether you are looking at the client's shop or at
our instrumentation of it.

---

## 16. Who this is for

| Audience | What to show them |
| --- | --- |
| **Client leadership** | The storefront with the ON/OFF switch, the shopper-scenario pills, and and the Twin Store Race. Five minutes, no jargon, no ROI slide. |
| **Client data science / engineering** | The Model Registry, the Recommendation Lab with the gate pushed until the rail empties, Model Evidence including the department-intent admission, and System Architecture. Invite them to try to break the Lab. |
| **Client CRM / lifecycle marketing** | Lifecycle Triggers. Move the hour slider and the frequency caps and watch the gates change their verdicts. |
| **Internal (Straive)** | A reusable capability asset. The `sim/` and `ml/` layers are client-agnostic; the taxonomy is one file. |

**`DEMO.md` holds two scripted paths — five minutes for a business audience and fifteen for
a technical one — timed, keystroke by keystroke, with a ranked cut-list for when you are
running short.**

The client name is fictional throughout — ProSports — and the engines are named for what
they do (Intent, Similarity, Complement) rather than for any product.

---

## 17. What it deliberately does not do

- **No ROI calculator.** There was one; it was deleted. It was the only screen with no
  model behind it, and a made-up revenue figure next to nine screens of real arithmetic
  devalues all nine.
- **No claimed accuracy.** Every figure on screen is labelled as simulated.
- **No hidden filtering.** Where a rule removes candidates, the count that changes is
  shown, with the reason.
- **No stock imagery, no external fonts-as-images, no API keys.** Unplug the network and
  it still runs.
- **No message is sent, and no address exists.** The lifecycle screen evaluates and shows;
  there is no CRM behind it.
- **No effort figure converts to money.** The counts are real and paired at the moment of
  decision; the per-action seconds are labelled benchmarks, because a click is countable
  and the seconds it costs a person are not something this demo has measured.
- **No spell correction, embeddings or learned synonyms in search.** The taxonomy is the
  universe the query engine can map onto, and it says so. None of the three can be shown
  honestly without query logs, and this world has none.

---

## 18. Where it goes next

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
6. **Point the lifecycle gates at a real ESP.** The gates, the priority ordering, the
   holdout and the caps are already the hard part; what is missing is a send adapter and a
   consent record to read instead of a control.
7. **Make the registry the deployment surface.** It already states every threshold, decay
   constant and offline metric in one place, read from the modules that enforce them. In a
   real system that is where a model version gets promoted or rolled back.

---

*Prototype. Synthetic data, simulated models. Not production accuracy.*
