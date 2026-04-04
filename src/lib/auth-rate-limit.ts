import IORedis from "ioredis";

import { env } from "./env";

const LOGIN_WINDOW_SECONDS = 60 * 15;
const LOGIN_ATTEMPT_LIMIT = 5;

const redis = env.REDIS_URL
  ? new IORedis(env.REDIS_URL, {
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    })
  : null;

const memoryAttempts = new Map<string, { count: number; expiresAt: number }>();

function memoryKey(email: string) {
  return email.trim().toLowerCase();
}

function getMemoryAttempts(email: string) {
  const key = memoryKey(email);
  const existing = memoryAttempts.get(key);

  if (!existing) {
    return 0;
  }

  if (existing.expiresAt <= Date.now()) {
    memoryAttempts.delete(key);
    return 0;
  }

  return existing.count;
}

export async function getRemainingLoginAttempts(email: string) {
  const key = `auth:login:${memoryKey(email)}`;

  if (redis) {
    const attempts = Number.parseInt((await redis.get(key)) ?? "0", 10);
    return Math.max(0, LOGIN_ATTEMPT_LIMIT - attempts);
  }

  return Math.max(0, LOGIN_ATTEMPT_LIMIT - getMemoryAttempts(email));
}

export async function recordFailedLogin(email: string) {
  const key = `auth:login:${memoryKey(email)}`;

  if (redis) {
    const attempts = await redis.incr(key);

    if (attempts === 1) {
      await redis.expire(key, LOGIN_WINDOW_SECONDS);
    }

    return attempts;
  }

  const existing = memoryAttempts.get(memoryKey(email));
  const nextCount =
    existing && existing.expiresAt > Date.now()
      ? existing.count + 1
      : 1;

  memoryAttempts.set(memoryKey(email), {
    count: nextCount,
    expiresAt: Date.now() + LOGIN_WINDOW_SECONDS * 1000,
  });

  return nextCount;
}

export async function clearFailedLoginAttempts(email: string) {
  const key = `auth:login:${memoryKey(email)}`;

  if (redis) {
    await redis.del(key);
    return;
  }

  memoryAttempts.delete(memoryKey(email));
}
