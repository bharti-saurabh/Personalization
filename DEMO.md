# Running the demo

Two scripted paths over the same build. The five-minute path is for a business
audience and never opens a model screen. The fifteen-minute path is the same
five minutes, unchanged, followed by ten minutes of the machinery underneath —
so a mixed room can be given the first half and then asked whether they want the
second.

Both are written keystroke by keystroke, with a running clock in the left column
and what to say beside what to click. The timings are the ones the paths were
rehearsed at; they are not a budget you have to hit, but if you are more than a
minute over at a checkpoint, drop the marked optional beats rather than rushing
the two marked moments.

**Two moments are marked.** They are the beats the demo is built around, and
they are the ones to protect if you are running short:

- ⭐ **The twin store race** — business path, 03:15. Two stores, one shopper,
  one held-out target, stepped to completion.
- ⭐ **The trade event** — both paths, 04:15 and again in the technical path's
  own terms. The world changes underneath a live session and the recommendations
  move with it.

---

## Before you start

```bash
npm install       # first time only
npm run dev       # http://localhost:3000
```

Open the browser at **1440×900 or wider**. Below about 1280px the intelligence
panel hides itself and half of what you are about to point at is off screen.

Reset to a clean state between runs: reload the page, then in the top strip set
**Shopper → Anonymous**, **Identity → Anonymous**, and if you fired an event in
a previous run press **Reset** at the right of the Market row. A reload alone is
not enough — the profile persists across reloads on purpose.

Have this open in a second tab, not a second window, and do not present from a
tab you have been clicking around in. The demo's whole claim is that the profile
is built from what the shopper did, and a profile with your rehearsal in it will
show it.

---

# Five minute business path

**Audience:** commercial leadership. **What they should leave with:** the store
personalizes before it knows who you are, the profile fills as you browse, it
fills again the moment identity arrives, personalization is measurable against
its own control, and the whole thing survives the world changing underneath it.

**No model screen is opened on this path.** If someone asks how it works, the
answer is "there's a fifteen-minute version of this that shows you — do you want
it?"

### 00:00 — Land anonymous

| Time | Do | Say |
|---|---|---|
| 00:00 | Page is on **Storefront**, **Home**. Top strip reads **Shopper: Anonymous First-Time Visitor**, **Identity: Anonymous**. | "This is a sports merchandise store. Nobody has logged in. There is no cookie, no email, no account. Watch what it does anyway." |
| 00:10 | Point at the **Identity** row in the top strip — five rungs, the first one lit. | "Five rungs of knowing who someone is. We're on the first. Most personalization decks start on the fifth." |
| 00:20 | Click **Identity → Contextual**. | "All that's changed is that we read the request. Time of day, region, referrer. Nothing about this person." |
| 00:35 | The home page redraws. Point at the hero and the **Picked for…** rail. | "The store just re-merchandised itself on a context read. That's not a recommendation engine yet — it's the store refusing to show everyone the same front page." |
| 00:50 | Open the right panel if hidden (**Behind the Scenes**, bottom right). Click the **Profile** tab. | "This is what it believes so far. Note the confidences — they're low, and it says so. It is not pretending." |

**Checkpoint 01:00.** If you are over, skip the Contextual rung next time and
land straight on the browsing beat.

### 01:00 — Click two items and watch the profile fill

| Time | Do | Say |
|---|---|---|
| 01:00 | Top strip: **Catalog**. | "Now they browse. Nothing else." |
| 01:10 | Click any **Eagles** product tile. | — |
| 01:20 | On the product page, point at the **size box** under the size ladder. | "It's already picked a size, and told you how sure it is and why. Notice it hasn't hidden the sizes it thinks are wrong — they're struck through, not removed." |
| 01:35 | Hover the **Low Stock** or **Save $** badge. | "Every merchandising badge carries the population statistic behind it. This isn't a sticker; it's a number with a cohort under it." |
| 01:50 | Right panel → **Profile** tab. Point at the team affinity bar. | "One click. The club posterior moved and the confidence moved with it." |
| 02:00 | Back to **Catalog**, click a second **Eagles** product — a different department if you can (hat, or a tee if the first was a jersey). | "Second click." |
| 02:15 | Right panel → **Profile**. | "Two clicks in and it has a club, a department, and a size — each with its own confidence, each decaying on its own clock. Still nobody has logged in." |
| 02:30 | Right panel → **Decisions** tab. Scroll the top two entries. | "And every one of those is on the record. What ran, what it scored, which rule fired, what got rendered. Not a log — a receipt." |

