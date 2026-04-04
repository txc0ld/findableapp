import { Worker } from "bullmq";
import IORedis from "ioredis";
import { eq, and } from "drizzle-orm";

import { db } from "../db/client";
import { env } from "../lib/env";
import { updateFreeScanRecord } from "../lib/free-scan-store";
import { issues, products, scans } from "../db/schema";
import { runScan, type ScanJobPayload } from "../services/scanner";

export async function processScanJob(payload: ScanJobPayload) {
  if (db) {
    await db
      .update(scans)
      .set({
        status: "scanning",
        startedAt: new Date(),
      })
      .where(eq(scans.id, payload.scanId));
  } else {
    updateFreeScanRecord(payload.scanId, {
      status: "scanning",
    });
  }

  const result = await runScan(payload);

  if (db) {
    const scanRecord = await db.query.scans.findFirst({
      where: eq(scans.id, payload.scanId),
    });

    await db
      .update(scans)
      .set({
        status: result.status,
        pagesScanned: result.pagesScanned,
        pagesTotal: result.pagesTotal,
        scoreOverall: result.scoreOverall,
        scoreSchema: result.scoreSchema,
        scoreLlm: result.scoreLlm,
        scoreProtocol: result.scoreProtocol,
        scoreCompetitive: result.scoreCompetitive,
        reportJson: result.reportJson,
        completedAt: new Date(),
      })
      .where(eq(scans.id, payload.scanId));

    if (scanRecord) {
      // Delete old issues for this scan
      await db.delete(issues).where(eq(issues.scanId, payload.scanId));

      // Update existing products by URL (from sync) instead of creating duplicates.
      // Only create new product records if no synced product exists for that URL.
      const productIdByUrl = new Map<string, string>();

      for (const product of result.products) {
        const scanData = {
          scanId: payload.scanId,
          googleCategory: product.category,
          hasJsonld: product.schemaScore >= 35,
          hasGtin: product.issues.every((issue) => !issue.title.includes("identifier")),
          hasBrand: product.issues.every((issue) => !issue.title.includes("brand")),
          hasShippingSchema: product.issues.every((issue) => !issue.title.includes("Shipping")),
          hasReturnSchema: product.issues.every((issue) => !issue.title.includes("Return")),
          hasReviewSchema: product.issues.every((issue) => !issue.title.includes("Review")),
          hasFaqSchema: product.issues.every((issue) => !issue.title.includes("FAQ")),
          schemaScore: product.schemaScore,
          aeoScore: product.llmScore,
          llmScore: product.llmScore,
          generatedSchema: product.generatedSchema,
          missingAttributes: product.issues.map((issue) => issue.title),
        };

        // Try to find an existing product for this store + URL
        const existing = await db.query.products.findFirst({
          where: and(
            eq(products.storeId, scanRecord.storeId!),
            eq(products.url, product.url),
          ),
        });

        if (existing) {
          // Update existing product with scan results — preserve synced data
          await db.update(products).set(scanData).where(eq(products.id, existing.id));
          productIdByUrl.set(product.url, existing.id);
        } else {
          // No synced product for this URL — create a new record
          const [inserted] = await db.insert(products).values({
            ...scanData,
            storeId: scanRecord.storeId,
            url: product.url,
            name: product.name,
            price: product.price?.toFixed(2),
            currency: product.price !== null ? "USD" : null,
          }).returning({ id: products.id });
          if (inserted) {
            productIdByUrl.set(product.url, inserted.id);
          }
        }
      }

      // Insert issues linked to products
      const issuesToInsert = result.issues.map((issue) => {
        const matchingProduct = result.products.find(
          (product) => product.name === issue.productName,
        );

        return {
          scanId: payload.scanId,
          productId: matchingProduct ? productIdByUrl.get(matchingProduct.url) ?? null : null,
          severity: issue.severity,
          dimension: issue.dimension,
          code: issue.id,
          title: issue.title,
          description: issue.description,
          fixType: issue.fixType,
          pointsImpact: issue.pointsImpact,
          fixed: false,
        };
      });

      if (issuesToInsert.length > 0) {
        await db.insert(issues).values(issuesToInsert);
      }
    }
  } else {
    updateFreeScanRecord(payload.scanId, {
      status: result.status,
      pagesScanned: result.pagesScanned,
      pagesTotal: result.pagesTotal,
      scoreOverall: result.scoreOverall,
      scoreSchema: result.scoreSchema,
      scoreLlm: result.scoreLlm,
      scoreProtocol: result.scoreProtocol,
      scoreCompetitive: result.scoreCompetitive,
      reportJson: result.reportJson,
    });
  }
}

export const scanWorker = env.REDIS_URL
  ? new Worker(
      "scan",
      async (job) => {
        await processScanJob(job.data as ScanJobPayload);
        return null;
      },
      {
        connection: new IORedis(env.REDIS_URL, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        }),
      },
    )
  : null;
