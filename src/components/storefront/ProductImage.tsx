/**
 * Procedural merchandise imagery.
 *
 * The catalog is synthetic, so there are no photographs to show - and the brief
 * rules out fetching any, since every asset has to be local. Rather than fall
 * back on a coloured rectangle, each product is drawn as an inline SVG
 * silhouette of the actual garment, in the actual colourway, with the player's
 * number where the product has one.
 *
 * Three decisions make this read as a catalog rather than as clip art:
 *
 *  1. The silhouette comes from the *subdepartment*, not the department, so a
 *     beanie does not render as a fitted cap and a mini helmet does not render
 *     as a framed print. Neighbouring subdepartments that a shopper would
 *     actually tell apart - jersey vs tee, pullover vs full-zip - get
 *     genuinely different geometry rather than a shared blob.
 *  2. The backdrop is a neutral studio wash, not the team colour. Tinting the
 *     backdrop per team made a Midnight Green jersey disappear into a Midnight
 *     Green background; a neutral ground plus a cast shadow keeps every
 *     colourway legible and looks like a product shot.
 *  3. Trim and contour colours are derived from the body colour's luminance, so
 *     a white jersey gets dark trim and a navy one gets light trim. Every
 *     garment also carries a contour stroke, which is what stops a white
 *     product from vanishing against the light ground.
 *
 * Per-product variation (stripe treatment, sleeve accent) is keyed off a hash
 * of the product id, so a given product always looks the same - the imagery is
 * as deterministic as everything else in the prototype.
 */

import React from 'react';
import { Product } from '../../types';
import { hashString } from '../../sim/rng';

/**
 * Colourway name to hex. The generator stores the colourway as a display
 * string because that is what a merchandising feed carries; this is where it
 * becomes pixels.
 */
const COLORWAY_HEX: Record<string, string> = {
  'Midnight Green': '#004C54',
  'Kelly Green Throwback': '#00703C',
  Black: '#17191c',
  White: '#f4f6f8',
  Silver: '#a8b0b4',
  'Royal Blue': '#1d55b5',
  'City Edition Cream': '#ece0c2',
  Red: '#c8102e',
  Navy: '#16234c',
  'Powder Blue Throwback': '#9bcbeb',
  'Cream Alternate': '#efe5d0',
  'Royal Throwback': '#2a4fa2',
  Gold: '#e0b13c',
  'Sideline Grey': '#6b7376',
  Purple: '#552583',
  'Black Mamba': '#1a1a1e',
  'City Edition Navy': '#1b2a52',
};

/** Perceived luminance in [0,1]. Used to decide light-on-dark vs dark-on-light. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mixes a colour toward black (amount < 0) or white (amount > 0). */
function shade(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const to = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (to - c) * t);
  const r = mix(parseInt(h.slice(0, 2), 16));
  const g = mix(parseInt(h.slice(2, 4), 16));
  const b = mix(parseInt(h.slice(4, 6), 16));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

interface Palette {
  /** Garment body. */
  body: string;
  /** Slightly darker body, for the shaded side and for panelling. */
  bodyShade: string;
  /** Contour stroke - keeps light garments off the light ground. */
  contour: string;
  /** Trim, collar and stripe colour; always contrasts with the body. */
  trim: string;
  /** Numbers and wordmarks, sitting on the body. */
  ink: string;
  /** A near-neutral dark, for stands, bases and hardware. */
  dark: string;
  /** Team accent, used sparingly where the garment has no other colour. */
  accent: string;
}

function buildPalette(product: Product): Palette {
  const body = COLORWAY_HEX[product.colorway ?? ''] ?? product.primaryColor;
  const isLightBody = luminance(body) > 0.55;

  // The team's secondary colour is the natural trim, but only if it actually
  // contrasts with the body - a white jersey with white trim is invisible.
  const secondary = product.secondaryColor;
  const trim =
    Math.abs(luminance(secondary) - luminance(body)) > 0.22
      ? secondary
      : isLightBody
        ? shade(product.primaryColor, -0.15)
        : '#ffffff';

  return {
    body,
    bodyShade: shade(body, isLightBody ? -0.09 : -0.2),
    contour: shade(body, isLightBody ? -0.32 : 0.1),
    trim,
    ink: isLightBody ? shade(product.primaryColor, -0.1) : '#ffffff',
    dark: '#2b3444',
    accent: product.primaryColor,
  };
}

