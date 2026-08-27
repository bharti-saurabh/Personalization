/**
 * Lifecycle triggers: which message would fire, and every rule that stopped
 * the others.
 *
 * The on-site half of this demo shows a shopper being helped while they are
 * standing there. This screen is the other half - the part of a personalization
 * programme that runs after the session ends, into a channel the shopper did
 * not ask to be in, where a bad decision costs a great deal more than a badly
 * ordered carousel does.
 *
 * WHY THE HELD MESSAGES ARE THE POINT. A CRM screen that lists what fired can
 * be built in an afternoon and answers nothing. The question a client asks is
 * "what stops it sending", and the answer has to be six named rules with their
 * verdicts on screen, in the order they were applied, including the ones that
 * passed. Every trigger below shows its whole gate walk - not just the rule
 * that stopped it - because a rule you cannot see pass is a rule you cannot
 * trust to be there.
 *
 * WHAT COMES FROM THE SESSION AND WHAT COMES FROM THE CRM. The cart, the views,
 * the size the shopper could not have and the club they read as are all folded
 * out of this session and are not editable here. Three facts are NOT things a
 * browser holds - the visitor's local hour, how many messages the programme has
 * already sent them in the current window, and when their last session ended -
 * and those are presented as controls, marked as CRM state, so the gates can be
 * demonstrated rather than described. Moving them changes the verdicts live.
 *
 * The content gate at the end is the same `applySuppression` the storefront
 * rails use, at the two offsite policies in SURFACE_POLICIES - which sit at a
 * higher bar than any on-site rail, for the reason written into their rationale.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronRight,
  Clock,
  Mail,
  MessageSquare,
  Moon,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  BLOCK_LABEL,
  CHANNEL_RUNG,
  FREQUENCY_CAP,
  HOLDOUT_SHARE,
  LIFECYCLE_POLICY,
  QUIET_HOURS,
  TRIGGERS,
  lifecycleEffort,
  localHourIn,
  needsSubstitute,
  predictFit,
  readsAsGift,
  runLifecycle,
  withinSendingHours,
} from '../../ml/engine';
import type {
  Candidate,
  Channel,
  LifecycleSession,
  TriggerEvaluation,
} from '../../ml/engine';
import { describeEvent } from '../../sim/clock';
import type { MarketEvent } from '../../sim/clock';
import type { Product, TeamId } from '../../types';

/** The club a fired event attaches demand to. A trade attaches it to the destination. */
function teamOf(e: MarketEvent): TeamId {
  return e.kind === 'TRADE' ? e.toTeam : e.team;
}

/** Candidate pool for a message. Popularity scale, because the offsite policies gate on it. */
function poolFor(products: Product[], team: TeamId | null, subject: Product | null): Candidate[] {
  const wanted = subject?.team ?? team;
  const pool = products.filter((p) => (wanted ? p.team === wanted : true) && p.id !== subject?.id);
  return pool
    .slice()
    .sort((a, b) => b.popularity - a.popularity)
    // Over-fetch: the gate backfills, and a pool trimmed to the slot count can
    // only ever leave a hole. Same discipline as the on-site rails.
    .slice(0, 24)
    .map((p) => ({ product: p, confidence: p.popularity / 100, source: 'lifecycle pool' }));
}

const CHANNEL_ICON: Record<Channel, React.ElementType> = { email: Mail, sms: MessageSquare };

