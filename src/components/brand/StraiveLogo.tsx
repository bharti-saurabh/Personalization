/**
 * The Straive lockup and its square mark.
 *
 * Both are the supplied artwork rather than a redrawn SVG. A hand-traced
 * approximation of someone's logo is the kind of thing that looks fine at
 * 24px and wrong at 200px, and a client-facing demo is exactly where that
 * would get noticed.
 *
 * The files are imported rather than referenced by path so Vite fingerprints
 * them and rewrites the URL for the GitHub Pages base prefix. A hard-coded
 * "/straive-logo.webp" would 404 once the app is served from a subdirectory.
 */

import React from 'react';
import logoUrl from '../../assets/straive-logo.webp';
import markUrl from '../../assets/straive-mark.webp';

/** Full horizontal lockup: mark plus wordmark. */
export const StraiveLogo: React.FC<{ className?: string }> = ({ className = 'h-5' }) => (
  <img src={logoUrl} alt="Straive" className={`${className} w-auto select-none`} draggable={false} />
);

/** Square mark only, for tight spots where the wordmark would not be legible. */
export const StraiveMark: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <img src={markUrl} alt="" aria-hidden className={`${className} object-contain select-none`} draggable={false} />
);
