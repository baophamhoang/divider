/**
 * Parse a group's ledger `.xlsx` into per-player net balances.
 *
 * The sheet is laid out HORIZONTALLY:
 *   - one header row of player NAMES (one per column; column A of that row is blank),
 *   - several labelled rows below (column A = the label), e.g. per-session dates,
 *     "Ranking", "Cash in", "Cash out", "Total", "Win rate", "Status".
 * Only the row whose column A is "Total" matters — it holds each player's net result
 * (positive = won, negative = owes), aligned under their name.
 *
 * Numbers may be real numeric cells OR text with a decimal comma ("239,5", "-619,5"),
 * because the source is a Vietnamese-locale Google Sheet. Both are handled.
 *
 * This module is pure and runs in the browser (the upload page parses the file
 * client-side, so the raw workbook never has to be sent to the server).
 */

import * as XLSX from 'xlsx';
import { round2, type Balance } from './settlement';

export type ParseWarningCode =
  | 'EMPTY'
  | 'MULTI_SHEET'
  | 'NO_NAMES_ROW'
  | 'NO_TOTAL_ROW'
  | 'NO_PLAYERS'
  | 'DUP_NAMES'
  | 'NONZERO_RESIDUAL';

export type ParseWarning = { code: ParseWarningCode; message: string };

export type ParsedWorkbook = {
  /** All tab names in the file (so the UI can offer a picker when there are many). */
  sheetNames: string[];
  /** The tab actually read. */
  chosenSheet: string;
  /** Players with a non-zero net, in sheet column order. */
  players: Balance[];
  /** Sum of all kept nets — should be ~0 for a zero-sum game. */
  residual: number;
  warnings: ParseWarning[];
};

/** Tab name holding per-player payment QR links (row 1 = names, row 2 = URLs). */
export const QR_SHEET_NAME = 'QR_SHEET';

const TOTAL_LABEL = 'total';
/** Above this magnitude we flag the residual; below is just rounding/rake noise. */
const RESIDUAL_WARN_THRESHOLD = 0.5;

/**
 * Coerce a raw cell value into a number, tolerating Vietnamese/European formats:
 * decimal comma ("239,5"), grouped thousands ("1.234,5" or "1 234,5"), leading "+".
 * Anything unparseable becomes 0.
 */
export function parseLocaleNumber(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === 'number') return round2(raw);

  let s = String(raw).trim();
  if (s === '') return 0;

  s = s.replace(/[\s ]/g, ''); // strip spaces / non-breaking spaces used as grouping

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // European "1.234,5": dot = thousands separator, comma = decimal.
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // "239,5": decimal comma.
    s = s.replace(',', '.');
  }
  s = s.replace(/^\+/, '');

  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : 0;
}

function normalizeLabel(v: unknown): string {
  return v == null ? '' : String(v).trim().toLowerCase();
}

function isNonEmptyText(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== '';
}

/** Canonical player-name key: trim + collapse internal whitespace. Shared by the
 *  monthly parser and the QR parser so the name→QR join lines up. */
function normalizeName(v: unknown): string {
  return String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

type Grid = (string | number | boolean | null)[][];

/** Find the header row: column A blank, but at least two text cells to its right. */
function findNamesRow(grid: Grid): number {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const colA = row[0];
    const aEmpty = colA == null || String(colA).trim() === '';
    if (!aEmpty) continue;
    const textCount = row.slice(1).filter(isNonEmptyText).length;
    if (textCount >= 2) return r;
  }
  return -1;
}

/** Find the "Total" row by its column-A label (exact match preferred, prefix as fallback). */
function findTotalRow(grid: Grid): number {
  for (let r = 0; r < grid.length; r++) {
    if (normalizeLabel(grid[r]?.[0]) === TOTAL_LABEL) return r;
  }
  for (let r = 0; r < grid.length; r++) {
    if (normalizeLabel(grid[r]?.[0]).startsWith(TOTAL_LABEL)) return r;
  }
  return -1;
}

/**
 * Parse a workbook (raw bytes) into player balances.
 * @param data   the file bytes (ArrayBuffer from `File.arrayBuffer()`, or a Uint8Array)
 * @param sheetName  optional tab to read; defaults to the first sheet
 * @throws if the bytes are not a readable spreadsheet (callers should try/catch)
 */
