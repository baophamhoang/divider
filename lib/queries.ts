import { eq, asc, desc, sql } from 'drizzle-orm';
import { db } from './db';
import { sessions, transfers, type Session, type TransferRow } from './schema';

/** Load a saved settlement (session + its transfers) by share id, or null if missing. */
export async function getSession(
  id: string,
): Promise<{ session: Session; transfers: TransferRow[] } | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!session) return null;

  const rows = await db
    .select()
    .from(transfers)
    .where(eq(transfers.sessionId, id))
    .orderBy(asc(transfers.sortIndex));

  return { session, transfers: rows };
}

export type SessionListItem = {
  id: string;
  name: string;
  createdAt: Date;
  residual: number;
  total: number; // number of transfers
  paid: number; // number marked paid
};

/** All saved settlements, newest first, with paid/total progress for the history list. */
export async function listSessions(): Promise<SessionListItem[]> {
  const rows = await db
    .select({
      id: sessions.id,
      name: sessions.name,
      createdAt: sessions.createdAt,
      residual: sessions.residual,
      total: sql<number>`count(${transfers.id})`,
      paid: sql<number>`sum(case when ${transfers.paid} then 1 else 0 end)`,
    })
    .from(sessions)
    .leftJoin(transfers, eq(transfers.sessionId, sessions.id))
    .groupBy(sessions.id)
    .orderBy(desc(sessions.createdAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    residual: r.residual,
    total: Number(r.total ?? 0),
    paid: Number(r.paid ?? 0),
  }));
}
