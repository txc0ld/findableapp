export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type PlanTier = "free" | "starter" | "growth" | "pro" | "agency";

export type ScanStatus =
  | "queued"
  | "scanning"
  | "scoring"
  | "complete"
  | "failed";

export interface ScoreBreakdown {
  overall: number | null;
  schema: number | null;
  llm: number | null;
  protocol: number | null;
  competitive: number | null;
}

export interface ScanSummary {
  id: string;
  status: ScanStatus;
  email: string;
  urls: string[];
  scores: ScoreBreakdown;
}

