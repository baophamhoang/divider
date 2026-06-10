import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import type { Balance } from './settlement';

/**
 * A saved settlement. `id` doubles as the share token in `/s/<id>`.
 * The per-player net balances are stored inline as a JSON snapshot — they are a
 * read-mostly record loaded/saved together with the session, never queried on
 * their own, so an embedded document beats a separate table here.
 */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // nanoid, generated in app code
  name: text('name').notNull(),
  currency: text('currency'), // display unit label (e.g. 'k'); null = plain numbers
  sourceFilename: text('source_filename'),
  residual: real('residual').notNull().default(0),
  balances: text('balances', { mode: 'json' })
    .$type<Balance[]>()
    .notNull()
    .default(sql`'[]'`),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * One "X pays Y" line of a settlement. Each row is individually toggled paid,
 * so transfers are a real table (unlike the embedded balances above).
 */
export const transfers = sqliteTable(
  'transfers',
  {
    id: text('id').primaryKey(), // nanoid
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    fromName: text('from_name').notNull(), // payer (owed money)
    toName: text('to_name').notNull(), // payee (won money)
    amount: real('amount').notNull(), // real keeps the .5 half-units
    paid: integer('paid', { mode: 'boolean' }).notNull().default(false),
    paidAt: integer('paid_at', { mode: 'timestamp' }),
    sortIndex: integer('sort_index').notNull().default(0),
  },
  (t) => [index('transfers_session_id_idx').on(t.sessionId)],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type TransferRow = typeof transfers.$inferSelect;
export type NewTransferRow = typeof transfers.$inferInsert;