**Checkpoint 02:45.**

### 02:45 — Promote to identified

| Time | Do | Say |
|---|---|---|
| 02:45 | Top strip: **Identity → Identified**. | "Now they give us an email at checkout. Watch the profile, not the store." |
| 02:55 | Right panel → **Profile**. Point at the highlighted changes. | "It didn't patch the profile — it re-folded the whole session against the richer seed. Order history arrives and the session's clicks get replayed against it." |
| 03:05 | If a confidence went **down**, point at it. | "That field got *less* certain. That's the honest answer — the CRM says one thing and this session says another, and it's showing you the argument instead of picking a winner." |

**Checkpoint 03:15.** This is the beat before the first marked moment. If you
are behind, cut the badge hover at 01:35 and the Decisions tab at 02:30 next
time — never this.

### ⭐ 03:15 — The twin store race

> **MARKED MOMENT.** This is the number the room will repeat afterwards. Give it
> the full sixty seconds and do not talk over the stepping.

| Time | Do | Say |
|---|---|---|
| 03:15 | Left rail → **Twin Store Race**. | "Two stores. Same shopper, same catalog, same 798 products. One ranks by personalization, one ranks by what sells." |
| 03:25 | Point at the dark bar at the top — the target. | "This shopper's real intent, read off a purchase neither store can see. Both have to find it." |
| 03:35 | Press **Step** four or five times, slowly. Let the grids fill. | *(say nothing for the first two)* "…left is finding it. Right is showing bestsellers to someone who isn't a bestseller shopper." |
| 03:55 | Press **Play**, let it run to the end. | "Products seen before the first relevant one. Dead ends. Scroll depth. That's the cost of getting it wrong, counted rather than asserted." |
| 04:05 | **Optional, only if you are on time:** click shopper **cust-1474** in the cast row and press **Play** again. | "And here it loses. Confident and wrong — the popularity grid wins outright. It's in the demo because a personalization demo where the model always wins is a sales deck." |

**Checkpoint 04:15.** Cut the 04:05 beat if you are over — but say the sentence
anyway, without clicking.

### ⭐ 04:15 — The trade event

> **MARKED MOMENT.** Present this from the storefront, not from a model screen.

| Time | Do | Say |
|---|---|---|
| 04:15 | Left rail → **Storefront**. Top strip → **Product** (any Eagles jersey on screen). | "One last thing. Everything you've seen assumes the world holds still." |
| 04:25 | Top strip, **Market** row → click **Trade**. Do not click away while it rebuilds. | "Jalen Hurts has just been traded to the Cowboys. That takes a couple of seconds because it isn't a banner — it's rebuilding the catalog, re-simulating the population and re-estimating the co-occurrence graphs." |
| 04:45 | The page redraws. Point at the product, then at the rails below it. | "The jersey moved clubs. The demand moved with the name, not with the crest. And the recommendations under it are different, because the graph they're drawn from is different." |
| 04:55 | Hover the **Simulated market event** chip. | "Every one of those is labelled. None of this is a real trade, a real player, or a real number — the machinery is real and the data is invented, and the demo says so on every surface that could be mistaken for a market figure." |
| 05:00 | Stop. | "That's the five minutes. There's a version of this that opens every box — say the word." |

---

# Fifteen minute technical path

**Audience:** data science, engineering, and anyone who is going to be asked
whether this is real. **Structure:** the five-minute path exactly as above,
unchanged, then five screens.

**Run 00:00–05:00 exactly as written above.** Do not compress it — the model
screens are much harder to follow without the storefront beats behind them, and
the technical audience is the one most likely to notice if the twin store race
was skipped.

### 05:00 — Model Registry

