/**
 * Refusal, made as legible as recommendation.
 *
 * Every recommender in this prototype can already say why it showed something.
 * None of them could say why it DIDN'T, and that asymmetry is not cosmetic - it
 * is where most of the trust in a personalized store is actually won or lost. A
 * shopper who is shown a rival club's jersey does not conclude that the ranker
 * is imperfect; they conclude that nobody is home. The fix is not a better
 * score. It is a rule, stated out loud, that fires before the score is
 * consulted at all.
 *
 * So this module is a gate, not a ranker. It takes candidates something else
 * retrieved, applies four rules in a fixed order, and returns both what
 * survived and - in equal detail - what did not and under which rule. The
 * second half of that return value is the point of the module. Nothing here
 * re-scores for relevance; that already happened upstream.
 *
 * THE FOUR RULES, in the order they run and for the reason they run in it:
 *
 *   1. recent_purchase   You own it. Cheapest to check, most obviously right,
 *                        and it applies whether or not we know your club.
 *   2. rivalry           A hard exclusion for a high-confidence loyalist. Runs
 *                        before any scoring because no score should be able to
 *                        buy a Cowboys jersey its way onto an Eagles fan's
 *                        home page.
 *   3. fatigue           You have been shown this repeatedly and did not click.
 *                        DEMOTES first and only excludes past a ceiling, because
 *                        "not yet" is a different claim from "never".
 *   4. confidence_floor  What is left has to be good enough for the specific
 *                        slot it would land in.
 *
 * WHY SUPPRESSION NEVER TOUCHES A RESULT SET. These rules apply to slots the
 * STORE chose to fill - a hero, a carousel, a cross-sell rail. They do not apply
 * to a category grid or a search result page, because those contain what the
 * SHOPPER asked for, and a store that quietly deletes rows from a result set
 * the shopper specified is not exercising judgement, it is lying about its
 * catalog. If an Eagles loyalist filters to Cowboys, they get Cowboys. The same
 * line already governs ranking - personalization decides order, never
 * membership - and this is that line extended to refusal.
 *
 * PER-SURFACE THRESHOLDS. A confidence bar is not one number. A hero image is
 * the entire first impression of the page and it is wrong in public; the fourth
 * tile of a carousel is a guess the shopper can scroll past for free. Those two
 * slots should not demand the same evidence, so a policy carries a threshold
 * for its first slot and one for its last, and every slot between them is
 * interpolated. The consequence is deliberate and visible: a surface can serve
 * three tiles where it has room for eight, and says so.
 *
 * WHAT IS CLAIMED AND WHAT IS NOT. Every suppression is countable - a named
 * product, a named rule, a stated number it was compared against. What is NOT
 * claimed is that any withheld product would have gone unsold. This module
 * measures impressions the shopper did not have to sort through, and prices
 * them in ml/effort.ts at three seconds and no click, which is the cheapest
 * thing on that ledger. Refusal is worth stating and worth counting; it is not
 * worth inflating.
 *
 * No React, no DOM: the harness runs this.
 */

import { Product, TeamId } from '../types';
import { isRepurchasable, rivalsOf } from '../sim/taxonomy';
import type { VisitorProfile } from './profile';
import { saving } from './effort';
import type { EffortEntry, EffortPage } from './effort';

/* ------------------------------------------------------------- constants -- */

/**
 * How sure we have to be that this is your club before we refuse you another.
 *
 * Two terms, and both are required, because they fail in different directions.
 * The POSTERIOR can be high on almost no evidence - one click gives a peaked
 * distribution over six clubs - and the CONFIDENCE can be high on a genuinely
 * split shopper who buys for two households. Refusing to show a club is a
 * strong action, so it takes agreement from the two readings that disagree
 * most often.
 *
 * BOTH NUMBERS ARE PINNED TO A NAMED SCENARIO, and that is the only reason to
 * trust them. The first draft of this pair was 0.55 / 0.6, chosen by eye, and
 * the second number was on the wrong scale entirely: `distConfidence` returns
 * `sufficiency * top * (0.5 + 0.5 * marginRatio)`, a product of three sub-unit
 * terms, so 0.6 sits near its practical ceiling. No demo shopper ever reached
 * it and the rivalry rule could not fire for anyone. The unit tests missed it
 * because their fixtures set the posterior and the confidence directly instead
 * of folding events. The floors below were measured against profiles folded
 * from the five demo scenarios at all five identity rungs:
 *
 *   admitted   Returning Eagles Fan   post 0.796-0.883   conf 0.363-0.817
 *              Hot-Market Shopper     post 0.920-0.983   conf 0.595-0.925
 *   refused    Anonymous visitor      post 0.712         conf 0.263
 *              Multi-Team Shopper     post 0.458-0.639   conf 0.221-0.544
 *              Low-Confidence         post 0.415-0.565   conf 0.169-0.369
 *
 * POSTERIOR 0.75 is set by the Multi-Team Shopper, who tops out at 0.639 even
 * as a known member. That shopper buys across clubs, and suppressing a rival
 * for them is the precise failure this rule has to avoid. Confidence alone
 * cannot separate them - their 0.544 as a member sits above the Eagles fan's
 * 0.363 on arrival - so the posterior has to carry that call.
 *
 * CONFIDENCE 0.35 is set by the Anonymous visitor, who reads posterior 0.712
 * off a single event. One click is not a club. The posterior floor already
 * excludes them at 0.712, and the confidence floor excludes them again at
 * 0.263 - deliberate overlap, because a suppression the shopper cannot see is
 * worse to get wrong than a recommendation they can.
 */
