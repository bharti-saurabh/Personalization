/**
 * What is personalized on the stage right now, as data.
 *
 * WHY A REGISTRY AND NOT A PANEL THAT INSPECTS THE DOM
 * ---------------------------------------------------
 * The rail has to be able to say "these seven things on that page were chosen,
 * here is which belief chose each one". The only way to say that without
 * lying is for the storefront and the rail to read the same list. So the list
 * lives here, keyed by module id, and both sides use it: the storefront stamps
 * `data-module` and draws the marker, the rail renders the row.
 *
 * The consequence worth stating is that a module that forgets to register is
 * invisible to the rail rather than silently unexplained. That is the failure
 * mode we want: a missing row is noticed, a wrong row is not.
 *
 * `active` is the honest half. A module can be on the page and NOT be a
 * decision - because personalization is off, or because the slot's confidence
 * did not clear the surface's bar. Those rows still appear, marked inactive,
 * with the reason. A rail that only listed the wins would be marketing.
 *
 * React-free, like everything in src/state.
 */

import type { StorefrontPage } from '../types';
import type { SlotId, VisitorModel } from './visitorModel';
import { leaderOf } from './visitorModel';

export interface StageModule {
  id: string;
  /** Retail name, as the shopper sees it on the page. */
  name: string;
  page: StorefrontPage;
  slot: SlotId;
  /** Which engine turned the slot into an ordering. */
  model: string;
  /** What it put first. */
  chose: string;
  /** The slot score behind that choice, 0-1. */
  score: number;
  /** What that choice displaced, or null when there was nothing to displace. */
  beat: string | null;
  /** True when this really is a personalized decision right now. */
  active: boolean;
  /** One line. Mechanism, then consequence. */
  reason: string;
}

/** Marker number as drawn on the stage. One-based, in render order. */
export function markerFor(modules: StageModule[], id: string): number | null {
  const i = modules.findIndex((m) => m.id === id);
  return i < 0 ? null : i + 1;
}

interface StageInputs {
  page: StorefrontPage;
  model: VisitorModel;
  personalizationOn: boolean;
  /** Confidence bar the hero surface enforces, read from the policy it enforces. */
  heroThreshold: number;
  /** How many similar-item and complement candidates survived their gates. */
  similarCount: number;
  complementCount: number;
}

function runnerUp(model: VisitorModel, slot: SlotId): string | null {
  return model[slot].ranked[1]?.label ?? null;
}

/**
 * The modules the given page renders, in the order they appear down the page.
 *
 * Order matters twice over: it is the marker numbering, and it is the reading
 * order of the Decisions tab. A rail whose rows are in a different order from
 * the page it describes makes the reader do the matching.
 */
