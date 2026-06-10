'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { parseWorkbook, parseLocaleNumber, type ParseWarning, type ParsedWorkbook } from '@/lib/xlsx';
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
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [chosenSheet, setChosenSheet] = useState('');
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
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

  function applyParse(res: ParsedWorkbook) {
    setSheetNames(res.sheetNames);
    setChosenSheet(res.chosenSheet);
    setWarnings(res.warnings);
    setRows(res.players.map((p) => ({ name: p.name, netText: String(p.net) })));
  }

  async function handleFile(file: File) {
    setParseError(null);
    setSaveError(null);
    try {
      const buf = await file.arrayBuffer();
      bytesRef.current = buf;
      applyParse(parseWorkbook(buf));
      setFileName(file.name);
      const base = file.name.replace(/\.(xlsx|xls)$/i, '').trim();
      setSessionName(base || defaultName());
    } catch {
      setParseError('Không đọc được file. Đảm bảo đây là file .xlsx hợp lệ.');
      setRows([]);
      setSheetNames([]);
      setWarnings([]);
    }
  }

  function reparse(sheet: string) {
    if (!bytesRef.current) return;
    setParseError(null);
    try {
      applyParse(parseWorkbook(bytesRef.current, sheet));
    } catch {
      setParseError('Không đọc được sheet này.');
    }
  }

  function onSave() {
    setSaveError(null);
    if (balances.length === 0) {
      setSaveError('Chưa có số liệu người chơi hợp lệ.');
      return;
    }
    startTransition(async () => {
      try {
        await createSession({
          name: sessionName.trim() || defaultName(),
          currency: asK ? 'k' : null,
          sourceFilename: fileName,
          balances,
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
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 bg-white px-6 py-8 text-center transition-colors hover:border-emerald-400 hover:bg-emerald-50/30 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-700/60 dark:hover:bg-emerald-950/20">
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
        <label className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Sheet:</span>
          <select
            value={chosenSheet}
            onChange={(e) => reparse(e.target.value)}
            className={inputClass + ' w-full max-w-xs'}
          >
            {sheetNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
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
              <h2 className="text-sm font-semibold">Người chơi ({rows.length})</h2>
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

          <button
            type="button"
            onClick={onSave}
            disabled={pending || balances.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Đang lưu…' : 'Lưu & tạo link chia tiền'}
          </button>
        </>
      )}
    </div>
  );
}