export const LOYALIST_POSTERIOR_FLOOR = 0.75;
export const LOYALIST_CONFIDENCE_FLOOR = 0.35;

/**
 * How bitter a rivalry has to be to justify censoring a catalog.
 *
 * Set above the Cowboys/Chiefs edge in the taxonomy and below the 76ers/Lakers
 * one, on purpose. A rivalry graph whose every edge fires is not a graph, it is
 * a list of other teams.
 */
export const RIVALRY_SUPPRESSION_FLOOR = 0.5;

/**
 * Impressions-without-a-click at which a product stops being demoted and starts
 * being withheld.
 *
 * Four is a judgement call and it is worth naming as one. The demotion curve
 * below already pushes a thrice-ignored product most of the way down any rail;
 * the ceiling exists for the case where it is the only candidate the graph has,
 * and would otherwise sit at position one forever on the strength of having no
 * competition.
 */
export const FATIGUE_CEILING = 4;

/**
 * Shape of the demotion.
 *
 * `multiplier = exp(-FATIGUE_LAMBDA * shows)`, so one ignored impression costs
 * a candidate about a ninth of its score, two about a fifth, three a little
 * over a quarter. Multiplicative rather than subtractive so a strong candidate
 * survives an ignored showing and a marginal one does not - which is the
 * ordering a merchandiser would choose by hand.
 *
 * THE DEMOTION MUST NOT DO THE CEILING'S JOB. This was 0.45, which cost a
 * candidate 36% on the first unclicked showing - enough to push a perfect 1.0
 * below the second slot's bar on the similar rail. The rule then had two ways
 * to remove something and the distinction it is named for, "not yet is not
 * never", was not observable: nothing was ever demoted, things simply
 * disappeared one showing sooner than FATIGUE_CEILING says they should. At
 * 0.12 a candidate at the top of its rail is reordered by the first two
 * showings and removed by the ceiling at the fourth, which is the behaviour
 * the constant above describes.
 */
export const FATIGUE_LAMBDA = 0.12;

/**
 * How long owning something suppresses it.
 *
 * A calendar window rather than an event window, because this rule is about the
 * shopper's life and not their session. Roughly a season: long enough that the
 * jersey you bought in September is not re-sold to you in November, short
 * enough that last year's is fair game.
 */
export const RECENT_PURCHASE_WINDOW_DAYS = 120;

/**
 * Gift-intent above which "you already own this" stops being a reason.
 *
 * Someone shopping for another person can buy the same item twice, and the
 * strongest evidence a retailer holds for that is orders that shipped to a
 * different address. Above this the exclusion is lifted rather than softened -
 * a half-suppressed gift is the worst of both readings.
 *
 * IT SITS ABOVE THE MIDPOINT, AND THE MIDPOINT IS NOT A READING. An unobserved
 * scalar trait starts at 0.5 in this codebase, and `createProfile` is explicit
 * that this means "not yet observed" rather than "average shopper". The first
 * draft of this constant was 0.45, which meant every cold visitor read as a
 * gift buyer and the ownership rule could never fire for anyone the system had
 * not already watched. `giftObserved` on the context is the other half of the
 * fix: the value is only consulted once something has actually moved it.
 */
export const GIFT_OVERRIDE = 0.6;

/* -------------------------------------------------------------- policies -- */

export type SuppressionRule = 'recent_purchase' | 'rivalry' | 'fatigue' | 'confidence_floor';

