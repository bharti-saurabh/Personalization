# Effort, not money

Every claim in this repo up to now has been about accuracy. This PR adds the other
argument: **how much work the shopper had to do**, measured three ways — one shopper on
screen, the whole population in a harness, and the live session in a ledger.

Nothing added here produces a currency figure, an ROI number or a revenue lift. That is a
deletion as much as a constraint: `PersonalizationComparison.tsx` and its
`ILLUSTRATIVE_FUNNEL` — which ended on `Average Order Value | $88 → $104` — are gone, not
relocated. A made-up revenue figure next to a page of real arithmetic devalues the
arithmetic, and it is the one number in this demo nobody could check.

---

## 1. The twin store race — `src/components/storefront/TwinStoreRace.tsx`

Replaces the old ON-vs-OFF comparison in the same deep-dive slot.

Two grids. Left ranked by the intent engine, right by sales volume — which is what this
storefront genuinely serves with personalization off. Same shopper, same seed, same
798-product catalog. A **Step** control advances both by one shopper action, driven by the
choice model from `src/sim/choice.ts`: examine or not, click or scroll past, add or abandon.

**The target is stated in plain words before anything moves** — *"wants a men's Eagles
jersey, size XL, under $170"* — read off the shopper's **held-out purchase**, which no
engine on either side can see. A grid filling up is illegible until you know what you are
looking for; naming the target first is what turns every tile into a hit or a miss.

**Counters above each pane**, live as you step: steps taken, items seen before the first
genuinely relevant one, dead ends, scroll depth, and whether the target was reached and on
which step. They are *derived from the trace* (`countersAt`) rather than accumulated in
state, so scrubbing backwards gives exactly the numbers stepping forwards gave. A Step
control the user cannot reverse is one they will not trust.

**Both arms walk the same pre-drawn random numbers.** The shopper's luck is identical on
both sides; the only variable in the race is the ordering.

### The race is not rigged

Five shoppers on the strip, selected to span the outcomes. Two are races personalization
**loses**, and they are labelled as upsets — from the traces on screen, not by hand:

| Shopper | Confidence | Personalized | Popularity | |
|---|---|---|---|---|
| `cust-3859` | 78% | step 3 | step 20 | confident and correct |
| `cust-1474` | 84% | step 45 | **step 1** | **upset** — confident and wrong |
| `cust-82` | 79% | **never** | **step 3** | **upset** — never surfaces the target |
| `cust-2260` | 28% | step 1 | step 39 | below the gate, right anyway |
| `cust-10` | 22% | step 2 | never | below the gate; only this arm finds it |

Selection is editorial and disclosed on screen. The population rate is on the record: the
control arm reaches the target first in **5.3%** of races.

---

## 2. Population effort metrics — `src/ml/counterfactual.ts`, `npm run sim:effort`

Beside `evaluate.ts`, behind its own script so `sim:eval` does not get slower. Paired arms,
same shoppers and seeds in both. 6,000 shoppers, 3,040 with a held-out purchase to aim at.
Bootstrap 95% intervals, 2,000 iterations, resampled **over shoppers rather than sessions**
because the shopper is the pairing unit.

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

Labelled as **counts of shopper effort in a simulated world**, exactly as the existing
offline accuracy metrics are labelled.

**Rows that need reading together, and the CLI says so on screen:**

- **Steps to target (`~`)** conditions on *both* arms reaching, which selects the easy
  targets. n drops to 40 and the control looks level — while reaching the target far less
  often, which is the row directly above it.
- **Catalog surfaced (`!!`)** goes against personalization and stays in the table. It also
  saturates: union-of-everything-shown reaches 100% for any ranker at population scale.
  **Impression concentration** is published beside it as the reading that carries the real
  cost — 36% of impressions on the top decile against popularity's 15%. Added, not swapped
  in; the requested metric is still there.
- **The gate row** is a single-arm diagnostic, not a paired comparison, and is separated
  from the table for that reason.

### Three methodological bugs the audit caught

The first version had the control arm winning almost every row. That is a signal to audit
the setup, not a finding to publish. Each fix is documented in-code at the decision site:

1. **The candidate pool was the focus club's assortment**, reused from `simulateSession`.
   That models a shopper who has *already* navigated to their club's page — handing the
   control arm the single hardest thing personalization has to guess. Pool is now the whole
   catalog. This is the load-bearing comment in the file.
2. **First-relevant required a click**, collapsing n to 54 and turning a question about the
   grid into a question about the click model. It fires on *examination* now; the target
   still requires a click, and the asymmetry is documented.
