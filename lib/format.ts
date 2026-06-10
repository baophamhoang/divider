import type { Transfer } from './settlement';

/** Format a date Vietnamese-style, e.g. "10/06/2026 16:24". */
export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Format a number Vietnamese-style (e.g. 1146.5 -> "1.146,5").
 * `asK` only appends a "k" label for readability — it never scales the value.
 */
export function formatAmount(n: number, asK = false): string {
  const s = (Math.round(n * 100) / 100).toLocaleString('vi-VN', {
    maximumFractionDigits: 2,
  });
  return asK ? `${s}k` : s;
}

export type SummaryMeta = { name: string; asK?: boolean; url?: string };

/**
 * Build the Vietnamese copy-paste summary to drop into the group chat,
 * one "X trả Y: amount" line per transfer.
 */
export function buildSummary(meta: SummaryMeta, transfers: Transfer[]): string {
  const asK = meta.asK ?? false;
  const lines: string[] = [`💸 Chia tiền — ${meta.name}`, ''];

  if (transfers.length === 0) {
    lines.push('Huề cả làng, không ai phải chuyển 🎉');
  } else {
    for (const t of transfers) {
      lines.push(`• ${t.from} trả ${t.to}: ${formatAmount(t.amount, asK)}`);
    }
  }

  if (meta.url) lines.push('', meta.url);
  return lines.join('\n');
}
