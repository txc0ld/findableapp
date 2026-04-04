import { Hono } from "hono";

export const healthRoute = new Hono().get("/", (c) =>
  c.json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
  }),
);