export const RULE_LABEL: Record<SuppressionRule, string> = {
  recent_purchase: 'Already owned',
  rivalry: 'Rival club',
  fatigue: 'Shown and ignored',
  confidence_floor: 'Below this slot',
};

/**
 * One surface, and what it costs to be wrong on it.
 *
 * `slots` is capacity, not a promise - a surface that cannot fill them serves
 * fewer. `lead` and `tail` are the confidence the first and last slot demand;
 * everything between is interpolated by `thresholdAt`.
 */
/**
 * The engine whose score a surface's thresholds are expressed in.
 *
 * THIS FIELD EXISTS BECAUSE THE FIRST DRAFT DID NOT HAVE IT. Every threshold in
 * the table below was originally a bare number, and the table read as though
 * one bar applied across the store. It does not. `similarity` is a cosine and
 * lives in 0.59-1.0; `complement` is a conditional probability with a median
 * around 0.24 and a long tail near zero. The same 0.5 that is a forgiving bar
 * on one is an impossible bar on the other - and it was: `pdp_complement` sat
 * at 0.50 and refused every candidate it was ever handed, emptying the
 * complete-the-look rail for every shopper, while `pdp_similar` sat at 0.45,
 * below the floor of its own engine's range, and refused nothing ever.
 *
 * Naming the scale does not by itself prevent that. The test in
 * `suppression.test.ts` that asserts each policy's thresholds fall inside the
 * measured operating range of the engine named here is what prevents it.
 */
export type ScoreScale = 'intent_posterior' | 'popularity' | 'similarity' | 'complement';

export interface SurfacePolicy {
  id: string;
  label: string;
  /**
   * Where the surface lives.
   *
   * `offsite` is the lifecycle channels - an email body and an SMS are slots
   * the store fills without the shopper present, and they are the surfaces
   * where a bad pick costs the most, because there is no next tile to scroll
   * to. They are in this table rather than in ml/lifecycle.ts on purpose: the
   * test that asserts no policy sets a bar its own engine cannot clear
   * iterates this object, and a channel exempt from that check is a channel
   * where the calibration bug that emptied `pdp_complement` could happen
   * again unobserved. AppContext filters gates by page, so `offsite` never
   * matches a storefront page and these two never render as on-site rails.
   */
  page: EffortPage;
  slots: number;
  leadThreshold: number;
  tailThreshold: number;
  /** Which engine's score the two thresholds above are denominated in. */
  scale: ScoreScale;
  /** Why this surface's bar sits where it does. Rendered verbatim in the panel. */
  rationale: string;
}

/**
 * The measured operating range of each scale, sampled off the live catalog.
 *
 * Not a guess and not a clamp - a record of what the engines actually emit, so
 * a threshold can be checked against it. `lo` is the floor of the score's
 * observed distribution and `hi` its ceiling. A threshold at or below `lo` is
 * an inert gate; a threshold at or above `hi` is a gate that empties its rail.
 * Both are silent failures on screen, which is why they are loud in the tests.
 */
export const SCALE_RANGE: Record<ScoreScale, { lo: number; hi: number; note: string }> = {
  intent_posterior: { lo: 0.17, hi: 0.99, note: 'softmax over six clubs; demo shoppers span 0.42-0.98' },
  popularity: { lo: 0.56, hi: 0.98, note: 'catalog popularity divided by 100; median 0.80' },
  similarity: { lo: 0.59, hi: 1.0, note: 'cosine over hybrid embeddings; p10 0.68, median 0.86' },
  complement: { lo: 0.008, hi: 1.0, note: 'co-order conditional; p10 0.015, median 0.24, p90 0.63' },
};

/**
 * WHAT AN EMPTY RAIL COSTS, AND WHY EACH BAR SITS WHERE IT DOES.
 *
 * Raising a threshold does not trade accuracy against nothing; it trades a
 * weak recommendation against an absent one. The three rails below were set by
 * measuring how often each empties, running the gate over every one of the 798
 * catalog products as an anchor with a cold profile - so the confidence rule is
 * the only one that can fire and the number is the bar's own doing:
 *
 *   pdp_similar     0.85 / 0.65    6.1% of anchors serve nothing
 *   pdp_complement  0.25 / 0.08    6.3%
 *   cart_crosssell  0.35 / 0.15   15.3%
 *
 * The first two are deliberately matched: the two rails sit side by side on the
 * same page and a shopper should not be able to tell that one is fed by a
 * cosine and the other by a conditional probability. Their raw numbers are far
 * apart because their scales are; their behaviour is not.
 *
 * The cart is deliberately twice as likely to serve nothing, which is the
 * rationale on that policy stated as a measurement rather than an intention.
 *
 * An empty rail here is not a failure state. It renders as a notice saying
 * nothing cleared the bar, which is the entire argument this build is making -
 * that a store which says "we had nothing good enough" is worth more than one
 * that fills the slot regardless.
 */
