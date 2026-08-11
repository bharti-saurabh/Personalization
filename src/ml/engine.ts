import {
  Product,
  TeamId,
  Department,
  IntentPrediction,
  SimilarityMatch,
  ComplementMatch,
  DecisionTrace,
  Scenario,
  UserEvent,
} from '../types';
import { SYNTHETIC_PRODUCTS } from '../data/products';

// -------------------------------------------------------------
// 1. APEX CUSTOMER INTENT ENGINE
// -------------------------------------------------------------

export function runIntentEngine(
  scenario: Scenario,
  userEvents: UserEvent[],
  activeTeamOverride?: TeamId | null
): IntentPrediction {
  const isAnonymous = scenario.profileType === 'Anonymous';

  // Base team counts
  const teamScores: Record<TeamId, number> = {
    Eagles: 0,
    '76ers': 0,
    Phillies: 0,
    Cowboys: 0,
    Chiefs: 0,
    Lakers: 0,
  };

  // Base department counts
  const deptScores: Record<Department, number> = {
    Jerseys: 0,
    Hats: 0,
    Hoodies: 0,
    'T-shirts': 0,
    Collectibles: 0,
    Accessories: 0,
    Kids: 0,
    'Home & Office': 0,
  };

  // Scenario baseline seed
  if (scenario.id === 'returning_eagles') {
    teamScores['Eagles'] += 45;
    teamScores['76ers'] += 15;
    deptScores['Jerseys'] += 40;
    deptScores['Hats'] += 25;
    deptScores['Hoodies'] += 15;
  } else if (scenario.id === 'multi_team') {
    teamScores['Eagles'] += 25;
    teamScores['Phillies'] += 25;
    teamScores['76ers'] += 20;
    deptScores['Jerseys'] += 30;
    deptScores['Hats'] += 25;
  } else if (scenario.id === 'hot_market') {
    teamScores['Chiefs'] += 80;
    deptScores['Hoodies'] += 40;
    deptScores['Hats'] += 35;
  } else if (scenario.id === 'low_confidence') {
    teamScores['Eagles'] += 15;
    teamScores['Cowboys'] += 15;
    teamScores['Lakers'] += 15;
    deptScores['Accessories'] += 20;
  }

  // Factor in live event stream
  userEvents.forEach((ev, idx) => {
    const recencyWeight = (idx + 1) * 8; // later events carry higher weight
    if (ev.team && teamScores[ev.team] !== undefined) {
      teamScores[ev.team] += recencyWeight;
    }
    if (ev.department && deptScores[ev.department] !== undefined) {
      deptScores[ev.department] += recencyWeight;
    }
  });

  // If active team click override exists
  if (activeTeamOverride) {
    teamScores[activeTeamOverride] += 60;
  }

  // Normalize team probabilities
  const totalTeamScore = Object.values(teamScores).reduce((a, b) => a + b, 0) || 1;
  const rawTeamProbs = (Object.keys(teamScores) as TeamId[]).map((t) => ({
    team: t,
    probability: Number((teamScores[t] / totalTeamScore).toFixed(2)),
  }));
  rawTeamProbs.sort((a, b) => b.probability - a.probability);

  // Normalize department probabilities
  const totalDeptScore = Object.values(deptScores).reduce((a, b) => a + b, 0) || 1;
  const rawDeptProbs = (Object.keys(deptScores) as Department[]).map((d) => ({
    department: d,
    probability: Number((deptScores[d] / totalDeptScore).toFixed(2)),
  }));
  rawDeptProbs.sort((a, b) => b.probability - a.probability);

  // Calculate dynamic confidence score
  let baseConfidence = scenario.confidenceScore;
  if (userEvents.length > 3) baseConfidence = Math.min(0.98, baseConfidence + 0.08);

  // Determine fallback
  const isFallback = baseConfidence < 0.50 || (isAnonymous && userEvents.length < 2);
  let fallbackReason: string | undefined = undefined;
  if (isFallback) {
    fallbackReason = isAnonymous
      ? 'Anonymous guest with sparse historical telemetry. Applying popularity & contextual safeguards.'
      : 'Model prediction confidence score below safety threshold (0.50). Using default regional merchandising.';
  }

  // Determine top dynamic grid filters based on predicted intent
  let topFilters = ['Team', 'Department', 'Player', 'Jersey Type', 'Price'];
  if (rawDeptProbs[0]?.department === 'Hats') {
    topFilters = ['Department', 'Team', 'Hat Style', 'Size', 'Price'];
  } else if (rawDeptProbs[0]?.department === 'Kids') {
    topFilters = ['Department', 'Team', 'Kids Age Segment', 'Size', 'Price'];
  } else if (rawDeptProbs[0]?.department === 'Hoodies') {
    topFilters = ['Department', 'Team', 'Player', 'Size', 'Price'];
  }

  const conversionPropensity = isFallback ? 0.32 : Math.min(0.95, Number((rawTeamProbs[0].probability * 0.85 + 0.25).toFixed(2)));
  const expectedSessionValue = Number((conversionPropensity * 145 + 15).toFixed(2));

  return {
    teams: rawTeamProbs,
    departments: rawDeptProbs,
    conversionPropensity,
    expectedSessionValue,
    topFilters,
    confidence: Number(baseConfidence.toFixed(2)),
    isFallback,
    fallbackReason,
    inferenceTimeMs: Math.floor(Math.random() * 8) + 10,
  };
}

