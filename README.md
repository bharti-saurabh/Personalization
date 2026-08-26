# ProSports Personalization Prototype

A working prototype of an e-commerce personalization platform for a sports-merchandise
retailer: three recommendation engines, a storefront that visibly changes when they are
switched on, and an explanation layer that traces every personalized component back to
the signals that produced it.

Everything runs in the browser. There is no backend, no API key and no network call.

## The one thing to understand first

**There are no trained models and no real shoppers here.** What exists instead is a
simulated data-generating process — a synthetic catalog, a synthetic population and a
synthetic behaviour model — and genuine algorithms that run over it.

That distinction matters in both directions:

- The **algorithms are real**. Recency-weighted log-odds with Bayesian pseudo-counts,
  cosine k-NN over hybrid embeddings, a directional co-order affinity graph. They are
  computed live, per interaction, from the events on screen. Nothing is a lookup table.
- The **numbers are not production accuracy**. The offline evaluation measures how well
  each engine *recovers a process we wrote ourselves*. Treat it as an upper bound and as
  evidence the pipeline is wired correctly — not as a forecast of performance on real
  retail data.

Every screen that shows a figure says which of those two it is.

## Run it

Prerequisites: Node.js 18+.

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run sim:eval` | Offline evaluation of all three engines against popularity baselines |
| `npm run sim:inspect` | Dumps catalog and population statistics for sanity-checking the simulator |
| `npm run sim:imagery` | Renders the procedural product artwork |
| `npm run sim:market` | Fires a trade into the world and diffs it against the quiet world - the source of every market-event figure quoted in the docs |
| `npm run sim:effort` | Paired counterfactual over the population - what personalization costs the shopper in STEPS, with bootstrap intervals. Kept out of `sim:eval` so the accuracy harness stays fast |
| `npm test` | Unit tests for `src/ml` and `src/sim`, including the market-event isolation checks and the effort-ledger arithmetic |
| `npm run lint` | `tsc --noEmit` |
| `npm run build` | Production build (code-split, for a static host) |
| `npm run build:single` | One self-contained HTML file in `dist-single/` - runs from `file://`, no server |

`build:single` is the one to use for handing the demo to someone: it produces a single
~0.9 MB HTML file with the JS, CSS and all imagery inlined. Double-clicking it opens the
full prototype with no install and no network.

## The demo moments

The left nav is ordered for a walkthrough. The intended path:

0. **Type into the search box.** `something for my son` maps to the Kids department plus a
   gift intent; `hurts beanie` matches nothing and relaxes its constraints least-certain-first
   rather than returning an empty page; `hur` completes to Jalen Hurts with the autocomplete
   rows ranked by profile and their un-personalized positions shown beside them. Every search
   lands on the catalog page, which is where moments 1 and 2 continue.
1. **Personalization ON vs OFF** — toggle in the header. With it off the storefront falls
   back to national popularity and alphabetical ordering, and the product rail changes
   from one team to a mixed grid. The difference is structural, not cosmetic.
2. **Intent prediction** — the team and department widgets are ranked probabilities, and
   the header carries the top team and its confidence.
3. **Similarity** — "You May Also Like" on a product page, scored against held-out
   co-view behaviour rather than the metadata the embedding was built from.
4. **Intent drift** — the Multi-Team scenario shows a second team overtaking the first as
   evidence accumulates, including a single-tick drop into fallback at the crossover.
5. **Low confidence and fallback** — the Anonymous scenario cannot clear the activation
   threshold, so the storefront degrades to non-personalized and says why.
6. **Business impact** — accept a cross-sell in the cart. The attribution block splits the
   basket into shopper-initiated and engine-contributed value, and a behavioural event is
   written to the stream.
7. **The filter rail re-sequences itself.** On the catalog page, tick Jerseys then Men and
   watch the next question offered change from Player to Size. The mix bar in the rail
   header shows the handover from the model to the funnel as it happens.