export const SURFACE_POLICIES: Record<string, SurfacePolicy> = {
  hero: {
    id: 'hero',
    label: 'Homepage hero',
    page: 'home',
    slots: 1,
    leadThreshold: 0.72,
    tailThreshold: 0.72,
    scale: 'intent_posterior',
    rationale:
      'One slot, above the fold, and it is the whole first impression of the store. There is no cheaper position to demote into, so the only options are a confident pick or the seasonal default. 0.72 on the intent posterior is roughly where a shopper stops being multi-club and starts being a fan of one - the only surface on the site that asks for that much before it commits.',
  },
  home_carousel: {
    id: 'home_carousel',
    label: 'Picked for you carousel',
    page: 'home',
    slots: 8,
    leadThreshold: 0.9,
    tailThreshold: 0.72,
    scale: 'popularity',
    rationale:
      'Eight slots the shopper scrolls horizontally on a rail that is not filtered to their club, which makes it the one place on the storefront where a rival can reach a loyalist. The first tile is seen by everyone who loads the page and the eighth by almost nobody, so the bar falls across the rail rather than sitting flat. Both numbers are catalog popularity over 100, whose median is 0.80: the lead tile asks for a top-decile seller and the eighth asks only for an above-median one.',
  },
  pdp_similar: {
    id: 'pdp_similar',
    label: 'Similar items',
    page: 'pdp',
    slots: 4,
    leadThreshold: 0.85,
    tailThreshold: 0.65,
    scale: 'similarity',
    rationale:
      'A substitute rail on a page where the shopper has already named what they want. The anchor carries the context, so a weaker neighbour is still useful. 0.85 is roughly the midpoint of what the cosine actually returns - forgiving in its own terms, even though the number looks severe next to the rail beside it.',
  },
  pdp_complement: {
    id: 'pdp_complement',
    label: 'Complete the look',
    page: 'pdp',
    slots: 4,
    leadThreshold: 0.25,
    tailThreshold: 0.08,
    scale: 'complement',
    rationale:
      'Cross-department companions from the co-order graph. 0.25 is the median of the co-order conditional and 0.08 sits near its 25th percentile, so the lead slot asks for a genuinely common pairing and the fourth asks only that the pairing exist at all. The raw numbers look lenient next to the rail beside them and are not comparable to it: 0.25 on the co-order scale is a stricter ask than 0.85 on a cosine. Read every threshold through its own distribution.',
  },
  lifecycle_email: {
    id: 'lifecycle_email',
    label: 'Lifecycle email',
    page: 'offsite',
    slots: 4,
    leadThreshold: 0.86,
    tailThreshold: 0.7,
    scale: 'popularity',
    rationale:
      'Four product slots in a message the shopper did not ask for, opened hours after the session that triggered it. The evidence has aged and the shopper cannot scroll past a bad pick to a good one, so the lead slot asks for a top-decile seller - a harder ask than any on-site rail makes of the same engine. The tail is deliberately looser than the lead by more than the carousel\'s, because an email with one product in it reads as an apology.',
  },
  lifecycle_sms: {
    id: 'lifecycle_sms',
    label: 'Lifecycle SMS',
    page: 'offsite',
    slots: 1,
    leadThreshold: 0.9,
    tailThreshold: 0.9,
    scale: 'popularity',
    rationale:
      'One product, in a channel the shopper pays attention to and can revoke in one word. There is no second slot to demote into and no cheap impression here, so this is the highest bar the popularity scale carries anywhere in the build. If nothing clears it the message does not send - see ml/lifecycle.ts, where an empty rail is a suppressed send rather than a shorter one.',
  },
  cart_crosssell: {
    id: 'cart_crosssell',
    label: 'Cart cross-sell',
    page: 'cart',
    slots: 3,
    leadThreshold: 0.35,
    tailThreshold: 0.15,
    scale: 'complement',
    rationale:
      'Three slots between a shopper and a checkout button. The cost of a wrong one here is not a wasted impression, it is a reopened decision, so the bar is well above the same engine on the product page.',
  },
};

/** The confidence the slot at `position` demands. 1-based. */
export function thresholdAt(policy: SurfacePolicy, position: number): number {
  if (policy.slots <= 1) return policy.leadThreshold;
  const t = Math.min(1, Math.max(0, (position - 1) / (policy.slots - 1)));
  return policy.leadThreshold + (policy.tailThreshold - policy.leadThreshold) * t;
}