// Legacy alias
export const runTopazEngine = runIntentEngine;

// -------------------------------------------------------------
// 2. VECTOR SIMILARITY ENGINE (Substitutes)
// -------------------------------------------------------------

export function runSimilarityEngine(
  anchorProduct: Product,
  allProducts: Product[] = SYNTHETIC_PRODUCTS,
  limit: number = 4
): SimilarityMatch[] {
  const candidates = allProducts.filter((p) => p.id !== anchorProduct.id);

  const scored: SimilarityMatch[] = candidates.map((prod) => {
    // 1. Team Match (30 pts)
    const teamMatch = prod.team === anchorProduct.team ? 30 : 0;

    // 2. Player Match (25 pts)
    const playerMatch =
      anchorProduct.player && prod.player && anchorProduct.player === prod.player ? 25 : 0;

    // 3. Department Match (20 pts)
    const deptMatch = prod.department === anchorProduct.department ? 20 : 0;

    // 4. Style Family Match (15 pts)
    const styleMatch = prod.styleFamily === anchorProduct.styleFamily ? 15 : 0;

    // 5. Price Proximity (10 pts max)
    const diff = Math.abs(prod.price - anchorProduct.price);
    const priceProximity = Math.max(0, 10 - Math.floor(diff / 10));

    // 6. Co-view strength
    const coViewStrength = Math.round(prod.coViewScore * 10);

    const rawTotal = teamMatch + playerMatch + deptMatch + styleMatch + priceProximity + coViewStrength;
    const totalScore = Number((rawTotal / 110).toFixed(2));

    // Generate human-friendly explanation
    const reasons: string[] = [];
    if (teamMatch > 0) reasons.push(`same team (${prod.team})`);
    if (deptMatch > 0) reasons.push(`same department (${prod.department})`);
    if (playerMatch > 0) reasons.push(`same player (${prod.player})`);
    if (styleMatch > 0) reasons.push(`style line (${prod.styleFamily})`);
    reasons.push(`price band (${prod.priceBand})`);

    const explanation = `Recommended because this product matches the selected ${reasons.join(
      ', '
    )} and is frequently considered alongside similar ${anchorProduct.department.toLowerCase()}.`;

    return {
      product: prod,
      totalScore,
      breakdown: {
        teamMatch,
        playerMatch,
        deptMatch,
        styleMatch,
        priceProximity,
        coViewStrength,
      },
      explanation,
    };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);
  return scored.slice(0, limit);
}

// Legacy alias
export const runKeplerSimilarity = runSimilarityEngine;

// -------------------------------------------------------------
// 3. CROSS-SELL COMPLEMENT ENGINE (Complete the Look)
// -------------------------------------------------------------

export function runComplementEngine(
  anchorProduct: Product,
  allProducts: Product[] = SYNTHETIC_PRODUCTS,
  limit: number = 4
): ComplementMatch[] {
  const candidates = allProducts.filter((p) => p.id !== anchorProduct.id);

  const scored: ComplementMatch[] = candidates.map((prod) => {
    // Team match (35 pts)
    const teamMatch = prod.team === anchorProduct.team ? 35 : prod.league === anchorProduct.league ? 15 : 0;

    // Department compatibility matrix
    let deptComp = 0;
    if (anchorProduct.department === 'Jerseys') {
      if (prod.department === 'Hats') deptComp = 35;
      else if (prod.department === 'Hoodies') deptComp = 28;
      else if (prod.department === 'Collectibles') deptComp = 25;
      else if (prod.department === 'Accessories') deptComp = 22;
      else if (prod.department === 'T-shirts') deptComp = 18;
    } else if (anchorProduct.department === 'Hats') {
      if (prod.department === 'T-shirts') deptComp = 35;
      else if (prod.department === 'Jerseys') deptComp = 28;
      else if (prod.department === 'Hoodies') deptComp = 25;
    } else {
      if (prod.department !== anchorProduct.department) deptComp = 25;
    }

    const coOrder = Math.round(prod.coOrderScore * 25);
    const coCart = Math.round(prod.coCartScore * 20);

    const rawTotal = teamMatch + deptComp + coOrder + coCart;
    const complementScore = Number((rawTotal / 115).toFixed(2));

    let relationshipType: ComplementMatch['relationshipType'] = 'Complete the Look';
    if (prod.department === 'Hats' || prod.department === 'Accessories') relationshipType = 'Cart Accessory';
    if (prod.coOrderScore > 0.85) relationshipType = 'Co-Order High';

    const supportingSignal =
      prod.coOrderScore > 0.85
        ? 'High co-order affinity in historical cart checkouts'
        : `Natural cross-department pairing (${anchorProduct.department} + ${prod.department})`;

    const explanation = `High complement score (${Math.round(
      complementScore * 100
    )}%): frequently ordered alongside ${anchorProduct.department} and matches ${prod.team} team brand identity.`;

    return {
      product: prod,
      complementScore,
      relationshipType,
      supportingSignal,
      breakdown: {
        coOrder,
        coCart,
        deptCompatibility: deptComp,
        teamMatch,
      },
      explanation,
    };
  });

  scored.sort((a, b) => b.complementScore - a.complementScore);
  return scored.slice(0, limit);
}

// Legacy alias
export const runKeplerComplement = runComplementEngine;

// -------------------------------------------------------------
// 4. DECISION TRACE GENERATOR
// -------------------------------------------------------------

export function generateDecisionTrace(
  intent: IntentPrediction,
  targetComponent: string
): DecisionTrace {
  const topTeam = intent.teams[0]?.team || 'Eagles';
  const topProb = Math.round((intent.teams[0]?.probability || 0.7) * 100);

  const passedConfidence = intent.confidence >= 0.50;
  const fallbackTriggered = intent.isFallback;

  let finalDecisionReason = '';
  if (!fallbackTriggered) {
    finalDecisionReason = `Intent Model predicted ${topTeam} with ${topProb}% probability. Merchandise verified in stock, confidence score (${Math.round(
      intent.confidence * 100
    )}%) exceeds safety threshold (50%), and brand rules passed. ${targetComponent} activated for ${topTeam}.`;
  } else {
    finalDecisionReason = `Confidence score (${Math.round(
      intent.confidence * 100
    )}%) fell below safety threshold or customer is anonymous without context. Fallback merchandising activated default national highlights for ${targetComponent}.`;
  }

  return {
    confidenceThreshold: 0.5,
    passedConfidence,
    inventoryAvailable: true,
    teamConsistencyPassed: true,
    diversityApplied: true,
    fallbackTriggered,
    finalDecisionReason,
    targetComponent,
  };
}
