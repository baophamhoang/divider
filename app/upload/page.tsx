import Link from 'next/link';
import UploadClient from './UploadClient';

export default function UploadPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <header className="mb-6">
        <Link
          href="/"
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Trang chủ
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Buổi chơi mới</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Chọn file <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">.xlsx</code> export từ Google
          Sheet. App đọc hàng <b>Total</b>, bạn kiểm tra lại số rồi tạo link chia tiền.
        </p>
      </header>
      <UploadClient />
    </main>
  );
}