8. **"Recommended" explains itself.** The default sort is an explicit model output. Open
   the disclosure under the sort control, or the pinned card at the top of the Decisions
   tab, for the scorer, its weights, the per-product driver breakdown, and where each item
   would have sat under popularity alone.

Five preset scenarios along the top drive all of this; the ML Intelligence Trace panel on
the right shows the seven-step decision sequence for whatever is currently on screen.

## Layout

```
src/
  sim/         The simulated world: taxonomy, catalog generator, population
               and behaviour model, seeded RNG, and the season clock that
               carries the calendar and the market-event log. Deterministic.
  ml/          The engines: intent, similarity, complement, query understanding
               and the Recommended ranker, plus shared embeddings, the visitor
               profile fold, the offline evaluation harness, the paired
               counterfactual that measures shopper effort, and the session
               effort ledger.
  components/
    storefront/    The shopping experience
    intelligence/  Explanation, evidence, architecture and partnership screens
    brand/         Straive lockup and mark; team crests, league badges and
                   department glyphs, all drawn rather than fetched
    common/        Chrome: Straive app bar, storefront header and nav, demo strip,
                   and the collapsible deep-dive rail that navigates the whole app
  context/     Single app store; engine calls are memoised on their inputs.
```

`src/sim` and `src/ml` have no React dependency and no DOM dependency — they run under
`tsx` from the command line, which is how the evaluation harness works.

## Current offline results

From `npm run sim:eval` at n = 2000. Reproduced live on the Model Evidence tab. This is
the current harness — the one where a session draws a department mission at its start and
the held-out target is something the shopper actually chose. `WHAT-WE-BUILT.md` §9 carries
the retired harness alongside it and explains why the two are not comparable.

| Engine | Metric | Model | Popularity baseline | Lift |
| --- | --- | --- | --- | --- |
| Intent — team | Recall@1 | 40.0% | 24.1% | 1.66x |
| Intent — team | NDCG@10 | 69.7% | 62.0% | 1.12x |
| Intent — department | Recall@1 | 27.7% | 18.5% | 1.50x |
| Intent — department | Recall@3 | 64.4% | 65.8% | **0.98x** |
| Similarity | Recall@1 | 7.8% | 2.1% | 3.63x |
| Similarity | NDCG@10 | 8.2% | 2.0% | 4.11x |
| Complement | Recall@1 | 2.9% | 2.7% | 1.08x |
| Complement | NDCG@10 | 8.8% | 7.9% | 1.11x |

Two of these are unflattering and are left in deliberately. Department intent still
**loses** to popularity at Recall@3, because department mix is far less person-specific
than team allegiance. Complement barely beats popularity on the first pick and wins mostly
on the ordering of the rest. Both are stated on the screens that report them.

The query engine is **not** in this table, and should not be. Recovery metrics need a
held-out truth the simulator knows; there are no query logs in a synthetic world. It has
13 unit tests asserting its behaviour against the real generated catalog instead
(`npm test`).

## Notes for whoever picks this up next

- The catalog, population and behaviour draws are seeded, so the same figures come back
  every run. Change the seed in `src/sim/rng.ts` to see the sampling variance — it is
  large enough at small n to flatter a metric by 3x, which is why the UI evaluates at 2000.
- Product imagery is generated inline as SVG (`ProductImage.tsx`). Nothing is fetched.
  The same is true of every crest, league badge and department glyph
  (`components/brand/Identity.tsx`) — no external image URL appears anywhere.
- Two palettes, and the split carries meaning. Straive orange is everything the
  delivery team built: the app bar, the intelligence panel, the deep dives.
  ProSports red is the storefront. A viewer can tell at a glance which half of the
  screen is the shop and which half is the machinery reading it.
- The retailer is intentionally de-branded — ProSports is fictional, and the engines
  are named by what they do: Intent, Similarity, Complement. The only real mark in
  the app is Straive's, and it never appears inside the storefront.
- To replace the simulator with real data, `src/sim` is the seam: `getDataset()` is the
  only thing `src/ml` and the UI consume.
