import { Queue } from "bullmq";
import IORedis from "ioredis";

import { env } from "./env";
import type { ScanJobPayload } from "../services/scanner";
import { processScanJob } from "../workers/scan-worker";

const connection = env.REDIS_URL
  ? new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  : null;

export const scanQueue = connection
  ? new Queue("scan", { connection })
  : null;

export async function enqueueScanJob(payload: ScanJobPayload) {
  if (scanQueue) {
    await scanQueue.add("free-scan", payload);
    return;
  }

  void processScanJob(payload);
}