| Time | Do | Say |
|---|---|---|
| 05:00 | Left rail → **Model Registry**. | "Eleven models. Every one of them with the same five columns, and the columns are the ones usually missing." |
| 05:15 | Point across the column key. | "What it writes. The decay on that field. The bar it has to clear. Its offline number. When it last ran — in the session you just watched." |
| 05:30 | Point at a row where **Writes** says *nothing*. | "The retrieval engines write nothing to the profile. That's deliberate and it's on screen, because two models fighting over one field is how a profile starts disagreeing with itself." |
| 05:45 | Click **Run offline harness**. It takes a moment. | "The metrics aren't baked in. A table of numbers shipped in a file isn't evidence — this re-runs on the same synthetic population every other screen reads." |
| 06:00 | Point at a card whose **Metric** column reads *none — see below*. | "Four of them have no offline metric, and each says why. 'No number' and 'we didn't look' are different admissions and this column never blurs them." |
| 06:15 | Point at the **Last fired** column — some rows say *step N*, some say *not yet*. | "The engines report through the decision journal. The gates don't have a journal step of their own, so they report through the effort ledger — one function, one definition, so this column is comparable down its whole length." |
| 06:35 | Expand any row — click it. Scroll to **Live feature vector**. | "And that's the actual vector, read out of the live profile, right now, with the path each value came from. Not a schema. The values." |

**Checkpoint 07:00.**

### 07:00 — Recommendation Lab, gate pushed until the rail empties

| Time | Do | Say |
|---|---|---|
| 07:00 | Left rail → **Recommendation Lab**. | "This is the same retrieval and the same gate the storefront runs, with the inputs exposed." |
| 07:10 | Point at the funnel: **Catalog → After constraints → Above the gate → After suppression → Returned**. | "Five stages, and each is a count you can check against the one beside it." |
| 07:25 | Drag **4 · Confidence gate** slowly right: 0.50 → 0.65 → 0.80. Watch the funnel narrow. | "As I raise the bar, the pool above it shrinks. Nothing surprising yet." |
| 07:45 | Keep going: **0.90 → 0.95**. The rail empties. | "And there it is. Push it far enough and the rail is empty — and it stays empty. It does not backfill with something weaker to save face." |
| 08:00 | Point at the empty slots. | "That's the whole argument about thresholds. Raising a bar doesn't trade accuracy against nothing; it trades a weak recommendation against an absent one, and the only way to have that conversation honestly is to show the absence." |
| 08:15 | Drag back to about **0.60**. Point at **After suppression** if the count differs from **Above the gate**. | "And these were removed by a *rule*, not by a score — rivalry, fatigue, something they already own. Different reason, different column." |

**Checkpoint 08:30.**

### 08:30 — Lifecycle Triggers

| Time | Do | Say |
|---|---|---|
| 08:30 | Left rail → **Lifecycle Triggers**. | "Everything so far happens while the shopper is standing there. This is the part that runs after they leave, into a channel they didn't ask to be in." |
| 08:45 | Point at the two channel cards. | "Email opens at the identified rung, SMS only at member — because that's the only rung where a verified mobile number lives. A demo that texts a cookie is describing a compliance incident." |
| 09:00 | Point at the counts: fired / held / dormant. | "Seven triggers. The ones that fired are the least interesting row on this screen." |
| 09:10 | Expand a **held** trigger. Point at the full gate walk. | "Every rule, in order, including the ones that passed. A rule you can't watch pass is a rule you can't trust is there." |
| 09:30 | Drag the **Local hour** slider into the small hours. Verdicts change live. | "Quiet hours are per channel, in the shopper's own local time. Email waits in an inbox; SMS makes a noise at two in the morning." |
| 09:45 | Click the **email n/2** button until it caps. | "Frequency caps. And if this visitor hashes into the ten percent holdout, nothing sends at all regardless of what qualified — that's the control arm, and it's assigned by hash so it's the same on every render." |
| 10:00 | Scroll to a trigger's **Content gate** block. | "And the products in the message go through the same suppression gate the on-site rails use — at a higher bar, because there's no next tile to scroll to in an email." |

**Checkpoint 10:15.**

### 10:15 — Model Evidence