/** Chooses the silhouette from the subdepartment, falling back to department. */
type Silhouette =
  | 'jersey'
  | 'tee'
  | 'longsleeve'
  | 'hoodie'
  | 'zip'
  | 'fitted'
  | 'snapback'
  | 'trucker'
  | 'beanie'
  | 'helmet'
  | 'frame'
  | 'bobblehead'
  | 'scarf'
  | 'backpack'
  | 'sock'
  | 'drinkware'
  | 'blanket'
  | 'phonecase'
  | 'lanyard'
  | 'pennant';

function silhouetteFor(product: Product): Silhouette {
  const sub = product.subdepartment.toLowerCase();

  if (sub.includes('beanie')) return 'beanie';
  if (sub.includes('snapback')) return 'snapback';
  if (sub.includes('trucker')) return 'trucker';
  if (sub.includes('cap')) return 'fitted';
  if (sub.includes('mini helmet')) return 'helmet';
  if (sub.includes('bobblehead')) return 'bobblehead';
  if (sub.includes('photo') || sub.includes('print') || sub.includes('wall art')) return 'frame';
  if (sub.includes('scarf')) return 'scarf';
  if (sub.includes('backpack')) return 'backpack';
  if (sub.includes('sock')) return 'sock';
  if (sub.includes('phone case')) return 'phonecase';
  if (sub.includes('lanyard')) return 'lanyard';
  if (sub.includes('desk')) return 'pennant';
  if (sub.includes('drinkware')) return 'drinkware';
  if (sub.includes('blanket')) return 'blanket';
  if (sub.includes('full-zip')) return 'zip';
  // A crewneck fleece is a heavy long-sleeve; drawing it with a hood was wrong.
  if (sub.includes('crewneck') || sub.includes('long sleeve')) return 'longsleeve';
  if (sub.includes('hoodie') || sub.includes('fleece')) return 'hoodie';
  if (sub.includes('jersey')) return 'jersey';
  if (sub.includes('tee') || sub.includes('set')) return 'tee';

  switch (product.department) {
    case 'Jerseys':
      return 'jersey';
    case 'Hats':
      return 'fitted';
    case 'Hoodies':
      return 'hoodie';
    case 'Collectibles':
      return 'frame';
    case 'Accessories':
      return 'scarf';
    case 'Home & Office':
      return 'pennant';
    default:
      return 'tee';
  }
}

const BODY_PATH = 'M 70,50 L 86,44 Q 100,58 114,44 L 130,50 L 134,156 Q 100,164 66,156 Z';

/**
 * Torso garments share a cut-and-sew construction, so they share a body path;
 * the sleeve length, neckline and applied detail are what a shopper actually
 * uses to tell a jersey from a tee from a hoodie, so those are drawn per kind.
 */
