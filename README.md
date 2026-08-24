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

Every screen that shows a figure says which of those two it is. The Business Impact
calculator, which shows neither, says so in the loudest terms on the page.

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
| `npm run lint` | `tsc --noEmit` |
| `npm run build` | Production build (code-split, for a static host) |
| `npm run build:single` | One self-contained HTML file in `dist-single/` - runs from `file://`, no server |

`build:single` is the one to use for handing the demo to someone: it produces a single
~0.9 MB HTML file with the JS, CSS and all imagery inlined. Double-clicking it opens the
full prototype with no install and no network.

## The six demo moments

The left nav is ordered for a walkthrough. The intended path:

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

Five preset scenarios along the top drive all of this; the ML Intelligence Trace panel on
the right shows the seven-step decision sequence for whatever is currently on screen.

## Layout

```
src/
  sim/         The simulated world: taxonomy, catalog generator, population
               and behaviour model, seeded RNG. Deterministic.
  ml/          The engines: intent, similarity, complement, shared embeddings,
               and the offline evaluation harness.
  components/
    storefront/    The shopping experience
    intelligence/  Explanation, evidence, architecture and business screens
    common/        Chrome: header, nav, scenario selector, journey tracker
  context/     Single app store; engine calls are memoised on their inputs.
```

`src/sim` and `src/ml` have no React dependency and no DOM dependency — they run under
`tsx` from the command line, which is how the evaluation harness works.

## Current offline results

From `npm run sim:eval` at n = 2000. Reproduced live on the Model Evidence tab.

| Engine | Metric | Model | Popularity baseline | Lift |
| --- | --- | --- | --- | --- |
| Intent — team | Recall@1 | 41.1% | 21.3% | 1.93x |
| Intent — team | NDCG@10 | 69.7% | 59.3% | 1.18x |
| Intent — department | Recall@1 | 19.7% | 17.5% | 1.12x |
| Intent — department | Recall@3 | 54.6% | 57.9% | **0.94x** |
| Similarity | Recall@1 | 4.5% | 1.1% | 4.09x |
| Similarity | NDCG@10 | 6.2% | 1.4% | 4.43x |
| Complement | Recall@1 | 2.9% | 2.9% | 1.00x |
| Complement | NDCG@10 | 9.4% | 6.9% | 1.37x |

Two of these are unflattering and are left in deliberately. Department intent **loses** to
popularity at Recall@3, because department mix is far less person-specific than team
allegiance. Complement ties popularity on the first pick and only wins on the ordering of
the rest. Both are stated on the screens that report them.

## Notes for whoever picks this up next

- The catalog, population and behaviour draws are seeded, so the same figures come back
  every run. Change the seed in `src/sim/rng.ts` to see the sampling variance — it is
  large enough at small n to flatter a metric by 3x, which is why the UI evaluates at 2000.
- Product imagery is generated inline as SVG (`ProductImage.tsx`). Nothing is fetched.
- The app is intentionally de-branded. Engines are named by what they do — Intent,
  Similarity, Complement.
- To replace the simulator with real data, `src/sim` is the seam: `getDataset()` is the
  only thing `src/ml` and the UI consume.