export const LifecycleTriggers: React.FC = () => {
  const {
    visitorProfile,
    identityState,
    cart,
    products,
    userEvents,
    suppressionCtx,
    visitorContext,
    firedEvents,
    recordEffort,
    isPersonalizationOn,
  } = useApp();

  /* ------------------------------------------------------------ CRM state -- */

  const realHour = useMemo(
    () => localHourIn(visitorContext.timezone ?? null, new Date()),
    [visitorContext.timezone]
  );
  const [hour, setHour] = useState<number | null>(null);
  const [sentEmail, setSentEmail] = useState(0);
  const [sentSms, setSentSms] = useState(0);
  const [lapsedDays, setLapsedDays] = useState<number | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const localHour = hour ?? realHour;

  /* -------------------------------------------------------------- session -- */

  /**
   * The session, folded out of what the shopper actually did.
   *
   * `unavailableSizes` is derived rather than logged: for every product opened
   * this session, the fit model's own prediction is the size that shopper would
   * have asked for, and `needsSubstitute` says whether they could have had it.
   * That keeps the back-in-stock trigger honest - it fires on the same size the
   * PDP prefilled and the same availability the PDP refused, rather than on a
   * separate list that could drift away from both.
   */
  const session = useMemo<LifecycleSession>(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const viewed: Product[] = [];
    for (const e of [...userEvents].reverse()) {
      if (e.pageType !== 'PDP' || !e.productId) continue;
      const p = byId.get(e.productId);
      if (p && !viewed.some((v) => v.id === p.id)) viewed.push(p);
    }

    const gift = readsAsGift(visitorProfile);
    const unavailableSizes: Record<string, string> = {};
    for (const p of viewed) {
      const fit = predictFit(p, visitorProfile, { personalized: isPersonalizationOn, giftIntent: gift });
      if (fit.size && needsSubstitute(p, fit.size)) unavailableSizes[p.id] = fit.size;
    }

    const event = firedEvents[0] ?? null;
    const team = visitorProfile.affinities.team;
    const orderedInSession = visitorProfile.state.recentPurchases.some((r) => r.daysAgo === 0);

    return {
      visitorId: visitorProfile.visitorId,
      identityState,
      cart: cart.map((i) => i.product),
      viewed,
      ordered: orderedInSession,
      unavailableSizes,
      topTeam: team.top,
      topTeamConfidence: team.confidence.value,
      marketEvent: event
        ? { id: event.id, headline: describeEvent(event).headline, team: teamOf(event) }
        : null,
      daysSinceLastSession: lapsedDays,
      lifetimeOrders: visitorProfile.state.lifetimeOrders,
      localHour,
      timezone: visitorContext.timezone ?? null,
    };
  }, [
    products,
    userEvents,
    visitorProfile,
    identityState,
    cart,
    firedEvents,
    lapsedDays,
    localHour,
    visitorContext.timezone,
    isPersonalizationOn,
  ]);

  const result = useMemo(
    () =>
      runLifecycle(session, suppressionCtx, {
        frequency: { sent: { email: sentEmail, sms: sentSms } },
        candidatesFor: (_t, subject) => poolFor(products, session.topTeam, subject),
      }),
    [session, suppressionCtx, sentEmail, sentSms, products]
  );

  /*
   * Held messages are effort avoided, and this is where that gets written.
   *
   * It is also how the registry's lifecycle card answers "last fired this
   * session" - that card has no journal step of its own and reports through the
   * ledger. `recordEffort` dedupes by id, so running this from an effect on
   * every recompute is safe.
   */
  useEffect(() => {
    if (!isPersonalizationOn) return;
    recordEffort(lifecycleEffort(result, userEvents[0]?.id ?? null));
  }, [result, isPersonalizationOn, recordEffort, userEvents]);

  const reachableSet = new Set(result.reachable);

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6 space-y-4">
      {/* Header. */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5 text-white">
        <h1 className="font-display text-lg font-black tracking-tight">Lifecycle Triggers</h1>
        <p className="mt-1 max-w-3xl text-[11.5px] leading-snug text-slate-300">
          Seven triggers evaluated against this session, each through six gates. What would send is on the left of
          every row; the rules that stopped the rest are on the right. Nothing here actually sends anything. There
          is no CRM behind this build and no address to send to.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Would fire" value={String(result.fired.length)} tone={result.fired.length ? 'good' : undefined} />
          <Stat label="Qualified, held" value={String(result.held.length)} tone={result.held.length ? 'warn' : undefined} />
          <Stat label="Dormant" value={String(result.dormant.length)} />
          <Stat
            label="Measurement arm"
            value={result.holdout ? 'Holdout' : 'Treated'}
            tone={result.holdout ? 'warn' : undefined}
          />
        </div>

        {result.holdout && (
          <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[10.5px] leading-snug text-amber-200">
            This visitor id hashes into the {Math.round(HOLDOUT_SHARE * 100)}% control arm, so the programme sends
            them nothing regardless of what qualified. The arm is assigned by a hash of the id rather than a coin
            flip, so it is the same on every render. A holdout that moves between paints is not a holdout.
          </p>
        )}
      </div>

      {/* Reachability, from the identity ladder. */}
      <div className="grid gap-2 sm:grid-cols-2">
        {(['email', 'sms'] as Channel[]).map((ch) => {
          const Icon = CHANNEL_ICON[ch];
          const open = reachableSet.has(ch);
          const hours = QUIET_HOURS[ch];
          const cap = FREQUENCY_CAP[ch];
          const policy = LIFECYCLE_POLICY[ch];
          const withinHours = withinSendingHours(ch, localHour);
          return (
            <div
              key={ch}
              className={`rounded-xl border p-3 ${open ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-100'}`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 shrink-0 ${open ? 'text-slate-800' : 'text-slate-400'}`} />
                <span className="text-[12.5px] font-extrabold uppercase tracking-wide text-slate-900">{ch}</span>
                <span
                  className={`ml-auto rounded border px-1.5 py-px text-[9px] font-black uppercase tracking-wider ${
                    open ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500'
                  }`}
                >
                  {open ? 'reachable' : `needs ${CHANNEL_RUNG[ch]}`}
                </span>
              </div>

              <div className="mt-2 space-y-1 text-[10.5px] text-slate-600">
                <Line
                  ok={withinHours}
                  icon={withinHours ? Clock : Moon}
                  text={`Sends ${hours.from}:00–${hours.until}:00 local · now ${String(localHour).padStart(2, '0')}:00`}
                />
                <Line
                  ok={(ch === 'email' ? sentEmail : sentSms) < cap.max}
                  icon={ShieldCheck}
                  text={`Cap ${cap.max} per ${cap.windowHours}h · ${ch === 'email' ? sentEmail : sentSms} already sent`}
                />
                <Line
                  ok
                  icon={ShieldCheck}
                  text={`Content bar ${policy.leadThreshold} lead / ${policy.tailThreshold} tail on ${policy.scale}, ${policy.slots} slots`}
                />
              </div>

              <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[9.5px] leading-snug text-slate-500">
                {policy.rationale}
              </p>
            </div>
          );
        })}
      </div>

      {/* CRM state the browser does not hold. */}
      <div className="rounded-xl border border-straive-200 bg-straive-50 p-3">
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-straive-700">
          CRM state, not readable from a browser
        </div>
        <p className="mt-0.5 text-[10px] leading-snug text-slate-600">
          A real programme reads these three from the marketing platform. This build has no platform behind it, so
          they are controls rather than facts. Move them and the verdicts below change live.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Knob label={`Local hour · ${String(localHour).padStart(2, '0')}:00`}>
            <input
              type="range"
              min={0}
              max={23}
              value={localHour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="w-full accent-straive-500"
            />
            <div className="mt-0.5 flex items-center justify-between text-[9px] text-slate-500">
              <span>{visitorContext.timezone ?? 'zone unknown'}</span>
              {hour !== null && (
                <button onClick={() => setHour(null)} className="font-bold text-straive-700 hover:underline">
                  reset to {String(realHour).padStart(2, '0')}:00
                </button>
              )}
            </div>
          </Knob>

          <Knob label="Already sent in window">
            <div className="flex gap-1.5">
              {(['email', 'sms'] as Channel[]).map((ch) => {
                const v = ch === 'email' ? sentEmail : sentSms;
                const set = ch === 'email' ? setSentEmail : setSentSms;
                const max = FREQUENCY_CAP[ch].max;
                return (
                  <button
                    key={ch}
                    onClick={() => set((n) => (n >= max ? 0 : n + 1))}
                    className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:border-straive-400"
                  >
                    {ch} {v}/{max}
                  </button>
                );
              })}
            </div>
          </Knob>

          <Knob label="Last session ended">
            <div className="flex gap-1.5">
              {([null, 3, 60] as (number | null)[]).map((d) => (
                <button
                  key={String(d)}
                  onClick={() => setLapsedDays(d)}
                  className={`flex-1 rounded border px-2 py-1 text-[10px] font-bold ${
                    lapsedDays === d
                      ? 'border-straive-500 bg-straive-500 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-straive-400'
                  }`}
                >
                  {d === null ? 'first visit' : `${d}d ago`}
                </button>
              ))}
            </div>
          </Knob>
        </div>
      </div>

      {/* The deck. */}
      <div className="space-y-2">
        {TRIGGERS.map((t) => {
          const e = result.evaluations.find((x) => x.trigger.id === t.id);
          if (!e) return null;
          return (
            <TriggerRow
              key={t.id}
              e={e}
              open={openId === t.id}
              onToggle={() => setOpenId((v) => (v === t.id ? null : t.id))}
            />
          );
        })}
      </div>

      <p className="px-1 pb-2 text-[9.5px] leading-snug text-slate-400">
        Simulated throughout. The triggers, the gates, the priority ordering and the content bar are real code and
        run on the live session; the catalog, the population and the CRM state above are invented. No message is
        composed, queued or sent by this build.
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ parts -- */

const Stat: React.FC<{ label: string; value: string; tone?: 'good' | 'warn' }> = ({ label, value, tone }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5">
    <div className="text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
    <div
      className={`font-display text-[15px] font-extrabold tabular-nums ${
        tone === 'warn' ? 'text-amber-400' : tone === 'good' ? 'text-emerald-400' : 'text-white'
      }`}
    >
      {value}
    </div>
  </div>
);

const Line: React.FC<{ ok: boolean; icon: React.ElementType; text: string }> = ({ ok, icon: Icon, text }) => (
  <div className="flex items-center gap-1.5">
    <Icon className={`h-3 w-3 shrink-0 ${ok ? 'text-emerald-600' : 'text-amber-600'}`} />
    <span className={ok ? '' : 'text-amber-800'}>{text}</span>
  </div>
);

const Knob: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="mb-1 text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
    {children}
  </div>
);

const TriggerRow: React.FC<{ e: TriggerEvaluation; open: boolean; onToggle: () => void }> = ({
  e,
  open,
  onToggle,
}) => {
  const Icon = CHANNEL_ICON[e.trigger.channel];
  const wait =
    e.trigger.delayMinutes >= 60 ? `${Math.round(e.trigger.delayMinutes / 60)}h` : `${e.trigger.delayMinutes}m`;

  const status = e.fires ? 'fires' : e.qualified ? 'held' : 'dormant';
  const chrome =
    status === 'fires'
      ? 'border-emerald-300 bg-emerald-50/60'
      : status === 'held'
        ? 'border-amber-200 bg-amber-50/50'
        : 'border-slate-200 bg-white';

  return (
    <div className={`overflow-hidden rounded-xl border ${chrome}`}>
      <button onClick={onToggle} className="w-full px-3 py-2.5 text-left hover:bg-black/[0.02]">
        <div className="flex items-start gap-2.5">
          <ChevronRight
            className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="text-[12.5px] font-extrabold text-slate-900">{e.trigger.label}</span>
              <span className="rounded border border-slate-200 bg-white px-1 py-px text-[8.5px] font-black uppercase tracking-wider text-slate-500">
                priority {e.trigger.priority}
              </span>
              <span
                className={`ml-auto rounded px-1.5 py-px text-[9px] font-black uppercase tracking-wider ${
                  status === 'fires'
                    ? 'bg-emerald-600 text-white'
                    : status === 'held'
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-200 text-slate-600'
                }`}
              >
                {status === 'fires' ? `sends in ${wait}` : status}
              </span>
            </div>

            <p className="mt-0.5 text-[10.5px] leading-snug text-slate-600">{e.trigger.intent}</p>

            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
              {e.blockedBy ? (
                <span className="flex items-center gap-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 font-bold text-amber-800">
                  <Ban className="h-3 w-3 shrink-0" />
                  {BLOCK_LABEL[e.blockedBy]}
                </span>
              ) : e.fires ? (
                <span className="flex items-center gap-1 rounded border border-emerald-300 bg-white px-1.5 py-0.5 font-bold text-emerald-800">
                  <Check className="h-3 w-3 shrink-0" />
                  {e.products.length} product{e.products.length === 1 ? '' : 's'} cleared the content bar
                </span>
              ) : (
                <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-500">
                  condition did not hold
                </span>
              )}
              {e.subject && (
                <span className="truncate rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-600">
                  about {e.subject.name}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-black/5 bg-white/70 px-3 py-3">
          {/* The gate walk, all of it. */}
          <div>
            <div className="mb-1 text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-400">
              Gate walk: every rule, in order
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              {e.gates.map((g, i) => (
                <div
                  key={`${g.rule}-${i}`}
                  className={`flex items-start gap-2 px-2.5 py-1.5 ${i > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  {g.passed ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                  )}
                  <div className="min-w-0">
                    <div className={`text-[11px] font-bold ${g.passed ? 'text-slate-800' : 'text-rose-800'}`}>
                      {g.label}
                    </div>
                    <div className="text-[10px] leading-snug text-slate-500">{g.detail}</div>
                  </div>
                </div>
              ))}
              {e.gates.length < 7 && e.blockedBy && (
                <div className="border-t border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[9.5px] italic text-slate-500">
                  The remaining rules were not evaluated. A gate that has already refused does not need the ones
                  behind it to agree, and running them anyway would put verdicts on screen that never decided
                  anything.
                </div>
              )}
            </div>
          </div>

          {/* The content gate, when it ran. */}
          {e.content && (
            <div>
              <div className="mb-1 text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-400">
                Content gate: {e.content.policy.label}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <Chip tone="good">{e.content.kept.length} kept</Chip>
                <Chip tone="bad">{e.content.suppressed.length} refused</Chip>
                {e.content.withheld > 0 && <Chip tone="warn">{e.content.withheld} slot{e.content.withheld === 1 ? '' : 's'} left empty</Chip>}
                {e.content.demoted.length > 0 && <Chip>{e.content.demoted.length} demoted on fatigue</Chip>}
              </div>
              {e.content.byRule.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {e.content.byRule.map((r) => (
                    <div key={r.rule} className="flex items-baseline gap-2 text-[10px]">
                      <span className="font-bold text-rose-800">{r.count}×</span>
                      <span className="text-slate-600">{r.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {e.content.withheld > 0 && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[9.5px] leading-snug text-amber-800">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  Empty slots are left empty. The offsite bar is the highest in the build and backfilling below it
                  would be the gate quietly disagreeing with itself.
                </p>
              )}
            </div>
          )}

          {/* What would be in the message. */}
          {e.products.length > 0 && (
            <div>
              <div className="mb-1 text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-400">
                What the message would carry
              </div>
              <div className="space-y-1">
                {e.products.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-baseline gap-2 rounded border border-slate-200 bg-white px-2 py-1"
                  >
                    <span className="w-4 shrink-0 font-mono text-[9.5px] font-bold tabular-nums text-slate-400">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[10.5px] font-bold text-slate-800">{p.name}</span>
                    <span className="shrink-0 font-mono text-[9.5px] tabular-nums text-slate-500">
                      pop {p.popularity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 pt-2 text-[10px] leading-snug text-slate-500">
            <span className="font-bold text-slate-700">Condition:</span> {e.trigger.condition}. Delay {wait} after
            the session, on {e.trigger.channel.toUpperCase()}, which needs the{' '}
            <span className="font-mono">{CHANNEL_RUNG[e.trigger.channel]}</span> rung.
          </div>
        </div>
      )}
    </div>
  );
};

const Chip: React.FC<{ tone?: 'good' | 'bad' | 'warn'; children: React.ReactNode }> = ({ tone, children }) => (
  <span
    className={`rounded border px-1.5 py-0.5 font-bold ${
      tone === 'good'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : tone === 'bad'
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : tone === 'warn'
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-slate-200 bg-slate-50 text-slate-600'
    }`}
  >
    {children}
  </span>
);