| Time | Do | Say |
|---|---|---|
| 10:15 | Left rail → **Model Evidence**. | "Held-out evaluation. Every engine against a stated baseline." |
| 10:30 | Scroll to the **Department Intent** panel. Read the note. | "This is the most important paragraph in the build, and it's an admission. Department intent went from the weakest engine at 1.12× to the second strongest — and *nothing in the engine changed*." |
| 10:50 | Point at the two numbers in the note: **18.3%** and **43.3%**. | "The target became learnable. The old harness drew a purchase anchor near-arbitrarily from the catalog's department mix, so it matched the shopper's own preferred department 18% of the time. Now shoppers choose what they cart, and it's 43%. The old number was measuring a broken question, not a broken model." |
| 11:10 | Scroll to the **Harness A / Harness B** section. | "Which is why both harness definitions are on this screen, side by side, rather than one number replacing the other quietly." |
| 11:25 | Point at each definition in turn. | "Harness A: every click sampled independently from a stable lifetime affinity, cart add a uniform coin. Harness B: a calibrated choice model with session-level department intent. Same harness code. Different meaning of the label it scores against." |
| 11:45 | Say the line straight. | "That improvement must not be reported as a modelling improvement, and this screen exists so that nobody in this room can accidentally do it. If you take one thing from the technical half, take that." |
| 12:00 | Point at the similarity panel's caveat. | "Same discipline there — part of that gain is the encoder re-reading structure the simulator made more obvious." |

**Checkpoint 12:15.**

### ⭐ 12:15 — The trade event, in technical terms

> **MARKED MOMENT, second telling.** They have already seen it move the
> storefront. This time show what it moved *under* the storefront. If the trade
> was already fired during the business half, press **Reset** on the Market row
> first, then re-fire.

| Time | Do | Say |
|---|---|---|
| 12:15 | Left rail → **Storefront**. Right panel → **Decisions**. | "You saw the trade change the shop. Here's what it actually did." |
| 12:25 | Top strip, **Market** row → **Trade**. | "Watch the panel, not the page." |
| 12:40 | While it rebuilds. | "That pause is 798 products being rewritten, a 14,000-shopper population re-simulated, and three co-occurrence graphs re-estimated. It is not a filter over a static catalog." |
| 12:55 | Point at the new entry at the top of **Decisions**. | "New beat in the journal. The world moved, and the record says so before any recommendation changed." |
| 13:10 | Left rail → **Model Registry**. Click **Run offline harness** again. | "And the offline numbers move too, because they're measured against the population that just changed. A metric that survives a trade unchanged is a metric that wasn't reading the world." |
| 13:25 | **Optional:** left rail → **Twin Store Race**, press **Play**. | "The race re-runs in the new world as well. Same shopper, different catalog." |

**Checkpoint 13:35.**

### 13:35 — System Architecture

| Time | Do | Say |
|---|---|---|
| 13:35 | Left rail → **System Architecture**. | "Last screen. Everything you've seen runs in a browser tab with no backend, no API key and no network call. That's a constraint of the demo, not a proposal." |
| 13:50 | Walk the diagram left to right. | "This is what it looks like built for real — where the feature store sits, where the profile fold becomes a streaming job, which of these engines is a batch artefact and which is a request-path call." |
| 14:10 | Point at the components that map one-to-one onto what they just saw. | "The registry screen you opened is the model registry. The effort ledger is a metrics pipeline. The decision journal is your audit log. None of these are new boxes drawn for the diagram — each one is a file in this repo." |
| 14:30 | Close on the honest note. | "What's real here is the architecture, the thresholds, the gates and the arithmetic. What's invented is the catalog, the population and every number they produce. Point at any figure on any screen and it will tell you which of the two it is." |
| 14:50 | Stop. | "Fifteen minutes. Questions." |

---

## If you have less time than the path you picked

Cut in this order. Everything above the line is protected.

1. Business path 04:05 — the losing shopper in the twin store race *(say it, don't click it)*
2. Technical path 13:25 — the race re-run after the trade
3. Technical path 12:00 — the similarity caveat
4. Business path 01:35 — the badge hover
5. Business path 02:30 — the Decisions tab

— **do not cut below this line** —

6. ⭐ The twin store race
7. ⭐ The trade event
8. The department-intent note at 10:30, on the technical path

## If you are asked a question the demo does not answer

Three that come up every time, with the honest answer:

**"Are these real models?"** No, and they are not meant to be — a model is only
as good as the dataset under it and this dataset is synthetic. What is real is
the architecture, the thresholds, the gates, the decay constants and the
arithmetic. Every screen that shows a number says which of the two it is.

**"Could you run this on our data?"** That is the System Architecture screen and
it is the right conversation to have next. The engines are already isolated from
the UI — `src/ml` and `src/sim` have no React or DOM dependency in them at all,
and the evaluation harness runs from the command line without a browser.

**"What happens when the model is wrong?"** Twin Store Race, shoppers
**cust-1474** and **cust-82**. Both are in the cast because they beat the
personalized store, and they are in the demo on purpose.
