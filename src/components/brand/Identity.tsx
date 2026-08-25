/**
 * Visual identity for the three things a shopper navigates by: club, league and
 * department.
 *
 * Every screen in this prototype used to say "Eagles" in bold type and leave it
 * at that, which made six clubs look like six identical rows of text. A crest
 * carrying the club's own colours does the recognition work at a glance, and it
 * costs nothing extra: `primaryColor` and `secondaryColor` are already in the
 * taxonomy because the merchandise renderer needs them.
 *
 * Nothing here reads or writes model state. These are presentation primitives,
 * kept in one file so a club's colour is defined once and every surface that
 * shows that club agrees.
 *
 * NO EXTERNAL IMAGE URLS. The prototype is required to be self-contained, so
 * every mark on this page is drawn, not fetched - which also sidesteps the
 * licensing question that real club crests would raise in a de-branded demo.
 */

import React from 'react';
import { Department, League, TeamId } from '../../types';
import { TEAM_BY_ID } from '../../sim/taxonomy';
import { Medal, Backpack, Lamp, Baby, Trophy } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Clubs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * City codes, in the three-letter style sports merchandise actually uses.
 * Philadelphia fields three of the six clubs, so the code alone is ambiguous -
 * the crest always carries the league mark underneath it for that reason.
 */
const TEAM_ABBR: Record<TeamId, string> = {
  Eagles: 'PHI',
  '76ers': 'PHI',
  Phillies: 'PHI',
  Cowboys: 'DAL',
  Chiefs: 'KC',
  Lakers: 'LAL',
};

/** Shield outline, sized for a 32x36 viewBox. */
const SHIELD_PATH = 'M16 1.5 L30.5 6.2 V19 C30.5 27.5 24 32.6 16 34.5 C8 32.6 1.5 27.5 1.5 19 V6.2 Z';

const CREST_SIZE = {
  xs: { box: 'h-5 w-[18px]', label: 5.4, sub: 0 },
  sm: { box: 'h-7 w-[25px]', label: 7.6, sub: 0 },
  md: { box: 'h-9 w-8', label: 9.6, sub: 5.2 },
  lg: { box: 'h-14 w-[50px]', label: 9.4, sub: 5 },
} as const;

export interface TeamCrestProps {
  team: TeamId;
  size?: keyof typeof CREST_SIZE;
  className?: string;
}

/**
 * A club crest drawn from the club's own two colours: primary field, secondary
 * chevron, city code in white. Deliberately generic in shape - it should read
 * as "a sports club" without imitating any real licensed mark.
 */
export const TeamCrest: React.FC<TeamCrestProps> = ({ team, size = 'md', className = '' }) => {
  const cfg = TEAM_BY_ID[team];
  const s = CREST_SIZE[size];
  if (!cfg) return null;

  const gid = `crest-${team.replace(/[^a-z0-9]/gi, '')}-${size}`;

  return (
    <svg viewBox="0 0 32 36" className={`${s.box} shrink-0 ${className}`} role="img" aria-label={cfg.fullName}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cfg.primaryColor} stopOpacity="1" />
          <stop offset="100%" stopColor={cfg.primaryColor} stopOpacity="0.78" />
        </linearGradient>
        <clipPath id={`${gid}-clip`}>
          <path d={SHIELD_PATH} />
        </clipPath>
      </defs>
      <path d={SHIELD_PATH} fill={`url(#${gid})`} />
      {/* Secondary-colour chevron, clipped to the shield so it reads as part of
          the crest rather than a stripe laid across it. */}
      <g clipPath={`url(#${gid}-clip)`}>
        <path d="M-2 22 L16 14 L34 22 L34 27 L16 19 L-2 27 Z" fill={cfg.secondaryColor} opacity="0.9" />
      </g>
      <path d={SHIELD_PATH} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.1" />
      <text
        x="16"
        y={s.sub ? 12.5 : 20}
        textAnchor="middle"
        fill="#fff"
        fontSize={s.label}
        fontWeight="800"
        letterSpacing="0.4"
        fontFamily="Manrope, Inter, sans-serif"
      >
        {TEAM_ABBR[team]}
      </text>
      {s.sub > 0 && (
        <text
          x="16"
          y="30"
          textAnchor="middle"
          fill="rgba(255,255,255,0.85)"
          fontSize={s.sub}
          fontWeight="700"
          letterSpacing="0.6"
          fontFamily="Manrope, Inter, sans-serif"
        >
          {cfg.league}
        </text>
      )}
    </svg>
  );
};

