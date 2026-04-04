import { isDisposableEmailDomain } from "@findable/shared";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isDisposableEmail(email: string): boolean {
  const domain = normalizeEmail(email).split("@")[1];

  return domain ? isDisposableEmailDomain(domain) : false;
}
