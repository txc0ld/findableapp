import { Hono } from "hono";
import { z } from "zod";

import { requireAuth, type AuthVariables } from "../lib/auth-middleware";
import {
  applyWorkspaceFix,
  buildWorkspaceData,
  updateWorkspaceNotifications,
  updateWorkspacePlan,
  updateWorkspaceStore,
} from "../lib/workspace-data";

const accountRoute = new Hono<{ Variables: AuthVariables }>();

const PlanSchema = z.object({
  plan: z.enum(["free", "starter", "growth", "pro", "agency"]),
});

const NotificationSchema = z.object({
  notifications: z
    .object({
      competitorChanges: z.boolean().optional(),
      criticalAlerts: z.boolean().optional(),
      weeklyReport: z.boolean().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one notification setting is required.",
    }),
});

const StoreSchema = z.object({
  store: z.object({
    name: z.string().trim().min(1),
    platform: z.enum(["shopify", "woocommerce", "bigcommerce", "custom"]).nullable(),
    url: z.string().trim().url(),
  }),
});

const FixSchema = z.object({
  issueId: z.string().trim().min(1),
});

accountRoute.use("*", requireAuth());

accountRoute.get("/workspace", async (c) => {
  const authAccount = c.get("authAccount");

  const workspace = await buildWorkspaceData(authAccount.email);

  return c.json({
    success: true,
    data: workspace,
  });
});

accountRoute.post("/plan", async (c) => {
  const parseResult = PlanSchema.safeParse(await c.req.json().catch(() => null));

  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid plan update request.",
      },
      400,
    );
  }

  const authAccount = c.get("authAccount");
  const plan = await updateWorkspacePlan(authAccount.email, parseResult.data.plan);

  return c.json({
    success: true,
    data: {
      plan,
      stripeCheckoutUrl: null,
    },
  });
});

accountRoute.post("/notifications", async (c) => {
  const parseResult = NotificationSchema.safeParse(await c.req.json().catch(() => null));

  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid notification settings.",
      },
      400,
    );
  }

  const authAccount = c.get("authAccount");
  const notifications = await updateWorkspaceNotifications(
    authAccount.email,
    Object.fromEntries(
      Object.entries(parseResult.data.notifications).filter(([, value]) => value !== undefined),
    ),
  );

  return c.json({
    success: true,
    data: notifications,
  });
});

accountRoute.post("/store", async (c) => {
  const parseResult = StoreSchema.safeParse(await c.req.json().catch(() => null));

  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid store payload.",
      },
      400,
    );
  }

  const authAccount = c.get("authAccount");
  const store = await updateWorkspaceStore(authAccount.email, parseResult.data.store);

  return c.json({
    success: true,
    data: store,
  });
});

accountRoute.post("/fixes/apply", async (c) => {
  const parseResult = FixSchema.safeParse(await c.req.json().catch(() => null));

  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid fix request.",
      },
      400,
    );
  }

  const authAccount = c.get("authAccount");
  await applyWorkspaceFix(authAccount.email, parseResult.data.issueId);
  const workspace = await buildWorkspaceData(authAccount.email);

  return c.json({
    success: true,
    data: workspace,
  });
});

export { accountRoute };
