import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db } from "./client";

if (!db) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

await migrate(db, {
  migrationsFolder: "./src/db/migrations",
});

console.log("Database migrations applied.");
