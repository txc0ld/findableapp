import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "../lib/env";
import { schema } from "./schema";

const pool = env.DATABASE_URL
  ? new Pool({ connectionString: env.DATABASE_URL })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;

