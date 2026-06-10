import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs as a standalone process and does not load Next's env files,
// so load .env.local explicitly (where TURSO_* live; .env* is git-ignored).
config({ path: '.env.local' });

export default defineConfig({
  schema: './lib/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  },
});
