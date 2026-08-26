/**
 * Query understanding: free text onto taxonomy nodes.
 *
 * WHAT THE SEARCH BOX USED TO DO. One `includes()` over name, team and
 * department, sliced to six. It had no idea what a word meant, so "cap"
 * returned nothing (the department is called Hats), "something for my son"
 * returned nothing, and a typo returned an empty dropdown with no way out.
 * Worse, it was the one surface in the prototype where the shopper states
 * their intent in words - and it was the only surface that ignored the profile
 * entirely.
 *
 * WHAT THIS MODULE DOES INSTEAD, in four stages, each of which is inspectable
 * from the panel because a search that cannot be explained is a search nobody
 * trusts:
 *
 *   1. INTERPRET   map spans of the query onto taxonomy nodes - player, team,
 *                  league, department, subdepartment, brand, gender, age,
 *                  size, a price ceiling, gift intent. Every node carries the
 *                  literal span that produced it and why it was believed.
 *   2. PROPAGATE   a player implies a team implies a league, damped by the
 *                  same two constants the profile fold uses, so "hurts jersey"
 *                  narrows to Eagles without the shopper saying Eagles.
 *   3. RETRIEVE    the nodes become AND constraints. If they return nothing,
 *                  the weakest is dropped and the constraint becomes a soft
 *                  ranking signal instead - the zero-result rescue.
 *   4. RANK        profile posteriors reweight what survived.
 *
 * THE TAXONOMY IS THE UNIVERSE, and that is a deliberate limit rather than a
 * shortcut. Every value this module can emit exists in sim/taxonomy.ts, so a
 * mapping can be checked against the catalog rather than argued about, and
 * swapping the taxonomy for a different vertical re-skins the search with it.
 * The cost is real and worth stating: this understands the shop it is in and
 * nothing else. It is a lexicon and a set of rules, not a language model, and
 * the note on each node says which rule fired so nobody has to guess.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No spelling correction, no embedding
 * lookup, no synonym learning from logs. Each of those is a real technique
 * that a production build would have; none of them can be demonstrated
 * honestly against a synthetic catalog with no query logs behind it, and an
 * invented relevance model is exactly the kind of number this prototype has
 * refused to print everywhere else.
 *
 * GIFT INTENT CHANGES WHAT PERSONALIZATION IS ALLOWED TO DO. When the query
 * says the purchase is for somebody else, the shopper's own player affinity is
 * dropped from the ranking and the listing page stops prefilling their size.
 * A model that keeps personalizing to the buyer when the buyer has just said
 * "this is not for me" is not being helpful, it is being loud.
 *
 * DOM-free by contract, like everything else in src/ml.
 */

import { Department, League, Product, TeamId } from '../types';
import { BRANDS, DEPARTMENTS, LEAGUES, SIZE_SCALES, TEAMS, TEAM_BY_ID } from '../sim/taxonomy';
import { PLAYER_TO_TEAM_DAMPING, TEAM_TO_LEAGUE_DAMPING, VisitorProfile } from './profile';
import { ProfileAffinities, profileAffinities } from './ranking';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type QueryNodeKind =
  | 'player'
  | 'team'
  | 'league'
  | 'department'
  | 'subdepartment'
  | 'brand'
  | 'gender'
  | 'ageGroup'
  | 'size'
  | 'priceCeiling'
  | 'giftIntent';

/** How a span became a node. Rendered verbatim in the panel. */
export type MatchVia = 'exact' | 'synonym' | 'surname' | 'given-name' | 'phrase' | 'pattern' | 'propagated';

export interface QueryNode {
  kind: QueryNodeKind;
  /** A taxonomy id, a facet value, or a number as a string for priceCeiling. */
  value: string;
  /** The literal words that produced it. Empty for a propagated node. */
  span: string;
  confidence: number;
  via: MatchVia;
  /** One line, in the reader's language, saying which rule fired. */
  note: string;
}

export interface QueryInterpretation {
  raw: string;
  normalized: string;
  tokens: string[];
  nodes: QueryNode[];
  /** Tokens that mapped onto nothing and are not filler. */
  unmatched: string[];
  /** True when the text produced no taxonomy node at all. */
  empty: boolean;
  /** Convenience view. True when the query says the purchase is for someone else. */
  giftIntent: boolean;
}

/** One AND-ed restriction on the catalog, derived from one or more nodes. */
export interface SearchConstraint {
  kind: QueryNodeKind;
  /** Values are OR-ed within a constraint, as facets are. */
  values: string[];
  confidence: number;
  label: string;
}

export interface Relaxation {
  constraint: SearchConstraint;
  label: string;
  reason: string;
  /** How many products survived once it was dropped. */
  matchesAfter: number;
}

export interface SearchRescue {
  /** `relaxed` kept some of the query; `profile` kept none of it. */
  kind: 'relaxed' | 'profile';
  headline: string;
  detail: string;
  steps: Relaxation[];
}

export interface SearchScore {
  /** 0.5 + 0.5 x popularity. Everything that survived the filter is relevant. */
  relevance: number;
  /** Credit for still satisfying a constraint the rescue had to drop. */
  soft: number;
  /** 1 + the profile terms. Exactly 1 when personalization is off. */
  personal: number;
  total: number;
  drivers: { label: string; contribution: number }[];
}

export interface SearchHit {
  product: Product;
  rank: number;
  defaultRank: number;
  score: SearchScore;
}

export interface SearchResult {
  interpretation: QueryInterpretation;
  constraints: SearchConstraint[];
  /** Constraints still applied after any rescue. */
  applied: SearchConstraint[];
  hits: SearchHit[];
  /** Everything that passed the filter, in personalized order. */
  matched: Product[];
  /**
   * The same result set as an un-personalized store would order it: relevance
   * and soft credit only, profile affinity removed.
   *
   * Carried in full rather than as a top-N so any surface can state where a
   * product WOULD have sat without the profile. That is the paired measurement
   * the effort ledger is built on - see the header of ml/effort.ts - and a
   * truncated list would silently turn it back into an assertion.
   */
  defaultOrder: Product[];
  /** How many matched before the rescue ladder ran. Zero is the whole point. */
  matchedBeforeRescue: number;
  rescue: SearchRescue | null;
  personalized: boolean;
}

