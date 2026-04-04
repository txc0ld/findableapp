import type {
  PlanTier,
  ScoreBreakdown,
  WorkspaceData,
  WorkspaceFeed,
  WorkspaceIssue,
  WorkspaceNotificationSettings,
  WorkspaceProduct,
  WorkspaceScanListItem,
} from "@findable/shared";
import { count, desc, eq, isNotNull } from "drizzle-orm";

import { db } from "../db/client";
import {
  getMemoryFixedIssueIds,
  getMemoryNotifications,
  getMemoryPlan,
  getMemoryStateCounts,
  getMemoryStore,
  markMemoryIssueFixed,
  updateMemoryNotifications,
  updateMemoryPlan,
  upsertMemoryAccount,
  upsertMemoryStore,
} from "./app-state";
import {
  getFreeScanRecord,
  type FreeScanRecord,
  listFreeScanRecords,
  listFreeScanRecordsByEmail,
} from "./free-scan-store";
import {
  accounts,
  competitors,
  feeds,
  issues,
  products,
  scans,
  stores,
} from "../db/schema";

type NotificationInput = Partial<WorkspaceNotificationSettings>;

function defaultScoreBreakdown(): ScoreBreakdown {
  return {
    competitive: null,
    llm: null,
    overall: null,
    protocol: null,
    schema: null,
  };
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function statusFromIssues(issuesForProduct: WorkspaceIssue[]): WorkspaceProduct["status"] {
  if (issuesForProduct.length === 0) {
    return "fixed";
  }

  const fixedCount = issuesForProduct.filter((issue) => issue.fixed).length;

  if (fixedCount === 0) {
    return "unfixed";
  }

  return "partial";
}

function severityRank(severity: WorkspaceIssue["severity"]) {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function mapDbScan(scan: typeof scans.$inferSelect): WorkspaceScanListItem {
  return {
    id: scan.id,
    createdAt: scan.createdAt?.toISOString() ?? new Date().toISOString(),
    pagesScanned: scan.pagesScanned,
    pagesTotal: scan.pagesTotal ?? 0,
    status: scan.status,
    scores: {
      overall: scan.scoreOverall,
      schema: scan.scoreSchema,
      llm: scan.scoreLlm,
      protocol: scan.scoreProtocol,
      competitive: scan.scoreCompetitive,
    },
  };
}

function mapFreeScan(scan: FreeScanRecord): WorkspaceScanListItem {
  return {
    id: scan.id,
    createdAt: new Date().toISOString(),
    pagesScanned: scan.pagesScanned,
    pagesTotal: scan.pagesTotal,
    status: scan.status,
    scores: {
      overall: scan.scoreOverall,
      schema: scan.scoreSchema,
      llm: scan.scoreLlm,
      protocol: scan.scoreProtocol,
      competitive: scan.scoreCompetitive,
    },
  };
}

function issueFromReport(entry: Record<string, unknown>, fixedIssueIds: Set<string>): WorkspaceIssue | null {
  if (typeof entry.id !== "string" || typeof entry.title !== "string") {
    return null;
  }

  return {
    id: entry.id,
    title: entry.title,
    description: typeof entry.description === "string" ? entry.description : "",
    severity:
      entry.severity === "critical" ||
      entry.severity === "high" ||
      entry.severity === "medium" ||
      entry.severity === "low"
        ? entry.severity
        : "medium",
    dimension:
      entry.dimension === "schema" ||
      entry.dimension === "llm" ||
      entry.dimension === "protocol" ||
      entry.dimension === "consistency"
        ? entry.dimension
        : "schema",
    fixType:
      entry.fixType === "auto" || entry.fixType === "manual" || entry.fixType === "hybrid"
        ? entry.fixType
        : "auto",
    pointsImpact: typeof entry.pointsImpact === "number" ? entry.pointsImpact : 0,
    fixed: fixedIssueIds.has(entry.id),
    productId: typeof entry.productId === "string" ? entry.productId : null,
    productName: typeof entry.productName === "string" ? entry.productName : null,
  };
}

function buildFallbackProductsAndIssues(
  reportJson: Record<string, unknown> | null | undefined,
  fixedIssueIds: Set<string>,
) {
  const productEntries = Array.isArray(reportJson?.products)
    ? (reportJson?.products as Record<string, unknown>[])
    : [];
  const reportIssues = Array.isArray(reportJson?.issues)
    ? (reportJson?.issues as Record<string, unknown>[])
    : [];
  const allIssues = reportIssues
    .map((issue) => issueFromReport(issue, fixedIssueIds))
    .filter((issue): issue is WorkspaceIssue => issue !== null);

  const products = productEntries.map((productEntry, index) => {
    const productId = typeof productEntry.productId === "string" ? productEntry.productId : `report-product-${index}`;
    const productIssues =
      Array.isArray(productEntry.issues) &&
      productEntry.issues.every((issue) => issue && typeof issue === "object" && "id" in issue)
        ? (productEntry.issues as Record<string, unknown>[])
            .map((issue) => issueFromReport(issue, fixedIssueIds))
            .filter((issue): issue is WorkspaceIssue => issue !== null)
        : allIssues.filter((issue) => issue.productName === productEntry.name);

    return {
      productId,
      name: typeof productEntry.name === "string" ? productEntry.name : `Product ${index + 1}`,
      url: typeof productEntry.url === "string" ? productEntry.url : "",
      category: typeof productEntry.category === "string" ? productEntry.category : "Product Page",
      overallScore: typeof productEntry.overallScore === "number" ? productEntry.overallScore : 0,
      schemaScore: typeof productEntry.schemaScore === "number" ? productEntry.schemaScore : 0,
      llmScore: typeof productEntry.llmScore === "number" ? productEntry.llmScore : 0,
      protocolScore: typeof productEntry.protocolScore === "number" ? productEntry.protocolScore : 0,
      price: asNumber(productEntry.price),
      issueCount: productIssues.length,
      issues: productIssues,
      status: statusFromIssues(productIssues),
      generatedSchema:
        productEntry.generatedSchema && typeof productEntry.generatedSchema === "object"
          ? (productEntry.generatedSchema as Record<string, unknown>)
          : null,
    } satisfies WorkspaceProduct;
  });

  const issuesForWorkspace =
    allIssues.length > 0
      ? allIssues
      : products.flatMap((product) =>
          product.issues.map((issue) => ({
            ...issue,
            productId: issue.productId ?? product.productId,
            productName: issue.productName ?? product.name,
          })),
        );

  return { issues: issuesForWorkspace, products };
}

function buildFeedSet(
  connectedStoreUrl: string | null,
  existingFeeds: WorkspaceFeed[],
): WorkspaceFeed[] {
  const byType = new Map(existingFeeds.map((feed) => [feed.type, feed]));

  return [
    byType.get("acp") ?? {
      id: "feed-acp",
      name: "OpenAI ACP Feed",
      description: "AI Commerce Protocol feed for ChatGPT and other shopping agents.",
      fileUrl: null,
      format: "JSONL",
      lastGenerated: null,
      productCount: 0,
      status: connectedStoreUrl ? "connected" : "not_connected",
      type: "acp",
    },
    byType.get("gmc") ?? {
      id: "feed-gmc",
      name: "Google Merchant Center",
      description: "Product feed for Google Shopping and AI-assisted commerce surfaces.",
      fileUrl: null,
      format: "XML",
      lastGenerated: null,
      productCount: 0,
      status: connectedStoreUrl ? "connected" : "not_connected",
      type: "gmc",
    },
    {
      id: "feed-bing",
      name: "Bing / Copilot Commerce",
      description: "Merchant feed support for Microsoft shopping surfaces.",
      fileUrl: null,
      format: "JSON",
      lastGenerated: null,
      productCount: 0,
      status: "coming_soon",
      type: "bing",
    },
  ];
}

async function ensureDbAccount(email: string) {
  const existing = await db!.query.accounts.findFirst({
    where: eq(accounts.email, email),
  });

  if (existing) {
    return existing;
  }

  const [created] = await db!
    .insert(accounts)
    .values({ email })
    .returning();

  if (!created) {
    throw new Error("Failed to create account.");
  }

  return created;
}

export async function updateWorkspacePlan(email: string, plan: PlanTier) {
  const normalizedEmail = email.trim().toLowerCase();
  updateMemoryPlan(normalizedEmail, plan);

  if (db) {
    const account = await ensureDbAccount(normalizedEmail);

    await db
      .update(accounts)
      .set({ plan })
      .where(eq(accounts.id, account.id));
  }

  return plan;
}

export async function updateWorkspaceNotifications(
  email: string,
  updates: NotificationInput,
) {
  const normalizedEmail = email.trim().toLowerCase();
  return updateMemoryNotifications(normalizedEmail, updates);
}

export async function updateWorkspaceStore(
  email: string,
  input: {
    name: string;
    platform: WorkspaceData["store"]["platform"];
    url: string;
  },
) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!db) {
    return upsertMemoryStore(normalizedEmail, {
      name: input.name || null,
      platform: input.platform,
      productCount: 0,
      url: input.url || null,
    });
  }

  const account = await ensureDbAccount(normalizedEmail);
  const existingStore = await db.query.stores.findFirst({
    where: eq(stores.accountId, account.id),
  });

  if (existingStore) {
    const [updated] = await db
      .update(stores)
      .set({
        name: input.name,
        platform: input.platform,
        url: input.url,
        updatedAt: new Date(),
      })
      .where(eq(stores.id, existingStore.id))
      .returning();

    return updated ?? existingStore;
  }

  const [created] = await db
    .insert(stores)
    .values({
      accountId: account.id,
      name: input.name,
      platform: input.platform,
      url: input.url,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to save store.");
  }

  return created;
}

export async function applyWorkspaceFix(email: string, issueId: string) {
  const normalizedEmail = email.trim().toLowerCase();
  markMemoryIssueFixed(normalizedEmail, issueId);

  if (db) {
    await db
      .update(issues)
      .set({ fixed: true })
      .where(eq(issues.code, issueId));
  }
}

export async function buildWorkspaceData(email: string): Promise<WorkspaceData> {
  const normalizedEmail = email.trim().toLowerCase();
  const fixedIssueIds = getMemoryFixedIssueIds(normalizedEmail);
  const notifications = getMemoryNotifications(normalizedEmail);

  if (!db) {
    const account = upsertMemoryAccount(normalizedEmail);
    const store = getMemoryStore(normalizedEmail);
    const scansForEmail = listFreeScanRecordsByEmail(normalizedEmail)
      .map((scan) => mapFreeScan(scan))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const latestScanRecord = scansForEmail[0] ? getFreeScanRecord(scansForEmail[0].id) : null;
    const derived = buildFallbackProductsAndIssues(latestScanRecord?.reportJson, fixedIssueIds);
    const sortedIssues = derived.issues
      .slice()
      .sort((left, right) => {
        return severityRank(right.severity) - severityRank(left.severity) || right.pointsImpact - left.pointsImpact;
      });
    const summary = {
      overallScore: latestScanRecord?.scoreOverall ?? 0,
      schemaScore: latestScanRecord?.scoreSchema ?? 0,
      llmScore: latestScanRecord?.scoreLlm ?? 0,
      protocolScore: latestScanRecord?.scoreProtocol ?? 0,
      criticalIssues: sortedIssues.filter((issue) => issue.severity === "critical").length,
      autoFixableIssues: sortedIssues.filter((issue) => issue.fixType === "auto" && !issue.fixed).length,
      recentScanCount: scansForEmail.length,
      connectedStores: store?.url ? 1 : 0,
      productsScanned: derived.products.length,
    };

    return {
      admin: {
        accounts: getMemoryStateCounts().accounts,
        activeFeeds: store?.url ? 2 : 0,
        connectedStores: getMemoryStateCounts().connectedStores,
        pendingFixes: sortedIssues.filter((issue) => !issue.fixed).length,
        scans: listFreeScanRecords().length,
        stores: getMemoryStateCounts().stores,
      },
      billing: {
        canUpgrade: account.plan !== "agency",
        currentPlan: account.plan,
        hasStripeCustomer: false,
        stripeCheckoutUrl: null,
      },
      competitors: [
        {
          id: "comp-1",
          name: "Category Leader",
          url: "https://competitor.example",
          overallScore: Math.max(summary.overallScore + 22, 58),
          schemaScore: Math.max(summary.schemaScore + 18, 61),
          llmScore: Math.max(summary.llmScore + 16, 54),
          protocolScore: Math.max(summary.protocolScore + 24, 50),
        },
      ],
      feeds: buildFeedSet(store?.url ?? null, []),
      issues: sortedIssues,
      notifications,
      products: derived.products,
      profile: {
        accountId: normalizedEmail,
        createdAt: account.createdAt,
        email: normalizedEmail,
        freeScanUsed: scansForEmail.length > 0,
        plan: account.plan,
      },
      recentScans: scansForEmail,
      store: {
        id: store?.email ?? "store-memory",
        name: store?.name ?? null,
        platform: store?.platform ?? null,
        productCount: store?.productCount ?? derived.products.length,
        status: store?.url ? "connected" : "not_connected",
        updatedAt: store?.updatedAt ?? null,
        url: store?.url ?? null,
      },
      summary,
    };
  }

  const account = await ensureDbAccount(normalizedEmail);
  const latestStore =
    (
      await db
        .select()
        .from(stores)
        .where(eq(stores.accountId, account.id))
        .orderBy(desc(stores.updatedAt))
        .limit(1)
    )[0] ?? null;
  const scanRows = await db.select().from(scans).where(eq(scans.accountId, account.id)).orderBy(desc(scans.createdAt));
  const latestScan = scanRows[0] ?? null;
  const productRows = latestScan
    ? await db.select().from(products).where(eq(products.scanId, latestScan.id))
    : [];
  const issueRows = latestScan
    ? await db.select().from(issues).where(eq(issues.scanId, latestScan.id))
    : [];
  const competitorRows = latestStore
    ? await db.select().from(competitors).where(eq(competitors.storeId, latestStore.id))
    : [];
  const feedRows = latestStore
    ? await db.select().from(feeds).where(eq(feeds.storeId, latestStore.id))
    : [];

  let workspaceIssues: WorkspaceIssue[] = [];
  let workspaceProducts: WorkspaceProduct[] = [];

  if (productRows.length > 0) {
    workspaceIssues = issueRows.map((issueRow) => {
      const product = productRows.find((productRow) => productRow.id === issueRow.productId);

      return {
        id: issueRow.code,
        title: issueRow.title,
        description: issueRow.description,
        severity: issueRow.severity ?? "medium",
        dimension: issueRow.dimension ?? "schema",
        fixType: issueRow.fixType ?? "auto",
        pointsImpact: issueRow.pointsImpact ?? 0,
        fixed: issueRow.fixed || fixedIssueIds.has(issueRow.code),
        productId: issueRow.productId ?? null,
        productName: product?.name ?? null,
      };
    });

    workspaceProducts = productRows.map((productRow) => {
      const productIssues = workspaceIssues.filter((issue) => issue.productId === productRow.id);

      return {
        productId: productRow.id,
        name: productRow.name ?? "Untitled Product",
        url: productRow.url,
        category: productRow.googleCategory ?? "Product Page",
        overallScore:
          Math.round(
            ((productRow.schemaScore ?? 0) * 0.4) +
              ((productRow.llmScore ?? 0) * 0.35) +
              ((productRow.aeoScore ?? productRow.llmScore ?? 0) * 0.25),
          ) || 0,
        schemaScore: productRow.schemaScore ?? 0,
        llmScore: productRow.llmScore ?? 0,
        protocolScore: productRow.aeoScore ?? 0,
        price: asNumber(productRow.price),
        issueCount: productIssues.length,
        issues: productIssues,
        status: statusFromIssues(productIssues),
        generatedSchema: productRow.generatedSchema ?? null,
      };
    });
  } else {
    const fallback = buildFallbackProductsAndIssues(
      (latestScan?.reportJson as Record<string, unknown> | null) ?? null,
      fixedIssueIds,
    );
    workspaceProducts = fallback.products;
    workspaceIssues = fallback.issues;
  }

  const sortedIssues = workspaceIssues
    .slice()
    .sort((left, right) => {
      return severityRank(right.severity) - severityRank(left.severity) || right.pointsImpact - left.pointsImpact;
    });

  const mappedFeeds = buildFeedSet(
    latestStore?.url ?? null,
    feedRows.map((feedRow) => ({
      id: feedRow.id,
      name: feedRow.feedType === "acp" ? "OpenAI ACP Feed" : "Google Merchant Center",
      description:
        feedRow.feedType === "acp"
          ? "AI Commerce Protocol feed for AI shopping agents."
          : "Google Merchant Center product feed.",
      fileUrl: feedRow.fileUrl,
      format: feedRow.feedType === "acp" ? "JSONL" : "XML",
      lastGenerated: feedRow.lastGenerated?.toISOString() ?? null,
      productCount: feedRow.productCount ?? 0,
      status: feedRow.fileUrl ? "connected" : "not_connected",
      type: (feedRow.feedType ?? "acp") as "acp" | "gmc",
    })),
  );

  return {
    admin: await (async () => {
      const [[accountCount], [feedCount], [connectedStoreCount], [pendingFixCount], [scanCount], [storeCount]] = await Promise.all([
        db.select({ value: count() }).from(accounts),
        db.select({ value: count() }).from(feeds),
        db.select({ value: count() }).from(stores).where(isNotNull(stores.url)),
        db.select({ value: count() }).from(issues).where(eq(issues.fixed, false)),
        db.select({ value: count() }).from(scans),
        db.select({ value: count() }).from(stores),
      ]);
      return {
        accounts: accountCount?.value ?? 0,
        activeFeeds: feedCount?.value ?? 0,
        connectedStores: connectedStoreCount?.value ?? 0,
        pendingFixes: pendingFixCount?.value ?? 0,
        scans: scanCount?.value ?? 0,
        stores: storeCount?.value ?? 0,
      };
    })(),
    billing: {
      canUpgrade: account.plan !== "agency",
      currentPlan: getMemoryPlan(account.email) ?? account.plan,
      hasStripeCustomer: Boolean(account.stripeCustomerId),
      stripeCheckoutUrl: null,
    },
    competitors: competitorRows.map((row) => ({
      id: row.id,
      name: row.name ?? "Competitor",
      url: row.url,
      overallScore: row.scoreOverall ?? 0,
      schemaScore: row.scoreSchema ?? 0,
      llmScore: row.scoreLlm ?? 0,
      protocolScore: row.scoreProtocol ?? 0,
    })),
    feeds: mappedFeeds,
    issues: sortedIssues,
    notifications,
    products: workspaceProducts,
    profile: {
      accountId: account.id,
      createdAt: account.createdAt.toISOString(),
      email: account.email,
      freeScanUsed: account.freeScanUsed,
      plan: getMemoryPlan(account.email) ?? account.plan,
    },
    recentScans: scanRows.map((scanRow) => mapDbScan(scanRow)),
    store: {
      id: latestStore?.id ?? "store-none",
      name: latestStore?.name ?? null,
      platform: latestStore?.platform ?? null,
      productCount: latestStore?.productCount ?? workspaceProducts.length,
      status: latestStore?.url && latestStore.active ? "connected" : "not_connected",
      updatedAt: latestStore?.updatedAt?.toISOString() ?? null,
      url: latestStore?.url ?? null,
    },
    summary: {
      overallScore: latestScan?.scoreOverall ?? 0,
      schemaScore: latestScan?.scoreSchema ?? 0,
      llmScore: latestScan?.scoreLlm ?? 0,
      protocolScore: latestScan?.scoreProtocol ?? 0,
      criticalIssues: sortedIssues.filter((issue) => issue.severity === "critical").length,
      autoFixableIssues: sortedIssues.filter((issue) => issue.fixType === "auto" && !issue.fixed).length,
      recentScanCount: scanRows.length,
      connectedStores: latestStore?.url && latestStore.active ? 1 : 0,
      productsScanned: workspaceProducts.length,
    },
  };
}
