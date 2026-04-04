import type { PlanTier, ScanStatus, ScoreBreakdown } from "./types";

export type WorkspacePlatform = "shopify" | "woocommerce" | "bigcommerce" | "custom";
export type WorkspaceIssueSeverity = "critical" | "high" | "medium" | "low";
export type WorkspaceIssueDimension = "schema" | "llm" | "protocol" | "consistency";
export type WorkspaceFixType = "auto" | "manual" | "hybrid";

export interface WorkspaceNotificationSettings {
  competitorChanges: boolean;
  criticalAlerts: boolean;
  weeklyReport: boolean;
}

export interface WorkspaceProfile {
  accountId: string;
  createdAt: string;
  email: string;
  freeScanUsed: boolean;
  plan: PlanTier;
}

export interface WorkspaceStore {
  id: string;
  name: string | null;
  platform: WorkspacePlatform | null;
  productCount: number;
  status: "connected" | "not_connected";
  updatedAt: string | null;
  url: string | null;
}

export interface WorkspaceIssue {
  description: string;
  dimension: WorkspaceIssueDimension;
  fixType: WorkspaceFixType;
  fixed: boolean;
  id: string;
  pointsImpact: number;
  productId: string | null;
  productName: string | null;
  severity: WorkspaceIssueSeverity;
  title: string;
}

export interface WorkspaceProduct {
  category: string;
  generatedSchema: Record<string, unknown> | null;
  issueCount: number;
  issues: WorkspaceIssue[];
  llmScore: number;
  name: string;
  overallScore: number;
  price: number | null;
  productId: string;
  protocolScore: number;
  schemaScore: number;
  status: "fixed" | "partial" | "unfixed";
  url: string;
}

export interface WorkspaceFeed {
  description: string;
  fileUrl: string | null;
  format: string;
  id: string;
  lastGenerated: string | null;
  name: string;
  productCount: number;
  status: "connected" | "not_connected" | "coming_soon";
  type: "acp" | "gmc" | "bing";
}

export interface WorkspaceCompetitor {
  id: string;
  llmScore: number;
  name: string;
  overallScore: number;
  protocolScore: number;
  schemaScore: number;
  url: string;
}

export interface WorkspaceScanListItem {
  createdAt: string;
  id: string;
  pagesScanned: number;
  pagesTotal: number;
  scores: ScoreBreakdown;
  status: ScanStatus;
}

export interface WorkspaceSummary {
  autoFixableIssues: number;
  connectedStores: number;
  criticalIssues: number;
  llmScore: number;
  overallScore: number;
  productsScanned: number;
  protocolScore: number;
  recentScanCount: number;
  schemaScore: number;
}

export interface WorkspaceBillingState {
  canUpgrade: boolean;
  currentPlan: PlanTier;
  hasStripeCustomer: boolean;
  stripeCheckoutUrl: string | null;
}

export interface WorkspaceAdminOverview {
  accounts: number;
  activeFeeds: number;
  connectedStores: number;
  pendingFixes: number;
  scans: number;
  stores: number;
}

export interface WorkspaceData {
  admin: WorkspaceAdminOverview;
  billing: WorkspaceBillingState;
  competitors: WorkspaceCompetitor[];
  feeds: WorkspaceFeed[];
  issues: WorkspaceIssue[];
  notifications: WorkspaceNotificationSettings;
  products: WorkspaceProduct[];
  profile: WorkspaceProfile;
  recentScans: WorkspaceScanListItem[];
  store: WorkspaceStore;
  summary: WorkspaceSummary;
}