/* ------------------------------------------------------------------ */
/* Lexicon                                                             */
/* ------------------------------------------------------------------ */

interface LexEntry {
  phrase: string;
  kind: QueryNodeKind;
  value: string;
  confidence: number;
  via: MatchVia;
  note: string;
}

/**
 * Words a shopper uses for a department that the department is not called.
 *
 * This is the single highest-value table in the file and the one most likely to
 * be wrong, so it is written out rather than generated: a shopper says "cap",
 * the taxonomy says "Hats", and no amount of string distance closes that gap.
 * Entries that are also subdepartments (snapback, beanie, bobblehead) emit both
 * nodes - the department narrows, the subdepartment narrows further.
 */
const DEPARTMENT_SYNONYMS: Record<Department, string[]> = {
  Jerseys: ['jersey', 'jerseys', 'kit', 'kits', 'uniform', 'uniforms', 'game jersey', 'swingman'],
  Hats: ['hat', 'hats', 'cap', 'caps', 'headwear', 'snapback', 'beanie', 'fitted cap', 'trucker', 'ballcap'],
  Hoodies: ['hoodie', 'hoodies', 'hoody', 'sweatshirt', 'sweatshirts', 'fleece', 'crewneck', 'pullover', 'zip up'],
  'T-shirts': ['tshirt', 'tshirts', 't shirt', 't shirts', 'tee', 'tees', 'shirt', 'shirts', 'long sleeve', 'graphic tee'],
  Collectibles: [
    'collectible',
    'collectibles',
    'memorabilia',
    'signed',
    'autograph',
    'autographed',
    'bobblehead',
    'mini helmet',
    'framed',
    'signed photo',
  ],
  Accessories: ['accessory', 'accessories', 'socks', 'sock', 'scarf', 'backpack', 'phone case', 'lanyard'],
  Kids: ['kids', 'kid', 'youth', 'toddler', 'child', 'children', 'boys', 'girls', 'baby', 'junior'],
  'Home & Office': [
    'mug',
    'mugs',
    'blanket',
    'blankets',
    'drinkware',
    'tumbler',
    'wall art',
    'poster',
    'desk',
    'home decor',
    'flag',
  ],
};

/** Words that name a subdepartment directly, so the query can narrow twice. */
const SUBDEPARTMENT_SYNONYMS: { word: string; value: string }[] = [
  { word: 'snapback', value: 'Snapback' },
  { word: 'beanie', value: 'Beanie' },
  { word: 'fitted cap', value: 'Fitted Cap' },
  { word: 'trucker', value: 'Trucker' },
  { word: 'bobblehead', value: 'Bobblehead' },
  { word: 'mini helmet', value: 'Mini Helmet' },
  { word: 'signed photo', value: 'Signed Photo' },
  { word: 'framed print', value: 'Framed Print' },
  { word: 'long sleeve', value: 'Long Sleeve' },
  { word: 'crewneck', value: 'Crewneck Fleece' },
  { word: 'socks', value: 'Socks' },
  { word: 'scarf', value: 'Scarf' },
  { word: 'backpack', value: 'Backpack' },
  { word: 'phone case', value: 'Phone Case' },
  { word: 'blanket', value: 'Blanket' },
  { word: 'wall art', value: 'Wall Art' },
  { word: 'drinkware', value: 'Drinkware' },
];

const LEAGUE_SYNONYMS: Record<League, string[]> = {
  NFL: ['nfl', 'football', 'american football'],
  NBA: ['nba', 'basketball', 'hoops'],
  MLB: ['mlb', 'baseball'],
};

const GENDER_SYNONYMS: { words: string[]; value: Product['gender'] }[] = [
  { words: ['mens', 'men', "men's", 'male', 'guys', 'him', 'for him'], value: 'Men' },
  { words: ['womens', 'women', "women's", 'ladies', 'female', 'her', 'for her'], value: 'Women' },
  { words: ['unisex'], value: 'Unisex' },
];

/**
 * Phrases that say the purchase is for somebody else, and who for.
 *
 * "for my son" carries two facts, not one, and they land as separate nodes: a
 * department (Kids) and a gift trait. Keeping them apart matters because the
 * rescue ladder can drop the department while the gift trait stays - somebody
 * shopping for a child still is not shopping for themselves even after the
 * Kids filter comes off.
 */
const GIFT_PHRASES: { phrase: string; department?: Department; gender?: Product['gender']; note: string }[] = [
  { phrase: 'for my son', department: 'Kids', note: '"for my son" - buying for a child, and not for the shopper' },
  { phrase: 'for my daughter', department: 'Kids', note: '"for my daughter" - buying for a child' },
  { phrase: 'for my kid', department: 'Kids', note: '"for my kid" - buying for a child' },
  { phrase: 'for my kids', department: 'Kids', note: '"for my kids" - buying for children' },
  { phrase: 'for my boy', department: 'Kids', note: '"for my boy" - buying for a child' },
  { phrase: 'for my girl', department: 'Kids', note: '"for my girl" - buying for a child' },
  { phrase: 'for my nephew', department: 'Kids', note: '"for my nephew" - buying for a child' },
  { phrase: 'for my niece', department: 'Kids', note: '"for my niece" - buying for a child' },
  { phrase: 'for my grandson', department: 'Kids', note: '"for my grandson" - buying for a child' },
  { phrase: 'for my granddaughter', department: 'Kids', note: '"for my granddaughter" - buying for a child' },
  { phrase: 'for my dad', gender: 'Men', note: '"for my dad" - buying for an adult, and not for the shopper' },
  { phrase: 'for my husband', gender: 'Men', note: '"for my husband" - buying for an adult' },
  { phrase: 'for my brother', gender: 'Men', note: '"for my brother" - buying for an adult' },
  { phrase: 'for my mom', gender: 'Women', note: '"for my mom" - buying for an adult' },
  { phrase: 'for my wife', gender: 'Women', note: '"for my wife" - buying for an adult' },
  { phrase: 'for my sister', gender: 'Women', note: '"for my sister" - buying for an adult' },
  { phrase: 'gift', note: 'the word "gift" - the purchase is for somebody else' },
  { phrase: 'gifts', note: 'the word "gifts" - the purchase is for somebody else' },
  { phrase: 'present', note: 'the word "present" - the purchase is for somebody else' },
  { phrase: 'birthday', note: '"birthday" - a gift occasion' },
  { phrase: 'christmas', note: '"christmas" - a gift occasion' },
];

