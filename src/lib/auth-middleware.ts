import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { accounts } from "../db/schema";
import { sanitizeAccount, type AuthenticatedAccount, verifyAccessToken } from "./auth";

export interface AuthVariables {
  authAccount: AuthenticatedAccount;
}

export function requireAuth(): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    if (!db) {
      return c.json(
        {
          success: false,
          error: "Authentication requires a configured database.",
        },
        503,
      );
    }

    const authorization = c.req.header("authorization");
    const token =
      authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;

    if (!token) {
      return c.json(
        {
          success: false,
          error: "Authentication required.",
        },
        401,
      );
    }

    try {
      const payload = await verifyAccessToken(token);
      const account = await db.query.accounts.findFirst({
        where: eq(accounts.id, payload.accountId),
      });

      if (!account) {
        return c.json(
          {
            success: false,
            error: "Authentication required.",
          },
          401,
        );
      }

      c.set("authAccount", sanitizeAccount(account));
      await next();
    } catch {
      return c.json(
        {
          success: false,
          error: "Authentication required.",
        },
        401,
      );
    }
  };
}
