# A clock for `src/sim`, and a market that can move under the shopper

The world was a still photograph with a date baked into it. This makes time an
injectable parameter, and then uses that to let the market change mid-session.

Per orientation, the work here is **threading time through the DOM-free modules
and invalidating the singletons**, not enumerating events. The event list is the
small half.

---

## Part 1 — `src/sim/clock.ts`

```ts
interface SimClock { month: number; year: number; events: readonly MarketEvent[] }
```

`SIM_MONTH` and `LEAGUE_SEASONALITY` move out of `taxonomy.ts`'s frozen
constants. Taxonomy is the register of what the world is made *of*; it is not
the place that knows what time it is.

Every function that read those constants now takes a trailing
`clock: SimClock = activeClock()`. **The ambient clock is a default, never a
dependency** — that one convention is what makes an evaluation arm passing its
own clock share nothing with the running app, and it is why the isolation
property below is structural rather than a matter of discipline.

Threaded through:

| Module | Function | Reads |
| --- | --- | --- |
| `behavior.ts` | `simulateBehavior`, `measureSurfacePolicy`, `calibrateChoiceModel`, `simulateSession` | `seasonality`, `teamDemand`, `departmentDemand` |
| `catalog.ts` | `generateCatalog`, `generateProduct`, `applyMarketEvents` | `seasonality`, `effectAt` |
| `ml/profile.ts` | `teamPrior` | `seasonality`, `teamDemand` |
| `dataset.ts` | `buildWorld` | the clock itself, carried on `Dataset` |

### One correction to the brief

The request said *"both behavior.ts and intent.ts import seasonality from
clock.ts instead."* `behavior.ts` does. **`intent.ts` does not, and should
not** — it never read seasonality directly. It reads `teamPrior` from
`src/ml/profile.ts`, which is the single function that turns calendar into
prior. The clock parameter went there instead, so intent sees the clock through
exactly one seam rather than growing a second one. Stating it because the
difference is load-bearing, not cosmetic.

---

## Part 2 — seven market events

Each has a defined effect on **both** the catalog and the population, decaying
exponentially toward neutral on its own half-life —
`1 + (lift − 1)·0.5^(months/halfLife)`.

| Event | Player | Club | Departments | Half-life |
| --- | --- | --- | --- | --- |
| `TRADE` | ×2.4 | ×1.3 new, ×0.9 old | Jerseys ×1.55, T-shirts ×1.15 | 2 mo |
| `INJURY` | ×0.5 | ×0.93 | — | weeks out ÷ 4.3 |
| `PLAYOFF_WIN` | — | ×1.4 | Hats ×1.5, T-shirts ×1.35, Jerseys ×1.15 | 1.5 mo |
| `CHAMPIONSHIP` | — | ×1.95 | Hats ×1.8, T-shirts ×1.6, Collectibles ×1.5 | 6 mo |
| `NEW_SIGNING` | ×1 + 1.6·draw | ×1.2 | Jerseys ×1.4 | 3 mo |
| `RETIREMENT` | ×1.7 | ×1.05 | Collectibles ×1.6, Jerseys ×1.2 | 2 mo |
| `KIT_LAUNCH` | — | ×1.25 | Jerseys ×1.6 | 4 mo |

`fireMarketEvent` moves the clock **first**, then drops the `getDataset()` memo,
then bumps the version `getModels()` already keys off, then notifies React. That
is the invalidation path built in PR A, used for the first time by something
that genuinely needs it.

---

## Part 3 — the trade, measured

Figures below are from `npm run sim:market`, added in this PR. Two worlds built
from the same seed, one quiet and one with the trade fired, diffed. Same seed
means every difference is caused by the event and by nothing else.

**The player moves.** 12 products rewritten in place — club, league, title,
colourway, shirt number — **keeping their product ids**.

> Why a post-generation rewrite and not the cleaner fold-roster-then-generate?
> Product ids are positional. Regenerating reissues them, so a shopper holding
> the traded jersey in their cart would be holding a product the catalog no
> longer contains — in a demo whose whole point is that the event fires
> mid-session. The trade-off is documented at length in `applyMarketEvents`.

**Jersey demand transfers with him.**

