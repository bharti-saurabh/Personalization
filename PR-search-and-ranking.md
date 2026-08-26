# Search that understands, ranking that explains itself

Three things in this PR, and they are one thing: **the demo path now starts at the search
box**, and everything the shopper meets on the way to a product says why it is in the
order it is in.

1. A query engine that maps free text onto taxonomy nodes, completes it ranked by the
   visitor profile, and never returns an empty page.
2. The catalog's default sort, previously called *Featured*, promoted from an anonymous
   inline comparator into an explicit model output with its own explanation.
3. The facet re-sequencing — which was already the strongest technical idea in the build —
   moved onto the main demo path and given a header that shows the handover happening.

Two DOM-free modules, two test files, one new component, and edits to four existing files.
`npm run lint`, `npm test` (53), `npm run sim:eval` (numbers unchanged), `npm run build`
and `npm run sim:effort` all pass.

---

## 1. Query understanding — `src/ml/query.ts`

### What it replaced

```ts
products.filter((p) =>
  p.name.toLowerCase().includes(q) ||
  p.team.toLowerCase().includes(q) ||
  p.department.toLowerCase().includes(q)
).slice(0, 6)
```

A substring match over three fields, rendering a dropdown only when it found something.
Type *something for my son* into it and you get nothing at all, because no product is
called that — and the component had no zero-result branch, so the shopper got a blank
space under the cursor.

### What it does now

Four stages, each of which is published to the screen rather than kept internal:

| Stage | What happens |
| --- | --- |
| **INTERPRET** | Longest-phrase-first matching over a lexicon of players, teams, leagues, departments, sub-departments, brands, genders, sizes, price patterns and gift phrases |
| **PROPAGATE** | A player implies their club (×0.6) implies its league (×0.5), each emitted as its own node marked `propagated` |
| **RETRIEVE** | Nodes become constraints, one per axis; constraints filter |
| **RANK** | `(relevance + soft credit) × profile affinity` |

```
"hurts jersey"          player Jalen Hurts 82% (surname)
                        department Jerseys 95% (synonym)
                        team Eagles 49%      (inferred)
                        league NFL 25%       (inferred)      → 8 products

"something for my son"  department Kids 85% (phrase)
                        gift intent 85%                      → 48 products

"eagles cap under $40"  team Eagles, department Hats,
                        price ceiling $40                    → 20 products
```

### Three decisions worth arguing about

**Ambiguity is preserved, not resolved.** The first implementation iterated a flat lexicon
and let the first matching entry consume the span, so `philadelphia hoodie` returned the
Eagles and silently dropped the 76ers and the Phillies, and `jalen` returned Jalen Hurts
and dropped Jalen Carter. The lexicon is now grouped by phrase and *every* entry sharing a
matched span is emitted, at the reduced confidence that ambiguity earns (0.45 for a shared
city, 0.35 for a shared given name). `philadelphia hoodie` went from 19 matches to 50.

This matters beyond correctness: the rescue ladder drops the least-certain constraint
first, which is only a defensible rule if confidence was recorded honestly to begin with.

**Search reads the profile; Recommended reads the intent posterior.** These are different
inputs on purpose. The intent posterior has no player axis and no gift trait, and a typed
query needs both. The profile is still a pure fold over observed events, so the leakage
guard holds — no ranker anywhere reads `customer.teamAffinity` or the held-out target.

**Gift intent is personalization switching itself off.** *For my son* emits two separate
nodes — the Kids department and a gift trait — kept separate so the rescue ladder can drop
the department while the trait survives. The trait then withdraws the shopper's own player
affinity from the ranking (`if (pp > 0 && !gift)`, and the driver is absent from the
breakdown, not zeroed) and suppresses the saved-size prefill on the catalog page.
Personalizing a present toward the person buying it is the fastest way to make a system
feel like it is watching rather than helping.

### What it deliberately does not do

No spell correction, no embeddings, no learned synonyms. None of the three can be
demonstrated honestly against a synthetic catalog with no query logs. The taxonomy is the
universe this engine can map onto — a stated limit, not a shortcut.

---

## 2. Zero-result rescue

`hurts beanie` is a real player and a real product type that never co-occur in this
catalog. Exact matches: **0**. The ladder that follows is on screen, rung by rung:

| Dropped | Confidence | Results after |
| --- | --- | --- |
| league NFL | 25% | 0 |
| team Eagles | 49% | 0 |
| subdepartment Beanie | 70% | 0 |
| player Jalen Hurts | 82% | **136** |

**Least-certain-first**, and — the part that makes it more than a fallback — **nothing
that comes off is forgotten**. A dropped constraint is degraded into a ranking credit
worth `0.4 × confidence`, so the page that comes back is not an arbitrary list of beanies.
It is beanies with Eagles and Hurts-adjacent stock at the top.

When nothing in the query maps at all (`xyzzy plugh`), the fallback is the whole catalog
ranked by profile affinity, with the page stating plainly that the query matched nothing.

The rescue writes a `dead_end` saving to the effort ledger, and only when personalization
is on — because that is the only condition under which the control store would genuinely
have shown the empty page. Every other search writes nothing to the ledger.

---

## 3. Autocomplete ranked by profile — `suggest()`

Two bands, scopes then products, each internally ranked by the profile, each row carrying
the position it would have held without one:

```
Jerseys · Eagles      2 → 1
Jerseys · Cowboys     1 → 2
Jerseys               3 → 3
```

Both orders come from the same pass over the same pool, so `2 → 1` is a **count**, not an
estimate. Choosing a moved row emits a `scroll_depth` saving for exactly that difference.

