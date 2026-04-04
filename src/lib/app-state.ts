import type { PlanTier, WorkspaceNotificationSettings } from "@findable/shared";

interface MemoryAccountState {
  createdAt: string;
  email: string;
  fixedIssueIds: Set<string>;
  notifications: WorkspaceNotificationSettings;
  plan: PlanTier;
}

interface MemoryStoreState {
  email: string;
  name: string | null;
  platform: "shopify" | "woocommerce" | "bigcommerce" | "custom" | null;
  productCount: number;
  updatedAt: string;
  url: string | null;
}

const defaultNotifications: WorkspaceNotificationSettings = {
  competitorChanges: false,
  criticalAlerts: true,
  weeklyReport: true,
};

const accounts = new Map<string, MemoryAccountState>();
const stores = new Map<string, MemoryStoreState>();

export function getMemoryAccount(email: string) {
  return accounts.get(email) ?? null;
}

export function upsertMemoryAccount(email: string, plan: PlanTier = "free") {
  const existing = accounts.get(email);

  if (existing) {
    return existing;
  }

  const created = {
    createdAt: new Date().toISOString(),
    email,
    fixedIssueIds: new Set<string>(),
    notifications: { ...defaultNotifications },
    plan,
  } satisfies MemoryAccountState;

  accounts.set(email, created);
  return created;
}

export function updateMemoryPlan(email: string, plan: PlanTier) {
  const account = upsertMemoryAccount(email);
  account.plan = plan;
  accounts.set(email, account);
  return account;
}

export function updateMemoryNotifications(
  email: string,
  updates: Partial<WorkspaceNotificationSettings>,
) {
  const account = upsertMemoryAccount(email);
  account.notifications = {
    ...account.notifications,
    ...updates,
  };
  accounts.set(email, account);
  return account.notifications;
}

export function markMemoryIssueFixed(email: string, issueId: string) {
  const account = upsertMemoryAccount(email);
  account.fixedIssueIds.add(issueId);
  accounts.set(email, account);
}

export function getMemoryFixedIssueIds(email: string) {
  return upsertMemoryAccount(email).fixedIssueIds;
}

export function getMemoryNotifications(email: string) {
  return upsertMemoryAccount(email).notifications;
}

export function getMemoryPlan(email: string) {
  return upsertMemoryAccount(email).plan;
}

export function getMemoryStore(email: string) {
  return stores.get(email) ?? null;
}

export function upsertMemoryStore(
  email: string,
  input: Omit<MemoryStoreState, "email" | "updatedAt">,
) {
  const nextStore: MemoryStoreState = {
    email,
    ...input,
    updatedAt: new Date().toISOString(),
  };

  stores.set(email, nextStore);
  return nextStore;
}

export function getMemoryStateCounts() {
  const connectedStores = Array.from(stores.values()).filter(
    (store) => store.url && store.platform,
  ).length;

  return {
    accounts: accounts.size,
    connectedStores,
    stores: stores.size,
  };
}
