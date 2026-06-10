import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import ShareView from './ShareView';

// Render at request time so paid-toggles and edits are always reflected.
export const dynamic = 'force-dynamic';

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Next 16: params is async
  const data = await getSession(id);
  if (!data) notFound();

  const { session, transfers } = data;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <header className="mb-6">
        <Link
          href="/"
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Trang chủ
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{session.name}</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatDateTime(session.createdAt)}</p>
        {Math.abs(session.residual) > 0.5 && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
            Tổng net = {session.residual} (đáng lẽ ≈ 0) — có thể do làm tròn, rake hoặc thiếu/dư người.
          </div>
        )}
      </header>

      <ShareView
        name={session.name}
        balances={session.balances}
        defaultAsK={session.currency === 'k'}
        transfers={transfers.map((t) => ({
          id: t.id,
          from: t.fromName,
          to: t.toName,
          amount: t.amount,
          paid: t.paid,
        }))}
      />
    </main>
  );
}
