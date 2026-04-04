import { hash as hashPasswordValue, verify as verifyPasswordValue } from "@node-rs/argon2";
import { jwtVerify, SignJWT } from "jose";
import { createHash, randomBytes } from "node:crypto";

import type { Account } from "../db/schema";
import { env } from "./env";

const encoder = new TextEncoder();
const jwtSecret = encoder.encode(env.JWT_SECRET);
const jwtAudience = "findable-web";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;
export const REFRESH_COOKIE_NAME = "findable_refresh";

export interface AuthenticatedAccount {
  createdAt: Date;
  email: string;
  freeScanUsed: boolean;
  id: string;
  plan: Account["plan"];
}

interface AuthTokenPayload {
  email?: string;
  plan?: Account["plan"];
  sid?: string;
  type?: "access" | "refresh";
}

function buildAuthAccount(account: Account): AuthenticatedAccount {
  return {
    createdAt: account.createdAt,
    email: account.email,
    freeScanUsed: account.freeScanUsed,
    id: account.id,
    plan: account.plan,
  };
}

export function serializeAuthAccount(account: Account | AuthenticatedAccount) {
  return {
    createdAt: account.createdAt.toISOString(),
    email: account.email,
    freeScanUsed: account.freeScanUsed,
    id: account.id,
    plan: account.plan,
  };
}

export async function hashPassword(password: string) {
  return hashPasswordValue(password, {
    memoryCost: 19_456,
    outputLen: 32,
    parallelism: 1,
    timeCost: 2,
  });
}

export async function verifyPassword(password: string, passwordHash: string) {
  return verifyPasswordValue(passwordHash, password);
}

export async function createAccessToken(account: Account | AuthenticatedAccount) {
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const token = await new SignJWT({
    email: account.email,
    plan: account.plan,
    type: "access",
  } satisfies AuthTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(account.id)
    .setAudience(jwtAudience)
    .setIssuer(env.JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(jwtSecret);

  return { expiresAt, token };
}

export async function createRefreshToken(account: Account | AuthenticatedAccount, sessionId: string) {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  const token = await new SignJWT({
    sid: sessionId,
    type: "refresh",
  } satisfies AuthTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(account.id)
    .setAudience(jwtAudience)
    .setIssuer(env.JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TOKEN_TTL_SECONDS}s`)
    .sign(jwtSecret);

  return { expiresAt, token };
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify<AuthTokenPayload>(token, jwtSecret, {
    audience: jwtAudience,
    issuer: env.JWT_ISSUER,
  });

  if (payload.type !== "access" || typeof payload.sub !== "string") {
    throw new Error("Invalid access token.");
  }

  return {
    accountId: payload.sub,
    email: payload.email ?? "",
    plan: payload.plan ?? "free",
  };
}

export async function verifyRefreshToken(token: string) {
  const { payload } = await jwtVerify<AuthTokenPayload>(token, jwtSecret, {
    audience: jwtAudience,
    issuer: env.JWT_ISSUER,
  });

  if (
    payload.type !== "refresh" ||
    typeof payload.sub !== "string" ||
    typeof payload.sid !== "string"
  ) {
    throw new Error("Invalid refresh token.");
  }

  return {
    accountId: payload.sub,
    sessionId: payload.sid,
  };
}

export function createPasswordResetToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000),
    token,
    tokenHash: hashToken(token),
  };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sanitizeAccount(account: Account) {
  return buildAuthAccount(account);
}