export function stageModules(inputs: StageInputs): StageModule[] {
  const { page, model, personalizationOn } = inputs;
  const on = personalizationOn;

  const team = leaderOf(model.topTeam);
  const league = leaderOf(model.topLeague);
  const player = leaderOf(model.topPlayer);
  const category = leaderOf(model.topCategory);
  const price = leaderOf(model.priceBand);
  const gift = leaderOf(model.giftingPropensity);

  const off = 'Personalization is off, so this module renders its merchandised default';

  if (page === 'home') {
    const heroClears = (team?.score ?? 0) >= inputs.heroThreshold;
    return [
      {
        id: 'league-nav',
        name: 'League navigation',
        page,
        slot: 'topLeague',
        model: 'Intent engine',
        chose: league?.label ?? 'NFL',
        score: league?.score ?? 0,
        beat: runnerUp(model, 'topLeague'),
        active: on,
        reason: on
          ? 'League posterior orders the nav, so the sport the shopper actually follows is first rather than the biggest sport in the catalog'
          : off,
      },
      {
        id: 'hero',
        name: 'Hero banner',
        page,
        slot: 'topTeam',
        model: 'Intent engine, hero surface policy',
        chose: team?.label ?? 'Eagles',
        score: team?.score ?? 0,
        beat: runnerUp(model, 'topTeam'),
        active: on && heroClears,
        reason: !on
          ? off
          : heroClears
            ? 'Team posterior cleared the hero bar, so the banner is dressed in that club and shows its bestselling piece'
            : `Team posterior is ${(100 * (team?.score ?? 0)).toFixed(0)}% and the hero bar is ${(100 * inputs.heroThreshold).toFixed(0)}%, so the banner stands down to the house creative`,
      },
      {
        id: 'teams-ladder',
        name: 'Your teams',
        page,
        slot: 'topTeam',
        model: 'Intent engine',
        chose: team?.label ?? 'Eagles',
        score: team?.score ?? 0,
        beat: runnerUp(model, 'topTeam'),
        active: on,
        reason: on
          ? 'Club tiles are ordered by the team posterior instead of by national market size'
          : off,
      },
      {
        id: 'players-rail',
        name: 'Players you follow',
        page,
        slot: 'topPlayer',
        model: 'Intent engine, player affinity',
        chose: player?.label ?? 'nothing yet',
        score: player?.score ?? 0,
        beat: runnerUp(model, 'topPlayer'),
        active: on && (player?.score ?? 0) > 0.12,
        reason: !on
          ? off
          : (player?.score ?? 0) > 0.12
            ? 'A named player is carrying real posterior mass, so the rail shows that roster rather than a club-wide bestseller list'
            : 'No player is separated from the field yet, so the rail falls back to the club roster in popularity order',
      },
      {
        id: 'categories',
        name: 'Shop your categories',
        page,
        slot: 'topCategory',
        model: 'Intent engine, department head',
        chose: category?.label ?? 'Jerseys',
        score: category?.score ?? 0,
        beat: runnerUp(model, 'topCategory'),
        active: on,
        reason: on
          ? 'Department posterior orders the tiles, so the category the shopper keeps returning to is first rather than A to Z'
          : off,
      },
      {
        id: 'picked-for-you',
        name: 'Picked for you',
        page,
        slot: 'topTeam',
        model: 'Ranking, then availability gate',
        chose: team?.label ?? 'Eagles',
        score: team?.score ?? 0,
        beat: 'Global bestsellers',
        active: on,
        reason: on
          ? 'Candidates are retrieved on the team and department posteriors, ranked, then filtered to what is actually in stock'
          : off,
      },
      {
        id: 'gifting',
        name: 'Gifting and kids',
        page,
        slot: 'giftingPropensity',
        model: 'Gift intent scalar',
        chose: gift?.label ?? 'Shopping for self',
        score: gift?.score ?? 0,
        beat: runnerUp(model, 'giftingPropensity'),
        active: on && model.giftingPropensity.ranked[0]?.id === 'gift',
        reason: !on
          ? off
          : model.giftingPropensity.ranked[0]?.id === 'gift'
            ? 'Gift intent is leading, so the gifting rail opens and the size prefill is withheld on every product page'
            : 'Gift intent is not leading, so the rail stays closed rather than offering a guess',
      },
      {
        id: 'price-framing',
        name: 'Price framing',
        page,
        slot: 'priceBand',
        model: 'Price sensitivity scalar',
        chose: price?.label ?? 'Mid market',
        score: price?.score ?? 0,
        beat: runnerUp(model, 'priceBand'),
        active: on,
        reason: on
          ? 'Price band decides whether the offer surface is shown at all, and which end of the assortment leads'
          : off,
      },
    ];
  }

  if (page === 'plp') {
    return [
      {
        id: 'facet-order',
        name: 'Filter order',
        page,
        slot: 'topCategory',
        model: 'Intent engine, facet ordering',
        chose: category?.label ?? 'Jerseys',
        score: category?.score ?? 0,
        beat: runnerUp(model, 'topCategory'),
        active: on,
        reason: on
          ? 'Facet groups and the values inside them are ordered by posterior, so the filter the shopper wanted is above the fold'
          : off,
      },
      {
        id: 'plp-sort',
        name: 'Recommended sort',
        page,
        slot: 'topTeam',
        model: 'Ranking',
        chose: team?.label ?? 'Eagles',
        score: team?.score ?? 0,
        beat: 'Popularity',
        active: on,
        reason: on
          ? 'Popularity is reweighted by the team and department posteriors rather than used raw'
          : off,
      },
      {
        id: 'plp-price',
        name: 'Price facet default',
        page,
        slot: 'priceBand',
        model: 'Price sensitivity scalar',
        chose: price?.label ?? 'Mid market',
        score: price?.score ?? 0,
        beat: runnerUp(model, 'priceBand'),
        active: on,
        reason: on ? 'Price band chooses which end of the range the facet opens on' : off,
      },
    ];
  }

  if (page === 'pdp') {
    return [
      {
        id: 'size-prefill',
        name: 'Size and fit',
        page,
        slot: 'gender',
        model: 'Fit model',
        chose: leaderOf(model.gender)?.label ?? 'Unisex',
        score: model.gender.confidence,
        beat: runnerUp(model, 'gender'),
        active: on && model.giftingPropensity.ranked[0]?.id !== 'gift',
        reason: !on
          ? off
          : model.giftingPropensity.ranked[0]?.id === 'gift'
            ? 'Gift intent is leading, so the size facet is left empty rather than prefilled with the buyer own size'
            : 'Fit is predicted from the gender posterior and past size evidence, and prefilled only above the confidence floor',
      },
      {
        id: 'similar-items',
        name: 'You might also like',
        page,
        slot: 'topTeam',
        model: 'Similarity engine',
        chose: `${inputs.similarCount} candidates kept`,
        score: team?.score ?? 0,
        beat: runnerUp(model, 'topTeam'),
        active: on && inputs.similarCount > 0,
        reason: !on
          ? off
          : inputs.similarCount > 0
            ? 'Cosine neighbours of the item on screen, then the suppression gate removes rivals, fatigued items and things already owned'
            : 'Every candidate was refused by the gate, so the rail renders empty rather than padded',
      },
      {
        id: 'complete-look',
        name: 'Complete the look',
        page,
        slot: 'topCategory',
        model: 'Complement engine',
        chose: `${inputs.complementCount} candidates kept`,
        score: category?.score ?? 0,
        beat: runnerUp(model, 'topCategory'),
        active: on && inputs.complementCount > 0,
        reason: !on
          ? off
          : inputs.complementCount > 0
            ? 'Co-order lift against the anchor item, filtered to departments that combine and to the shopper own club'
            : 'Nothing cleared the complement bar for this anchor, so the rail is not shown',
      },
    ];
  }

  return [
    {
      id: 'cart-complements',
      name: 'Goes with your basket',
      page,
      slot: 'topCategory',
      model: 'Complement engine, basket anchor',
      chose: category?.label ?? 'Jerseys',
      score: category?.score ?? 0,
      beat: runnerUp(model, 'topCategory'),
      active: on,
      reason: on
        ? 'Co-order lift is computed against the whole basket rather than one line, so a second suggestion cannot repeat the first'
        : off,
    },
  ];
}