/* --------------------------------------------------------------- context -- */

/**
 * Everything the four rules read, folded out of the profile once.
 *
 * Built here rather than passing `VisitorProfile` to every call site for two
 * reasons. It keeps this module's inputs small enough to construct by hand in a
 * test, and - the practical one - it gives React a single memo dependency that
 * changes exactly when a suppression decision could change, instead of four
 * retrieval sites each depending on the whole profile object and re-running a
 * co-order sweep whenever any unrelated field moved.
 */
export interface SuppressionContext {
  /** False when personalization is off. Every rule stands down; nothing is cut. */
  active: boolean;
  /** The club this shopper is a loyalist of, or null if they are not one. */
  loyalty: { team: TeamId; posterior: number; confidence: number } | null;
  /** Rivals of that club at or above the intensity floor. Empty is a real answer. */
  rivals: { team: TeamId; intensity: number; label: string }[];
  /**
   * Rivals that exist in the graph but sit BELOW the floor.
   *
   * Carried so the panel can show the rule declining to fire, which is the only
   * way a viewer can tell a threshold from a hard-coded list.
   */
  spared: { team: TeamId; intensity: number; label: string }[];
  /** productId -> decayed impressions that were not followed by a click. */
  fatigue: Record<string, number>;
  /** productId -> what we know about the order. */
  purchases: Record<string, { daysAgo: number; gift: boolean }>;
  /** The shopper's gift-intent trait, which lifts the ownership rule. */
  giftIntent: number;
  /**
   * Whether anything has actually moved that trait.
   *
   * False on a cold profile, where the value is a placeholder rather than a
   * reading. The rule consults the number only when this is true - see the note
   * on GIFT_OVERRIDE for the bug that made this field necessary.
   */
  giftObserved: boolean;
  /** The numbers every rule gated on, so the panel prints them rather than restating them. */
  thresholds: {
    loyaltyPosterior: number;
    loyaltyConfidence: number;
    rivalryIntensity: number;
    fatigueCeiling: number;
    purchaseWindowDays: number;
    giftOverride: number;
  };
}

const THRESHOLDS: SuppressionContext['thresholds'] = {
  loyaltyPosterior: LOYALIST_POSTERIOR_FLOOR,
  loyaltyConfidence: LOYALIST_CONFIDENCE_FLOOR,
  rivalryIntensity: RIVALRY_SUPPRESSION_FLOOR,
  fatigueCeiling: FATIGUE_CEILING,
  purchaseWindowDays: RECENT_PURCHASE_WINDOW_DAYS,
  giftOverride: GIFT_OVERRIDE,
};

/**
 * Whether this reading of a shopper is loyal enough to refuse things on, and
 * which clubs that refuses.
 *
 * Split out from `suppressionContext` because the profile fold calls it too:
 * `state.suppressedTeams` is written on every fold so the Profile tab can show
 * the rule's current standing without a surface having to render first. One
 * definition, two callers, no chance of the panel and the gate disagreeing.
 *
 * Returns an empty array both when the shopper is not a loyalist and when their
 * club has no rival in the catalog. Those are different facts and callers that
 * need to tell them apart should read `loyalty` on the context.
 */
export function suppressedTeamsFor(
  team: TeamId,
  posterior: number,
  confidence: number
): TeamId[] {
  if (posterior < LOYALIST_POSTERIOR_FLOOR || confidence < LOYALIST_CONFIDENCE_FLOOR) return [];
  return rivalsOf(team)
    .filter((r) => r.intensity >= RIVALRY_SUPPRESSION_FLOOR)
    .map((r) => r.team);
}

/** The context in which no rule can fire. Personalization off resolves to this. */
export function inertContext(): SuppressionContext {
  return {
    active: false,
    loyalty: null,
    rivals: [],
    spared: [],
    fatigue: {},
    purchases: {},
    giftIntent: 0,
    giftObserved: false,
    thresholds: THRESHOLDS,
  };
}

/**
 * Reads the profile once and answers the four rules' questions.
 *
 * Note what is NOT read: `customer.teamAffinity`, the scenario, or anything
 * else that would let the store know the answer without having observed it. The
 * loyalty term comes off the same fold every other surface reads, so a shopper
 * the model has not figured out yet is not a loyalist and nothing is suppressed
 * on their behalf - which is the correct behaviour and also the honest one.
 */
