'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sessions, transfers } from '@/lib/schema';
import { computeSettlement, round2, type Balance } from '@/lib/settlement';
import { newId } from '@/lib/id';
import { isAllowedQrUrl } from '@/lib/qr';

export type CreateSessionInput = {
  name: string;
  currency: string | null;
  sourceFilename: string | null;
  balances: Balance[];
  /** Optional per-player payment QR: player name -> link (from the QR_SHEET tab). */
  qrByName?: Record<string, string>;
};

/**
 * Persist a settlement and redirect to its share page.
 *
 * Server Actions are reachable via direct POST, so we re-validate and re-derive
 * everything here rather than trusting the client: balances are sanitized and the
 * transfer list is recomputed from scratch with `computeSettlement` (the client's
 * preview is never written verbatim).
 */
export async function createSession(input: CreateSessionInput): Promise<void> {
  const name = (input?.name ?? '').trim().slice(0, 120) || 'Buổi chơi';
  const currency = input?.currency ? String(input.currency).slice(0, 8) : null;
  const sourceFilename = input?.sourceFilename
    ? String(input.sourceFilename).slice(0, 200)
    : null;

  const balances: Balance[] = Array.isArray(input?.balances)
    ? input.balances
        .map((b) => ({ name: String(b?.name ?? '').trim().slice(0, 80), net: round2(Number(b?.net)) }))
        .filter((b) => b.name !== '' && Number.isFinite(b.net) && Math.abs(b.net) > 1e-9)
    : [];

  if (balances.length === 0) {
    throw new Error('Không có số liệu người chơi hợp lệ để chia.');
  }

  // Stable snapshot (winners first) + authoritative settlement.
  balances.sort((a, b) => b.net - a.net);
  const residual = round2(balances.reduce((s, b) => s + b.net, 0));
  const settlement = computeSettlement(balances);

  // QR links are untrusted spreadsheet input: keep only entries for a known player
  // whose URL passes the Google-host allowlist. Server Actions are POST-reachable,
  // so we never trust the client's map verbatim.
  const allowedNames = new Set(balances.map((b) => b.name));
  const qrLinks: Record<string, string> = {};
  if (input?.qrByName && typeof input.qrByName === 'object') {
    for (const [rawName, rawUrl] of Object.entries(input.qrByName)) {
      const name = String(rawName ?? '').trim().slice(0, 80);
      if (allowedNames.has(name) && isAllowedQrUrl(rawUrl)) qrLinks[name] = rawUrl;
    }
  }

  const id = newId();
  const sessionRow = { id, name, currency, sourceFilename, residual, balances, qrLinks };
  const transferRows = settlement.map((t, i) => ({
    id: newId(),
    sessionId: id,
    fromName: t.from,
    toName: t.to,
    amount: t.amount,
    sortIndex: i,
  }));

  // Atomic: session + its transfers in one batch.
  if (transferRows.length > 0) {
    await db.batch([
      db.insert(sessions).values(sessionRow),
      db.insert(transfers).values(transferRows),
    ]);
  } else {
    await db.insert(sessions).values(sessionRow);
  }

  revalidatePath('/');
  redirect(`/s/${id}`); // throws control-flow exception; nothing after runs
}

/** Toggle a single transfer's paid state and refresh its share page. */
export async function toggleTransferPaid(id: string, paid: boolean): Promise<void> {
  const transferId = String(id ?? '').trim();
  if (!transferId) throw new Error('Thiếu mã transfer.');

  const [row] = await db
    .update(transfers)
    .set({ paid: Boolean(paid), paidAt: paid ? new Date() : null })
    .where(eq(transfers.id, transferId))
    .returning({ sessionId: transfers.sessionId });

  if (row) revalidatePath(`/s/${row.sessionId}`);
}