3. **`seenBeforeFirstRelevant` fell back to total seen** when nothing relevant was found,
   silently mixing "seen before finding it" with "seen, never found it" — which made that
   row contradict the row above it. Now `number | null`, conditioned, with denominators
   published so the conditioning is visible.

---

## 3. The per-session effort ledger — `src/ml/effort.ts` → Experience tab

`effort.ts` shipped with real types and real arithmetic and nothing writing to them. It is
instrumented now, by the surfaces that actually make the decisions:

| Surface | Records |
|---|---|
| Home category rail | `Jerseys` — position 9 unpersonalized → position 2 personalized |
| Home team rail, picked-for-you rail | against market size and against sales rank |
| PLP facet rail | where a facet sat, against where the funnel alone would have put it |
| PLP result grid | where the clicked product sat, against sales rank, counted in rows |
| PLP size facet | prefilled size L from the profile — one facet interaction avoided |
| PDP *Complete the look* | withheld 2 of 4 slots — the co-order graph had evidence for two |

### Rank moves are recorded on click, not on render

On render the page only knows it re-ordered a rail, so any saving it claimed would be a
claim about its own prediction — *"we put what we predicted at the top"* — true by
construction, worth nothing. On click it knows what the shopper came for, because they just
took it, and both positions are countable off the same screen.

### The session-end total is paired, not replayed

The brief asks for "the same session replayed unpersonalized". A literal replay is the
weaker claim: the unpersonalized shopper lands somewhere else at the first click, and by
step four the two sessions are not comparable and the diff is a guess. So every entry is
paired **at the moment of the decision** — both orderings computed from the same inputs in
the same render. Summed, those pairs *are* the session replayed unpersonalized, decision by
decision. The honest cost, stated on the tab: it counts only decisions the shopper actually
reached.

### Entries can go the other way

When the model reads a shopper wrong it pushes their target *down*, and `rankMove` returns
that as effort **incurred**, same units, same ledger. A ledger that can only count savings
is an advert.

### Other decisions worth flagging

- **New kind `suppressed_impression`** — the only kind that is exclusively a saving, because
  a shopper cannot perform it. It exists because the PDP complement rail is the one surface
  where the gate genuinely *removes* impressions rather than swapping them: the
  un-personalized rail always fills four from a price sort, the personalized one serves only
  what survives the hard rules.
- **Positions convert to rows before they are counted.** A shopper does not experience "nine
  slots", they experience two rows of scrolling. Counting raw positions would let a wide
  rail claim a saving of twelve for one flick of the wrist.
- **The size prefill has three guards** — profile confidence must clear the same activation
  gate every other surface uses; the size must exist in the current result set (prefilling
  into zero results manufactures the exact dead end the ledger claims to remove); and it
  fires once per department, so clearing the chip clears it for good. A filter that
  reapplies itself is not a convenience, it is a fight.
- **IDs are the dedupe key**, which is what makes `recordEffort` safe to call from a render
  effect. Without it, hovering the panel would inflate the totals.
- **Real vs benchmark is stated on the tab.** The counts are real. The conversion to seconds
  is a simulated benchmark and stays marked as one — a click is countable, the seconds it
  costs a person are not something this demo has measured.

---

## Tests and gates

`src/ml/effort.test.ts` asserts the four properties the surfaces depend on: a decision that
moved nothing produces no row; a decision that went the wrong way produces a cost; positions
are counted as rows rather than raw slots; the un-personalized column is exactly the sum of
the paired diffs.

- `npm run lint` — clean
- `npm test` — **35/35** (29 existing, unchanged, plus 6 new)
- `npm run sim:eval` — **unchanged numbers**. `counterfactual.ts` is a new module; nothing
  in the evaluation path reads it.
- `src/sim` and `src/ml` remain free of React and DOM. `counterfactual.ts` and `effort.ts`
  both run under `tsx` from the command line.
- `npm run build` — clean; the race screen is lazy-loaded like every other deep dive.

## Files

**New** — `src/ml/counterfactual.ts`, `src/ml/effort.test.ts`, `scripts/effort.ts`,
`src/components/storefront/TwinStoreRace.tsx`
**Deleted** — `src/components/storefront/PersonalizationComparison.tsx`
**Widened, no behaviour change** — `src/sim/behavior.ts` (five exports),
`src/ml/evaluate.ts` (`asScenario` made public, leakage guard intact)
