import { Worker } from "bullmq";
import IORedis from "ioredis";
import { eq } from "drizzle-orm";

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
      await db.delete(issues).where(eq(issues.scanId, payload.scanId));
      await db.delete(products).where(eq(products.scanId, payload.scanId));

      const insertedProducts = await db
        .insert(products)
        .values(
          result.products.map((product) => ({
            scanId: payload.scanId,
            storeId: scanRecord.storeId,
            url: product.url,
            name: product.name,
            googleCategory: product.category,
            price: product.price?.toFixed(2),
            currency: product.price !== null ? "USD" : null,
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
          })),
        )
        .returning({
          id: products.id,
          name: products.name,
          url: products.url,
        });

      const productIdByUrl = new Map(
        insertedProducts.map((product) => [product.url, product.id]),
      );
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
