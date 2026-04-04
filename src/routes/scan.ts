import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "../db/client";
import { accounts, scans } from "../db/schema";
import {
  createFreeScanRecord,
  getFreeScanRecord,
  hasUsedFreeScan,
  markFreeScanUsed,
} from "../lib/free-scan-store";
import { normalizeEmail, isDisposableEmail } from "../lib/email";
import { enqueueScanJob } from "../lib/queue";
import { verifyTurnstileToken } from "../lib/turnstile";

const scanRoute = new Hono();

const CreateScanSchema = z.object({
  urls: z
    .array(z.string().trim())
    .min(1)
    .max(3)
    .transform((urls) => urls.filter((url) => url.length > 0))
    .pipe(
      z
        .array(z.string().url().startsWith("https://"), {
          message: "Use 1-3 HTTPS product URLs.",
        })
        .min(1, "Use 1-3 HTTPS product URLs.")
        .max(3, "Use 1-3 HTTPS product URLs."),
    ),
  email: z.string().trim().email(),
  turnstileToken: z.string().trim().min(1),
});

const ScanIdSchema = z.object({
  id: z.string().uuid(),
});

scanRoute.post("/", async (c) => {
  const parseResult = CreateScanSchema.safeParse(await c.req.json().catch(() => null));

  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid scan request.",
      },
      400,
    );
  }

  const email = normalizeEmail(parseResult.data.email);

  if (isDisposableEmail(email)) {
    return c.json(
      {
        success: false,
        error: "Use a work or store email, not a disposable inbox.",
      },
      400,
    );
  }

  const remoteIp =
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim();

  const isTurnstileValid = await verifyTurnstileToken(
    parseResult.data.turnstileToken,
    remoteIp,
  );

  if (!isTurnstileValid) {
    return c.json(
      {
        success: false,
        error: "Turnstile verification failed.",
      },
      401,
    );
  }

  if (!db) {
    if (hasUsedFreeScan(email)) {
      return c.json(
        {
          success: false,
          error: "This email has already used the free scan.",
        },
        400,
      );
    }

    const scanId = crypto.randomUUID();
    createFreeScanRecord({
      email,
      id: scanId,
      pagesScanned: 0,
      pagesTotal: parseResult.data.urls.length,
      reportJson: null,
      scoreCompetitive: null,
      scoreLlm: null,
      scoreOverall: null,
      scoreProtocol: null,
      scoreSchema: null,
      status: "queued",
      urls: parseResult.data.urls,
    });

    await enqueueScanJob({
      email,
      scanId,
      urls: parseResult.data.urls,
    });
    markFreeScanUsed(email);

    return c.json(
      {
        success: true,
        data: {
          id: scanId,
          status: "queued" as const,
        },
      },
      201,
    );
  }

  const existingAccount = await db.query.accounts.findFirst({
    where: eq(accounts.email, email),
  });

  const existingFreeScan = existingAccount
    ? await db.query.scans.findFirst({
        where: and(
          eq(scans.accountId, existingAccount.id),
          eq(scans.scanType, "free"),
        ),
      })
    : null;

  if (existingAccount?.freeScanUsed || existingFreeScan) {
    return c.json(
      {
        success: false,
        error: "This email has already used the free scan.",
      },
      400,
    );
  }

  const accountId = existingAccount
    ? existingAccount.id
    : (
        await db
          .insert(accounts)
          .values({
            email,
          })
          .returning({ id: accounts.id })
      )[0]?.id;

  if (!accountId) {
    return c.json(
      {
        success: false,
        error: "Failed to create account record.",
      },
      500,
    );
  }

  const [scan] = await db
    .insert(scans)
    .values({
      accountId,
      scanType: "free",
      status: "queued",
      urlsInput: parseResult.data.urls,
      pagesScanned: 0,
      pagesTotal: parseResult.data.urls.length,
    })
    .returning({
      id: scans.id,
      status: scans.status,
    });

  if (!scan) {
    return c.json(
      {
        success: false,
        error: "Failed to create scan record.",
      },
      500,
    );
  }

  await enqueueScanJob({
    email,
    scanId: scan.id,
    urls: parseResult.data.urls,
  });

  await db
    .update(accounts)
    .set({
      freeScanUsed: true,
    })
    .where(eq(accounts.id, accountId));

  return c.json(
    {
      success: true,
      data: scan,
    },
    201,
  );
});

scanRoute.get("/:id", async (c) => {
  const parseResult = ScanIdSchema.safeParse(c.req.param());

  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: "Invalid scan ID.",
      },
      400,
    );
  }

  if (!db) {
    const record = getFreeScanRecord(parseResult.data.id);

    if (!record) {
      return c.json(
        {
          success: false,
          error: "Scan not found.",
        },
        404,
      );
    }

    return c.json({
      success: true,
      data: {
        id: record.id,
        status: record.status,
        progress: {
          current: record.pagesScanned,
          total: record.pagesTotal,
        },
        results:
          record.status === "complete"
            ? {
                scores: {
                  overall: record.scoreOverall,
                  schema: record.scoreSchema,
                  llm: record.scoreLlm,
                  protocol: record.scoreProtocol,
                  competitive: record.scoreCompetitive,
                },
                report: record.reportJson,
              }
            : null,
      },
    });
  }

  const scan = await db.query.scans.findFirst({
    where: eq(scans.id, parseResult.data.id),
  });

  if (!scan) {
    return c.json(
      {
        success: false,
        error: "Scan not found.",
      },
      404,
    );
  }

  return c.json({
    success: true,
    data: {
      id: scan.id,
      status: scan.status,
      progress: {
        current: scan.pagesScanned,
        total: scan.pagesTotal,
      },
      results:
        scan.status === "complete"
          ? {
              scores: {
                overall: scan.scoreOverall,
                schema: scan.scoreSchema,
                llm: scan.scoreLlm,
                protocol: scan.scoreProtocol,
                competitive: scan.scoreCompetitive,
              },
              report: scan.reportJson,
            }
          : null,
    },
  });
});

export { scanRoute };
