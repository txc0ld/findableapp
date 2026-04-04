import { Hono } from "hono";
import { cors } from "hono/cors";

import { env } from "./lib/env";
import { accountRoute } from "./routes/account";
import { authRoute } from "./routes/auth";
import { healthRoute } from "./routes/health";
import { scanRoute } from "./routes/scan";
import { shopifyRoute } from "./routes/shopify";

const app = new Hono();
const allowedOrigins = (
  env.CORS_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [
    env.FRONTEND_URL,
  ]
).filter(Boolean);

app.use(
  "/api/*",
  cors({
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    origin: (origin) => {
      if (!origin) {
        return allowedOrigins[0] ?? env.FRONTEND_URL;
      }

      if (allowedOrigins.includes(origin)) {
        return origin;
      }

      return undefined as unknown as string;
    },
  }),
);

app.get("/", (c) =>
  c.json({
    success: true,
    data: {
      service: "findable-api",
      version: "0.1.0",
      docs: "Phase 1 Step 1 scaffold",
    },
  }),
);

app.route("/api/health", healthRoute);
app.route("/api/auth", authRoute);
app.route("/api/account", accountRoute);
app.route("/api/scan", scanRoute);
app.route("/api/shopify", shopifyRoute);
app.route("/shopify", shopifyRoute);

export type AppType = typeof app;

console.log(`FINDABLE API listening on http://localhost:${env.PORT}`);

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});
