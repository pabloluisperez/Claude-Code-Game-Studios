// VERTICAL SLICE - NOT FOR PRODUCTION
// Date: 2026-05-18

import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.SLICE_DATABASE_URL ??
      "postgres://slice:slice@localhost:5435/cascada_slice",
  },
  strict: true,
  verbose: true,
} satisfies Config;