export function parseWorkbook(data: ArrayBuffer | Uint8Array, sheetName?: string): ParsedWorkbook {
  const warnings: ParseWarning[] = [];
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const wb = XLSX.read(bytes, { type: 'array' });
  const sheetNames = wb.SheetNames;

  if (sheetNames.length === 0) {
    return {
      sheetNames,
      chosenSheet: '',
      players: [],
      residual: 0,
      warnings: [{ code: 'EMPTY', message: 'File không có sheet nào.' }],
    };
  }

  const chosenSheet = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
  if (sheetNames.length > 1) {
    warnings.push({
      code: 'MULTI_SHEET',
      message: `File có ${sheetNames.length} sheet — đang đọc "${chosenSheet}". Chọn sheet khác nếu cần.`,
    });
  }

  const grid = XLSX.utils.sheet_to_json<Grid[number]>(wb.Sheets[chosenSheet], {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });

  const namesRowIndex = findNamesRow(grid);
  if (namesRowIndex === -1) {
    warnings.push({ code: 'NO_NAMES_ROW', message: 'Không tìm thấy hàng tên người chơi.' });
    return { sheetNames, chosenSheet, players: [], residual: 0, warnings };
  }

  const totalRowIndex = findTotalRow(grid);
  if (totalRowIndex === -1) {
    warnings.push({
      code: 'NO_TOTAL_ROW',
      message: 'Không tìm thấy hàng "Total". Kiểm tra lại file hoặc chọn sheet khác.',
    });
    return { sheetNames, chosenSheet, players: [], residual: 0, warnings };
  }

  const namesRow = grid[namesRowIndex] ?? [];
  const totalRow = grid[totalRowIndex] ?? [];
  const players: Balance[] = [];
  const counts = new Map<string, number>();

  for (let c = 1; c < namesRow.length; c++) {
    if (!isNonEmptyText(namesRow[c])) continue;
    let name = normalizeName(namesRow[c]);
    const net = parseLocaleNumber(totalRow[c]);
    if (Math.abs(net) < 1e-9) continue; // drop players who broke even / are blank

    const prior = counts.get(name) ?? 0;
    counts.set(name, prior + 1);
    if (prior > 0) {
      const disambiguated = `${name} (${prior + 1})`;
      warnings.push({ code: 'DUP_NAMES', message: `Tên trùng "${name}" → đổi thành "${disambiguated}".` });
      name = disambiguated;
    }

    players.push({ name, net });
  }

  if (players.length === 0) {
    warnings.push({ code: 'NO_PLAYERS', message: 'Hàng "Total" không có người chơi nào khác 0.' });
  }

  const residual = round2(players.reduce((s, p) => s + p.net, 0));
  if (Math.abs(residual) > RESIDUAL_WARN_THRESHOLD) {
    warnings.push({
      code: 'NONZERO_RESIDUAL',
      message: `Tổng net = ${residual} (đáng lẽ ≈ 0). Có thể do làm tròn, rake, hoặc thiếu/dư người.`,
    });
  }

  return { sheetNames, chosenSheet, players, residual, warnings };
}

/**
 * Parse the dedicated `QR_SHEET` tab into a `name → payment-link` map.
 *
 * That tab is laid out differently from a monthly sheet: row 1 holds player
 * NAMES starting at column A (no blank label column, no "Total" row), and row 2
 * holds one payment URL (a Google Drive image link) per column. A name with a
 * blank URL cell is simply skipped — QR is opt-in per player.
 *
 * We read the worksheet cells directly (not `sheet_to_json`) so we can pick up a
 * cell's HYPERLINK target: Google Sheets often shows friendly text with the real
 * URL hidden behind it, and `sheet_to_json` only returns the visible text.
 *
 * The URLs are NOT validated here — the server (`createSession`) re-validates with
 * `isAllowedQrUrl` before persisting, since this is untrusted spreadsheet input.
 * Returns an empty map (no warning) when the tab is absent: the feature is off.
 */
export function parseQrSheet(
  data: ArrayBuffer | Uint8Array,
  sheetName: string = QR_SHEET_NAME,
): { qrByName: Record<string, string>; warnings: ParseWarning[] } {
  const warnings: ParseWarning[] = [];
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const wb = XLSX.read(bytes, { type: 'array' });

  const qrByName: Record<string, string> = {};
  const ws = wb.SheetNames.includes(sheetName) ? wb.Sheets[sheetName] : undefined;
  const ref = ws?.['!ref'];
  if (!ws || !ref) return { qrByName, warnings };

  const range = XLSX.utils.decode_range(ref);
  const nameRow = range.s.r; // first used row = names
  const urlRow = nameRow + 1; // next row = URLs

  for (let c = range.s.c; c <= range.e.c; c++) {
    const nameCell = ws[XLSX.utils.encode_cell({ r: nameRow, c })] as XLSX.CellObject | undefined;
    const name = normalizeName(nameCell?.v);
    if (!name) continue;

    const urlCell = ws[XLSX.utils.encode_cell({ r: urlRow, c })] as XLSX.CellObject | undefined;
    // Prefer the hyperlink target over the visible text.
    const raw = urlCell?.l?.Target ?? (typeof urlCell?.v === 'string' ? urlCell.v : '');
    const url = raw.trim();
    if (!url) continue;

    qrByName[name] = url;
  }

  return { qrByName, warnings };
}
