import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <p className="text-4xl">🤷</p>
      <h1 className="mt-3 text-xl font-semibold">Không tìm thấy bảng chia tiền này</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Link có thể sai hoặc đã bị xoá.</p>
      <Link
        href="/"
        className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
      >
        Về trang chủ
      </Link>
    </main>
  );
}