function TorsoGarment({
  p,
  kind,
  number,
  stripeStyle,
}: {
  p: Palette;
  kind: 'jersey' | 'tee' | 'longsleeve' | 'hoodie' | 'zip';
  number?: string;
  stripeStyle: number;
}) {
  const longSleeved = kind === 'longsleeve' || kind === 'hoodie' || kind === 'zip';
  const hooded = kind === 'hoodie' || kind === 'zip';
  const zipped = kind === 'zip';

  const leftSleeve = longSleeved
    ? 'M 70,50 L 42,72 L 50,146 L 72,142 L 76,92 Z'
    : 'M 70,50 L 44,72 L 56,104 L 78,94 Z';
  const rightSleeve = longSleeved
    ? 'M 130,50 L 158,72 L 150,146 L 128,142 L 124,92 Z'
    : 'M 130,50 L 156,72 L 144,104 L 122,94 Z';

  return (
    <g strokeLinejoin="round">
      {/* Hood sits behind the shoulders. */}
      {hooded && (
        <>
          <path d="M 76,54 Q 100,8 124,54 Q 100,70 76,54 Z" fill={p.bodyShade} stroke={p.contour} strokeWidth="1.6" />
          <path d="M 84,52 Q 100,24 116,52 Q 100,62 84,52 Z" fill={shade(p.body, -0.4)} />
        </>
      )}

      <path d={leftSleeve} fill={p.bodyShade} stroke={p.contour} strokeWidth="1.6" />
      <path d={rightSleeve} fill={p.bodyShade} stroke={p.contour} strokeWidth="1.6" />

      {/* Cuffs on long sleeves - the detail that stops a long sleeve reading as a tube. */}
      {longSleeved && (
        <>
          <path d="M 50,138 L 72,134 L 72,142 L 50,146 Z" fill={p.trim} opacity="0.9" />
          <path d="M 150,138 L 128,134 L 128,142 L 150,146 Z" fill={p.trim} opacity="0.9" />
        </>
      )}

      <path d={BODY_PATH} fill={p.body} stroke={p.contour} strokeWidth="1.8" />

      {/* Shaded right half, for a little form. */}
      <path d="M 100,52 L 114,44 L 130,50 L 134,156 Q 118,161 100,162 Z" fill={p.bodyShade} opacity="0.34" />

      {/* --- Neckline: the fastest read on garment type --- */}
      {kind === 'jersey' && (
        <path d="M 87,44 L 100,63 L 113,44" stroke={p.trim} strokeWidth="5.5" fill="none" strokeLinecap="round" />
      )}
      {kind !== 'jersey' && (
        <path d="M 85,45 Q 100,60 115,45" stroke={p.trim} strokeWidth="6" fill="none" strokeLinecap="round" />
      )}

      {/* Jersey shoulder yokes. */}
      {kind === 'jersey' && (
        <>
          <path d="M 72,54 L 82,50 L 84,58 L 74,62 Z" fill={p.trim} opacity="0.9" />
          <path d="M 128,54 L 118,50 L 116,58 L 126,62 Z" fill={p.trim} opacity="0.9" />
        </>
      )}

      {/* Hoodie hardware: kangaroo pocket, drawstrings, and a zip on full-zips. */}
      {hooded && (
        <>
          <path d="M 76,116 L 124,116 L 128,144 L 72,144 Z" fill={p.bodyShade} stroke={p.contour} strokeWidth="1.2" opacity="0.85" />
          <path d="M 93,58 L 93,84" stroke={p.trim} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M 107,58 L 107,84" stroke={p.trim} strokeWidth="3.4" strokeLinecap="round" />
        </>
      )}
      {zipped && (
        <>
          <rect x="97" y="52" width="6" height="104" fill={p.trim} opacity="0.95" />
          <rect x="96" y="60" width="8" height="9" rx="2" fill={p.dark} />
        </>
      )}

      {/* Applied striping. Jerseys and tees carry it; a hoodie front stays clean
          so the pocket and drawstrings remain the dominant read. */}
      {!hooded && stripeStyle === 0 && (
        <>
          <path d="M 67,126 Q 100,133 133,126 L 133,132 Q 100,139 67,132 Z" fill={p.trim} opacity="0.9" />
          <path d="M 67,138 Q 100,145 133,138 L 133,144 Q 100,151 67,144 Z" fill={p.trim} opacity="0.9" />
        </>
      )}
      {!hooded && stripeStyle === 1 && (
        <>
          <path d={longSleeved ? 'M 51,126 L 72,122 L 72,130 L 52,134 Z' : 'M 50,88 L 74,78 L 77,86 L 53,96 Z'} fill={p.trim} />
          <path d={longSleeved ? 'M 149,126 L 128,122 L 128,130 L 148,134 Z' : 'M 150,88 L 126,78 L 123,86 L 147,96 Z'} fill={p.trim} />
        </>
      )}

      {/* Ribbed hem. */}
      <path d="M 66,148 Q 100,156 134,148 L 134,156 Q 100,164 66,156 Z" fill={p.trim} opacity="0.7" />

      {number && !zipped && (
        <text
          x="100"
          y={hooded ? 108 : 116}
          textAnchor="middle"
          fontSize="44"
          fontWeight="900"
          fill={p.ink}
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="-2"
        >
          {number}
        </text>
      )}
    </g>
  );
}

