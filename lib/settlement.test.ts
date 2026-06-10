import { describe, it, expect } from 'vitest';
import { computeSettlement, round2, type Balance, type Transfer } from './settlement';

/** Sum of all transfer amounts (total money that changes hands). */
function totalMoved(ts: Transfer[]): number {
  return round2(ts.reduce((s, t) => s + t.amount, 0));
}

/** Net change each player experiences from the transfer set (paid out is negative). */
function appliedNet(ts: Transfer[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const t of ts) {
    acc[t.from] = round2((acc[t.from] ?? 0) - t.amount);
    acc[t.to] = round2((acc[t.to] ?? 0) + t.amount);
  }
  return acc;
}

describe('round2', () => {
  it('rounds to two decimals and handles signs / zero / junk', () => {
    expect(round2(239.5)).toBe(239.5);
    expect(round2(-619.5)).toBe(-619.5);
    expect(round2(0)).toBe(0);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(NaN)).toBe(0);
  });
});

describe('computeSettlement', () => {
  it('settles a simple zero-sum group', () => {
    const balances: Balance[] = [
      { name: 'A', net: 300 },
      { name: 'B', net: 200 },
      { name: 'C', net: -500 },
    ];
    const ts = computeSettlement(balances);
    // C is the only loser, pays both winners.
    expect(ts).toEqual([
      { from: 'C', to: 'A', amount: 300 },
      { from: 'C', to: 'B', amount: 200 },
    ]);
    expect(totalMoved(ts)).toBe(500);
  });

  it('preserves .5 amounts exactly', () => {
    const ts = computeSettlement([
      { name: 'A', net: 100.5 },
      { name: 'B', net: -100.5 },
    ]);
    expect(ts).toEqual([{ from: 'B', to: 'A', amount: 100.5 }]);
  });

  it('handles a realistic mixed set with halves and stays zero-sum', () => {
    const balances: Balance[] = [
      { name: 'Bảo', net: 279 },
      { name: 'Phướt', net: 1146.5 },
      { name: 'Thuý', net: 268.5 },
      { name: 'Uyên', net: -619.5 },
      { name: 'Y Quyền', net: -744.5 },
      { name: 'Việt', net: -330 },
    ];
    expect(round2(balances.reduce((s, b) => s + b.net, 0))).toBe(0); // sanity: zero-sum
    const ts = computeSettlement(balances);

    // Each winner ends up made whole, each loser fully pays their debt.
    const applied = appliedNet(ts);
    for (const b of balances) {
      expect(applied[b.name] ?? 0).toBeCloseTo(b.net, 2);
    }
    // No more than n-1 transfers.
    expect(ts.length).toBeLessThanOrEqual(balances.length - 1);
    // Every amount is positive.
    expect(ts.every((t) => t.amount > 0)).toBe(true);
  });

  it('does not crash or invent transfers when the sheet is not zero-sum (residual)', () => {
    // Sum = +0.3 residual (winner over-counted vs losers).
    const ts = computeSettlement([
      { name: 'A', net: 100 },
      { name: 'B', net: -99.7 },
    ]);
    expect(ts).toEqual([{ from: 'B', to: 'A', amount: 99.7 }]);
    // The 0.3 residual is left UNSETTLED — total moved equals what the loser actually owes.
    expect(totalMoved(ts)).toBe(99.7);
  });

  it('routes one winner against many losers (<= n-1 transfers)', () => {
    const balances: Balance[] = [
      { name: 'A', net: 60 },
      { name: 'B', net: -10 },
      { name: 'C', net: -20 },
      { name: 'D', net: -30 },
    ];
    const ts = computeSettlement(balances);
    expect(ts).toEqual([
      { from: 'D', to: 'A', amount: 30 },
      { from: 'C', to: 'A', amount: 20 },
      { from: 'B', to: 'A', amount: 10 },
    ]);
    expect(ts.length).toBeLessThanOrEqual(balances.length - 1);
  });

  it('returns nothing for empty input or all-zero balances', () => {
    expect(computeSettlement([])).toEqual([]);
    expect(
      computeSettlement([
        { name: 'A', net: 0 },
        { name: 'B', net: 0 },
      ]),
    ).toEqual([]);
  });
});
