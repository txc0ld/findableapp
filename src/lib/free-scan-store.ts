import type { ScanStatus } from "@findable/shared";

export interface FreeScanRecord {
  email: string;
  id: string;
  pagesScanned: number;
  pagesTotal: number;
  reportJson: Record<string, unknown> | null;
  scoreCompetitive: number | null;
  scoreLlm: number | null;
  scoreOverall: number | null;
  scoreProtocol: number | null;
  scoreSchema: number | null;
  status: ScanStatus;
  urls: string[];
}

const freeScanRecords = new Map<string, FreeScanRecord>();
const emailUsage = new Set<string>();

export function hasUsedFreeScan(email: string): boolean {
  return emailUsage.has(email);
}

export function markFreeScanUsed(email: string) {
  emailUsage.add(email);
}

export function createFreeScanRecord(record: FreeScanRecord) {
  freeScanRecords.set(record.id, record);
}

export function getFreeScanRecord(id: string): FreeScanRecord | null {
  return freeScanRecords.get(id) ?? null;
}

export function listFreeScanRecords(): FreeScanRecord[] {
  return Array.from(freeScanRecords.values());
}

export function listFreeScanRecordsByEmail(email: string): FreeScanRecord[] {
  return listFreeScanRecords().filter((record) => record.email === email);
}

export function updateFreeScanRecord(
  id: string,
  update: Partial<FreeScanRecord>,
): FreeScanRecord | null {
  const record = freeScanRecords.get(id);

  if (!record) {
    return null;
  }

  const nextRecord = {
    ...record,
    ...update,
  };

  freeScanRecords.set(id, nextRecord);
  return nextRecord;
}
