/**
 * Debt settlement — turn each player's net result into the smallest practical
 * set of "who pays whom" transfers, so a friend group can settle up directly
 * with no middleman.
 *
 * INPUT  a list of net balances, one per player:
 *          net > 0  -> the player WON that much (others owe them)
 *          net < 0  -> the player LOST that much (they owe others)
 *        For a zero-sum game the nets sum to 0. We tolerate a small non-zero
 *        residual (rounding / rake) without crashing — see "Residual" below.
 *
 * OUTPUT a list of transfers { from, to, amount }, meaning `from` pays `to`.
 *
 * ALGORITHM — greedy two-pointer (a.k.a. "min cash flow"):
 *   1. Split players into winners (net > 0) and losers (net < 0, taken as a
 *      positive amount owed).
 *   2. Sort both groups largest-first.
 *   3. Repeatedly match the biggest remaining winner with the biggest remaining
 *      loser. The transfer amount is min(winner.left, loser.left). Whichever
 *      side hits zero advances to the next person; the other keeps its remainder.
 *   4. Stop when either group is exhausted.
 *
 * WHY THIS SHAPE:
 *   - Each iteration zeroes out at least one player, so it emits at most
 *     (winners + losers - 1) = n-1 transfers. That is far fewer than the n(n-1)/2
 *     transfers you'd get if everyone paid everyone — the whole point of "no middleman".
 *   - This is a well-known GREEDY HEURISTIC, not a provably optimal solver. Finding
 *     the strictly minimum number of transactions is NP-hard (it is the subset-sum /
 *     partition problem in disguise), so we don't attempt it. For real friend-group
 *     data the greedy result is at or very near optimal, and it's the same approach
 *     already battle-tested in the sibling `pokertime` app.
 *
 * RESIDUAL & FLOATING POINT:
 *   Game sheets contain half-units like 239.5 / -619.5, and the column may not sum to
 *   exactly 0. Naive `=== 0` pointer advancement (as in the original port) can stall or
 *   emit phantom transfers under float drift, so every value is rounded with `round2`
 *   and compared against a small EPSILON instead of exact zero. If a residual remains
 *   (one side has leftover after the other is exhausted) the loop simply ends and that
 *   remainder is left UNSETTLED rather than invented into a fake transfer — the caller
 *   surfaces the residual to the user as a warning.
 */

export type Balance = { name: string; net: number };
export type Transfer = { from: string; to: string; amount: number };

/** Values below this magnitude are treated as zero (kills float drift from .5 sums). */
const EPS = 1e-6;

/** Round to 2 decimals robustly (EPSILON nudge avoids 1.005 -> 1.00 style errors). */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return (Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
}

/**
 * Compute the minimal-ish set of transfers that settles the given balances.
 * Pure and deterministic — safe to run on both client (preview) and server
 * (authoritative save). See the module doc above for the algorithm.
 */
export function computeSettlement(balances: Balance[]): Transfer[] {
  const transfers: Transfer[] = [];

  // Round first, then split into the two camps and sort each LARGEST-FIRST so we
  // always match the biggest creditor with the biggest debtor (rounding kills the
  // float drift from .5 sums that would otherwise stall the pointers below).
  const rounded = balances.map((b) => ({ name: b.name, net: round2(b.net) }));

  const winners = rounded
    .filter((p) => p.net > EPS)
    .sort((a, b) => b.net - a.net); // largest credit first
  const losers = rounded
    .filter((p) => p.net < -EPS)
    .map((p) => ({ name: p.name, net: round2(-p.net) })) // owed amount, positive
    .sort((a, b) => b.net - a.net); // largest debt first

  let wi = 0;
  let li = 0;
  while (wi < winners.length && li < losers.length) {
    const winner = winners[wi];
    const loser = losers[li];
    const amount = round2(Math.min(winner.net, loser.net));

    // Invariant: both sides are > EPS at loop top, so amount is > EPS. The guard
    // is defensive against pathological float — break rather than spin forever.
    if (amount <= EPS) break;

    transfers.push({ from: loser.name, to: winner.name, amount });
    winner.net = round2(winner.net - amount);
    loser.net = round2(loser.net - amount);

    if (winner.net <= EPS) wi++;
    if (loser.net <= EPS) li++;
  }

  return transfers;
}
