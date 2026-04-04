import { and, eq, gt, isNull } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono, type Context } from "hono";
import { z } from "zod";

import { db } from "../db/client";
import { accounts, authRefreshTokens, passwordResetTokens } from "../db/schema";
import {
  createAccessToken,
  createPasswordResetToken,
  createRefreshToken,
  hashPassword,
  hashToken,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_SECONDS,
  serializeAuthAccount,
  verifyPassword,
  verifyRefreshToken,
} from "../lib/auth";
import { requireAuth, type AuthVariables } from "../lib/auth-middleware";
import {
  clearFailedLoginAttempts,
  getRemainingLoginAttempts,
  recordFailedLogin,
} from "../lib/auth-rate-limit";
import { sendPasswordResetEmail } from "../lib/auth-email";
import { normalizeEmail } from "../lib/email";
import { env } from "../lib/env";

const authRoute = new Hono<{ Variables: AuthVariables }>();

const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200, "Password is too long.");

const SignupSchema = z.object({
  email: z.string().trim().email(),
  password: PasswordSchema,
});

const LoginSchema = SignupSchema;

const ForgotSchema = z.object({
  email: z.string().trim().email(),
});

const ResetSchema = z.object({
  token: z.string().trim().min(1, "Reset token is required."),
  newPassword: PasswordSchema,
});

const refreshCookieOptions = {
  httpOnly: true,
  maxAge: REFRESH_TOKEN_TTL_SECONDS,
  path: "/",
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
};

async function issueAuthSession(
  c: Context,
  account: typeof accounts.$inferSelect,
  status: 200 | 201 = 200,
) {
  if (!db) {
    return c.json(
      {
        success: false,
        error: "Authentication requires a configured database.",
      },
      503,
    );
  }

  const sessionId = crypto.randomUUID();
  const refreshToken = await createRefreshToken(account, sessionId);
  const accessToken = await createAccessToken(account);

  await db.insert(authRefreshTokens).values({
    accountId: account.id,
    expiresAt: refreshToken.expiresAt,
    id: sessionId,
    tokenHash: hashToken(refreshToken.token),
  });

  setCookie(c, REFRESH_COOKIE_NAME, refreshToken.token, refreshCookieOptions);

  return c.json(
    {
      success: true,
      data: {
        accessToken: accessToken.token,
        accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
        account: serializeAuthAccount(account),
      },
    },
    status,
  );
}

async function revokeRefreshSession(rawToken: string | null) {
  if (!db || !rawToken) {
    return;
  }

  await db
    .update(authRefreshTokens)
    .set({
      lastUsedAt: new Date(),
      revokedAt: new Date(),
    })
    .where(
      and(
        eq(authRefreshTokens.tokenHash, hashToken(rawToken)),
        isNull(authRefreshTokens.revokedAt),
      ),
    );
}

authRoute.post("/signup", async (c) => {
  if (!db) {
    return c.json(
      {
        success: false,
        error: "Authentication requires a configured database.",
      },
      503,
    );
  }

  const parseResult = SignupSchema.safeParse(await c.req.json().catch(() => null));

  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid signup request.",
      },
      400,
    );
  }

  const email = normalizeEmail(parseResult.data.email);
  const passwordHash = await hashPassword(parseResult.data.password);
  const existingAccount = await db.query.accounts.findFirst({
    where: eq(accounts.email, email),
  });

  if (existingAccount?.passwordHash) {
    return c.json(
      {
        success: false,
        error: "An account already exists for this email.",
      },
      409,
    );
  }

  let account: typeof accounts.$inferSelect | undefined = existingAccount ?? undefined;

  if (existingAccount) {
    const [updatedAccount] = await db
      .update(accounts)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, existingAccount.id))
      .returning();

    account = updatedAccount ?? existingAccount;
  } else {
    const [createdAccount] = await db
      .insert(accounts)
      .values({
        email,
        passwordHash,
      })
      .returning();

    account = createdAccount ?? undefined;
  }

  if (!account) {
    return c.json(
      {
        success: false,
        error: "Failed to create account.",
      },
      500,
    );
  }

  return issueAuthSession(c, account, 201);
});

authRoute.post("/login", async (c) => {
  if (!db) {
    return c.json(
      {
        success: false,
        error: "Authentication requires a configured database.",
      },
      503,
    );
  }

  const parseResult = LoginSchema.safeParse(await c.req.json().catch(() => null));

  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid login request.",
      },
      400,
    );
  }

  const email = normalizeEmail(parseResult.data.email);
  const remainingAttempts = await getRemainingLoginAttempts(email);

  if (remainingAttempts <= 0) {
    return c.json(
      {
        success: false,
        error: "Too many login attempts. Try again in 15 minutes.",
      },
      429,
    );
  }

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.email, email),
  });

  if (!account?.passwordHash) {
    await recordFailedLogin(email);
    return c.json(
      {
        success: false,
        error: "Invalid email or password.",
      },
      401,
    );
  }

  const passwordMatches = await verifyPassword(parseResult.data.password, account.passwordHash);

  if (!passwordMatches) {
    await recordFailedLogin(email);
    return c.json(
      {
        success: false,
        error: "Invalid email or password.",
      },
      401,
    );
  }

  await clearFailedLoginAttempts(email);

  return issueAuthSession(c, account);
});