| | Before | After | |
| --- | --- | --- | --- |
| Jalen Hurts orders | 187 | 228 | **+22%** |
| …booked under Eagles | 187 | **0** | |
| …booked under Cowboys | **0** | 228 | |
| Cowboys jersey orders | 382 | 653 | **+71%** |
| Eagles jersey orders | 415 | 368 | −11% |

**The population moves, not just the shelf.** Session focus: Cowboys
20.4% → 23.3%, Eagles 20.9% → 19.8%. `teamDemand` enters the shopper's focus
draw, so the event changes *who shops for what*. This is the half that is easy
to skip and the half that makes the effect real.

**Co-order priors recompute.** For the sample moved jersey, co-order mass flips
100% Eagles neighbours → 100% Cowboys neighbours. Rebuilt from re-simulated
behaviour, so a recomputation and not a relabelling.

**Everything else re-ranks.** 289 products flagged (163 lifted, 126 damped),
open surfaces re-rank, PDP and cart re-bind to the fresh objects, and a market
entry lands in the decision stream. Rebuild ~5.9s.

### A defect the probe caught

Lifts were `min(100, popularity × lift)`. A trade is 1.3 club × 1.55 Jerseys ≈
2×, against popularities already in the 80s and 90s — so **all 163 Dallas
products pinned to exactly 100**. One distinct popularity value across the club
the event had just made interesting. Invisible on screen; obvious in one column
of numbers.

Upward lifts now compress the **headroom**: `100 − (100 − p)/lift`. Strictly
increasing in both arguments, so within-club order is preserved exactly; the
ceiling is approached and never reached; identical to the old form at lift = 1,
so a quiet clock is untouched. Distinct values 1 → 17, and demand transfer
strengthened as a result (Cowboys jerseys +58% → +71%).

Downward lifts stay multiplicative — damping runs away from the ceiling, so it
never saturates.

---

## Part 4 — events cannot leak between simulation arms

Asked for as a confirmation; delivered as a runnable check rather than a
paragraph. `src/sim/clock.test.ts`, 9 tests. Three routes existed, each closed
structurally:

| Leak route | Closed by | Test |
| --- | --- | --- |
| Mutable catalog array shared between arms | `applyMarketEvents` clones every product it touches | ids survive, `movedFrom` set, untouched products still shared |
| Roster mutated in place by a trade | `rosterAt` folds into a fresh table; `TEAMS` never written | `t1.Cowboys.push(...)` probe |
| Seasonality curve written through | `LEAGUE_SEASONALITY` frozen at both levels | `assert.throws(..., TypeError)` |

The end-to-end test builds two complete worlds from two clocks, asserts they
disagree down to the co-order graph, and asserts `activeClock()` is untouched by
either. It costs ~11s of the suite; worth it, since it is the only test that
would catch a regression in the property the whole market layer rests on.

---

## Gates

| | |
| --- | --- |
| `npm run lint` | clean |
| `npm test` | 29/29 (20 existing + 9 new) |
| `npm run sim:eval` | **byte-identical** to before this PR |
| `npm run build` | clean |

`sim:eval` holds because on a quiet clock `teamDemand`/`departmentDemand` return
exactly 1, `seasonality(league, DEFAULT_CLOCK)` is exactly the old
`LEAGUE_SEASONALITY[league][8]`, and `applyMarketEvents` returns its input array
untouched having consumed no RNG. Verified by stashing and diffing, not assumed.

`src/sim` and `src/ml` remain free of React and DOM imports.

---

## UI

- `MarketDeck` on the demo strip — seven buttons, TRADE first, clock chip,
  rebuild state, reset, and a context strip previewing what each will do.
- Market entries in the Decisions stream are marked **"not shopper-caused"** —
  the one entry in that stream no shopper action produced. Mechanism →
  consequence → number still holds; the mechanism is the market.
- `ProductCard` carries a market badge above the merchandising badge;
  `ProductDetailPage` gets a full-width notice naming the old club and the exact
  lift, labelled *Simulated market event*.
- `badge` is deliberately **not** overwritten by a trade. It is the
  merchandising flag (Best Seller / Sale / Just Dropped); `marketFlag` states
  the market fact more precisely, and clobbering one with the other loses
  information the storefront already had.
