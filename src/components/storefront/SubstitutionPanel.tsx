/**
 * Out of stock, shown as a ranking decision.
 *
 * The ordinary treatment of an unavailable size is a grey message and a rail of
 * whatever the store was already promoting. That throws away the most specific
 * request the shopper has made all session - this product, this club, this
 * player, this size - and replaces it with the store's own agenda at the exact
 * moment the shopper is most likely to leave.
 *
 * So this is not a fallback rail. It is a ranking with its own objective, its
 * own gate, and its own disagreement with the store's default ordering, and all
 * three are on screen:
 *
 *   THE GATE        availability first. A pre-order product, a product in the
 *                   wrong body size, a product with nothing left on its ladder -
 *                   none of them are candidates however close the vectors are.
 *                   They are listed with the rule that removed them, because a
 *                   gate you cannot see is indistinguishable from a bug.
 *   THE OBJECTIVE   continuity of the request, weighted, then price within a
 *                   stated tolerance. Printed as a sentence, not implied.
 *   THE DIVERGENCE  the same survivors, re-ordered the way a popularity sort
 *                   would have them. Where the two disagree is the entire
 *                   argument for having built the first one.
 *
 * Both orderings are computed from the same pool in the same call - the pairing
 * discipline ml/effort.ts asks for, applied to a ranking rather than a saving.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Product } from '../../types';
import { useApp } from '../../context/AppContext';
import { CONTINUITY_WEIGHTS, PRICE_TOLERANCE, runSubstitution } from '../../ml/engine';
import type { RejectReason, SubstituteScore } from '../../ml/engine';
import { saving } from '../../ml/effort';
import { ProductImage } from './ProductImage';
import { AlertTriangle, ArrowRight, Check, ChevronDown, Minus, Scale } from 'lucide-react';

const REASON_HEADLINE: Record<string, string> = {
  size_out_of_stock: 'That size is gone',
  product_preorder: 'This one has not shipped yet',
  product_unavailable: 'This one cannot be had today',
};

const REJECT_LABEL: Record<RejectReason, string> = {
  not_available: 'Cannot be had now either',
  not_in_size: 'Nothing left on its ladder',
  is_the_anchor: 'The product that is unavailable',
  wrong_body: 'Wrong body, different sizing entirely',
};

/** How wide a candidate pool the panel considers before the gate runs. */
const POOL_CAP = 48;

interface Props {
  anchor: Product;
  requestedSize: string | null;
  onSelect: (p: Product, size: string | null) => void;
  /**
   * Whether the request is impossible or merely slow.
   *
   * A size that is gone BLOCKS - there is nothing to buy, and the ranking is
   * the only thing on offer. A pre-order is an OFFER - the shopper can still
   * have this exact product, just not this week, so the same ranking runs and
   * is presented beside the buy button rather than instead of it. Same engine,
   * same gate, same divergence table; different claim on the shopper.
   */
  variant?: 'block' | 'offer';
}