authRoute.post("/forgot", async (c) => {
  if (!db) {
    return c.json(
      {
        success: false,
        error: "Authentication requires a configured database.",
      },
      503,
    );
  }

  if (!env.RESEND_API_KEY) {
    return c.json(
      {
        success: false,
        error: "Password reset email delivery is not configured.",
      },
      503,
    );
  }

  const parseResult = ForgotSchema.safeParse(await c.req.json().catch(() => null));

  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid forgot password request.",
      },
      400,
    );
  }

  const email = normalizeEmail(parseResult.data.email);
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.email, email),
  });

  if (account?.passwordHash) {
    const resetToken = createPasswordResetToken();

    await db.insert(passwordResetTokens).values({
      accountId: account.id,
      expiresAt: resetToken.expiresAt,
      tokenHash: resetToken.tokenHash,
    });

    await sendPasswordResetEmail(email, resetToken.token);
  }

  return c.json({
    success: true,
    data: {
      sent: true,
    },
  });
});

authRoute.post("/reset", async (c) => {
  if (!db) {
    return c.json(
      {
        success: false,
        error: "Authentication requires a configured database.",
      },
      503,
    );
  }

  const parseResult = ResetSchema.safeParse(await c.req.json().catch(() => null));

  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid password reset request.",
      },
      400,
    );
  }

  const tokenHash = hashToken(parseResult.data.token);
  const resetToken = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date()),
    ),
  });

  if (!resetToken) {
    return c.json(
      {
        success: false,
        error: "This reset link is invalid or has expired.",
      },
      400,
    );
  }

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, resetToken.accountId),
  });

  if (!account) {
    return c.json(
      {
        success: false,
        error: "Account not found.",
      },
      404,
    );
  }

  const nextPasswordHash = await hashPassword(parseResult.data.newPassword);

  const [updatedAccount] = await db
    .update(accounts)
    .set({
      passwordHash: nextPasswordHash,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, account.id))
    .returning();

  await db
    .update(passwordResetTokens)
    .set({
      usedAt: new Date(),
    })
    .where(eq(passwordResetTokens.id, resetToken.id));

  await db
    .update(authRefreshTokens)
    .set({
      revokedAt: new Date(),
    })
    .where(
      and(
        eq(authRefreshTokens.accountId, account.id),
        isNull(authRefreshTokens.revokedAt),
      ),
    );

  if (!updatedAccount) {
    return c.json(
      {
        success: false,
        error: "Failed to update password.",
      },
      500,
    );
  }

  return issueAuthSession(c, updatedAccount);
});

authRoute.get("/me", requireAuth(), async (c) => {
  const account = c.get("authAccount");

  return c.json({
    success: true,
    data: {
      account: serializeAuthAccount(account),
    },
  });
});

authRoute.post("/refresh", async (c) => {
  if (!db) {
    return c.json(
      {
        success: false,
        error: "Authentication requires a configured database.",
      },
      503,
    );
  }

  const refreshToken = getCookie(c, REFRESH_COOKIE_NAME) ?? null;

  if (!refreshToken) {
    return c.json(
      {
        success: false,
        error: "Refresh token missing.",
      },
      401,
    );
  }

  try {
    const payload = await verifyRefreshToken(refreshToken);
    const session = await db.query.authRefreshTokens.findFirst({
      where: and(
        eq(authRefreshTokens.id, payload.sessionId),
        eq(authRefreshTokens.accountId, payload.accountId),
        eq(authRefreshTokens.tokenHash, hashToken(refreshToken)),
        isNull(authRefreshTokens.revokedAt),
        gt(authRefreshTokens.expiresAt, new Date()),
      ),
    });

    if (!session) {
      deleteCookie(c, REFRESH_COOKIE_NAME, refreshCookieOptions);
      return c.json(
        {
          success: false,
          error: "Refresh token invalid.",
        },
        401,
      );
    }

    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, payload.accountId),
    });

    if (!account) {
      deleteCookie(c, REFRESH_COOKIE_NAME, refreshCookieOptions);
      return c.json(
        {
          success: false,
          error: "Authentication required.",
        },
        401,
      );
    }

    await db
      .update(authRefreshTokens)
      .set({
        lastUsedAt: new Date(),
        revokedAt: new Date(),
      })
      .where(eq(authRefreshTokens.id, session.id));

    return issueAuthSession(c, account);
  } catch {
    deleteCookie(c, REFRESH_COOKIE_NAME, refreshCookieOptions);
    return c.json(
      {
        success: false,
        error: "Refresh token invalid.",
      },
      401,
    );
  }
});

authRoute.post("/logout", async (c) => {
  const refreshToken = getCookie(c, REFRESH_COOKIE_NAME) ?? null;

  await revokeRefreshSession(refreshToken);
  deleteCookie(c, REFRESH_COOKIE_NAME, refreshCookieOptions);

  return c.json({
    success: true,
    data: {
      loggedOut: true,
    },
  });
});

export { authRoute };