The un-personalized band is not empty and not hardcoded. An earlier draft concatenated the
literal strings `'Eagles'` and `'Jerseys'` as fallbacks, which would have quietly made the
control arm agree with the treatment arm on the demo persona. It now derives from
`marketSize` and `assortmentWeight` — a genuine merchandised default.

**The dropdown renders whenever the box has text in it.** There is no empty state, because
the argument being made is that a query the catalog cannot satisfy should still produce
somewhere to go. A zero-match warning appears only once the query is four characters or
more, so `eagl` mid-word does not get told it matches nothing.

---

## 4. "Featured" → "Recommended" — `src/ml/ranking.ts`

*Featured* was the wrong word twice over. On a real storefront it names a shelf a
merchandiser ordered by hand, so calling a model output *Featured* hides the model — and
this was the only ranked surface in the build with nothing attached explaining it.

**This is a relocation, not a re-tune.** The comparator moved out of
`ProductListingPage.tsx` byte-identically:

```ts
score = (popularity / 100) × (1 + 2.0 × P(team) + 1.2 × P(department))
```

`ranking.test.ts` re-implements the old inline lambda verbatim and asserts the two orders
match across 300 products, so *"we made it explainable"* stays a true sentence and the
order a client saw last week is the order they see now.

What it publishes now that it has a name:

- the scorer and its weights in full;
- per-product drivers, where the multiplier **is** the sum of its own driver contributions
  by construction — the breakdown adds up rather than being a plausible attribution;
- the displaced positions: where each visible item would have sat under popularity alone,
  both orders computed in the same pass over the same pool.

It appears inline under the sort control, where the claim is made, and as a **pinned card**
at the top of the Decisions tab — pinned rather than folded into the stream because the
Recommended order is not an event. It is the standing state of the page, re-decided every
render; a stream entry would either fire constantly or lie about when it last ran.

On a search results page this scorer **stands down** and the query engine's ranking takes
over. The shopper has just said what they want in words; popularity × intent posterior is a
strictly worse-informed guess than that.

---

## 5. The facet re-sequencing, promoted

It was already built, and it was buried: reachable only if a viewer wandered onto the
catalog page and started ticking boxes. Two changes put it on the path everyone walks.

**Search results land on the catalog page**, not on a product page. The old behaviour
jumped straight to a PDP, which skipped the rail entirely. Now the path is
Search → Catalog → Product, and the rail is step two of three.

**The rail header shows the handover.** It used to be one sentence that changed text at
zero, one and three selections. It now names the next question the rail has decided to
ask, and draws the mix:

```
Model ▓▓▓▓▓▓▓▓░░░░░░░░ Funnel
t = 0.33 · 1 answered · 2 groups re-sequenced
```

`t` and the re-sequenced count both come out of the memo that already computed both
orderings — the one on screen and the funnel-only one the control store serves. Nothing
new is calculated to say this; it was already there and was not being shown.

---

## 6. Wiring

| File | Change |
| --- | --- |
| `src/ml/query.ts` | **new**, ~900 lines, DOM-free |
| `src/ml/ranking.ts` | **new**, ~250 lines, DOM-free |
| `src/ml/query.test.ts` | **new**, 13 tests against the real generated catalog |
| `src/ml/ranking.test.ts` | **new**, 5 tests including the byte-identity regression |
| `src/components/storefront/SearchUnderstanding.tsx` | **new**: chip strip, gift note, rescue ladder |
| `src/context/AppContext.tsx` | `searchResult`, `runSearch`, `clearSearch`, `lastRanking`, `publishRanking` |
| `src/ml/journal.ts` | `EngineName` gains `'Query'`; `BeatInput.search`; a `queryRun()` builder; search surfaces; the why-sentence leads with the interpretation when there was a query |
| `src/components/common/Header.tsx` | substring filter replaced by `suggest()`; keyboard navigation; no empty state |
| `src/components/storefront/ProductListingPage.tsx` | search result as the base pool; `rankRecommended`; the why-this-order disclosure; gift-intent guard on the size prefill; the promoted rail header |
| `src/components/intelligence/DecisionsTab.tsx` | the pinned Recommended card |

Three details in the wiring that are not obvious:

**The search reaches the journal through a ref, not through state.** `runSearch` sets
`pendingSearch.current` and the beat effect consumes it in the same pass as the event that
caused it. Through state there would be a render in between where a beat could be written
without its query attached.

**Only confident nodes teach the profile.** The event `runSearch` records carries the
interpreted team, department and league — a raw string moves no posterior — but only nodes
at or above 0.6. A league inferred from a club inferred from a surname sits at 0.25, and
writing that into the fold with the weight of a click would teach the profile a chain of
guesses as though it were an observation.

**Faceting a search counts against the search.** The catalog page's `pool` is the query's
result set when there is one and the whole catalog otherwise. Faceting a search against the
full catalog would offer *Size XL (90)* and then show four products.

---

## Gates

```
npm run lint        tsc --noEmit, clean
npm test            53 passing (was 35)
npm run sim:eval    R@1 team 40.0% / dept 27.7% / sim 7.8% / comp 2.9% — unchanged
npm run build       clean
npm run sim:effort  unchanged
```

`src/sim` and `src/ml` remain free of any React or DOM import.

## One correction carried in this PR

`README.md`'s offline results table was reporting **Harness A** numbers — the retired
generator — under the heading "Current offline results". `WHAT-WE-BUILT.md` §9 has carried
both tables and the explanation of why they are not comparable for some time; the README
had not been updated alongside it. It now reports Harness B, with a pointer to §9.