export const SubstitutionPanel: React.FC<Props> = ({ anchor, requestedSize, onSelect, variant = 'block' }) => {
  const { products, recordEffort, userEvents, isPersonalizationOn } = useApp();
  const [openGate, setOpenGate] = useState(false);

  // The pool is the neighbourhood of the request, not the catalog. A ranker
  // handed 800 candidates would still return four, but the rejection list - the
  // thing that makes the gate legible - would be 796 rows of noise.
  const pool = useMemo(() => {
    const near = products
      .filter(
        (p) =>
          p.id === anchor.id ||
          (p.league === anchor.league && (p.team === anchor.team || p.department === anchor.department))
      )
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, POOL_CAP);
    return near.some((p) => p.id === anchor.id) ? near : [anchor, ...near];
  }, [products, anchor]);

  const result = useMemo(
    () => runSubstitution(anchor, pool, requestedSize, { limit: 4 }),
    [anchor, pool, requestedSize]
  );

  const { chosen, ranked, rejected, divergence } = result;

  useEffect(() => {
    if (!isPersonalizationOn || !chosen) return;
    recordEffort(
      saving({
        id: `substitution:${anchor.id}:${requestedSize ?? 'none'}`,
        eventId: userEvents[0]?.id ?? null,
        page: 'pdp',
        surface: 'Out of stock',
        kind: 'dead_end',
        count: 1,
        label: `Dead end answered with ${chosen.product.name}`,
        detail:
          `${result.poolSize} candidates, ${rejected.length} removed by the availability gate, ` +
          `${ranked.length} ranked on continuity`,
      })
    );
  }, [isPersonalizationOn, chosen, anchor, requestedSize, rejected, ranked, result, recordEffort, userEvents]);

  // Grouped rejections. The count is the story; three examples are enough to
  // show what the rule catches.
  const groups = useMemo(() => {
    const by = new Map<RejectReason, { product: Product; detail: string }[]>();
    for (const r of rejected) {
      const list = by.get(r.reason) ?? [];
      list.push({ product: r.product, detail: r.detail });
      by.set(r.reason, list);
    }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rejected]);

  return (
    <div
      className={`rounded-xl border p-3.5 space-y-3 ${
        variant === 'block' ? 'border-amber-300 bg-amber-50/70' : 'border-slate-300 bg-slate-50'
      }`}
    >
      {/* What happened. */}
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white ${
            variant === 'block' ? 'bg-amber-500' : 'bg-slate-500'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-extrabold leading-snug text-slate-900">
            {variant === 'offer' ? 'Want one that ships today?' : REASON_HEADLINE[result.reason]}
            {variant === 'block' && requestedSize && result.reason === 'size_out_of_stock'
              ? `: ${requestedSize} in this product`
              : ''}
          </p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-slate-600">
            {variant === 'offer'
              ? 'You can still pre-order this one. If you would rather not wait, the same ranker runs over what is in stock. '
              : 'This is a ranking decision, not a consolation rail. '}
            <span className="font-semibold text-slate-700">{result.objective}</span>
          </p>
        </div>
      </div>

      {/* The gate, before the ranking - because that is the order it ran in. */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setOpenGate((v) => !v)}
          className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
        >
          <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
            Availability gate
          </span>
          <span className="font-mono text-[10px] font-bold tabular-nums text-slate-600">
            {result.poolSize} considered → {rejected.length} removed → {result.poolSize - rejected.length} ranked
          </span>
          <ChevronDown
            className={`ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${openGate ? 'rotate-180' : ''}`}
          />
        </button>
        {openGate && (
          <div className="space-y-1.5 border-t border-slate-100 px-2.5 py-2">
            {groups.map(([reason, items]) => (
              <div key={reason}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[10.5px] font-bold text-slate-800">{REJECT_LABEL[reason]}</span>
                  <span className="font-mono text-[9.5px] tabular-nums text-slate-400">{items.length}</span>
                </div>
                <div className="mt-0.5 space-y-px">
                  {items.slice(0, 3).map((i) => (
                    <div key={i.product.id} className="truncate text-[9.5px] text-slate-500">
                      <span className="text-slate-600">{i.product.name}</span>
                      <span className="text-slate-400"> · {i.detail}</span>
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className="text-[9.5px] text-slate-400">…and {items.length - 3} more</div>
                  )}
                </div>
              </div>
            ))}
            <p className="border-t border-slate-100 pt-1.5 text-[9px] leading-snug text-slate-400">
              Availability is a gate, not a feature. Nothing removed here can be scored back in by being similar
              enough. That is the same discipline the suppression gate applies to the recommendation rails.
            </p>
          </div>
        )}
      </div>

      {/* The ranking. */}
      {chosen ? (
        <div className="space-y-1.5">
          {ranked.map((s, i) => (
            <SubstituteRow key={s.product.id} score={s} rank={i + 1} best={i === 0} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-300 bg-white px-2.5 py-2">
          <p className="text-[11px] font-bold text-slate-800">Nothing in the neighbourhood clears the gate</p>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-600">
            {result.poolSize} candidates were considered and every one was removed by availability. The panel says so
            rather than widening the pool until something appears. A substitute found by relaxing the definition of
            substitute is not one.
          </p>
        </div>
      )}

      {/* Where this ordering disagrees with a popularity sort. */}
      {divergence.length > 0 && (
        <div className="rounded-lg border border-straive-200 bg-white px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <Scale className="h-3 w-3 shrink-0 text-straive-600" />
            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-straive-700">
              Where continuity and popularity disagree
            </span>
          </div>
          <div className="mt-1.5 space-y-0.5">
            {divergence.map((d) => (
              <div key={d.productId} className="flex items-baseline gap-2 text-[10px]">
                <span className="min-w-0 flex-1 truncate text-slate-700">{d.name}</span>
                <span className="shrink-0 font-mono tabular-nums text-slate-400">
                  <span className="font-bold text-straive-700">#{d.substitutionRank}</span>
                  <span className="mx-1 text-slate-300">vs</span>
                  <span className="text-slate-500">#{d.similarityRank}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[9px] leading-snug text-slate-400">
            Left is this ranker; right is the same surviving pool sorted by catalog popularity, computed in the same
            call. Both orderings are simulated over a synthetic catalog.
          </p>
        </div>
      )}
    </div>
  );
};

/** One candidate, with what it keeps and what it costs. */
const SubstituteRow: React.FC<{
  score: SubstituteScore;
  rank: number;
  best: boolean;
  onSelect: (p: Product, size: string | null) => void;
}> = ({ score, rank, best, onSelect }) => {
  const [open, setOpen] = useState(false);
  const p = score.product;
  const price = p.salePrice ?? p.price;

  return (
    <div
      className={`rounded-lg border bg-white ${best ? 'border-straive-400 ring-1 ring-straive-100' : 'border-slate-200'}`}
    >
      <div className="flex items-center gap-2.5 p-2">
        <button
          type="button"
          onClick={() => onSelect(p, score.size)}
          className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
        >
          <ProductImage product={p} className="absolute inset-0 h-full w-full" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[9px] font-bold text-slate-400">#{rank}</span>
            <button
              type="button"
              onClick={() => onSelect(p, score.size)}
              className="min-w-0 truncate text-left text-[11.5px] font-bold text-slate-900 hover:text-red-600"
            >
              {p.name}
            </button>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {score.keeps.map((k) => (
              <span
                key={k}
                className="flex items-center gap-0.5 rounded bg-emerald-50 px-1 py-px text-[9px] font-semibold text-emerald-800"
              >
                <Check className="h-2.5 w-2.5" />
                {k}
              </span>
            ))}
            {score.concedes.map((c) => (
              <span
                key={c}
                className="flex items-center gap-0.5 rounded bg-slate-100 px-1 py-px text-[9px] font-semibold text-slate-600"
              >
                <Minus className="h-2.5 w-2.5" />
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[12px] font-black text-slate-900">${price.toFixed(2)}</div>
          <div className="font-mono text-[9px] tabular-nums text-slate-400">
            {score.size ?? 'n/a'} · {score.score.toFixed(3)}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 border-t border-slate-100 px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-400 hover:text-slate-700"
      >
        Score
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-0.5 border-t border-slate-100 px-2 py-1.5">
          {(Object.keys(CONTINUITY_WEIGHTS) as (keyof typeof CONTINUITY_WEIGHTS)[]).map((k) => {
            const got = score.breakdown[k];
            const max = CONTINUITY_WEIGHTS[k];
            return (
              <div key={k} className="flex items-center gap-1.5">
                <span className="w-20 shrink-0 text-[9.5px] capitalize text-slate-500">{k}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className={`block h-full rounded-full ${got > 0 ? 'bg-straive-500' : 'bg-slate-200'}`}
                    style={{ width: `${(got / max) * 100}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-[9px] tabular-nums text-slate-400">
                  {got.toFixed(3)}/{max.toFixed(2)}
                </span>
              </div>
            );
          })}
          <p className="pt-1 text-[9px] leading-snug text-slate-400">
            Weights sum to 1, so the score reads as a share of the request preserved. Price contributes on a slope
            and falls to zero past {(PRICE_TOLERANCE * 100).toFixed(0)}%. Beyond that a substitute is an upsell.
          </p>
          <p className="text-[9.5px] leading-snug text-slate-500">{score.explanation}</p>
        </div>
      )}
    </div>
  );
};

/** Small inline nudge for a surface with no room for the full panel. */
export const SubstitutionHint: React.FC<{ label: string; onOpen: () => void }> = ({ label, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10.5px] font-bold text-amber-900 hover:bg-amber-100"
  >
    <AlertTriangle className="h-3 w-3 shrink-0" />
    {label}
    <ArrowRight className="h-3 w-3 shrink-0" />
  </button>
);
