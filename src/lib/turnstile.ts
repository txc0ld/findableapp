import { env } from "./env";

interface TurnstileVerificationResult {
  success: boolean;
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  if (!env.CLOUDFLARE_TURNSTILE_SECRET) {
    return env.NODE_ENV !== "production" && token === "dev-turnstile-bypass";
  }

  const formData = new URLSearchParams({
    secret: env.CLOUDFLARE_TURNSTILE_SECRET,
    response: token,
  });

  if (remoteIp) {
    formData.set("remoteip", remoteIp);
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    return false;
  }

  const data = (await response.json()) as TurnstileVerificationResult;
  return data.success;
}
