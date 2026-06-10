import Link from 'next/link';
import { listSessions, type SessionListItem } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';

// Always render at request time so newly saved sessions show up immediately.
export const dynamic = 'force-dynamic';

export default async function Home() {
  let sessions: SessionListItem[] = [];
  let dbError = false;
  try {
    sessions = await listSessions();
  } catch {
    dbError = true;
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="text-emerald-600 dark:text-emerald-400">♠</span> Chia tiền Poker
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Upload sheet nợ/lời → chia tiền ít lượt chuyển nhất.
          </p>
        </div>
        <Link
          href="/upload"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500"
        >
          <span className="text-base leading-none">＋</span> Buổi mới
        </Link>
      </header>

      {dbError ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Chưa kết nối được database.</p>
          <p className="mt-1">
            Tạo <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">.env.local</code> với{' '}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">TURSO_DATABASE_URL</code> và{' '}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">TURSO_AUTH_TOKEN</code>, rồi chạy{' '}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">npm run db:push</code>.
          </p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/50 p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-zinc-600 dark:text-zinc-300">Chưa có buổi nào.</p>
          <Link
            href="/upload"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Upload sheet đầu tiên
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((s) => {
            const allPaid = s.total > 0 && s.paid === s.total;
            return (
              <li key={s.id}>
                <Link
                  href={`/s/${s.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/30 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-700/60 dark:hover:bg-emerald-950/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">{s.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        allPaid
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      {allPaid ? 'Xong ✓' : `${s.paid}/${s.total} đã trả`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDateTime(s.createdAt)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