/** Filler. Left over after matching, these are not reported as misunderstood. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'my', 'me', 'some', 'something', 'anything', 'stuff', 'gear', 'merch',
  'buy', 'need', 'want', 'looking', 'look', 'to', 'of', 'and', 'or', 'with', 'please', 'i', 'im',
  'get', 'show', 'find', 'new', 'good', 'nice', 'official', 'shop', 'store', 'item', 'items',
  'in', 'on', 'at', 'is', 'it', 'that', 'this', 'their', 'his', 'hers',
]);

const SIZE_WORDS: Record<string, string> = {
  small: 'S',
  medium: 'M',
  large: 'L',
  xl: 'XL',
  xxl: '2XL',
  '2xl': '2XL',
  '3xl': '3XL',
  s: 'S',
  m: 'M',
  l: 'L',
};

const ALL_SIZES = new Set(Object.values(SIZE_SCALES).flat().map((s) => s.toLowerCase()));

/** Words that mean "not expensive" without naming a number. Stated, not hidden. */
const CHEAP_WORDS: Record<string, number> = { cheap: 35, budget: 35, affordable: 50, inexpensive: 50 };

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[.,!?;:()"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The lexicon, built once from the taxonomy.
 *
 * Ordered longest phrase first so "for my son" wins over "son", and
 * "philadelphia eagles" over "philadelphia". Ties break on confidence.
 */
const LEXICON: LexEntry[] = (() => {
  const out: LexEntry[] = [];

  for (const t of TEAMS) {
    out.push({
      phrase: norm(t.fullName),
      kind: 'team',
      value: t.id,
      confidence: 0.97,
      via: 'exact',
      note: `"${t.fullName}" is a club in the taxonomy`,
    });
    out.push({
      phrase: norm(t.id),
      kind: 'team',
      value: t.id,
      confidence: 0.93,
      via: 'exact',
      note: `"${t.id}" names a club directly`,
    });
    // A city is not a club. Philadelphia has three, so it emits three nodes at
    // reduced confidence and the retrieval ORs them, exactly as ticking three
    // boxes in the Team facet would.
    const sharing = TEAMS.filter((x) => x.city === t.city).length;
    out.push({
      phrase: norm(t.city),
      kind: 'team',
      value: t.id,
      confidence: sharing > 1 ? 0.45 : 0.8,
      via: 'synonym',
      note:
        sharing > 1
          ? `"${t.city}" is home to ${sharing} clubs in this catalog, so all ${sharing} stay in`
          : `"${t.city}" is ${t.id}'s city`,
    });
  }

  for (const t of TEAMS) {
    for (const pl of t.players) {
      const full = norm(pl.name);
      out.push({
        phrase: full,
        kind: 'player',
        value: pl.name,
        confidence: 0.96,
        via: 'exact',
        note: `"${pl.name}" is on the ${t.id} roster`,
      });
      const parts = full.split(' ');
      const surname = parts[parts.length - 1];
      const unique = TEAMS.flatMap((x) => x.players).filter((p2) => norm(p2.name).split(' ').pop() === surname);
      if (unique.length === 1) {
        out.push({
          phrase: surname,
          kind: 'player',
          value: pl.name,
          confidence: 0.82,
          via: 'surname',
          note: `"${surname}" is the only ${surname} on any roster in this catalog`,
        });
      }
      if (parts.length > 1) {
        const given = parts[0];
        const sharingGiven = TEAMS.flatMap((x) => x.players).filter((p2) => norm(p2.name).split(' ')[0] === given);
        out.push({
          phrase: given,
          kind: 'player',
          value: pl.name,
          confidence: sharingGiven.length > 1 ? 0.35 : 0.6,
          via: 'given-name',
          note:
            sharingGiven.length > 1
              ? `"${given}" is the given name of ${sharingGiven.length} players, so all ${sharingGiven.length} stay in`
              : `"${given}" is a given name on the ${t.id} roster`,
        });
      }
    }
  }

  for (const d of DEPARTMENTS) {
    out.push({
      phrase: norm(d.id),
      kind: 'department',
      value: d.id,
      confidence: 0.95,
      via: 'exact',
      note: `"${d.id}" is a department`,
    });
    for (const syn of DEPARTMENT_SYNONYMS[d.id]) {
      out.push({
        phrase: norm(syn),
        kind: 'department',
        value: d.id,
        confidence: 0.88,
        via: 'synonym',
        note: `"${syn}" is what shoppers call the ${d.id} department`,
      });
    }
  }

  for (const s of SUBDEPARTMENT_SYNONYMS) {
    out.push({
      phrase: norm(s.word),
      kind: 'subdepartment',
      value: s.value,
      confidence: 0.7,
      via: 'synonym',
      note: `"${s.word}" names the ${s.value} product type`,
    });
  }

  for (const lg of LEAGUES) {
    for (const syn of LEAGUE_SYNONYMS[lg]) {
      out.push({
        phrase: norm(syn),
        kind: 'league',
        value: lg,
        confidence: syn === lg.toLowerCase() ? 0.95 : 0.8,
        via: syn === lg.toLowerCase() ? 'exact' : 'synonym',
        note: `"${syn}" maps to the ${lg}`,
      });
    }
  }

  for (const b of BRANDS) {
    out.push({
      phrase: norm(b),
      kind: 'brand',
      value: b,
      confidence: 0.9,
      via: 'exact',
      note: `"${b}" is a brand in the catalog`,
    });
  }

  for (const g of GENDER_SYNONYMS) {
    for (const w of g.words) {
      out.push({
        phrase: norm(w),
        kind: 'gender',
        value: g.value,
        confidence: 0.85,
        via: 'synonym',
        note: `"${w}" narrows to ${g.value}`,
      });
    }
  }

  out.push({
    phrase: 'toddler',
    kind: 'ageGroup',
    value: 'Toddler',
    confidence: 0.8,
    via: 'synonym',
    note: '"toddler" is an age band, narrower than Kids',
  });

  return out.sort(
    (a, b) => b.phrase.split(' ').length - a.phrase.split(' ').length || b.confidence - a.confidence
  );
})();

/**
 * The lexicon regrouped so one phrase yields every node it could mean.
 *
 * This is not a micro-optimisation, it is a correctness fix with a real bug
 * behind it: matching entry-by-entry meant the first entry to claim a span
 * consumed it, so "philadelphia" resolved to the Eagles and silently dropped
 * the 76ers and the Phillies, and "jalen" resolved to Hurts and dropped Carter.
 * An ambiguous word is not a word with one meaning that happens to be first in
 * a list. All of its meanings go in, at the reduced confidence the ambiguity
 * earns them, and retrieval ORs them the way ticking three boxes in one facet
 * would.
 */
const LEX_GROUPS: { tokens: string[]; entries: LexEntry[] }[] = (() => {
  const byPhrase = new Map<string, LexEntry[]>();
  for (const e of LEXICON) {
    const list = byPhrase.get(e.phrase) ?? [];
    list.push(e);
    byPhrase.set(e.phrase, list);
  }
  return [...byPhrase.entries()].map(([phrase, entries]) => ({ tokens: phrase.split(' '), entries }));
})();

/* ------------------------------------------------------------------ */
/* Stage 1 and 2: interpret, then propagate                            */
/* ------------------------------------------------------------------ */

const pushNode = (nodes: QueryNode[], n: QueryNode) => {
  if (nodes.some((x) => x.kind === n.kind && x.value === n.value)) return;
  nodes.push(n);
};

/**
 * Maps free text onto taxonomy nodes.
 *
 * Longest phrase first over a consumed-token mask, so every word is spent at
 * most once and a two-word phrase always beats the single words inside it.
 * Pure: same string in, same interpretation out, no clock and no profile. The
 * profile enters at ranking time, never at understanding time - what the
 * shopper said does not change because of who they are.
 */
export function interpretQuery(raw: string): QueryInterpretation {
  const normalized = norm(raw);
  const tokens = normalized ? normalized.split(' ') : [];
  const consumed = tokens.map(() => false);
  const nodes: QueryNode[] = [];

  const takeRun = (start: number, len: number) => {
    for (let i = start; i < start + len; i += 1) consumed[i] = true;
  };

  const findRun = (phraseTokens: string[]): number => {
    for (let i = 0; i + phraseTokens.length <= tokens.length; i += 1) {
      let ok = true;
      for (let j = 0; j < phraseTokens.length; j += 1) {
        if (consumed[i + j] || tokens[i + j] !== phraseTokens[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  };

  // Gift phrases run before the lexicon: "for my son" has to beat the Kids
  // synonym list getting hold of "son" on its own, and it has to beat the
  // stopword filter eating "for" and "my".
  for (const g of GIFT_PHRASES) {
    const pt = g.phrase.split(' ');
    const at = findRun(pt);
    if (at < 0) continue;
    takeRun(at, pt.length);
    const span = tokens.slice(at, at + pt.length).join(' ');
    pushNode(nodes, {
      kind: 'giftIntent',
      value: 'true',
      span,
      confidence: 0.85,
      via: 'phrase',
      note: g.note,
    });
    if (g.department) {
      pushNode(nodes, {
        kind: 'department',
        value: g.department,
        span,
        confidence: 0.72,
        via: 'phrase',
        note: `${g.department} follows from "${span}"`,
      });
    }
    if (g.gender) {
      pushNode(nodes, {
        kind: 'gender',
        value: g.gender,
        span,
        confidence: 0.6,
        via: 'phrase',
        note: `${g.gender} follows from "${span}"`,
      });
    }
  }

  for (const group of LEX_GROUPS) {
    const at = findRun(group.tokens);
    if (at < 0) continue;
    takeRun(at, group.tokens.length);
    const span = tokens.slice(at, at + group.tokens.length).join(' ');
    for (const entry of group.entries) {
      pushNode(nodes, {
        kind: entry.kind,
        value: entry.value,
        span,
        confidence: entry.confidence,
        via: entry.via,
        note: entry.note,
      });
    }
  }

  // Price ceiling: "under $50", "below 40", "less than 30", or a bare adjective.
  for (let i = 0; i < tokens.length; i += 1) {
    if (consumed[i]) continue;
    const tok = tokens[i];
    if (CHEAP_WORDS[tok] !== undefined) {
      consumed[i] = true;
      pushNode(nodes, {
        kind: 'priceCeiling',
        value: String(CHEAP_WORDS[tok]),
        span: tok,
        confidence: 0.45,
        via: 'pattern',
        note: `"${tok}" has no number in it; read as a ceiling of $${CHEAP_WORDS[tok]} - a stated assumption, not a measurement`,
      });
      continue;
    }
    if (!['under', 'below', 'beneath', 'less'].includes(tok)) continue;
    // "less than 30" - skip the filler word between.
    let j = i + 1;
    if (tokens[j] === 'than') j += 1;
    const m = tokens[j]?.match(/^\$?(\d+)$/);
    if (!m) continue;
    for (let k = i; k <= j; k += 1) consumed[k] = true;
    pushNode(nodes, {
      kind: 'priceCeiling',
      value: m[1],
      span: tokens.slice(i, j + 1).join(' '),
      confidence: 0.9,
      via: 'pattern',
      note: `"${tokens.slice(i, j + 1).join(' ')}" caps the shelf price at $${m[1]}`,
    });
  }

  // Sizes, either spelled out or named after the word "size".
  for (let i = 0; i < tokens.length; i += 1) {
    if (consumed[i]) continue;
    const tok = tokens[i];
    const after = tok === 'size' ? tokens[i + 1] : null;
    const candidate = after ?? tok;
    if (!candidate) continue;
    const mapped = SIZE_WORDS[candidate] ?? (ALL_SIZES.has(candidate) ? candidate.toUpperCase() : null);
    // A bare "s", "m" or "l" is far more likely to be a stray letter than a
    // size, so those only count when the word "size" precedes them.
    if (!mapped) continue;
    if (candidate.length === 1 && !after) continue;
    consumed[i] = true;
    if (after) consumed[i + 1] = true;
    pushNode(nodes, {
      kind: 'size',
      value: mapped,
      span: after ? `${tok} ${after}` : tok,
      confidence: after ? 0.9 : 0.7,
      via: 'pattern',
      note: after ? `"${tok} ${after}" names a size on the apparel ladder` : `"${tok}" is a size on the apparel ladder`,
    });
  }

  /*
   * PROPAGATION, on the same two constants the profile fold uses.
   *
   * Importing them rather than picking new ones is the point: a player implying
   * a team has to mean the same thing in the search box as it does in the
   * profile, or the panel is explaining two different models with one word.
   */
  for (const n of nodes.filter((x) => x.kind === 'player')) {
    const team = TEAMS.find((t) => t.players.some((p) => p.name === n.value));
    if (!team) continue;
    pushNode(nodes, {
      kind: 'team',
      value: team.id,
      span: '',
      confidence: n.confidence * PLAYER_TO_TEAM_DAMPING,
      via: 'propagated',
      note: `${n.value} plays for the ${team.id}, so the club follows from the player`,
    });
  }
  for (const n of nodes.filter((x) => x.kind === 'team')) {
    const team = TEAM_BY_ID[n.value as TeamId];
    if (!team) continue;
    pushNode(nodes, {
      kind: 'league',
      value: team.league,
      span: '',
      confidence: n.confidence * TEAM_TO_LEAGUE_DAMPING,
      via: 'propagated',
      note: `the ${team.id} play in the ${team.league}, so the league follows from the club`,
    });
  }

  const unmatched = tokens.filter((t, i) => !consumed[i] && !STOPWORDS.has(t));

  return {
    raw,
    normalized,
    tokens,
    nodes,
    unmatched,
    empty: nodes.length === 0,
    giftIntent: nodes.some((n) => n.kind === 'giftIntent'),
  };
}

/* ------------------------------------------------------------------ */
/* Stage 3: retrieval, with the zero-result rescue                     */
/* ------------------------------------------------------------------ */

const effPrice = (p: Product) => p.salePrice ?? p.price;

const FIELD_OF: Partial<Record<QueryNodeKind, (p: Product) => string[]>> = {
  player: (p) => (p.player ? [p.player] : []),
  team: (p) => [p.team],
  league: (p) => [p.league],
  department: (p) => [p.department],
  subdepartment: (p) => [p.subdepartment],
  brand: (p) => [p.brand],
  gender: (p) => [p.gender],
  ageGroup: (p) => [p.ageGroup],
  size: (p) => p.sizes ?? [],
};

const CONSTRAINT_LABEL: Record<string, string> = {
  player: 'Player',
  team: 'Team',
  league: 'League',
  department: 'Category',
  subdepartment: 'Product type',
  brand: 'Brand',
  gender: 'Gender',
  ageGroup: 'Age',
  size: 'Size',
  priceCeiling: 'Price ceiling',
};

const satisfies = (p: Product, c: SearchConstraint): boolean => {
  if (c.kind === 'priceCeiling') {
    const cap = Math.min(...c.values.map(Number));
    return effPrice(p) <= cap;
  }
  const read = FIELD_OF[c.kind];
  if (!read) return true;
  const have = read(p);
  return have.some((v) => c.values.includes(v));
};

/** Groups nodes into AND-ed constraints. giftIntent is a modifier, not a filter. */
export function constraintsFrom(interp: QueryInterpretation): SearchConstraint[] {
  const byKind = new Map<QueryNodeKind, QueryNode[]>();
  for (const n of interp.nodes) {
    if (n.kind === 'giftIntent') continue;
    const list = byKind.get(n.kind) ?? [];
    list.push(n);
    byKind.set(n.kind, list);
  }
  const out: SearchConstraint[] = [];
  for (const [kind, list] of byKind) {
    const values = list.map((n) => n.value);
    out.push({
      kind,
      values,
      confidence: Math.max(...list.map((n) => n.confidence)),
      label: `${CONSTRAINT_LABEL[kind] ?? kind}: ${
        kind === 'priceCeiling' ? `under $${Math.min(...values.map(Number))}` : values.join(' or ')
      }`,
    });
  }
  return out;
}

export interface SearchOptions {
  profile: VisitorProfile | null;
  personalized: boolean;
  /** How many hits to decompose. The full matched set is always returned. */
  explainTop?: number;
}

/**
 * Weights on the profile terms for search ranking.
 *
 * Lower on department than the Recommended sort (ml/ranking.ts) on purpose: on
 * a listing page the department is a guess, and in a search box the shopper has
 * usually just said it out loud. Player carries the most because it is the
 * axis the query is most often about and the one the intent model cannot see.
 */
export const SEARCH_WEIGHTS = { team: 1.4, department: 0.8, player: 1.6 } as const;

/** Credit a surviving product gets for still satisfying a dropped constraint. */
const SOFT_CREDIT = 0.4;

function scoreHit(
  p: Product,
  aff: ProfileAffinities,
  dropped: SearchConstraint[],
  personalized: boolean,
  gift: boolean
): SearchScore {
  const relevance = 0.5 + 0.5 * (p.popularity / 100);

  let soft = 0;
  const drivers: { label: string; contribution: number }[] = [];
  for (const c of dropped) {
    if (!satisfies(p, c)) continue;
    const add = SOFT_CREDIT * c.confidence;
    soft += add;
    drivers.push({ label: `still matches ${c.label}`, contribution: add });
  }

  let personal = 1;
  if (personalized) {
    const tp = aff.team.get(p.team) ?? 0;
    const dp = aff.department.get(p.department) ?? 0;
    const pp = p.player ? (aff.player.get(p.player) ?? 0) : 0;
    if (tp > 0) {
      personal += SEARCH_WEIGHTS.team * tp;
      drivers.push({ label: `P(${p.team}) = ${(tp * 100).toFixed(0)}%`, contribution: SEARCH_WEIGHTS.team * tp });
    }
    if (dp > 0) {
      personal += SEARCH_WEIGHTS.department * dp;
      drivers.push({
        label: `P(${p.department}) = ${(dp * 100).toFixed(0)}%`,
        contribution: SEARCH_WEIGHTS.department * dp,
      });
    }
    // The gift rule. Somebody buying for their son is not served by their own
    // favourite player, so that term is not applied - and the panel says so
    // rather than the term quietly evaluating to a smaller number.
    if (pp > 0 && !gift) {
      personal += SEARCH_WEIGHTS.player * pp;
      drivers.push({ label: `P(${p.player}) = ${(pp * 100).toFixed(0)}%`, contribution: SEARCH_WEIGHTS.player * pp });
    }
  }

  return { relevance, soft, personal, total: (relevance + soft) * personal, drivers };
}

/**
 * Retrieval and ranking, with the rescue ladder.
 *
 * THE LADDER. Constraints are AND-ed. If that returns nothing, the LEAST
 * confident one is dropped and the query is run again - and the dropped
 * constraint does not disappear, it becomes a soft ranking credit, so a product
 * that still happens to satisfy it outranks one that does not. Repeat until
 * something comes back or nothing is left.
 *
 * When nothing is left - or when the query mapped onto no taxonomy node at all
 * - the fallback is the profile: the whole catalog, ranked by what is known
 * about this shopper. That is the difference between "0 results for xyzzy" and
 * a page of things they are actually likely to want, and it is the one place in
 * this build where a model gets to answer a question it was not asked. It is
 * labelled as such on the page for exactly that reason.
 */
export function searchCatalog(products: Product[], interp: QueryInterpretation, opts: SearchOptions): SearchResult {
  const aff = profileAffinities(opts.profile);
  const constraints = constraintsFrom(interp);

  const active = constraints.slice();
  const dropped: SearchConstraint[] = [];
  const steps: Relaxation[] = [];

  const apply = (cs: SearchConstraint[]) => products.filter((p) => cs.every((c) => satisfies(p, c)));

  let pool = apply(active);
  const matchedBeforeRescue = constraints.length > 0 ? pool.length : 0;

  while (pool.length === 0 && active.length > 0) {
    let weakest = 0;
    for (let i = 1; i < active.length; i += 1) {
      if (active[i].confidence < active[weakest].confidence) weakest = i;
    }
    const [gone] = active.splice(weakest, 1);
    dropped.push(gone);
    pool = apply(active);
    steps.push({
      constraint: gone,
      label: gone.label,
      reason: `least certain of the remaining constraints (${Math.round(gone.confidence * 100)}%)`,
      matchesAfter: pool.length,
    });
  }

  let rescue: SearchRescue | null = null;
  if (constraints.length === 0 && interp.raw.trim()) {
    pool = products;
    rescue = {
      kind: 'profile',
      headline: 'Nothing in that query mapped onto the catalog',
      detail:
        interp.unmatched.length > 0
          ? `"${interp.unmatched.join(' ')}" matches no team, player, department or brand here. Showing what the profile says this shopper wants instead of an empty page.`
          : 'Showing what the profile says this shopper wants instead of an empty page.',
      steps: [],
    };
  } else if (steps.length > 0 && active.length === 0) {
    pool = products;
    rescue = {
      kind: 'profile',
      headline: 'No product satisfies that combination',
      detail: `Every constraint had to come off. Ranked by profile affinity instead, with credit for anything that still matches part of the query.`,
      steps,
    };
  } else if (steps.length > 0) {
    rescue = {
      kind: 'relaxed',
      headline: `Relaxed ${steps.length} constraint${steps.length === 1 ? '' : 's'} to find results`,
      detail: `${steps.map((s) => s.label).join(', ')} came off. Anything that still matches keeps a ranking credit for it.`,
      steps,
    };
  }

  const scored = pool.map((p) => ({
    product: p,
    score: scoreHit(p, aff, dropped, opts.personalized, interp.giftIntent),
    defaultScore: scoreHit(p, aff, dropped, false, interp.giftIntent).total,
  }));

  const byDefault = scored.slice().sort((a, b) => b.defaultScore - a.defaultScore || b.product.popularity - a.product.popularity);
  const defaultRank = new Map(byDefault.map((s, i) => [s.product.id, i + 1]));

  const ranked = scored.slice().sort((a, b) => b.score.total - a.score.total || b.product.popularity - a.product.popularity);

  const explainTop = opts.explainTop ?? 8;
  const hits: SearchHit[] = ranked.slice(0, explainTop).map((s, i) => ({
    product: s.product,
    rank: i + 1,
    defaultRank: defaultRank.get(s.product.id) ?? i + 1,
    score: s.score,
  }));

  return {
    interpretation: interp,
    constraints,
    applied: active,
    hits,
    matched: ranked.map((s) => s.product),
    defaultOrder: byDefault.map((s) => s.product),
    matchedBeforeRescue,
    rescue,
    personalized: opts.personalized,
  };
}

/** Interpret and retrieve in one call. */
export function runQuery(products: Product[], raw: string, opts: SearchOptions): SearchResult {
  return searchCatalog(products, interpretQuery(raw), opts);
}

/* ------------------------------------------------------------------ */
/* Autocomplete                                                        */
/* ------------------------------------------------------------------ */

/**
 * One row in the dropdown.
 *
 * `rank` and `defaultRank` are both carried because the interesting thing about
 * a personalized suggestion list is not where a row is, it is where it WOULD
 * have been. That pair is what the effort ledger reads when a shopper picks
 * one, and it is why the dropdown can say "moved up 3" without inventing a
 * counterfactual after the fact.
 */
export interface Suggestion {
  id: string;
  /** `scope` runs a search; `product` opens a PDP. */
  kind: 'scope' | 'product';
  /** The text this row puts in the box when chosen. */
  query: string;
  label: string;
  sublabel: string | null;
  product?: Product;
  scope: { team?: TeamId; department?: Department; player?: string; league?: League };
  score: number;
  defaultScore: number;
  /** 1-based position within its band, personalized. */
  rank: number;
  /** 1-based position within its band with the profile removed. */
  defaultRank: number;
  why: string;
}

export interface SuggestResult {
  interpretation: QueryInterpretation;
  suggestions: Suggestion[];
  personalized: boolean;
  /** How many products the query as typed would return. */
  matches: number;
  /** Set when the query as typed returns nothing and the rescue would fire. */
  rescue: SearchRescue | null;
}

export interface SuggestOptions extends SearchOptions {
  maxScopes?: number;
  maxProducts?: number;
}

/**
 * The un-personalized prior a suggestion is ranked against.
 *
 * Market size for a club, assortment share for a department, roster popularity
 * for a player - all three already exist in the taxonomy as the shape of the
 * business, and using them means the default order is "what most people search"
 * rather than an arbitrary alphabetical list. Without a baseline like this,
 * "ranked by profile" is a claim with nothing on the other side of it.
 */
const teamPrior = (id: TeamId) => TEAM_BY_ID[id]?.marketSize ?? 0.5;
const deptPrior = (id: Department) => {
  const d = DEPARTMENTS.find((x) => x.id === id);
  const max = Math.max(...DEPARTMENTS.map((x) => x.assortmentWeight));
  return d ? d.assortmentWeight / max : 0.5;
};
const playerPriorOf = (name: string) => {
  for (const t of TEAMS) {
    const p = t.players.find((x) => x.name === name);
    if (p) return p.popularity;
  }
  return 0.5;
};

const topKeys = (m: Map<string, number>, n: number): string[] =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

/**
 * Personalized autocomplete.
 *
 * Two bands, each ranked on the profile and each carrying the order it would
 * have had without one:
 *
 *   SUGGESTED SEARCHES  taxonomy scopes, built by crossing whatever the query
 *                       has already pinned down with the shopper's strongest
 *                       remaining affinity. Type "jersey" and the top row is
 *                       their club's jerseys, not an alphabetical list.
 *   PRODUCTS            the head of the ranked result set for the query as
 *                       typed, through the same retrieval the results page uses
 *                       so the dropdown can never disagree with the page.
 *
 * Scopes lead deliberately. A shopper three characters into a word has not
 * chosen a product yet, and a dropdown that answers with six near-identical
 * SKUs makes them do the narrowing the store should have done.
 */
export function suggest(products: Product[], raw: string, opts: SuggestOptions): SuggestResult {
  const interp = interpretQuery(raw);
  const aff = profileAffinities(opts.profile);
  const maxScopes = opts.maxScopes ?? 4;
  const maxProducts = opts.maxProducts ?? 4;

  const result = searchCatalog(products, interp, opts);

  const personalOf = (s: Suggestion['scope']): number => {
    if (!opts.personalized) return 1;
    let v = 1;
    if (s.team) v += SEARCH_WEIGHTS.team * (aff.team.get(s.team) ?? 0);
    if (s.department) v += SEARCH_WEIGHTS.department * (aff.department.get(s.department) ?? 0);
    if (s.player && !interp.giftIntent) v += SEARCH_WEIGHTS.player * (aff.player.get(s.player) ?? 0);
    return v;
  };
  const priorOf = (s: Suggestion['scope']): number => {
    let v = 1;
    if (s.team) v += SEARCH_WEIGHTS.team * teamPrior(s.team) * 0.4;
    if (s.department) v += SEARCH_WEIGHTS.department * deptPrior(s.department) * 0.4;
    if (s.player) v += SEARCH_WEIGHTS.player * playerPriorOf(s.player) * 0.4;
    return v;
  };

  /* -- candidate taxonomy anchors: what the query has resolved, plus what the
        last word is a prefix of. Prefix candidates are what make the dropdown
        useful before a word is finished. -- */
  const lastToken = interp.tokens.length > 0 ? interp.tokens[interp.tokens.length - 1] : '';
  const typedTail = raw.endsWith(' ') ? '' : lastToken;

  interface Anchor {
    kind: 'team' | 'department' | 'player' | 'league';
    value: string;
    quality: number;
    why: string;
  }
  const anchors: Anchor[] = [];
  const seenAnchor = new Set<string>();
  const addAnchor = (a: Anchor) => {
    const key = `${a.kind}:${a.value}`;
    if (seenAnchor.has(key)) return;
    seenAnchor.add(key);
    anchors.push(a);
  };

  for (const n of interp.nodes) {
    if (n.via === 'propagated') continue;
    if (n.kind === 'team' || n.kind === 'department' || n.kind === 'player' || n.kind === 'league') {
      addAnchor({ kind: n.kind, value: n.value, quality: n.confidence, why: n.note });
    }
  }
  if (typedTail.length >= 2) {
    for (const e of LEXICON) {
      if (e.kind !== 'team' && e.kind !== 'department' && e.kind !== 'player' && e.kind !== 'league') continue;
      // Match the start of the phrase or the start of any word inside it, so
      // "hur" finds Jalen Hurts and "eag" finds the Eagles.
      const words = e.phrase.split(' ');
      if (!words.some((w) => w.startsWith(typedTail))) continue;
      addAnchor({
        kind: e.kind,
        value: e.value,
        quality: 0.8 * e.confidence,
        why: `"${typedTail}" is a prefix of ${e.value}`,
      });
      if (anchors.length > 24) break;
    }
  }

  /* -- cross each anchor with the shopper's strongest remaining affinity -- */
  const scopes: Suggestion[] = [];
  const seenQuery = new Set<string>();
  const pushScope = (s: Omit<Suggestion, 'score' | 'defaultScore' | 'rank' | 'defaultRank'>) => {
    const key = s.query.toLowerCase();
    if (seenQuery.has(key)) return;
    seenQuery.add(key);
    scopes.push({ ...s, score: personalOf(s.scope), defaultScore: priorOf(s.scope), rank: 0, defaultRank: 0 });
  };

  /*
   * What to cross an anchor with.
   *
   * With a profile, the shopper's own two strongest values. Without one, the
   * two biggest by market size and assortment share - the same priors the
   * default ordering uses, so the un-personalized dropdown is a real merchandised
   * default rather than a hard-coded club name.
   */
  const busiestTeams = TEAMS.slice()
    .sort((a, b) => b.marketSize - a.marketSize)
    .slice(0, 2)
    .map((t) => t.id as string);
  const widestDepts = DEPARTMENTS.slice()
    .sort((a, b) => b.assortmentWeight - a.assortmentWeight)
    .slice(0, 2)
    .map((d) => d.id as string);
  const topDepts = (opts.personalized ? topKeys(aff.department, 2) : []).concat(widestDepts);
  const topTeams = (opts.personalized ? topKeys(aff.team, 2) : []).concat(busiestTeams);

  for (const a of anchors.slice(0, 8)) {
    if (a.kind === 'department') {
      const dept = a.value as Department;
      pushScope({
        id: `scope:dept:${dept}`,
        kind: 'scope',
        query: dept,
        label: dept,
        sublabel: 'All teams',
        scope: { department: dept },
        why: a.why,
      });
      for (const team of topTeams.slice(0, 2)) {
        const pct = Math.round((aff.team.get(team) ?? 0) * 100);
        pushScope({
          id: `scope:${team}:${dept}`,
          kind: 'scope',
          query: `${team} ${dept}`,
          label: `${dept} · ${team}`,
          sublabel: TEAM_BY_ID[team as TeamId]?.fullName ?? null,
          scope: { team: team as TeamId, department: dept },
          why: opts.personalized
            ? `${team} sits at ${pct}% in this shopper's club posterior`
            : `${team} is one of the two largest fan bases in the catalog`,
        });
      }
    } else if (a.kind === 'team') {
      const team = a.value as TeamId;
      pushScope({
        id: `scope:team:${team}`,
        kind: 'scope',
        query: team,
        label: TEAM_BY_ID[team]?.fullName ?? team,
        sublabel: 'Everything',
        scope: { team },
        why: a.why,
      });
      for (const dept of topDepts.slice(0, 2)) {
        const pct = Math.round((aff.department.get(dept) ?? 0) * 100);
        pushScope({
          id: `scope:${team}:${dept}`,
          kind: 'scope',
          query: `${team} ${dept}`,
          label: `${dept} · ${team}`,
          sublabel: TEAM_BY_ID[team]?.fullName ?? null,
          scope: { team, department: dept as Department },
          why: opts.personalized
            ? `${dept} sits at ${pct}% in this shopper's category posterior`
            : `${dept} is one of the two widest categories in the catalog`,
        });
      }
    } else if (a.kind === 'player') {
      const player = a.value;
      const team = TEAMS.find((t) => t.players.some((p) => p.name === player));
      pushScope({
        id: `scope:player:${player}`,
        kind: 'scope',
        query: player,
        label: player,
        sublabel: team ? `${team.fullName} · everything` : null,
        scope: { player, team: team?.id },
        why: a.why,
      });
      pushScope({
        id: `scope:player:${player}:Jerseys`,
        kind: 'scope',
        query: `${player} Jerseys`,
        label: `${player} · Jerseys`,
        sublabel: team?.fullName ?? null,
        scope: { player, team: team?.id, department: 'Jerseys' },
        why: 'Jerseys is where 95% of player-attributed stock sits',
      });
    } else {
      const lg = a.value as League;
      pushScope({
        id: `scope:league:${lg}`,
        kind: 'scope',
        query: lg,
        label: `${lg} Fan Shop`,
        sublabel: 'All teams',
        scope: { league: lg },
        why: a.why,
      });
    }
  }

  /* -- products, straight off the same retrieval the results page runs -- */
  const productRows: Suggestion[] = result.hits.slice(0, maxProducts * 2).map((h) => ({
    id: `prod:${h.product.id}`,
    kind: 'product' as const,
    query: h.product.name,
    label: h.product.name,
    sublabel: `${h.product.department} · ${h.product.team}`,
    product: h.product,
    scope: {
      team: h.product.team,
      department: h.product.department,
      player: h.product.player,
    },
    score: h.score.total,
    defaultScore: h.score.relevance + h.score.soft,
    rank: 0,
    defaultRank: 0,
    why: h.score.drivers.length > 0 ? h.score.drivers[0].label : 'matched the query text',
  }));

  const rankBand = (band: Suggestion[], limit: number): Suggestion[] => {
    const byDefault = band.slice().sort((a, b) => b.defaultScore - a.defaultScore || a.label.localeCompare(b.label));
    const defaults = new Map(byDefault.map((s, i) => [s.id, i + 1]));
    return band
      .slice()
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, limit)
      .map((s, i) => ({ ...s, rank: i + 1, defaultRank: defaults.get(s.id) ?? i + 1 }));
  };

  const suggestions = [...rankBand(scopes, maxScopes), ...rankBand(productRows, maxProducts)];

  return {
    interpretation: interp,
    suggestions,
    personalized: opts.personalized,
    matches: result.matchedBeforeRescue,
    rescue: result.rescue,
  };
}