/** Solid dot in the club's primary colour, for dense rows where a crest is too much. */
export const TeamDot: React.FC<{ team: TeamId; className?: string }> = ({ team, className = 'h-2.5 w-2.5' }) => {
  const cfg = TEAM_BY_ID[team];
  return (
    <span
      className={`${className} rounded-full shrink-0 ring-1 ring-black/10 inline-block`}
      style={{ background: cfg ? `linear-gradient(135deg, ${cfg.primaryColor}, ${cfg.secondaryColor})` : '#94a3b8' }}
      title={cfg?.fullName ?? ''}
    />
  );
};

/* -------------------------------------------------------------------------- */
/*  Leagues                                                                    */
/* -------------------------------------------------------------------------- */

const LEAGUE_TONE: Record<League, string> = {
  NFL: 'bg-[#0b2545] text-white',
  NBA: 'bg-[#7a1128] text-white',
  MLB: 'bg-[#0d3b66] text-white',
};

export const LeagueBadge: React.FC<{ league: League; className?: string }> = ({ league, className = '' }) => (
  <span
    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-widest ${LEAGUE_TONE[league]} ${className}`}
  >
    {league}
  </span>
);

/* -------------------------------------------------------------------------- */
/*  Departments                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Four of the eight departments are torso garments, and lucide has one shirt
 * icon between them - so a jersey, a tee and a hoodie would all render as the
 * same glyph. These are drawn instead, differing on the details a shopper
 * actually sorts by: sleeve length, neckline, hood, number panel.
 */
const Glyph: React.FC<{ d: React.ReactNode; className?: string }> = ({ d, className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
       strokeLinejoin="round" className={className} aria-hidden>
    {d}
  </svg>
);

const DEPT_GLYPH: Record<Department, (cls: string) => React.ReactNode> = {
  // Sleeveless-cut jersey with a number panel.
  Jerseys: (cls) => (
    <Glyph className={cls} d={<>
      <path d="M9 3 L6 4.5 L4 8 L6.5 9.5 L6.5 21 h11 V9.5 L20 8 L18 4.5 L15 3" />
      <path d="M9 3 a3 2.4 0 0 0 6 0" />
      <rect x="9.5" y="12" width="5" height="6" rx="1" />
    </>} />
  ),
  // Short sleeves, plain crew neck.
  'T-shirts': (cls) => (
    <Glyph className={cls} d={<>
      <path d="M9 3.5 L5.5 5 L3.5 9.5 L6.5 11 v10 h11 V11 l3-1.5 L18.5 5 L15 3.5" />
      <path d="M9 3.5 a3 2.2 0 0 0 6 0" />
    </>} />
  ),
  // Hood plus a kangaroo pocket.
  Hoodies: (cls) => (
    <Glyph className={cls} d={<>
      <path d="M8.5 4 L5 5.5 L3 10 L6 11.5 V21 h12 v-9.5 L21 10 L19 5.5 L15.5 4" />
      <path d="M8.5 4 c1 3 5.5 3 7 0" />
      <path d="M9 15 h6 v3 H9 z" />
    </>} />
  ),
  // Curved brim cap in profile.
  Hats: (cls) => (
    <Glyph className={cls} d={<>
      <path d="M4 15 a8 8 0 0 1 16 0" />
      <path d="M4 15 h17 a3 3 0 0 1-3 3 H4 z" />
      <path d="M12 7 v8" />
    </>} />
  ),
  Collectibles: (cls) => <Medal className={cls} />,
  Accessories: (cls) => <Backpack className={cls} />,
  Kids: (cls) => <Baby className={cls} />,
  'Home & Office': (cls) => <Lamp className={cls} />,
};

export const DeptGlyph: React.FC<{ department: Department; className?: string }> = ({
  department,
  className = 'h-4 w-4',
}) => <>{(DEPT_GLYPH[department] ?? ((c: string) => <Trophy className={c} />))(className)}</>;
