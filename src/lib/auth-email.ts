import { env } from "./env";

export async function sendPasswordResetEmail(email: string, token: string) {
  if (!env.RESEND_API_KEY) {
    throw new Error("Password reset email delivery is not configured.");
  }

  const resetUrl = new URL("/reset-password", env.FRONTEND_URL);
  resetUrl.searchParams.set("token", token);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [email],
      subject: "Reset your Findable password",
      html: `
        <div style="font-family: Inter, system-ui, sans-serif; line-height: 1.6; color: #111827;">
          <p>Reset your Findable password using the link below.</p>
          <p><a href="${resetUrl.toString()}">${resetUrl.toString()}</a></p>
          <p>This link expires in 1 hour.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(payload || "Failed to send password reset email.");
  }
}
