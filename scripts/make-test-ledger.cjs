/**
 * Generate `test-ledger.xlsx` at the repo root — a fixture that mirrors the real
 * poker ledger screenshot, in the exact horizontal layout `lib/xlsx.ts` expects:
 *   - a names row (column A blank, one player per column),
 *   - labelled rows below (column A = label),
 *   - the "Total" row holding each player's net result.
 *
 * The `,5` half-values are stored as Vietnamese decimal-comma TEXT ("239,5") on
 * purpose, to exercise `parseLocaleNumber`. The zero players (Khoa Tiến Bùi,
 * Chương Ng, Trọng) are kept as real 0 cells — the parser drops break-even rows.
 *
 * Run:  node scripts/make-test-ledger.cjs
 */
const path = require('path');
const XLSX = require('xlsx');

// Player names in sheet column order (B..X), exactly as on the source sheet.
const names = [
  'Bảo MU', 'Vĩnh Hưng', 'Hoài', 'Tô', 'Hưng Mai', 'Khoa Kano', 'Dũng GG',
  'Thuý', 'Uyên (Sỉu bluff)', 'Y Quyền', 'Hoàng Newbie', 'Trí', 'Phước',
  'Nhật Anh', 'Việt', 'Tịnh', 'Huy Chế', 'Hiếu Võ real', 'Khoa Tiến Bùi',
  'Chương Ng', 'Khoa Huỳnh', 'Trọng', 'Thốn',
];

/** Build a labelled row aligned to `names`; missing players become blank cells. */
function row(label, byName) {
  return [label, ...names.map((n) => (n in byName ? byName[n] : null))];
}

const namesRow = [null, ...names];

const dateRow = row('29/5/2026 (Chiều)', {
  'Bảo MU': -100, 'Tô': 250, 'Dũng GG': 30,
  'Hoàng Newbie': -25, 'Trí': -50, 'Phước': 85, 'Việt': -190,
});

const ranking = row('Ranking', {
  'Bảo MU': 4, 'Vĩnh Hưng': 16, 'Hoài': 6, 'Tô': 1, 'Hưng Mai': 7,
  'Khoa Kano': 8, 'Dũng GG': 18, 'Thuý': 5, 'Uyên (Sỉu bluff)': 20,
  'Y Quyền': 21, 'Hoàng Newbie': 3, 'Trí': 9, 'Phước': 2, 'Nhật Anh': 22,
  'Việt': 23, 'Tịnh': 17, 'Huy Chế': 11, 'Hiếu Võ real': 15,
  'Khoa Tiến Bùi': 12, 'Chương Ng': 12, 'Khoa Huỳnh': 19, 'Trọng': 12,
});

const cashIn = row('Cash in', { 'Nhật Anh': 50, 'Chương Ng': 300, 'Trọng': 205 });
const cashOut = row('Cash out', { 'Tô': 50 });

// The row that actually drives the settlement. Half-values as comma-text.
const total = row('Total', {
  'Bảo MU': 279, 'Vĩnh Hưng': -133, 'Hoài': 248, 'Tô': 1417, 'Hưng Mai': '239,5',
  'Khoa Kano': 219, 'Dũng GG': -170, 'Thuý': '268,5', 'Uyên (Sỉu bluff)': '-619,5',
  'Y Quyền': '-744,5', 'Hoàng Newbie': 371, 'Trí': '206,5', 'Phước': '1146,5',
  'Nhật Anh': -765, 'Việt': -1160, 'Tịnh': -169, 'Huy Chế': 77,
  'Hiếu Võ real': -100, 'Khoa Tiến Bùi': 0, 'Chương Ng': 0, 'Khoa Huỳnh': -200,
  'Trọng': 0, 'Thốn': 94,
});

const winRate = row('Win rate', {
  'Bảo MU': '40%', 'Vĩnh Hưng': '36%', 'Hoài': '53%', 'Tô': '67%', 'Hưng Mai': '50%',
  'Khoa Kano': '45%', 'Dũng GG': '33%', 'Thuý': '57%', 'Uyên (Sỉu bluff)': '36%',
  'Y Quyền': '55%', 'Hoàng Newbie': '52%', 'Trí': '52%', 'Phước': '70%',
  'Nhật Anh': '14%', 'Việt': '18%', 'Tịnh': '33%', 'Huy Chế': '33%',
  'Hiếu Võ real': '0%', 'Khoa Tiến Bùi': '#DIV/0!', 'Chương Ng': '0%',
  'Khoa Huỳnh': '0%', 'Trọng': '0%',
});

const status = row('Status', {
  'Khoa Tiến Bùi': 'done', 'Chương Ng': 'done', 'Khoa Huỳnh': 'done', 'Trọng': 'done',
});

const aoa = [
  namesRow,
  dateRow,
  ranking,
  cashIn,
  cashOut,
  total,
  winRate,
  status,
  [],
  [null, 'Tournament', 'https://www.pokernow.com/games/pgl0M2Ng5dEgfmnURObmK9mDp'],
  [null, 'Ledger Image', 'https://drive.google.com/drive/folders/1UhqvVVvRM_ylGwEu'],
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Tháng 5');

// A second, smaller monthly sheet so the upload page shows a sheet chooser.
// Balanced (sums to 0): Bảo MU +100, Hoài -50, Tô -80, Phước +30.
const thang6 = [
  [null, 'Bảo MU', 'Hoài', 'Tô', 'Phước'],
  ['Ranking', 1, 4, 3, 2],
  ['Total', 100, -50, -80, 30],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(thang6), 'Tháng 6');

// QR_SHEET tab: row 1 = names, row 2 = a Google Drive image URL per player. Only
// some players have one (QR is opt-in), mirroring the real "QR_SHEET" tab. Swap
// SAMPLE_QR for a real publicly-shared Drive image link to see the QR render.
const SAMPLE_QR = 'https://drive.google.com/file/d/REPLACE_WITH_PUBLIC_DRIVE_FILE_ID/view?usp=drive_link';
const playersWithQr = new Set([
  'Bảo MU', 'Vĩnh Hưng', 'Hoài', 'Tô', 'Hưng Mai', 'Khoa Kano',
  'Thuý', 'Hoàng Newbie', 'Trí', 'Phước', 'Việt',
]);
const qrAoa = [names, names.map((n) => (playersWithQr.has(n) ? SAMPLE_QR : null))];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(qrAoa), 'QR_SHEET');

const outPath = path.join(__dirname, '..', 'test-ledger.xlsx');
XLSX.writeFile(wb, outPath, { bookType: 'xlsx' });
console.log(`Wrote ${outPath} — sheets "Tháng 5" + "Tháng 6" + "QR_SHEET", ${names.length} players.`);