function Shape({
  kind,
  p,
  number,
  uid,
}: {
  kind: Silhouette;
  p: Palette;
  number?: string;
  /** Unique per product - SVG ids are document-scoped, not per-<svg>. */
  uid: string;
}) {
  switch (kind) {
    case 'fitted':
    case 'snapback':
    case 'trucker': {
      // A trucker has a foam front and mesh side panels; a snapback has a flat
      // brim and a plastic closure. Those are the details a shopper sorts on.
      const flatBrim = kind !== 'fitted';
      const front = kind === 'trucker' ? shade(p.body, 0.42) : p.body;
      return (
        <g strokeLinejoin="round">
          <defs>
            <pattern id={`mesh-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse">
              <rect width="7" height="7" fill={p.body} />
              <circle cx="3.5" cy="3.5" r="1.5" fill={shade(p.body, 0.35)} />
            </pattern>
          </defs>

          <path d="M 52,116 Q 52,50 100,50 Q 148,50 148,116 Z" fill={kind === 'trucker' ? `url(#mesh-${uid})` : p.body} stroke={p.contour} strokeWidth="1.8" />
          {/* Front panels */}
          <path d="M 68,116 Q 68,52 100,50 Q 132,52 132,116 Z" fill={front} stroke={p.contour} strokeWidth="1.4" />
          <path d="M 100,50 Q 132,52 132,116 L 100,116 Z" fill={shade(front, -0.12)} opacity="0.5" />
          <path d="M 100,50 L 100,116" stroke={p.contour} strokeWidth="1.4" opacity="0.45" />

          {flatBrim ? (
            <path d="M 46,113 L 154,113 Q 158,140 100,146 Q 42,140 46,113 Z" fill={p.bodyShade} stroke={p.contour} strokeWidth="1.8" />
          ) : (
            <path d="M 47,113 Q 100,124 153,113 Q 160,138 100,152 Q 40,138 47,113 Z" fill={p.bodyShade} stroke={p.contour} strokeWidth="1.8" />
          )}
          {kind === 'snapback' && <rect x="72" y="118" width="56" height="5" rx="2.5" fill={p.trim} opacity="0.7" />}

          <circle cx="100" cy="52" r="5" fill={p.trim} />
          {number && (
            <text x="100" y="100" textAnchor="middle" fontSize="30" fontWeight="900" fill={luminance(front) > 0.55 ? shade(p.accent, -0.1) : '#ffffff'} fontFamily="system-ui, sans-serif">
              {number}
            </text>
          )}
        </g>
      );
    }

    case 'beanie':
      return (
        <g strokeLinejoin="round">
          <path d="M 58,126 Q 58,50 100,50 Q 142,50 142,126 Z" fill={p.body} stroke={p.contour} strokeWidth="1.8" />
          <path d="M 100,50 Q 142,50 142,126 L 100,126 Z" fill={p.bodyShade} opacity="0.35" />
          <path d="M 78,56 Q 74,92 76,126 M 122,56 Q 126,92 124,126" stroke={p.contour} strokeWidth="1.2" fill="none" opacity="0.4" />
          <rect x="54" y="124" width="92" height="28" rx="9" fill={p.trim} stroke={p.contour} strokeWidth="1.6" />
          <circle cx="100" cy="44" r="13" fill={p.trim} stroke={p.contour} strokeWidth="1.4" />
        </g>
      );

    case 'helmet':
      return (
        <g strokeLinejoin="round">
          {/* Facemask first, so the cage reads as sitting in front of the shell. */}
          <path d="M 58,96 Q 62,140 100,142 Q 138,140 142,96" stroke={p.dark} strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M 64,120 Q 100,132 136,120" stroke={p.dark} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M 100,104 L 100,141" stroke={p.dark} strokeWidth="5" strokeLinecap="round" />
          <path d="M 52,102 Q 52,38 100,38 Q 148,38 148,102 Q 128,112 100,112 Q 72,112 52,102 Z" fill={p.body} stroke={p.contour} strokeWidth="1.8" />
          <path d="M 100,38 Q 148,38 148,102 Q 127,111 100,112 Z" fill={p.bodyShade} opacity="0.35" />
          <rect x="92" y="38" width="16" height="72" fill={p.trim} opacity="0.9" />
          <circle cx="70" cy="92" r="6" fill={p.dark} opacity="0.55" />
          {/* Display stand */}
          <rect x="88" y="140" width="24" height="12" fill={p.dark} />
          <rect x="64" y="150" width="72" height="13" rx="3" fill={shade(p.dark, 0.18)} stroke={p.dark} strokeWidth="1.4" />
        </g>
      );

    case 'bobblehead':
      return (
        <g strokeLinejoin="round">
          <circle cx="100" cy="60" r="28" fill="#e8b98f" stroke={shade('#e8b98f', -0.3)} strokeWidth="1.5" />
          <circle cx="91" cy="58" r="2.6" fill={p.dark} />
          <circle cx="109" cy="58" r="2.6" fill={p.dark} />
          <path d="M 92,70 q 8,6 16,0" stroke={p.dark} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M 72,54 Q 100,26 128,54 Q 100,44 72,54 Z" fill={p.body} stroke={p.contour} strokeWidth="1.5" />
          <rect x="94" y="86" width="12" height="10" fill="#dca77a" />
          <path d="M 74,126 Q 74,96 100,96 Q 126,96 126,126 L 126,146 L 74,146 Z" fill={p.body} stroke={p.contour} strokeWidth="1.6" />
          <ellipse cx="100" cy="152" rx="40" ry="10" fill={p.dark} />
          <ellipse cx="100" cy="149" rx="40" ry="10" fill={shade(p.dark, 0.2)} />
          {number && (
            <text x="100" y="128" textAnchor="middle" fontSize="20" fontWeight="900" fill={p.ink} fontFamily="system-ui, sans-serif">
              {number}
            </text>
          )}
        </g>
      );

    case 'frame':
      return (
        <g strokeLinejoin="round">
          <rect x="42" y="42" width="116" height="116" rx="3" fill={p.dark} />
          <rect x="48" y="48" width="104" height="104" fill="#ffffff" />
          <rect x="58" y="58" width="84" height="84" fill={shade(p.accent, 0.55)} stroke={shade(p.accent, 0.2)} strokeWidth="1" />
          {/* A player silhouette, so a signed photo is not an empty mat. Drawn in
              the team accent: the colourway here names the mat, not the subject,
              so a White or Cream print would otherwise be blank. */}
          <circle cx="100" cy="82" r="11" fill={p.accent} />
          <path d="M 80,142 Q 80,100 100,100 Q 120,100 120,142 Z" fill={p.accent} />
          <path d="M 68,132 q 12,-12 22,-2 q 10,10 22,-4" stroke={shade(p.accent, -0.4)} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </g>
      );

    case 'scarf':
      return (
        <g strokeLinejoin="round">
          <path d="M 70,44 L 96,44 L 96,148 L 70,162 Z" fill={p.body} stroke={p.contour} strokeWidth="1.6" />
          <path d="M 104,44 L 130,44 L 130,162 L 104,148 Z" fill={p.bodyShade} stroke={p.contour} strokeWidth="1.6" />
          {[72, 104, 132].map((y) => (
            <g key={y}>
              <rect x="70" y={y} width="26" height="11" fill={p.trim} />
              <rect x="104" y={y} width="26" height="11" fill={p.trim} />
            </g>
          ))}
          <rect x="66" y="38" width="68" height="11" rx="3" fill={p.trim} stroke={p.contour} strokeWidth="1.4" />
        </g>
      );

    case 'backpack':
      return (
        <g strokeLinejoin="round">
          {/* Straps swing outside the shell, or the body path hides them. */}
          <path d="M 76,48 Q 28,86 56,140 M 124,48 Q 172,86 144,140" stroke={p.bodyShade} strokeWidth="11" fill="none" strokeLinecap="round" />
          <path d="M 76,48 Q 28,86 56,140 M 124,48 Q 172,86 144,140" stroke={p.trim} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.9" />
          <path d="M 58,74 Q 58,42 100,42 Q 142,42 142,74 L 142,150 Q 100,158 58,150 Z" fill={p.body} stroke={p.contour} strokeWidth="1.8" />
          <path d="M 100,42 Q 142,42 142,74 L 142,150 Q 121,154 100,155 Z" fill={p.bodyShade} opacity="0.35" />
          <path d="M 58,74 Q 100,86 142,74" stroke={p.contour} strokeWidth="1.6" fill="none" opacity="0.6" />
          <rect x="70" y="102" width="60" height="36" rx="7" fill={p.bodyShade} stroke={p.contour} strokeWidth="1.5" />
          <rect x="70" y="102" width="60" height="9" rx="3" fill={p.trim} />
          <circle cx="100" cy="122" r="4" fill={p.trim} />
        </g>
      );

    case 'sock':
      return (
        <g strokeLinejoin="round">
          <path d="M 76,38 L 120,38 L 120,112 Q 120,132 140,136 L 152,139 L 152,162 L 116,162 Q 76,158 76,120 Z" fill={p.body} stroke={p.contour} strokeWidth="1.8" />
          <rect x="76" y="38" width="44" height="13" fill={p.trim} />
          <rect x="76" y="60" width="44" height="9" fill={p.trim} opacity="0.85" />
          <rect x="76" y="78" width="44" height="9" fill={p.trim} opacity="0.85" />
          <path d="M 118,140 L 152,148" stroke={p.trim} strokeWidth="7" opacity="0.8" />
        </g>
      );

    case 'drinkware':
      return (
        <g strokeLinejoin="round">
          <path d="M 128,72 q 26,4 26,26 q 0,22 -26,26" stroke={p.dark} strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.5" />
          <path d="M 72,48 L 128,48 L 121,158 L 79,158 Z" fill={p.body} stroke={p.contour} strokeWidth="1.8" />
          <path d="M 100,48 L 128,48 L 121,158 L 100,158 Z" fill={p.bodyShade} opacity="0.35" />
          <rect x="70" y="42" width="60" height="11" rx="4" fill={p.trim} stroke={p.contour} strokeWidth="1.4" />
          <rect x="78" y="86" width="45" height="30" fill={p.trim} opacity="0.9" />
          {number && (
            <text x="100" y="109" textAnchor="middle" fontSize="21" fontWeight="900" fill={p.body} fontFamily="system-ui, sans-serif">
              {number}
            </text>
          )}
        </g>
      );

    case 'blanket':
      return (
        <g strokeLinejoin="round">
          <path d="M 40,56 Q 100,42 160,56 L 160,148 Q 100,162 40,148 Z" fill={p.body} stroke={p.contour} strokeWidth="1.8" />
          <path d="M 40,80 Q 100,66 160,80" stroke={p.trim} strokeWidth="8" fill="none" />
          <path d="M 40,108 Q 100,94 160,108" stroke={p.trim} strokeWidth="8" fill="none" opacity="0.8" />
          <path d="M 40,136 Q 100,122 160,136" stroke={p.trim} strokeWidth="8" fill="none" opacity="0.6" />
          {/* Fringe */}
          {[46, 58, 70, 82, 94, 106, 118, 130, 142, 154].map((x) => (
            <path key={x} d={`M ${x},${150 + (x < 100 ? (100 - x) * 0.06 : (x - 100) * 0.06)} l 0,9`} stroke={p.trim} strokeWidth="2.4" strokeLinecap="round" />
          ))}
        </g>
      );

    case 'phonecase':
      return (
        <g strokeLinejoin="round">
          <rect x="66" y="30" width="68" height="140" rx="14" fill={p.body} stroke={p.contour} strokeWidth="1.8" />
          <path d="M 100,30 L 120,30 Q 134,30 134,44 L 134,156 Q 134,170 120,170 L 100,170 Z" fill={p.bodyShade} opacity="0.3" />
          {/* Camera island and side buttons - what makes this read as a phone. */}
          <rect x="76" y="40" width="32" height="34" rx="9" fill={p.bodyShade} stroke={p.contour} strokeWidth="1.4" />
          <circle cx="86" cy="50" r="6" fill={p.dark} />
          <circle cx="98" cy="50" r="6" fill={p.dark} />
          <circle cx="86" cy="64" r="6" fill={p.dark} />
          <rect x="62" y="60" width="5" height="18" rx="2" fill={p.contour} />
          <rect x="62" y="84" width="5" height="26" rx="2" fill={p.contour} />
          <rect x="66" y="104" width="68" height="30" fill={p.trim} opacity="0.9" />
          {number && (
            <text x="100" y="127" textAnchor="middle" fontSize="22" fontWeight="900" fill={p.body} fontFamily="system-ui, sans-serif">
              {number}
            </text>
          )}
        </g>
      );

    case 'lanyard':
      return (
        <g strokeLinejoin="round">
          {/* Neck loop, then the clip and badge holder hanging off it. */}
          <path d="M 100,120 L 62,36 Q 100,20 138,36 L 100,120 Z" fill="none" stroke={p.body} strokeWidth="11" strokeLinecap="round" />
          <path d="M 100,120 L 62,36 Q 100,20 138,36 L 100,120 Z" fill="none" stroke={p.trim} strokeWidth="3.4" strokeLinecap="round" opacity="0.85" />
          <rect x="92" y="112" width="16" height="16" rx="3" fill={p.dark} />
          <rect x="76" y="126" width="48" height="42" rx="4" fill={shade(p.body, 0.55)} stroke={p.contour} strokeWidth="1.6" />
          <rect x="82" y="134" width="36" height="6" rx="3" fill={p.accent} opacity="0.8" />
          <rect x="82" y="146" width="26" height="5" rx="2.5" fill={p.dark} opacity="0.45" />
          <rect x="82" y="156" width="32" height="5" rx="2.5" fill={p.dark} opacity="0.3" />
        </g>
      );

    case 'pennant':
      return (
        <g strokeLinejoin="round">
          <path d="M 48,60 L 158,100 L 48,140 Z" fill={p.body} stroke={p.contour} strokeWidth="1.8" />
          <rect x="40" y="52" width="11" height="96" rx="3" fill={p.trim} stroke={p.contour} strokeWidth="1.4" />
          <path d="M 51,86 L 106,100 L 51,114 Z" fill={p.trim} opacity="0.9" />
        </g>
      );

    default:
      return null;
  }
}

export interface ProductImageProps {
  product: Product;
  className?: string;
  /** Renders the number and finer trim; turn off for very small thumbnails. */
  detail?: boolean;
}

export const ProductImage: React.FC<ProductImageProps> = ({ product, className, detail = true }) => {
  const palette = buildPalette(product);
  const kind = silhouetteFor(product);
  const seed = hashString(product.id);
  const stripeStyle = seed % 3;
  const gradientId = `pi-bg-${product.id}`;

  const number = detail ? product.jerseyNumber : undefined;
  const isTorso =
    kind === 'jersey' || kind === 'tee' || kind === 'longsleeve' || kind === 'hoodie' || kind === 'zip';

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={product.name}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="70" y2="200">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dee4ec" />
        </linearGradient>
        <radialGradient id={`${gradientId}-tint`} gradientUnits="userSpaceOnUse" cx="100" cy="64" r="124">
          <stop offset="0%" stopColor={palette.accent} stopOpacity="0.16" />
          <stop offset="100%" stopColor={palette.accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Neutral studio ground with the faintest team tint behind the product.
          Deliberately oversized: with preserveAspectRatio="meet" the viewBox is
          letterboxed inside non-square tiles, and a 200x200 backdrop would leave
          bare strips down the sides. */}
      <rect x="-300" y="-300" width="800" height="800" fill={`url(#${gradientId})`} />
      <rect x="-300" y="-300" width="800" height="800" fill={`url(#${gradientId}-tint)`} />

      {/* Cast shadow, so the garment sits on the ground instead of floating. */}
      <ellipse cx="100" cy="172" rx="54" ry="8" fill="#0f172a" opacity="0.14" />

      {isTorso ? (
        <TorsoGarment p={palette} kind={kind} number={number} stripeStyle={stripeStyle} />
      ) : (
        <Shape kind={kind} p={palette} number={number} uid={product.id} />
      )}
    </svg>
  );
};