export function suppressionContext(
  profile: VisitorProfile,
  opts: { personalized?: boolean } = {}
): SuppressionContext {
  if (opts.personalized === false) return inertContext();

  const team = profile.affinities.team;
  const posterior = team.posterior[team.top] ?? 0;
  const confidence = team.confidence.value;
  const isLoyalist = posterior >= LOYALIST_POSTERIOR_FLOOR && confidence >= LOYALIST_CONFIDENCE_FLOOR;

  const all = isLoyalist ? rivalsOf(team.top) : [];

  const purchases: Record<string, { daysAgo: number; gift: boolean }> = {};
  for (const order of profile.state.recentPurchases) {
    const existing = purchases[order.productId];
    // Most recent wins on age; any gift order in the window is enough to lift
    // the rule, because one item that shipped elsewhere is one item this
    // shopper may not actually have.
    purchases[order.productId] = {
      daysAgo: existing ? Math.min(existing.daysAgo, order.daysAgo) : order.daysAgo,
      gift: (existing?.gift ?? false) || order.gift,
    };
  }

  return {
    active: true,
    loyalty: isLoyalist ? { team: team.top, posterior, confidence } : null,
    rivals: all.filter((r) => r.intensity >= RIVALRY_SUPPRESSION_FLOOR),
    spared: all.filter((r) => r.intensity < RIVALRY_SUPPRESSION_FLOOR),
    fatigue: profile.state.impressionFatigue,
    purchases,
    giftIntent: profile.traits.giftIntent.value,
    giftObserved: profile.traits.giftIntent.evidence > 0,
    thresholds: THRESHOLDS,
  };
}

/* ------------------------------------------------------------- the gate -- */

export interface Candidate {
  product: Product;
  /** The retrieving model's own score, normalised to 0..1. */
  confidence: number;
  /** What retrieved it, named for the panel - "cosine k-NN", "co-order graph". */
  source: string;
}

export interface SuppressionDecision {
  product: Product;
  rule: SuppressionRule;
  ruleLabel: string;
  /** Why this product specifically, with the number it was measured against. */
  reason: string;
  /** The 1-based slot it would have taken had nothing before it been cut. */
  position: number;
  /** confidence_floor only: what it scored, and what the slot demanded. */
  scored?: number;
  required?: number;
}

export interface SuppressionResult {
  policy: SurfacePolicy;
  /** What is served, in order, with fatigue demotion already applied. */
  kept: Candidate[];
  /** What was refused, with the rule that refused it. */
  suppressed: SuppressionDecision[];
  /** Candidates whose score fatigue cut without cutting the candidate. */
  demoted: { product: Product; from: number; to: number; shows: number }[];
  /** Slots the policy has room for and could not fill. */
  withheld: number;
  /** True when at least one rule refused at least one product. */
  fired: boolean;
  byRule: { rule: SuppressionRule; label: string; count: number }[];
  /**
   * The same candidates as an un-suppressed store would serve them: score order,
   * trimmed to the policy's slots, no rule applied.
   *
   * Carried for the same reason ml/query.ts carries `defaultOrder` - so the
   * difference between the two is a count taken in one render rather than a
   * claim about a store nobody ran. See the header of ml/effort.ts.
   */
  unsuppressed: Candidate[];
  /**
   * Set when the rivalry rule stood itself down for this surface because the
   * shopper anchored the page on the rival themselves.
   *
   * A rule that declined to fire is as much a decision as one that fired, and
   * this is the one place in the gate where a refusal is deliberately withheld.
   * The panel prints it, because a suppression rule you can only ever see
   * removing things reads as absolute, and this one is not.
   */
  rivalryStoodDown: { team: TeamId; loyalTo: TeamId } | null;
}

/**
 * Runs the four rules over a candidate list.
 *
 * `candidates` should be OVER-fetched relative to `policy.slots`: the whole
 * mechanism is that a refused product is replaced by the next qualifying one,
 * and a caller that retrieves exactly four for a four-slot rail has given the
 * gate nothing to backfill with. Every call site in this codebase asks its
 * engine for roughly twice the slots for that reason.
 */
