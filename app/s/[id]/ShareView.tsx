'use client';

import { useEffect, useState, useTransition } from 'react';
import { formatAmount, buildSummary } from '@/lib/format';
import { toggleTransferPaid } from '@/app/actions';
import { driveImageSrc } from '@/lib/qr';
import type { Balance } from '@/lib/settlement';

type T = { id: string; from: string; to: string; amount: number; paid: boolean };

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors';

export default function ShareView({
  name,
  balances,
  qrByName,
  transfers: initial,
  defaultAsK,
}: {
  name: string;
  balances: Balance[];
  qrByName: Record<string, string>;
  transfers: T[];
  defaultAsK: boolean;
}) {
  const [asK, setAsK] = useState(defaultAsK);
  const [transfers, setTransfers] = useState<T[]>(initial);
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState<null | 'link' | 'summary'>(null);
  const [qrModal, setQrModal] = useState<{ name: string; url: string; amount: number } | null>(null);

  // Close the QR popup on Escape.
  useEffect(() => {
    if (!qrModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQrModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [qrModal]);

  const paidCount = transfers.filter((t) => t.paid).length;
  const total = transfers.length;
  const allSettled = total > 0 && paidCount === total;

  function toggle(id: string, paid: boolean) {
    setTransfers((ts) => ts.map((t) => (t.id === id ? { ...t, paid } : t))); // optimistic
    startTransition(async () => {
      try {
        await toggleTransferPaid(id, paid);
      } catch {
        setTransfers((ts) => ts.map((t) => (t.id === id ? { ...t, paid: !paid } : t))); // revert
      }
    });
  }

  async function copy(kind: 'link' | 'summary') {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text =
      kind === 'link'
        ? url
        : buildSummary(
            { name, asK, url },
            transfers.map((t) => ({ from: t.from, to: t.to, amount: t.amount })),
          );
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => copy('summary')}
          className={`${btnBase} bg-emerald-600 text-white hover:bg-emerald-500`}
        >
          {copied === 'summary' ? 'Đã copy ✓' : '📋 Copy tóm tắt'}
        </button>
        <button
          type="button"
          onClick={() => copy('link')}
          className={`${btnBase} border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800`}
        >
          {copied === 'link' ? 'Đã copy ✓' : '🔗 Copy link'}
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={asK}
            onChange={(e) => setAsK(e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
          nghìn (k)
        </label>
      </div>

      {allSettled && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center text-sm font-medium text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-200">
          Tất cả đã trả xong 🎉
        </div>
      )}

      {/* Transfers — the actionable list */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Chuyển tiền</h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {paidCount}/{total} đã trả
          </span>
        </div>
        <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${total ? (paidCount / total) * 100 : 0}%` }}
          />
        </div>

        {total === 0 ? (
          <p className="py-2 text-sm text-zinc-500 dark:text-zinc-400">
            Huề cả làng, không ai phải chuyển 🎉
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
            {transfers.map((t) => {
              const qr = qrByName[t.to];
              return (
                <li key={t.id} className="flex items-center gap-2">
                  <label className="flex flex-1 cursor-pointer items-center gap-3 py-3">
                    <input
                      type="checkbox"
                      checked={t.paid}
                      onChange={(e) => toggle(t.id, e.target.checked)}
                      className="h-5 w-5 shrink-0 accent-emerald-600"
                    />
                    <span
                      className={`flex-1 text-sm ${
                        t.paid ? 'text-zinc-400 line-through dark:text-zinc-600' : ''
                      }`}
                    >
                      <b>{t.from}</b> <span className="text-zinc-400">trả</span> <b>{t.to}</b>
                    </span>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${
                        t.paid
                          ? 'text-zinc-400 line-through dark:text-zinc-600'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {formatAmount(t.amount, asK)}
                    </span>
                  </label>
                  {qr && (
                    <button
                      type="button"
                      onClick={() => setQrModal({ name: t.to, url: qr, amount: t.amount })}
                      className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                      aria-label={`Xem QR chuyển tiền cho ${t.to}`}
                    >
                      Show QR
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Per-player net (collapsed) */}
      {balances.length > 0 && (
        <details className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <summary className="cursor-pointer text-sm font-semibold">
            Net từng người ({balances.length})
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {balances.map((b) => (
              <div key={b.name} className="flex items-center justify-between gap-2">
                <span className="truncate">{b.name}</span>
                <span
                  className={`shrink-0 font-medium tabular-nums ${
                    b.net >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {b.net >= 0 ? '+' : ''}
                  {formatAmount(b.net, asK)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {qrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`QR chuyển tiền cho ${qrModal.name}`}
          onClick={() => setQrModal(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Chuyển cho{' '}
                <span className="text-emerald-600 dark:text-emerald-400">{qrModal.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setQrModal(null)}
                aria-label="Đóng"
                className="-mr-1 -mt-1 shrink-0 rounded-lg px-2 py-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              Số tiền:{' '}
              <b className="tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatAmount(qrModal.amount, asK)}
              </b>
            </p>
            <QrImage url={qrModal.url} name={qrModal.name} />
            <a
              href={qrModal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block text-center text-sm text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Mở trong new tab ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/** QR image with a graceful fallback when Drive won't serve it inline. */
function QrImage({ url, name }: { url: string; name: string }) {
  const [errored, setErrored] = useState(false);
  const src = driveImageSrc(url);
  if (!src || errored) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        Không hiển thị được ảnh QR ở đây — bấm link bên dưới để mở.
      </div>
    );
  }
  return (
    // Intentionally a raw <img>, not next/image: the src is an untrusted remote URL;
    // next/image would fetch it server-side (SSRF) and require remotePatterns config.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Mã QR chuyển tiền cho ${name}`}
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className="mx-auto block w-full max-h-[75vh] rounded-xl object-contain"
    />
  );
}
