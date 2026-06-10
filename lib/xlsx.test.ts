import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook, parseLocaleNumber } from './xlsx';

type Row = (string | number | null)[];

/** Build an in-memory .xlsx (bytes) from one or more sheets given as arrays-of-arrays. */
function makeXlsx(sheets: Record<string, Row[]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

const byName = (players: { name: string; net: number }[]) =>
  Object.fromEntries(players.map((p) => [p.name, p.net]));

describe('parseLocaleNumber', () => {
  it('parses comma decimals, grouped thousands, signs, and junk', () => {
    expect(parseLocaleNumber('239,5')).toBe(239.5);
    expect(parseLocaleNumber('-619,5')).toBe(-619.5);
    expect(parseLocaleNumber('1.234,5')).toBe(1234.5);
    expect(parseLocaleNumber('1 234,5')).toBe(1234.5);
    expect(parseLocaleNumber('+12')).toBe(12);
    expect(parseLocaleNumber(239.5)).toBe(239.5);
    expect(parseLocaleNumber('')).toBe(0);
    expect(parseLocaleNumber(null)).toBe(0);
    expect(parseLocaleNumber('abc')).toBe(0);
    expect(parseLocaleNumber('50')).toBe(50);
  });
});

describe('parseWorkbook', () => {
  it('reads the Total row with mixed comma-text and numeric cells', () => {
    const bytes = makeXlsx({
      Sheet1: [
        [null, 'A', 'B', 'C'],
        ['29/5/2026 (Chiều)', '-100', null, 250],
        ['Total', '100,5', -50.5, '-50'],
        ['Win rate', '40%', '36%', '53%'],
      ],
    });
    const res = parseWorkbook(bytes);
    expect(byName(res.players)).toEqual({ A: 100.5, B: -50.5, C: -50 });
    expect(res.residual).toBe(0);
    expect(res.warnings.map((w) => w.code)).not.toContain('NONZERO_RESIDUAL');
  });

  it('drops players who broke even or have a blank Total', () => {
    const bytes = makeXlsx({
      Sheet1: [
        [null, 'A', 'B', 'C', 'D'],
        ['Total', 100, -100, 0, null],
      ],
    });
    const res = parseWorkbook(bytes);
    expect(byName(res.players)).toEqual({ A: 100, B: -100 });
  });

  it('finds the names row even when it is not the first row', () => {
    const bytes = makeXlsx({
      Sheet1: [
        [null, null, null], // blank lead row
        [null, 'A', 'B', 'C'],
        ['Ranking', 1, 2, 3],
        ['Total', 60, -10, -50],
      ],
    });
    const res = parseWorkbook(bytes);
    expect(byName(res.players)).toEqual({ A: 60, B: -10, C: -50 });
  });

  it('flags a missing Total row and returns no players', () => {
    const bytes = makeXlsx({
      Sheet1: [
        [null, 'A', 'B'],
        ['Ranking', 1, 2],
      ],
    });
    const res = parseWorkbook(bytes);
    expect(res.players).toEqual([]);
    expect(res.warnings.map((w) => w.code)).toContain('NO_TOTAL_ROW');
  });

  it('warns on a non-zero-sum residual but still returns players', () => {
    const bytes = makeXlsx({
      Sheet1: [
        [null, 'A', 'B'],
        ['Total', 100, -95],
      ],
    });
    const res = parseWorkbook(bytes);
    expect(res.residual).toBe(5);
    expect(res.warnings.map((w) => w.code)).toContain('NONZERO_RESIDUAL');
    expect(res.players.length).toBe(2);
  });

  it('defaults to the first sheet and warns, but can read a chosen sheet', () => {
    const sheets = {
      First: [
        [null, 'A', 'B'],
        ['Total', 10, -10],
      ],
      Second: [
        [null, 'X', 'Y'],
        ['Total', 30, -30],
      ],
    };
    const bytes = makeXlsx(sheets);

    const def = parseWorkbook(bytes);
    expect(def.chosenSheet).toBe('First');
    expect(def.warnings.map((w) => w.code)).toContain('MULTI_SHEET');
    expect(byName(def.players)).toEqual({ A: 10, B: -10 });

    const second = parseWorkbook(bytes, 'Second');
    expect(second.chosenSheet).toBe('Second');
    expect(byName(second.players)).toEqual({ X: 30, Y: -30 });
  });

  it('disambiguates duplicate player names', () => {
    const bytes = makeXlsx({
      Sheet1: [
        [null, 'Hoài', 'Hoài'],
        ['Total', 10, -10],
      ],
    });
    const res = parseWorkbook(bytes);
    expect(res.players.map((p) => p.name)).toEqual(['Hoài', 'Hoài (2)']);
    expect(res.warnings.map((w) => w.code)).toContain('DUP_NAMES');
  });
});