/**
 * WHY THE ANCHOR IS AN INPUT TO A GATE.
 *
 * Three of the five surfaces are anchored on a product the SHOPPER chose - the
 * two product-page rails and the cart cross-sell. The other two, the hero and
 * the trending rail, are chosen by the store. That difference decides whether
 * the rivalry rule should fire at all.
 *
 * Measured across every anchor in the catalog, with a confident Eagles fan as
 * the context, an anchor-blind rivalry rule emptied roughly 40% of product-page
 * rails: a shopper looking at a Cowboys jersey got no similar items, no
 * complements and no cross-sell, because every neighbour of a Cowboys jersey is
 * a Cowboys product. Lowering the confidence bars barely moved that number,
 * which is how we knew the confidence gate was not the cause.
 *
 * The shopper who navigated to that jersey has overridden the inference for
 * this page. Refusing to show them the rest of it is not protecting them from a
 * club they dislike; it is breaking a page they asked for. So the rule stands
 * down when the anchor is itself the rival - and says so, rather than going
 * quiet. It still applies in full to everything the store chose to show.
 *
 * THE STAND-DOWN IS PER RIVAL, NOT PER SURFACE. The Eagles have two rivals in
 * this taxonomy. Opening a Cowboys page is an override of the Cowboys read and
 * says nothing whatever about the Chiefs, so Chiefs merchandise on that same
 * page is still refused. A surface-wide stand-down would have turned every
 * rival's product page into the one place the rule could be evaded.
 */
export function applySuppression(
  candidates: Candidate[],
  ctx: SuppressionContext,
  policy: SurfacePolicy,
  opts: { anchor?: Product | null } = {}
): SuppressionResult {
  // Stand-down is decided once, off the anchor, not per candidate: the question
  // is what this PAGE is about, not what each tile is.
  const anchorTeam = opts.anchor?.team ?? null;
  const standDown =
    ctx.loyalty && anchorTeam && ctx.rivals.some((r) => r.team === anchorTeam)
      ? { team: anchorTeam, loyalTo: ctx.loyalty.team }
      : null;
  const unsuppressed = candidates.slice(0, policy.slots);

  if (!ctx.active) {
    return {
      policy,
      kept: unsuppressed,
      suppressed: [],
      demoted: [],
      withheld: Math.max(0, policy.slots - unsuppressed.length),
      fired: false,
      byRule: [],
      unsuppressed,
      // Personalization is off, so there is no loyalty read and nothing to
      // stand down from. Null rather than the value computed above, which
      // cannot be non-null on an inert context anyway.
      rivalryStoodDown: null,
    };
  }

  const suppressed: SuppressionDecision[] = [];
  const demoted: SuppressionResult['demoted'] = [];
  const survivors: Candidate[] = [];

  // --- Rules 1-3, per candidate, before any slot is assigned -----------------
  candidates.forEach((c, i) => {
    const position = i + 1;
    const p = c.product;

    // 1. Already owned.
    const order = ctx.purchases[p.id];
    if (order && order.daysAgo <= RECENT_PURCHASE_WINDOW_DAYS) {
      const repurchasable = isRepurchasable(p.subdepartment);
      const gifting = order.gift || (ctx.giftObserved && ctx.giftIntent >= GIFT_OVERRIDE);
      if (!repurchasable && !gifting) {
        suppressed.push({
          product: p,
          rule: 'recent_purchase',
          ruleLabel: RULE_LABEL.recent_purchase,
          position,
          reason: `ordered ${order.daysAgo} days ago, inside the ${RECENT_PURCHASE_WINDOW_DAYS}-day window, and a ${p.subdepartment} is not something a shopper owns two of`,
        });
        return;
      }
      // Kept, and the exception is worth recording as a near-miss rather than
      // silently: a rule that only ever appears when it fires looks absolute.
    }

    // 2. Rival club. A hard exclusion - no score buys past it - unless the
    // shopper anchored this page on that same rival, in which case the rule has
    // already stood down for the whole surface.
    const rival =
      standDown && p.team === standDown.team
        ? undefined
        : ctx.rivals.find((r) => r.team === p.team);
    if (rival && ctx.loyalty) {
      suppressed.push({
        product: p,
        rule: 'rivalry',
        ruleLabel: RULE_LABEL.rivalry,
        position,
        reason: `${p.team} is a rival of ${ctx.loyalty.team} at intensity ${rival.intensity.toFixed(2)} (${rival.label}), and this shopper reads as a ${ctx.loyalty.team} loyalist at ${Math.round(ctx.loyalty.posterior * 100)}% posterior / ${Math.round(ctx.loyalty.confidence * 100)}% confidence`,
      });
      return;
    }

    // 3. Impression fatigue. Demote, then exclude only past the ceiling.
    const shows = ctx.fatigue[p.id] ?? 0;
    if (shows >= FATIGUE_CEILING) {
      suppressed.push({
        product: p,
        rule: 'fatigue',
        ruleLabel: RULE_LABEL.fatigue,
        position,
        reason: `shown ${shows.toFixed(1)} times without a click, at or past the ceiling of ${FATIGUE_CEILING}`,
      });
      return;
    }
    if (shows > 0) {
      const multiplier = Math.exp(-FATIGUE_LAMBDA * shows);
      const next = c.confidence * multiplier;
      demoted.push({ product: p, from: c.confidence, to: next, shows });
      survivors.push({ ...c, confidence: next });
      return;
    }

    survivors.push(c);
  });

  // Fatigue changed some scores, so the order has to be re-taken before slots
  // are assigned. Stable within equal scores, which keeps the upstream engine's
  // tie-breaking rather than inventing one here.
  survivors.sort((a, b) => b.confidence - a.confidence);

  // --- Rule 4, per slot ------------------------------------------------------
  //
  // Evaluated against the slot the candidate would ACTUALLY occupy, not the
  // position it arrived in. A cut does not consume a slot, so the next
  // candidate is promoted into the vacated one and has to clear that slot's
  // bar - a tile does not get to inherit a hero position on a carousel score.
  const kept: Candidate[] = [];
  for (const c of survivors) {
    if (kept.length >= policy.slots) break;
    const position = kept.length + 1;
    const required = thresholdAt(policy, position);
    if (c.confidence < required) {
      suppressed.push({
        product: c.product,
        rule: 'confidence_floor',
        ruleLabel: RULE_LABEL.confidence_floor,
        position,
        scored: c.confidence,
        required,
        reason: `scored ${c.confidence.toFixed(2)} against the ${required.toFixed(2)} that slot ${position} of ${policy.label} demands`,
      });
      continue;
    }
    kept.push(c);
  }

  const order: SuppressionRule[] = ['rivalry', 'recent_purchase', 'fatigue', 'confidence_floor'];
  const byRule = order
    .map((rule) => ({
      rule,
      label: RULE_LABEL[rule],
      count: suppressed.filter((s) => s.rule === rule).length,
    }))
    .filter((r) => r.count > 0);

  return {
    policy,
    kept,
    suppressed,
    demoted,
    withheld: Math.max(0, policy.slots - kept.length),
    fired: suppressed.length > 0,
    byRule,
    unsuppressed,
    rivalryStoodDown: standDown,
  };
}

