'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import {
  parseWorkbook,
  parseQrSheet,
  parseLocaleNumber,
  QR_SHEET_NAME,
  type ParseWarning,
} from '@/lib/xlsx';
import { computeSettlement, round2, type Balance } from '@/lib/settlement';
import { formatAmount } from '@/lib/format';
import { createSession } from '@/app/actions';

type Row = { name: string; netText: string };

const inputClass =
  'rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900';

function defaultName(): string {
  return `Ván ${new Intl.DateTimeFormat('vi-VN').format(new Date())}`;
}

function warnClass(code: ParseWarning['code']): string {
  const isError = code === 'NO_TOTAL_ROW' || code === 'NO_NAMES_ROW' || code === 'NO_PLAYERS' || code === 'EMPTY';
  return isError
    ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200'
    : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200';
}

export default function UploadClient() {
  const bytesRef = useRef<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [chosenSheet, setChosenSheet] = useState('');
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [qrByName, setQrByName] = useState<Record<string, string>>({});
  const [sessionName, setSessionName] = useState('');
  const [asK, setAsK] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const balances: Balance[] = useMemo(
    () =>
      rows
        .map((r) => ({ name: r.name.trim(), net: parseLocaleNumber(r.netText) }))
        .filter((b) => b.name !== '' && Math.abs(b.net) > 1e-9),
    [rows],
  );
  const residual = useMemo(() => round2(balances.reduce((s, b) => s + b.net, 0)), [balances]);
  const transfers = useMemo(() => computeSettlement(balances), [balances]);
  const balanced = Math.abs(residual) <= 0.5;
  const qrCount = useMemo(
    () => rows.filter((r) => qrByName[r.name.trim().replace(/\s+/g, ' ')]).length,
    [rows, qrByName],
  );

  // Parse one chosen sheet into the editable player list. The QR map is re-read
  // here (cheap) so the name→QR join always matches the sheet just selected.
  function selectSheet(sheet: string) {
    if (!bytesRef.current) return;
    setParseError(null);
    try {
      const res = parseWorkbook(bytesRef.current, sheet);
      const { qrByName: qr } = parseQrSheet(bytesRef.current);
      setChosenSheet(res.chosenSheet);
      setQrByName(qr);
      setRows(res.players.map((p) => ({ name: p.name, netText: String(p.net) })));

      // Drop the MULTI_SHEET hint (the explicit chooser replaces it). We do NOT warn
      // about QR names missing from this sheet — the QR tab is a global roster, so a
      // given month legitimately won't include everyone; the "· N có QR" count is the
      // signal instead.
      setWarnings(res.warnings.filter((w) => w.code !== 'MULTI_SHEET'));
    } catch {
      setParseError('Không đọc được sheet này.');
    }
  }

  async function handleFile(file: File) {
    setParseError(null);
    setSaveError(null);
    try {
      const buf = await file.arrayBuffer();
      bytesRef.current = buf;
      // Settlement sheets = every tab except the QR tab. The user picks which one.
      const monthly = parseWorkbook(buf).sheetNames.filter((n) => n !== QR_SHEET_NAME);
      setSheetNames(monthly);
      setFileName(file.name);
      const base = file.name.replace(/\.(xlsx|xls)$/i, '').trim();
      setSessionName(base || defaultName());

      if (monthly.length === 1) {
        selectSheet(monthly[0]); // only one settlement sheet → no need to choose
      } else {
        // 0 or many: don't auto-parse — the chooser (or an error) drives the next step.
        setChosenSheet('');
        setRows([]);
        setQrByName({});
        setWarnings(
          monthly.length === 0
            ? [{ code: 'NO_TOTAL_ROW', message: 'File không có sheet chia tiền nào (thiếu hàng "Total").' }]
            : [],
        );
      }
    } catch {
      setParseError('Không đọc được file. Đảm bảo đây là file .xlsx hợp lệ.');
      setRows([]);
      setSheetNames([]);
      setWarnings([]);
      setQrByName({});
      setChosenSheet('');
    }
  }

  function onSave() {
    setSaveError(null);
    if (balances.length === 0) {
      setSaveError('Chưa có số liệu người chơi hợp lệ.');
      return;
    }
    if (!balanced) {
      setSaveError('Tổng net phải ≈ 0 mới lưu được — kiểm tra lại số liệu.');
      return;
    }
    startTransition(async () => {
      try {
        await createSession({
          name: sessionName.trim() || defaultName(),
          currency: asK ? 'k' : null,
          sourceFilename: fileName,
          balances,
          qrByName,
        });
      } catch (e) {
        const digest = (e as { digest?: string })?.digest;
        if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) throw e; // let Next navigate
        setSaveError((e as Error)?.message || 'Lưu thất bại, thử lại.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* File picker */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragOver
            ? 'border-emerald-500 bg-emerald-50/60 dark:border-emerald-600 dark:bg-emerald-950/30'
            : 'border-zinc-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/30 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-700/60 dark:hover:bg-emerald-950/20'
        }`}
      >
        <span className="text-2xl">📄</span>
        <span className="text-sm font-medium">{fileName ?? 'Chọn file .xlsx'}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {fileName ? 'Bấm để chọn file khác' : 'hoặc kéo thả vào đây'}
        </span>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
      </label>

      {sheetNames.length > 1 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-sm font-medium">Chọn sheet để chia tiền</span>
          <div className="flex flex-wrap gap-2">
            {sheetNames.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => selectSheet(n)}
                className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
                  chosenSheet === n
                    ? 'border-emerald-500 bg-emerald-600 text-white'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-emerald-700/60 dark:hover:bg-emerald-950/20'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {!chosenSheet && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Bấm một sheet để xem danh sách người chơi.
            </span>
          )}
        </div>
      )}

      {parseError && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200">
          {parseError}
        </div>
      )}

      {warnings.map((w, i) => (
        <div key={i} className={`rounded-xl border p-3 text-sm ${warnClass(w.code)}`}>
          {w.message}
        </div>
      ))}

      {rows.length > 0 && (
        <>
          {/* Session meta */}
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Tên buổi</span>
              <input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder={defaultName()}
                className={inputClass + ' w-full'}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={asK}
                onChange={(e) => setAsK(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
              <span>
                Hiển thị đơn vị nghìn (<b>k</b>) — chỉ đổi nhãn, không đổi số
              </span>
            </label>
          </div>

          {/* Editable players */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Người chơi ({rows.length})
                {qrCount > 0 && (
                  <span className="ml-1 font-normal text-zinc-400">· {qrCount} có QR</span>
                )}
              </h2>
              <button
                type="button"
                onClick={() => setRows((r) => [...r, { name: '', netText: '' }])}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
              >
                ＋ Thêm dòng
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={row.name}
                    onChange={(e) =>
                      setRows((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                    placeholder="Tên"
                    className={inputClass + ' min-w-0 flex-1'}
                  />
                  <input
                    value={row.netText}
                    inputMode="decimal"
                    onChange={(e) =>
                      setRows((r) => r.map((x, j) => (j === i ? { ...x, netText: e.target.value } : x)))
                    }
                    placeholder="0"
                    className={inputClass + ' w-28 text-right tabular-nums'}
                  />
                  <button
                    type="button"
                    onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                    className="shrink-0 rounded-lg px-2 py-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                    aria-label="Xoá"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <p
              className={`mt-3 text-sm ${
                balanced ? 'text-zinc-500 dark:text-zinc-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              Tổng net: <b className="tabular-nums">{formatAmount(residual, asK)}</b>{' '}
              {balanced ? '(≈ 0 ✓)' : '(đáng lẽ ≈ 0 — kiểm tra lại)'}
            </p>
          </div>

          {/* Settlement preview */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-2 text-sm font-semibold">
              Sẽ chia thành {transfers.length} lượt chuyển
            </h2>
            {transfers.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Huề cả làng, không ai phải chuyển 🎉</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {transfers.map((t, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span>
                      <b>{t.from}</b> <span className="text-zinc-400">→</span> <b>{t.to}</b>
                    </span>
                    <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatAmount(t.amount, asK)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {saveError && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200">
              {saveError}
            </div>
          )}

          {!balanced && balances.length > 0 && (
            <p className="text-center text-xs text-amber-600 dark:text-amber-400">
              Tổng net phải ≈ 0 mới lưu được (hiện {formatAmount(residual, asK)}).
            </p>
          )}

          <button
            type="button"
            onClick={onSave}
            disabled={pending || balances.length === 0 || !balanced}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Đang lưu…' : 'Lưu & tạo link chia tiền'}
          </button>
        </>
      )}
    </div>
  );
}
