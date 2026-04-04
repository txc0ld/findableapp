export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "dispostable.com",
  "fakeinbox.com",
  "getairmail.com",
  "guerrillamail.com",
  "maildrop.cc",
  "mailinator.com",
  "sharklasers.com",
  "tempmail.com",
  "throwawaymail.com",
  "yopmail.com",
]);

export function isDisposableEmailDomain(domain: string): boolean {
  return DISPOSABLE_EMAIL_DOMAINS.has(domain.toLowerCase());
}