/* ---------------------------------------------------------- explanations -- */

/**
 * The one line the storefront prints beside the rail.
 *
 * Deliberately in the shopper's language rather than the model's: it says what
 * was withheld and why, and it never names a posterior. The panel gets the
 * arithmetic; the store gets the sentence.
 */
export function refusalSentence(result: SuppressionResult): string | null {
  if (!result.fired) return null;
  const parts = result.byRule.map((r) => {
    switch (r.rule) {
      case 'rivalry':
        return `${r.count} from a rival club`;
      case 'recent_purchase':
        return `${r.count} you already bought`;
      case 'fatigue':
        return `${r.count} you have scrolled past before`;
      case 'confidence_floor':
        return `${r.count} we were not confident enough about`;
    }
  });
  const n = result.suppressed.length;
  const tail =
    result.withheld > 0
      ? ` ${result.withheld} slot${result.withheld === 1 ? '' : 's'} left empty rather than filled with something worse.`
      : '';
  return `${n} item${n === 1 ? '' : 's'} withheld: ${parts.join(', ')}.${tail}`;
}

/**
 * The ledger entry for one surface's refusals.
 *
 * Counts SUPPRESSED IMPRESSIONS - products the shopper did not have to look at
 * and decide against - rather than empty slots, because a backfilled slot is
 * still a wrong product they were spared. Where slots did go unfilled the
 * detail says so, so a reader can tell the two apart without a second entry.
 *
 * Returns null when nothing fired. A no-op decision is not a saving and a
 * ledger row reading zero would be counted by anyone scanning rows.
 */
export function suppressionEffort(
  result: SuppressionResult,
  input: { id: string; eventId: string | null }
): EffortEntry | null {
  if (!result.fired) return null;
  const n = result.suppressed.length;
  const rules = result.byRule.map((r) => `${r.count} ${r.label.toLowerCase()}`).join(', ');
  return saving({
    id: input.id,
    eventId: input.eventId,
    page: result.policy.page,
    surface: result.policy.label,
    kind: 'suppressed_impression',
    count: n,
    label: `Withheld ${n} impression${n === 1 ? '' : 's'} on ${result.policy.label}`,
    detail:
      `${rules}; ${result.kept.length} of ${result.policy.slots} slots served` +
      (result.withheld > 0 ? `, ${result.withheld} left empty` : ', all backfilled'),
  });
}
