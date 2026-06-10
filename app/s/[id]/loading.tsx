export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <div className="h-7 w-44 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-3 h-4 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
    </main>
  );
}
